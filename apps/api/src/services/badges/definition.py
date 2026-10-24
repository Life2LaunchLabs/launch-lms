"""A plan's badge: the ``badge`` block of its template document, filled in from the plan.

The block holds only what is the badge's own (kind, skills, certificate style,
optional name and image, extra Open Badges fields). Everything else comes from
the plan: its title and description, its image, what finishing it takes
(criteria), the requirements its steps count toward (alignment), the
organization that owns it (creator) and the release (version).
"""

from __future__ import annotations

from sqlmodel import Session, col, select

from src.db.goals import GoalTemplate, GoalTemplateVersion
from src.db.organizations import Organization
from src.db.requirements import RequirementFramework, RequirementFrameworkVersion, RequirementNode
from src.services.goals.document import iter_steps

EXTRA_FIELDS = ("human_code", "field_of_study", "specialization", "credits_available", "in_language")


def badge_block(document: dict | None) -> dict | None:
    """The document's badge, or None when the plan earns none."""
    block = (document or {}).get("badge")
    return block if isinstance(block, dict) else None


def without_badge(document: dict | None) -> dict:
    """The document with its badge taken out: another organization's copy of a plan is a plan of its own,
    and the badge stays its creator's."""
    return {key: value for key, value in (document or {}).items() if key != "badge"}


def earns_badge(version: GoalTemplateVersion | None) -> bool:
    return bool(version and badge_block(version.document))


def criteria_narrative(document: dict) -> str:
    """What earning it takes, in words: every step of the plan, stage by stage."""
    title = (document.get("template") or {}).get("title") or "the plan"
    stages = [stage for stage in document.get("stages") or [] if stage.get("steps")]
    count = sum(len(stage["steps"]) for stage in stages)
    lines = [f"Finish every step of {title}: {count} step{'s' if count != 1 else ''}."]
    for stage in stages:
        steps = ", ".join(step.get("title") or "" for step in stage["steps"])
        lines.append(f"{stage.get('title') or 'Stage'}: {steps}.")
    return "\n".join(lines)


def alignment(db: Session, document: dict) -> list[dict]:
    """The requirement nodes the plan's steps count toward, each with its framework."""
    node_uuids = list(dict.fromkeys(node for _, step in iter_steps(document) for node in step.get("requirement_node_uuids") or []))
    if not node_uuids:
        return []
    rows = db.exec(
        select(RequirementNode, RequirementFramework)
        .join(RequirementFrameworkVersion, RequirementFrameworkVersion.id == RequirementNode.version_id)
        .join(RequirementFramework, RequirementFramework.id == RequirementFrameworkVersion.framework_id)
        .where(col(RequirementNode.node_uuid).in_(node_uuids))
        .order_by(col(RequirementFrameworkVersion.version_number).desc())
    ).all()
    newest: dict[str, tuple[RequirementNode, RequirementFramework]] = {}
    for node, framework in rows:
        newest.setdefault(node.node_uuid, (node, framework))
    return [
        {"node_uuid": uuid, "name": newest[uuid][0].title, "code": newest[uuid][0].code, "description": newest[uuid][0].description,
         "framework": newest[uuid][1].name, "framework_uuid": newest[uuid][1].framework_uuid}
        for uuid in node_uuids if uuid in newest
    ]


def achievement(db: Session, template: GoalTemplate, document: dict, semver: str | None) -> dict | None:
    """The badge as a learner earns it from this document, plan details filled in (None: no badge)."""
    block = badge_block(document)
    if block is None:
        return None
    meta = document.get("template") or {}
    owner = db.get(Organization, template.org_id)
    return {
        "template_uuid": template.template_uuid,
        "name": block.get("name") or meta.get("title") or template.title,
        "description": meta.get("description") or template.description or "",
        "image_url": block.get("image_url") or template.thumbnail_image or "",
        "icon": template.icon, "color": template.color,
        "kind": block.get("kind") or "Badge",
        "skills": list(block.get("skills") or []),
        "style": block.get("style") or "modern",
        "criteria_narrative": criteria_narrative(document),
        "alignment": alignment(db, document),
        "creator": {"id": owner.id, "org_uuid": owner.org_uuid, "slug": owner.slug, "name": owner.name, "logo_image": owner.logo_image} if owner else None,
        "version": semver,
        **{key: block.get(key) for key in EXTRA_FIELDS if block.get(key) not in (None, "")},
    }


def live_achievement(db: Session, template: GoalTemplate) -> dict | None:
    """The badge of the plan's live release (what finishing it now earns)."""
    version = db.get(GoalTemplateVersion, template.published_version_id) if template.published_version_id else None
    return achievement(db, template, version.document, version.semver) if version else None


def draft_achievement(db: Session, template: GoalTemplate) -> dict | None:
    """The badge as the plan's working draft has it, for the editor."""
    return achievement(db, template, template.document or {}, (template.draft or {}).get("semver"))


def badge_summary(db: Session, template: GoalTemplate, version: GoalTemplateVersion | None = None) -> dict | None:
    """What a plan card shows of the badge a release earns, the live one unless given (None: no badge)."""
    if version is None and template.published_version_id:
        version = db.get(GoalTemplateVersion, template.published_version_id)
    return summary(template, version.document) if version else None


def summary(template: GoalTemplate, document: dict | None) -> dict | None:
    """What a card shows of the badge a template document earns (None: no badge)."""
    block = badge_block(document)
    if block is None:
        return None
    return {"name": block.get("name") or template.title, "kind": block.get("kind") or "Badge",
            "image_url": block.get("image_url") or template.thumbnail_image or "", "skills": list(block.get("skills") or [])}


def goal_badge(db: Session, goal) -> dict | None:
    """The badge a learner's plan earns: its release's badge (None: no badge)."""
    template = db.get(GoalTemplate, goal.template_id) if goal.template_id else None
    version = db.get(GoalTemplateVersion, goal.version_id) if goal.version_id else None
    return badge_summary(db, template, version) if template and version else None
