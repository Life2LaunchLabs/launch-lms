from datetime import datetime, timedelta, timezone
from typing import Literal

from config.config import get_launchlms_config
from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, select
from src.core.events.database import get_db_session
from src.db.organizations import Organization
from src.db.users import AnonymousUser, PublicUser, User, UserCreate, UserRead
from src.security.auth import (
    JWT_ACCESS_TOKEN_EXPIRES,
    JWT_COOKIE_NAME,
    JWT_REFRESH_COOKIE_NAME,
    authenticate_user,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    extract_jwt_from_request,
    get_current_user,
)
from src.security.cookies import get_cookie_domain_for_request, is_request_secure
from src.services.auth.utils import signWithGoogle
from src.services.dev.dev import isDevModeEnabled
from src.services.security.account_lockout import (
    check_account_locked,
    format_lockout_message,
    record_failed_login,
    reset_failed_attempts,
    update_login_info,
)
from src.services.security.rate_limiting import (
    check_email_verification_rate_limit,
    check_login_rate_limit,
    check_refresh_rate_limit,
    get_client_ip,
)
from src.services.users.email_verification import (
    invalidate_verification_tokens,
    resend_verification_email,
    verify_email_token,
)


def get_token_expiry_ms() -> int | None:
    """Get the token expiry timestamp in milliseconds for frontend use."""
    if isDevModeEnabled() or JWT_ACCESS_TOKEN_EXPIRES is None:
        return None  # No expiry in dev mode
    expiry_time = datetime.now(timezone.utc) + JWT_ACCESS_TOKEN_EXPIRES
    return int(expiry_time.timestamp() * 1000)


router = APIRouter()

class WelcomeSignupRequest(BaseModel):
    email: EmailStr
    password: str


class WelcomeSignupEmailCheckRequest(BaseModel):
    email: EmailStr


def _get_owner_org(db_session: Session) -> Organization:
    owner_org = db_session.exec(select(Organization).order_by(Organization.id).limit(1)).first()
    if not owner_org:
        raise HTTPException(status_code=404, detail="Owner organization not found")
    return owner_org


def _starter_plan_redirect_url(owner_org: Organization, user_id: int, db_session: Session) -> str:
    """The next step of the learner's Launch Ready starter goal (the Welcome step at first)."""
    from src.services.goals.starter import redirect_path

    return f"/orgs/{owner_org.slug}{redirect_path(db_session, user_id)}"


def _generate_onboarding_username(email: str, db_session: Session) -> str:
    base = email.split("@", 1)[0].lower()
    base = "".join(ch if ch.isalnum() else "_" for ch in base).strip("_")[:24] or "learner"
    candidate = base
    counter = 1
    while db_session.exec(select(User).where(User.username == candidate)).first():
        counter += 1
        candidate = f"{base}_{counter}"
    return candidate


def set_auth_cookies(response: Response, access_token: str, refresh_token: str, request: Request = None):
    """Helper to set authentication cookies."""
    is_secure = is_request_secure(request)
    cookie_domain = get_cookie_domain_for_request(request) if request else None

    response.set_cookie(
        key=JWT_COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        domain=cookie_domain,
        expires=int(timedelta(hours=8).total_seconds()),
    )
    response.set_cookie(
        key=JWT_REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        domain=cookie_domain,
        expires=int(timedelta(days=30).total_seconds()),
    )


def unset_auth_cookies(response: Response, request: Request = None):
    """Helper to unset authentication cookies."""
    cookie_domain = get_cookie_domain_for_request(request) if request else None

    response.delete_cookie(key=JWT_COOKIE_NAME, domain=cookie_domain)
    response.delete_cookie(key=JWT_REFRESH_COOKIE_NAME, domain=cookie_domain)


@router.get("/onboarding/welcome")
async def get_welcome_onboarding(
    request: Request,
    current_user: PublicUser | AnonymousUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    """Where onboarding continues: the starter plan for a signed-in learner, otherwise signup."""
    if isinstance(current_user, AnonymousUser):
        return {"redirect_url": "/signup"}
    return {"redirect_url": _starter_plan_redirect_url(_get_owner_org(db_session), int(current_user.id), db_session)}


@router.post("/signup/welcome/check-email")
async def check_welcome_signup_email(
    body: WelcomeSignupEmailCheckRequest,
    db_session: Session = Depends(get_db_session),
):
    existing = db_session.exec(select(User).where(User.email == body.email)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already exists")
    return {"available": True}


@router.post("/signup/welcome")
async def complete_welcome_signup(
    request: Request,
    response: Response,
    body: WelcomeSignupRequest,
    db_session: Session = Depends(get_db_session),
):
    owner_org = _get_owner_org(db_session)

    existing = db_session.exec(select(User).where(User.email == body.email)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already exists")

    started_at = datetime.now(timezone.utc).isoformat()
    profile_preset = {
        "header": {"socials": []},
        "featured": {"cards": [], "publicVisible": True},
        "achievements": {"featuredIds": [], "publicVisible": True},
        "timelineEnabled": True,
        "timelinePublicVisible": True,
        "timeline": [],
        "layout": [],
        "sections": [],
        "onboarding": {"started_at": started_at},
    }
    user_create = UserCreate(
        username=_generate_onboarding_username(body.email, db_session),
        email=body.email,
        password=body.password,
        first_name="",
        last_name="",
        bio="",
        details={"onboarding": {"started_at": started_at}},
        profile=profile_preset,
    )

    from src.services.users.users import create_user

    user_read = await create_user(
        request,
        db_session,
        AnonymousUser(),
        user_create,
        owner_org.id or 0,
        signup_provider="onboarding",
        send_verification=False,
    )

    user = db_session.exec(select(User).where(User.id == user_read.id)).first()
    if not user:
        raise HTTPException(status_code=500, detail="Created user could not be loaded")

    user.profile = {
        **(user.profile or {}),
        **profile_preset,
    }
    user.update_date = str(datetime.now())
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    onboarding_payload = {
        "org_slug": owner_org.slug,
        "redirect_url": _starter_plan_redirect_url(owner_org, int(user.id), db_session),  # type: ignore[arg-type]
    }

    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=JWT_ACCESS_TOKEN_EXPIRES,
    )
    refresh_token = create_refresh_token(data={"sub": user.email})
    set_auth_cookies(response, access_token, refresh_token, request)

    return {
        "user": UserRead.model_validate(user),
        "tokens": {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expiry": get_token_expiry_ms(),
        },
        "onboarding": onboarding_payload,
    }


@router.get("/refresh")
def refresh(request: Request, response: Response):
    """Validate the refresh cookie and preserve the account/session boundary."""
    # Rate limit refresh endpoint to prevent brute force attacks
    is_allowed, retry_after = check_refresh_rate_limit(request)
    if not is_allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "RATE_LIMITED",
                "message": "Too many refresh attempts. Please try again later.",
                "retry_after": retry_after,
            },
        )

    refresh_token = request.cookies.get(JWT_REFRESH_COOKIE_NAME)
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_refresh_token(refresh_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    from src.services.demo.refresh import refresh_demo
    demo_credentials = refresh_demo(request, response, payload, set_auth_cookies, get_token_expiry_ms)
    if demo_credentials:
        return demo_credentials

    current_user = payload.get("sub")
    new_access_token = create_access_token(
        data={"sub": current_user},
        expires_delta=JWT_ACCESS_TOKEN_EXPIRES
    )

    cookie_domain = get_cookie_domain_for_request(request)
    is_secure = is_request_secure(request)
    response.set_cookie(
        key=JWT_COOKIE_NAME,
        value=new_access_token,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        domain=cookie_domain,
        expires=int(timedelta(hours=8).total_seconds()),
    )
    return {"access_token": new_access_token, "expiry": get_token_expiry_ms()}


@router.post("/login")
async def login(
    request: Request,
    response: Response,
    username: str = Form(...),
    password: str = Form(...),
    db_session: Session = Depends(get_db_session),
):
    # Step 1: Check rate limit (IP-based)
    is_allowed, retry_after = check_login_rate_limit(request)
    if not is_allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "RATE_LIMITED",
                "message": f"Too many login attempts. Please try again in {retry_after // 60} minutes.",
                "retry_after": retry_after,
            },
        )

    # Step 2: Get user to check lockout status
    statement = select(User).where(User.email == username)
    user_record = db_session.exec(statement).first()

    if user_record:
        # Step 3: Check if account is locked
        is_locked, remaining_seconds = check_account_locked(user_record)
        if is_locked and remaining_seconds:
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail={
                    "code": "ACCOUNT_LOCKED",
                    "message": format_lockout_message(remaining_seconds),
                    "retry_after": remaining_seconds,
                },
            )

    # Step 4: Authenticate user
    user = await authenticate_user(
        request, username, password, db_session
    )

    if not user:
        # Record failed attempt if user exists
        if user_record:
            is_now_locked, lockout_duration = record_failed_login(user_record, db_session)
            if is_now_locked:
                raise HTTPException(
                    status_code=status.HTTP_423_LOCKED,
                    detail={
                        "code": "ACCOUNT_LOCKED",
                        "message": f"Account locked due to too many failed attempts. Please try again in {lockout_duration // 60} minutes.",
                        "retry_after": lockout_duration,
                    },
                )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_CREDENTIALS",
                "message": "Incorrect Email or password",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Step 5: Reset failed attempts and update login info. Email verification is
    # encouraged after signup, but it never prevents access to the account.
    reset_failed_attempts(user, db_session)
    client_ip = get_client_ip(request)
    update_login_info(user, client_ip, db_session)

    # Step 7: Issue tokens
    access_token = create_access_token(
        data={"sub": username},
        expires_delta=JWT_ACCESS_TOKEN_EXPIRES
    )
    refresh_token = create_refresh_token(data={"sub": username})

    set_auth_cookies(response, access_token, refresh_token, request)

    user = UserRead.model_validate(user)

    result = {
        "user": user,
        "tokens": {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expiry": get_token_expiry_ms(),
        },
    }
    return result


class ThirdPartyLogin(BaseModel):
    email: EmailStr
    provider: Literal["google"]
    access_token: str


@router.post("/oauth")
async def third_party_login(
    request: Request,
    response: Response,
    body: ThirdPartyLogin,
    org_id: int | None = None,
    current_user: AnonymousUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    if not get_launchlms_config().general_config.auth_oauth_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="OAuth login is disabled",
        )

    # Google
    if body.provider == "google":

        user = await signWithGoogle(
            request, body.access_token, body.email, org_id, current_user, db_session
        )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect Email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=JWT_ACCESS_TOKEN_EXPIRES
    )
    refresh_token = create_refresh_token(data={"sub": user.email})

    set_auth_cookies(response, access_token, refresh_token, request)

    user = UserRead.model_validate(user)

    result = {
        "user": user,
        "tokens": {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expiry": get_token_expiry_ms(),
        },
    }
    return result


@router.delete("/logout")
def logout(request: Request, response: Response):
    """Clear browser credentials and revoke disposable demo sessions."""
    token = extract_jwt_from_request(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    from src.services.demo.refresh import revoke_demo
    revoke_demo(token)
    unset_auth_cookies(response, request)
    return {"msg": "Successfully logout"}


class VerifyEmailRequest(BaseModel):
    token: str
    user_uuid: str
    org_uuid: str


@router.post("/verify-email")
async def api_verify_email(
    request: Request,
    body: VerifyEmailRequest,
    db_session: Session = Depends(get_db_session),
):
    """
    Verify user email with token.
    """
    # Rate limit: 5 attempts per 5 minutes per user_uuid
    is_allowed, retry_after = check_email_verification_rate_limit(body.user_uuid)
    if not is_allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many verification attempts. Please try again in {retry_after // 60} minutes.",
        )

    result = await verify_email_token(
        request=request,
        db_session=db_session,
        token=body.token,
        user_uuid=body.user_uuid,
        org_uuid=body.org_uuid,
    )
    return {"message": result}


class ResendVerificationRequest(BaseModel):
    email: EmailStr
    org_id: int | None = None


@router.post("/resend-verification")
async def api_resend_verification_email(
    request: Request,
    body: ResendVerificationRequest,
    db_session: Session = Depends(get_db_session),
):
    """
    Resend verification email (rate limited).
    """
    result = await resend_verification_email(
        request=request,
        db_session=db_session,
        email=body.email,
        org_id=body.org_id,
    )
    return {"message": result, "verified": result == "Email verified successfully"}


class ChangeEmailRequest(BaseModel):
    email: EmailStr


@router.post("/change-email")
async def api_change_email(
    request: Request,
    response: Response,
    body: ChangeEmailRequest,
    current_user: UserRead = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    """Change the signed-in user's unverified email and refresh their session."""
    email = str(body.email).strip().lower()
    user = db_session.exec(select(User).where(User.id == current_user.id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.email_verified:
        raise HTTPException(status_code=409, detail="Verified emails cannot be changed here")
    duplicate = db_session.exec(select(User).where(User.email == email, User.id != user.id)).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="Email already exists")

    invalidate_verification_tokens(user.user_uuid, "none")
    user.email = email
    user.email_verified = False
    user.email_verified_at = None
    user.update_date = str(datetime.now())
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    access_token = create_access_token(data={"sub": user.email}, expires_delta=JWT_ACCESS_TOKEN_EXPIRES)
    refresh_token = create_refresh_token(data={"sub": user.email})
    set_auth_cookies(response, access_token, refresh_token, request)
    return {
        "user": UserRead.model_validate(user),
        "tokens": {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expiry": get_token_expiry_ms(),
        },
    }
