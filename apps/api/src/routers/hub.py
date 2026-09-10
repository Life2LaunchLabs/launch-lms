from datetime import datetime
import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.resources import ResourceTypeEnum
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.hub_advisor import (
    AdvisorMessage,
    AdvisorError,
    AdvisorProviderLimited,
    AdvisorUnavailable,
    ask_hub_advisor,
    advisor_resources_for_request,
    advisor_safety_identifier,
    extract_hub_memory_candidates,
)
from src.services.hub_conversations import (
    archive_conversation,
    advisor_history,
    conversation_detail,
    delete_conversation,
    list_conversations,
    record_advice,
    record_search,
    rename_conversation,
    save_state,
)
from src.services.resources import list_resources
from src.services.hub_memory import (
    active_memory_summaries,
    apply_memory_candidates,
    clear_memories,
    delete_memory,
    list_memories,
    memory_settings,
    record_used_memories,
    select_memories,
    update_memory_settings,
    update_memory,
)

from src.services.hub_context import HubSurfaceHint, page_context
from src.services.hub_actions import build_navigation_actions, resolve_navigation_action
from src.services.hub_edit_runs import active_edit_run, begin_edit_run, bind_created_plan, conclude_edit_run, save_object_state
from src.services.hub_plan_tools import record_plan_proposals

router = APIRouter()
logger = logging.getLogger(__name__)


class HubAdvisorMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2_000)


class HubAdvisorRequest(BaseModel):
    surface: HubSurfaceHint | None = None
    messages: list[HubAdvisorMessage] = Field(min_length=1, max_length=12)
    resource_uuids: list[str] = Field(default_factory=list, max_length=8)
    learner_resource_uuids: list[str] = Field(default_factory=list, max_length=8)
    conversation_uuid: str | None = None


class HubAdvisorResource(BaseModel):
    resource_uuid: str
    title: str
    description: str | None = None
    resource_type: ResourceTypeEnum
    provider_name: str | None = None
    external_url: str
    cover_image_url: str | None = None
    thumbnail_image: str | None = None
    owner_org_uuid: str | None = None
    access_mode: str
    tags: list[str]


class HubAdvisorResponse(BaseModel):
    page_context: dict | None = None
    answer: str
    usage: dict[str, int]
    resources: list[HubAdvisorResource]
    conversation_uuid: str
    title: str
    user_message_uuid: str
    assistant_message_uuid: str
    user_message_created_at: datetime
    assistant_message_created_at: datetime
    memories_used: list[dict] = Field(default_factory=list)
    memory_changes: list[dict] = Field(default_factory=list)
    suggested_actions: list[dict] = Field(default_factory=list)
    edit_operations: list[dict] = Field(default_factory=list)
    edit_run: dict | None = None


class HubNavigationActionResolve(BaseModel):
    conversation_uuid: str
    message_uuid: str
    mode: Literal["navigate", "edit"] = "navigate"


class HubEditRunConclusion(BaseModel):
    status: Literal["cancelled", "completed"]


class HubEditRunPlanTarget(BaseModel):
    plan_identifier: str = Field(min_length=1, max_length=120)


class HubEditObjectStateUpdate(BaseModel):
    object_type: str = Field(min_length=1, max_length=40)
    object_uuid: str | None = Field(default=None, max_length=160)
    current_fields: dict
    proposal_fields: dict = Field(default_factory=dict)
    status: Literal["editing", "cancelled", "saved"] = "editing"
    expected_revision: int | None = Field(default=None, ge=0)


class HubConversationSummary(BaseModel):
    conversation_uuid: str
    title: str
    created_at: datetime
    updated_at: datetime
    resource_count: int
    latest_user_message: str
    latest_user_resource_count: int


class HubConversationRename(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    archived: bool | None = None


class HubConversationSearchRequest(BaseModel):
    conversation_uuid: str | None = None
    query: str = Field(min_length=1, max_length=2_000)
    resource_uuids: list[str] = Field(default_factory=list, max_length=8)
    learner_resource_uuids: list[str] = Field(default_factory=list, max_length=8)
    surface: HubSurfaceHint | None = None


class HubConversationMessageResources(BaseModel):
    message_uuid: str
    resource_uuids: list[str] = Field(default_factory=list, max_length=8)
    label: Literal["You added", "Suggested"] | None = None


class HubConversationStateUpdate(BaseModel):
    context_resource_uuids: list[str] = Field(default_factory=list, max_length=8)
    message_resources: list[HubConversationMessageResources] = Field(default_factory=list, max_length=1_000)


class HubMemorySettingsUpdate(BaseModel):
    enabled: bool | None = None
    notice_dismissed: bool | None = None


class HubMemoryUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=500)
    category: Literal["goal", "preference", "constraint", "background"] | None = None


@router.get("/memory")
def get_hub_memory(
    org_id: int,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return {
        **memory_settings(db_session, org_id, current_user.id),
        "memories": list_memories(db_session, org_id, current_user.id),
    }


@router.patch("/memory/settings")
def update_hub_memory_settings(
    org_id: int,
    body: HubMemorySettingsUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    if body.enabled is None and body.notice_dismissed is None:
        raise HTTPException(status_code=422, detail="A memory setting is required")
    return update_memory_settings(
        db_session,
        org_id,
        current_user.id,
        enabled=body.enabled,
        notice_dismissed=body.notice_dismissed,
    )


@router.patch("/memory/{memory_uuid}")
def edit_hub_memory(
    memory_uuid: str,
    org_id: int,
    body: HubMemoryUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return update_memory(
        db_session, memory_uuid, org_id, current_user.id, body.content, body.category,
    )


@router.delete("/memory/{memory_uuid}", status_code=204)
def remove_hub_memory(
    memory_uuid: str,
    org_id: int,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    delete_memory(db_session, memory_uuid, org_id, current_user.id)


@router.delete("/memory", status_code=204)
def remove_all_hub_memory(
    org_id: int,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    clear_memories(db_session, org_id, current_user.id)


@router.get("/conversations", response_model=list[HubConversationSummary])
def get_hub_conversations(
    org_id: int,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return list_conversations(db_session, org_id, current_user.id)


@router.get("/conversations/{conversation_uuid}")
async def get_hub_conversation(
    request: Request,
    conversation_uuid: str,
    org_id: int,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    accessible_resources = await list_resources(request, org_id, current_user, db_session)
    return conversation_detail(db_session, conversation_uuid, org_id, current_user.id, accessible_resources)


@router.patch("/conversations/{conversation_uuid}")
def update_hub_conversation(
    conversation_uuid: str,
    org_id: int,
    body: HubConversationRename,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    if body.archived is True:
        archive_conversation(db_session, conversation_uuid, org_id, current_user.id)
        return {"conversation_uuid": conversation_uuid, "archived": True}
    if body.title is None:
        raise HTTPException(status_code=422, detail="A title or archive action is required")
    return rename_conversation(db_session, conversation_uuid, org_id, current_user.id, body.title)


@router.delete("/conversations/{conversation_uuid}", status_code=204)
def remove_hub_conversation(
    conversation_uuid: str,
    org_id: int,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    delete_conversation(db_session, conversation_uuid, org_id, current_user.id)


@router.post("/conversations/search")
async def create_hub_search_event(
    request: Request,
    org_id: int,
    body: HubConversationSearchRequest,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    accessible_resources = await list_resources(request, org_id, current_user, db_session)
    accessible = {str(item.get("resource_uuid")) for item in accessible_resources}
    context = page_context(db_session, org_id, current_user.id, body.surface)
    return record_search(
        db_session, org_id=org_id, user_id=current_user.id,
        conversation_uuid=body.conversation_uuid, query=body.query.strip(),
        learner_resource_uuids=[uuid for uuid in body.learner_resource_uuids if uuid in accessible],
        context_resource_uuids=[uuid for uuid in body.resource_uuids if uuid in accessible],
        page_receipt=context["receipt"],
    )


@router.put("/conversations/{conversation_uuid}/state", status_code=204)
async def update_hub_conversation_state(
    request: Request,
    conversation_uuid: str,
    org_id: int,
    body: HubConversationStateUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    accessible_resources = await list_resources(request, org_id, current_user, db_session)
    save_state(
        db_session, conversation_uuid, org_id, current_user.id,
        body.context_resource_uuids,
        [item.model_dump() for item in body.message_resources],
        {str(item.get("resource_uuid")) for item in accessible_resources},
    )


@router.post("/advisor", response_model=HubAdvisorResponse)
async def create_hub_advice(
    request: Request,
    org_id: int,
    body: HubAdvisorRequest,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    accessible_resources = await list_resources(
        request,
        org_id,
        current_user,
        db_session,
    )
    user_content = body.messages[-1].content.strip()
    model_messages = (
        advisor_history(db_session, body.conversation_uuid, org_id, current_user.id, user_content)
        if body.conversation_uuid
        else [AdvisorMessage(role=item.role, content=item.content.strip()) for item in body.messages]
    )
    context = page_context(db_session, org_id, current_user.id, body.surface)
    edit_run = active_edit_run(db_session, body.conversation_uuid, org_id, current_user.id) if body.conversation_uuid else None
    used_memories = select_memories(db_session, org_id, current_user.id, user_content)
    grounding_resources = advisor_resources_for_request(
        user_content,
        accessible_resources,
        body.resource_uuids,
    )
    try:
        result = await ask_hub_advisor(
            request,
            org_id,
            current_user.id,
            model_messages,
            db_session,
            grounding_resources=grounding_resources,
            grounding_memories=used_memories,
            page_context=context,
            edit_run=edit_run,
        )
    except AdvisorProviderLimited as error:
        raise HTTPException(
            status_code=429,
            detail=str(error),
            headers={"Retry-After": str(error.retry_after)},
        ) from None
    except AdvisorUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from None
    accessible = {str(item.get("resource_uuid")) for item in accessible_resources}
    suggested_actions = build_navigation_actions(result.action_destinations, db_session, org_id, user_content)
    edit_operations = record_plan_proposals(db_session, edit_run["run_uuid"], result.plan_operations) if edit_run else []
    persisted = record_advice(
        db_session, org_id=org_id, user_id=current_user.id,
        conversation_uuid=body.conversation_uuid, user_content=user_content,
        assistant_content=result.text,
        learner_resource_uuids=[uuid for uuid in body.learner_resource_uuids if uuid in accessible],
        context_resource_uuids=[uuid for uuid in body.resource_uuids if uuid in accessible],
        suggested_resource_uuids=[item["resource_uuid"] for item in grounding_resources],
        model=result.model, input_tokens=result.input_tokens, output_tokens=result.output_tokens,
        page_receipt=context["receipt"],
        suggested_actions=suggested_actions,
    )
    record_used_memories(
        db_session, persisted["assistant_message_uuid"], used_memories,
        org_id, current_user.id,
    )
    memory_changes: list[dict] = []
    if memory_settings(db_session, org_id, current_user.id)["enabled"]:
        try:
            candidates, extraction_model = await extract_hub_memory_candidates(
                user_content,
                active_memory_summaries(db_session, org_id, current_user.id),
                advisor_safety_identifier(current_user.id),
                db_session=db_session,
            )
        except AdvisorError:
            logger.warning(
                "hub_memory_extraction_failed org_id=%s user_id=%s",
                org_id, current_user.id,
            )
        else:
            memory_changes = apply_memory_candidates(
                db_session, org_id=org_id, user_id=current_user.id,
                message_uuid=persisted["user_message_uuid"], candidates=candidates,
                extraction_model=extraction_model,
            )
    return HubAdvisorResponse(
        page_context=context["receipt"],
        answer=result.text,
        usage={"input_tokens": result.input_tokens, "output_tokens": result.output_tokens},
        resources=grounding_resources,
        conversation_uuid=persisted["conversation_uuid"],
        title=persisted["title"],
        user_message_uuid=persisted["user_message_uuid"],
        assistant_message_uuid=persisted["assistant_message_uuid"],
        user_message_created_at=persisted["user_message_created_at"],
        assistant_message_created_at=persisted["assistant_message_created_at"],
        memories_used=used_memories,
        memory_changes=memory_changes,
        suggested_actions=suggested_actions,
        edit_operations=edit_operations,
        edit_run=active_edit_run(db_session, persisted["conversation_uuid"], org_id, current_user.id) if edit_run else None,
    )


@router.post("/actions/{action_id}/resolve")
def resolve_hub_navigation_action(
    action_id: str,
    org_id: int,
    body: HubNavigationActionResolve,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    resolved = resolve_navigation_action(
        db_session,
        org_id=org_id,
        user_id=current_user.id,
        conversation_uuid=body.conversation_uuid,
        message_uuid=body.message_uuid,
        action_id=action_id,
    )
    if body.mode != "edit":
        return resolved
    edit_scope = resolved.get("edit_scope")
    if resolved.get("primary_behavior") != "begin_edit" or not edit_scope:
        raise HTTPException(status_code=422, detail="That action does not grant editing")
    run = begin_edit_run(
        db_session,
        conversation_uuid=body.conversation_uuid,
        org_id=org_id,
        user_id=current_user.id,
        action_id=action_id,
        route=resolved["route"],
        scope_kind=edit_scope["kind"],
        target_label=edit_scope["label"],
        goal=resolved.get("goal") or "Create a personal plan together",
    )
    return {**resolved, "edit_run": run}


@router.get("/conversations/{conversation_uuid}/edit-run")
def get_active_hub_edit_run(
    conversation_uuid: str,
    org_id: int,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return {"edit_run": active_edit_run(db_session, conversation_uuid, org_id, current_user.id)}


@router.post("/edit-runs/{run_uuid}/conclude")
def conclude_hub_edit_run(
    run_uuid: str,
    org_id: int,
    body: HubEditRunConclusion,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return conclude_edit_run(db_session, run_uuid, org_id, current_user.id, body.status)


@router.post("/edit-runs/{run_uuid}/plan-target")
def bind_hub_edit_run_plan(
    run_uuid: str,
    org_id: int,
    body: HubEditRunPlanTarget,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    return bind_created_plan(
        db_session, run_uuid, org_id, current_user.id, body.plan_identifier,
    )


@router.put("/edit-runs/{run_uuid}/objects/{object_key}")
def update_hub_edit_object_state(
    run_uuid: str,
    object_key: str,
    org_id: int,
    body: HubEditObjectStateUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    if not object_key or len(object_key) > 160:
        raise HTTPException(status_code=422, detail="Invalid object key")
    return save_object_state(
        db_session, run_uuid=run_uuid, org_id=org_id, user_id=current_user.id,
        object_key=object_key, object_type=body.object_type,
        object_uuid=body.object_uuid,
        current_fields=body.current_fields, proposal_fields=body.proposal_fields,
        status=body.status, expected_revision=body.expected_revision,
    )
