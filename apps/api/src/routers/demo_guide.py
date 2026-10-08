"""Visitor guide, release notes and feedback; all served from the control database."""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlmodel import Session, select
from src.core.events.database import engine
from src.db.demo import DemoMember
from src.db.users import User
from src.services.demo.access import claims, operator
from src.services.demo.cohort import default_org
from src.services.demo.lifecycle import active_session
from src.services.security.rate_limiting import check_rate_limit

router = APIRouter()


def control_db():
    with Session(engine) as db:
        yield db


def _environment() -> dict:
    from src.routers.candidate_feedback import feedback_configuration

    try:
        info = feedback_configuration()
    except Exception:
        return {"unstable": False, "feedback_configured": False}
    return {
        "unstable": info["unstable"],
        "feedback_configured": info["feedback_configured"],
        "revision": info["revision"],
    }


def _guide_owner(request: Request, db: Session) -> int:
    """The demo user whose guide applies: the visitor's, or the one being set up."""
    payload = claims(request)
    if payload.get("demo_session"):
        return active_session(db, payload["demo_session"]).pilot_user_id
    operator(request, db)
    user = db.exec(select(User).where(User.email == payload.get("sub"))).first()
    if not payload.get("demo_operator") or not user:
        raise HTTPException(404, "No demo user is active.")
    return user.id


@router.get("/guide")
def guide(request: Request, db: Session = Depends(control_db)):
    member = db.get(DemoMember, _guide_owner(request, db))
    if not member:
        raise HTTPException(404, "No guide is available.")
    return {
        "guide": member.guide or {},
        "description": member.description,
        "role_line": member.role_line,
    }


@router.get("/announcements")
def announcements(request: Request, db: Session = Depends(control_db)):
    """The tester announcements, read from the live board; seen state stays in the browser."""
    _guide_owner(request, db)
    from src.services.candidate_jira import ANNOUNCEMENTS_PROPERTY, CandidateJira

    client = CandidateJira()
    if not client.configured:
        return {"items": []}
    try:
        items = (client.project_property(ANNOUNCEMENTS_PROPERTY) or {}).get("items", [])
    except Exception:
        items = []
    return {"items": list(reversed(items))}


class DemoFeedback(BaseModel):
    message: str = Field(min_length=1, max_length=5000)
    intent: str | None = Field(default=None, max_length=20)
    journey: str | None = Field(default=None, max_length=120)
    rating: str | None = Field(default=None, pattern="^(easy|okay|hard)$")
    context: dict = Field(default_factory=dict)


@router.post("/feedback", status_code=201)
def send_feedback(
    request: Request, body: DemoFeedback, db: Session = Depends(control_db)
):
    """Visitors post here; their sandbox cannot reach the live feedback board."""
    import json

    from src.routers.candidate_feedback import (
        FEEDBACK_INTENTS,
        _clean_message,
        sanitize_context,
    )
    from src.services.candidate_jira import CandidateJira

    identifier = claims(request).get("demo_session")
    if not identifier:
        raise HTTPException(401, "Start a demo session first.")
    session = active_session(db, identifier)
    allowed, _, retry = check_rate_limit(f"demo-feedback:{session.id}", 20, 600)
    if not allowed:
        raise HTTPException(
            429,
            "That's a lot of feedback at once. Please wait a moment.",
            headers={"Retry-After": str(retry)},
        )
    intent = (body.intent or "").strip().casefold() or None
    if intent not in FEEDBACK_INTENTS | {None}:
        raise HTTPException(422, "Unknown feedback intent")
    client = CandidateJira()
    if not client.configured:
        raise HTTPException(503, "Feedback is not connected on this build.")
    user = db.get(User, session.pilot_user_id)
    if not user:
        raise HTTPException(503, "The demo user is unavailable.")
    member = db.get(DemoMember, user.id)
    persona = member.handle if member and member.handle else str(user.id)
    labels = ["launchlms-demo", f"demo-user-{persona}"]
    if session.tag:
        labels.append(f"demo-tag-{session.tag}")
    if body.rating:
        labels.append(f"demo-journey-{body.rating}")
    lines = [_clean_message(body.message)]
    if body.journey:
        lines.append(
            f"\nJourney: {body.journey}"
            + (f" (rated {body.rating})" if body.rating else "")
        )
    issue = client.create_feedback(
        org_id=default_org(db).id,
        user=user,
        message="\n".join(lines),
        intent=intent,
        labels=labels,
    )
    from src.services.candidate_jira import FEEDBACK_PROPERTY

    # Demo context joins the standard feedback metadata on the board.
    client.set_property(
        issue["key"],
        FEEDBACK_PROPERTY,
        {
            **(client.property(issue["key"], FEEDBACK_PROPERTY) or {}),
            "source": "demo",
            "demo_session": session.id,
            "demo_user": persona,
            "demo_tag": session.tag,
            "journey": body.journey,
            "rating": body.rating,
        },
    )
    client.add_comment(
        issue["key"],
        "Anonymous reproduction context (demo session)\n"
        + json.dumps(
            {
                **sanitize_context(json.dumps(body.context)),
                "demo_user": persona,
                "tag": session.tag,
            },
            indent=2,
        ),
        internal=True,
    )
    return {"key": issue["key"]}
