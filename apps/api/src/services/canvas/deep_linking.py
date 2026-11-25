"""Adding a Life2Launch plan to a Canvas course (LTI Deep Linking, PF-4).

A teacher adding Life2Launch to a module or an assignment gets a deep linking launch. We show the school's
plans in Canvas's frame (pages.plan_picker); the teacher picks one and we post Canvas a signed
LtiDeepLinkingResponse with one ltiResourceLink whose `plan` custom parameter names the plan. Students who open
that item later launch straight into the plan (routers/canvas.py, `plan_landing`).

The picker needs no Life2Launch sign-in: the launch is trusted through Canvas's signature, and the teacher's
pick travels in a one-use ticket that holds Canvas's return address and data.
"""

from __future__ import annotations

import secrets
import time
from urllib.parse import urlsplit

import jwt
from sqlmodel import Session, col, select

from src.db.canvas import CanvasConnection
from src.db.goals import GoalTemplate, GoalTemplateVersion, TemplateStatus
from src.services.canvas import connections, keys
from src.services.canvas.launch import LTI

DL = "https://purl.imsglobal.org/spec/lti-dl/claim/"
DEEP_LINKING_RESPONSE = "LtiDeepLinkingResponse"
# Long enough to browse the school's plans; still one use only.
PICKER_TICKET_TTL_SECONDS = 1800

# The faces of the web's plan colors (components/Goals/planColors.ts), with the ink that reads on each.
PLAN_FACES = {
    "violet": ("#8B5CF6", "#FFFFFF"), "teal": ("#13B3A4", "#FFFFFF"), "amber": ("#F5A524", "#2B1700"),
    "blue": ("#4C8DFF", "#FFFFFF"), "pink": ("#EC4F9A", "#FFFFFF"), "lime": ("#7CC423", "#18230A"),
    "orange": ("#E8642C", "#FFFFFF"), "sky": ("#2CB5E0", "#08222C"),
}
_LEGACY_FACES = {"#7c3aed": "violet", "#0f9f9a": "teal", "#d97706": "amber", "#2563eb": "blue",
                 "#db2777": "pink", "#65a30d": "lime", "#dc2626": "orange", "#0891b2": "sky"}


def plan_color(color: str | None) -> str:
    """The plan color's key (violet when it has none), as the web's planPalette reads it."""
    value = (color or "").strip().lower()
    key = _LEGACY_FACES.get(value) or next((k for k, (face, _) in PLAN_FACES.items() if face.lower() == value), None) or value
    return key if key in PLAN_FACES else "violet"


def _step_count(document: dict) -> int:
    from src.services.goals.document import iter_steps

    return sum(1 for _ in iter_steps(document or {}))


def school_plans(db: Session, org_id: int) -> list[dict]:
    """The plans this school can hand out as they are: its own and the ones it's approved to run, each with a
    live version that has steps. The same set the Assign button offers."""
    from src.services.goals.plan_issuers import runnable_ids

    ids = runnable_ids(db, org_id)
    rows = db.exec(select(GoalTemplate).where(
        (GoalTemplate.org_id == org_id) | col(GoalTemplate.id).in_(ids or [0]),
        GoalTemplate.status != TemplateStatus.ARCHIVED, col(GoalTemplate.published_version_id).is_not(None),
        col(GoalTemplate.system_type).is_(None),
    )).all()
    versions = {int(row.id): row for row in db.exec(select(GoalTemplateVersion).where(
        col(GoalTemplateVersion.id).in_([int(row.published_version_id) for row in rows] or [0]))).all()}  # type: ignore[arg-type]
    plans = []
    for row in rows:
        version = versions.get(int(row.published_version_id))  # type: ignore[arg-type]
        steps = _step_count(version.document) if version else 0
        if not steps:
            continue
        plans.append({"uuid": row.template_uuid, "title": (row.title or "Untitled plan").strip(),
                      "description": (row.description or "").strip(), "steps": steps, "color": plan_color(row.color)})
    return sorted(plans, key=lambda plan: plan["title"].lower())


def find_plan(db: Session, org_id: int, template_uuid: str) -> dict | None:
    return next((plan for plan in school_plans(db, org_id) if plan["uuid"] == template_uuid), None)


def return_url_allowed(url: str, connection: CanvasConnection) -> bool:
    """Only the school's own Canvas gets the teacher's pick back."""
    parts = urlsplit(url or "")
    host = (parts.netloc or "").lower()
    allowed = {connection.canvas_host.lower(), connections.platform_host(connection).lower()} - {""}
    return parts.scheme == connections._scheme(host) and host in allowed


def content_item(plan: dict, graded: bool = False) -> dict:
    """One link to the plan; Canvas sends the `plan` custom parameter back on every launch from it. Added as an
    assignment, it asks Canvas for a gradebook column too (PF-5)."""
    item = {
        "type": "ltiResourceLink",
        "title": plan["title"][:255],
        "url": connections.tool_urls()["launch"],
        "custom": {"plan": plan["uuid"]},
    }
    if plan.get("description"):
        item["text"] = plan["description"][:1000]
    if graded:
        from src.services.canvas.grades import line_item

        item["lineItem"] = line_item(plan)
    return item


def response_jwt(db: Session, connection: CanvasConnection, deployment_id: str, data: str | None,
                 items: list[dict]) -> str:
    """The signed LtiDeepLinkingResponse. An empty list tells Canvas the teacher cancelled."""
    now = int(time.time())
    claims = {
        "iss": connection.client_id,
        "aud": connection.issuer,
        "iat": now,
        "exp": now + 300,
        "nonce": secrets.token_urlsafe(24),
        f"{LTI}deployment_id": deployment_id,
        f"{LTI}message_type": DEEP_LINKING_RESPONSE,
        f"{LTI}version": "1.3.0",
        f"{DL}content_items": items,
    }
    if data is not None:
        claims[f"{DL}data"] = data
    return jwt.encode(claims, keys.private_key_pem(db), algorithm="RS256", headers={"kid": keys.public_jwk(db)["kid"]})
