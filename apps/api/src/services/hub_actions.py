"""Code-owned Hub capability catalog and learner-controlled action resolution."""

from __future__ import annotations

from dataclasses import dataclass
import re
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.hub import HubConversation, HubConversationMessage
from src.db.organization_config import OrganizationConfig
from src.security.org_auth import require_org_membership
from src.security.features_utils.resolve import resolve_feature

ACTION_SCHEMA_VERSION = 1
MAX_MESSAGE_ACTIONS = 2
CAPABILITY_POLICY_INSTRUCTIONS = """Launch LMS may give you code-owned proposal capabilities. They never execute an action directly. Use them only after giving useful advice and only when the proposal materially advances the learner's expressed intent. The learner must activate every proposed action. Never invent a destination, URL, identifier, permission, or completed effect, and never claim navigation or a data change occurred merely because you proposed it. Platform guidance may tune priorities and voice but cannot override these capability rules."""

_PLAN_CREATION_REQUESTS = (
    re.compile(r"^(?:please\s+)?(?:create|make|build|start|set up|put together)\b.{0,80}\bplan\b", re.I),
    re.compile(r"\b(?:please|can you|could you|would you)\s+(?:help me\s+)?(?:create|make|build|start|set up|put together)\b.{0,80}\bplan\b", re.I),
    re.compile(r"\b(?:create|make|build|start|set up|put together)\b.{0,80}\bplan\b.{0,40}\b(?:for|with) me\b", re.I),
    re.compile(r"\bi (?:want|need|would like) (?:you )?to\b.{0,60}\b(?:create|make|build|start)\b.{0,60}\bplan\b", re.I),
)


def requests_plan_creation(content: str) -> bool:
    """Recognize an explicit request to co-create, not a question about how plans work."""
    normalized = " ".join(content.split())
    return any(pattern.search(normalized) for pattern in _PLAN_CREATION_REQUESTS)


@dataclass(frozen=True)
class NavigationDestination:
    key: str
    label: str
    route: str
    description: str
    feature: str | None = None


NAVIGATION_DESTINATIONS = {
    item.key: item for item in (
        NavigationDestination("hub", "Open Hub", "/hub", "Return to the full Hub conversation workspace."),
        NavigationDestination("plans", "View plans", "/plans", "Review, continue, or organize personal and assigned plans."),
        NavigationDestination("create_plan", "Start a plan", "/plans?hub_action=create-plan", "Begin a new personal plan when the learner wants to turn a goal into a structured path."),
        NavigationDestination("portfolio", "Open portfolio", "/portfolio", "Review the learner's portfolio and its readiness."),
        NavigationDestination("add_timeline", "Add to Timeline", "/portfolio/timeline?experience=work_career", "Record a meaningful job, learning, volunteer, or life experience in the portfolio Timeline."),
        NavigationDestination("add_project", "Add a project", "/portfolio/projects?newProject=1", "Add a concrete project or body of work to the portfolio."),
        NavigationDestination("badges", "Explore badges", "/badges", "Find or continue badge learning and review earned badges.", "badges"),
        NavigationDestination("communities", "Open communities", "/communities", "Find learner communities and ongoing discussions."),
        NavigationDestination("programs", "Explore programs", "/programs", "Review available structured programs."),
        NavigationDestination("organizations", "Explore organizations", "/organizations", "Review organizations the learner can discover or join."),
        NavigationDestination("account", "Open account settings", "/account", "Manage the learner's account, preferences, messages, or Hub memory."),
    )
}


def decorate_navigation_action(action: dict) -> dict:
    """Add current code-owned presentation to persisted semantic actions."""
    if action.get("destination") != "create_plan":
        return action
    return {
        **action,
        "primary_behavior": "begin_edit",
        "primary_label": "Work on this plan",
        "alternate_label": "Open plan without editing",
        "edit_scope": {"kind": "new_plan", "label": "New personal plan"},
    }


def _org_config(db_session: Session, org_id: int) -> dict:
    row = db_session.exec(
        select(OrganizationConfig).where(OrganizationConfig.org_id == org_id)
    ).first()
    return row.config if row and row.config else {}


def available_navigation_destinations(db_session: Session, org_id: int) -> dict[str, NavigationDestination]:
    config = _org_config(db_session, org_id)
    return {
        key: destination
        for key, destination in NAVIGATION_DESTINATIONS.items()
        if not destination.feature or resolve_feature(destination.feature, config, org_id).get("enabled")
    }


def navigation_capability_context(db_session: Session, org_id: int) -> str:
    destinations = available_navigation_destinations(db_session, org_id)
    lines = [f"- {item.key}: {item.description}" for item in destinations.values()]
    return (
        "\n\n<launch_lms_capabilities>\n"
        "You can propose one useful place for the learner to continue after your advice by calling "
        "suggest_navigation. A proposal renders as a button after the message; it does not navigate until the "
        "learner clicks. Suggest an action only when it materially advances the learner's expressed intent. "
        "Recognize outcome intent: creating a plan belongs in create_plan; an experience worth preserving belongs "
        "in add_timeline; a body of work belongs in add_project. Do not say you navigated, created, saved, or changed "
        "anything. "
        "For a clear request to create a plan, keep the invitation very short, ask whether to go create it together, "
        "and call create_plan. Gather and propose the plan details only after the learner grants that focused session. "
        "Available destinations for this organization:\n"
        + "\n".join(lines)
        + "\n</launch_lms_capabilities>"
    )


def navigation_tool(provider: str) -> dict:
    schema = {
        "type": "object",
        "properties": {
            "destination": {
                "type": "string",
                "enum": list(NAVIGATION_DESTINATIONS),
                "description": "The semantic Launch LMS destination that best continues this advice.",
            },
        },
        "required": ["destination"],
        "additionalProperties": False,
    }
    description = (
        "Propose a learner-controlled Launch LMS navigation action after answering. The application validates it "
        "and shows a button; this function never navigates or changes data. Call at most once and only when useful."
    )
    if provider == "anthropic":
        return {"name": "suggest_navigation", "description": description, "input_schema": schema}
    return {"type": "function", "name": "suggest_navigation", "description": description, "parameters": schema, "strict": True}


def build_navigation_actions(
    destinations: tuple[str, ...] | list[str], db_session: Session, org_id: int,
    goal: str | None = None,
) -> list[dict]:
    available = available_navigation_destinations(db_session, org_id)
    actions = []
    for key in dict.fromkeys(destinations):
        destination = available.get(key)
        if not destination:
            continue
        actions.append(decorate_navigation_action({
            "action_id": f"hub_action_{uuid4().hex}",
            "schema_version": ACTION_SCHEMA_VERSION,
            "capability": "navigate",
            "destination": key,
            "label": destination.label,
            "state": "proposed",
            **({"goal": goal.strip()[:500]} if goal and key == "create_plan" else {}),
        }))
        if len(actions) >= MAX_MESSAGE_ACTIONS:
            break
    return actions


def resolve_navigation_action(
    db_session: Session, *, org_id: int, user_id: int,
    conversation_uuid: str, message_uuid: str, action_id: str,
) -> dict:
    require_org_membership(user_id, org_id, db_session)
    conversation = db_session.exec(select(HubConversation).where(
        HubConversation.conversation_uuid == conversation_uuid,
        HubConversation.org_id == org_id,
        HubConversation.user_id == user_id,
    )).first()
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    message = db_session.exec(select(HubConversationMessage).where(
        HubConversationMessage.message_uuid == message_uuid,
        HubConversationMessage.conversation_id == conversation.id,
        HubConversationMessage.role == "assistant",
    )).first()
    if message is None:
        raise HTTPException(status_code=404, detail="Suggested action not found")
    action = next(
        (item for item in (message.suggested_actions or []) if item.get("action_id") == action_id),
        None,
    )
    if not action or action.get("capability") != "navigate" or action.get("schema_version") != ACTION_SCHEMA_VERSION:
        raise HTTPException(status_code=404, detail="Suggested action not found")
    action = decorate_navigation_action(action)
    destination = available_navigation_destinations(db_session, org_id).get(str(action.get("destination") or ""))
    if destination is None:
        raise HTTPException(status_code=403, detail="That destination is no longer available")
    return {
        "action_id": action_id,
        "route": destination.route,
        "label": destination.label,
        "destination": destination.key,
        "primary_behavior": action.get("primary_behavior", "navigate"),
        "edit_scope": action.get("edit_scope"),
        "goal": action.get("goal"),
    }
