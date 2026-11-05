"""Diskkø mellom kortet og webappen, så klipp overlever nedetid og omstart."""

import asyncio
import json
import logging
from pathlib import Path

import httpx

from assembler import FinishedClip

log = logging.getLogger("proxy.spool")
MAX_BACKOFF_SECONDS = 60
# Disse svarene blir ikke bedre av nye forsøk, og klippet skal ikke blokkere køen.
REJECTED_STATUSES = {400, 413, 422}


class Spool:
    def __init__(self, directory: Path, ingest_url: str, ingest_token: str, device_id: str) -> None:
        self.directory = directory
        self.ingest_url = ingest_url
        self.ingest_token = ingest_token
        self.device_id = device_id
        self.wakeup = asyncio.Event()
        directory.mkdir(parents=True, exist_ok=True)

    def add(self, clip: FinishedClip) -> None:
        meta = {
            "id": clip.id,
            "deviceId": self.device_id,
            "deviceClip": clip.device_clip,
            "sampleRate": clip.sample_rate,
            "samples": clip.samples,
            "missingChunks": clip.missing_chunks,
        }
        (self.directory / f"{clip.id}.wav").write_bytes(clip.wav)
        # JSON-fila skrives sist og markerer at klippet er komplett på disk.
        temp = self.directory / f"{clip.id}.tmp"
        temp.write_text(json.dumps(meta))
        temp.rename(self.directory / f"{clip.id}.json")
        self.wakeup.set()

    def pending(self) -> list[Path]:
        return sorted(self.directory.glob("*.json"), key=lambda p: p.stat().st_mtime)

    async def _upload(self, http: httpx.AsyncClient, meta_path: Path) -> None:
        wav_path = meta_path.with_suffix(".wav")
        response = await http.post(
            self.ingest_url,
            headers={"Authorization": f"Bearer {self.ingest_token}"},
            data=json.loads(meta_path.read_text()),
            files={"file": (wav_path.name, wav_path.read_bytes(), "audio/wav")},
        )
        if response.status_code in REJECTED_STATUSES:
            log.error("webappen avviste %s (%s): %s", meta_path.stem, response.status_code, response.text[:200])
            # Metadataene beholdes for feilsøking, men lyden skal ikke bli liggende.
            meta_path.rename(meta_path.with_suffix(".rejected"))
            wav_path.unlink()
            return
        response.raise_for_status()
        meta_path.unlink()
        wav_path.unlink()
        log.info("levert %s", meta_path.stem)

    async def run(self) -> None:
        backoff = 1
        async with httpx.AsyncClient(timeout=120) as http:
            while True:
                try:
                    for meta_path in self.pending():
                        await self._upload(http, meta_path)
                    backoff = 1
                    self.wakeup.clear()
                    if not self.pending():
                        await self.wakeup.wait()
                except (httpx.HTTPError, OSError) as error:
                    log.warning("levering feilet, prøver igjen om %ss: %r", backoff, error)
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, MAX_BACKOFF_SECONDS)
