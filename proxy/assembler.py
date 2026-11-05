"""Setter sammen audio_*-meldinger fra kortet til ferdige WAV-klipp."""

import base64
import io
import time
import uuid
import wave
from dataclasses import dataclass, field

BYTES_PER_SAMPLE = 2
# Et klipp på 15 s bruker noen sekunder over USB, så grensen er romslig.
STALE_AFTER_SECONDS = 180


@dataclass
class FinishedClip:
    id: str
    device_clip: int
    sample_rate: int
    samples: int
    missing_chunks: int
    wav: bytes

    @property
    def seconds(self) -> float:
        return self.samples / self.sample_rate


@dataclass
class _OpenClip:
    sample_rate: int
    samples: int | None
    # Kortets clip-nummer starter på nytt ved omstart, så vi lager en egen ID per klipp.
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    parts: dict[int, bytes] = field(default_factory=dict)
    touched: float = field(default_factory=time.monotonic)


def to_wav(pcm: bytes, rate: int) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(BYTES_PER_SAMPLE)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buffer.getvalue()


def _join(parts: dict[int, bytes], chunks: int, samples: int | None) -> tuple[bytes, int]:
    """Fyller manglende biter med stillhet, slik at resten av lyden ikke forskyves."""
    size = max((len(p) for p in parts.values()), default=0)
    missing = sum(1 for i in range(chunks) if i not in parts)
    pcm = b"".join(parts.get(i, b"\0" * size) for i in range(chunks))
    if samples is not None:
        pcm = pcm[: samples * BYTES_PER_SAMPLE]
    return pcm, missing


class ClipAssembler:
    def __init__(self) -> None:
        self.open: dict[int, _OpenClip] = {}

    def handle(self, msg: dict) -> FinishedClip | None:
        kind, payload = msg.get("type"), msg.get("payload") or {}
        clip = payload.get("clip")

        if kind == "boot":
            # Kortet startet på nytt, så halvferdige klipp blir aldri fullført.
            self.open.clear()
        elif kind == "audio_start":
            self.open[clip] = _OpenClip(payload["sample_rate"], payload.get("samples"))
        elif kind == "audio_cancel":
            self.open.pop(clip, None)
        elif kind == "audio_chunk" and clip in self.open:
            current = self.open[clip]
            current.parts[payload["seq"]] = base64.b64decode(payload["data"])
            current.touched = time.monotonic()
        elif kind == "audio_end" and clip in self.open:
            current = self.open.pop(clip)
            pcm, missing = _join(current.parts, payload["chunks"], current.samples)
            if not pcm:
                return None
            return FinishedClip(
                id=current.id,
                device_clip=clip,
                sample_rate=current.sample_rate,
                samples=len(pcm) // BYTES_PER_SAMPLE,
                missing_chunks=missing,
                wav=to_wav(pcm, current.sample_rate),
            )
        return None

    def drop_stale(self) -> None:
        cutoff = time.monotonic() - STALE_AFTER_SECONDS
        for clip in [c for c, o in self.open.items() if o.touched < cutoff]:
            del self.open[clip]
