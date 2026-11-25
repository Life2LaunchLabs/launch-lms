"""Canvas (LTI 1.3) launch addresses: the tool configuration, our public key, login, launch and session.

These are public: Canvas and the browser call them without a Life2Launch session. Login and launch
are posted by Canvas from its own site, so they skip the Origin check (security/csrf.py); a launch is
trusted only through Canvas's signature, the one-use nonce and the state check.
"""

from __future__ import annotations

import secrets
from datetime import timedelta
from urllib.parse import urlencode

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from src.core.events.database import get_db_session
from src.db.canvas import CanvasConnection, CanvasCourseGroup
from src.db.organizations import Organization
from src.db.users import PublicUser, User
from src.security.auth import create_access_token, create_refresh_token, get_authenticated_user, get_current_user
from src.security.org_auth import require_org_owner_admin
from src.services.canvas import connections, courses, deep_linking, grades, keys, launch as lti, pages, people, plans, roster, session as canvas_session, settings
from src.services.canvas.launch import LaunchError
from src.services.oauth.config import frontend_url
from src.routers.users import _invalidate_session_cache

router = APIRouter()

TOOL_TITLE = "Life2Launch"
# Where a teacher picks a plan in Canvas: a module's "add item" and an assignment's external tool submission.
DEEP_LINKING_PLACEMENTS = ("link_selection", "assignment_selection")


@router.get("/framing")
def framing(org: str = "", db: Session = Depends(get_db_session)):
    """Which Canvas sites may frame an organization's pages (read by the web app's page routing, cached)."""
    return JSONResponse({"origins": connections.framing_origins(db, org or None)},
                        headers={"Cache-Control": "public, max-age=60"})


@router.get("/jwks")
def lti_jwks(db: Session = Depends(get_db_session)):
    return JSONResponse(keys.jwks(db), headers={"Cache-Control": "public, max-age=3600"})


@router.get("/canvas.json")
def canvas_tool_configuration(db: Session = Depends(get_db_session)):
    """The configuration a Canvas admin pastes as a URL when adding the LTI developer key."""
    urls = connections.tool_urls()
    domain = frontend_url().split("://", 1)[1]
    return {
        "title": TOOL_TITLE,
        "description": "Plans, badges and portfolios for students, signed in from Canvas.",
        "oidc_initiation_url": urls["login"],
        "target_link_uri": urls["launch"],
        "public_jwk_url": urls["jwks"],
        # The course's class list, read-only (DEV-193); a plan assignment's gradebook column and its scores (PF-5).
        "scopes": [roster.NRPS_SCOPE, grades.LINEITEM_SCOPE, grades.SCORE_SCOPE],
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
                }, *[{
                    # Adding a plan to a module or an assignment: the plan picker (deep linking, PF-4).
                    "placement": placement,
                    "message_type": lti.DEEP_LINKING_REQUEST,
                    "target_link_uri": urls["launch"],
                    "text": f"{TOOL_TITLE} plan",
                    "selection_width": 800,
                    "selection_height": 640,
                } for placement in DEEP_LINKING_PLACEMENTS]],
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
            redirect_uri=connections.tool_urls()["launch"],
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
    if checked.message_type == lti.DEEP_LINKING_REQUEST:
        return _plan_picker(db, checked, org)
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
        "memberships_url": checked.memberships_url,
        "plan": checked.plan_uuid,
        "resource_link_id": checked.resource_link_id,
        "lineitem_url": checked.lineitem_url,
    })
    cookie_state = request.cookies.get(lti.STATE_COOKIE, "")
    cookie_ok = bool(cookie_state) and secrets.compare_digest(cookie_state, state)
    response = pages.launch_handoff(
        f"{canvas_session.org_base_url(db, org)}/api/v1/lti/session", ticket, state, cookie_ok,
        lti_storage_target or None, _platform_origin(connection),
    )
    canvas_session.clear_state_cookie(response)
    return response


def _plan_picker(db: Session, checked: lti.Launch, org: Organization | None):
    """A teacher adding Life2Launch to a module or assignment: the school's plans, to pick one (PF-4)."""
    connection = checked.connection
    if not org:
        return pages.error_page("This school isn't on Life2Launch any more.", 404)
    if not people.is_staff_launch(checked.roles):
        return pages.error_page("Only your course's teachers can add Life2Launch plans.", 403)
    if not deep_linking.return_url_allowed(checked.deep_link_return_url or "", connection):
        return pages.error_page("Canvas asked Life2Launch to send the plan somewhere that isn't your school's Canvas.", 400)
    ticket = canvas_session.issue_ticket({
        "kind": "deep_link",
        "connection_id": connection.id,
        "org_id": connection.org_id,
        "deployment_id": checked.deployment_id,
        "return_url": checked.deep_link_return_url,
        "data": checked.deep_link_data,
        "placement": checked.placement,
    }, ttl=deep_linking.PICKER_TICKET_TTL_SECONDS)
    return pages.plan_picker(deep_linking.school_plans(db, connection.org_id), ticket, "/api/v1/lti/deep-link", org.name,
                             graded=checked.placement == "assignment_selection")


@router.post("/deep-link")
async def lti_deep_link(
    ticket: str = Form(default=""),
    plan: str = Form(default=""),
    cancel: str = Form(default=""),
    db: Session = Depends(get_db_session),
):
    """The teacher's pick (or cancel) from the plan picker, signed and handed back to Canvas."""
    data = canvas_session.peek_ticket(ticket)
    if not data or data.get("kind") != "deep_link":
        return pages.error_page("This picker has expired. Close it and add Life2Launch again.", 401)
    connection = db.get(CanvasConnection, data.get("connection_id"))
    if not connection or not connection.enabled:
        return pages.error_page("Your school's Canvas connection is switched off. Ask your school's Life2Launch admin.", 403)
    chosen = None
    if cancel != "1":
        chosen = deep_linking.find_plan(db, int(connection.org_id), plan) if plan else None
        if chosen is None:
            return pages.error_page("That plan isn't available to add. Go back and pick another.", 404)
    if not canvas_session.redeem_ticket(ticket):  # used once, after the checks
        return pages.error_page("This picker has expired. Close it and add Life2Launch again.", 401)
    graded = data.get("placement") == "assignment_selection"
    items = [deep_linking.content_item(chosen, graded=graded)] if chosen else []
    token = deep_linking.response_jwt(db, connection, str(data.get("deployment_id") or ""), data.get("data"), items)
    return pages.deep_link_return(str(data["return_url"]), token, chosen["title"] if chosen else None)


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
        memberships_url=data.get("memberships_url"),
        resource_link_id=data.get("resource_link_id"),
        lineitem_url=data.get("lineitem_url"),
        custom={"plan": data["plan"]} if data.get("plan") else {},
    )


def _is_staff_role(membership_role_id: int) -> bool:
    return membership_role_id in (people.ADMIN_ROLE_ID, people.STAFF_ROLE_ID)


def launch_landing(db: Session, launch: lti.Launch, user, membership_role_id: int, course_group_id: int | None) -> str:
    """Where a launch opens: the plan its link names (PF-4), or the person's usual landing."""
    if launch.plan_uuid:
        return plans.landing(db, launch, int(user.id), _is_staff_role(membership_role_id))
    return landing_path(membership_role_id, course_group_id)


def landing_path(membership_role_id: int, course_group_id: int | None = None) -> str:
    """A student lands on their home; staff on their Canvas course's group (or the admin home without one)."""
    if membership_role_id not in (people.ADMIN_ROLE_ID, people.STAFF_ROLE_ID):
        return "/plans"
    return f"/admin/threads/profiles/groups/{course_group_id}" if course_group_id else "/admin"


@router.post("/session")
async def lti_session(
    request: Request,
    background_tasks: BackgroundTasks,
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
            launch = _launch_from_ticket(db, data)
            user, membership, _created = people.resolve_person(db, launch, new_ok=bool(data.get("new")))
            _invalidate_session_cache(user.id)  # a new membership or role shows at once
            group = courses.course_group(db, launch) if launch.course_id else None
            return_path = launch_landing(db, launch, user, membership.role_id, int(group.id) if group else None)
            if group is not None and people.is_staff_launch(launch.roles):
                # A teacher opening the course brings its class list up to date, after the page is on its way.
                link = db.exec(select(CanvasCourseGroup).where(CanvasCourseGroup.usergroup_id == group.id)).first()
                if link is not None and link.memberships_url:
                    background_tasks.add_task(roster.pull_after_launch, int(link.id), int(user.id))
        elif data.get("kind") == "session":
            from src.services.users.account_emails import find_user

            user = find_user(db, data.get("email"))
            if not user:
                raise LaunchError("This link has expired. Open Life2Launch from Canvas again.", 401)
            return_path = canvas_session.safe_return_path(data.get("return", "/"))
        else:
            raise LaunchError("This link has expired. Open Life2Launch from Canvas again.", 401)
    except people.ChooseAccount:
        org = db.get(Organization, data.get("org_id"))
        if not org:
            return pages.error_page("This school isn't on Life2Launch any more.", 404)
        base, ttl = canvas_session.org_base_url(db, org), canvas_session.LINK_TICKET_TTL_SECONDS
        link_ticket = canvas_session.issue_ticket({**data, "kind": "link"}, ttl=ttl)
        return pages.choose_account(
            data.get("email") or "", org.name, f"{base}/api/v1/lti/session", "tab" if mode == "tab" else "frame",
            canvas_session.issue_ticket({**data, "new": True}, ttl=ttl), canvas_session.issue_ticket(dict(data), ttl=ttl),
            f"{base}/api/v1/lti/link?{urlencode({'t': link_ticket})}",
        )
    except people.NeedsAccountLink:
        org = db.get(Organization, data.get("org_id"))
        if not org:
            return pages.error_page("This school isn't on Life2Launch any more.", 404)
        link_ticket = canvas_session.issue_ticket({**data, "kind": "link"}, ttl=canvas_session.LINK_TICKET_TTL_SECONDS)
        return pages.link_needed(f"{canvas_session.org_base_url(db, org)}/api/v1/lti/link?{urlencode({'t': link_ticket})}")
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
        f"{canvas_session.org_base_url(db, org)}/api/v1/lti/session",
        canvas_session.issue_ticket(follow_up),
        canvas_session.issue_ticket(follow_up),
        retried=retry == "1",
    )
    # A launch replaces whatever session this Canvas partition already had (a shared school computer).
    canvas_session.set_canvas_cookies(response, request, access, refresh)
    return response


class TabTicketRequest(BaseModel):
    org_id: int
    path: str = "/"


@router.post("/tab-ticket")
def lti_tab_ticket(
    request: Request,
    body: TabTicketRequest,
    current_user=Depends(get_authenticated_user),
    db: Session = Depends(get_db_session),
):
    """Inside Canvas, "Open in new tab": a 60-second one-use ticket the page posts to our own site in a new tab,
    which signs the same person in there with ordinary first-party cookies. No token in any URL."""
    if not isinstance(current_user, PublicUser) or not canvas_session.is_canvas_session(request):
        raise HTTPException(status_code=403, detail="Only available inside Canvas")
    if not db.get(Organization, body.org_id):
        raise HTTPException(status_code=404, detail="Organization not found")
    ticket = canvas_session.issue_ticket(
        {"kind": "session", "email": current_user.email, "org_id": body.org_id,
         "return": canvas_session.safe_return_path(body.path)},
        ttl=canvas_session.TAB_TICKET_TTL_SECONDS,
    )
    return {"ticket": ticket}


# ---------------------------------------------------------------------------
# Sign in once to link (an email that already has an account outside the school)
# ---------------------------------------------------------------------------

def _link_ticket(t: str) -> dict | None:
    data = canvas_session.peek_ticket(t)
    return data if data and data.get("kind") == "link" else None


@router.get("/link")
async def lti_link_page(
    request: Request,
    t: str = "",
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    """Opened in a tab of our own from the Canvas frame. Signed in as the account with the school email:
    confirm the link. Not signed in: sign in first and come back here."""
    data = _link_ticket(t)
    org = db.get(Organization, data.get("org_id")) if data else None
    if not data or not org:
        return pages.error_page("This link has expired or was already used. Open Life2Launch from Canvas again.", 401)
    from src.services.users.account_emails import find_user

    if not isinstance(current_user, PublicUser):
        here = f"/api/v1/lti/link?{urlencode({'t': t})}"
        # Name the account only when the Canvas email has one; otherwise any account of theirs can take it (DEV-199).
        return pages.link_sign_in(data["email"] if find_user(db, data["email"]) else None, f"/login?{urlencode({'next': here})}")
    if not people.can_link(db, current_user, data["email"]):
        return pages.link_wrong_account(current_user.email, data["email"])
    return pages.link_confirm(current_user.email, org.name, "/api/v1/lti/link", t, canvas_email=data["email"])


@router.post("/link")
async def lti_link(
    t: str = Form(default=""),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    data = _link_ticket(t)
    if not data:
        return pages.error_page("This link has expired or was already used. Open Life2Launch from Canvas again.", 401)
    if not isinstance(current_user, PublicUser):
        return pages.error_page("Sign in first, then open the link again.", 401)
    user = db.get(User, current_user.id)
    if not user or not people.can_link(db, user, data["email"]):
        return pages.link_wrong_account(current_user.email, data["email"])
    if not canvas_session.redeem_ticket(t):  # used once, after the checks
        return pages.error_page("This link has expired or was already used. Open Life2Launch from Canvas again.", 401)
    try:
        launch = _launch_from_ticket(db, data)
        membership = people.link_signed_in_person(db, launch, user)
    except LaunchError as error:
        return pages.error_page(error.message, error.status_code)
    _invalidate_session_cache(user.id)
    org = db.get(Organization, data.get("org_id"))
    if not org:
        return pages.link_done("your school")
    group = courses.course_group(db, launch) if launch.course_id else None
    try:
        path = launch_landing(db, launch, user, membership.role_id, int(group.id) if group else None)
    except LaunchError:
        path = landing_path(membership.role_id, int(group.id) if group else None)
    return pages.link_done(org.name, f"{canvas_session.org_base_url(db, org)}{path}")


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


@router.post("/orgs/{org_id}/groups/{group_id}/class-list")
def pull_class_list(
    org_id: int,
    group_id: int,
    current_user=Depends(get_authenticated_user),
    db: Session = Depends(get_db_session),
):
    """Update from Canvas: read a course group's class list now (staff who manage learners)."""
    return roster.pull_now(db, int(current_user.id), org_id, group_id)
