import html

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.planning import (
    PlanCollaboratorUpdate,
    PlanCreate,
    PlanInvitationCreate,
    PlanInvitationResponse,
    PlanObjectiveCreate,
    PlanObjectiveProgressUpdate,
    PlanOwnershipTransfer,
    PlanPhaseCreate,
    PlanRoleCreate,
    PlanStatus,
    PlanUpdate,
)
from src.db.programs import ProgramAssignmentCreate, ProgramCreate, ProgramUpdate
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.security.features_utils.plan_check import get_org_plan
from src.security.features_utils.plans import plan_meets_requirement
from src.services import planning as service
from src.services import programs as template_service
from src.services.email.utils import get_base_url_from_request, send_email


router = APIRouter()


def _require_managed_plans(org_id: int, db: Session) -> None:
    if not plan_meets_requirement(get_org_plan(org_id, db), "full"):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Managed plan templates require a Full plan or higher")


@router.get("/feed")
def api_feed(
    scope: str = Query(default="all", pattern="^(all|mine|helping)$"),
    plan_uuid: str | None = None,
    db: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.feed(db, current_user, scope, plan_uuid)


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


@router.post("/plans/{identifier}/objectives")
def api_create_objective(identifier: str, payload: PlanObjectiveCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.create_objective(db, current_user, identifier, payload)


@router.patch("/plans/{identifier}/objectives/{objective_uuid}/progress")
def api_update_progress(identifier: str, objective_uuid: str, payload: PlanObjectiveProgressUpdate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.update_objective_progress(db, current_user, identifier, objective_uuid, payload)


@router.post("/plans/{identifier}/roles")
def api_create_role(identifier: str, payload: PlanRoleCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.create_role(db, current_user, identifier, payload)


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
        f"<h1>You're invited to a plan</h1><p>You have been invited to <strong>{safe_plan}</strong> as {html.escape(result['role'])}.</p><p><a href=\"{html.escape(base_url)}/plans\">Open Plans</a></p>",
    )
    return result


@router.patch("/plans/{identifier}/collaborators/{collaborator_uuid}")
def api_update_collaborator(identifier: str, collaborator_uuid: str, payload: PlanCollaboratorUpdate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.update_collaborator(db, current_user, identifier, collaborator_uuid, payload)


@router.delete("/plans/{identifier}/collaborators/{collaborator_uuid}")
def api_remove_collaborator(identifier: str, collaborator_uuid: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.remove_collaborator(db, current_user, identifier, collaborator_uuid)


@router.post("/plans/{identifier}/transfer-ownership")
def api_transfer_ownership(identifier: str, payload: PlanOwnershipTransfer, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.transfer_ownership(db, current_user, identifier, payload)


@router.get("/invitations/me")
def api_my_invitations(db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.list_my_invitations(db, current_user)


@router.post("/invitations/{invitation_uuid}/respond")
def api_respond(invitation_uuid: str, payload: PlanInvitationResponse, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return service.respond_to_invitation(db, current_user, invitation_uuid, payload.accept)


# Existing Program rows are retained as the storage backing for organization plan templates.
@router.get("/templates")
def api_list_templates(org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    _require_managed_plans(org_id, db)
    return template_service.list_programs(db, current_user, org_id)


@router.post("/templates")
def api_create_template(payload: ProgramCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    _require_managed_plans(payload.org_id, db)
    return template_service.create_program(db, current_user, payload)


@router.get("/templates/{template_uuid}")
def api_get_template(template_uuid: str, org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    _require_managed_plans(org_id, db)
    return template_service.get_program(db, current_user, org_id, template_uuid)


@router.patch("/templates/{template_uuid}")
def api_update_template(template_uuid: str, org_id: int, payload: ProgramUpdate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    _require_managed_plans(org_id, db)
    return template_service.update_program(db, current_user, org_id, template_uuid, payload)


@router.post("/templates/{template_uuid}/assignment-batches")
def api_assign_template(template_uuid: str, org_id: int, payload: ProgramAssignmentCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    _require_managed_plans(org_id, db)
    return template_service.assign_program(db, current_user, org_id, template_uuid, payload)
