import pytest
from fastapi import HTTPException
from sqlalchemy import event
from sqlmodel import select

from src.db.goal_admin import StepProgressBulk
from src.db.goals import GoalAssignmentCreate, GoalTemplateVersion, StepCreate, StepStatus, StepSubmission
from src.db.requirements import RequirementFramework, RequirementFrameworkVersion, RequirementNode
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import User
from src.services.goals import access, assignments, goals, plan_cards, staff_views, structure, templates
from src.services.goals.sharing_roles import _role
from src.tests.test_goal_review import _assigned, _goal
from src.tests.test_goals import ADMIN, LEARNER, NOW, OTHER, _session, _status, _step, _user

ESSAY = {"key": "essay", "type": "write", "title": "Essay", "review_required": True, "reviewer_guidance": "Look for a thesis", "config": {"prompt": "Why?"},
         "staff_guide": "Period 4: model a thesis, then 20 minutes drafting", "staff_materials": [{"kind": "link", "title": "Lesson packet", "url": "https://example.com/packet.pdf"}]}
FAIR = {"key": "fair", "type": "task", "title": "Career Fair", "completed_by": "staff"}


def _submit_essay(db, user_id: int) -> str:
    goal = _goal(db, user_id)
    essay = _step(goals.get_goal(db, _user(user_id), goal.goal_uuid), "Essay")
    goals.save_submission(db, _user(user_id), goal.goal_uuid, essay["step_uuid"], StepSubmission(submission={"text": "Draft"}))
    _status(db, user_id, goal, essay, StepStatus.COMPLETED)
    return essay["step_uuid"]


def test_assignments_list_and_matrix_show_each_learner_by_template_step():
    with _session() as db:
        assignment = _assigned(db, ESSAY, FAIR)
        _submit_essay(db, LEARNER)
        listed = staff_views.list_assignments(db, _user(ADMIN), 1)
        assert [item["assignment_uuid"] for item in listed] == [assignment["assignment_uuid"]]
        summary = listed[0]
        assert summary["learner_count"] == 2 and summary["step_count"] == 2 and summary["review_count"] == 1
        assert summary["lifecycle_counts"]["active"] == 2 and summary["cohort"]["name"] == "Fall"
        # Learners don't staff it.
        assert staff_views.list_assignments(db, _user(LEARNER), 1) == []

        goal = _goal(db, OTHER)
        structure.add_step(db, _user(ADMIN), goal.goal_uuid, StepCreate(stage_uuid=goals.get_goal(db, _user(ADMIN), goal.goal_uuid)["stages"][0]["stage_uuid"], type="task", title="Extra"))
        matrix = staff_views.assignment_matrix(db, _user(ADMIN), 1, assignment["assignment_uuid"])
        assert [step["template_key"] for stage in matrix["stages"] for step in stage["steps"]] == ["essay", "fair"]
        essay_column = matrix["stages"][0]["steps"][0]
        assert essay_column["aggregate"]["review_count"] == 1 and essay_column["aggregate"]["learner_count"] == 2
        rows = {row["id"]: row for row in matrix["learners"]}
        assert rows[LEARNER]["cells"]["essay"]["status"] == "submitted" and rows[LEARNER]["cells"]["fair"]["locked"] is False
        assert rows[LEARNER]["goal_uuid"] == _goal(db, LEARNER).goal_uuid and rows[LEARNER]["custom_steps"] == []
        assert [item["title"] for item in rows[OTHER]["custom_steps"]] == ["Extra"]
        # What staff prepare from, and who else is on each learner's plan.
        assert essay_column["reviewer_guidance"] == "Look for a thesis" and essay_column["config"] == {"prompt": "Why?"} and essay_column["materials"] == []
        assert rows[LEARNER]["people"] == []
        access.add_member(db, _goal(db, LEARNER), OTHER, _role(db, _goal(db, LEARNER), "commenter"))
        db.commit()
        rows = {row["id"]: row for row in staff_views.assignment_matrix(db, _user(ADMIN), 1, assignment["assignment_uuid"])["learners"]}
        assert [(person["id"], person["role"]) for person in rows[LEARNER]["people"]] == [(OTHER, "Commenter")] and rows[OTHER]["people"] == []
        assert essay_column["staff_guide"].startswith("Period 4") and essay_column["staff_materials"] == [{"kind": "link", "title": "Lesson packet", "url": "https://example.com/packet.pdf"}]
        # Rows follow goal access: a learner sees only their own, and none of the staff side of a step.
        own = staff_views.assignment_matrix(db, _user(LEARNER), 1, assignment["assignment_uuid"])
        assert [row["id"] for row in own["learners"]] == [LEARNER]
        own_essay = own["stages"][0]["steps"][0]
        assert own_essay["staff_guide"] == "" and own_essay["staff_materials"] == [] and own_essay["reviewer_guidance"] == ""
        assert "Period 4" not in str(goals.get_goal(db, _user(LEARNER), _goal(db, LEARNER).goal_uuid))


def test_bulk_progress_sets_a_template_step_for_many_learners_through_completion():
    with _session() as db:
        assignment = _assigned(db, ESSAY, FAIR)
        done = staff_views.update_progress(db, _user(ADMIN), 1, StepProgressBulk(template_key="fair", user_ids=[LEARNER, OTHER], staff_note="Attended"))
        assert [item["status"] for item in done] == ["completed", "completed"]
        excused = staff_views.update_progress(db, _user(ADMIN), 1, StepProgressBulk(
            template_key="essay", assignment_uuid=assignment["assignment_uuid"], goal_uuids=[_goal(db, LEARNER).goal_uuid], status=StepStatus.EXCUSED, staff_note="Out sick",
        ))
        assert excused[0]["status"] == "excused"
        matrix = staff_views.assignment_matrix(db, _user(ADMIN), 1, assignment["assignment_uuid"])
        cells = {row["id"]: row["cells"] for row in matrix["learners"]}
        assert cells[LEARNER]["essay"]["status"] == "excused" and cells[LEARNER]["fair"]["completion_method"] == "staff"
        # Excused + completed: the learner's goal is finished.
        assert goals.get_goal(db, _user(LEARNER), _goal(db, LEARNER).goal_uuid)["status"] == "finished"

        # Sending back what was never submitted is skipped, not an error.
        skipped = staff_views.update_progress(db, _user(ADMIN), 1, StepProgressBulk(template_key="essay", user_ids=[OTHER], status=StepStatus.CHANGES_REQUESTED, staff_note="?"))
        assert skipped[0]["status"] == "skipped"
        with pytest.raises(HTTPException) as not_staff:
            staff_views.update_progress(db, _user(LEARNER), 1, StepProgressBulk(template_key="fair", user_ids=[OTHER]))
        assert not_staff.value.status_code == 403
        with pytest.raises(HTTPException) as unknown:
            staff_views.update_progress(db, _user(ADMIN), 1, StepProgressBulk(template_key="nope", user_ids=[OTHER]))
        assert unknown.value.status_code == 404


def test_reviews_cohorts_and_managed_learners():
    with _session() as db:
        assignment = _assigned(db, ESSAY, FAIR)
        essay = _submit_essay(db, LEARNER)
        reviews = staff_views.assignment_reviews(db, _user(ADMIN), 1, assignment["assignment_uuid"])
        assert [item["step_uuid"] for item in reviews["step_reviews"]] == [essay] and reviews["activity_reviews"] == []
        assert reviews["step_reviews"][0]["submission"] == {"text": "Draft"} and reviews["step_reviews"][0]["step"]["title"] == "Essay"
        assert staff_views.assignment_reviews(db, _user(OTHER), 1, assignment["assignment_uuid"])["step_reviews"] == []

        goal_uuid = _goal(db, LEARNER).goal_uuid
        assert [item["step_uuid"] for item in staff_views.goal_reviews(db, _user(ADMIN), 1, goal_uuid)["step_reviews"]] == [essay]
        with pytest.raises(HTTPException):
            staff_views.goal_reviews(db, _user(LEARNER), 1, goal_uuid)

        cohort = staff_views.cohort(db, _user(ADMIN), 1, 1)
        assert cohort["learner_count"] == 2 and [item["assignment_uuid"] for item in cohort["assignments"]] == [assignment["assignment_uuid"]]
        assert cohort["completed_assignments"] == []
        with pytest.raises(HTTPException):
            staff_views.cohort(db, _user(LEARNER), 1, 1)

        managed = staff_views.managed_user(db, _user(ADMIN), 1, LEARNER)
        assert managed["user"]["id"] == LEARNER and managed["assignments"][0]["goal"]["goal_uuid"] == goal_uuid
        assert managed["goals"][0]["progress"] == {"done": 0, "total": 2, "percent": 0}
        assert managed["goals"][0]["people"] == []
        outsider = staff_views.managed_user(db, _user(OTHER), 1, LEARNER)
        assert outsider["assignments"] == [] and outsider["goals"] == []

        # Goal cards show who helps, with their role.
        goal = _goal(db, LEARNER)
        access.add_member(db, goal, OTHER, _role(db, goal, "commenter"))
        db.commit()
        helpers = staff_views.managed_user(db, _user(ADMIN), 1, LEARNER)["goals"][0]["people"]
        assert [(item["id"], item["role"]) for item in helpers] == [(OTHER, "Commenter")]


# Plans › Assignments ---------------------------------------------------------------------

TEACHER = 4


def _plans_world(db) -> None:
    """Tables the plan stack reads, a teacher (staff, not admin) and a framework with two requirements."""
    for model in (RequirementFramework, RequirementFrameworkVersion, RequirementNode):
        model.__table__.create(db.get_bind(), checkfirst=True)
    db.add(Role(id=5, role_uuid="role_teacher", name="Teacher", rights={"dashboard": {"action_access": True}, "learning_activities": {"action_update": True}}))
    db.add(User(id=TEACHER, user_uuid="user_4", username="tina", email="tina@example.com", first_name="Tina", last_name="Teach", creation_date=NOW, update_date=NOW))
    db.add(UserOrganization(user_id=TEACHER, org_id=1, role_id=5, creation_date=NOW, update_date=NOW))
    db.add(RequirementFramework(id=1, framework_uuid="framework_1", org_id=1, name="Readiness", creation_date=NOW, update_date=NOW))
    db.add(RequirementFrameworkVersion(id=1, version_uuid="fv_1", framework_id=1, version_number=1, creation_date=NOW, update_date=NOW))
    for node in ("node_essay", "node_fair"):
        db.add(RequirementNode(node_version_uuid=f"nv_{node}", node_uuid=node, version_id=1, title=node, creation_date=NOW, update_date=NOW))
    db.commit()


def _spare(db) -> str:
    created = templates.create_template(db, _user(ADMIN), 1, {"template": {"title": "Spare plan"}, "stages": [
        {"key": "one", "title": "One", "steps": [dict(FAIR)]}, {"key": "two", "title": "Two", "steps": [dict(FAIR, key="fair2")]}]})
    templates.publish(db, _user(ADMIN), 1, created["template_uuid"], "First")
    return created["template_uuid"]


def _count_queries(db, run) -> int:
    seen: list[str] = []
    listener = lambda *args: seen.append(args[2])  # noqa: E731
    event.listen(db.get_bind(), "before_cursor_execute", listener)
    try:
        run()
    finally:
        event.remove(db.get_bind(), "before_cursor_execute", listener)
    return len(seen)


def test_plans_stack_one_card_per_template_with_its_assignments_progress_and_requirements():
    with _session() as db:
        _plans_world(db)
        assignment = _assigned(db, ESSAY, FAIR)
        # The template's steps count toward both requirements of one framework.
        version = db.exec(select(GoalTemplateVersion)).one()
        document = dict(version.document)
        document["stages"] = [{**stage, "steps": [{**step, "requirement_node_uuids": [f"node_{step['key']}"]} for step in stage["steps"]]} for stage in document["stages"]]
        version.document = document
        db.add(version)
        db.commit()
        _submit_essay(db, LEARNER)
        staff_views.update_progress(db, _user(ADMIN), 1, StepProgressBulk(template_key="fair", user_ids=[LEARNER]))
        spare = _spare(db)
        ended = assignments.assign(db, _user(ADMIN), 1, spare, GoalAssignmentCreate(user_id=OTHER, staff_user_ids=[TEACHER]))
        assignments.end(db, _user(ADMIN), 1, ended["assignment_uuid"])

        stack = plan_cards.list_plans(db, _user(ADMIN), 1)
        # Plans with current assignments first, then the rest; every plan admins can hand out is there.
        assert [plan["template"]["title"] for plan in stack["plans"]] == ["College ready", "Spare plan"]
        card, spare_card = stack["plans"]
        assert card["template"] == {"template_uuid": card["template"]["template_uuid"], "title": "College ready", "status": "active", "version": 1,
                                    "stage_count": 1, "step_count": 2, "owner_org": {"id": 1, "name": "Studio", "slug": "studio"},
                                    "own": True, "run_with_permission": False}
        assert card["frameworks"] == [{"framework_uuid": "framework_1", "name": "Readiness", "org_id": 1, "node_count": 2}]
        assert card["badge"] is None and card["authorized_orgs"] == []
        row = card["assignments"][0]
        assert [item["assignment_uuid"] for item in card["assignments"]] == [assignment["assignment_uuid"]]
        # Progress, counted in one grouped query: Lee finished the fair (1 of 2), Sam nothing.
        assert row["progress_percent"] == 25 and row["min_progress_percent"] == 0 and row["max_progress_percent"] == 50
        assert row["review_count"] == 1 and row["learner_count"] == 2 and sorted(row["learner_ids"]) == [LEARNER, OTHER]
        assert row["cohort"]["name"] == "Fall" and [person["id"] for person in row["staff"]] == [ADMIN]
        assert row["update_available"] is False and row["badge"] is None and row["version_uuid"] == version.version_uuid
        # Ended assignments stay on their plan, for "Show them".
        assert [(item["assignment_uuid"], item["status"]) for item in spare_card["assignments"]] == [(ended["assignment_uuid"], "ended")]
        assert spare_card["template"]["stage_count"] == 2 and spare_card["frameworks"] == []
        assert {person["id"] for person in stack["learners"]} == {LEARNER, OTHER}

        # Staff see only the plans they staff; learners can't open the stack.
        teacher = plan_cards.list_plans(db, _user(TEACHER), 1)
        assert [plan["template"]["title"] for plan in teacher["plans"]] == ["Spare plan"] and [person["id"] for person in teacher["learners"]] == [OTHER]
        with pytest.raises(HTTPException) as denied:
            plan_cards.list_plans(db, _user(LEARNER), 1)
        assert denied.value.status_code == 403

        # More assignments don't mean more queries.
        before = _count_queries(db, lambda: plan_cards.list_plans(db, _user(ADMIN), 1))
        assignments.assign(db, _user(ADMIN), 1, spare, GoalAssignmentCreate(user_id=LEARNER, staff_user_ids=[TEACHER]))
        assert _count_queries(db, lambda: plan_cards.list_plans(db, _user(ADMIN), 1)) == before


def test_plans_show_templates_run_with_permission_and_their_creator_sees_counts_only():
    from src.tests.plan_world import PARTNER, _assign, _world

    db, (first, second) = _world()
    with db:
        for model in (RequirementFramework, RequirementFrameworkVersion, RequirementNode):
            model.__table__.create(db.get_bind(), checkfirst=True)
        _assign(db, PARTNER, first.template_uuid)

        partner = {plan["template"]["template_uuid"]: plan for plan in plan_cards.list_plans(db, _user(ADMIN), PARTNER)["plans"]}
        assert set(partner) == {first.template_uuid, second.template_uuid}
        card = partner[first.template_uuid]
        assert card["template"]["own"] is False and card["template"]["run_with_permission"] is True and card["template"]["owner_org"]["name"] == "Studio"
        assert card["badge"]["name"] == "Adaptability" and card["authorized_orgs"] == []
        assert [row["badge"]["name"] for row in card["assignments"]] == ["Adaptability"]

        # The creator sees who runs its plan and how many learners, never their assignments or learners.
        creator = plan_cards.list_plans(db, _user(ADMIN), 1)
        own = next(plan for plan in creator["plans"] if plan["template"]["template_uuid"] == first.template_uuid)
        assert own["assignments"] == [] and own["badge"]["name"] == "Adaptability"
        assert [(item["org"]["name"], item["assignment_count"], item["learner_count"]) for item in own["authorized_orgs"]] == [("Partner", 1, 1)]
        assert creator["learners"] == []


def test_staff_materials_are_web_links_kept_to_what_the_app_reads():
    from src.services.goals.document import empty_document, validate_document

    with _session() as db:
        document = empty_document("Lessons")
        document["stages"] = [{"title": "One", "steps": [{**FAIR, "staff_materials": [{"kind": "file", "title": "Packet", "url": "https://files.example.com/p.pdf", "asset_uuid": "asset_1", "extra": "x"}]}]}]
        step = validate_document(db, document, 1)["stages"][0]["steps"][0]
        assert step["staff_guide"] == "" and step["staff_materials"] == [{"kind": "file", "url": "https://files.example.com/p.pdf", "title": "Packet", "asset_uuid": "asset_1"}]
        document["stages"][0]["steps"][0]["staff_materials"] = [{"kind": "link", "title": "Bad", "url": "javascript:alert(1)"}]
        with pytest.raises(HTTPException):
            validate_document(db, document, 1)
