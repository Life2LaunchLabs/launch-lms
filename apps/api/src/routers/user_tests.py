"""Platform › User tests: cohorts, personas, captured test mail and one-use login links.

Everything here is for platform admins, except redeeming a login link, which is what the
persona's browser does with the link an admin made. The whole router is off unless
LAUNCHLMS_USER_TESTS_ENABLED is set.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlmodel import Session
from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services.security.rate_limiting import check_rate_limit, get_client_ip
from src.services.user_tests import cohorts, mail, personas, tickets
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
    return mail.read_mail(db, mail_id)


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
