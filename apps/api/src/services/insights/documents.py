"""Document cards: a card that shows a record instead of a number (PL-7).

The Education Plan and Profile is one learner's school record, not a measure, so its card is a document:
``run`` builds the live report for the dashboard's learner and the web shows it as the report. It is an
ordinary card otherwise: it sits on a learner dashboard, a capture freezes what it showed, and the
learner's EPP dashboard is a starter every school gets.

Who sees it: the organization must use school records (services/orgs/school_records.py), the viewer must
be able to open the learner in Insights, and the school must support the learner (an active support link,
services/school/support.py), the same rule as the EPP report page. A read-only capture link never shows it.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone

from src.services.insights.context import Ctx

EPP = "epp_report"


@dataclass(frozen=True)
class Document:
    key: str
    label: str
    definition: str
    scopes: tuple[str, ...]
    build: Callable[[Ctx], dict]
    # When the organization has school records off, the card doesn't exist for it.
    school_records: bool = False


def _epp(ctx: Ctx) -> dict:
    from src.services.epp import report
    from src.services.school import support
    from src.services.users.names import first_name_of

    learner = int(ctx.scope.id)  # type: ignore[arg-type]
    if not support.is_supported(ctx.db, ctx.org_id, ctx.pop.viewer_id, learner):
        first = first_name_of(ctx.scope.label) or "this learner"
        return {"error": "locked", "errors": [{"field": "measure", "message": f"Your school doesn't support {first}'s Education Plan and Profile yet. Ask to support them from their profile."}]}
    built = report.build(ctx.db, ctx.org_id, learner)
    marks = {item["key"]: item["status"] for item in built["components"]}
    done = sum(1 for status in marks.values() if status in ("complete", "reviewed"))
    return {"document": built, "headline": f"{done} of {len(marks)} parts complete", "complete": done == len(marks)}


DOCUMENTS: dict[str, Document] = {item.key: item for item in (
    Document(EPP, "Education Plan and Profile", "The learner's Oregon Education Plan and Profile as it stands now: interests, goals, courses, "
             "graduation progress and the accomplishments they chose. It shows only for learners the school supports.",
             ("learner",), _epp, school_records=True),
)}


def has_school_record(cards: list[dict] | None) -> bool:
    """Whether any of these cards shows a school record, so the whole dashboard or capture goes when school records are off."""
    return any(DOCUMENTS.get(((card or {}).get("spec") or {}).get("measure", ""), Document("", "", "", (), lambda ctx: {})).school_records for card in cards or [])


def available(key: str, school_records: bool) -> bool:
    item = DOCUMENTS.get(key)
    return item is not None and (school_records or not item.school_records)


def check(spec, scope: str) -> list[dict]:
    """What is wrong with a document card's spec on a ``scope`` dashboard."""
    item = DOCUMENTS[spec.measure]
    errors: list[dict] = []
    if scope not in item.scopes:
        errors.append({"field": "measure", "message": f"{item.label} works on a {' or '.join(item.scopes)} dashboard."})
    if spec.by or spec.by2 or any(item.field != "learner_status" for item in spec.filters):
        errors.append({"field": "by", "message": f"{item.label} is a record, so it has no breakdowns or filters."})
    return errors


def run(ctx: Ctx, spec) -> dict:
    from src.services.orgs import school_records

    item = DOCUMENTS[spec.measure]
    if item.school_records and not school_records.enabled(ctx.db, ctx.org_id):
        return {"error": "invalid", "errors": [{"field": "measure", "message": "This organization doesn't use school records."}]}
    built = item.build(ctx)
    if "error" in built:
        return built
    headline = spec.headline.text.strip() if spec.headline.mode == "custom" else built["headline"]
    return {
        "measure": item.key, "shape": "document", "kind": "document", "unit": "none", "direction": "none", "definition": item.definition,
        "value": None, "rows": [], "columns": [], "series": None, "more": None, "compare": None, "drill": None,
        "chart": "table", "charts": [], "headline": headline, "auto_headline": built["headline"], "subline": "As it stands now",
        "window": {"start": None, "end": ctx.today.isoformat(), "preset": "all"},
        "as_of": datetime.now(timezone.utc).isoformat(timespec="seconds"), "document": built["document"], "complete": built["complete"],
    }


def registry_entries(scope: str, school_records: bool) -> list[dict]:
    return [{"key": item.key, "label": item.label, "definition": item.definition, "kind": "document", "unit": "none", "direction": "none",
             "dims": [], "scopes": list(item.scopes), "snapshot": True, "available": True, "keywords": ["school", "epp", "education plan", "record"]}
            for item in DOCUMENTS.values() if scope in item.scopes and (school_records or not item.school_records)]
