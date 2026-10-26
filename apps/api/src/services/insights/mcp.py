"""Insights tools for the Launch LMS MCP server: read and write dashboards, try a card, capture and schedule.

Every tool acts as the connected admin or staff member, so it sees what they see in Insights: the
dashboards shared with them, and only the numbers their permissions allow. ``revision`` is a dashboard's
etag, as in the app: a save at an old revision is refused with the current dashboard to merge into.
"""

from __future__ import annotations

from types import SimpleNamespace
from urllib.parse import quote, urlencode

from fastapi import HTTPException, Request
from pydantic import TypeAdapter, ValidationError
from sqlmodel import Session

from src.services import learning
from src.services.insights import captures, context, dashboards, engine, rules
from src.services.insights.dashboards import MAX_CARDS, SPANS, VISIBILITIES
from src.services.insights.spec import CardSpec, CustomRange, check
from src.services.oauth.config import frontend_url
from src.services.oauth.server import AccessContext

GUIDE = (
    "A dashboard is a list of cards on a 12-column grid, for one scope: the whole organization (org), one plan "
    "(plan), one group (group) or one learner (learner). Nothing in a card names a plan, group or learner: a plan "
    "dashboard is opened on a plan (its key, from list_dashboards' objects or the app), and every card answers for "
    "that plan. A card is {key, span, spec}: key is unique in the dashboard, span is how many columns it takes "
    f"({', '.join(map(str, SPANS))}; 3 is a quarter row, 12 the whole row), and spec says what to compute and how "
    "to show it. Specs: measure (a key from `measures`, the only required field); by (one breakdown from the "
    "measure's dims; time makes a line over the range); by2 (a second breakdown, never time); filters "
    "([{field, op: in|not_in, values}] on the measure's dims, plus learner_status); range (inherit, the "
    "dashboard's own, or 28d|90d|12m|all|{start, end}); compare (prior period, year, none, or {target: n} on a "
    "measure that isn't a count of today); chart (auto picks one; else one the card's shape allows, from `charts`); "
    "headline ({mode: auto} writes a sentence from the result; {mode: custom, text} is yours); note (a line under "
    "the card). Lead with three or four span-3 number cards, then wider cards that break those numbers down. "
    "Start from a template or questions when one fits. Measures marked available: false need the See reports "
    "permission; cards using them are shown locked to people without it. Write the whole document, run "
    "validate_dashboard until it is clean, preview_card any card you are unsure of, then create_dashboard or "
    "save_dashboard with the revision you read. Dashboards are private (visibility me) unless the admin asks to "
    "share with staff or admins. A capture freezes a dashboard as it shows now, with a note, kept forever; a "
    "capture rule takes one on a schedule and sends it to staff (who open it in Insights) or to email addresses "
    "(who get a read-only link where groups of fewer than 10 learners are hidden)."
)
_RANGE = TypeAdapter(CustomRange)


def _range(raw):
    if raw is None or isinstance(raw, str):
        return raw
    try:
        return _RANGE.validate_python(raw)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail={"message": "Range is 28d, 90d, 12m, all or {start, end}", "errors": exc.errors(include_url=False, include_context=False)}) from exc


def _insights_url(db: Session, ctx: AccessContext, dashboard: dict | None = None, key: str | None = None) -> str:
    org = learning._get_org(db, ctx.org_id)
    base = f"{frontend_url()}/orgs/{org.slug}/admin/insights"
    if dashboard is None:
        return base
    path = f"/{dashboard['scope']}/{quote(key, safe='')}" if dashboard["scope"] in ("plan", "group") and key else ""
    return f"{base}{path}?{urlencode({'d': dashboard['dashboard_uuid']})}"


def _dashboard(db: Session, ctx: AccessContext, item: dict, key: str | None = None) -> dict:
    return {**item, "editor_url": _insights_url(db, ctx, item, key)}


async def get_dashboard_schema(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    scope = str(args.get("scope") or "org")
    if scope not in dashboards.SCOPES:
        raise HTTPException(status_code=422, detail=f"Scope is one of: {', '.join(dashboards.SCOPES)}")
    # What a card can be made of depends on the kind of dashboard and the viewer, not on which plan or group it shows.
    pop = context.population(db, ctx.user, ctx.org_id)
    registry = engine.registry(SimpleNamespace(scope=SimpleNamespace(kind=scope), pop=pop))  # type: ignore[arg-type]
    library = dashboards.library_for(db, ctx.user, ctx.org_id, scope)
    return {
        "scope": scope, "guide": GUIDE, "spans": list(SPANS), "max_cards": MAX_CARDS, "visibilities": list(VISIBILITIES),
        "card_spec_schema": CardSpec.model_json_schema(), **registry,
        "templates": [{"key": item["key"], "title": item["title"], "description": item["description"], "cards": item["cards"]} for item in library["templates"]],
        "questions": library["questions"],
    }


async def list_dashboards(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    items = dashboards.list_dashboards(db, ctx.user, ctx.org_id, args.get("scope"))
    out = {"dashboards": [_dashboard(db, ctx, item) for item in items]}
    if args.get("scope") in ("plan", "group"):
        out["objects"] = context.objects(db, context.population(db, ctx.user, ctx.org_id), args["scope"])
    return out


async def get_dashboard(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    """A dashboard's document and revision; with ``run``, each card's result too (plan and group dashboards need ``key``)."""
    item = dashboards.get_dashboard(db, ctx.user, ctx.org_id, str(args["dashboard_uuid"]))
    out = _dashboard(db, ctx, item, args.get("key"))
    if args.get("run"):
        if item["scope"] in ("plan", "group", "learner") and not args.get("key"):
            raise HTTPException(status_code=422, detail=f"A {item['scope']} dashboard runs on one {item['scope']}: pass its key")
        document = item["document"] or {}
        run_ctx = engine.context(db, ctx.user, ctx.org_id, item["scope"], args.get("key"))
        out["results"] = engine.run_cards(run_ctx, document.get("cards", []), _range(args.get("range")) or _range(document.get("range")) or "90d")
    return out


def _report(db: Session, ctx: AccessContext, scope: str, document: dict) -> dict:
    try:
        cleaned = dashboards.clean_document(document, scope)
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
        return {"valid": False, "errors": detail.get("errors") or [{"message": detail["message"]}], "warnings": []}
    see_reports = dashboards._viewer(db, ctx.user, ctx.org_id)["see_reports"]
    warnings = [] if see_reports else [
        {"card": card["key"], "message": "You don't have See reports, so this card shows locked to you; staff with it see it."}
        for card in cleaned["cards"] if check(CardSpec.model_validate(card["spec"]), scope, see_reports=False)
    ]
    return {"valid": True, "errors": [], "warnings": warnings, "document": cleaned}


async def validate_dashboard(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    scope = str(args.get("scope") or "org")
    if scope not in dashboards.SCOPES:
        raise HTTPException(status_code=422, detail=f"Scope is one of: {', '.join(dashboards.SCOPES)}")
    return _report(db, ctx, scope, args.get("document") or {})


async def preview_card(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    """One card's result for this viewer, without saving anything."""
    scope = str(args.get("scope") or "org")
    run_ctx = engine.context(db, ctx.user, ctx.org_id, scope, args.get("key"))
    result = engine.run_cards(run_ctx, [{"key": "preview", "spec": args.get("spec") or {}}], _range(args.get("range")) or "90d")["preview"]
    return {"scope": scope, "key": args.get("key"), "result": result}


async def create_dashboard(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    item = dashboards.create_dashboard(
        db, ctx.user, ctx.org_id, scope=str(args.get("scope") or "org"), title=args.get("title"), description=str(args.get("description") or ""),
        visibility=str(args.get("visibility") or "me"), template=args.get("template"), document=args.get("document"),
    )
    return _dashboard(db, ctx, item)


async def save_dashboard(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    item = dashboards.save_dashboard(
        db, ctx.user, ctx.org_id, str(args["dashboard_uuid"]), revision=int(args["revision"]), document=args.get("document"),
        title=args.get("title"), description=args.get("description"), visibility=args.get("visibility"),
    )
    return _dashboard(db, ctx, item)


async def list_captures(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    items = captures.list_captures(db, ctx.user, ctx.org_id, dashboard_uuid=args.get("dashboard_uuid"), scope=args.get("scope"),
                                   key=args.get("key"), mine=bool(args.get("mine")))
    org = learning._get_org(db, ctx.org_id)
    return {"captures": [{**item, "url": f"{frontend_url()}/orgs/{org.slug}/admin/insights/captures/{item['capture_uuid']}"} for item in items]}


async def capture_dashboard(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    item = captures.capture_dashboard(db, ctx.user, ctx.org_id, str(args["dashboard_uuid"]), key=args.get("key"), range_=_range(args.get("range")),
                                      note=str(args.get("note") or ""), attach=list(args.get("attach") or []))
    org = learning._get_org(db, ctx.org_id)
    return {**item, "url": f"{frontend_url()}/orgs/{org.slug}/admin/insights/captures/{item['capture_uuid']}"}


async def save_capture_rule(request: Request, db: Session, ctx: AccessContext, args: dict) -> dict:
    """Add a capture schedule to a dashboard, or change one (pass rule_uuid; fields left out keep their value)."""
    fields = {name: args[name] for name in rules.RuleIn.model_fields if name in args}
    if args.get("rule_uuid"):
        current = next((item for item in rules.list_rules(db, ctx.user, ctx.org_id) if item["rule_uuid"] == args["rule_uuid"]), None)
        if current is None:
            raise HTTPException(status_code=404, detail="Schedule not found")
        kept = {name: current[name] for name in ("key", "cadence", "day", "on_date", "range", "note", "emails", "link_days", "enabled")}
        fields = {**kept, "staff": [person["user_uuid"] for person in current["staff"]], **fields}
    try:
        body = rules.RuleIn.model_validate(fields)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail={"message": "That schedule isn't valid", "errors": exc.errors(include_url=False, include_context=False)}) from exc
    if args.get("rule_uuid"):
        rule = rules.update_rule(db, ctx.user, ctx.org_id, str(args["rule_uuid"]), body)
    elif args.get("dashboard_uuid"):
        rule = rules.create_rule(db, ctx.user, ctx.org_id, str(args["dashboard_uuid"]), body)
    else:
        raise HTTPException(status_code=422, detail="Pass dashboard_uuid for a new schedule, or rule_uuid to change one")
    return {**rule, "insights_url": _insights_url(db, ctx) + "/captures"}


def summary(name: str, result: dict) -> str | None:
    """The text line for writes (``services/mcp/tools._summary``)."""
    if name in {"create_dashboard", "save_dashboard"}:
        verb = "Created" if name == "create_dashboard" else ("Saved your own copy of" if result.get("copied") else "Saved")
        return (f"{verb} dashboard \"{result['title']}\" ({result['scope']}, {result['card_count']} cards, shared with {result['visibility']}). "
                f"Revision: {result['revision']}. Open it in Launch LMS: {result['editor_url']}")
    if name == "capture_dashboard":
        return f"Captured \"{result['title']}\" ({result.get('object_label') or result['scope']}). Open it in Launch LMS: {result['url']}"
    if name == "save_capture_rule":
        state = f"next on {result['next_run_at']}" if result.get("enabled") and result.get("next_run_at") else "turned off"
        return f"Scheduled captures of \"{result['title']}\": {result['summary']}, {state}. Manage them in Launch LMS: {result['insights_url']}"
    if name == "validate_dashboard" and not result.get("valid"):
        lines = "".join(f"\n{item.get('card', 'dashboard')}.{item.get('field', '')}: {item['message']}" for item in result["errors"])
        return f"The dashboard isn't valid:{lines}"
    return None
