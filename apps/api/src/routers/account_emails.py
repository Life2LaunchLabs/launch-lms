"""Your account's emails (DEV-197): list them, add one with a code, make one your main email, remove a spare."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser, User, UserRead
from src.security.auth import JWT_ACCESS_TOKEN_EXPIRES, create_access_token, create_refresh_token, get_authenticated_user
from src.services.users import account_emails

router = APIRouter()


class EmailBody(BaseModel):
    email: str


class ConfirmBody(BaseModel):
    email: str
    code: str


def _me(db: Session, current_user: PublicUser) -> User:
    user = db.get(User, current_user.id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _changed(user_id: int) -> None:
    from src.routers.users import _invalidate_session_cache

    _invalidate_session_cache(user_id)


@router.get("/users/me/emails", tags=["users"])
def api_my_emails(db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)) -> dict:
    """Your main email and the spare ones you can also sign in with."""
    return account_emails.listing(db, _me(db, current_user))


@router.post("/users/me/emails", tags=["users"])
def api_add_my_email(body: EmailBody, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)) -> dict:
    """Send a six-digit code to an email you want to add. Refused (409) when it's already on an account."""
    return account_emails.start_add(db, _me(db, current_user), body.email)


@router.post("/users/me/emails/confirm", tags=["users"])
def api_confirm_my_email(body: ConfirmBody, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)) -> dict:
    """Type the code: the email joins your account."""
    result = account_emails.confirm_add(db, _me(db, current_user), body.email, body.code)
    _changed(current_user.id)
    return result


@router.post("/users/me/emails/main", tags=["users"])
def api_make_main_email(body: EmailBody, request: Request, response: Response, db: Session = Depends(get_db_session),
                        current_user: PublicUser = Depends(get_authenticated_user)) -> dict:
    """Make a spare your main email: notifications go there. Your session moves to it."""
    from src.routers.auth import get_token_expiry_ms, set_auth_cookies

    user = account_emails.make_main(db, _me(db, current_user), body.email)
    _changed(current_user.id)
    access_token = create_access_token(data={"sub": user.email}, expires_delta=JWT_ACCESS_TOKEN_EXPIRES)
    refresh_token = create_refresh_token(data={"sub": user.email})
    set_auth_cookies(response, access_token, refresh_token, request)
    return {**account_emails.listing(db, user), "user": UserRead.model_validate(user).model_dump(),
            "tokens": {"access_token": access_token, "refresh_token": refresh_token, "expiry": get_token_expiry_ms()}}


@router.post("/users/me/emails/remove", tags=["users"])
def api_remove_my_email(body: EmailBody, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)) -> dict:
    """Take a spare email off your account."""
    result = account_emails.remove(db, _me(db, current_user), body.email)
    _changed(current_user.id)
    return result


@router.post("/users/me/emails/personal-prompt/dismiss", tags=["users"])
def api_dismiss_personal_prompt(db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)) -> dict:
    """Not now: stop asking for a personal email (it asks again once they're alumni)."""
    from src.services.users import personal_email_prompt

    user = _me(db, current_user)
    personal_email_prompt.dismiss(db, user)
    return account_emails.listing(db, user)
