"""Canvas (LTI 1.3) launch addresses: the tool configuration, our public key, login, launch and session.

These are public: Canvas and the browser call them without a Life2Launch session. Login and launch
are posted by Canvas from its own site, so they skip the Origin check (security/csrf.py); a launch is
trusted only through Canvas's signature, the one-use nonce and the state check.
"""

from __future__ import annotations

import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlmodel import Session, select

from src.core.events.database import get_db_session
from src.db.canvas import CanvasConnection
from src.db.organizations import Organization
from src.db.users import PublicUser, User
from src.security.auth import create_access_token, create_refresh_token, get_authenticated_user
from src.security.org_auth import require_org_owner_admin
from src.services.canvas import keys, launch as lti, pages, people, session as canvas_session, settings
from src.services.canvas.launch import LaunchError
from src.services.oauth.config import frontend_url

router = APIRouter()

TOOL_TITLE = "Life2Launch"


def tool_urls() -> dict:
    base = f"{frontend_url()}/api/v1/lti"
    return {
        "login": f"{base}/login",
        "launch": f"{base}/launch",
        "jwks": f"{base}/jwks",
        "config": f"{base}/canvas.json",
    }


@router.get("/jwks")
def lti_jwks(db: Session = Depends(get_db_session)):
    return JSONResponse(keys.jwks(db), headers={"Cache-Control": "public, max-age=3600"})


@router.get("/canvas.json")
def canvas_tool_configuration(db: Session = Depends(get_db_session)):
    """The configuration a Canvas admin pastes as a URL when adding the LTI developer key."""
    urls = tool_urls()
    domain = frontend_url().split("://", 1)[1]
    return {
        "title": TOOL_TITLE,
        "description": "Plans, badges and portfolios for students, signed in from Canvas.",
        "oidc_initiation_url": urls["login"],
        "target_link_uri": urls["launch"],
        "public_jwk_url": urls["jwks"],
        "scopes": [],
        "extensions": [{
            "domain": domain,
            "tool_id": "life2launch",
            "platform": "canvas.instructure.com",
            "privacy_level": "public",
            "settings": {
                "text": TOOL_TITLE,
                "placements": [{
                    "placement": "course_navigation",
                    "message_type": "LtiResourceLinkRequest",
                    "target_link_uri": urls["launch"],
                    "text": TOOL_TITLE,
                    "default": "enabled",
                    "windowTarget": "_self",
                }],
            },
        }],
        "custom_fields": {},
    }


async def _login(request: Request, db: Session):
    params = dict(request.query_params)
    if request.method == "POST":
        params.update({k: str(v) for k, v in (await request.form()).items()})
    try:
        redirect = lti.start_login(
            db,
            issuer=params.get("iss", ""),
            client_id=params.get("client_id"),
            login_hint=params.get("login_hint", ""),
            target_link_uri=params.get("target_link_uri", ""),
            lti_message_hint=params.get("lti_message_hint"),
            deployment_id=params.get("lti_deployment_id"),
            storage_target=params.get("lti_storage_target"),
            redirect_uri=tool_urls()["launch"],
        )
    except LaunchError as error:
        return pages.error_page(error.message, error.status_code)
    response = pages.login_redirect(redirect.authorize_url, redirect.params, redirect.state,
                                    redirect.storage_target, redirect.platform_origin)
    canvas_session.set_state_cookie(response, redirect.state)
    return response


@router.get("/login")
async def lti_login_get(request: Request, db: Session = Depends(get_db_session)):
    return await _login(request, db)


@router.post("/login")
async def lti_login_post(request: Request, db: Session = Depends(get_db_session)):
    return await _login(request, db)


@router.post("/launch")
async def lti_launch(
    request: Request,
    id_token: str = Form(default=""),
    state: str = Form(default=""),
    lti_storage_target: str | None = Form(default=None),
    db: Session = Depends(get_db_session),
):
    try:
        stored = lti.consume_state(state)
        checked = lti.verify_launch(db, id_token, stored)
    except LaunchError as error:
        return pages.error_page(error.message, error.status_code)
    connection = checked.connection
    org = db.get(Organization, connection.org_id)
    ticket = canvas_session.issue_ticket({
        "kind": "launch",
        "connection_id": connection.id,
        "org_id": connection.org_id,
        "canvas_user_id": checked.canvas_user_id,
        "email": checked.email,
        "given_name": checked.given_name,
        "family_name": checked.family_name,
        "name": checked.name,
        "roles": checked.roles,
        "course_id": checked.course_id,
        "course_title": checked.course_title,
    })
    cookie_state = request.cookies.get(lti.STATE_COOKIE, "")
    cookie_ok = bool(cookie_state) and secrets.compare_digest(cookie_state, state)
    response = pages.launch_handoff(
        f"{canvas_session.org_base_url(db, org)}/api/v1/lti/session", ticket, state, cookie_ok,
        lti_storage_target or None, _platform_origin(connection),
    )
    canvas_session.clear_state_cookie(response)
    return response


def _platform_origin(connection: CanvasConnection) -> str:
    from src.services.canvas.connections import platform_origin

    return platform_origin(connection)


def _launch_from_ticket(db: Session, data: dict) -> lti.Launch:
    connection = db.get(CanvasConnection, data.get("connection_id"))
    if not connection or not connection.enabled:
        raise LaunchError("Your school's Canvas connection is switched off. Ask your school's Life2Launch admin.", 403)
    return lti.Launch(
        connection=connection,
        canvas_user_id=data["canvas_user_id"],
        email=data["email"],
        given_name=data.get("given_name") or "",
        family_name=data.get("family_name") or "",
        name=data.get("name") or "",
        roles=data.get("roles") or [],
        course_id=data.get("course_id"),
        course_title=data.get("course_title"),
    )


def landing_path(membership_role_id: int) -> str:
    """A student lands on their home; staff on the admin dashboard."""
    return "/admin" if membership_role_id in (people.ADMIN_ROLE_ID, people.STAFF_ROLE_ID) else "/plans"


@router.post("/session")
async def lti_session(
    request: Request,
    ticket: str = Form(default=""),
    mode: str = Form(default="frame"),
    retry: str = Form(default=""),
    db: Session = Depends(get_db_session),
):
    data = canvas_session.redeem_ticket(ticket)
    if not data:
        return pages.error_page("This link has expired or was already used. Open Life2Launch from Canvas again.", 401)
    try:
        if data.get("kind") == "launch":
            user, membership, _created = people.resolve_person(db, _launch_from_ticket(db, data))
            return_path = landing_path(membership.role_id)
        elif data.get("kind") == "session":
            user = db.exec(select(User).where(User.email == data.get("email"))).first()
            if not user:
                raise LaunchError("This link has expired. Open Life2Launch from Canvas again.", 401)
            return_path = canvas_session.safe_return_path(data.get("return", "/"))
        else:
            raise LaunchError("This link has expired. Open Life2Launch from Canvas again.", 401)
    except LaunchError as error:
        return pages.error_page(error.message, error.status_code)
    org = db.get(Organization, data.get("org_id"))
    if not org:
        return pages.error_page("This school isn't on Life2Launch any more.", 404)
    access = create_access_token({"sub": user.email})
    refresh = create_refresh_token({"sub": user.email})
    destination = f"{canvas_session.org_base_url(db, org)}{return_path}"
    if mode == "tab":
        # A top-level tab of our own: an ordinary first-party sign-in, like the login form.
        response = RedirectResponse(destination, status_code=303)
        _set_first_party_cookies(response, request, access, refresh)
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response
    follow_up = {"kind": "session", "email": user.email, "org_id": org.id, "return": return_path}
    response = pages.session_check(
        destination,
        canvas_session.issue_ticket(follow_up),
        canvas_session.issue_ticket(follow_up),
        retried=retry == "1",
    )
    # A launch replaces whatever session this Canvas partition already had (a shared school computer).
    canvas_session.set_canvas_cookies(response, request, access, refresh)
    return response


def _set_first_party_cookies(response, request: Request, access: str, refresh: str) -> None:
    """Ordinary SameSite=Lax cookies, whatever the request carries: a new tab of our own is never inside Canvas."""
    from src.security.auth import JWT_COOKIE_NAME, JWT_REFRESH_COOKIE_NAME
    from src.security.cookies import get_cookie_domain_for_request, is_request_secure

    common = {"secure": is_request_secure(request), "samesite": "lax", "path": "/",
              "domain": get_cookie_domain_for_request(request)}
    response.set_cookie(JWT_COOKIE_NAME, access, httponly=True, max_age=int(timedelta(hours=8).total_seconds()), **common)
    response.set_cookie(JWT_REFRESH_COOKIE_NAME, refresh, httponly=True,
                        max_age=int(timedelta(days=30).total_seconds()), **common)
    response.set_cookie(canvas_session.SESSION_MARKER_COOKIE, "1", httponly=False,
                        max_age=int(timedelta(days=30).total_seconds()), **common)


# ---------------------------------------------------------------------------
# Organization settings › Canvas (admins of the organization; every tier)
# ---------------------------------------------------------------------------

def _require_admin(current_user, org_id: int, db: Session) -> None:
    if not isinstance(current_user, PublicUser):
        raise HTTPException(status_code=403, detail="Sign in to change the Canvas connection")
    require_org_owner_admin(current_user.id, org_id, db)


@router.get("/orgs/{org_id}/connection")
def get_canvas_connection(
    org_id: int,
    current_user: PublicUser = Depends(get_authenticated_user),
    db: Session = Depends(get_db_session),
):
    _require_admin(current_user, org_id, db)
    return settings.get_settings(db, org_id)


@router.put("/orgs/{org_id}/connection")
def save_canvas_connection(
    org_id: int,
    body: settings.CanvasSettingsUpdate,
    current_user: PublicUser = Depends(get_authenticated_user),
    db: Session = Depends(get_db_session),
):
    _require_admin(current_user, org_id, db)
    if not db.get(Organization, org_id):
        raise HTTPException(status_code=404, detail="Organization not found")
    return settings.save_settings(db, org_id, current_user.id, body)
