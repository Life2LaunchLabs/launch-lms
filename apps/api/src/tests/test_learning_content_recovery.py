"""Stored content that predates the typed models never locks admins out."""

from copy import deepcopy

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.learning import LearningActivity, LearningActivityUpdate, LearningPage, LearningPageUpdate
from src.services.learning import update_activity, update_page
from src.services.learning_content import activity_recovery
from src.services.learning_documents import store
from src.services.learning_documents.models import ActivityDocumentSave
from src.tests.test_badge_marketplace import _request
from src.tests.test_learning_documents import P2, _world


def _legacy(session):
    """Simulate content saved before the models tightened."""
    page = session.exec(select(LearningPage).where(LearningPage.page_uuid == P2)).one()
    content = deepcopy(page.content)
    content["blocks"][0]["colour"] = "red"
    content["blocks"].append({"id": "blk_old_video", "type": "video"})
    page.content = content
    activity = session.get(LearningActivity, 50)
    settings = deepcopy(activity.settings)
    settings["flow"]["nodes"][0]["x"] = 120
    activity.settings = settings
    session.add_all([page, activity])
    session.commit()
    return page


def _text(page):
    content = deepcopy(page.content)
    content["blocks"][0]["content"]["nodes"][0]["content"][0]["text"] = "Makers make things."
    return content


async def test_saves_carry_existing_issues_but_reject_new_ones():
    session, alice, _ = _world()
    page = _legacy(session)
    saved = await update_page(_request(), P2, LearningPageUpdate(content=_text(page)), alice, session)
    assert saved.content["blocks"][0]["content"]["nodes"][0]["content"][0]["text"] == "Makers make things."

    worse = _text(page)
    worse["blocks"][0]["design"] = {"align": "justify"}
    with pytest.raises(HTTPException, match="align"):
        await update_page(_request(), P2, LearningPageUpdate(content=worse), alice, session)

    activity = session.get(LearningActivity, 50)
    settings = deepcopy(activity.settings)
    settings["grading"] = {"minimum_score_percent": 80}
    updated = await update_activity(_request(), "learning_activity_draft", LearningActivityUpdate(settings=settings), alice, session)
    assert updated.settings["grading"]["minimum_score_percent"] == 80


async def test_document_saves_report_existing_issues_as_warnings():
    session, alice, _ = _world()
    _legacy(session)
    current = await store.get_activity_document(_request(), "learning_activity_draft", alice, session)
    document = deepcopy(current["document"])
    document["activity"]["title"] = "Career interests (revised)"
    saved = await store.save_activity_document(
        _request(), "learning_activity_draft", ActivityDocumentSave(document=document, base_etag=current["etag"]), alice, session
    )
    assert saved["document"]["activity"]["title"] == "Career interests (revised)"
    assert any("Existing issue" in warning["message"] for warning in saved.get("warnings") or []), saved.get("warnings")


async def test_repair_previews_then_fixes_what_is_safe_and_lists_the_rest():
    session, alice, _ = _world()
    _legacy(session)
    issues = await activity_recovery.get_activity_issues(_request(), "learning_activity_draft", alice, session)
    assert len(issues["pages"][P2]) == 2 and issues["flow"]

    preview = await activity_recovery.repair_activity(_request(), "learning_activity_draft", False, alice, session)
    assert preview["changes"]["pages"][P2] and preview["changes"]["flow"]
    assert "colour" in session.exec(select(LearningPage).where(LearningPage.page_uuid == P2)).one().content["blocks"][0]

    applied = await activity_recovery.repair_activity(_request(), "learning_activity_draft", True, alice, session)
    page = session.exec(select(LearningPage).where(LearningPage.page_uuid == P2)).one()
    assert "colour" not in page.content["blocks"][0] and "x" not in session.get(LearningActivity, 50).settings["flow"]["nodes"][0]
    assert [issue for issue in applied["remaining"]["pages"][P2] if "video" in issue], "unknown block types are left for the admin"
    assert applied["remaining"]["flow"] == []


async def test_repair_only_applies_to_drafts():
    session, alice, _ = _world("published")
    _legacy(session)
    assert (await activity_recovery.repair_activity(_request(), "learning_activity_draft", False, alice, session))["changes"]["pages"]
    with pytest.raises(HTTPException):
        await activity_recovery.repair_activity(_request(), "learning_activity_draft", True, alice, session)
