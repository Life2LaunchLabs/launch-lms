"""Private, organization-scoped persistence for learner Hub conversations."""

from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import aliased
from sqlmodel import Session, select

from src.db.hub import (
    HubConversation,
    HubConversationMessage,
    HubConversationMessageResource,
    HubConversationResource,
)
from src.services.hub_actions import decorate_navigation_action
from src.services.hub_advisor import AdvisorMessage
from src.services.hub_memory import message_memory_receipts
from src.security.org_auth import require_org_membership


def _title(content: str) -> str:
    normalized = " ".join(content.split())
    return normalized if len(normalized) <= 80 else normalized[:77].rstrip() + "…"


def get_owned_conversation(
    db_session: Session, conversation_uuid: str, org_id: int, user_id: int
) -> HubConversation:
    require_org_membership(user_id, org_id, db_session)
    conversation = db_session.exec(
        select(HubConversation).where(
            HubConversation.conversation_uuid == conversation_uuid,
            HubConversation.org_id == org_id,
            HubConversation.user_id == user_id,
        )
    ).first()
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


def list_conversations(db_session: Session, org_id: int, user_id: int) -> list[dict]:
    require_org_membership(user_id, org_id, db_session)
    latest_message = aliased(HubConversationMessage)
    latest_user_message_id = (
        select(latest_message.id)
        .where(
            latest_message.conversation_id == HubConversation.id,
            latest_message.role == "user",
        )
        .order_by(latest_message.sequence.desc())
        .limit(1)
        .correlate(HubConversation)
        .scalar_subquery()
    )
    latest_message_content = aliased(HubConversationMessage)
    latest_user_message = (
        select(latest_message_content.content)
        .where(latest_message_content.id == latest_user_message_id)
        .correlate(HubConversation)
        .scalar_subquery()
    )
    resource_count = (
        select(func.count(func.distinct(HubConversationMessageResource.resource_uuid)))
        .select_from(HubConversationMessageResource)
        .join(
            HubConversationMessage,
            HubConversationMessage.id == HubConversationMessageResource.message_id,
        )
        .where(
            HubConversationMessage.conversation_id == HubConversation.id,
        )
        .correlate(HubConversation)
        .scalar_subquery()
    )
    latest_user_resource_count = (
        select(func.count(HubConversationMessageResource.id))
        .where(HubConversationMessageResource.message_id == latest_user_message_id)
        .correlate(HubConversation)
        .scalar_subquery()
    )
    rows = db_session.exec(
        select(
            HubConversation,
            resource_count.label("resource_count"),
            latest_user_message.label("latest_user_message"),
            latest_user_resource_count.label("latest_user_resource_count"),
        )
        .where(
            HubConversation.org_id == org_id,
            HubConversation.user_id == user_id,
            HubConversation.archived_at.is_(None),  # type: ignore[union-attr]
        )
        .order_by(HubConversation.updated_at.desc())  # type: ignore[union-attr]
        .limit(100)
    ).all()
    return [
        {
            "conversation_uuid": conversation.conversation_uuid,
            "title": conversation.title,
            "created_at": conversation.created_at,
            "updated_at": conversation.updated_at,
            "resource_count": int(resource_total or 0),
            "latest_user_message": message_preview or "",
            "latest_user_resource_count": int(message_resource_total or 0),
        }
        for conversation, resource_total, message_preview, message_resource_total in rows
    ]


def _new_conversation(db_session: Session, org_id: int, user_id: int, content: str) -> HubConversation:
    require_org_membership(user_id, org_id, db_session)
    conversation = HubConversation(
        conversation_uuid=f"conversation_{uuid4()}",
        org_id=org_id,
        user_id=user_id,
        title=_title(content),
    )
    db_session.add(conversation)
    db_session.flush()
    return conversation


def _next_sequence(db_session: Session, conversation_id: int) -> int:
    highest = db_session.exec(
        select(func.max(HubConversationMessage.sequence)).where(
            HubConversationMessage.conversation_id == conversation_id
        )
    ).one()
    return int(highest or 0) + 1


def _add_message(
    db_session: Session,
    conversation: HubConversation,
    sequence: int,
    role: str,
    content: str,
    *,
    kind: str = "chat",
    resources: list[str] | None = None,
    label: str = "",
    model: str | None = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    suggested_actions: list[dict] | None = None,
) -> HubConversationMessage:
    message = HubConversationMessage(
        message_uuid=f"hub_message_{uuid4()}",
        conversation_id=int(conversation.id),
        sequence=sequence,
        role=role,
        kind=kind,
        content=content,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        suggested_actions=suggested_actions or None,
    )
    db_session.add(message)
    db_session.flush()
    for index, resource_uuid in enumerate(dict.fromkeys(resources or [])):
        db_session.add(HubConversationMessageResource(
            message_id=int(message.id), resource_uuid=resource_uuid,
            display_order=index, label=label,
        ))
    return message


def _replace_context(db_session: Session, conversation: HubConversation, resource_uuids: list[str]) -> None:
    existing = db_session.exec(
        select(HubConversationResource).where(HubConversationResource.conversation_id == conversation.id)
    ).all()
    for row in existing:
        db_session.delete(row)
    db_session.flush()
    for index, resource_uuid in enumerate(dict.fromkeys(resource_uuids[-8:])):
        db_session.add(HubConversationResource(
            conversation_id=int(conversation.id), resource_uuid=resource_uuid,
            display_order=index, active=True,
        ))


def advisor_history(
    db_session: Session,
    conversation_uuid: str | None,
    org_id: int,
    user_id: int,
    new_content: str,
) -> list[AdvisorMessage]:
    if conversation_uuid:
        conversation = get_owned_conversation(db_session, conversation_uuid, org_id, user_id)
        rows = db_session.exec(
            select(HubConversationMessage)
            .where(HubConversationMessage.conversation_id == conversation.id)
            .order_by(HubConversationMessage.sequence)
        ).all()
        history = [AdvisorMessage(
            role=row.role,  # type: ignore[arg-type]
            content=(f'Displayed resource search results for “{row.content}”.' if row.kind == "search" else row.content)[:2_000],
        ) for row in rows]
    else:
        require_org_membership(user_id, org_id, db_session)
        history = []
    history = [*history[-10:], AdvisorMessage(role="user", content=new_content)]
    while len(history) >= 3 and sum(len(item.content) for item in history) > 7_500:
        history = history[2:]
    return history


def record_advice(
    db_session: Session, *, org_id: int, user_id: int,
    conversation_uuid: str | None, user_content: str, assistant_content: str,
    learner_resource_uuids: list[str], context_resource_uuids: list[str],
    suggested_resource_uuids: list[str], model: str,
    input_tokens: int, output_tokens: int,
    page_receipt: dict | None = None,
    suggested_actions: list[dict] | None = None,
) -> dict:
    conversation = (
        get_owned_conversation(db_session, conversation_uuid, org_id, user_id)
        if conversation_uuid else _new_conversation(db_session, org_id, user_id, user_content)
    )
    sequence = _next_sequence(db_session, int(conversation.id))
    user_message = _add_message(
        db_session, conversation, sequence, "user", user_content,
        resources=learner_resource_uuids, label="You added",
    )
    introduced = set(db_session.exec(
        select(HubConversationMessageResource.resource_uuid)
        .join(HubConversationMessage, HubConversationMessage.id == HubConversationMessageResource.message_id)
        .where(HubConversationMessage.conversation_id == conversation.id)
    ).all())
    novel_suggestions = [uuid for uuid in suggested_resource_uuids if uuid not in introduced]
    assistant_message = _add_message(
        db_session, conversation, sequence + 1, "assistant", assistant_content,
        resources=novel_suggestions, label="Suggested", model=model,
        input_tokens=input_tokens, output_tokens=output_tokens,
        suggested_actions=suggested_actions,
    )
    user_message.page_context = page_receipt
    assistant_message.page_context = page_receipt
    db_session.add(user_message)
    db_session.add(assistant_message)
    merged_context = list(dict.fromkeys(context_resource_uuids))[-8:]
    for resource_uuid in suggested_resource_uuids:
        merged_context = [uuid for uuid in merged_context if uuid != resource_uuid]
        merged_context.append(resource_uuid)
        merged_context = merged_context[-8:]
    _replace_context(db_session, conversation, merged_context)
    conversation.updated_at = datetime.utcnow()
    db_session.add(conversation)
    db_session.commit()
    return {
        "conversation_uuid": conversation.conversation_uuid,
        "title": conversation.title,
        "user_message_uuid": user_message.message_uuid,
        "assistant_message_uuid": assistant_message.message_uuid,
        "user_message_created_at": user_message.created_at,
        "assistant_message_created_at": assistant_message.created_at,
        "assistant_resource_uuids": novel_suggestions,
        "suggested_actions": suggested_actions or [],
    }


def record_search(
    db_session: Session, *, org_id: int, user_id: int,
    conversation_uuid: str | None, query: str,
    learner_resource_uuids: list[str], context_resource_uuids: list[str],
    page_receipt: dict | None = None,
) -> dict:
    conversation = (
        get_owned_conversation(db_session, conversation_uuid, org_id, user_id)
        if conversation_uuid else _new_conversation(db_session, org_id, user_id, query)
    )
    sequence = _next_sequence(db_session, int(conversation.id))
    user_message = _add_message(
        db_session, conversation, sequence, "user", query,
        resources=learner_resource_uuids, label="You added",
    )
    search_message = _add_message(db_session, conversation, sequence + 1, "assistant", query, kind="search")
    user_message.page_context = page_receipt
    search_message.page_context = page_receipt
    _replace_context(db_session, conversation, context_resource_uuids)
    conversation.updated_at = datetime.utcnow()
    db_session.add(conversation)
    db_session.commit()
    return {
        "conversation_uuid": conversation.conversation_uuid,
        "title": conversation.title,
        "user_message_uuid": user_message.message_uuid,
        "assistant_message_uuid": search_message.message_uuid,
        "user_message_created_at": user_message.created_at,
        "assistant_message_created_at": search_message.created_at,
        "page_context": page_receipt,
    }


def save_state(
    db_session: Session, conversation_uuid: str, org_id: int, user_id: int,
    context_resource_uuids: list[str], message_resources: list[dict],
    accessible_resource_uuids: set[str],
) -> None:
    conversation = get_owned_conversation(db_session, conversation_uuid, org_id, user_id)
    allowed_context = [uuid for uuid in context_resource_uuids if uuid in accessible_resource_uuids]
    _replace_context(db_session, conversation, allowed_context)
    for update in message_resources:
        message = db_session.exec(select(HubConversationMessage).where(
            HubConversationMessage.message_uuid == update["message_uuid"],
            HubConversationMessage.conversation_id == conversation.id,
        )).first()
        if message is None:
            continue
        existing = db_session.exec(select(HubConversationMessageResource).where(
            HubConversationMessageResource.message_id == message.id
        )).all()
        for row in existing:
            db_session.delete(row)
        db_session.flush()
        for index, resource_uuid in enumerate(dict.fromkeys(update["resource_uuids"])):
            if resource_uuid in accessible_resource_uuids:
                db_session.add(HubConversationMessageResource(
                    message_id=int(message.id), resource_uuid=resource_uuid,
                    display_order=index, label=update.get("label") or ("You added" if message.role == "user" else "Suggested"),
                ))
    db_session.commit()


def _public_resources(accessible_resources: list[dict]) -> dict[str, dict]:
    result = {}
    for resource in accessible_resources:
        uuid = str(resource.get("resource_uuid") or "")
        if not uuid:
            continue
        result[uuid] = {
            "resource_uuid": uuid,
            "title": str(resource.get("title") or "")[:200],
            "description": (str(resource.get("description"))[:360] if resource.get("description") else None),
            "resource_type": getattr(resource.get("resource_type"), "value", resource.get("resource_type") or "other"),
            "provider_name": resource.get("provider_name"),
            "external_url": str(resource.get("external_url") or "")[:2_000],
            "cover_image_url": resource.get("cover_image_url"),
            "thumbnail_image": resource.get("thumbnail_image"),
            "owner_org_uuid": resource.get("owner_org_uuid"),
            "access_mode": getattr(resource.get("access_mode"), "value", resource.get("access_mode") or "free"),
            "tags": [str(tag.get("name") or "")[:80] for tag in resource.get("tags") or []][:8],
        }
    return result


def conversation_detail(
    db_session: Session, conversation_uuid: str, org_id: int, user_id: int,
    accessible_resources: list[dict],
) -> dict:
    conversation = get_owned_conversation(db_session, conversation_uuid, org_id, user_id)
    from src.services.hub_context import visible_receipt
    resources_by_uuid = _public_resources(accessible_resources)
    messages = db_session.exec(select(HubConversationMessage).where(
        HubConversationMessage.conversation_id == conversation.id
    ).order_by(HubConversationMessage.sequence)).all()
    associations = db_session.exec(
        select(HubConversationMessageResource)
        .join(HubConversationMessage, HubConversationMessage.id == HubConversationMessageResource.message_id)
        .where(HubConversationMessage.conversation_id == conversation.id)
        .order_by(HubConversationMessageResource.display_order)
    ).all()
    by_message: dict[int, list[HubConversationMessageResource]] = {}
    for association in associations:
        by_message.setdefault(association.message_id, []).append(association)
    context = db_session.exec(select(HubConversationResource).where(
        HubConversationResource.conversation_id == conversation.id,
        HubConversationResource.active.is_(True),  # type: ignore[union-attr]
    ).order_by(HubConversationResource.display_order)).all()
    memory_receipts = message_memory_receipts(
        db_session, [int(message.id) for message in messages]
    )
    return {
        "conversation_uuid": conversation.conversation_uuid,
        "title": conversation.title,
        "created_at": conversation.created_at,
        "updated_at": conversation.updated_at,
        "messages": [{
            "id": message.message_uuid,
            "role": message.role,
            "content": "" if message.kind == "search" else message.content,
            "search_query": message.content if message.kind == "search" else None,
            "resource_label": next((row.label for row in by_message.get(int(message.id), [])), None),
            "resources": [resources_by_uuid[row.resource_uuid] for row in by_message.get(int(message.id), []) if row.resource_uuid in resources_by_uuid],
            "created_at": message.created_at,
            "memories": memory_receipts.get(int(message.id), []),
            "page_context": visible_receipt(db_session, message.page_context, org_id, user_id),
            "suggested_actions": [decorate_navigation_action(action) for action in (message.suggested_actions or [])],
        } for message in messages],
        "context_resources": [resources_by_uuid[row.resource_uuid] for row in context if row.resource_uuid in resources_by_uuid],
    }


def rename_conversation(db_session: Session, conversation_uuid: str, org_id: int, user_id: int, title: str) -> dict:
    conversation = get_owned_conversation(db_session, conversation_uuid, org_id, user_id)
    normalized = " ".join(title.split())
    if not normalized:
        raise HTTPException(status_code=422, detail="Conversation title is required")
    conversation.title = normalized[:120]
    conversation.updated_at = datetime.utcnow()
    db_session.add(conversation)
    db_session.commit()
    return {"conversation_uuid": conversation.conversation_uuid, "title": conversation.title}


def archive_conversation(db_session: Session, conversation_uuid: str, org_id: int, user_id: int) -> None:
    conversation = get_owned_conversation(db_session, conversation_uuid, org_id, user_id)
    conversation.archived_at = datetime.utcnow()
    db_session.add(conversation)
    db_session.commit()


def delete_conversation(db_session: Session, conversation_uuid: str, org_id: int, user_id: int) -> None:
    conversation = get_owned_conversation(db_session, conversation_uuid, org_id, user_id)
    db_session.delete(conversation)
    db_session.commit()
