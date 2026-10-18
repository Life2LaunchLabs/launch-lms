"""Coach tools for the Launch LMS MCP server: read the coaching policy and write the draft's knowledge.

Platform admins only. Tools change the draft, never what learners get: a person releases the draft
on Platform › Coach › Releases.
"""

from __future__ import annotations

from fastapi import HTTPException, Request
from sqlmodel import Session

from src.db.coach import CoachPlaybookWrite
from src.services import learning
from src.services.coach import policy as coach_policy
from src.services.coach import releases
from src.services.oauth.config import frontend_url
from src.services.oauth.server import AccessContext

KNOWLEDGE_GUIDE = (
    "Coach reads the method on every call. Playbooks marked always are added to every call; the others are matched by "
    f"words they share (title and used_when) with the learner's message or the moment, at most {coach_policy.MATCHED_PLAYBOOKS} "
    f"per call, and all knowledge together is capped at {coach_policy.MAX_KNOWLEDGE_CHARS} characters. Routines add "
    "instructions when a trigger happens. Write playbooks as guidance to Coach, in the coaching team's voice; give used_when "
    "the words a learner would actually use. Changes go to the draft; learners get them only when a person releases the draft."
)


def _require_platform_admin(ctx: AccessContext) -> None:
    if not getattr(ctx.user, "is_superadmin", False):
        raise HTTPException(status_code=403, detail="Only platform admins can work on Coach.")


def _coach_url(db: Session, ctx: AccessContext, tab: str = "") -> str:
    org = learning._get_org(db, ctx.default_org_id or ctx.org_id)
    return f"{frontend_url()}/orgs/{org.slug}/admin/platform/coach{tab}"


def _book(book: dict) -> dict:
    return {key: book[key] for key in ("playbook_uuid", "title", "used_when", "body", "always", "enabled")}


async def get_coach_policy(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_platform_admin(ctx)
    view = coach_policy.policy_view(db)
    return {
        "guide": KNOWLEDGE_GUIDE,
        "method": view["method"],
        "playbooks": [_book(book) for book in view["playbooks"]],
        "routines": [{key: item[key] for key in ("routine_uuid", "name", "trigger", "instructions", "tier", "enabled")} for item in view["routines"]],
        "triggers": [{"key": item["key"], "label": item["label"], "detail": item["detail"]} for item in view["triggers"]],
        "abilities": [{"key": item["key"], "label": item["label"], "enabled": item["enabled"]} for item in view["abilities"]],
        "built_in_rules": view["built_in_rules"],
        "release": view["release"],
        "editor_url": _coach_url(db, ctx),
    }


async def preview_coach_knowledge(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    """Which playbooks the draft would give Coach for a learner message."""
    _require_platform_admin(ctx)
    message = str(args["message"])
    draft = coach_policy.draft_runtime(db)
    chosen = draft.knowledge(message)
    titles = [book["title"] for book in draft.playbooks if f'title="{book["title"]}"' in chosen]
    return {"message": message, "playbooks": titles, "knowledge": chosen}


async def save_coach_playbook(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_platform_admin(ctx)
    uuid = args.pop("playbook_uuid", None) or None
    payload = CoachPlaybookWrite(**args)
    book = coach_policy.save_playbook(db, ctx.user, payload, uuid)
    return {"playbook": _book(book), "created": uuid is None, "release": releases.summary(db), "editor_url": _coach_url(db, ctx, "/knowledge")}


async def delete_coach_playbook(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    _require_platform_admin(ctx)
    coach_policy.delete_playbook(db, str(args["playbook_uuid"]))
    return {"deleted": args["playbook_uuid"], "release": releases.summary(db), "editor_url": _coach_url(db, ctx, "/knowledge")}


def summary(name: str, result: dict) -> str | None:
    release = result.get("release") or {}
    pending = len(release.get("draft_changes") or [])
    waiting = f" The draft now has {pending} unreleased change{'s' if pending != 1 else ''}; a person releases it at {result.get('editor_url', '').replace('/knowledge', '')}/releases."
    if name == "save_coach_playbook":
        book = result["playbook"]
        return f"{'Added' if result['created'] else 'Saved'} playbook \"{book['title']}\" ({book['playbook_uuid']}) to the draft.{waiting}"
    if name == "delete_coach_playbook":
        return f"Deleted playbook {result['deleted']} from the draft.{waiting}"
    if name == "preview_coach_knowledge":
        return f"The draft gives Coach: {', '.join(result['playbooks']) or 'no playbooks'}.\n\n{result['knowledge']}"
    return None
