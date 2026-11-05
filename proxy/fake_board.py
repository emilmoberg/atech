"""Later som Atech-kortet på en virtuell seriellport, så hele kjeden kan testes uten kort.

    uv run python fake_board.py          # skriver ut hvilken SERIAL_PORT proxyen skal bruke

Trykk Enter for å sende et 2 sekunders klipp med en tone, i samme format som main.cpp.
"""

import base64
import json
import math
import os
import struct
import time
import tty

RATE = 8000
CHUNK_SAMPLES = 192


def messages(clip: int, seconds: float = 2.0) -> list[str]:
    samples = int(RATE * seconds)
    pcm = b"".join(
        struct.pack("<h", int(12000 * math.sin(2 * math.pi * 440 * i / RATE))) for i in range(samples)
    )
    out = [{"type": "audio_start", "payload": {
        "clip": clip, "sample_rate": RATE, "bits": 16, "channels": 1,
        "encoding": "pcm_s16le_base64", "samples": samples, "seconds": seconds,
    }}]
    size = CHUNK_SAMPLES * 2
    chunks = [pcm[i:i + size] for i in range(0, len(pcm), size)]
    out += [
        {"type": "audio_chunk", "payload": {"clip": clip, "seq": i, "data": base64.b64encode(c).decode()}}
        for i, c in enumerate(chunks)
    ]
    out.append({"type": "audio_end", "payload": {"clip": clip, "chunks": len(chunks)}})
    return [json.dumps(m) for m in out]


def main() -> None:
    master, slave = os.openpty()
    tty.setraw(slave)
    print(f"SERIAL_PORT={os.ttyname(slave)} – trykk Enter for å sende et klipp", flush=True)
    clip = 0
    while True:
        input()
        clip += 1
        for line in messages(clip):
            os.write(master, line.encode() + b"\n")
            time.sleep(0.005)
        print(f"sendte klipp {clip}", flush=True)


if __name__ == "__main__":
    main()
