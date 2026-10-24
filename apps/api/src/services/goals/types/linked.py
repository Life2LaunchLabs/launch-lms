"""Activity, Badge and Portfolio: steps that finish on their own when something else happens."""

from __future__ import annotations

from typing import Literal

from fastapi import HTTPException
from pydantic import Field
from sqlmodel import Session, select

from src.db.goals import GoalTemplate
from src.db.learning import LearningActivity
from src.services.goals.types.base import Config, StepState, StepType


class ActivityConfig(Config):
    activity_uuid: str = Field(min_length=1)


class Activity(StepType):
    """Finished by the learner's run of the activity (and grading, when it needs it)."""

    key = "activity"
    label = "Activity"
    config_model = ActivityConfig
    learner_can_complete = False

    def resolve(self, db: Session, config: dict, org_id: int | None) -> dict:
        activity = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == config["activity_uuid"])).first()
        if not activity:
            raise HTTPException(status_code=422, detail=f"Activity not found: {config['activity_uuid']}")
        return {"activity_id": activity.id}


class BadgeConfig(Config):
    # The plan whose badge the learner earns.
    template_uuid: str = Field(min_length=1)


class Badge(StepType):
    """Finished when the learner holds another plan's badge (by finishing that plan, or awarded directly)."""

    key = "badge"
    label = "Badge"
    config_model = BadgeConfig
    learner_can_complete = False

    def resolve(self, db: Session, config: dict, org_id: int | None) -> dict:
        from src.services.badges.definition import badge_block

        template = db.exec(select(GoalTemplate).where(GoalTemplate.template_uuid == config["template_uuid"])).first()
        if not template or not (badge_block(template.document) or _live_badge(db, template)):
            raise HTTPException(status_code=422, detail=f"No plan with a badge: {config['template_uuid']}")
        return {"badge_template_id": template.id}


def _live_badge(db: Session, template: GoalTemplate) -> bool:
    from src.db.goals import GoalTemplateVersion
    from src.services.badges.definition import earns_badge

    return earns_badge(db.get(GoalTemplateVersion, template.published_version_id) if template.published_version_id else None)


PORTFOLIO_CHECKS = ("welcome", "timeline", "project", "traits", "launch", "badges")


class PortfolioConfig(Config):
    check: Literal["welcome", "timeline", "project", "traits", "launch", "badges"]


class Portfolio(StepType):
    """Finished when the learner's portfolio has what the check asks for."""

    key = "portfolio"
    label = "Portfolio"
    config_model = PortfolioConfig
    learner_can_complete = False


class DecisionOption(Config):
    key: str = Field(min_length=1, max_length=120)
    label: str = Field(min_length=1, max_length=300)


class DecisionConfig(Config):
    question: str = Field(default="", max_length=1000)
    options: list[DecisionOption] = Field(default_factory=list, max_length=30)
    multiple: bool = False
    # The learner can write in an option of their own.
    allow_other: bool = True


class DecisionSubmission(Config):
    choices: list[str] = Field(default_factory=list, max_length=30)
    other: str = Field(default="", max_length=300)
    # Steps whose answers this decision rests on; defaults to the stage's Explore steps.
    supporting_step_uuids: list[str] = Field(default_factory=list, max_length=50)


class Decision(StepType):
    key = "decision"
    label = "Decision"
    config_model = DecisionConfig
    submission_model = DecisionSubmission  # type: ignore[assignment]

    def validate_config(self, config: dict | None) -> dict:
        data = super().validate_config(config)
        keys = [option["key"] for option in data.get("options") or []]
        if len(keys) != len(set(keys)):
            raise HTTPException(status_code=422, detail="Decision step: option keys must be unique")
        if not keys and not data.get("allow_other"):
            raise HTTPException(status_code=422, detail="Decision step: give it options or allow a written-in choice")
        return data

    def _chosen(self, state: StepState) -> list[str]:
        labels = {option["key"]: option["label"] for option in state.config.get("options") or []}
        chosen = [labels.get(key, key) for key in state.submission.get("choices") or []]
        other = str(state.submission.get("other") or "").strip()
        return [*chosen, other] if other else chosen

    def completion_blocker(self, state: StepState) -> str | None:
        chosen = self._chosen(state)
        if not chosen:
            return "Make a choice first"
        if len(chosen) > 1 and not state.config.get("multiple"):
            return "Pick one option"
        known = {option["key"] for option in state.config.get("options") or []}
        if any(key not in known for key in state.submission.get("choices") or []):
            return "Pick from the options"
        if str(state.submission.get("other") or "").strip() and not state.config.get("allow_other"):
            return "Pick from the options"
        return None

    def result(self, state: StepState) -> dict | None:
        chosen = self._chosen(state)
        return {"kind": "choice", "choices": chosen, "reason": state.progress.learner_note or ""} if chosen else None
