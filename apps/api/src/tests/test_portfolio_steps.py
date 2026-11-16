"""Portfolio steps that count: "have at least N of these in your portfolio" (DEV-115)."""

import pytest
from fastapi import HTTPException
from sqlmodel import Session

from src.db.portfolio import Portfolio, ProfileTrait, ProjectItem, ProjectItemBlock, TimelineEntry
from src.db.portfolio_records import Credential, PortfolioContact, PortfolioQuote, PortfolioResult
from src.services.goals import goals
from src.services.goals.completion import on_portfolio_changed
from src.services.goals.portfolio_steps import PortfolioItemsHidden
from src.tests.test_goals import ADMIN, LEARNER, _issue, _published, _session as _goal_session, _step, _user

STEP = {"type": "portfolio", "title": "Show three projects", "config": {"part": "projects", "count": 3}}


def _session() -> Session:
    db = _goal_session()
    for model in (ProfileTrait, ProjectItem, ProjectItemBlock, TimelineEntry, Credential, PortfolioContact, PortfolioQuote, PortfolioResult):
        model.__table__.create(db.get_bind(), checkfirst=True)
    return db


def _portfolio(db: Session) -> Portfolio:
    portfolio = Portfolio(portfolio_uuid="por_lee", user_id=LEARNER, display_name="Lee", creation_date="", update_date="")
    db.add(portfolio)
    db.commit()
    db.refresh(portfolio)
    return portfolio


def _projects(db: Session, portfolio: Portfolio, *names: str) -> None:
    for name in names:
        db.add(ProjectItem(project_uuid=f"prj_{name}", portfolio_id=portfolio.id, title=name, slug=name, creation_date="", update_date=name))
    db.commit()


def test_a_portfolio_that_already_has_enough_finishes_the_step_on_arrival():
    with _session() as db:
        portfolio = _portfolio(db)
        _projects(db, portfolio, "a", "b", "c", "d")
        goal = _issue(db, _published(db, STEP, {"type": "task", "title": "Tidy up"}))
        step = _step(goals.get_goal(db, _user(LEARNER), goal.goal_uuid), "Show three projects")
        assert step["status"] == "completed"
        assert step["reference"]["needed"] == 3 and step["reference"]["have"] == 4 and len(step["reference"]["items"]) == 4


def test_the_step_fills_as_items_are_added_and_the_learner_picks_which_count():
    with _session() as db:
        portfolio = _portfolio(db)
        _projects(db, portfolio, "a")
        goal = _issue(db, _published(db, STEP, {"type": "task", "title": "Tidy up"}))
        step = _step(goals.get_goal(db, _user(LEARNER), goal.goal_uuid), "Show three projects")
        assert step["status"] != "completed" and step["reference"]["have"] == 1
        _projects(db, portfolio, "b", "c", "d")
        on_portfolio_changed(db, LEARNER)
        step = _step(goals.get_goal(db, _user(LEARNER), goal.goal_uuid), "Show three projects")
        assert step["status"] == "completed"

        # Hiding one of four leaves three: still done, and staff no longer see it.
        view = goals.hide_portfolio_items(db, _user(LEARNER), goal.goal_uuid, step["step_uuid"], PortfolioItemsHidden(hidden=["project:prj_d"]))
        mine = _step(view, "Show three projects")
        assert mine["status"] == "completed" and mine["reference"]["have"] == 3
        assert [item["hidden"] for item in mine["reference"]["items"] if item["key"] == "project:prj_d"] == [True]
        staff = _step(goals.get_goal(db, _user(ADMIN), goal.goal_uuid), "Show three projects")
        assert "project:prj_d" not in [item["key"] for item in staff["reference"]["items"]] and len(staff["reference"]["items"]) == 3
        # Not below what the step needs.
        with pytest.raises(HTTPException, match="Keep at least 3 showing"):
            goals.hide_portfolio_items(db, _user(LEARNER), goal.goal_uuid, step["step_uuid"], PortfolioItemsHidden(hidden=["project:prj_d", "project:prj_c"]))
        with pytest.raises(HTTPException):
            goals.hide_portfolio_items(db, _user(ADMIN), goal.goal_uuid, step["step_uuid"], PortfolioItemsHidden(hidden=[]))


def test_a_step_can_count_a_kind_of_result_like_a_strengths_test():
    with _session() as db:
        portfolio = _portfolio(db)
        db.add(PortfolioResult(result_uuid="res_1", portfolio_id=portfolio.id, kind="interests", name="Holland code"))
        db.commit()
        strengths = {"type": "portfolio", "title": "Take a strengths test", "config": {"part": "results", "filter": "strengths"}}
        goal = _issue(db, _published(db, strengths, {"type": "task", "title": "Tidy up"}))
        assert _step(goals.get_goal(db, _user(LEARNER), goal.goal_uuid), "Take a strengths test")["status"] != "completed"
        db.add(PortfolioResult(result_uuid="res_2", portfolio_id=portfolio.id, kind="strengths", name="CliftonStrengths", summary="Learner, Achiever"))
        db.commit()
        step = _step(goals.get_goal(db, _user(LEARNER), goal.goal_uuid), "Take a strengths test")
        assert step["status"] == "completed" and [item["title"] for item in step["reference"]["items"]] == ["CliftonStrengths"]


def test_a_filter_has_to_fit_the_part():
    with _session() as db, pytest.raises(HTTPException, match="doesn't narrow"):
        _published(db, {"type": "portfolio", "title": "Bad", "config": {"part": "projects", "filter": "strengths"}})
