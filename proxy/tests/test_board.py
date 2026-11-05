import json

import pytest
import serial

from assembler import ClipAssembler
from board import LineBuffer, find_port, parse_line
from fake_board import messages


def test_parse_line_accepts_json_objects_only():
    inner = {"type": "audio_end", "payload": {"clip": 1, "chunks": 1}}
    assert parse_line(json.dumps(inner).encode() + b"\r\n") == inner
    assert parse_line(b"E (123) wifi: not json\n") is None
    assert parse_line(b"[1]\n") is None
    assert parse_line(b"\n") is None
    assert parse_line(b"\xff\xfe\n") is None


def test_line_buffer_joins_lines_split_across_reads():
    buffer = LineBuffer()
    assert list(buffer.feed(b'{"a"')) == []
    assert list(buffer.feed(b':1}\n{"b":2}\n{"c"')) == [b'{"a":1}', b'{"b":2}']
    assert list(buffer.feed(b":3}\n")) == [b'{"c":3}']


def test_line_buffer_drops_endless_garbage():
    buffer = LineBuffer()
    assert list(buffer.feed(b"x" * 9000)) == []
    assert list(buffer.feed(b'{"a":1}\n')) == [b'{"a":1}']


def test_find_port_prefers_configured_and_refuses_to_guess(monkeypatch):
    assert find_port("/dev/valgt") == "/dev/valgt"
    monkeypatch.setattr("board.glob.glob", lambda p: ["/dev/cu.usbmodem1"] if "usbmodem" in p else [])
    assert find_port("") == "/dev/cu.usbmodem1"
    monkeypatch.setattr("board.glob.glob", lambda p: ["/dev/a", "/dev/b"] if "usbmodem" in p else [])
    with pytest.raises(serial.SerialException):
        find_port("")


def test_fake_board_clip_survives_line_parsing_and_assembly():
    assembler = ClipAssembler()
    buffer = LineBuffer()
    stream = "".join(line + "\n" for line in messages(1)).encode()
    finished = []
    for start in range(0, len(stream), 97):  # bytene kommer i vilkårlige biter over USB
        for raw in buffer.feed(stream[start:start + 97]):
            if (clip := assembler.handle(parse_line(raw))):
                finished.append(clip)
    assert len(finished) == 1
    assert finished[0].seconds == 2.0
    assert finished[0].missing_chunks == 0
