"""Staff-side plan routes: the review inbox, and a learner's requirement status."""

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.planning import InboxConfirm, InboxDecision, MakeupStepCreate, RequirementCredit, StaffNoteCreate
from src.db.users import PublicUser
from src.db.requirement_exports import RequirementEvidenceExport
from src.security.auth import get_current_user
from src.services import plan_admin as admin_service
from src.services import plan_learners as learner_service
from src.services import requirement_evidence

router = APIRouter()


@router.post("/requirements/evidence-export")
def api_requirement_evidence_export(org_id: int, payload: RequirementEvidenceExport, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    content = requirement_evidence.evidence_csv(db, current_user, org_id, payload)
    return Response(content, media_type="text/csv", headers={
        "Content-Disposition": 'attachment; filename="requirement-evidence.csv"',
        "Cache-Control": "no-store",
    })


@router.get("/inbox")
def api_inbox(org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return admin_service.inbox(db, current_user, org_id)


@router.get("/inbox/queue")
def api_inbox_queue(
    org_id: int, assignment_uuid: str, objective_uuid: str | None = None, plan_objective_uuid: str | None = None,
    db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user),
):
    return admin_service.review_queue(db, current_user, org_id, assignment_uuid, objective_uuid, plan_objective_uuid)


@router.post("/inbox/decide")
def api_inbox_decide(org_id: int, payload: InboxDecision, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return admin_service.decide(db, current_user, org_id, payload.plan_objective_uuid, payload.action, payload.message)


@router.post("/inbox/confirm")
def api_inbox_confirm(org_id: int, payload: InboxConfirm, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return admin_service.confirm_many(db, current_user, org_id, payload.plan_objective_uuids, payload.message)


@router.post("/inbox/staff-notes")
def api_inbox_staff_note(org_id: int, payload: StaffNoteCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return admin_service.add_staff_note(db, current_user, org_id, payload.plan_objective_uuid, payload.message)


@router.get("/managed-users/{user_id}/requirements")
def api_learner_requirements(user_id: int, org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return learner_service.learner_requirements(db, current_user, org_id, user_id)


@router.get("/managed-users/{user_id}/makeup-options")
def api_learner_makeup_options(user_id: int, org_id: int, node_uuid: str, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return learner_service.makeup_options(db, current_user, org_id, user_id, node_uuid)


@router.post("/managed-users/{user_id}/makeup")
def api_learner_makeup(user_id: int, org_id: int, payload: MakeupStepCreate, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return learner_service.add_makeup_step(db, current_user, org_id, user_id, payload.plan_uuid, payload.node_uuid, payload.objective_uuid, payload.title, payload.due_date)


@router.post("/managed-users/{user_id}/requirements/credit")
def api_learner_credit(user_id: int, org_id: int, payload: RequirementCredit, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return learner_service.credit_requirement(db, current_user, org_id, user_id, payload.enrollment_uuid, payload.node_uuid, payload.note)


@router.get("/requirements/{framework_uuid}/coverage")
def api_requirement_coverage(framework_uuid: str, org_id: int, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return learner_service.coverage(db, current_user, org_id, framework_uuid)


@router.get("/groups/{usergroup_id}/requirements")
def api_group_requirements(usergroup_id: int, org_id: int, framework_uuid: str | None = None, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_current_user)):
    return learner_service.group_requirements(db, current_user, org_id, usergroup_id, framework_uuid)
