"""The Launch Ready starter goal: a system template document every learner gets a goal from."""

import json

import pytest
from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goals import Goal, GoalSource, GoalStep, GoalTemplate, GoalTemplateVersion, StepProgress
from src.db.learning import LearningActivity, LearningPage
from src.db.portfolio import Portfolio, PortfolioVisibility, ProfileTrait, ProjectItem, TimelineEntry
from src.services.goals import starter, templates
from src.tests.test_goals import ADMIN, LEARNER, OTHER, _session as _goal_session, _user

KEYS = ["welcome", "timeline", "project", "traits", "badges", "launch"]


def _session() -> Session:
    db = _goal_session()
    for model in (ProfileTrait, ProjectItem, TimelineEntry):
        model.__table__.create(db.get_bind(), checkfirst=True)
    return db


def _state(db: Session) -> dict:
    template = db.exec(select(GoalTemplate).where(GoalTemplate.system_type == "starter")).one()
    steps = template.document["stages"][0]["steps"]
    activities = {step["key"]: db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == step["config"]["activity_uuid"])).one() for step in steps}
    return {
        "template": (template.template_uuid, template.org_id), "stages": len(template.document["stages"]),
        "steps": [(step["key"], step["type"]) for step in steps],
        "activities": {key: (activity.activity_uuid, activity.goal_template_id) for key, activity in activities.items()},
        "pages": {key: [page.page_uuid for page in db.exec(select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order)).all()] for key, activity in activities.items()},
        "versions": len(db.exec(select(GoalTemplateVersion).where(GoalTemplateVersion.template_id == template.id)).all()),
    }


def _done(db: Session, goal: Goal) -> set[str]:
    done = set()
    for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all():
        progress = db.exec(select(StepProgress).where(StepProgress.step_id == step.id)).first()
        if progress and progress.status == "completed":
            done.add(step.template_key.removeprefix(starter.STEP_PREFIX))
    return done


def test_sync_builds_a_published_template_of_six_activity_steps_and_is_idempotent():
    with _session() as db:
        starter.sync_starter_template(db)
        first = _state(db)
        template = db.exec(select(GoalTemplate).where(GoalTemplate.system_type == "starter")).one()
        assert first["template"] == ("program_starter", 1) and first["stages"] == 1 and first["versions"] == 1
        assert first["steps"] == [(f"objective_starter_{key}", "activity") for key in KEYS]
        assert first["activities"] == {f"objective_starter_{key}": (f"learning_activity_starter_{key}", template.id) for key in KEYS}
        data = starter.starter_data()
        assert list(first["pages"].values()) == [[page["page_uuid"] for page in step["document"]["pages"]] for step in data["steps"]]
        starter.sync_starter_template(db)
        assert _state(db) == first
        assert len(db.exec(select(GoalTemplate).where(GoalTemplate.system_type == "starter")).all()) == 1


def test_managed_pages_are_restored_on_sync_and_published_again():
    with _session() as db:
        starter.sync_starter_template(db)
        page = db.exec(select(LearningPage).where(LearningPage.page_uuid == "learning_page_starter_timeline")).one()
        page.title, page.content = "Broken", {"version": 2, "blocks": []}
        db.add(page)
        activity = db.get(LearningActivity, page.activity_id)
        activity.title = "Renamed by an admin"
        db.add(activity)
        db.add(LearningPage(page_uuid="learning_page_starter_stray", page_type="standard", title="Stray", content={}, design={}, activity_id=activity.id, org_id=1, creation_date=""))
        db.commit()
        starter.sync_starter_template(db)
        db.refresh(page)
        db.refresh(activity)
        assert page.title != "Broken" and page.content["blocks"] and activity.title != "Renamed by an admin"
        assert db.exec(select(LearningPage).where(LearningPage.page_uuid == "learning_page_starter_stray")).first() is None
        assert _state(db)["versions"] == 1


def test_seed_pages_keep_admin_edits_and_regain_missing_bindings():
    with _session() as db:
        starter.sync_starter_template(db)
        name_page = db.exec(select(LearningPage).where(LearningPage.page_uuid == "learning_page_starter_name")).one()
        content = json.loads(json.dumps(name_page.content))
        content["blocks"][0]["content"]["node"]["content"][0]["text"] = "Edited by an admin"
        content["blocks"][1]["completion"]["variable_bindings"] = {}
        name_page.content, name_page.title = content, "Your name"
        db.add(name_page)
        db.commit()
        starter.sync_starter_template(db)
        db.refresh(name_page)
        assert name_page.title == "Your name"
        assert name_page.content["blocks"][0]["content"]["node"]["content"][0]["text"] == "Edited by an admin"
        assert name_page.content["blocks"][1]["completion"]["variable_bindings"]["inputs"]["first_name"] == {"target": "user.first_name"}
        # Seed edits change the content, so the next sync publishes it.
        assert _state(db)["versions"] == 2


def test_the_starter_template_is_edited_only_by_releases():
    with _session() as db:
        template = starter.sync_starter_template(db)
        with pytest.raises(HTTPException):
            templates.save_template(db, _user(ADMIN), 1, template.template_uuid, template.document)
        with pytest.raises(HTTPException):
            templates.publish(db, _user(ADMIN), 1, template.template_uuid)


def test_ensure_starter_goal_is_one_goal_per_learner_and_locked():
    from src.services.goals import goals

    with _session() as db:
        goal = starter.ensure_starter_goal(db, LEARNER)
        assert starter.ensure_starter_goal(db, LEARNER).id == goal.id
        assert starter.ensure_starter_goal(db, OTHER).id != goal.id
        assert (goal.source, goal.owner_user_id, goal.subject_user_id) == (GoalSource.STARTER.value, LEARNER, LEARNER)
        assert _done(db, goal) == set()
        view = goals.get_goal(db, _user(LEARNER), goal.goal_uuid)
        assert not {"edit_structure", "edit_plan_details", "edit_schedule", "manage_roles"} & set(view["capabilities"])
        assert "update_progress" in view["capabilities"]


def test_ensure_starter_goal_checks_off_steps_already_done_in_the_portfolio():
    with _session() as db:
        portfolio = Portfolio(portfolio_uuid="por_lee", user_id=LEARNER, display_name="Lee", creation_date="", update_date="")
        db.add(portfolio)
        db.commit()
        goal = starter.ensure_starter_goal(db, LEARNER)
        assert _done(db, goal) == {"welcome"}

        db.add(TimelineEntry(timeline_uuid="tml_1", portfolio_id=portfolio.id, title="Intern", slug="intern", creation_date="", update_date=""))
        db.add(ProjectItem(project_uuid="prj_1", portfolio_id=portfolio.id, title="Garden", slug="garden", creation_date="", update_date=""))
        db.add(ProfileTrait(trait_uuid="trt_1", portfolio_id=portfolio.id, trait_type="strength", label="Curious", creation_date="", update_date=""))
        db.commit()
        assert starter.ensure_starter_goal(db, LEARNER).id == goal.id
        # A strength alone doesn't complete the traits step; it needs a value too.
        assert _done(db, goal) == {"welcome", "timeline", "project"}

        checklist = starter.starter_checklist(db, goal)
        assert (checklist["total"], checklist["completed"], checklist["percent"], checklist["complete"]) == (6, 3, 50, False)
        assert checklist["items"][0]["label"] == "Welcome" and checklist["nextIncomplete"] == checklist["items"][3]

        db.add(ProfileTrait(trait_uuid="trt_2", portfolio_id=portfolio.id, trait_type="value", label="Kindness", creation_date="", update_date=""))
        db.add(Goal(goal_uuid="goal_joined", owner_user_id=LEARNER, subject_user_id=LEARNER, ownership="external", source="joined", title="Joined from Discover", creation_date="", update_date=""))
        portfolio.visibility = PortfolioVisibility.PUBLIC
        db.add(portfolio)
        db.commit()
        starter.ensure_starter_goal(db, LEARNER)
        assert _done(db, goal) == set(KEYS)
        db.refresh(goal)
        assert goal.status == "finished" and starter.starter_checklist(db, goal)["complete"]
