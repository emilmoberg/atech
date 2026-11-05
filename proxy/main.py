import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from pydantic_settings import BaseSettings, SettingsConfigDict

from assembler import ClipAssembler
from board import listen
from spool import Spool

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Tom betyr at kortet finnes automatisk.
    serial_port: str = ""
    device_id: str
    ingest_url: str
    ingest_token: str
    spool_dir: Path = Path("spool")


settings = Settings()
assembler = ClipAssembler()
status = {"connected": False}


@asynccontextmanager
async def lifespan(_: FastAPI):
    spool = Spool(settings.spool_dir, settings.ingest_url, settings.ingest_token, settings.device_id)
    app.state.spool = spool
    tasks = [
        asyncio.create_task(listen(settings.serial_port, assembler, spool, status)),
        asyncio.create_task(spool.run()),
    ]
    yield
    for task in tasks:
        task.cancel()


app = FastAPI(title="Atech-proxy", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return {
        "board_connected": status["connected"],
        "open_clips": len(assembler.open),
        "pending_uploads": len(app.state.spool.pending()),
    }
