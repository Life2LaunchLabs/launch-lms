import pytest
from fastapi import HTTPException

from src.services.learning.captions import _content_path, chunk_words


def _words(text: str, step: float = 0.3, gap_after: int | None = None) -> list[dict]:
    out, at = [], 0.0
    for index, word in enumerate(text.split()):
        out.append({"word": word, "start": at, "end": at + step - 0.05})
        at += step + (1.0 if gap_after is not None and index == gap_after else 0)
    return out


def test_chunks_break_at_sentence_ends_and_after_a_few_words():
    chunks = chunk_words(_words("Hi there. This is a longer sentence that keeps going on and on"))
    assert [chunk["words"] for chunk in chunks] == ["Hi there.", "This is a longer sentence that", "keeps going on and on"]
    assert chunks[0]["start"] == 0 and chunks[1]["start"] == 0.6 and all(chunk["end"] > chunk["start"] for chunk in chunks)


def test_chunks_break_at_pauses_and_skip_blank_words():
    chunks = chunk_words([*_words("one two", gap_after=0), {"word": " ", "start": 5, "end": 5}])
    assert [chunk["words"] for chunk in chunks] == ["one", "two"]


def test_only_this_orgs_uploads_can_be_captioned():
    assert _content_path("/content/orgs/org_a/media/media_1.mp4?v=2", "org_a") == "content/orgs/org_a/media/media_1.mp4"
    for url in ("https://youtu.be/x", "/content/orgs/org_b/media/a.mp4", "/content/orgs/org_a/../org_b/a.mp4"):
        with pytest.raises(HTTPException):
            _content_path(url, "org_a")


def test_generate_captions_for_an_uploaded_video_keeps_the_look(monkeypatch):
    import asyncio

    from sqlmodel import select

    from src.db.coach import CoachProviderKey
    from src.db.learning import LearningActivity, LearningPage, LearningPageType
    from src.db.organizations import Organization
    from src.services.coach.keys import encrypt_api_key
    from src.services.learning import captions
    from src.tests.test_goals import ADMIN, LEARNER, _session, _user
    from src.tests.test_learning_grading_rules import _world

    seen = {}

    async def transcribe(api_key, audio, filename):
        seen.update(key=api_key, size=len(audio), name=filename)
        return {"language": "english", "words": _words("Welcome to the course.")}

    monkeypatch.setattr(captions, "_transcribe", transcribe)
    monkeypatch.setattr(captions, "read_file_content", lambda path: b"video" if path.endswith("clip.mp4") else None)
    with _session() as db:
        _world(db, {}, [[]])
        org = db.get(Organization, 1)
        page = db.exec(select(LearningPage).where(LearningPage.page_uuid == "learning_page_0")).one()
        activity = db.get(LearningActivity, page.activity_id)
        activity.frozen_from_id = None  # the draft the editor works on
        db.add(activity)
        page.page_type = LearningPageType.VIDEO
        page.content = {"video_url": f"/content/orgs/{org.org_uuid}/media/clip.mp4", "captions": {"look": {"style": "boxed"}, "chunks": []}}
        db.add(page)
        db.commit()
        with pytest.raises(HTTPException) as no_key:
            asyncio.run(captions.generate_captions("learning_page_0", _user(ADMIN), db))
        assert no_key.value.status_code == 409
        db.add(CoachProviderKey(key_uuid="coach_key_1", provider="openai", label="Main", ciphertext=encrypt_api_key("sk-" + "x" * 30), last_four="xxxx"))
        db.commit()
        with pytest.raises(HTTPException) as learner:
            asyncio.run(captions.generate_captions("learning_page_0", _user(LEARNER), db))
        assert learner.value.status_code == 403
        made = asyncio.run(captions.generate_captions("learning_page_0", _user(ADMIN), db))
        assert seen == {"key": "sk-" + "x" * 30, "size": 5, "name": "clip.mp4"}
        assert made["look"] == {"style": "boxed"} and made["source"] == "generated" and made["language"] == "english"
        assert [chunk["words"] for chunk in made["chunks"]] == ["Welcome to the course."]
