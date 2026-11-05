import base64
import io
import wave

from assembler import ClipAssembler


def start(clip=1, samples=4):
    return {"type": "audio_start", "payload": {"clip": clip, "sample_rate": 8000, "samples": samples}}


def chunk(seq, pcm, clip=1):
    return {"type": "audio_chunk", "payload": {"clip": clip, "seq": seq, "data": base64.b64encode(pcm).decode()}}


def end(chunks, clip=1):
    return {"type": "audio_end", "payload": {"clip": clip, "chunks": chunks}}


def frames(wav):
    with wave.open(io.BytesIO(wav)) as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate()) == (1, 2, 8000)
        return w.readframes(w.getnframes())


def test_assembles_chunks_in_seq_order():
    a = ClipAssembler()
    a.handle(start())
    a.handle(chunk(1, b"\x03\x00\x04\x00"))
    a.handle(chunk(0, b"\x01\x00\x02\x00"))
    clip = a.handle(end(2))
    assert frames(clip.wav) == b"\x01\x00\x02\x00\x03\x00\x04\x00"
    assert clip.missing_chunks == 0
    assert clip.seconds == 4 / 8000
    assert a.open == {}


def test_missing_middle_chunk_becomes_silence():
    a = ClipAssembler()
    a.handle(start(samples=6))
    a.handle(chunk(0, b"\x01\x00\x01\x00"))
    a.handle(chunk(2, b"\x02\x00\x02\x00"))
    clip = a.handle(end(3))
    assert frames(clip.wav) == b"\x01\x00\x01\x00\0\0\0\0\x02\x00\x02\x00"
    assert clip.missing_chunks == 1


def test_short_last_chunk_missing_is_trimmed_to_samples():
    a = ClipAssembler()
    a.handle(start(samples=3))
    a.handle(chunk(0, b"\x01\x00\x01\x00"))
    clip = a.handle(end(2))
    assert frames(clip.wav) == b"\x01\x00\x01\x00\0\0"
    assert clip.samples == 3


def test_cancel_discards_clip():
    a = ClipAssembler()
    a.handle(start())
    a.handle(chunk(0, b"\x01\x00"))
    a.handle({"type": "audio_cancel", "payload": {"clip": 1, "during": "sending"}})
    assert a.handle(end(1)) is None


def test_reused_clip_number_after_reboot_gets_new_id_and_no_stale_audio():
    a = ClipAssembler()
    a.handle(start(clip=1, samples=1))
    a.handle(chunk(0, b"\x09\x00"))
    first = a.handle(end(1))

    a.handle(start(clip=1, samples=1))
    a.handle(chunk(0, b"\x07\x00"))
    a.handle({"type": "boot", "payload": {}})
    assert a.handle(end(1)) is None

    a.handle(start(clip=1, samples=1))
    a.handle(chunk(0, b"\x05\x00"))
    second = a.handle(end(1))
    assert second.id != first.id
    assert frames(second.wav) == b"\x05\x00"


def test_empty_clip_is_dropped():
    # Kortet sender én tom bit hvis man stopper før det er tatt opp noen samples.
    a = ClipAssembler()
    a.handle(start(samples=0))
    a.handle(chunk(0, b""))
    assert a.handle(end(1)) is None


def test_chunk_without_start_is_ignored():
    a = ClipAssembler()
    assert a.handle(chunk(0, b"\x01\x00")) is None
    assert a.handle(end(1)) is None
