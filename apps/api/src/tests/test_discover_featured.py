import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlmodel import select

from src.db.discover import DiscoverSettings, DiscoverSlide
from src.db.organization_config import OrganizationConfig
from src.db.users import AnonymousUser, User
from src.db.plan_collections import PlanCollectionCreate
from src.services import discover_featured
from src.services.goals import collections, plan_access, plan_joining
from src.tests.test_goals import ADMIN, LEARNER as LEARNER_ID, _user
from src.tests.test_plan_joining import _setup

LEARNER = _user(LEARNER_ID)


def _session():
    session, plans = _setup()
    OrganizationConfig.__table__.create(session.get_bind(), checkfirst=True)
    session.info["plans"] = plans
    return session


def _collect(session) -> None:
    """Studio offers both of its badge plans openly, gathered in a collection."""
    plans = session.info["plans"]
    for plan in plans:
        plan_access.set_access(session, int(plan.id), 1, "open", None)
    session.commit()
    collections.create_collection(session, _user(ADMIN), 1, PlanCollectionCreate(name="Adapt", template_uuids=[plan.template_uuid for plan in plans]))


def _plan_uuid(session) -> str:
    return session.info["plans"][0].template_uuid


def _unoffer(session) -> None:
    for plan in session.info["plans"]:
        plan_access.set_access(session, int(plan.id), 1, "invite", None)
    session.commit()


def test_automatic_hero_features_plans_series_and_challenges():
    with _session() as session:
        _collect(session)
        slides = plan_joining.discover(session, AnonymousUser(), site_org_id=1)["hero_slides"]
        assert slides[-1]["kind"] == "challenges" and slides[-1]["href"] == ""
        assert not any(slide["kind"] == "news" for slide in slides)
        plan = next(slide for slide in slides if slide["kind"] == "plan")
        assert plan["eyebrow"] == "Earn a badge" and plan["href"].startswith("/discover/plans/")
        assert any(slide["kind"] == "collection" for slide in slides)


def test_curated_order_and_artwork_persist_without_overwriting_org_settings():
    with _session() as session:
        admin = _user(ADMIN)
        _collect(session)
        row = session.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == 1)).first() or OrganizationConfig(org_id=1)
        row.config = {**(row.config or {}), "general": {"enabled": True}, "customization": {"colors": {"primary": "red"}}}
        session.add(row)
        session.commit()
        settings = DiscoverSettings(mode="curated", slides=[DiscoverSlide(kind="challenges", target="challenges", title="Challenges coming soon", image_url="/jungle_landscape.jpg"), DiscoverSlide(kind="plan", target=_plan_uuid(session), title="Your next skill", action_label="Explore")])
        assert discover_featured.save_settings(session, admin, 1, settings)["settings"] == settings.model_dump()
        session.refresh(row)
        assert row.config["customization"]["colors"] == {"primary": "red"}
        assert row.config["general"] == {"enabled": True}
        slides = discover_featured.hero_slides(session, 1, [])
        assert [slide["kind"] for slide in slides] == ["challenges", "plan"]
        assert slides[0]["image_url"] == "/jungle_landscape.jpg" and slides[0]["href"] == ""
        assert slides[1]["title"] == "Your next skill" and slides[1]["action_label"] == "Explore"
        discover_featured.save_settings(session, admin, 1, DiscoverSettings(enabled=False))
        assert discover_featured.hero_slides(session, 1, []) == []


def test_selected_org_admin_required_and_unavailable_sources_rejected():
    with _session() as session:
        admin = _user(ADMIN)
        _collect(session)
        row = session.get(User, admin.id)
        row.is_superadmin = False
        session.add(row)
        session.commit()
        admin.is_superadmin = False
        for user, org_id in [(LEARNER, 1), (AnonymousUser(), 1), (admin, 99)]:
            with pytest.raises(HTTPException) as error:
                discover_featured.save_settings(session, user, org_id, DiscoverSettings())
            assert error.value.status_code == 403
        for kind, target in [("plan", "goal_template_missing"), ("collection", "plan_collection_missing")]:
            with pytest.raises(HTTPException) as error:
                discover_featured.save_settings(session, admin, 1, DiscoverSettings(mode="curated", slides=[DiscoverSlide(kind=kind, target=target)]))
            assert error.value.status_code == 422
        assert "news" not in discover_featured.read_settings(session, admin, 1)["options"]


def test_stored_news_slides_are_dropped_without_losing_curation():
    with _session() as session:
        _collect(session)
        row = session.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == 1)).first() or OrganizationConfig(org_id=1)
        row.config = {**(row.config or {}), "customization": {"discover": {"mode": "curated", "slides": [{"kind": "news", "target": "news_public"}, {"kind": "challenges", "target": "challenges"}]}}}
        session.add(row)
        session.commit()
        assert [slide["kind"] for slide in discover_featured.hero_slides(session, 1, [])] == ["challenges"]


@pytest.mark.parametrize("target", ["javascript:alert(1)", "//evil.test", "/\\evil.test", "https://user:password@example.com", " "])
def test_custom_slides_reject_unsafe_destinations(target):
    with pytest.raises(ValidationError):
        DiscoverSlide(kind="link", target=target, title="Story")


def test_duplicate_slides_and_unsafe_artwork_are_rejected():
    with pytest.raises(ValidationError):
        DiscoverSettings(slides=[DiscoverSlide(kind="challenges", target="challenges")] * 2)
    with pytest.raises(ValidationError):
        DiscoverSlide(kind="challenges", target="challenges", image_url="data:text/html,bad")


def test_empty_catalog_retains_welcome_and_challenges_hero():
    with _session() as session:
        _collect(session)
        _unoffer(session)
        slides = discover_featured.hero_slides(session, 1, [])
        assert [slide["kind"] for slide in slides] == ["link", "challenges"]
        assert slides[0]["href"] == "/plans"


def test_unoffered_curated_source_is_skipped_and_legacy_config_recovers():
    with _session() as session:
        admin = _user(ADMIN)
        _collect(session)
        discover_featured.save_settings(session, admin, 1, DiscoverSettings(mode="curated", slides=[DiscoverSlide(kind="plan", target=_plan_uuid(session))]))
        _unoffer(session)
        assert discover_featured.hero_slides(session, 1, []) == []
        row = session.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == 1)).first()
        row.config = {"customization": None}
        session.add(row)
        session.commit()
        assert discover_featured.hero_slides(session, 1, [])[-1]["kind"] == "challenges"
