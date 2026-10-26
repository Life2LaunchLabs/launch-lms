"""Insights: run cards for a dashboard, open the learners behind a number, and list what cards can be made of."""

from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.insights import engine
from src.services.insights.spec import CardSpec, CustomRange

router = APIRouter()


class ScopeRef(BaseModel):
    kind: Literal["org", "plan", "group", "learner"] = "org"
    key: str | None = None


class CardIn(BaseModel):
    key: str = Field(max_length=64)
    spec: dict


class RunCards(BaseModel):
    scope: ScopeRef = Field(default_factory=ScopeRef)
    range: Literal["28d", "90d", "12m", "all"] | CustomRange = "90d"
    cards: list[CardIn] = Field(default_factory=list, max_length=40)


class DrillRequest(BaseModel):
    scope: ScopeRef = Field(default_factory=ScopeRef)
    range: Literal["28d", "90d", "12m", "all"] | CustomRange = "90d"
    spec: CardSpec
    drill: str = Field(default="all", max_length=500)


@router.get("/registry")
def api_registry(org_id: int, scope: Literal["org", "plan", "group", "learner"] = Query(default="org"), key: str | None = None,
                 db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return engine.registry(engine.context(db, user, org_id, scope, key))


@router.post("/cards/run")
def api_run_cards(org_id: int, payload: RunCards, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    ctx = engine.context(db, user, org_id, payload.scope.kind, payload.scope.key)
    return {"results": engine.run_cards(ctx, [card.model_dump() for card in payload.cards], payload.range)}


@router.post("/drill")
def api_drill(org_id: int, payload: DrillRequest, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    ctx = engine.context(db, user, org_id, payload.scope.kind, payload.scope.key)
    return engine.drill(ctx, payload.spec, payload.drill, payload.range)
