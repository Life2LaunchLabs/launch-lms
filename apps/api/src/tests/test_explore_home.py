"""The learner's own Explore: the "Unlock your matches" quest and the careers that fit them."""

from sqlmodel import select

from src.db.portfolio import Portfolio, TimelineEntry
from src.db.portfolio_records import PortfolioResult
from src.db.resources import Resource, UserSavedResource
from src.services.life_plans import careers, explore
from src.tests.test_career_explorer import ARTSY, _learner, _loaded
from src.tests.test_mcp import mcp  # noqa: F401  (fixture)
from src.tests.test_mcp_resources import resources_mcp  # noqa: F401  (fixture)


def _done(page: dict) -> dict:
    return {item["key"]: item["done"] for item in page["quest"]["items"]}


def test_quest_fills_in_from_the_portfolio_and_the_home_ranks_careers_for_you(resources_mcp, monkeypatch):  # noqa: F811
    session, _, alice, _, _ = _loaded(resources_mcp)
    TimelineEntry.__table__.create(session.get_bind(), checkfirst=True)
    learner = _learner(alice)
    monkeypatch.setattr(careers, "quiz_scores", lambda db, user_id: None)

    page = explore.home(session, learner, 1)
    assert page["quest"]["done"] == 0 and not page["has_quiz"] and page["has_careers"]
    assert len(page["careers"]) == 4 and page["saved"] == []

    monkeypatch.setattr(careers, "quiz_scores", lambda db, user_id: ARTSY)
    careers.save_home(session, learner, "Roseburg, OR", "state", True)
    portfolio = session.exec(select(Portfolio).where(Portfolio.user_id == alice.id)).one()
    # Design sense points at a skill and a work style, so it counts as a skill; only pure work styles count as how you work.
    session.add(PortfolioResult(result_uuid="result_1", portfolio_id=portfolio.id, kind="skills", name="Skills and values",
                                data={"template": "skills-values", "skills": ["coding", "design-sense", "listening", "analysis", "attention-to-detail"]}))
    session.commit()
    page = explore.home(session, learner, 1)
    assert _done(page) == {"interests": True, "skills": False, "styles": False, "home": True, "school": False}
    assert [(item["have"], item["need"]) for item in page["quest"]["items"] if item["key"] in ("skills", "styles")] == [(4, 5), (1, 2)]

    result = session.exec(select(PortfolioResult)).one()
    result.data = {**result.data, "skills": [*result.data["skills"], "problem-solving", "staying-calm"]}
    session.add(TimelineEntry(timeline_uuid="tl_1", portfolio_id=portfolio.id, title="Sophomore", organization="Roseburg High", entry_type="education", slug="sophomore"))
    designer = session.exec(select(Resource).where(Resource.title == "Graphic Designers")).one()
    session.add(UserSavedResource(user_id=alice.id, resource_id=designer.id, creation_date="2026-11-07", update_date="2026-11-07"))
    session.commit()
    page = explore.home(session, learner, 1)
    assert page["quest"]["complete"]
    # Artsy interests put the art careers first; designers also use three of the picked skills.
    top = page["careers"][0]
    assert top["title"] == "Graphic Designers" and top["skills_used"] == ["design-sense", "listening", "attention-to-detail"]
    assert [item["title"] for item in page["careers"]][1] == "Fine Artists"
    assert top["pay"] == {"yearly": 62000, "place": "Oregon", "near": False}
    assert page["saved"] == [{"code": "27-1024.00", "title": "Graphic Designers", "resource_uuid": designer.resource_uuid}]
