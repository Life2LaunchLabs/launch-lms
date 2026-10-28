"""What an organization knows about a learner, and kept answers that land in their portfolio.

Learner details are the organization's own fields (``LearningVariable`` rows), stored per learner under
``user.details["variables"]`` by key path. Staff see them in Insights and Coach reads them. A question can also
keep its answer as the learner's strengths or values, which are portfolio traits the learner sees and edits.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlmodel import Session, select

from src.db.learning import LearningVariable
from src.db.portfolio import Portfolio, ProfileTrait
from src.db.users import User

TRAIT_TARGETS = {"user.portfolio.strengths": "strength", "user.portfolio.values": "value"}
MAX_TRAITS = 8


def _lookup(root, key: str):
    current = root
    for part in key.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def _text(value) -> str:
    if isinstance(value, list):
        return ", ".join(str(item) for item in value if str(item).strip())
    if isinstance(value, bool):
        return "Yes" if value else "No"
    return "" if value is None or isinstance(value, dict) else str(value).strip()


def details_for(db: Session, org_id: int | None, user: User | None) -> list[dict]:
    """The organization's learner details that this learner has a value for, in label order."""
    if not org_id or not user:
        return []
    stored = (user.details or {}).get("variables") or {}
    if not stored:
        return []
    rows = db.exec(select(LearningVariable).where(LearningVariable.org_id == org_id)).all()
    items = [{"key": row.key, "label": row.label or row.key, "value": _text(_lookup(stored, row.key))} for row in rows]
    return sorted((item for item in items if item["value"]), key=lambda item: item["label"].lower())


def detail_variables(db: Session, org_id: int | None, user: User | None) -> dict[str, str]:
    """Learner details as render variables (``user.details.variables.<key>``) for activity text."""
    return {f"user.details.variables.{item['key']}": item["value"] for item in details_for(db, org_id, user)}


def traits(db: Session, user_id: int) -> dict[str, str]:
    """Strengths and values as render variables, comma separated."""
    portfolio = db.exec(select(Portfolio).where(Portfolio.user_id == user_id)).first()
    if not portfolio:
        return {}
    rows = db.exec(select(ProfileTrait).where(ProfileTrait.portfolio_id == portfolio.id).order_by(ProfileTrait.sort_order, ProfileTrait.id)).all()  # type: ignore[arg-type]
    return {
        target: ", ".join(row.label for row in rows if row.trait_type == kind)
        for target, kind in TRAIT_TARGETS.items()
    }


def keep_traits(db: Session, portfolio: Portfolio, trait_type: str, value) -> None:
    """Add a kept answer's labels to the learner's strengths or values, skipping ones they already have."""
    labels = value if isinstance(value, list) else str(value or "").split(",")
    labels = [str(label).strip()[:80] for label in labels if str(label).strip()]
    existing = db.exec(select(ProfileTrait).where(ProfileTrait.portfolio_id == portfolio.id, ProfileTrait.trait_type == trait_type)).all()
    have = {row.label.lower() for row in existing}
    now = datetime.utcnow().isoformat()
    order = len(existing)
    for label in dict.fromkeys(labels):
        if label.lower() in have or order >= MAX_TRAITS:
            continue
        db.add(ProfileTrait(
            trait_uuid=f"trt_{uuid4().hex}", portfolio_id=portfolio.id or 0, trait_type=trait_type, label=label,
            source="activity", sort_order=order, creation_date=now, update_date=now,
        ))
        have.add(label.lower())
        order += 1
    portfolio.update_date = now
    db.add(portfolio)
