import html
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from sqlmodel import Session, select

from src.core.events.database import get_db_session
from src.db.planning import (
    PlanAttachmentCreate,
    PlanCollaboratorUpdate,
    PlanCollaboratorRequestCreate,
    PlanCollaboratorRequestResponse,
    PlanCommentCreate,
    PlanCreate,
    PlanInvitationCreate,
    PlanInvitationResponse,
    PlanObjectiveCreate,
    PlanObjectiveUpdate,
    PlanObjectiveProgressUpdate,
    PlanOwnershipTransfer,
    PlanPhaseCreate,
    PlanPhaseUpdate,
    PlanRoleCreate,
    PlanRoleUpdate,
    PlanStatus,
    PlanUpdate,
    OrganizationPlanRoleCreate,
    OrganizationPlanRoleUpdate,
)
from src.db.programs import ProgramAssignment, ProgramAssignmentCreate, ProgramCreate, ProgramUpdate
from src.db.programs import (
    ObjectiveCreate,
    ObjectiveProgressUpdate,
    ObjectiveReviewDecision,
    ProgramAssignmentObjectiveUpdate,
    ProgramObjectiveScheduleUpdate,
    ProgramObjectiveUpdate,
    ProgramPhaseCreate,
    ProgramPhaseUpdate,
    ProgramReorder,
)
from src.db.programs import Objective, Program, ProgramObjective
from src.db.requirements import (
    RequirementAssignmentCreate,
    RequirementEnrollmentMigrate,
    RequirementFrameworkCreate,
    RequirementFrameworkUpdate,
    RequirementMappingUpdate,
)
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.security.features_utils.plan_check import get_org_plan
from src.security.features_utils.plans import plan_meets_requirement
from src.services import planning as service
from src.services import programs as template_service
from src.services import requirements as requirement_service
from src.services.email.utils import get_base_url_from_request, send_email


router = APIRouter()


def _require_managed_plans(org_id: int, db: Session) -> None:
    if not plan_meets_requirement(get_org_plan(org_id, db), "full"):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Group plan assignments require a Full plan or higher")


def _require_managed_assignment(org_id: int, assignment_uuid: str, db: Session) -> None:
    if plan_meets_requirement(get_org_plan(org_id, db), "full"):
        return
    assignment = db.exec(select(ProgramAssignment).where(
        ProgramAssignment.org_id == org_id,
        ProgramAssignment.assignment_uuid == assignment_uuid,
    )).first()
    if assignment and assignment.usergroup_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Group plan assignments require a Full plan or higher")


@router.get("/feed")
def api_feed(
    scope: str = Query(default="all", pattern="^(all|mine|helping)$"),
    plan_uuid: str | None = None,
    explore_all: bool = False,
    db: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.feed(db, current_user, scope, plan_uuid, explore_all)


@router.get("/reviews")
def api_reviews(
    db: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.review_queue(db, current_user)


@router.get("/plans")
def api_list_plans(
    lifecycle: str | None = Query(default=None, pattern="^(active|completed|archived|pending)$"),
    db: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.list_plans(db, current_user, lifecycle)


@router.post("/plans")
def api_create_plan(payload: PlanCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.create_plan(db, current_user, payload)


@router.get("/plans/{identifier}")
def api_get_plan(identifier: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.get_plan(db, current_user, identifier)


@router.get("/plans/{identifier}/reviews")
def api_plan_reviews(identifier: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.plan_reviews(db, current_user, identifier)


@router.get("/legacy/{legacy_identifier}")
def api_resolve_legacy_plan(legacy_identifier: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.resolve_legacy_plan(db, current_user, legacy_identifier)


@router.patch("/plans/{identifier}")
def api_update_plan(identifier: str, payload: PlanUpdate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.update_plan(db, current_user, identifier, payload)


@router.delete("/plans/{identifier}")
def api_delete_plan(identifier: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.delete_plan(db, current_user, identifier)


@router.post("/plans/{identifier}/complete")
def api_complete_plan(identifier: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.change_plan_status(db, current_user, identifier, PlanStatus.COMPLETED)


@router.post("/plans/{identifier}/reopen")
def api_reopen_plan(identifier: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.change_plan_status(db, current_user, identifier, PlanStatus.ACTIVE)


@router.post("/plans/{identifier}/archive")
def api_archive_plan(identifier: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.change_plan_status(db, current_user, identifier, PlanStatus.ARCHIVED)


@router.post("/plans/{identifier}/phases")
def api_create_phase(identifier: str, payload: PlanPhaseCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.create_phase(db, current_user, identifier, payload)


@router.patch("/plans/{identifier}/phases/{phase_uuid}")
def api_update_phase(identifier: str, phase_uuid: str, payload: PlanPhaseUpdate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.update_phase(db, current_user, identifier, phase_uuid, payload)


@router.delete("/plans/{identifier}/phases/{phase_uuid}")
def api_delete_phase(identifier: str, phase_uuid: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.delete_phase(db, current_user, identifier, phase_uuid)


@router.post("/plans/{identifier}/objectives")
def api_create_objective(identifier: str, payload: PlanObjectiveCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.create_objective(db, current_user, identifier, payload)


@router.patch("/plans/{identifier}/objectives/{objective_uuid}")
def api_update_objective(identifier: str, objective_uuid: str, payload: PlanObjectiveUpdate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.update_objective(db, current_user, identifier, objective_uuid, payload)


@router.delete("/plans/{identifier}/objectives/{objective_uuid}")
def api_delete_objective(identifier: str, objective_uuid: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.delete_objective(db, current_user, identifier, objective_uuid)


@router.patch("/plans/{identifier}/objectives/{objective_uuid}/progress")
def api_update_progress(identifier: str, objective_uuid: str, payload: PlanObjectiveProgressUpdate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.update_objective_progress(db, current_user, identifier, objective_uuid, payload)


@router.post("/plans/{identifier}/roles")
def api_create_role(identifier: str, payload: PlanRoleCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.create_role(db, current_user, identifier, payload)


@router.patch("/plans/{identifier}/roles/{role_uuid}")
def api_update_role(identifier: str, role_uuid: str, payload: PlanRoleUpdate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.update_role(db, current_user, identifier, role_uuid, payload)


@router.delete("/plans/{identifier}/roles/{role_uuid}")
def api_delete_role(identifier: str, role_uuid: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.delete_role(db, current_user, identifier, role_uuid)


@router.post("/plans/{identifier}/organization-roles")
def api_create_organization_role(identifier: str, payload: OrganizationPlanRoleCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.create_organization_role(db, current_user, identifier, payload)


@router.patch("/plans/{identifier}/organization-roles/{role_uuid}")
def api_update_organization_role(identifier: str, role_uuid: str, payload: OrganizationPlanRoleUpdate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.update_organization_role(db, current_user, identifier, role_uuid, payload)


@router.delete("/plans/{identifier}/organization-roles/{role_uuid}")
def api_delete_organization_role(identifier: str, role_uuid: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.delete_organization_role(db, current_user, identifier, role_uuid)


@router.post("/plans/{identifier}/invitations")
def api_create_invitation(
    identifier: str,
    payload: PlanInvitationCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    result = service.create_invitation(db, current_user, identifier, payload)
    base_url = get_base_url_from_request(request)
    safe_plan = html.escape(service.get_plan(db, current_user, identifier)["name"])
    background_tasks.add_task(
        send_email,
        payload.email,
        f"You're invited to {safe_plan}",
        f"<h1>You're invited to a plan</h1><p>You have been invited to <strong>{safe_plan}</strong> as {html.escape(result['role'])}.</p><p><a href=\"{html.escape(base_url)}/signup?next={quote('/plans', safe='')}&invitation={quote(result['invitation_uuid'], safe='')}\">Accept your plan invitation</a></p><p>If you already have an account, sign in with the invited email.</p>",
    )
    return result


@router.get("/plans/{identifier}/collaborator-requests")
def api_list_collaborator_requests(identifier: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.list_collaborator_requests(db, current_user, identifier)


@router.post("/plans/{identifier}/collaborator-requests")
def api_create_collaborator_request(identifier: str, payload: PlanCollaboratorRequestCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.create_collaborator_request(db, current_user, identifier, payload)


@router.post("/plans/{identifier}/collaborator-requests/{request_uuid}/respond")
def api_respond_collaborator_request(identifier: str, request_uuid: str, payload: PlanCollaboratorRequestResponse, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.respond_to_collaborator_request(db, current_user, identifier, request_uuid, payload.approve)


@router.patch("/plans/{identifier}/collaborators/{collaborator_uuid}")
def api_update_collaborator(identifier: str, collaborator_uuid: str, payload: PlanCollaboratorUpdate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.update_collaborator(db, current_user, identifier, collaborator_uuid, payload)


@router.delete("/plans/{identifier}/collaborators/{collaborator_uuid}")
def api_remove_collaborator(identifier: str, collaborator_uuid: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.remove_collaborator(db, current_user, identifier, collaborator_uuid)


@router.post("/plans/{identifier}/leave")
def api_leave_plan(identifier: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.leave_plan(db, current_user, identifier)


@router.post("/plans/{identifier}/transfer-ownership")
def api_transfer_ownership(identifier: str, payload: PlanOwnershipTransfer, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.transfer_ownership(db, current_user, identifier, payload)


@router.get("/plans/{identifier}/activity")
def api_plan_activity(identifier: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.list_activity(db, current_user, identifier)


@router.post("/plans/{identifier}/comments")
def api_add_comment(identifier: str, payload: PlanCommentCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.add_comment(db, current_user, identifier, payload)


@router.get("/plans/{identifier}/attachments")
def api_plan_attachments(identifier: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.list_attachments(db, current_user, identifier)


@router.post("/plans/{identifier}/attachments")
def api_add_attachment(identifier: str, payload: PlanAttachmentCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.add_attachment(db, current_user, identifier, payload)


@router.delete("/plans/{identifier}/attachments/{asset_uuid}")
def api_remove_attachment(identifier: str, asset_uuid: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.remove_attachment(db, current_user, identifier, asset_uuid)


@router.get("/invitations/me")
def api_my_invitations(db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.list_my_invitations(db, current_user)


@router.post("/invitations/{invitation_uuid}/respond")
def api_respond(invitation_uuid: str, payload: PlanInvitationResponse, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.respond_to_invitation(db, current_user, invitation_uuid, payload.accept)


# Existing Program rows are retained as the storage backing for organization plan templates.
@router.get("/templates")
def api_list_templates(org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return template_service.list_programs(db, current_user, org_id)


@router.post("/templates")
def api_create_template(payload: ProgramCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return template_service.create_program(db, current_user, payload)


@router.get("/templates/{template_uuid}")
def api_get_template(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return template_service.get_program(db, current_user, org_id, template_uuid)


@router.patch("/templates/{template_uuid}")
def api_update_template(template_uuid: str, org_id: int, payload: ProgramUpdate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return template_service.update_program(db, current_user, org_id, template_uuid, payload)


@router.post("/templates/{template_uuid}/assignment-batches")
def api_assign_template(template_uuid: str, org_id: int, payload: ProgramAssignmentCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    if payload.usergroup_id:
        _require_managed_plans(org_id, db)
    return template_service.assign_program(db, current_user, org_id, template_uuid, payload)


@router.delete("/templates/{template_uuid}")
def api_delete_template(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return template_service.delete_program(db, current_user, org_id, template_uuid)


@router.get("/template-objectives")
def api_list_template_objectives(org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return template_service.list_objectives(db, current_user, org_id)


@router.post("/templates/{template_uuid}/objectives")
def api_add_template_objective(template_uuid: str, org_id: int, payload: ObjectiveCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return template_service.add_program_objective(db, current_user, org_id, template_uuid, payload)


@router.put("/templates/{template_uuid}/objectives/{objective_uuid}/schedule")
def api_update_template_objective_schedule(template_uuid: str, objective_uuid: str, org_id: int, payload: ProgramObjectiveScheduleUpdate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return template_service.update_program_objective_schedule(db, current_user, org_id, template_uuid, objective_uuid, payload)


@router.put("/templates/{template_uuid}/objectives/{objective_uuid}")
def api_update_template_objective(template_uuid: str, objective_uuid: str, org_id: int, payload: ProgramObjectiveUpdate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return template_service.update_program_objective(db, current_user, org_id, template_uuid, objective_uuid, payload)


@router.post("/templates/{template_uuid}/phases")
def api_create_template_phase(template_uuid: str, org_id: int, payload: ProgramPhaseCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return template_service.create_program_phase(db, current_user, org_id, template_uuid, payload)


@router.put("/templates/{template_uuid}/phases/{phase_uuid}")
def api_update_template_phase(template_uuid: str, phase_uuid: str, org_id: int, payload: ProgramPhaseUpdate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return template_service.update_program_phase(db, current_user, org_id, template_uuid, phase_uuid, payload)


@router.put("/templates/{template_uuid}/order")
def api_reorder_template(template_uuid: str, org_id: int, payload: ProgramReorder, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return template_service.reorder_program(db, current_user, org_id, template_uuid, payload)


@router.post("/templates/{template_uuid}/update-badge-versions")
def api_update_template_badge_versions(template_uuid: str, org_id: int, accept_previous_major_versions: bool = False, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return template_service.update_badge_versions(db, current_user, org_id, template_uuid, accept_previous_major_versions)


@router.get("/cohorts/{usergroup_id}")
def api_planning_cohort(usergroup_id: int, org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    _require_managed_plans(org_id, db)
    return template_service.cohort_overview(db, current_user, org_id, usergroup_id)


@router.get("/assignment-batches")
def api_list_assignment_batches(org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return template_service.list_program_assignments(db, current_user, org_id)


@router.get("/assignment-batches/{assignment_uuid}/matrix")
def api_assignment_batch_matrix(assignment_uuid: str, org_id: int | None = None, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    assignment = db.exec(select(ProgramAssignment).where(
        ProgramAssignment.assignment_uuid == assignment_uuid,
    )).first()
    if not assignment:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Program assignment not found")
    resolved_org_id = int(assignment.org_id)
    if org_id is not None and org_id != resolved_org_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Program assignment not found")
    _require_managed_assignment(resolved_org_id, assignment_uuid, db)
    return template_service.assignment_matrix(db, current_user, resolved_org_id, assignment_uuid)


@router.post("/assignment-batches/{assignment_uuid}/complete")
def api_complete_assignment_batch(assignment_uuid: str, org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    _require_managed_assignment(org_id, assignment_uuid, db)
    return template_service.change_assignment_status(db, current_user, org_id, assignment_uuid, PlanStatus.COMPLETED)


@router.post("/assignment-batches/{assignment_uuid}/reopen")
def api_reopen_assignment_batch(assignment_uuid: str, org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    _require_managed_assignment(org_id, assignment_uuid, db)
    return template_service.change_assignment_status(db, current_user, org_id, assignment_uuid, PlanStatus.ACTIVE)


@router.post("/assignment-batches/{assignment_uuid}/archive")
def api_archive_assignment_batch(assignment_uuid: str, org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    _require_managed_assignment(org_id, assignment_uuid, db)
    return template_service.change_assignment_status(db, current_user, org_id, assignment_uuid, PlanStatus.ARCHIVED)


@router.delete("/assignment-batches/{assignment_uuid}")
def api_delete_assignment_batch(assignment_uuid: str, org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    _require_managed_assignment(org_id, assignment_uuid, db)
    return template_service.delete_assignment(db, current_user, org_id, assignment_uuid)


@router.get("/assignment-batches/{assignment_uuid}/reviews")
def api_assignment_batch_reviews(assignment_uuid: str, org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    _require_managed_assignment(org_id, assignment_uuid, db)
    return template_service.assignment_reviews(db, current_user, org_id, assignment_uuid)


@router.patch("/assignment-batches/{assignment_uuid}/definition/objectives/{objective_uuid}")
def api_update_assignment_objective(assignment_uuid: str, objective_uuid: str, org_id: int, payload: ProgramAssignmentObjectiveUpdate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    _require_managed_assignment(org_id, assignment_uuid, db)
    return template_service.update_assignment_objective(db, current_user, org_id, assignment_uuid, objective_uuid, payload)


@router.post("/assignment-batches/{assignment_uuid}/reviews/objective")
def api_review_assignment_objective(assignment_uuid: str, org_id: int, payload: ObjectiveReviewDecision, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    _require_managed_assignment(org_id, assignment_uuid, db)
    return template_service.review_objective_submission(db, current_user, org_id, assignment_uuid, payload)


@router.post("/assignment-batches/progress")
def api_update_assignment_progress(org_id: int, payload: ObjectiveProgressUpdate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return template_service.update_progress(db, current_user, org_id, payload.objective_uuid, payload.user_ids, payload.status, payload.staff_note, payload.evidence, payload.completion_date, payload.plan_uuids, payload.override_customized, payload.field_values)


@router.get("/managed-users/{user_id}")
def api_managed_user_plans(user_id: int, org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return template_service.user_program_overview(db, current_user, org_id, user_id)


@router.get("/requirements")
def api_list_requirement_frameworks(org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return requirement_service.list_frameworks(db, current_user, org_id)


@router.post("/requirements")
def api_create_requirement_framework(payload: RequirementFrameworkCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return requirement_service.create_framework(db, current_user, payload)


@router.get("/requirements/report")
def api_requirement_report(
    org_id: int, framework_uuid: str | None = None, version: int | None = None, usergroup_id: int | None = None,
    node_uuid: str | None = None, status: str | None = Query(default=None, pattern="^(satisfied|not_satisfied)$"),
    db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user),
):
    return requirement_service.report(db, current_user, org_id, framework_uuid, version, usergroup_id, node_uuid, status)


@router.get("/requirements/{framework_uuid}")
def api_get_requirement_framework(framework_uuid: str, org_id: int, version: int | None = None, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return requirement_service.get_framework(db, current_user, org_id, framework_uuid, version)


@router.patch("/requirements/{framework_uuid}")
def api_update_requirement_framework(framework_uuid: str, org_id: int, payload: RequirementFrameworkUpdate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return requirement_service.update_framework(db, current_user, org_id, framework_uuid, payload)


@router.post("/requirements/{framework_uuid}/publish")
def api_publish_requirement_framework(framework_uuid: str, org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return requirement_service.publish_framework(db, current_user, org_id, framework_uuid)


@router.post("/requirements/{framework_uuid}/assignments")
def api_assign_requirement_framework(framework_uuid: str, org_id: int, payload: RequirementAssignmentCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return requirement_service.assign_framework(db, current_user, org_id, framework_uuid, payload)


@router.post("/requirements/{framework_uuid}/migrate-active")
def api_migrate_requirement_enrollments(framework_uuid: str, org_id: int, payload: RequirementEnrollmentMigrate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return requirement_service.migrate_enrollments(db, current_user, org_id, framework_uuid, payload)


@router.put("/templates/{template_uuid}/objectives/{objective_uuid}/requirements")
def api_update_objective_requirements(
    template_uuid: str, objective_uuid: str, org_id: int, payload: RequirementMappingUpdate,
    db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user),
):
    row = db.exec(select(ProgramObjective).join(Objective, Objective.id == ProgramObjective.objective_id).join(
        Program, Program.id == ProgramObjective.program_id,
    ).where(
        Program.program_uuid == template_uuid, Program.org_id == org_id,
        Objective.objective_uuid == objective_uuid,
    )).first()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Template objective not found")
    mappings = requirement_service.update_mappings(db, current_user, org_id, row, payload.node_uuids)
    db.commit()
    return {"requirement_mappings": mappings}
