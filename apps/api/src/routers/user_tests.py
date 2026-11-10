"""Platform › User tests: cohorts, personas, captured test mail and one-use login links.

Everything here is for platform admins, except redeeming a login link, which is what the
persona's browser does with the link an admin made. The whole router is off unless
LAUNCHLMS_USER_TESTS_ENABLED is set.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlmodel import Session
from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services.security.rate_limiting import check_rate_limit, get_client_ip
from src.db.user_tests import TestMail, TestPersona
from src.db.users import User
from src.services.user_tests import checkpoints, cleanup, cohorts, mail, personas, stories, tickets
from src.services.user_tests.sessions import current_test_persona, is_platform_admin
from src.services.user_tests.settings import email_domain, require_enabled

router = APIRouter()


def operator(
    current_user: PublicUser = Depends(get_authenticated_user),
    db: Session = Depends(get_db_session),
) -> PublicUser:
    require_enabled()
    if current_test_persona.get() or not isinstance(current_user, PublicUser):
        raise HTTPException(403, "Test personas and API tokens can't manage user tests.")
    if not is_platform_admin(current_user.id, db):
        raise HTTPException(403, "Platform admin access is required to manage user tests.")
    return current_user


def persona_session(
    current_user: PublicUser = Depends(get_authenticated_user),
    db: Session = Depends(get_db_session),
) -> tuple[TestPersona, User]:
    """A test persona's own session: what a blind tester can reach from inside the app."""
    require_enabled()
    persona_id = current_test_persona.get()
    if not persona_id or not isinstance(current_user, PublicUser) or current_user.id != persona_id:
        raise HTTPException(403, "Only a test persona's own session can use this.")
    persona, user = db.get(TestPersona, persona_id), db.get(User, persona_id)
    if not persona or not user:
        raise HTTPException(403, "This account is not a test persona.")
    return persona, user


class LoginLinkRequest(BaseModel):
    target_path: str = Field(default="/", max_length=1000)


class RedeemRequest(BaseModel):
    ticket: str = Field(min_length=1, max_length=200)


@router.get("/status")
def status(_: PublicUser = Depends(operator)):
    return {"enabled": True, "email_domain": email_domain()}


@router.get("/cohorts")
def list_cohorts(_: PublicUser = Depends(operator), db: Session = Depends(get_db_session)):
    return {"cohorts": cohorts.list_cohorts(db)}


@router.post("/cohorts", status_code=201)
def create_cohort(
    body: cohorts.CreateCohort,
    actor: PublicUser = Depends(operator),
    db: Session = Depends(get_db_session),
):
    return cohorts.create_cohort(db, actor.id, body)


@router.get("/cohorts/{cohort_uuid}")
def get_cohort(cohort_uuid: str, _: PublicUser = Depends(operator), db: Session = Depends(get_db_session)):
    return cohorts.serialize(db, cohorts.get_cohort(db, cohort_uuid), detail=True)


@router.post("/cohorts/{cohort_uuid}/close")
def close_cohort(cohort_uuid: str, _: PublicUser = Depends(operator), db: Session = Depends(get_db_session)):
    return cohorts.close_cohort(db, cohort_uuid)


@router.get("/cohorts/{cohort_uuid}/audit")
def audit_cohort(cohort_uuid: str, _: PublicUser = Depends(operator), db: Session = Depends(get_db_session)):
    """Anything tying the cohort to a real person or org. Zero is the target."""
    return cleanup.audit(db, cohort_uuid)


@router.post("/cohorts/{cohort_uuid}/purge")
def purge_cohort(cohort_uuid: str, dry_run: bool = True, _: PublicUser = Depends(operator), db: Session = Depends(get_db_session)):
    """Delete a closed cohort's personas and orgs. A dry run (the default) only counts."""
    return cleanup.purge(db, cohort_uuid, dry_run=dry_run)


@router.put("/cohorts/{cohort_uuid}/stages")
def set_stages(cohort_uuid: str, body: stories.SetStages, _: PublicUser = Depends(operator), db: Session = Depends(get_db_session)):
    return stories.set_stages(db, cohort_uuid, body)


@router.get("/cohorts/{cohort_uuid}/board")
def board(cohort_uuid: str, _: PublicUser = Depends(operator), db: Session = Depends(get_db_session)):
    return stories.board(db, cohort_uuid)


@router.get("/cohorts/{cohort_uuid}/events")
def events(cohort_uuid: str, kind: str | None = None, persona: int | None = None, _: PublicUser = Depends(operator), db: Session = Depends(get_db_session)):
    return {"events": stories.events(db, cohort_uuid, kind, persona)}


@router.get("/cohorts/{cohort_uuid}/report")
def report(cohort_uuid: str, _: PublicUser = Depends(operator), db: Session = Depends(get_db_session)):
    return {"markdown": stories.report(db, cohort_uuid)}


@router.post("/personas/{user_id}/progress")
def set_progress(user_id: int, body: stories.Progress, background: BackgroundTasks, _: PublicUser = Depends(operator), db: Session = Depends(get_db_session)):
    """Move a persona on the board by hand, for example to reopen a stage after a fix."""
    persona = db.get(TestPersona, user_id)
    if not persona:
        raise HTTPException(404, "That persona no longer exists.")
    return _progress(db, persona, body, background, "operator")


def _progress(db: Session, persona: TestPersona, body: stories.Progress, background: BackgroundTasks, by: str) -> dict:
    state = stories.report_progress(db, persona, body, by=by)
    if body.status == "done":
        # The last persona to finish a stage captures it, after the response.
        background.add_task(checkpoints.capture_after_stage, persona.cohort_id, body.stage_key)
    return state


class CaptureRequest(BaseModel):
    stage_key: str | None = Field(default=None, max_length=60)
    label: str = Field(default="", max_length=120)


@router.get("/cohorts/{cohort_uuid}/checkpoints")
def list_checkpoints(cohort_uuid: str, _: PublicUser = Depends(operator), db: Session = Depends(get_db_session)):
    return {"checkpoints": checkpoints.list_checkpoints(db, cohort_uuid)}


@router.post("/cohorts/{cohort_uuid}/checkpoints", status_code=201)
def capture_checkpoint(cohort_uuid: str, body: CaptureRequest, actor: PublicUser = Depends(operator), db: Session = Depends(get_db_session)):
    return checkpoints.capture_now(db, cohort_uuid, actor.id, body.stage_key, body.label)


@router.post("/checkpoints/{checkpoint_id}/publish")
def publish_checkpoint(checkpoint_id: str, actor: PublicUser = Depends(operator), db: Session = Depends(get_db_session)):
    """Make this checkpoint the demo; its personas become the demo's pickable users."""
    return checkpoints.publish(db, checkpoint_id, actor.id)


@router.get("/me")
def my_run(me: tuple[TestPersona, User] = Depends(persona_session), db: Session = Depends(get_db_session)):
    return stories.persona_view(db, *me)


@router.get("/me/mail")
def my_mail(me: tuple[TestPersona, User] = Depends(persona_session), db: Session = Depends(get_db_session)):
    return {"mail": mail.list_mail(db, me[0].cohort_id, int(me[1].id))}  # type: ignore[arg-type]


@router.get("/me/mail/{mail_id}")
def read_my_mail(mail_id: int, me: tuple[TestPersona, User] = Depends(persona_session), db: Session = Depends(get_db_session)):
    found = db.get(TestMail, mail_id)
    if not found or found.to_user_id != me[1].id:
        raise HTTPException(404, "That email isn't in your inbox.")
    return mail.read_mail(db, mail_id)


@router.post("/me/progress")
def my_progress(body: stories.Progress, background: BackgroundTasks, me: tuple[TestPersona, User] = Depends(persona_session), db: Session = Depends(get_db_session)):
    return _progress(db, me[0], body, background, "persona")


@router.post("/me/findings", status_code=201)
def my_finding(body: stories.Finding, me: tuple[TestPersona, User] = Depends(persona_session), db: Session = Depends(get_db_session)):
    return stories.log_finding(db, me[0], body)


@router.post("/cohorts/{cohort_uuid}/personas", status_code=201)
async def add_personas(
    cohort_uuid: str,
    body: personas.CreatePersonas,
    _: PublicUser = Depends(operator),
    db: Session = Depends(get_db_session),
):
    return {"personas": await personas.create_personas(db, cohort_uuid, body)}


@router.get("/cohorts/{cohort_uuid}/mail")
def list_mail(
    cohort_uuid: str,
    persona: int | None = None,
    _: PublicUser = Depends(operator),
    db: Session = Depends(get_db_session),
):
    cohort = cohorts.get_cohort(db, cohort_uuid)
    return {"mail": mail.list_mail(db, int(cohort.id), persona)}


@router.get("/mail/{mail_id}")
def read_mail(mail_id: int, _: PublicUser = Depends(operator), db: Session = Depends(get_db_session)):
    return mail.read_mail(db, mail_id, as_persona=False)


@router.post("/personas/{user_id}/login-link")
def login_link(
    user_id: int,
    body: LoginLinkRequest,
    actor: PublicUser = Depends(operator),
    db: Session = Depends(get_db_session),
):
    allowed, _, retry = check_rate_limit(f"user-tests-mint:{actor.id}", 120, 3600)
    if not allowed:
        raise HTTPException(429, f"Too many login links this hour. Try again in {retry} seconds.")
    return tickets.mint(db, actor.id, user_id, body.target_path)


@router.post("/redeem")
def redeem(body: RedeemRequest, request: Request, response: Response, db: Session = Depends(get_db_session)):
    """Spend a login link. The web's /api/user-tests/redeem route sets the cookies from this."""
    require_enabled()
    allowed, _, retry = check_rate_limit(f"user-tests-redeem:{get_client_ip(request)}", 200, 600)
    if not allowed:
        raise HTTPException(429, f"Too many login links opened. Try again in {retry} seconds.")
    response.headers["Cache-Control"] = "no-store"
    return tickets.redeem(db, body.ticket)
