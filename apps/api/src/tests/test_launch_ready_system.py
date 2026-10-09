"""The system Launch Ready badge is synced from data, not code."""

import json
from pathlib import Path

from sqlmodel import Session, create_engine, select

from src.db.learning import BadgeCollection, LearningActivity, LearningBadge, LearningBadgeVersion, LearningPage, LearningPath
from src.services import learning
from src.services.learning_documents.document import prepare_document
from src.services.learning_system.onboarding import launch_ready_data, sync_launch_ready_badge
from src.tests.test_badge_marketplace import _create_org, _create_tables

SNAPSHOT = Path(__file__).with_name("fixtures") / "launch_ready_snapshot.json"
DROP = (
    "id", "creation_date", "update_date", "published_at", "org_id", "badge_id", "collection_id", "path_id",
    "version_id", "activity_id", "active_version_id", "based_on_version_id", "created_by_user_id", "published_by_user_id",
)


def _strip(row: dict, *extra: str) -> dict:
    return {key: value for key, value in row.items() if key not in DROP + extra}


def _snapshot(session: Session) -> dict:
    badge = session.exec(select(LearningBadge).where(LearningBadge.badge_uuid == learning.ONBOARDING_BADGE_UUID)).one()
    activities = session.exec(select(LearningActivity).where(LearningActivity.badge_id == badge.id).order_by(LearningActivity.activity_uuid)).all()
    by_id = {activity.id: activity.activity_uuid for activity in activities}
    pages = session.exec(select(LearningPage).where(LearningPage.badge_id == badge.id).order_by(LearningPage.page_uuid)).all()
    dump = lambda row: json.loads(row.model_dump_json())  # noqa: E731
    return {
        "collection": _strip(dump(session.get(BadgeCollection, badge.collection_id))),
        "badge": _strip(dump(badge)),
        "versions": [_strip(dump(v), "version_uuid") for v in session.exec(select(LearningBadgeVersion).where(LearningBadgeVersion.badge_id == badge.id)).all()],
        "paths": [_strip(dump(p), "path_uuid") for p in session.exec(select(LearningPath).where(LearningPath.badge_id == badge.id)).all()],
        "activities": [_strip(dump(activity)) for activity in activities],
        "pages": [{**_strip(dump(page)), "activity_uuid": by_id.get(page.activity_id)} for page in pages],
    }


def _session() -> Session:
    engine = create_engine("sqlite://")
    _create_tables(engine)
    session = Session(engine)
    _create_org(session, org_id=1, slug="owner")
    return session


def test_sync_matches_the_recorded_launch_ready_state_and_is_idempotent():
    session = _session()
    sync_launch_ready_badge(session)
    first = _snapshot(session)
    assert first == json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    sync_launch_ready_badge(session)
    assert _snapshot(session) == first
    welcome = [a for a in first["activities"] if a["published"]]
    assert [a["activity_uuid"] for a in welcome] == [learning.ONBOARDING_ACTIVITY_UUID]


def test_seeded_pages_keep_admin_edits_and_regain_missing_bindings():
    session = _session()
    sync_launch_ready_badge(session)
    name_page = session.exec(select(LearningPage).where(LearningPage.page_uuid == learning.ONBOARDING_NAME_PAGE_UUID)).one()
    content = json.loads(json.dumps(name_page.content))
    content["blocks"][0]["content"]["nodes"] = [{"type": "paragraph", "content": [{"type": "text", "text": "Edited by an admin"}]}]
    content["blocks"][1]["completion"]["variable_bindings"] = {}
    name_page.content, name_page.title = content, "Your name"
    session.add(name_page)
    session.commit()

    sync_launch_ready_badge(session)
    session.refresh(name_page)
    assert name_page.title == "Your name"
    assert name_page.content["blocks"][0]["content"]["nodes"][0]["content"][0]["text"] == "Edited by an admin"
    assert name_page.content["blocks"][1]["completion"]["variable_bindings"]["inputs"]["first_name"] == {"target": "user.first_name"}


def test_managed_pages_are_restored_from_data():
    session = _session()
    sync_launch_ready_badge(session)
    page = session.exec(select(LearningPage).where(LearningPage.page_uuid == "learning_page_system_onboarding_profile_review")).one()
    page.title, page.content = "Broken", {"version": 2, "blocks": []}
    session.add(page)
    session.commit()
    sync_launch_ready_badge(session)
    session.refresh(page)
    assert page.title != "Broken" and page.content["blocks"]


def test_every_system_activity_is_a_valid_activity_document():
    for entry in launch_ready_data()["activities"]:
        document = entry["document"]
        if not document["pages"]:
            continue
        prepared = prepare_document(
            document, existing_page_uuids={page["page_uuid"] for page in document["pages"]}, allow_system_blocks=True
        )
        assert prepared.ok, (document["activity"]["activity_uuid"], prepared.errors)
