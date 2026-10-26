"""The card engine: any valid spec, for one viewer and one dashboard object, becomes a result.

The steps are the same for every measure: load its facts, keep the viewer's learners, apply the scope and
the card's filters, split the facts into the range and the comparison range, group them by the card's
breakdowns, and write the headline. Every value carries a drill key, so ``drill`` can list exactly the
learners behind it with the same filters.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from statistics import median

from fastapi import HTTPException
from sqlmodel import Session, col, select

from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.services.insights import sentences
from src.services.insights.context import Ctx, Window, compared, compared_label, population, scope, window
from src.services.insights.dimensions import DIMENSIONS, NATURAL_ORDER
from src.services.insights.measures import MEASURES, Fact, Measure
from src.services.insights.spec import CardSpec, Target, check

SHAPE_CHARTS: dict[str, tuple[str, ...]] = {
    "single": ("number", "table"),
    "series": ("line", "columns", "table"),
    "ranked": ("bars", "columns", "table"),
    "split": ("stacked", "bars", "table"),
    "cross": ("stacked", "heatmap", "table"),
}
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
DRILL_LIMIT = 200


def shape_of(spec: CardSpec, measure: Measure) -> str:
    if measure.implicit_by:
        return "cross" if spec.by else "split"
    if spec.by is None:
        return "single"
    if spec.by2 is not None:
        return "cross"
    return "series" if spec.by == "time" else "ranked"


def chart_for(spec: CardSpec, measure: Measure, shape: str, buckets: int = 0, columns: int = 0) -> str:
    if spec.chart != "auto" and spec.chart in SHAPE_CHARTS[shape]:
        return spec.chart
    if shape == "series":
        return "columns" if measure.kind == "count" and 0 < buckets <= 12 else "line"
    if shape == "cross" and not measure.implicit_by:
        return "stacked" if columns <= 5 else "heatmap"
    return SHAPE_CHARTS[shape][0]


# Facts --------------------------------------------------------------------------------------------

def _values(fact: Fact, field: str) -> list[str]:
    raw = fact.dims.get(field)
    if raw is None:
        return []
    return [str(item) for item in raw] if isinstance(raw, list) else [str(raw)]


def _kept(ctx: Ctx, spec: CardSpec, measure: Measure, facts: Iterable[Fact]) -> list[Fact]:
    """The viewer's learners (active ones unless the card says otherwise), the scope, and the card's filters."""
    statuses = ("active",)
    for item in spec.filters:
        if item.field == "learner_status":
            statuses = tuple(item.values) if item.op == "in" else tuple(status for status in ("active", "alumni") if status not in item.values)
    people = ctx.pop.learners(statuses)
    kind, key = ctx.scope.kind, ctx.scope.key
    settled = ctx.today - timedelta(days=measure.settle_days) if measure.settle_days else None
    out = []
    for fact in facts:
        if fact.user_id not in people:
            continue
        if kind == "plan" and key not in _values(fact, "plan"):
            continue
        if kind == "group" and key not in _values(fact, "group"):
            continue
        if kind == "learner" and fact.user_id != ctx.scope.id:
            continue
        if settled and fact.at > settled:
            continue
        if any(not _matches(fact, item.field, item.op, item.values) for item in spec.filters if item.field != "learner_status"):
            continue
        out.append(fact)
    return out


def _matches(fact: Fact, field: str, op: str, values: list[str]) -> bool:
    hit = bool(set(_values(fact, field)) & set(values))
    return hit if op == "in" else not hit


def _cell(measure: Measure, facts: list[Fact]) -> dict:
    if measure.kind == "distinct":
        users = {fact.user_id for fact in facts}
        return {"v": float(len(users)), "n": len(users)}
    if measure.kind == "rate":
        den = sum(fact.den for fact in facts)
        return {"v": (sum(fact.num for fact in facts) / den) if den else None, "n": round(den)}
    if measure.kind == "median":
        values = [fact.value for fact in facts if fact.value is not None]
        return {"v": float(median(values)) if values else None, "n": len(values)}
    return {"v": float(sum(fact.num for fact in facts)), "n": len(facts)}


def _labelled(ctx: Ctx, measure: Measure, cell: dict) -> dict:
    return {**cell, "text": sentences.fmt(measure, cell.get("v")), "few": measure.kind in ("rate", "median") and cell.get("n", 0) < sentences.MIN_N}


# Time ---------------------------------------------------------------------------------------------

def bucket_of(day: date, bucket: str) -> date:
    if bucket == "month":
        return day.replace(day=1)
    if bucket == "week":
        return day - timedelta(days=day.weekday())
    return day


def _buckets(start: date, end: date, bucket: str) -> list[date]:
    out, cursor = [], bucket_of(start, bucket)
    while cursor < end:
        out.append(cursor)
        cursor = (cursor.replace(year=cursor.year + (cursor.month == 12), month=cursor.month % 12 + 1) if bucket == "month"
                  else cursor + timedelta(days=7 if bucket == "week" else 1))
    return out


def _period(day: date, bucket: str) -> tuple[str, str]:
    """A bucket's axis label and how a sentence names it."""
    if bucket == "month":
        return f"{MONTHS[day.month - 1]} {day.year}", f"{MONTHS[day.month - 1]} {day.year}"
    label = f"{MONTHS[day.month - 1]} {day.day}"
    return label, f"the week of {label}" if bucket == "week" else label


def _range_label(win: Window, snapshot: bool) -> str:
    if snapshot:
        return "today"
    if win.preset in ("28d", "90d"):
        return f"last {win.preset[:-1]} days"
    if win.preset == "12m":
        return "last 12 months"
    if win.preset == "all" or win.start is None:
        return "all time"
    last = win.end - timedelta(days=1)
    return f"{MONTHS[win.start.month - 1]} {win.start.day} to {MONTHS[last.month - 1]} {last.day}, {last.year}"


# Drill keys ---------------------------------------------------------------------------------------

def drill_key(**parts: str | None) -> str:
    return ";".join(f"{name}={value}" for name, value in parts.items() if value is not None) or "all"


def _parse_drill(key: str) -> dict[str, str]:
    if not key or key == "all":
        return {}
    return dict(part.split("=", 1) for part in key.split(";") if "=" in part)


# Running a card -----------------------------------------------------------------------------------

@dataclass
class Loaded:
    measure: Measure
    win: Window
    other: Window | None
    current: list[Fact]
    previous: list[Fact]


def _load(ctx: Ctx, spec: CardSpec, inherit) -> Loaded:
    measure = MEASURES[spec.measure]
    win = window(spec.range, inherit, ctx.today)
    compare = None if isinstance(spec.compare, Target) or measure.snapshot else spec.compare
    other = compared(win, compare)
    since = min(day for day in (win.start, other.start if other else None) if day) if win.start else None
    facts = _kept(ctx, spec, measure, measure.load(ctx, since))
    if measure.snapshot:
        return Loaded(measure, win, None, facts, [])
    if win.start is None and facts:
        win = Window(min(fact.at for fact in facts), win.end, win.preset)
    current = [fact for fact in facts if win.contains(fact.at)]
    previous = [fact for fact in facts if other.contains(fact.at)] if other else []
    return Loaded(measure, win, other, current, previous)


def _grouped(facts: list[Fact], field: str) -> dict[str, list[Fact]]:
    out: dict[str, list[Fact]] = {}
    for fact in facts:
        for value in _values(fact, field):
            out.setdefault(value, []).append(fact)
    return out


def _sorted_keys(measure: Measure, field: str, cells: dict[str, dict]) -> list[str]:
    if DIMENSIONS[field].order == "natural":
        order = NATURAL_ORDER.get(field)
        return sorted(cells, key=lambda key: order.index(key) if order and key in order else len(order or []))
    reverse = measure.direction != "down"
    present = [key for key in cells if cells[key].get("v") is not None]
    missing = [key for key in cells if cells[key].get("v") is None]
    return sorted(present, key=lambda key: cells[key]["v"], reverse=reverse) + missing


def _labels(ctx: Ctx, field: str, keys: list[str]) -> dict[str, str]:
    labeller = DIMENSIONS[field].labels
    return labeller(ctx, keys) if labeller else {}


def _rows(ctx: Ctx, measure: Measure, field: str, current: list[Fact], previous: list[Fact], extra: dict | None = None) -> tuple[list[dict], dict | None]:
    groups, before = _grouped(current, field), _grouped(previous, field)
    cells = {key: _cell(measure, facts) for key, facts in groups.items()}
    keys = _sorted_keys(measure, field, cells)
    shown, rest = keys[:sentences.TOP_ROWS], keys[sentences.TOP_ROWS:]
    names = _labels(ctx, field, shown)
    links_to = DIMENSIONS[field].links_to
    rows = []
    for key in shown:
        prior = _cell(measure, before[key]) if key in before else None
        rows.append({
            "key": key, "label": names.get(key, "Unknown"), **_labelled(ctx, measure, cells[key]),
            "prior": prior["v"] if prior else None, "change": sentences.change_label(measure, cells[key]["v"], prior["v"]) if prior else "",
            "drill": drill_key(**{**(extra or {}), field: key}) if measure.drill else None,
            "link": {"scope": links_to, "key": key} if links_to else None,
        })
    more = None
    if rest:
        facts = list({id(fact): fact for key in rest for fact in groups[key]}.values())
        more = {"count": len(rest), **_labelled(ctx, measure, _cell(measure, facts)), "label": f"{len(rest)} more"}
    return rows, more


def run(ctx: Ctx, spec: CardSpec, inherit=None) -> dict:
    """One card's result for this viewer and dashboard object."""
    loaded = _load(ctx, spec, inherit)
    measure, win, current, previous = loaded.measure, loaded.win, loaded.current, loaded.previous
    shape = shape_of(spec, measure)
    compare = spec.compare
    target = compare.target if isinstance(compare, Target) else None
    against = compared_label(win, compare)
    value = _labelled(ctx, measure, _cell(measure, current))
    prior = _cell(measure, previous) if loaded.other else None
    result: dict = {
        "measure": measure.key, "shape": shape, "unit": measure.unit, "kind": measure.kind, "direction": measure.direction,
        "definition": measure.definition, "value": value, "rows": [], "columns": [], "series": None, "more": None,
        "window": {"start": win.start.isoformat() if win.start else None, "end": (win.end - timedelta(days=1)).isoformat(), "preset": win.preset},
        "as_of": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "drill": drill_key() if measure.drill else None,
    }
    if prior is not None:
        real = sentences.real_change(measure, value, prior)
        result["compare"] = {"v": prior["v"], "text": sentences.fmt(measure, prior["v"]), "change": sentences.change_label(measure, value["v"], prior["v"]),
                             "tone": sentences.tone(measure, value["v"], prior["v"], real), "real": real, "against": against}
    elif target is not None:
        result["compare"] = {"v": target, "text": sentences.fmt(measure, target), "change": "", "tone": "flat", "real": False, "against": "the goal"}
    else:
        result["compare"] = None

    columns = 0
    if shape == "single":
        headline = sentences.single(measure, value, prior, against, target)
        if not measure.snapshot and win.start:
            result["series"] = _series(measure, win, current, [], loaded.other)
    elif shape == "series":
        result["series"] = _series(measure, win, current, previous if compare == "year" else [], loaded.other if compare == "year" else None)
        periods = {"month": "months", "week": "weeks", "day": "days"}[win.bucket]
        headline = sentences.series(measure, result["series"]["points"], value, prior, against, compare if isinstance(compare, str) else "", periods)
    elif shape == "ranked":
        result["rows"], result["more"] = _rows(ctx, measure, spec.by, current, previous)  # type: ignore[arg-type]
        headline = sentences.ranked(measure, result["rows"], DIMENSIONS[spec.by].plural)  # type: ignore[index]
    elif shape == "split":
        result["rows"], _ = _rows(ctx, measure, measure.implicit_by, current, [])  # type: ignore[arg-type]
        headline = sentences.split(measure, result["rows"])
    else:
        inner = measure.implicit_by or spec.by2
        outer = spec.by
        result["rows"], result["more"] = _rows(ctx, measure, outer, current, previous)  # type: ignore[arg-type]
        col_cells = {key: _cell(measure, facts) for key, facts in _grouped(current, inner).items()}  # type: ignore[arg-type]
        col_keys = _sorted_keys(measure, inner, col_cells)[:sentences.TOP_ROWS]  # type: ignore[arg-type]
        col_names = _labels(ctx, inner, col_keys)  # type: ignore[arg-type]
        result["columns"] = [{"key": key, "label": col_names.get(key, "Unknown")} for key in col_keys]
        columns = len(col_keys)
        cells = []
        for row in result["rows"]:
            row_facts = [fact for fact in current if row["key"] in _values(fact, outer)]  # type: ignore[arg-type]
            by_col = _grouped(row_facts, inner)  # type: ignore[arg-type]
            row["cells"] = []
            for column in result["columns"]:
                cell = _labelled(ctx, measure, _cell(measure, by_col.get(column["key"], [])))
                cell["drill"] = drill_key(**{outer: row["key"], inner: column["key"]}) if measure.drill else None  # type: ignore[misc]
                row["cells"].append(cell)
                cells.append({**cell, "row_label": row["label"], "col_label": column["label"]})
        headline = sentences.split(measure, [{"key": column["key"], "v": sum((row["cells"][index].get("v") or 0) for row in result["rows"])}
                                             for index, column in enumerate(result["columns"])]) if measure.implicit_by else sentences.cross(measure, cells)
    buckets = len(result["series"]["points"]) if result["series"] else 0
    result["chart"] = chart_for(spec, measure, shape, buckets, columns)
    result["charts"] = list(SHAPE_CHARTS[shape])
    result["headline"] = spec.headline.text.strip() if spec.headline.mode == "custom" else headline
    result["auto_headline"] = headline
    result["subline"] = subline(ctx, spec, measure, win)
    return result


def _series(measure: Measure, win: Window, current: list[Fact], previous: list[Fact], other: Window | None) -> dict:
    bucket = win.bucket
    starts = _buckets(win.start, win.end, bucket)  # type: ignore[arg-type]
    by_bucket: dict[date, list[Fact]] = {}
    for fact in current:
        by_bucket.setdefault(bucket_of(fact.at, bucket), []).append(fact)
    empty = measure.kind in ("count", "distinct", "snapshot")
    points = []
    for start in starts:
        cell = _cell(measure, by_bucket.get(start, [])) if (by_bucket.get(start) or empty) else {"v": None, "n": 0}
        label, period = _period(start, bucket)
        points.append({"key": start.isoformat(), "label": label, "period": period, **cell, "drill": drill_key(time=start.isoformat()) if measure.drill else None})
    ghost = None
    if other and previous:
        shift = win.start - other.start  # type: ignore[operator]
        before: dict[date, list[Fact]] = {}
        for fact in previous:
            before.setdefault(bucket_of(fact.at + shift, bucket), []).append(fact)
        ghost = [(_cell(measure, before.get(start, [])) if (before.get(start) or empty) else {"v": None, "n": 0})["v"] for start in starts]
    return {"bucket": bucket, "points": points, "ghost": ghost}


def subline(ctx: Ctx, spec: CardSpec, measure: Measure, win: Window) -> str:
    """What the card shows, in plain words, so a custom headline still has an honest description."""
    parts = [measure.label]
    if spec.by:
        parts[0] += f" by {DIMENSIONS[spec.by].label.lower()}"
    if spec.by2:
        parts[0] += f" and {DIMENSIONS[spec.by2].label.lower()}"
    for item in spec.filters:
        if item.field == "learner_status":
            parts.append(("alumni" if item.values == ["alumni"] else "active and alumni learners") if item.op == "in" else "active learners")
            continue
        names = list(_labels(ctx, item.field, item.values).values()) or item.values
        label = DIMENSIONS[item.field].label.lower() if item.field in DIMENSIONS else item.field
        parts.append(f"{'not ' if item.op == 'not_in' else ''}{label}: {', '.join(names[:3])}{'…' if len(names) > 3 else ''}")
    parts.append(_range_label(win, measure.snapshot))
    return " · ".join(parts)


# Requests -----------------------------------------------------------------------------------------

def context(db: Session, viewer: PublicUser, org_id: int, scope_kind: str = "org", scope_key: str | None = None, today: date | None = None) -> Ctx:
    pop = population(db, viewer, org_id)
    return Ctx(db=db, pop=pop, scope=scope(db, pop, scope_kind, scope_key), today=today or date.today())


def run_cards(ctx: Ctx, cards: list[dict], inherit=None) -> dict:
    """Several cards at once (a dashboard), each with its result or what is wrong with its spec."""
    out = {}
    for card in cards:
        key = str(card.get("key") or len(out))
        try:
            spec = CardSpec.model_validate(card.get("spec") or {})
        except ValueError as error:
            out[key] = {"error": "invalid", "errors": [{"field": "spec", "message": str(error)}]}
            continue
        problems = check(spec, ctx.scope.kind, see_reports=ctx.pop.see_reports)
        if problems:
            locked = any("See reports" in problem["message"] for problem in problems)
            out[key] = {"error": "locked" if locked else "invalid", "errors": problems}
            continue
        out[key] = run(ctx, spec, inherit)
    return out


def drill(ctx: Ctx, spec: CardSpec, key: str, inherit=None) -> dict:
    """The learners behind one value of a card: the same facts the card counted, narrowed to the value."""
    problems = check(spec, ctx.scope.kind, see_reports=ctx.pop.see_reports)
    if problems:
        raise HTTPException(status_code=422, detail={"errors": problems})
    loaded = _load(ctx, spec, inherit)
    if not loaded.measure.drill:
        raise HTTPException(status_code=422, detail="This card's numbers don't open a list of people")
    wanted = _parse_drill(key)
    bucket = loaded.win.bucket
    facts = []
    for fact in loaded.current:
        if "time" in wanted and bucket_of(fact.at, bucket).isoformat() != wanted["time"]:
            continue
        if any(field != "time" and value not in _values(fact, field) for field, value in wanted.items()):
            continue
        facts.append(fact)
    counted: dict[int, dict] = {}
    for fact in facts:
        entry = counted.setdefault(fact.user_id, {"facts": 0, "hit": False, "last": fact.at})
        entry["facts"] += 1
        entry["hit"] = entry["hit"] or fact.num > 0
        entry["last"] = max(entry["last"], fact.at)
    users = {int(user.id): user for user in ctx.db.exec(select(User).where(col(User.id).in_(list(counted)))).all()} if counted else {}  # type: ignore[arg-type]
    groups = ctx.groups_of()
    group_names = dict(ctx.db.exec(select(UserGroup.usergroup_uuid, UserGroup.name).where(UserGroup.org_id == ctx.org_id)).all())
    people = []
    for user_id, entry in sorted(counted.items(), key=lambda item: (not item[1]["hit"], -item[1]["facts"], item[0])):
        user = users.get(user_id)
        if not user:
            continue
        people.append({
            "id": user_id, "user_uuid": user.user_uuid, "username": user.username, "first_name": user.first_name, "last_name": user.last_name,
            "avatar_image": user.avatar_image, "groups": [group_names[uuid] for uuid in groups.get(user_id, []) if uuid in group_names],
            "count": entry["facts"], "counted": entry["hit"] if loaded.measure.kind == "rate" else True, "last": entry["last"].isoformat(),
        })
    return {"total": len(people), "people": people[:DRILL_LIMIT], "truncated": len(people) > DRILL_LIMIT}


def registry(ctx: Ctx) -> dict:
    """What a card can be made of, for this viewer and scope: measures, dimensions, charts and ranges."""
    return {
        "measures": [{
            "key": measure.key, "label": measure.label, "definition": measure.definition, "kind": measure.kind, "unit": measure.unit,
            "direction": measure.direction, "dims": [dim for dim in measure.dims if dim != {"plan": "plan", "group": "group"}.get(ctx.scope.kind)],
            "scopes": list(measure.scopes), "snapshot": measure.snapshot, "available": measure.needs != "see_reports" or ctx.pop.see_reports,
            "keywords": list(measure.keywords),
        } for measure in MEASURES.values() if ctx.scope.kind in measure.scopes],
        "dimensions": [{"key": dim.key, "label": dim.label, "available": dim.needs != "see_reports" or ctx.pop.see_reports} for dim in DIMENSIONS.values()],
        "charts": SHAPE_CHARTS, "ranges": ["28d", "90d", "12m", "all", "custom"],
    }
