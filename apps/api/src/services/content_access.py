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
  portfolio. Otherwise it opens for a signed-in viewer who is the owner or a
  superadmin, and for others only when the file is part of a plan they can see
  (DEV-160): someone sharing the plan (its collaborators) opens the files on that
  plan, and staff (admin or staff role) of the organization that manages a plan
  (one it issued: assigned, joined or started from its template) open the files
  on it, as does an API token of that organization. A learner's other uploads
  (personal plans, another organization's plans, unpublished portfolio files,
  resource notes) don't open for staff. A staff member's own uploads (files they
  attach to templates or feedback) still open for their organization's staff.
  "On a plan" means anywhere the plan shows it: step entries and submissions,
  answers, notes and feedback, step materials, plan attachments, the portfolio
  items a portfolio step counts (not the ones the learner hid), and answers in
  the plan's interactive activities.
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


def _staff_org_ids(user_id: int, db: Session) -> set[int]:
    from src.db.user_organizations import UserOrganization
    from src.security.rbac.constants import ADMIN_OR_MAINTAINER_ROLE_IDS

    return {int(org_id) for org_id in db.exec(
        select(UserOrganization.org_id).where(
            UserOrganization.user_id == user_id,
            col(UserOrganization.role_id).in_(ADMIN_OR_MAINTAINER_ROLE_IDS),
        )
    ).all()}


def _goal_files(goals: list, db: Session, staff_goal_ids: set[int]) -> dict[int, set[str]]:
    """The stored files each plan shows, by goal id. Staff-only notes count only on ``staff_goal_ids``."""
    from src.db.goal_sharing import PlanAttachment
    from src.db.goals import GoalStep, StepEntry, StepProgress
    from src.db.learning import LearningResponseAttempt, LearningRun
    from src.db.media import MediaAsset
    from src.services.goals import portfolio_steps

    by_id = {int(goal.id): goal for goal in goals}
    found: dict[int, list] = {goal_id: [] for goal_id in by_id}
    if not by_id:
        return {}
    steps = db.exec(select(GoalStep).where(col(GoalStep.goal_id).in_(list(by_id)))).all()
    step_goal = {int(step.id): int(step.goal_id) for step in steps}
    progress = {int(row.step_id): row for row in db.exec(select(StepProgress).where(col(StepProgress.step_id).in_(list(step_goal) or [-1]))).all()}
    asset_goals: list[tuple[int, int]] = []
    for step in steps:
        goal_id = int(step.goal_id)
        found[goal_id].append(step.materials or [])
        row = progress.get(int(step.id))
        if row:
            found[goal_id].extend([row.submission or {}, row.answer, row.learner_note, row.reviewer_note, row.feedback_history or []])
            if goal_id in staff_goal_ids:
                found[goal_id].append(row.staff_notes or [])
        if step.type == "portfolio" and portfolio_steps.spec(step.config or {}):
            state = portfolio_steps.evaluate(db, step, by_id[goal_id].subject_user_id, row)
            if state:
                found[goal_id].extend(item.image_url for item in state["found"] if item.key not in state["hidden"])
    for entry in db.exec(select(StepEntry).where(col(StepEntry.step_id).in_(list(step_goal) or [-1]))).all():
        goal_id = step_goal[int(entry.step_id)]
        found[goal_id].extend([entry.url, entry.note, entry.data or {}])
        if entry.asset_id:
            asset_goals.append((int(entry.asset_id), goal_id))
    for attachment in db.exec(select(PlanAttachment).where(col(PlanAttachment.goal_id).in_(list(by_id)))).all():
        asset_goals.append((int(attachment.asset_id), int(attachment.goal_id)))
    if asset_goals:
        assets = {int(asset.id): asset for asset in db.exec(select(MediaAsset).where(col(MediaAsset.id).in_({asset_id for asset_id, _ in asset_goals}))).all()}
        for asset_id, goal_id in asset_goals:
            asset = assets.get(asset_id)
            if asset:
                found[goal_id].extend([asset.url or "", asset.thumbnail_url or ""])
    runs = {int(run.id): run for run in db.exec(select(LearningRun).where(col(LearningRun.goal_id).in_(list(by_id)))).all()}
    for run in runs.values():
        found[int(run.goal_id)].append(run.data or {})
    if runs:
        for attempt in db.exec(select(LearningResponseAttempt).where(col(LearningResponseAttempt.run_id).in_(list(runs)))).all():
            found[int(runs[int(attempt.run_id)].goal_id)].append(attempt.answer or {})
    return {goal_id: referenced_paths(values) for goal_id, values in found.items()}


def _on_a_visible_plan(path: str, owner_id: int, viewer_id: int | None, staff_orgs: set[int], db: Session):
    """The plan the file is on that the viewer can see (one they share, or one an organization they staff
    manages), or None. Staff-managed plans come first, so a staff read is logged against its organization.

    ``viewer_id`` is None for an API token, which sees only its organization's plans (``staff_orgs``).
    """
    from src.db.goal_sharing import PlanCollaborator
    from src.db.goals import Goal, GoalOwnership
    from src.services.goals import access

    def collaborating(user_id: int):
        return select(PlanCollaborator.goal_id).where(PlanCollaborator.user_id == user_id, PlanCollaborator.active == True)  # noqa: E712

    related = or_(Goal.owner_user_id == owner_id, Goal.subject_user_id == owner_id, col(Goal.id).in_(collaborating(owner_id)))
    managed = (Goal.ownership == GoalOwnership.EXTERNAL.value) & col(Goal.org_id).in_(staff_orgs or {-1})
    reachable = managed if viewer_id is None else or_(
        managed, Goal.owner_user_id == viewer_id, Goal.subject_user_id == viewer_id, col(Goal.id).in_(collaborating(viewer_id)),
    )
    goals = db.exec(select(Goal).where(related, reachable).order_by(col(Goal.id).desc()).limit(500)).all()

    def staff_of(goal) -> bool:
        return getattr(goal.ownership, "value", goal.ownership) == GoalOwnership.EXTERNAL.value and goal.org_id in staff_orgs

    visible = [goal for goal in goals if staff_of(goal) or (viewer_id is not None and access.capabilities(db, goal, viewer_id))]
    staff_goal_ids = {int(goal.id) for goal in visible if staff_of(goal)}
    files = _goal_files(visible, db, staff_goal_ids)
    holding = [goal for goal in visible if path in files.get(int(goal.id), set())]
    return next((goal for goal in holding if int(goal.id) in staff_goal_ids), holding[0] if holding else None)


def _owner_is_colleague(owner_id: int, staff_orgs: set[int], db: Session) -> bool:
    """The owner is staff of an organization the viewer staffs: their own uploads (template files, feedback)."""
    return bool(staff_orgs) and bool(_staff_org_ids(owner_id, db) & staff_orgs)


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
        token_orgs = {int(current_user.org_id)}
        if _owner_is_colleague(owner.id, token_orgs, db) or _on_a_visible_plan(path, owner.id, None, token_orgs, db) is not None:
            return False
        raise _not_found()
    viewer_id = current_user.id
    if viewer_id == owner.id:
        return False
    from src.security.superadmin import is_user_superadmin

    if is_user_superadmin(viewer_id, db):
        return False
    staff_orgs = _staff_org_ids(viewer_id, db)
    if _owner_is_colleague(owner.id, staff_orgs, db):
        return False
    goal = _on_a_visible_plan(path, owner.id, viewer_id, staff_orgs, db)
    if goal is not None:
        if goal.org_id in staff_orgs and getattr(goal.ownership, "value", goal.ownership) == "external":
            from src.services.orgs import records_access

            records_access.note(db, viewer_id, goal.org_id, owner.id, "file", path.rsplit("/", 1)[-1])
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
