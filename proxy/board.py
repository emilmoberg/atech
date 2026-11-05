"""Leser det Atech-kortet skriver over USB. main.cpp skriver én JSON-melding per linje på Serial."""

import asyncio
import glob
import json
import logging
from collections.abc import Iterator

import serial

from assembler import ClipAssembler
from spool import Spool

log = logging.getLogger("proxy.board")
BAUD_RATE = 115200
RECONNECT_SECONDS = 3
MAX_LINE_BYTES = 8192
PORT_PATTERNS = ("/dev/cu.usbmodem*", "/dev/ttyACM*")


def parse_line(raw: bytes) -> dict | None:
    """Kortet kan også skrive vanlig tekst, så alt som ikke er et JSON-objekt hoppes over."""
    text = raw.decode(errors="replace").strip()
    if not text:
        return None
    try:
        msg = json.loads(text)
    except json.JSONDecodeError:
        log.info("kortet: %.200s", text)
        return None
    return msg if isinstance(msg, dict) else None


class LineBuffer:
    """Samler bytes til hele linjer, siden en lesing kan stoppe midt i en linje."""

    def __init__(self) -> None:
        self.pending = b""

    def feed(self, data: bytes) -> Iterator[bytes]:
        *lines, self.pending = (self.pending + data).split(b"\n")
        if len(self.pending) > MAX_LINE_BYTES:
            log.warning("forkaster %d bytes uten linjeskift", len(self.pending))
            self.pending = b""
        yield from lines


def find_port(configured: str) -> str:
    """Bruker SERIAL_PORT hvis den er satt, ellers kortet hvis det bare er ett å velge mellom."""
    if configured:
        return configured
    ports = sorted(port for pattern in PORT_PATTERNS for port in glob.glob(pattern))
    if len(ports) != 1:
        found = ", ".join(ports) or "ingen"
        raise serial.SerialException(f"fant ikke ett kort (fant: {found}). Sett SERIAL_PORT")
    return ports[0]


def open_port(port: str) -> serial.Serial:
    conn = serial.Serial()
    conn.port = port
    conn.baudrate = BAUD_RATE
    conn.timeout = 0.5
    # Lave linjer ved åpning, så kortet ikke starter på nytt når proxyen kobler til.
    conn.dtr = False
    conn.rts = False
    conn.open()
    return conn


def _read(conn: serial.Serial) -> bytes:
    return conn.read(conn.in_waiting or 1)


def handle_line(raw: bytes, assembler: ClipAssembler, spool: Spool) -> None:
    msg = parse_line(raw)
    if msg is None:
        return
    kind = msg.get("type")
    if kind in ("boot", "recorder", "audio_start", "audio_cancel"):
        log.info("kortet: %.300s", json.dumps(msg, ensure_ascii=False))
    try:
        finished = assembler.handle(msg)
    except (KeyError, TypeError, ValueError) as error:
        log.warning("ugyldig %s: %r", kind, error)
        return
    if finished:
        log.info(
            "klipp %s ferdig: %.1f s, %d biter mangler",
            finished.id, finished.seconds, finished.missing_chunks,
        )
        spool.add(finished)


async def listen(configured_port: str, assembler: ClipAssembler, spool: Spool, status: dict) -> None:
    last_error = None
    while True:
        conn = None
        try:
            port = find_port(configured_port)
            conn = await asyncio.to_thread(open_port, port)
            log.info("koblet til kortet på %s", port)
            status["connected"] = True
            last_error = None
            buffer = LineBuffer()
            while True:
                data = await asyncio.to_thread(_read, conn)
                for raw in buffer.feed(data):
                    handle_line(raw, assembler, spool)
                assembler.drop_stale()
        except (serial.SerialException, OSError) as error:
            # Vanligst: kortet er trukket ut, eller en Atech-fane i Chrome holder porten.
            if str(error) != last_error:
                log.warning("får ikke lest fra kortet, prøver igjen hvert %d. s: %s", RECONNECT_SECONDS, error)
                last_error = str(error)
        finally:
            if conn:
                conn.close()
        status["connected"] = False
        await asyncio.sleep(RECONNECT_SECONDS)
