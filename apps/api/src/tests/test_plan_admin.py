import pytest
from fastapi import HTTPException
from sqlmodel import Session, create_engine, select

from src.db.planning import Plan, PlanObjective, PlanObjectiveProgress, PlanObjectiveProgressUpdate
from src.db.programs import ObjectiveCreate, ObjectiveProgressStatus, ProgramAssignmentCreate, ProgramCreate, ProgramObjectiveUpdate, ProgramParticipant
from src.db.requirements import (
    ProgramObjectiveRequirement,
    RequirementAssignmentBatch,
    RequirementAssignmentCreate,
    RequirementAttainmentSource,
    RequirementEnrollment,
    RequirementFramework,
    RequirementFrameworkCreate,
    RequirementFrameworkVersion,
    RequirementNode,
    RequirementNodeInput,
)
from src.db.usergroup_user import UserGroupUser
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services import plan_admin, plan_learners, planning, requirements
from src.services.programs import add_program_objective, assign_program, assignment_matrix, create_program, get_program, respond_to_invitation, update_program_objective, update_progress
from src.tests.test_programs import NOW, _setup, _tables


def _learner(user_id: int) -> PublicUser:
    return PublicUser(id=user_id, user_uuid=f"user_{user_id}", username=f"learner{user_id}", email=f"learner{user_id}@example.com", first_name="L", last_name=str(user_id))


@pytest.fixture
def world():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    _tables(engine)
    for model in (RequirementFramework, RequirementFrameworkVersion, RequirementNode, ProgramObjectiveRequirement, RequirementAssignmentBatch, RequirementEnrollment, RequirementAttainmentSource):
        model.__table__.create(engine, checkfirst=True)
    with Session(engine) as session:
        admin = _setup(session)
        session.add(User(id=3, user_uuid="user_3", username="learner3", email="learner3@example.com", first_name="Sam", last_name="Ortiz", creation_date=NOW, update_date=NOW))
        session.add(UserGroupUser(usergroup_id=1, user_id=3, org_id=1, creation_date=NOW, update_date=NOW))
        session.add(UserOrganization(user_id=3, org_id=1, role_id=4, creation_date=NOW, update_date=NOW))
        session.commit()
        framework = requirements.create_framework(session, admin, RequirementFrameworkCreate(org_id=1, name="Career Ready", nodes=[
            RequirementNodeInput(node_uuid="new-a", title="Experiences"),
            RequirementNodeInput(node_uuid="new-a1", parent_node_uuid="new-a", title="Resume"),
            RequirementNodeInput(node_uuid="new-a2", parent_node_uuid="new-a", title="Workplace experience"),
        ]))
        requirements.publish_framework(session, admin, 1, framework["framework_uuid"])
        nodes = {node["title"]: node["node_uuid"] for node in requirements.get_framework(session, admin, 1, framework["framework_uuid"])["nodes"]}
        template = create_program(session, admin, ProgramCreate(org_id=1, name="Career Ready, senior year"))
        template = add_program_objective(session, admin, 1, template["program_uuid"], ObjectiveCreate(
            title="Your first resume", reviewer_guidance="One page\nContact details filled in",
            requirement_node_uuids=[nodes["Resume"]],
            custom_fields=[{"field_uuid": "file", "title": "Upload it", "type": "media", "allowed_types": ["document"], "allow_student_upload": True}],
        ))
        template = add_program_objective(session, admin, 1, template["program_uuid"], ObjectiveCreate(title="Career Fair"))
        requirements.assign_framework(session, admin, 1, framework["framework_uuid"], RequirementAssignmentCreate(usergroup_id=1))
        assignment = assign_program(session, admin, 1, template["program_uuid"], ProgramAssignmentCreate(usergroup_id=1, staff_user_ids=[1]))
        for participant in session.exec(select(ProgramParticipant)).all():
            respond_to_invitation(session, _learner(participant.user_id), 1, participant.participant_uuid, True)
        yield session, admin, assignment, template, framework, nodes


def _objective(session: Session, user_id: int, title: str) -> tuple[Plan, PlanObjective]:
    plan = session.exec(select(Plan).where(Plan.subject_user_id == user_id)).one()
    return plan, session.exec(select(PlanObjective).where(PlanObjective.plan_id == plan.id, PlanObjective.title == title)).one()


def _submit(session: Session, user_id: int, title: str, **values) -> str:
    plan, objective = _objective(session, user_id, title)
    planning.update_objective_progress(session, _learner(user_id), plan.plan_uuid, objective.objective_uuid, PlanObjectiveProgressUpdate(status="submitted", note=f"from {user_id}", field_values=values or None))
    return objective.objective_uuid


def test_inbox_groups_submissions_by_step_and_reviews_them_one_after_another(world):
    session, admin, assignment, template, _, nodes = world
    resume = {user: _submit(session, user, "Your first resume", file=[{"url": f"/content/{user}.pdf", "mime_type": "application/pdf"}]) for user in (2, 3)}
    fair = [_submit(session, user, "Career Fair") for user in (2, 3)]

    inbox = plan_admin.inbox(session, admin, 1)
    by_kind = {group["kind"]: group for group in inbox["groups"]}
    assert inbox["counts"] == {"review": 2, "grade": 0, "confirm": 2, "nudge": 0}
    assert by_kind["review"]["objective"]["title"] == "Your first resume" and by_kind["review"]["count"] == 2
    assert by_kind["review"]["group"]["name"] == "Fall Studio" and by_kind["confirm"]["objective"]["title"] == "Career Fair"
    # The learner sees none of it.
    assert plan_admin.inbox(session, _learner(2), 1)["total"] == 0

    queue = plan_admin.review_queue(session, admin, 1, assignment["assignment_uuid"], by_kind["review"]["objective_uuid"])
    assert queue["objective"]["reviewer_guidance"] == "One page\nContact details filled in"
    assert [item["title"] for item in queue["objective"]["requirements"]] == ["Resume"]
    assert [item["user"]["id"] for item in queue["items"]] == [2, 3]
    assert queue["items"][0]["field_values"]["file"][0]["url"] == "/content/2.pdf" and queue["items"][0]["attempt"] == 1

    with pytest.raises(HTTPException) as missing_message:
        plan_admin.decide(session, admin, 1, resume[2], "flag")
    assert missing_message.value.status_code == 422
    assert plan_admin.decide(session, admin, 1, resume[2], "flag", "Add your phone number.")["status"] == "changes_requested"
    assert plan_admin.decide(session, admin, 1, resume[3], "confirm")["status"] == "completed"
    with pytest.raises(HTTPException) as stale:
        plan_admin.decide(session, admin, 1, resume[3], "confirm")
    assert stale.value.status_code == 409

    # Resubmitting counts a second attempt; staff notes stay with staff.
    _submit(session, 2, "Your first resume", file=[{"url": "/content/2b.pdf"}])
    plan_admin.add_staff_note(session, admin, 1, resume[2], "Applying to the parks crew; nudge her to lead with it.")
    item = plan_admin.review_queue(session, admin, 1, assignment["assignment_uuid"], by_kind["review"]["objective_uuid"])["items"][0]
    assert item["attempt"] == 2 and item["staff_notes"][0]["author"]["id"] == 1
    plan, _ = _objective(session, 2, "Your first resume")
    learner_view = planning.get_plan(session, _learner(2), plan.plan_uuid)
    assert "staff_notes" not in str(learner_view) and "parks crew" not in str(learner_view)
    with pytest.raises(HTTPException):
        plan_admin.add_staff_note(session, _learner(2), 1, resume[2], "sneaky")

    confirmed = plan_admin.confirm_many(session, admin, 1, [*fair, "plan_objective_missing"], "Attended")
    assert confirmed == {"confirmed": fair, "skipped": ["plan_objective_missing"]}
    assert plan_admin.inbox(session, admin, 1)["counts"] == {"review": 1, "grade": 0, "confirm": 0, "nudge": 0}


def test_guidance_flows_from_template_to_live_plan_and_excused_cells(world):
    session, admin, assignment, template, _, _ = world
    resume = next(item for item in get_program(session, admin, 1, template["program_uuid"])["objectives"] if item["title"] == "Your first resume")
    assert resume["reviewer_guidance"] == "One page\nContact details filled in"
    update_program_objective(session, admin, 1, template["program_uuid"], resume["objective_uuid"], ProgramObjectiveUpdate(
        title="Your first resume", default_start_rule="any_time", default_due_rule="phase_end", reviewer_guidance="One page",
    ))
    assert next(item for item in get_program(session, admin, 1, template["program_uuid"])["objectives"] if item["title"] == "Your first resume")["reviewer_guidance"] == "One page"
    _, live = _objective(session, 2, "Your first resume")
    assert live.reviewer_guidance == "One page\nContact details filled in"  # the live plan keeps what it was created with

    fair = next(item for item in get_program(session, admin, 1, template["program_uuid"])["objectives"] if item["title"] == "Career Fair")
    update_progress(session, admin, 1, fair["objective_uuid"], [2], ObjectiveProgressStatus.CANCELED, "Out sick", None, None)
    matrix = assignment_matrix(session, admin, 1, assignment["assignment_uuid"])
    learner = next(item for item in matrix["learners"] if item["id"] == 2)
    assert learner["cells"][fair["objective_uuid"]]["status"] == "canceled"


def test_learner_requirements_show_gaps_and_staff_can_plan_a_makeup_or_credit_it(world):
    session, admin, _, template, framework, nodes = world
    status = plan_learners.learner_requirements(session, admin, 1, 2)
    career = status["frameworks"][0]
    states = {node["title"]: node["state"] for node in career["nodes"]}
    assert states == {"Experiences": None, "Resume": "planned", "Workplace experience": "gap"}
    assert (career["met"], career["total"], career["gaps"]) == (0, 2, 1)

    coverage = plan_learners.coverage(session, admin, 1, framework["framework_uuid"])
    covered = {node["title"]: [item["title"] for item in node["covered_by"]] for node in coverage["nodes"]}
    assert covered == {"Experiences": [], "Resume": ["Your first resume"], "Workplace experience": []}
    assert coverage["templates"] == [{"program_uuid": template["program_uuid"], "name": "Career Ready, senior year", "mapped": True}]

    options = plan_learners.makeup_options(session, admin, 1, 2, nodes["Resume"])
    assert [item["title"] for item in options] == ["Your first resume"]
    plan_uuid = status["plans"][0]["plan_uuid"]
    added = plan_learners.add_makeup_step(session, admin, 1, 2, plan_uuid, nodes["Workplace experience"], title="Job shadow")
    live = session.exec(select(PlanObjective).where(PlanObjective.objective_uuid == added["plan_objective_uuid"])).one()
    assert live.requirement_mappings[0]["node_uuid"] == nodes["Workplace experience"]
    assert session.exec(select(PlanObjectiveProgress).where(PlanObjectiveProgress.plan_objective_id == live.id)).one()
    assert {node["title"]: node["state"] for node in plan_learners.learner_requirements(session, admin, 1, 2)["frameworks"][0]["nodes"]}["Workplace experience"] == "planned"
    # Only learner 2 got the step.
    assert session.exec(select(PlanObjective).where(PlanObjective.title == "Job shadow")).all() == [live]

    with pytest.raises(HTTPException) as no_reason:
        plan_learners.credit_requirement(session, admin, 1, 2, career["enrollment_uuid"], nodes["Workplace experience"], " ")
    assert no_reason.value.status_code == 422
    with pytest.raises(HTTPException) as parent:
        plan_learners.credit_requirement(session, admin, 1, 2, career["enrollment_uuid"], nodes["Experiences"], "Whole category")
    assert parent.value.status_code == 422
    plan_learners.credit_requirement(session, admin, 1, 2, career["enrollment_uuid"], nodes["Workplace experience"], "Worked at the family restaurant all summer.")
    after = plan_learners.learner_requirements(session, admin, 1, 2)["frameworks"][0]
    credited = next(node for node in after["nodes"] if node["title"] == "Workplace experience")
    assert credited["state"] == "met" and credited["sources"][0]["kind"] == "staff_credit" and credited["sources"][0]["verified_by"]["id"] == 1

    with pytest.raises(HTTPException) as outsider:
        plan_learners.learner_requirements(session, _learner(3), 1, 2)
    assert outsider.value.status_code == 403


def test_staff_work_on_assigned_plans_from_admin_not_their_own_app(world):
    session, admin, _, _, _, _ = world
    _submit(session, 2, "Your first resume", file=[{"url": "/content/2.pdf"}])
    assert planning.list_plans(session, admin) == []
    feed = planning.feed(session, admin)
    assert feed["has_helping"] is False and feed["coming_up"] == []
    # The learner still sees their own plan, and the admin inbox still has the work.
    assert [plan["name"] for plan in planning.list_plans(session, _learner(2))] == ["Career Ready, senior year"]
    assert plan_admin.inbox(session, admin, 1)["counts"]["review"] == 1
