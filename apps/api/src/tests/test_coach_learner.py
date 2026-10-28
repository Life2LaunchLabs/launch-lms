import json
from datetime import date, datetime

from sqlmodel import Session, SQLModel, create_engine

from src.db.coach import CoachPolicy
from src.db.goals import Goal, GoalStage, GoalStatus, GoalStep, StepProgress, StepStatus
from src.db.learning import LearningVariable
from src.db.portfolio import Portfolio, PortfolioContentStatus, ProfileTrait, ProjectItem, TimelineEntry
from src.db.users import User
from src.services.coach import learner
from src.services.coach.policy import CoachRuntime
from src.services.hub_advisor import AdvisorMessage

LEARNER, OTHER = 2, 3


def _db() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[
        Portfolio.__table__, ProfileTrait.__table__, ProjectItem.__table__, TimelineEntry.__table__,
        Goal.__table__, GoalStage.__table__, GoalStep.__table__, StepProgress.__table__, CoachPolicy.__table__,
        User.__table__, LearningVariable.__table__,
    ])
    return Session(engine)


def _portfolio(db: Session, user_id=LEARNER) -> int:
    portfolio = Portfolio(portfolio_uuid=f"portfolio_{user_id}", user_id=user_id, headline="Aspiring game designer", short_bio="I build small games after school.")
    db.add(portfolio)
    db.flush()
    db.add_all([
        ProfileTrait(trait_uuid=f"t1_{user_id}", portfolio_id=portfolio.id, trait_type="strength", label="Persistence"),
        ProfileTrait(trait_uuid=f"t2_{user_id}", portfolio_id=portfolio.id, trait_type="value", label="Honesty"),
        TimelineEntry(timeline_uuid=f"tl1_{user_id}", portfolio_id=portfolio.id, title="Junior", organization="Lincoln High", entry_type="education", is_current=True, slug="junior"),
        TimelineEntry(timeline_uuid=f"tl2_{user_id}", portfolio_id=portfolio.id, title="Old job", is_current=False, slug="old"),
        ProjectItem(project_uuid=f"p1_{user_id}", portfolio_id=portfolio.id, title="Pixel Racer", summary="A racing game", featured=True, slug="pixel"),
        ProjectItem(project_uuid=f"p2_{user_id}", portfolio_id=portfolio.id, title="Retired thing", status=PortfolioContentStatus.ARCHIVED, slug="retired"),
    ])
    return int(portfolio.id)  # type: ignore[arg-type]


def _goal(db: Session, title: str, user_id=LEARNER, org_id: int | None = 1, status=GoalStatus.ACTIVE, steps=(), done=0, **extra) -> Goal:
    goal = Goal(goal_uuid=f"goal_{title}", org_id=org_id, owner_user_id=user_id, subject_user_id=user_id, title=title, status=status, **extra)
    db.add(goal)
    db.flush()
    stage = GoalStage(stage_uuid=f"stage_{title}", goal_id=goal.id, title="Start")  # type: ignore[arg-type]
    db.add(stage)
    db.flush()
    for index, step_title in enumerate(steps):
        step = GoalStep(step_uuid=f"step_{title}_{index}", goal_id=goal.id, stage_id=stage.id, position=index, type="task", title=step_title)  # type: ignore[arg-type]
        db.add(step)
        db.flush()
        if index < done:
            db.add(StepProgress(progress_uuid=f"progress_{step.id}", step_id=step.id, status=StepStatus.COMPLETED))  # type: ignore[arg-type]
    db.commit()
    return goal


def _runtime(**abilities) -> CoachRuntime:
    return CoachRuntime(enabled=True, abilities=abilities, tiers={})


def test_who_reads_the_portfolio_without_archived_or_past_entries():
    with _db() as db:
        _portfolio(db)
        who = learner.who(db, LEARNER)
        assert who["headline"] == "Aspiring game designer" and who["strengths"] == ["Persistence"] and who["values"] == ["Honesty"]
        assert [item["title"] for item in who["now"]] == ["Junior"]
        assert [item["title"] for item in who["projects"]] == ["Pixel Racer"]
        assert learner.who(db, OTHER) == {}


def test_doing_lists_the_learners_own_goals_with_progress_and_next_steps():
    with _db() as db:
        _goal(db, "Ship a game", steps=("Sketch", "Prototype", "Playtest", "Polish", "Publish"), done=1, description="To show colleges", target_date=date(2027, 5, 1))
        _goal(db, "Personal run", org_id=None, steps=("Run 5k",))
        _goal(db, "Other org goal", org_id=2)
        _goal(db, "Someone else's", user_id=OTHER)
        _goal(db, "Old goal", status=GoalStatus.FINISHED, finished_at=datetime(2026, 9, 1))
        _goal(db, "Gone", status=GoalStatus.ARCHIVED)
        doing = learner.doing(db, 1, LEARNER)
        titles = [goal["title"] for goal in doing["goals"]]
        assert titles == ["Ship a game", "Personal run"]
        ship = doing["goals"][0]
        assert ship["progress"] == "1/5 steps" and ship["next_steps"] == ["Prototype", "Playtest", "Polish"]
        assert ship["why"] == "To show colleges" and ship["target_date"] == "2027-05-01"
        assert doing["finished"] == [{"title": "Old goal", "finished": "2026-09-01"}]


def test_learner_context_stays_within_its_budget():
    with _db() as db:
        _portfolio(db)
        for index in range(8):
            _goal(db, f"Goal {index} " + "x" * 150, steps=["A long step title " + "y" * 100] * 4, description="z" * 300)
        context = learner.learner_context(db, 1, LEARNER)
        assert len(json.dumps(context)) <= learner.MAX_CHARS
        assert context["doing"]["goals"] and context["who"]["headline"]


def test_abilities_gate_each_layer_and_grounding():
    with _db() as db:
        _portfolio(db)
        _goal(db, "Ship a game", steps=("Sketch",))
        assert set(learner.for_policy(db, 1, LEARNER, _runtime())) == {"who", "doing"}
        assert set(learner.for_policy(db, 1, LEARNER, _runtime(read_portfolio=False))) == {"doing"}
        assert learner.for_policy(db, 1, LEARNER, _runtime(read_portfolio=False, read_goals=False)) == {}
        messages = [AdvisorMessage(role="user", content="What should I focus on?")]
        grounded = learner.ground_learner_context(messages, db, 1, LEARNER, _runtime())
        assert "<launch_learner_context>" in grounded[-1].content and "Pixel Racer" in grounded[-1].content and "Ship a game" in grounded[-1].content
        assert learner.ground_learner_context(messages, db, 1, LEARNER, _runtime(read_portfolio=False, read_goals=False)) == messages
