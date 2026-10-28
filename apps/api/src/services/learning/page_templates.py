"""Page templates: the starting points the activity editor offers under New page and Add question.

They live in one system plan in the platform's owner organization (``system_type`` "page_templates"),
created empty on startup and edited like any plan: each activity is a category, each of its pages a
template. Only its live version is served, so drafts stay hidden until published. The plan is never
assigned, joined, copied or listed. A template is copied into the activity that uses it; nothing links
back. For each Add question pick, the default is the first page, in plan order, holding that kind of
question.
"""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.goals import GoalTemplate
from src.db.learning import LearningActivity, LearningPage
from src.db.users import PublicUser
from src.services.goals.document import iter_steps
from src.services.learning_page_convert import iter_block_stacks
from src.services.learning_sequence import sequence_page_uuids

logger = logging.getLogger(__name__)

PAGE_TEMPLATES = "page_templates"
TEMPLATE_UUID = "goal_template_page_templates"
TITLE = "Page templates"
DESCRIPTION = "What the activity editor offers under New page. Each activity is a category and each page a template; publish to change what editors see."


def _questions(page: LearningPage) -> list[dict]:
    return [block for stack in iter_block_stacks(page.content or {}) for block in stack
            if isinstance(block, dict) and block.get("type") == "question"]


def _is_scored(block: dict) -> bool:
    return (block.get("scoring") or {}).get("mode", "off") != "off"


# Add question's picks, each with the question it needs.
DEFAULTS = {
    "quick_check": lambda block: block.get("kind") == "multiple_choice" and _is_scored(block),
    "pick_few": lambda block: block.get("kind") == "multiple_choice" and not _is_scored(block),
    "short_answer": lambda block: block.get("kind") == "text_input",
    "show_work": lambda block: block.get("kind") == "image_upload",
}


def page_templates_plan(db: Session) -> GoalTemplate | None:
    return db.exec(select(GoalTemplate).where(GoalTemplate.system_type == PAGE_TEMPLATES)).first()


def ensure_plan(db: Session) -> GoalTemplate:
    """Create the empty page templates plan in the owner organization. An existing one is left as edited."""
    from src.services.goals import templates
    from src.services.goals.document import DOCUMENT_FORMAT, DOCUMENT_FORMAT_VERSION, default_roles
    from src.services.orgs.owner import require_owner_org

    template = page_templates_plan(db)
    if template is not None:
        return template
    org = require_owner_org(db)
    now = datetime.now().isoformat()
    template = GoalTemplate(template_uuid=TEMPLATE_UUID, org_id=int(org.id), title=TITLE, description=DESCRIPTION,  # type: ignore[arg-type]
                            document={}, system_type=PAGE_TEMPLATES, creation_date=now, update_date=now)
    db.add(template)
    db.flush()
    document = {
        "format": DOCUMENT_FORMAT, "format_version": DOCUMENT_FORMAT_VERSION,
        "template": {"title": TITLE, "description": DESCRIPTION, "instructions": "", "step_order": "any"},
        "roles": default_roles(), "stages": [{"key": "goal_stage_page_templates", "title": "Categories", "steps": []}],
    }
    templates._store(db, template, templates._validated(db, template, document))
    db.commit()
    db.refresh(template)
    return template


def ensure_plan_on_startup(engine) -> None:
    try:
        with Session(engine) as db:
            ensure_plan(db)
    except Exception as error:  # noqa: BLE001 - never block startup on this
        logger.warning("Page templates plan skipped (non-fatal): %s", error)


def _pages(db: Session, activity: LearningActivity) -> list[LearningPage]:
    pages = {page.page_uuid: page for page in db.exec(select(LearningPage).where(LearningPage.activity_id == activity.id).order_by(LearningPage.order)).all()}  # type: ignore[arg-type]
    ordered = [pages.pop(uuid) for uuid in sequence_page_uuids((activity.settings or {}).get("sequence") or {}) if uuid in pages]
    return ordered + list(pages.values())


def _page_dict(page: LearningPage) -> dict:
    return {"page_uuid": page.page_uuid, "page_type": getattr(page.page_type, "value", page.page_type), "title": page.title,
            "content": page.content or {}, "design": page.design or {}}


def _can_edit(db: Session, user: PublicUser, template: GoalTemplate) -> bool:
    from src.security.org_auth import require_org_admin

    try:
        require_org_admin(user.id, template.org_id, db, "build_plans")
    except HTTPException:
        return False
    return True


def served(db: Session, user: PublicUser) -> dict:
    """The live version's templates grouped by category, Add question's defaults, and where to edit them."""
    from src.services.goals import templates

    template = page_templates_plan(db)
    if template is None:
        return {"categories": [], "defaults": {}, "template_uuid": None, "can_edit": False}
    categories: list[dict] = []
    defaults: dict[str, dict] = {}
    live = templates.published_version(db, template)
    for _, step in iter_steps((live.document if live else None) or {}):
        uuid = (step.get("config") or {}).get("activity_uuid") if step.get("type") == "activity" else None
        activity = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == uuid)).first() if uuid else None
        if activity is None:
            continue
        pages = _pages(db, activity)
        if not pages:
            continue
        categories.append({"name": step.get("title") or activity.title or "Templates", "pages": [_page_dict(page) for page in pages]})
        for page in pages:
            for pick, needs in DEFAULTS.items():
                if pick not in defaults and any(needs(block) for block in _questions(page)):
                    defaults[pick] = _page_dict(page)
    return {"categories": categories, "defaults": defaults, "template_uuid": template.template_uuid, "can_edit": _can_edit(db, user, template)}
