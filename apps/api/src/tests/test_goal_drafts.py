"""Plans have a live version and at most one draft: semvers go up, publishing goes live and moves active
assignments, switching the live version moves them too, and a plan without one is inactive."""

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.goal_templates import AssignmentCollaborator, GoalAssignmentRequest
from src.db.goals import Goal, GoalAssignment, GoalStep
from src.services.goals import assignments, drafts, goals, templates
from src.tests.test_goal_assignment_versions import V1, _v2
from src.tests.test_goal_assignments_admin import _session
from src.tests.test_goals import ADMIN, LEARNER, _user


def _assigned(db) -> tuple[str, Goal]:
    created = templates.create_template(db, _user(ADMIN), 1, V1)
    uuid = created["template_uuid"]
    templates.publish(db, _user(ADMIN), 1, uuid)
    result = assignments.assign(db, _user(ADMIN), 1, uuid, GoalAssignmentRequest(usergroup_id=1, collaborators=[AssignmentCollaborator(user_id=ADMIN)]))
    assignment = db.exec(select(GoalAssignment).where(GoalAssignment.assignment_uuid == result["assignment_uuid"])).one()
    goal = db.exec(select(Goal).where(Goal.assignment_id == assignment.id, Goal.subject_user_id == LEARNER)).one()
    goals.respond(db, _user(LEARNER), goal.goal_uuid, True)
    return uuid, goal


def _titles(db, goal: Goal) -> set[str]:
    return {step.title for step in db.exec(select(GoalStep).where(GoalStep.goal_id == goal.id)).all()}


def test_a_new_plan_drafts_1_0_0_and_publishing_closes_the_draft():
    with _session() as db:
        created = templates.create_template(db, _user(ADMIN), 1, V1)
        assert (created["draft"]["semver"], created["draft"]["implicit"], created["live_version"]) == ("1.0.0", False, None)
        published = templates.publish(db, _user(ADMIN), 1, created["template_uuid"], "First")
        assert published["draft"] is None and published["live_version"]["semver"] == "1.0.0"
        assert published["versions"][0]["note"] == "First" and published["versions"][0]["live"] is True


def test_drafts_need_a_higher_semver_and_show_what_they_change():
    with _session() as db:
        uuid, _ = _assigned(db)
        for bad, message in (("2.1", "three numbers"), ("1.0.0", "higher than 1.0.0"), ("0.9.9", "higher than 1.0.0")):
            with pytest.raises(HTTPException) as refused:
                drafts.start_draft(db, _user(ADMIN), 1, uuid, bad)
            assert refused.value.status_code == 422 and message in refused.value.detail
        started = drafts.start_draft(db, _user(ADMIN), 1, uuid, "v1.1.0", "New intro")
        assert (started["draft"]["semver"], started["draft"]["note"]) == ("1.1.0", "New intro")
        with pytest.raises(HTTPException) as twice:
            drafts.start_draft(db, _user(ADMIN), 1, uuid, "1.2.0")
        assert twice.value.status_code == 409

        assert drafts.draft_changes(db, _user(ADMIN), 1, uuid)["summary"] == {"added": 0, "changed": 0, "removed": 0, "stages_changed": 0}
        templates.save_template(db, _user(ADMIN), 1, uuid, _v2())
        changes = drafts.draft_changes(db, _user(ADMIN), 1, uuid)
        assert changes["base"]["semver"] == "1.0.0"
        assert changes["summary"] == {"added": 2, "changed": 2, "removed": 1, "stages_changed": 2}

        published = templates.publish(db, _user(ADMIN), 1, uuid)
        assert published["live_version"]["semver"] == "1.1.0" and published["live_version"]["note"] == "New intro"
        assert drafts.suggest(db, templates.template_or_404(db, 1, uuid)) == "1.2.0"


def test_discarding_a_draft_goes_back_to_the_live_version():
    with _session() as db:
        uuid, _ = _assigned(db)
        drafts.start_draft(db, _user(ADMIN), 1, uuid, "2.0.0")
        templates.save_template(db, _user(ADMIN), 1, uuid, _v2())
        discarded = drafts.discard_draft(db, _user(ADMIN), 1, uuid)
        assert discarded["draft"] is None and discarded["has_unpublished_changes"] is False
        assert [step["title"] for step in discarded["document"]["stages"][0]["steps"]] == ["Draft", "Read", "Old step"]


def test_saving_without_a_draft_starts_one_for_the_connector():
    with _session() as db:
        uuid, _ = _assigned(db)
        saved = templates.save_template(db, _user(ADMIN), 1, uuid, _v2())
        assert (saved["draft"]["semver"], saved["draft"]["implicit"]) == ("1.1.0", False)


def test_publishing_live_moves_active_assignments_and_not_live_leaves_them():
    with _session() as db:
        uuid, goal = _assigned(db)
        templates.save_template(db, _user(ADMIN), 1, uuid, _v2())
        quiet = templates.publish(db, _user(ADMIN), 1, uuid, make_live=False)
        assert quiet["moved"] is None and "New step" not in _titles(db, goal)

        templates.save_template(db, _user(ADMIN), 1, uuid, _v2())
        live = templates.publish(db, _user(ADMIN), 1, uuid)
        assert (live["live_version"]["semver"], live["moved"]["assignments"], live["moved"]["plans"]) == ("1.2.0", 1, 2)
        assert "New step" in _titles(db, goal)


def test_switching_the_live_version_rolls_assignments_back_and_inactive_stops_new_ones():
    with _session() as db:
        uuid, goal = _assigned(db)
        templates.save_template(db, _user(ADMIN), 1, uuid, _v2())
        templates.publish(db, _user(ADMIN), 1, uuid)
        assert "New step" in _titles(db, goal)
        first = [version for version in templates.get_template(db, _user(ADMIN), 1, uuid)["versions"] if version["semver"] == "1.0.0"][0]

        assert drafts.live_preview(db, _user(ADMIN), 1, uuid) == {"assignments": 1, "open_plans": 2}
        rolled = drafts.set_live(db, _user(ADMIN), 1, uuid, first["version_uuid"])
        assert rolled["live_version"]["semver"] == "1.0.0" and rolled["moved"]["assignments"] == 1
        assert "New step" not in _titles(db, goal) and "Old step" in _titles(db, goal)
        assert rolled["draft"] is None and rolled["document"]["stages"][0]["steps"][2]["title"] == "Old step"
        # Version numbers keep going up from the highest, not the live one.
        assert drafts.suggest(db, templates.template_or_404(db, 1, uuid)) == "1.2.0"

        inactive = drafts.set_live(db, _user(ADMIN), 1, uuid, None)
        assert inactive["live_version"] is None and inactive["moved"] is None
        with pytest.raises(HTTPException) as refused:
            assignments.assign(db, _user(ADMIN), 1, uuid, GoalAssignmentRequest(usergroup_id=1, collaborators=[AssignmentCollaborator(user_id=ADMIN)]))
        assert refused.value.status_code == 409 and refused.value.detail == "This plan has no live version"
        assert "Old step" in _titles(db, goal)  # assignments keep running the version they're on


def test_only_admins_who_build_plans_change_drafts_or_the_live_version():
    with _session() as db:
        uuid, _ = _assigned(db)
        for call in (lambda: drafts.start_draft(db, _user(LEARNER), 1, uuid, "2.0.0"), lambda: drafts.set_live(db, _user(LEARNER), 1, uuid, None)):
            with pytest.raises(HTTPException) as refused:
                call()
            assert refused.value.status_code == 403
