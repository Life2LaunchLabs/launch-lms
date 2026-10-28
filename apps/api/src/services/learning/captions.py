"""Captions for videos uploaded to an activity, made with OpenAI's transcription on the platform's key.

The platform keeps its OpenAI keys for Coach (Platform › Coach › Model); captions use the first one.
Word timings come back from the transcription and are grouped into short chunks the editor shows as
caption cards. Files over the upload limit have their audio pulled out with ffmpeg first. Videos on
YouTube or Vimeo keep their own captions.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import tempfile
from uuid import uuid4

import httpx
from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.coach import CoachProviderKey
from src.db.learning import LearningPageType
from src.services.learning import access_rules, lookups, page_authoring
from src.services.utils.storage import read_file_content

logger = logging.getLogger(__name__)

TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions"
UPLOAD_LIMIT = 25 * 1024 * 1024
MAX_WORDS = 6
MAX_SECONDS = 3.0
PAUSE = 0.6


def chunk_words(words: list[dict]) -> list[dict]:
    """Group timed words into caption chunks: a few words each, broken at sentence ends and pauses."""
    chunks: list[dict] = []
    current: list[dict] = []

    def flush() -> None:
        if current:
            chunks.append({
                "id": f"cap_{uuid4().hex[:10]}", "start": round(float(current[0]["start"]), 2),
                "end": round(float(current[-1]["end"]), 2), "words": " ".join(str(word["word"]).strip() for word in current),
            })
            current.clear()

    for word in words:
        text = str(word.get("word") or "").strip()
        if not text:
            continue
        item = {"word": text, "start": float(word.get("start") or 0), "end": float(word.get("end") or word.get("start") or 0)}
        if current and (item["start"] - current[-1]["end"] > PAUSE or item["end"] - current[0]["start"] > MAX_SECONDS):
            flush()
        current.append(item)
        if len(current) >= MAX_WORDS or text[-1] in ".?!":
            flush()
    flush()
    return chunks


def _content_path(video_url: str, org_uuid: str) -> str:
    """The stored file behind an uploaded video's URL; only this organization's own uploads."""
    prefix = f"/content/orgs/{org_uuid}/"
    path = (video_url or "").split("?")[0]
    if not path.startswith(prefix) or ".." in path:
        raise HTTPException(status_code=422, detail="Captions can be made for videos uploaded here. YouTube and Vimeo videos keep their own captions.")
    return path.lstrip("/")


def _openai_key(db: Session) -> str:
    from src.services.coach.keys import decrypt_api_key

    key = db.exec(select(CoachProviderKey).where(CoachProviderKey.provider == "openai").order_by(CoachProviderKey.created_at)).first()  # type: ignore[arg-type]
    if not key:
        raise HTTPException(status_code=409, detail="Captions need an OpenAI key. A platform admin adds one on Platform › Coach › Model.")
    return decrypt_api_key(key.ciphertext)


async def _audio_only(video: bytes) -> bytes:
    """Mono speech-quality audio from a video, small enough to transcribe."""
    if not shutil.which("ffmpeg"):
        raise HTTPException(status_code=422, detail="This video is too long to caption here. Try a shorter clip.")
    with tempfile.TemporaryDirectory() as folder:
        source, target = os.path.join(folder, "video"), os.path.join(folder, "audio.mp3")
        with open(source, "wb") as handle:
            handle.write(video)
        process = await asyncio.create_subprocess_exec(
            "ffmpeg", "-nostdin", "-loglevel", "error", "-i", source, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", target,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
        )
        _, error = await process.communicate()
        if process.returncode != 0 or not os.path.exists(target):
            logger.warning("caption_audio_failed %s", (error or b"")[:300])
            raise HTTPException(status_code=422, detail="Couldn't read the sound in this video.")
        with open(target, "rb") as handle:
            audio = handle.read()
    if len(audio) > UPLOAD_LIMIT:
        raise HTTPException(status_code=422, detail="This video is too long to caption here. Try a shorter clip.")
    return audio


async def _transcribe(api_key: str, audio: bytes, filename: str) -> dict:
    files = {"file": (filename, audio)}
    data = [("model", "whisper-1"), ("response_format", "verbose_json"), ("timestamp_granularities[]", "word")]
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(TRANSCRIBE_URL, headers={"Authorization": f"Bearer {api_key}"}, data=data, files=files)  # type: ignore[arg-type]
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="The captioning service didn't answer. Try again in a minute.") from error
    if response.status_code >= 400:
        logger.warning("caption_transcribe_failed status=%s", response.status_code)
        raise HTTPException(status_code=502, detail="The captioning service couldn't caption this video.")
    return response.json()


async def generate_captions(page_uuid: str, current_user, db: Session) -> dict:
    """Make captions for a video page's uploaded video, keeping its caption look and positions."""
    page = lookups._get_page(db, page_uuid)
    page_authoring._page_activity(db, current_user, page)
    if page.page_type != LearningPageType.VIDEO:
        raise HTTPException(status_code=422, detail="Only video pages have captions.")
    content = page.content or {}
    path = _content_path(str(content.get("video_url") or ""), access_rules._get_org(db, page.org_id).org_uuid)
    api_key = _openai_key(db)
    video = await asyncio.to_thread(read_file_content, path)
    if not video:
        raise HTTPException(status_code=404, detail="The video file wasn't found. Upload it again.")
    audio, filename = (video, os.path.basename(path)) if len(video) <= UPLOAD_LIMIT else (await _audio_only(video), "audio.mp3")
    result = await _transcribe(api_key, audio, filename)
    previous = content.get("captions") if isinstance(content.get("captions"), dict) else {}
    return {
        **{key: previous[key] for key in ("look", "phone", "desktop") if previous.get(key)},
        "chunks": chunk_words(result.get("words") or []),
        "language": str(result.get("language") or "")[:20] or None,
        "source": "generated",
    }
