import asyncio

import httpx
import pytest

from assembler import FinishedClip
from spool import Spool


def clip(id="a"):
    return FinishedClip(id=id, device_clip=1, sample_rate=8000, samples=1, missing_chunks=0, wav=b"RIFF")


async def run_until_empty(spool, handler, monkeypatch):
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        "spool.httpx.AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw),
    )
    monkeypatch.setattr("spool.asyncio.sleep", lambda _: real_sleep(0))
    task = asyncio.create_task(spool.run())
    for _ in range(200):
        await real_sleep(0.005)
        if not spool.pending():
            break
    task.cancel()


real_sleep = asyncio.sleep


async def test_retries_until_delivered_then_removes_files(tmp_path, monkeypatch):
    spool = Spool(tmp_path, "http://web/api/clips", "secret", "device")
    spool.add(clip())
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(503 if len(calls) == 1 else 201)

    await run_until_empty(spool, handler, monkeypatch)
    assert len(calls) == 2
    assert calls[1].headers["authorization"] == "Bearer secret"
    assert list(tmp_path.iterdir()) == []


async def test_rejected_clip_does_not_block_queue(tmp_path, monkeypatch):
    spool = Spool(tmp_path, "http://web/api/clips", "secret", "device")
    spool.add(clip("bad"))
    spool.add(clip("good"))
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(400 if len(seen) == 1 else 201)

    await run_until_empty(spool, handler, monkeypatch)
    assert len(seen) == 2
    assert [p.suffix for p in tmp_path.glob("*.rejected")] == [".rejected"]
    assert list(tmp_path.glob("*.wav")) == []
    assert spool.pending() == []
