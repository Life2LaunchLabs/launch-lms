"""Conversation-starter cards on the Hub home.

Platform-wide and admin-editable. A card is only words: the learner sees the label and hint,
and clicking it sends first_message as their opening message. How the coach responds is
governed by the normal Hub instructions, not by anything attached to a card.
"""

from datetime import datetime

from fastapi import HTTPException
from pydantic import BaseModel, Field as PydanticField, field_validator
from sqlmodel import Session

from src.db.hub import HubAdvisorConfiguration
from src.db.users import PublicUser
from src.services.hub_configuration import CONFIGURATION_ID, get_configuration_record
from src.services.hub_advisor import DEFAULT_HUB_ADVISOR_INSTRUCTIONS
from src.services.demo.providers import platform_read

MAX_CARDS = 6


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


def effective_launch_cards(db_session: Session) -> list[dict]:
    # Learners in a demo see the platform's live cards, not the code defaults.
    return platform_read(db_session, _stored_or_default_cards)


def _stored_or_default_cards(db_session: Session) -> list[dict]:
    record = get_configuration_record(db_session)
    stored = record.launch_cards if record and record.launch_cards else None
    cards = [HubLaunchCard(**card) for card in stored] if stored else DEFAULT_LAUNCH_CARDS
    return [card.model_dump() for card in cards]


def launch_cards_settings(db_session: Session) -> dict:
    record = get_configuration_record(db_session)
    return {"cards": effective_launch_cards(db_session), "is_default": not (record and record.launch_cards)}


def save_launch_cards(db_session: Session, current_user: PublicUser, cards: list[HubLaunchCard] | None) -> dict:
    """Replace the cards, or restore the defaults when cards is None."""
    if cards is not None:
        if not 1 <= len(cards) <= MAX_CARDS:
            raise HTTPException(status_code=422, detail=f"Use between 1 and {MAX_CARDS} cards.")
    record = get_configuration_record(db_session)
    if record is None:
        record = HubAdvisorConfiguration(id=CONFIGURATION_ID, instructions=DEFAULT_HUB_ADVISOR_INSTRUCTIONS)
    record.launch_cards = [c.model_dump() for c in cards] if cards is not None else None
    record.updated_by_user_id = current_user.id
    record.updated_at = datetime.utcnow()
    db_session.add(record)
    db_session.commit()
    return launch_cards_settings(db_session)
