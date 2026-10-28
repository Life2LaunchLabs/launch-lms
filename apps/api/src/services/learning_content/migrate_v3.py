"""Move stored activities to sequences and version 3 pages, and report what needs a person.

Since A1 the runtime, preview and editor convert an activity's ``flow`` when they read it, so
writing ``settings.sequence`` changes nothing learners see. Version 3 pages differ from
version 2 in a few ways: they have exactly one heading block, their buttons only continue, and
they have no variants. A page is converted when that can be done without losing behaviour:
a leading heading in the first text block becomes the heading block (otherwise an empty one is
added for the author to fill), and "go back" buttons are removed, since the player has its own
back arrow. Pages with variants stay version 2 and are flagged: they need a branch made by hand.

What is replaced is kept in ``LearningContentBackup`` for one release, and ``settings.flow``
stays where it is. The migration runs in small batches and can run again: activities with a
stored sequence and version 3 pages are left alone::

    cd apps/api && uv run python cli.py migrate-learning-content            # dry run
    cd apps/api && uv run python cli.py migrate-learning-content --apply
"""

from __future__ import annotations

from collections import Counter
from copy import deepcopy
from datetime import datetime

from sqlmodel import Session, select

from src.db.goals import GoalTemplate
from src.db.learning import LearningActivity, LearningContentBackup, LearningPage, LearningPageType
from src.db.organizations import Organization
from src.services.goals.mcp_templates import activity_editor_url
from src.services.learning_content.models import StandardPageContent, content_error
from src.services.learning_page_convert import make_block_id
from src.services.learning_sequence import activity_sequence

# Flags that change what a learner sees or does, so a person should look. The rest are notes.
REVIEW = {"invalid_flow", "unplaced", "end_jump", "shared_page", "dead_end", "lone_rule", "shadowed_rules", "variants", "kept_v2"}
HEADING_SIZES = {1: "xl", 2: "l", 3: "m"}


def _text_of(node: dict) -> str:
    if node.get("type") == "text":
        return str(node.get("text") or "")
    if node.get("type") == "hardBreak":
        return " "
    return "".join(_text_of(child) for child in node.get("content") or [] if isinstance(child, dict))


def _lift_heading(blocks: list[dict]) -> tuple[dict | None, list[dict]]:
    """A heading block from the first block when it is text that starts with a heading, and the
    blocks without it (the text block keeps the rest of its text)."""
    first = blocks[0] if blocks else None
    if not isinstance(first, dict) or first.get("type") != "text":
        return None, blocks
    node = (first.get("content") or {}).get("node") or {}
    children = node.get("content") or [] if node.get("type") == "doc" else [node]
    lead = children[0] if children and isinstance(children[0], dict) else {}
    text = " ".join(_text_of(lead).split())
    if lead.get("type") != "heading" or not text or len(text) > 300:
        return None, blocks
    heading = {"id": make_block_id(), "type": "heading", "content": {"text": text, "size": HEADING_SIZES.get(int((lead.get("attrs") or {}).get("level") or 2), "s")}}
    if (first.get("design") or {}).get("align"):
        heading["design"] = {"align": first["design"]["align"]}
    rest = children[1:]
    if not any(_text_of(child).strip() or child.get("type") not in {"paragraph", "heading"} for child in rest if isinstance(child, dict)):
        return heading, blocks[1:]
    return heading, [{**first, "content": {**first["content"], "node": {**node, "content": rest}}}, *blocks[1:]]


def page_to_v3(page_uuid: str, content: dict | None) -> tuple[dict | None, list[dict]]:
    """A standard page's version 3 content, or None when it stays as it is, and the flags."""
    content = content or {}
    if content.get("version") == 3:
        return None, []
    if (content.get("variants") or {}).get("overrides"):
        return None, [{"code": "variants", "message": "The page swaps blocks on an earlier answer; it stays a version 2 page until someone makes it a branch.", "page_uuid": page_uuid}]
    flags: list[dict] = []
    blocks = [block for block in content.get("blocks") or [] if isinstance(block, dict)]
    kept = [block for block in blocks if not (block.get("type") == "button" and (block.get("content") or {}).get("action") == "revisit")]
    if len(kept) < len(blocks):
        flags.append({"code": "revisit_removed", "message": "A button went back to an earlier page; version 3 buttons only continue, so it was removed (the player's back arrow still goes back).", "page_uuid": page_uuid})
    heading, kept = _lift_heading(kept)
    if heading is None:
        heading = {"id": make_block_id(), "type": "heading", "content": {"text": ""}}
        flags.append({"code": "heading_empty", "message": "The page had no heading, so it has an empty one to fill in (learners see no change).", "page_uuid": page_uuid})
    upgraded = {key: value for key, value in deepcopy(content).items() if key != "variants"}
    upgraded.update(version=3, blocks=[heading, *kept])
    error = content_error(StandardPageContent, upgraded)
    if error:
        return None, [{"code": "kept_v2", "message": f"The page couldn't become version 3 ({error}); it stays as it is.", "page_uuid": page_uuid}]
    return upgraded, flags


def _pages(db: Session, activity: LearningActivity) -> list[LearningPage]:
    return list(db.exec(select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order.asc(), LearningPage.id.asc())).all())  # type: ignore[attr-defined, union-attr]


def plan_activity(activity: LearningActivity, pages: list[LearningPage]) -> dict:
    """What the migration would write for one activity, and every flag."""
    settings = activity.settings or {}
    converted = activity_sequence(settings, [{"page_uuid": page.page_uuid, "content": page.content} for page in pages])
    # Page features (revisit buttons, variants) are flagged below, where the page is converted.
    flags = [flag for flag in converted.flags if flag.get("code") not in {"revisit", "variants"}]
    page_contents: dict[str, dict] = {}
    for page in pages:
        if page.page_type != LearningPageType.STANDARD:
            continue
        upgraded, page_flags = page_to_v3(page.page_uuid, page.content)
        flags.extend(page_flags)
        if upgraded is not None:
            page_contents[page.page_uuid] = upgraded
    return {"sequence": None if settings.get("sequence") else converted.sequence, "pages": page_contents, "flags": flags}


def _summarize(flags: list[dict]) -> dict:
    return {"review": sum(flag["code"] in REVIEW for flag in flags), "codes": dict(Counter(flag["code"] for flag in flags))}


def audit_activities(db: Session, org_id: int | None = None, include_frozen: bool = False, only_review: bool = True) -> list[dict]:
    """Every activity the migration flags (only those needing a person by default), newest first.
    Published copies (frozen) are left out unless asked for: they follow their working activity."""
    query = select(LearningActivity).order_by(LearningActivity.id.desc())  # type: ignore[union-attr]
    if org_id is not None:
        query = query.where(LearningActivity.org_id == org_id)
    if not include_frozen:
        query = query.where(LearningActivity.frozen_from_id.is_(None))  # type: ignore[union-attr]
    orgs: dict[int, Organization | None] = {}
    rows = []
    for activity in db.exec(query).all():
        flags = plan_activity(activity, _pages(db, activity))["flags"]
        summary = _summarize(flags)
        if not flags or (only_review and not summary["review"]):
            continue
        if activity.org_id not in orgs:
            orgs[activity.org_id] = db.get(Organization, activity.org_id)
        org = orgs[activity.org_id]
        template = db.get(GoalTemplate, activity.goal_template_id) if activity.goal_template_id else None
        rows.append({
            "activity_uuid": activity.activity_uuid, "title": activity.title, "frozen": activity.frozen_from_id is not None,
            "org_slug": org.slug if org else None, "org_name": org.name if org else None,
            "editor_url": activity_editor_url(db, activity.org_id, template.template_uuid, activity.activity_uuid) if template and activity.frozen_from_id is None else None,
            "review": summary["review"], "codes": summary["codes"],
            "flags": [{**flag, "review": flag["code"] in REVIEW} for flag in flags],
        })
    return rows


def _backup(db: Session, kind: str, ref_uuid: str, data: dict, now: str) -> None:
    exists = db.exec(select(LearningContentBackup).where(LearningContentBackup.kind == kind, LearningContentBackup.ref_uuid == ref_uuid, LearningContentBackup.migration == "v3")).first()
    if not exists:
        db.add(LearningContentBackup(kind=kind, ref_uuid=ref_uuid, data=deepcopy(data), creation_date=now))


def migrate(db: Session, apply: bool = False, batch_size: int = 50, org_id: int | None = None) -> dict:
    """Write sequences and version 3 pages for every activity (published copies too), committing
    every ``batch_size`` activities. Without ``apply`` nothing is written: it reports what would be."""
    totals: Counter = Counter()
    flagged: list[dict] = []
    last_id = 0
    while True:
        query = select(LearningActivity).where(LearningActivity.id > last_id).order_by(LearningActivity.id.asc()).limit(batch_size)  # type: ignore[operator, union-attr]
        if org_id is not None:
            query = query.where(LearningActivity.org_id == org_id)
        batch = db.exec(query).all()
        if not batch:
            break
        now = str(datetime.utcnow())
        for activity in batch:
            last_id = int(activity.id or 0)
            pages = _pages(db, activity)
            plan = plan_activity(activity, pages)
            totals["activities"] += 1
            totals["sequences"] += plan["sequence"] is not None
            totals["pages_converted"] += len(plan["pages"])
            totals["pages_kept_v2"] += sum(flag["code"] in {"variants", "kept_v2"} for flag in plan["flags"])
            totals.update(f"flag:{flag['code']}" for flag in plan["flags"])
            if any(flag["code"] in REVIEW for flag in plan["flags"]):
                flagged.append({"activity_uuid": activity.activity_uuid, "title": activity.title, "frozen": activity.frozen_from_id is not None,
                                "flags": [flag for flag in plan["flags"] if flag["code"] in REVIEW]})
            if not apply:
                continue
            if plan["sequence"] is not None:
                _backup(db, "activity", activity.activity_uuid, activity.settings or {}, now)
                activity.settings = {**(activity.settings or {}), "sequence": plan["sequence"]}
                activity.update_date = now
                db.add(activity)
            for page in pages:
                if page.page_uuid in plan["pages"]:
                    _backup(db, "page", page.page_uuid, page.content or {}, now)
                    page.content = plan["pages"][page.page_uuid]
                    page.update_date = now
                    db.add(page)
        if apply:
            db.commit()
        else:
            db.rollback()
    flags = {key.removeprefix("flag:"): value for key, value in totals.items() if key.startswith("flag:")}
    counts = {key: totals[key] for key in ("activities", "sequences", "pages_converted", "pages_kept_v2")}
    return {"applied": apply, **counts, "flags": flags, "flagged": flagged}


def restore(db: Session) -> int:
    """Put back everything the migration replaced (the rollback for this release)."""
    restored = 0
    for backup in db.exec(select(LearningContentBackup).where(LearningContentBackup.migration == "v3")).all():
        model = LearningActivity if backup.kind == "activity" else LearningPage
        column = LearningActivity.activity_uuid if backup.kind == "activity" else LearningPage.page_uuid
        row = db.exec(select(model).where(column == backup.ref_uuid)).first()
        if row is None:
            continue
        if backup.kind == "activity":
            row.settings = deepcopy(backup.data)  # type: ignore[union-attr]
        else:
            row.content = deepcopy(backup.data)  # type: ignore[union-attr]
        db.add(row)
        restored += 1
    db.commit()
    return restored
