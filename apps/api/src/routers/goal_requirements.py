"""Requirement credit read from goal steps: learner and group gaps, coverage, make-up steps and evidence."""

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.requirement_exports import RequirementEvidenceExport
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.goals import requirement_evidence, requirements as service
from src.services.goals.requirements import MakeupStep, RequirementCredit

router = APIRouter()


@router.post("/requirements/evidence-export")
def api_evidence_export(org_id: int, payload: RequirementEvidenceExport, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    content = requirement_evidence.evidence_csv(db, user, org_id, payload)
    return Response(content, media_type="text/csv", headers={
        "Content-Disposition": 'attachment; filename="requirement-evidence.csv"', "Cache-Control": "no-store",
    })


@router.get("/requirements/{framework_uuid}/coverage")
def api_coverage(framework_uuid: str, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return service.coverage(db, user, org_id, framework_uuid)


@router.get("/managed-users/{user_id}/requirements")
def api_learner_requirements(user_id: int, org_id: int, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return service.learner_requirements(db, user, org_id, user_id)


@router.get("/managed-users/{user_id}/makeup-options")
def api_makeup_options(user_id: int, org_id: int, node_uuid: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return service.makeup_options(db, user, org_id, user_id, node_uuid)


@router.post("/managed-users/{user_id}/makeup")
def api_makeup(user_id: int, org_id: int, payload: MakeupStep, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return service.add_makeup_step(db, user, org_id, user_id, payload)


@router.post("/managed-users/{user_id}/requirements/credit")
def api_credit(user_id: int, org_id: int, payload: RequirementCredit, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return service.credit_requirement(db, user, org_id, user_id, payload.enrollment_uuid, payload.node_uuid, payload.note)


@router.get("/groups/{usergroup_id}/requirements")
def api_group_requirements(usergroup_id: int, org_id: int, framework_uuid: str | None = None, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return service.group_requirements(db, user, org_id, usergroup_id, framework_uuid)
