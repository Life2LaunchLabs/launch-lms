"""Conversation-starter cards on Coach home.

Platform-wide and admin-editable, with one set for learners and one for an organization's staff
and admins. A card is only words: the person sees the label and hint, and clicking it sends
first_message as their opening message. How the coach responds is governed by the normal Coach
instructions, not by anything attached to a card.

CoachPolicy.launch_cards holds either a list (the learner set, as first stored) or
{"learner": [...], "staff": [...]}; an audience that's missing uses the code defaults.
"""

from datetime import datetime
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field as PydanticField, field_validator
from sqlmodel import Session

from src.db.coach import CoachPolicy
from src.db.users import PublicUser
from src.services.coach.policy import POLICY_ID
from src.services.demo.providers import platform_read

MAX_CARDS = 6

Audience = Literal["learner", "staff"]
AUDIENCES: tuple[Audience, ...] = ("learner", "staff")


class HubLaunchCard(BaseModel):
    label: str = PydanticField(min_length=1, max_length=80)
    hint: str = PydanticField(default="", max_length=120)
    first_message: str = PydanticField(min_length=1, max_length=300)

    @field_validator("label", "hint", "first_message", mode="before")
    @classmethod
    def _strip(cls, value):
        return value.strip() if isinstance(value, str) else value


class HubLaunchCardsUpdate(BaseModel):
    cards: list[HubLaunchCard] | None = None


DEFAULT_LAUNCH_CARDS = [
    HubLaunchCard(label="Not sure what comes next", hint="Figure out a first step together", first_message="I'm not sure what to do after high school. Can you help me find one small thing to try first?"),
    HubLaunchCard(label="I have a career in mind", hint="See what it would take to get there", first_message="I have a career in mind and want to know what a good first step would be."),
    HubLaunchCard(label="Build real experience", hint="Projects, jobs and ways to try things", first_message="I want to build experience that shows what I can do. Where could I start?"),
    HubLaunchCard(label="Stay on track to graduate", hint="Check what you still need", first_message="I want to stay on track to graduate. What should I focus on right now?"),
]

DEFAULT_STAFF_LAUNCH_CARDS = [
    HubLaunchCard(label="Help me build a plan", hint="Turn a goal into steps people can follow", first_message="Help me build a plan. I want to turn a goal into clear steps the people I work with can follow."),
    HubLaunchCard(label="What needs my attention?", hint="Work waiting on you and anyone who's stuck", first_message="What needs my attention right now? Show me work waiting on me and anyone who might be stuck."),
    HubLaunchCard(label="Draft a message", hint="Reminders, announcements and check-ins", first_message="Help me draft a message to the people I'm working with."),
    HubLaunchCard(label="Find something to share", hint="Videos, guides and tools for your group", first_message="Help me find a good resource to share with the people I'm working with."),
]

DEFAULTS: dict[str, list[HubLaunchCard]] = {"learner": DEFAULT_LAUNCH_CARDS, "staff": DEFAULT_STAFF_LAUNCH_CARDS}


def _stored_by_audience(record: CoachPolicy | None) -> dict[str, list]:
    stored = record.launch_cards if record else None
    if isinstance(stored, list):
        return {"learner": stored} if stored else {}
    if isinstance(stored, dict):
        return {audience: stored[audience] for audience in AUDIENCES if stored.get(audience)}
    return {}


def launch_card_audience(db_session: Session, user_id: int, org_id: int | None) -> Audience:
    """Staff and admins of the organization get the staff set; everyone else the learner set."""
    if org_id is None:
        return "learner"
    from src.services.school.roles import is_staff

    return "staff" if is_staff(db_session, org_id, user_id) else "learner"


def effective_launch_cards(db_session: Session, audience: Audience = "learner") -> list[dict]:
    # Learners in a demo see the platform's live cards, not the code defaults.
    return platform_read(db_session, lambda session: _stored_or_default_cards(session, audience))


def _stored_or_default_cards(db_session: Session, audience: Audience) -> list[dict]:
    stored = _stored_by_audience(db_session.get(CoachPolicy, POLICY_ID)).get(audience)
    cards = [HubLaunchCard(**card) for card in stored] if stored else DEFAULTS[audience]
    return [card.model_dump() for card in cards]


def launch_cards_settings(db_session: Session, audience: Audience = "learner") -> dict:
    stored = _stored_by_audience(db_session.get(CoachPolicy, POLICY_ID))
    return {"audience": audience, "cards": effective_launch_cards(db_session, audience), "is_default": audience not in stored}


def save_launch_cards(db_session: Session, current_user: PublicUser, cards: list[HubLaunchCard] | None, audience: Audience = "learner") -> dict:
    """Replace one audience's cards, or restore its defaults when cards is None."""
    if cards is not None:
        if not 1 <= len(cards) <= MAX_CARDS:
            raise HTTPException(status_code=422, detail=f"Use between 1 and {MAX_CARDS} cards.")
    record = db_session.get(CoachPolicy, POLICY_ID)
    if record is None:
        record = CoachPolicy(id=POLICY_ID)
    stored = _stored_by_audience(record)
    if cards is None:
        stored.pop(audience, None)
    else:
        stored[audience] = [c.model_dump() for c in cards]
    record.launch_cards = stored or None
    record.updated_by_user_id = current_user.id
    record.updated_at = datetime.utcnow()
    db_session.add(record)
    db_session.commit()
    return launch_cards_settings(db_session, audience)


