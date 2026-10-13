import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlmodel import select

from src.core.capabilities import CORE_CAPABILITIES
from src.db.discover import DiscoverSettings, DiscoverSlide
from src.db.news import NewsArticle, NewsArticleStatus
from src.db.organization_config import OrganizationConfig
from src.db.users import AnonymousUser, User
from src.services import badge_discover, discover_featured
from src.tests.test_badge_discover import _collect
from src.tests.test_badge_routes import LEARNER, _session, _world


def _news(session):
    NewsArticle.__table__.create(session.get_bind(), checkfirst=True)
    for uuid, org_id, status in [("news_public", 1, "published"), ("news_private", 1, "draft"), ("news_other", 2, "published")]:
        session.add(NewsArticle(article_uuid=uuid, org_id=org_id, title=uuid, slug=uuid, status=NewsArticleStatus(status), featured=True))
    session.commit()


def test_automatic_hero_includes_published_site_news_and_challenges(monkeypatch):
    monkeypatch.setitem(CORE_CAPABILITIES, "news", True)
    with _session() as session:
        _world(session)
        _collect(session)
        _news(session)
        slides = badge_discover.discover(session, AnonymousUser(), site_org_id=1)["hero_slides"]
        assert slides[0]["key"] == "news:news_public"
        assert slides[-1]["kind"] == "challenges" and slides[-1]["href"] == ""
        assert {slide["key"] for slide in slides}.isdisjoint({"news:news_private", "news:news_other"})
        assert any(slide["kind"] == "badge" for slide in slides)
        assert any(slide["kind"] == "collection" for slide in slides)


def test_curated_order_and_artwork_persist_without_overwriting_org_settings():
    with _session() as session:
        admin, _, _ = _world(session)
        _collect(session)
        row = session.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == 1)).first() or OrganizationConfig(org_id=1)
        row.config = {"general": {"enabled": True}, "customization": {"colors": {"primary": "red"}}}
        session.add(row)
        session.commit()
        settings = DiscoverSettings(mode="curated", slides=[DiscoverSlide(kind="challenges", target="challenges", title="Challenges coming soon", image_url="/jungle_landscape.jpg"), DiscoverSlide(kind="badge", target="badge_adapt", title="Your next skill", action_label="Explore")])
        assert discover_featured.save_settings(session, admin, 1, settings)["settings"] == settings.model_dump()
        session.refresh(row)
        assert row.config["customization"]["colors"] == {"primary": "red"}
        assert row.config["general"] == {"enabled": True}
        slides = discover_featured.hero_slides(session, 1, [])
        assert [slide["kind"] for slide in slides] == ["challenges", "badge"]
        assert slides[0]["image_url"] == "/jungle_landscape.jpg" and slides[0]["href"] == ""
        assert slides[1]["title"] == "Your next skill" and slides[1]["action_label"] == "Explore"
        discover_featured.save_settings(session, admin, 1, DiscoverSettings(enabled=False))
        assert discover_featured.hero_slides(session, 1, []) == []


def test_selected_org_admin_required_and_unavailable_sources_rejected(monkeypatch):
    monkeypatch.setitem(CORE_CAPABILITIES, "news", True)
    with _session() as session:
        admin, _, _ = _world(session)
        _collect(session)
        _news(session)
        row = session.get(User, admin.id)
        row.is_superadmin = False
        session.add(row)
        session.commit()
        admin.is_superadmin = False
        for user, org_id in [(LEARNER, 1), (AnonymousUser(), 1), (admin, 2)]:
            with pytest.raises(HTTPException) as error:
                discover_featured.save_settings(session, user, org_id, DiscoverSettings())
            assert error.value.status_code == 403
        for target in ["news_private", "news_other", "news_missing"]:
            with pytest.raises(HTTPException) as error:
                discover_featured.save_settings(session, admin, 1, DiscoverSettings(mode="curated", slides=[DiscoverSlide(kind="news", target=target)]))
            assert error.value.status_code == 422
        assert discover_featured.read_settings(session, admin, 1)["options"]["news"] == [{"id": "news_public", "name": "news_public"}]


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
    from src.db.learning import LearningBadge, LearningBadgeStatus

    with _session() as session:
        _world(session)
        _collect(session)
        for badge in session.exec(select(LearningBadge)).all():
            badge.status = LearningBadgeStatus.DRAFT
            session.add(badge)
        session.commit()
        slides = discover_featured.hero_slides(session, 1, [])
        assert [slide["kind"] for slide in slides] == ["link", "challenges"]
        assert slides[0]["href"] == "/plans"


def test_unpublished_curated_source_is_skipped_and_legacy_config_recovers():
    from src.db.learning import LearningBadge, LearningBadgeStatus

    with _session() as session:
        admin, _, _ = _world(session)
        _collect(session)
        discover_featured.save_settings(session, admin, 1, DiscoverSettings(mode="curated", slides=[DiscoverSlide(kind="badge", target="badge_adapt")]))
        badge = session.get(LearningBadge, 1)
        badge.status = LearningBadgeStatus.DRAFT
        session.add(badge)
        session.commit()
        assert discover_featured.hero_slides(session, 1, []) == []
        row = session.exec(select(OrganizationConfig).where(OrganizationConfig.org_id == 1)).first()
        row.config = {"customization": None}
        session.add(row)
        session.commit()
        assert discover_featured.hero_slides(session, 1, [])[-1]["kind"] == "challenges"
