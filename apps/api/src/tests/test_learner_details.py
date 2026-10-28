"""Kept answers: strengths and values land in the portfolio, learner details reach Coach and Insights."""

from sqlmodel import Session, SQLModel, create_engine, select

from src.db.learning import LearningVariable
from src.db.portfolio import Portfolio, PortfolioSection, ProfileTrait, ProjectItem, TimelineEntry
from src.db.users import User
from src.services.coach import learner
from src.services.learning import learner_details
from src.services.learning.learner_variables import _apply_learning_variables_to_user

ORG = 1


def _db() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[
        User.__table__, LearningVariable.__table__, Portfolio.__table__, PortfolioSection.__table__,
        ProfileTrait.__table__, ProjectItem.__table__, TimelineEntry.__table__,
    ])
    return Session(engine)


def _user(db: Session) -> User:
    user = User(username="jo", first_name="Jo", last_name="Park", email="jo@example.com", user_uuid="user_jo", password="x")
    db.add(user)
    db.add(LearningVariable(org_id=ORG, key="career.interest", label="Career interest", variable_uuid="var_1"))
    db.add(LearningVariable(org_id=ORG, key="growth_goal", label="Growth goal", variable_uuid="var_2"))
    db.commit()
    db.refresh(user)
    return user


def _keep(db: Session, user: User, target: str, value):
    applied, skipped = _apply_learning_variables_to_user(db, user, [{"target": target, "value": value}], org_id=ORG)
    db.commit()
    return applied, skipped


def _traits(db: Session, kind: str) -> list[str]:
    return [row.label for row in db.exec(select(ProfileTrait).where(ProfileTrait.trait_type == kind).order_by(ProfileTrait.sort_order)).all()]


def test_a_kept_choice_adds_strengths_without_repeats():
    with _db() as db:
        user = _user(db)
        applied, skipped = _keep(db, user, "user.portfolio.strengths", ["Teamwork", "Reliability"])
        assert applied and not skipped
        _keep(db, user, "user.portfolio.strengths", ["teamwork", "Problem solving"])
        _keep(db, user, "user.portfolio.values", "Family, Fairness")
        assert _traits(db, "strength") == ["Teamwork", "Reliability", "Problem solving"]
        assert _traits(db, "value") == ["Family", "Fairness"]
        assert learner_details.traits(db, int(user.id))["user.portfolio.strengths"] == "Teamwork, Reliability, Problem solving"


def test_a_kept_answer_shows_in_the_portfolio_coach_reads():
    with _db() as db:
        user = _user(db)
        _keep(db, user, "user.portfolio.values", ["Honesty"])
        _keep(db, user, "user.details.variables.career.interest", ["Skilled trades"])
        _keep(db, user, "user.details.variables.growth_goal", "Time management")
        who = learner.who(db, int(user.id), ORG)
        assert who["values"] == ["Honesty"]
        assert who["details"] == {"Career interest": "Skilled trades", "Growth goal": "Time management"}
        assert "details" not in learner.who(db, int(user.id))


def test_learner_details_list_only_the_orgs_fields_with_values():
    with _db() as db:
        user = _user(db)
        _keep(db, user, "user.details.variables.growth_goal", "Time management")
        _keep(db, user, "user.details.variables.unlisted", "Hidden")
        assert learner_details.details_for(db, ORG, user) == [{"key": "growth_goal", "label": "Growth goal", "value": "Time management"}]
        assert learner_details.details_for(db, 2, user) == []
        assert learner_details.detail_variables(db, ORG, user) == {"user.details.variables.growth_goal": "Time management"}


def test_keep_writes_a_questions_answer_in_words():
    from src.db.learning import LearningPage
    from src.services.learning.learner_variables import _extract_learning_variables

    choice = {"id": "q1", "type": "question", "kind": "multiple_choice", "content": {"options": [{"id": "a", "text": "Teamwork"}, {"id": "b", "text": "Grit"}]},
              "completion": {"variable_bindings": {"keep": [{"target": "user.portfolio.strengths"}]}}}
    text = {"id": "q2", "type": "question", "kind": "text_input", "content": {"inputs": [{"id": "i1"}]},
            "completion": {"variable_bindings": {"keep": [{"target": "user.details.variables.growth_goal"}]}}}
    page = LearningPage(page_uuid="learning_page_1", activity_id=1, page_type="standard", title="", content={"version": 3, "blocks": [choice, text]})
    result = {"questions": {"q1": {"option_ids": ["b", "a"]}, "q2": {"inputs": {"i1": {"text": " Time management "}}}}}
    kept = {item["target"]: item["value"] for item in _extract_learning_variables(page, result)}
    assert kept == {"user.portfolio.strengths": ["Grit", "Teamwork"], "user.details.variables.growth_goal": "Time management"}
