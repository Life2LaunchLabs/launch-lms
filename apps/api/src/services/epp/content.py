"""Oregon's Education Plan and Profile content: the requirement framework and the yearly plan, plus finding work by code.

The framework's codes (EPP.GOALS.PREPARATION and so on) are stable. The EPP report finds a learner's work by
these codes and never by step names, so a district can change the plan, or add its own steps linked to the
same requirements, and the report still fills the same place. The plan file names its links by code
(`requirement_codes`) and `install` turns them into the framework's node ids.

Both are created as drafts: publishing is the organization's call.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

from sqlmodel import Session, col, select

from src.db.goals import Goal, GoalOwnership, GoalStep, GoalTemplate, TemplateStatus
from src.db.requirements import RequirementFramework, RequirementFrameworkVersion, RequirementNode
from src.db.users import PublicUser

CONTENT = Path(__file__).parent / "content"
FRAMEWORK_NAME = "Oregon Education Plan and Profile (EPP)"


def framework_document() -> dict:
    return json.loads((CONTENT / "framework.json").read_text())


def plan_document(node_uuids: dict[str, str]) -> dict:
    """The yearly plan as a Goal Template Document, with each step linked to the framework's nodes by code."""
    document = json.loads((CONTENT / "plan.json").read_text())
    for stage in document["stages"]:
        for step in stage["steps"]:
            step["requirement_node_uuids"] = [node_uuids[code] for code in step.pop("requirement_codes", [])]
    return document


def codes() -> list[str]:
    """Every requirement code in the framework, groups and leaves, in document order."""
    return [node["code"] for node in framework_document()["nodes"]]


def install(db: Session, current_user: PublicUser, org_id: int) -> dict:
    """Create the EPP framework and plan in an organization, both as drafts."""
    from src.services.goals import templates
    from src.services.requirement_documents.store import create_framework_from_document

    framework = create_framework_from_document(db, current_user, org_id, framework_document())
    framework_uuid = framework["context"]["framework_uuid"]
    by_code = {node["code"]: node["node_uuid"] for node in framework["document"]["nodes"]}
    plan = templates.create_template(db, current_user, org_id, plan_document(by_code))
    return {"framework_uuid": framework_uuid, "template_uuid": plan["template_uuid"]}


def plan_title() -> str:
    return json.loads((CONTENT / "plan.json").read_text())["template"]["title"]


def installed(db: Session, org_id: int) -> dict | None:
    """The EPP framework and plan this organization already has, found by name, or None."""
    framework = db.exec(select(RequirementFramework).where(RequirementFramework.org_id == org_id, RequirementFramework.name == FRAMEWORK_NAME)
                        .order_by(col(RequirementFramework.id))).first()
    if not framework:
        return None
    template = db.exec(select(GoalTemplate).where(GoalTemplate.org_id == org_id, GoalTemplate.title == plan_title(),
                                                  GoalTemplate.status != TemplateStatus.ARCHIVED).order_by(col(GoalTemplate.id))).first()
    return {"framework_uuid": framework.framework_uuid, "template_uuid": template.template_uuid if template else None,
            "published": bool(framework.published_version and template and template.published_version_id)}


def setup(db: Session, current_user: PublicUser, org_id: int) -> dict:
    """Give a school the EPP framework and plan, published and ready to assign. A school that has them keeps them.

    Pressing "Set up" is the school choosing to use them, so unlike `install` this publishes both.
    """
    from src.services.goals import templates
    from src.services.requirement_documents.store import publish_framework

    found = installed(db, org_id)
    if found and found["template_uuid"]:
        return found
    if found:
        # The framework is there but the plan was archived or renamed: add the plan against the same codes.
        framework = db.exec(select(RequirementFramework).where(RequirementFramework.framework_uuid == found["framework_uuid"])).one()
        nodes = db.exec(select(RequirementNode).join(RequirementFrameworkVersion, RequirementFrameworkVersion.id == RequirementNode.version_id)
                        .where(RequirementFrameworkVersion.framework_id == framework.id)).all()
        made = {"framework_uuid": framework.framework_uuid,
                "template_uuid": templates.create_template(db, current_user, org_id, plan_document({node.code: node.node_uuid for node in nodes}))["template_uuid"]}
    else:
        made = install(db, current_user, org_id)
    framework = db.exec(select(RequirementFramework).where(RequirementFramework.framework_uuid == made["framework_uuid"])).one()
    if not framework.published_version:
        publish_framework(db, current_user, org_id, made["framework_uuid"])
    templates.publish(db, current_user, org_id, made["template_uuid"], "Oregon Education Plan and Profile")
    return installed(db, org_id) or {**made, "published": True}


def steps_for_code(db: Session, user_id: int, org_id: int, code: str) -> list[GoalStep]:
    """A learner's steps, in plans this organization gave them or they joined, linked to the requirement with
    this code. Their own personal goals never count, even when filed under the organization.

    This is how the report finds content: by code, whichever plan or step carries it.
    """
    wanted = set(db.exec(select(RequirementNode.node_uuid).where(RequirementNode.code == code)).all())
    if not wanted:
        return []
    goal_ids = list(db.exec(select(Goal.id).where(Goal.subject_user_id == user_id, Goal.org_id == org_id, Goal.ownership == GoalOwnership.EXTERNAL)).all())
    if not goal_ids:
        return []
    steps = db.exec(select(GoalStep).where(col(GoalStep.goal_id).in_(goal_ids))).all()
    return [step for step in steps if any(link.get("node_uuid") in wanted for link in copy.deepcopy(step.requirement_links or []))]
