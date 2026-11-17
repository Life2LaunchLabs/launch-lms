"""Who may open a stored file under ``/content/...`` (DEV-137).

Both content routers (S3 and filesystem) ask :func:`check_content_access` before
serving a file. It returns ``True`` when the file is public (shared caches may
keep it) and ``False`` when it was allowed for this viewer only. Anyone else gets
a 404, never a 403, so a link does not reveal that a learner's file exists.

- ``orgs/<uuid>/podcasts/...``: retired, never served.
- ``orgs/<uuid>/...``: organization content and branding, public.
- ``users/<uuid>/avatars|profile_covers|profile_featured/...``: profile images, public.
- ``users/<uuid>/...`` (media library uploads: step hand-ins, portfolio files,
  imports; resource notes and outcomes): public only when the learner put the
  file on their profile (their avatar or profile) or on their published public
  portfolio. Otherwise it opens for a signed-in viewer who is the owner, a
  superadmin, staff (admin or staff role) in an organization the owner belongs
  to, someone sharing one of the owner's plans with them (plan collaborators see
  the work on that plan), or an API token of such an organization.
- Demo workspaces (``user_demo_<session>_...``, ``org_demo_<session>_...``) are
  copies isolated per session by the demo middleware: a visitor in that session
  opens its files.
- Any other path needs a signed-in viewer.
"""

from __future__ import annotations

import re
import time
from collections.abc import Iterable

from fastapi import HTTPException
from sqlmodel import Session, col, or_, select

from src.db.users import AnonymousUser, APITokenUser, PublicUser, User

PUBLIC_USER_DIRECTORIES = frozenset({"avatars", "profile_covers", "profile_featured"})
_CONTENT_PATH = re.compile(r"(?:^|/)content/([^\s\"'<>?#)]+)")
_PORTFOLIO_TTL_SECONDS = 60
_portfolio_cache: dict[int, tuple[float, str, frozenset[str]]] = {}


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="File not found")


def _strings(value) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from _strings(item)
    elif isinstance(value, (list, tuple, set)):
        for item in value:
            yield from _strings(item)


def referenced_paths(value) -> set[str]:
    """Every stored file path (``users/...``, ``orgs/...``) a JSON-like value links to."""
    from urllib.parse import unquote

    paths: set[str] = set()
    for text in _strings(value):
        if "content/" not in text:
            continue
        for match in _CONTENT_PATH.finditer(text):
            paths.add(unquote(match.group(1)))
    return paths


def _on_public_profile(owner: User, path: str) -> bool:
    return path in referenced_paths([owner.avatar_image or "", owner.profile or {}])


def _public_portfolio_paths(owner: User, db: Session) -> frozenset[str]:
    from src.db.portfolio import Portfolio, PortfolioModerationStatus, PortfolioVisibility
    from src.services.portfolio import portfolio_shell

    portfolio = db.exec(select(Portfolio).where(Portfolio.user_id == owner.id)).first()
    if (
        not portfolio
        or not portfolio.published_at
        or getattr(portfolio.visibility, "value", portfolio.visibility) == PortfolioVisibility.PRIVATE.value
        or getattr(portfolio.moderation_status, "value", portfolio.moderation_status) != PortfolioModerationStatus.CLEAR.value
    ):
        return frozenset()
    stamp = f"{portfolio.update_date}:{portfolio.revision}"
    cached = _portfolio_cache.get(int(portfolio.id or 0))
    now = time.monotonic()
    if cached and cached[1] == stamp and now - cached[0] < _PORTFOLIO_TTL_SECONDS:
        return cached[2]
    paths = frozenset(referenced_paths(portfolio_shell(portfolio, db, public_only=True)))
    _portfolio_cache[int(portfolio.id or 0)] = (now, stamp, paths)
    return paths


def _is_staff_of_owner(viewer_id: int, owner_id: int, db: Session) -> bool:
    from src.db.user_organizations import UserOrganization
    from src.security.rbac.constants import ADMIN_OR_MAINTAINER_ROLE_IDS

    owner_orgs = select(UserOrganization.org_id).where(UserOrganization.user_id == owner_id)
    return db.exec(
        select(UserOrganization.id).where(
            UserOrganization.user_id == viewer_id,
            col(UserOrganization.role_id).in_(ADMIN_OR_MAINTAINER_ROLE_IDS),
            col(UserOrganization.org_id).in_(owner_orgs),
        )
    ).first() is not None


def _shares_a_plan(viewer_id: int, owner_id: int, db: Session) -> bool:
    """The viewer has a role on a plan the owner owns, is the learner on, or works on."""
    from src.db.goal_sharing import PlanCollaborator
    from src.db.goals import Goal
    from src.services.goals import access

    collaborating = select(PlanCollaborator.goal_id).where(
        PlanCollaborator.user_id == owner_id, PlanCollaborator.active == True  # noqa: E712
    )
    goals = db.exec(
        select(Goal).where(
            or_(Goal.owner_user_id == owner_id, Goal.subject_user_id == owner_id, col(Goal.id).in_(collaborating))
        ).limit(200)
    ).all()
    return any(access.capabilities(db, goal, viewer_id) for goal in goals)


def _in_demo_session(identifier: str) -> bool:
    from src.services.demo.context import current_demo

    context = current_demo.get()
    return bool(context) and f"_demo_{context.session_id}_" in identifier


def _user_file_access(
    parts: list[str],
    path: str,
    current_user: PublicUser | AnonymousUser | APITokenUser,
    db: Session,
) -> bool:
    if len(parts) < 3:
        raise _not_found()
    owner_uuid, directory = parts[1], parts[2]
    if directory in PUBLIC_USER_DIRECTORIES:
        return True
    if _in_demo_session(owner_uuid):
        return False
    owner = db.exec(select(User).where(User.user_uuid == owner_uuid)).first()
    if not owner or owner.id is None:
        raise _not_found()
    if _on_public_profile(owner, path) or path in _public_portfolio_paths(owner, db):
        return True
    if isinstance(current_user, AnonymousUser):
        raise _not_found()
    if isinstance(current_user, APITokenUser):
        from src.security.org_auth import get_user_org

        if get_user_org(owner.id, current_user.org_id, db):
            return False
        raise _not_found()
    viewer_id = current_user.id
    if viewer_id == owner.id:
        return False
    from src.security.superadmin import is_user_superadmin

    if (
        is_user_superadmin(viewer_id, db)
        or _is_staff_of_owner(viewer_id, owner.id, db)
        or _shares_a_plan(viewer_id, owner.id, db)
    ):
        return False
    raise _not_found()


def check_content_access(
    file_path: str,
    current_user: PublicUser | AnonymousUser | APITokenUser,
    db: Session,
) -> bool:
    """Raise unless the viewer may open ``file_path`` (relative to ``content/``); True when it is public."""
    path = file_path.replace("\\", "/").lstrip("/")
    parts = path.split("/")

    if len(parts) >= 3 and parts[0] == "orgs" and parts[2] == "podcasts":
        raise _not_found()
    if len(parts) >= 2 and parts[0] == "orgs":
        return True
    if parts[0] == "users":
        return _user_file_access(parts, path, current_user, db)
    if isinstance(current_user, AnonymousUser):
        raise HTTPException(status_code=401, detail="Authentication required")
    return False


def cache_control(public: bool) -> str:
    """Public files may sit in shared caches; private ones only in the viewer's browser."""
    return "public, max-age=86400" if public else "private, max-age=3600"
