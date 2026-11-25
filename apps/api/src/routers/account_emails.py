"""Your account's emails (DEV-197): list them, add one with a code, make one your main email, remove a spare."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser, User, UserRead
from src.security.auth import JWT_ACCESS_TOKEN_EXPIRES, create_access_token, create_refresh_token, get_authenticated_user
from src.services.users import account_emails, account_settings

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


# Settings › Account (PF-3, DEV-213): the phone, the username and the ways to sign in ---------------------------------

class PhoneBody(BaseModel):
    phone: str = Field(default="", max_length=40)


class UsernameBody(BaseModel):
    username: str = Field(max_length=60)


class GoogleBody(BaseModel):
    access_token: str = Field(min_length=1, max_length=4096)


@router.put("/users/me/phone", tags=["users"])
def api_set_my_phone(body: PhoneBody, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)) -> dict:
    """The account's one phone number, which the résumé prints. Empty takes it off."""
    result = account_settings.set_phone(db, _me(db, current_user), body.phone)
    _changed(current_user.id)
    return result


@router.put("/users/me/username", tags=["users"])
def api_change_my_username(body: UsernameBody, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)) -> dict:
    """A new username: old links to the profile stop working and the old one is free for anyone."""
    result = account_settings.change_username(db, _me(db, current_user), body.username)
    _changed(current_user.id)
    return result


@router.get("/users/me/sign-in-methods", tags=["users"])
def api_my_sign_in_methods(db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)) -> dict:
    """Email (how many verified), password and Google."""
    return account_settings.sign_in_methods(db, _me(db, current_user))


@router.post("/users/me/sign-in-methods/google", tags=["users"])
async def api_connect_google(body: GoogleBody, db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)) -> dict:
    """Connect the Google account the person just signed in to (its access token proves it)."""
    from src.services.auth import google_oauth
    from src.services.auth.utils import get_google_user_info

    if not google_oauth.enabled():
        raise HTTPException(status_code=404, detail="Google sign-in is off")
    info = await get_google_user_info(body.access_token)
    if info.get("email_verified") is False:
        raise HTTPException(status_code=400, detail="Google hasn't verified that account's email.")
    result = account_settings.connect_google(db, _me(db, current_user), str(info.get("email") or ""))
    _changed(current_user.id)
    return result


@router.delete("/users/me/sign-in-methods/google", tags=["users"])
def api_disconnect_google(db: Session = Depends(get_db_session), current_user: PublicUser = Depends(get_authenticated_user)) -> dict:
    """Turn Google sign-in off for the account."""
    result = account_settings.disconnect_google(db, _me(db, current_user))
    _changed(current_user.id)
    return result
