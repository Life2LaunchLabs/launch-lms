"""Insights: dashboards, running their cards, the learners behind a number, and what cards can be made of."""

from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.insights import captures, context, dashboards, engine, rules
from src.services.insights.spec import CardSpec, CustomRange

router = APIRouter()
# Read-only links open signed out, so they sit outside the router's sign-in dependency (``src/router.py``).
public_router = APIRouter()


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


class DashboardCreate(BaseModel):
    scope: Literal["org", "plan", "group", "learner"] = "org"
    title: str | None = Field(default=None, max_length=120)
    description: str = Field(default="", max_length=500)
    visibility: Literal["me", "staff", "admins"] = "me"
    template: str | None = Field(default=None, max_length=64)
    document: dict | None = None


class DashboardSave(BaseModel):
    revision: int
    document: dict | None = None
    title: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    visibility: Literal["me", "staff", "admins"] | None = None


class DashboardDuplicate(BaseModel):
    title: str | None = Field(default=None, max_length=120)


class CaptureCreate(BaseModel):
    key: str | None = Field(default=None, max_length=200)
    range: Literal["28d", "90d", "12m", "all"] | CustomRange | None = None
    note: str = Field(default="", max_length=2000)
    attach: list[str] = Field(default_factory=list, max_length=8)


class CaptureNote(BaseModel):
    note: str = Field(default="", max_length=2000)


class CaptureLink(BaseModel):
    on: bool = True
    days: int | None = None


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


@router.get("/library")
def api_library(org_id: int, scope: Literal["org", "plan", "group", "learner"] = Query(default="org"),
                db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return dashboards.library_for(db, user, org_id, scope)


@router.get("/objects")
def api_objects(org_id: int, scope: Literal["plan", "group", "learner"] = Query(default="plan"), db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """The plans, groups or learners the viewer can open a dashboard on, for the switcher."""
    return {"objects": context.objects(db, context.population(db, user, org_id), scope)}


@router.get("/dashboards")
def api_list_dashboards(org_id: int, scope: Literal["org", "plan", "group", "learner"] | None = None,
                        db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return {"dashboards": dashboards.list_dashboards(db, user, org_id, scope)}


@router.post("/dashboards")
def api_create_dashboard(org_id: int, payload: DashboardCreate, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return dashboards.create_dashboard(db, user, org_id, **payload.model_dump())


@router.get("/dashboards/{dashboard_uuid}")
def api_get_dashboard(org_id: int, dashboard_uuid: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return dashboards.get_dashboard(db, user, org_id, dashboard_uuid)


@router.put("/dashboards/{dashboard_uuid}")
def api_save_dashboard(org_id: int, dashboard_uuid: str, payload: DashboardSave, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return dashboards.save_dashboard(db, user, org_id, dashboard_uuid, **payload.model_dump())


@router.post("/dashboards/{dashboard_uuid}/duplicate")
def api_duplicate_dashboard(org_id: int, dashboard_uuid: str, payload: DashboardDuplicate, db: Session = Depends(get_db_session),
                            user: PublicUser = Depends(get_current_user)):
    return dashboards.duplicate_dashboard(db, user, org_id, dashboard_uuid, payload.title)


@router.delete("/dashboards/{dashboard_uuid}")
def api_delete_dashboard(org_id: int, dashboard_uuid: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return dashboards.delete_dashboard(db, user, org_id, dashboard_uuid)


@router.post("/dashboards/{dashboard_uuid}/captures")
def api_capture_dashboard(org_id: int, dashboard_uuid: str, payload: CaptureCreate, db: Session = Depends(get_db_session),
                          user: PublicUser = Depends(get_current_user)):
    """Freeze the saved dashboard as it shows now, for this viewer, with a note."""
    return captures.capture_dashboard(db, user, org_id, dashboard_uuid, key=payload.key, range_=payload.range, note=payload.note, attach=payload.attach)


@router.get("/captures")
def api_list_captures(org_id: int, dashboard: str | None = None, scope: Literal["org", "plan", "group", "learner"] | None = None, key: str | None = None,
                      mine: bool = False, scheduled: bool | None = None, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return {"captures": captures.list_captures(db, user, org_id, dashboard_uuid=dashboard, scope=scope, key=key, mine=mine, scheduled=scheduled)}


@router.get("/captures/{capture_uuid}")
def api_get_capture(org_id: int, capture_uuid: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return captures.get_capture(db, user, org_id, capture_uuid)


@router.put("/captures/{capture_uuid}/note")
def api_capture_note(org_id: int, capture_uuid: str, payload: CaptureNote, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return captures.update_note(db, user, org_id, capture_uuid, payload.note)


@router.put("/captures/{capture_uuid}/link")
def api_capture_link(org_id: int, capture_uuid: str, payload: CaptureLink, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return captures.set_link(db, user, org_id, capture_uuid, on=payload.on, days=payload.days)


@public_router.get("/shared/{token}")
def api_shared_capture(token: str, db: Session = Depends(get_db_session)):
    """A capture's read-only link: no sign-in, small numbers hidden, no names."""
    return captures.shared(db, token)


@router.get("/rules")
def api_list_rules(org_id: int, dashboard: str | None = None, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Scheduled captures the viewer can see, optionally for one dashboard."""
    return {"rules": rules.list_rules(db, user, org_id, dashboard)}


@router.post("/dashboards/{dashboard_uuid}/rules")
def api_create_rule(org_id: int, dashboard_uuid: str, payload: rules.RuleIn, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return rules.create_rule(db, user, org_id, dashboard_uuid, payload)


@router.put("/rules/{rule_uuid}")
def api_update_rule(org_id: int, rule_uuid: str, payload: rules.RuleIn, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return rules.update_rule(db, user, org_id, rule_uuid, payload)


@router.delete("/rules/{rule_uuid}")
def api_delete_rule(org_id: int, rule_uuid: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    return rules.delete_rule(db, user, org_id, rule_uuid)


@router.post("/rules/{rule_uuid}/run")
def api_run_rule(org_id: int, rule_uuid: str, db: Session = Depends(get_db_session), user: PublicUser = Depends(get_current_user)):
    """Run a schedule now, to try it; its next run stays as it was."""
    return rules.run_now(db, user, org_id, rule_uuid)
