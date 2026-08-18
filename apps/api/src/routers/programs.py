from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.programs import (
    ObjectiveCreate,
    LearnerObjectiveUpdate,
    ObjectiveProgressUpdate,
    ParticipantResponse,
    ProgramAssignmentCreate,
    ProgramCreate,
    ProgramUpdate,
)
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services import programs as service


router = APIRouter()


@router.get("/")
def api_list_programs(
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.list_programs(db_session, current_user, org_id)


@router.post("/")
def api_create_program(
    payload: ProgramCreate,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.create_program(db_session, current_user, payload)


@router.get("/objectives")
def api_list_objectives(
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.list_objectives(db_session, current_user, org_id)


@router.get("/cohorts/{usergroup_id}")
def api_cohort_overview(
    usergroup_id: int,
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.cohort_overview(db_session, current_user, org_id, usergroup_id)


@router.get("/assignments/{assignment_uuid}/matrix")
def api_assignment_matrix(
    assignment_uuid: str,
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.assignment_matrix(db_session, current_user, org_id, assignment_uuid)


@router.post("/progress")
def api_update_progress(
    payload: ObjectiveProgressUpdate,
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.update_progress(
        db_session,
        current_user,
        org_id,
        payload.objective_uuid,
        payload.user_ids,
        payload.status,
        payload.staff_note,
        payload.evidence,
        payload.completion_date,
    )


@router.get("/users/{user_id}")
def api_user_programs(
    user_id: int,
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.user_program_overview(db_session, current_user, org_id, user_id)


@router.get("/me")
def api_my_programs(
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.my_programs(db_session, current_user, org_id)


@router.post("/me/progress")
def api_update_my_progress(
    payload: LearnerObjectiveUpdate,
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.update_my_progress(
        db_session, current_user, org_id, payload.objective_uuid,
        payload.status, payload.learner_note, payload.evidence,
    )


@router.post("/invitations/{participant_uuid}/respond")
def api_respond_to_invitation(
    participant_uuid: str,
    payload: ParticipantResponse,
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.respond_to_invitation(db_session, current_user, org_id, participant_uuid, payload.accept)


@router.get("/{program_uuid}")
def api_get_program(
    program_uuid: str,
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.get_program(db_session, current_user, org_id, program_uuid)


@router.put("/{program_uuid}")
def api_update_program(
    program_uuid: str,
    payload: ProgramUpdate,
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.update_program(db_session, current_user, org_id, program_uuid, payload)


@router.post("/{program_uuid}/objectives")
def api_add_program_objective(
    program_uuid: str,
    payload: ObjectiveCreate,
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.add_program_objective(db_session, current_user, org_id, program_uuid, payload)


@router.post("/{program_uuid}/update-badge-versions")
def api_update_badge_versions(
    program_uuid: str,
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.update_badge_versions(db_session, current_user, org_id, program_uuid)


@router.post("/{program_uuid}/assign")
def api_assign_program(
    program_uuid: str,
    payload: ProgramAssignmentCreate,
    org_id: int,
    db_session: Session = Depends(get_db_session),
    current_user: PublicUser = Depends(get_current_user),
):
    return service.assign_program(db_session, current_user, org_id, program_uuid, payload)
