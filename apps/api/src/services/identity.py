from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from src.db.identity import (
    ContentFrameworkTag,
    DevelopmentState,
    FrameworkContentType,
    FrameworkNodeRead,
    IdentityNodeDetailRead,
    IdentitySummaryRead,
    InsightStatus,
    KnowledgeEntryStatus,
    KnowledgeSourceType,
    LifeFrameworkNode,
    UserFrameworkProfile,
    UserFrameworkProfileRead,
    UserFrameworkProfileUpdate,
    UserInsight,
    UserInsightCreate,
    UserInsightEvidence,
    UserInsightRead,
    UserInsightUpdate,
    UserKnowledgeEntry,
    UserKnowledgeEntryCreate,
    UserKnowledgeEntryRead,
    UserKnowledgeEntryTag,
    UserKnowledgeEntryUpdate,
)
from src.db.resources import Resource
from src.db.users import PublicUser
from src.security.org_auth import require_org_membership


STALE_DAYS = 90


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _get_node_by_key_or_404(node_key: str, db_session: Session) -> LifeFrameworkNode:
    node = db_session.exec(select(LifeFrameworkNode).where(LifeFrameworkNode.key == node_key)).first()
    if not node:
        raise HTTPException(status_code=404, detail="Framework node not found")
    return node


def _nodes_by_key(node_keys: list[str], db_session: Session) -> dict[str, LifeFrameworkNode]:
    normalized = list(dict.fromkeys([key.strip() for key in node_keys if key.strip()]))
    if not normalized:
        return {}
    nodes = db_session.exec(select(LifeFrameworkNode).where(LifeFrameworkNode.key.in_(normalized))).all()
    found = {node.key: node for node in nodes}
    missing = [key for key in normalized if key not in found]
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown framework node key: {missing[0]}")
    return found


def _active_nodes(db_session: Session) -> list[LifeFrameworkNode]:
    return db_session.exec(
        select(LifeFrameworkNode)
        .where(LifeFrameworkNode.is_active == True)  # noqa: E712
        .order_by(LifeFrameworkNode.sort_order.asc(), LifeFrameworkNode.title.asc())
    ).all()


def _node_metrics(user_id: int, org_id: int, db_session: Session) -> dict[int, dict]:
    evidence_rows = db_session.exec(
        select(UserKnowledgeEntryTag.framework_node_id, func.count(UserKnowledgeEntry.id), func.max(UserKnowledgeEntry.update_date))
        .join(UserKnowledgeEntry, UserKnowledgeEntry.id == UserKnowledgeEntryTag.entry_id)
        .where(
            UserKnowledgeEntry.user_id == user_id,
            UserKnowledgeEntry.org_id == org_id,
            UserKnowledgeEntry.status == KnowledgeEntryStatus.active,
        )
        .group_by(UserKnowledgeEntryTag.framework_node_id)
    ).all()
    insight_rows = db_session.exec(
        select(UserInsight.framework_node_id, func.count(UserInsight.id), func.max(UserInsight.update_date))
        .where(
            UserInsight.user_id == user_id,
            UserInsight.org_id == org_id,
            UserInsight.status == InsightStatus.confirmed,
        )
        .group_by(UserInsight.framework_node_id)
    ).all()
    source_rows = db_session.exec(
        select(UserKnowledgeEntryTag.framework_node_id, UserKnowledgeEntry.source_type)
        .join(UserKnowledgeEntry, UserKnowledgeEntry.id == UserKnowledgeEntryTag.entry_id)
        .where(
            UserKnowledgeEntry.user_id == user_id,
            UserKnowledgeEntry.org_id == org_id,
            UserKnowledgeEntry.status == KnowledgeEntryStatus.active,
        )
    ).all()
    profiles = db_session.exec(
        select(UserFrameworkProfile).where(
            UserFrameworkProfile.user_id == user_id,
            UserFrameworkProfile.org_id == org_id,
        )
    ).all()

    metrics: dict[int, dict] = {}
    for node_id, count, latest in evidence_rows:
        metrics.setdefault(node_id, {})["evidence_count"] = int(count or 0)
        metrics[node_id]["latest_update"] = latest
    for node_id, count, latest in insight_rows:
        metrics.setdefault(node_id, {})["insight_count"] = int(count or 0)
        current = metrics[node_id].get("latest_update")
        metrics[node_id]["latest_update"] = max([item for item in [current, latest] if item] or [None])
    for node_id, source_type in source_rows:
        metrics.setdefault(node_id, {}).setdefault("source_types", set()).add(source_type)
    for profile in profiles:
        metrics.setdefault(profile.framework_node_id, {})["profile"] = profile
        current = metrics[profile.framework_node_id].get("latest_update")
        metrics[profile.framework_node_id]["latest_update"] = max(
            [item for item in [current, profile.update_date] if item] or [None]
        )
    return metrics


def _derive_state(metric: dict) -> DevelopmentState:
    profile: UserFrameworkProfile | None = metric.get("profile")
    if profile and profile.development_state:
        return profile.development_state

    evidence_count = int(metric.get("evidence_count", 0) or 0)
    insight_count = int(metric.get("insight_count", 0) or 0)
    has_summary = bool(profile and (profile.summary or "").strip())
    source_count = len(metric.get("source_types", set()) or set())
    latest = _parse_dt(metric.get("latest_update"))

    if evidence_count == 0 and insight_count == 0:
        return DevelopmentState.empty
    if has_summary and insight_count > 0 and source_count >= 2:
        state = DevelopmentState.developed
    elif insight_count > 0 or evidence_count >= 3:
        state = DevelopmentState.emerging
    else:
        state = DevelopmentState.started

    if state in {DevelopmentState.developed, DevelopmentState.emerging} and latest:
        if latest < datetime.now(timezone.utc) - timedelta(days=STALE_DAYS):
            return DevelopmentState.stale
    return state


def _node_read(node: LifeFrameworkNode, metrics: dict[int, dict], children: list[FrameworkNodeRead] | None = None) -> FrameworkNodeRead:
    metric = metrics.get(node.id or 0, {})
    return FrameworkNodeRead(
        id=node.id or 0,
        key=node.key,
        parent_id=node.parent_id,
        title=node.title,
        description=node.description,
        node_type=node.node_type,
        sort_order=node.sort_order,
        evidence_count=int(metric.get("evidence_count", 0) or 0),
        insight_count=int(metric.get("insight_count", 0) or 0),
        development_state=_derive_state(metric),
        latest_update=metric.get("latest_update"),
        children=children or [],
    )


def _framework_tree(user_id: int, org_id: int, db_session: Session) -> list[FrameworkNodeRead]:
    nodes = _active_nodes(db_session)
    metrics = _node_metrics(user_id, org_id, db_session)
    children_by_parent: dict[int | None, list[LifeFrameworkNode]] = {}
    for node in nodes:
        children_by_parent.setdefault(node.parent_id, []).append(node)

    def build(node: LifeFrameworkNode) -> FrameworkNodeRead:
        children = [build(child) for child in children_by_parent.get(node.id, [])]
        return _node_read(node, metrics, children)

    return [build(node) for node in children_by_parent.get(None, [])]


def _entry_read(entry: UserKnowledgeEntry, db_session: Session) -> UserKnowledgeEntryRead:
    nodes = db_session.exec(
        select(LifeFrameworkNode)
        .join(UserKnowledgeEntryTag, LifeFrameworkNode.id == UserKnowledgeEntryTag.framework_node_id)
        .where(UserKnowledgeEntryTag.entry_id == entry.id)
        .order_by(LifeFrameworkNode.sort_order.asc())
    ).all()
    return UserKnowledgeEntryRead(
        entry_uuid=entry.entry_uuid,
        source_type=entry.source_type,
        source_content_type=entry.source_content_type,
        source_content_uuid=entry.source_content_uuid,
        title=entry.title,
        body=entry.body,
        source_url=entry.source_url,
        file_url=entry.file_url,
        raw_payload=entry.raw_payload or {},
        status=entry.status,
        framework_nodes=[{"key": node.key, "title": node.title} for node in nodes],
        creation_date=entry.creation_date,
        update_date=entry.update_date,
    )


def _insight_read(insight: UserInsight, db_session: Session) -> UserInsightRead:
    node = db_session.get(LifeFrameworkNode, insight.framework_node_id)
    evidence_uuids = db_session.exec(
        select(UserKnowledgeEntry.entry_uuid)
        .join(UserInsightEvidence, UserKnowledgeEntry.id == UserInsightEvidence.entry_id)
        .where(UserInsightEvidence.insight_id == insight.id)
        .order_by(UserKnowledgeEntry.update_date.desc())
    ).all()
    return UserInsightRead(
        insight_uuid=insight.insight_uuid,
        framework_node_key=node.key if node else "",
        insight_type=insight.insight_type,
        label=insight.label,
        summary=insight.summary,
        structured_value=insight.structured_value or {},
        status=insight.status,
        confidence=insight.confidence,
        evidence_entry_uuids=list(evidence_uuids),
        creation_date=insight.creation_date,
        update_date=insight.update_date,
    )


def _set_entry_tags(entry: UserKnowledgeEntry, node_keys: list[str], db_session: Session) -> None:
    nodes = _nodes_by_key(node_keys, db_session)
    existing = db_session.exec(select(UserKnowledgeEntryTag).where(UserKnowledgeEntryTag.entry_id == entry.id)).all()
    existing_ids = {tag.framework_node_id for tag in existing}
    target_ids = {node.id for node in nodes.values() if node.id is not None}
    for tag in existing:
        if tag.framework_node_id not in target_ids:
            db_session.delete(tag)
    for node_id in target_ids - existing_ids:
        db_session.add(UserKnowledgeEntryTag(entry_id=entry.id or 0, framework_node_id=node_id, creation_date=_now()))


def _set_insight_evidence(insight: UserInsight, entry_uuids: list[str], user_id: int, org_id: int, db_session: Session) -> None:
    normalized = list(dict.fromkeys([uuid.strip() for uuid in entry_uuids if uuid.strip()]))
    entries = []
    if normalized:
        entries = db_session.exec(
            select(UserKnowledgeEntry).where(
                UserKnowledgeEntry.user_id == user_id,
                UserKnowledgeEntry.org_id == org_id,
                UserKnowledgeEntry.entry_uuid.in_(normalized),
            )
        ).all()
    found = {entry.entry_uuid: entry for entry in entries}
    missing = [uuid for uuid in normalized if uuid not in found]
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown evidence entry: {missing[0]}")

    existing = db_session.exec(select(UserInsightEvidence).where(UserInsightEvidence.insight_id == insight.id)).all()
    existing_ids = {row.entry_id for row in existing}
    target_ids = {entry.id for entry in entries if entry.id is not None}
    for row in existing:
        if row.entry_id not in target_ids:
            db_session.delete(row)
    for entry_id in target_ids - existing_ids:
        db_session.add(UserInsightEvidence(insight_id=insight.id or 0, entry_id=entry_id, creation_date=_now()))


async def get_framework(user: PublicUser, org_id: int, db_session: Session) -> list[FrameworkNodeRead]:
    require_org_membership(user.id, org_id, db_session)
    return _framework_tree(user.id, org_id, db_session)


async def get_identity_summary(user: PublicUser, org_id: int, db_session: Session) -> IdentitySummaryRead:
    require_org_membership(user.id, org_id, db_session)
    roots = _framework_tree(user.id, org_id, db_session)
    top_insights = db_session.exec(
        select(UserInsight)
        .where(UserInsight.user_id == user.id, UserInsight.org_id == org_id, UserInsight.status == InsightStatus.confirmed)
        .order_by(UserInsight.update_date.desc())
        .limit(3)
    ).all()
    recent_evidence = db_session.exec(
        select(UserKnowledgeEntry)
        .where(UserKnowledgeEntry.user_id == user.id, UserKnowledgeEntry.org_id == org_id, UserKnowledgeEntry.status == KnowledgeEntryStatus.active)
        .order_by(UserKnowledgeEntry.update_date.desc())
        .limit(3)
    ).all()

    flat_nodes: list[FrameworkNodeRead] = []

    def flatten(node: FrameworkNodeRead) -> None:
        flat_nodes.append(node)
        for child in node.children:
            flatten(child)

    for root in roots:
        flatten(root)
    suggested = [
        node
        for node in flat_nodes
        if node.node_type in {"driver", "system", "skill"} and node.development_state in {DevelopmentState.empty, DevelopmentState.started}
    ][:3]
    return IdentitySummaryRead(
        roots=roots,
        top_insights=[_insight_read(insight, db_session) for insight in top_insights],
        recent_evidence=[_entry_read(entry, db_session) for entry in recent_evidence],
        suggested_next_nodes=suggested,
    )


async def get_node_detail(user: PublicUser, org_id: int, node_key: str, db_session: Session) -> IdentityNodeDetailRead:
    require_org_membership(user.id, org_id, db_session)
    node = _get_node_by_key_or_404(node_key, db_session)
    metrics = _node_metrics(user.id, org_id, db_session)
    profile = db_session.exec(
        select(UserFrameworkProfile).where(
            UserFrameworkProfile.user_id == user.id,
            UserFrameworkProfile.org_id == org_id,
            UserFrameworkProfile.framework_node_id == node.id,
        )
    ).first()
    insights = db_session.exec(
        select(UserInsight)
        .where(UserInsight.user_id == user.id, UserInsight.org_id == org_id, UserInsight.framework_node_id == node.id)
        .order_by(UserInsight.update_date.desc())
    ).all()
    evidence = db_session.exec(
        select(UserKnowledgeEntry)
        .join(UserKnowledgeEntryTag, UserKnowledgeEntry.id == UserKnowledgeEntryTag.entry_id)
        .where(
            UserKnowledgeEntry.user_id == user.id,
            UserKnowledgeEntry.org_id == org_id,
            UserKnowledgeEntry.status == KnowledgeEntryStatus.active,
            UserKnowledgeEntryTag.framework_node_id == node.id,
        )
        .order_by(UserKnowledgeEntry.update_date.desc())
    ).all()
    resource_tags = db_session.exec(
        select(ContentFrameworkTag, Resource)
        .join(Resource, Resource.resource_uuid == ContentFrameworkTag.content_uuid)
        .where(
            ContentFrameworkTag.org_id == org_id,
            ContentFrameworkTag.framework_node_id == node.id,
            ContentFrameworkTag.content_type == FrameworkContentType.resource,
        )
        .limit(10)
    ).all()
    tagged_content = [
        {
            "content_type": tag.content_type,
            "content_uuid": resource.resource_uuid,
            "title": resource.title,
            "intent": tag.intent,
            "relevance": tag.relevance,
        }
        for tag, resource in resource_tags
    ]
    return IdentityNodeDetailRead(
        node=_node_read(node, metrics),
        profile=UserFrameworkProfileRead(
            framework_node_key=node.key,
            summary=profile.summary if profile else None,
            development_state=_derive_state(metrics.get(node.id or 0, {})),
            user_confidence=profile.user_confidence if profile else None,
            reviewed_at=profile.reviewed_at if profile else None,
            update_date=profile.update_date if profile else None,
        ) if profile else None,
        insights=[_insight_read(insight, db_session) for insight in insights],
        evidence=[_entry_read(entry, db_session) for entry in evidence],
        tagged_content=tagged_content,
    )


async def create_entry(user: PublicUser, org_id: int, entry_data: UserKnowledgeEntryCreate, db_session: Session) -> UserKnowledgeEntryRead:
    require_org_membership(user.id, org_id, db_session)
    now = _now()
    entry = UserKnowledgeEntry(
        entry_uuid=f"knowledge_{uuid4()}",
        user_id=user.id,
        org_id=org_id,
        source_type=entry_data.source_type,
        source_id=entry_data.source_id,
        source_content_type=entry_data.source_content_type,
        source_content_uuid=entry_data.source_content_uuid,
        title=entry_data.title.strip(),
        body=entry_data.body,
        source_url=entry_data.source_url,
        file_url=entry_data.file_url,
        raw_payload=entry_data.raw_payload,
        status=KnowledgeEntryStatus.active,
        creation_date=now,
        update_date=now,
    )
    if not entry.title:
        raise HTTPException(status_code=400, detail="Title is required")
    db_session.add(entry)
    db_session.commit()
    db_session.refresh(entry)
    _set_entry_tags(entry, entry_data.framework_node_keys, db_session)
    db_session.commit()
    return _entry_read(entry, db_session)


async def update_entry(user: PublicUser, org_id: int, entry_uuid: str, entry_data: UserKnowledgeEntryUpdate, db_session: Session) -> UserKnowledgeEntryRead:
    require_org_membership(user.id, org_id, db_session)
    entry = db_session.exec(
        select(UserKnowledgeEntry).where(
            UserKnowledgeEntry.entry_uuid == entry_uuid,
            UserKnowledgeEntry.user_id == user.id,
            UserKnowledgeEntry.org_id == org_id,
        )
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Evidence entry not found")
    updates = entry_data.model_dump(exclude_unset=True)
    framework_node_keys = updates.pop("framework_node_keys", None)
    for key, value in updates.items():
        setattr(entry, key, value)
    entry.update_date = _now()
    db_session.add(entry)
    if framework_node_keys is not None:
        _set_entry_tags(entry, framework_node_keys, db_session)
    db_session.commit()
    db_session.refresh(entry)
    return _entry_read(entry, db_session)


async def create_insight(user: PublicUser, org_id: int, insight_data: UserInsightCreate, db_session: Session) -> UserInsightRead:
    require_org_membership(user.id, org_id, db_session)
    node = _get_node_by_key_or_404(insight_data.framework_node_key, db_session)
    now = _now()
    insight = UserInsight(
        insight_uuid=f"insight_{uuid4()}",
        user_id=user.id,
        org_id=org_id,
        framework_node_id=node.id or 0,
        insight_type=insight_data.insight_type,
        label=insight_data.label.strip(),
        summary=insight_data.summary,
        structured_value=insight_data.structured_value,
        status=insight_data.status,
        confidence=insight_data.confidence,
        creation_date=now,
        update_date=now,
    )
    if not insight.label:
        raise HTTPException(status_code=400, detail="Label is required")
    db_session.add(insight)
    db_session.commit()
    db_session.refresh(insight)
    _set_insight_evidence(insight, insight_data.evidence_entry_uuids, user.id, org_id, db_session)
    db_session.commit()
    return _insight_read(insight, db_session)


async def update_insight(user: PublicUser, org_id: int, insight_uuid: str, insight_data: UserInsightUpdate, db_session: Session) -> UserInsightRead:
    require_org_membership(user.id, org_id, db_session)
    insight = db_session.exec(
        select(UserInsight).where(UserInsight.insight_uuid == insight_uuid, UserInsight.user_id == user.id, UserInsight.org_id == org_id)
    ).first()
    if not insight:
        raise HTTPException(status_code=404, detail="Insight not found")
    updates = insight_data.model_dump(exclude_unset=True)
    evidence_entry_uuids = updates.pop("evidence_entry_uuids", None)
    for key, value in updates.items():
        setattr(insight, key, value)
    insight.update_date = _now()
    db_session.add(insight)
    if evidence_entry_uuids is not None:
        _set_insight_evidence(insight, evidence_entry_uuids, user.id, org_id, db_session)
    db_session.commit()
    db_session.refresh(insight)
    return _insight_read(insight, db_session)


async def update_profile(user: PublicUser, org_id: int, node_key: str, profile_data: UserFrameworkProfileUpdate, db_session: Session) -> UserFrameworkProfileRead:
    require_org_membership(user.id, org_id, db_session)
    node = _get_node_by_key_or_404(node_key, db_session)
    profile = db_session.exec(
        select(UserFrameworkProfile).where(
            UserFrameworkProfile.user_id == user.id,
            UserFrameworkProfile.org_id == org_id,
            UserFrameworkProfile.framework_node_id == node.id,
        )
    ).first()
    now = _now()
    if not profile:
        profile = UserFrameworkProfile(
            user_id=user.id,
            org_id=org_id,
            framework_node_id=node.id or 0,
            creation_date=now,
            update_date=now,
        )
    updates = profile_data.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(profile, key, value)
    profile.update_date = now
    db_session.add(profile)
    db_session.commit()
    db_session.refresh(profile)
    metrics = _node_metrics(user.id, org_id, db_session)
    return UserFrameworkProfileRead(
        framework_node_key=node.key,
        summary=profile.summary,
        development_state=_derive_state(metrics.get(node.id or 0, {})),
        user_confidence=profile.user_confidence,
        reviewed_at=profile.reviewed_at,
        update_date=profile.update_date,
    )


def _resource_framework_node_keys(resource: Resource, db_session: Session) -> list[str]:
    rows = db_session.exec(
        select(LifeFrameworkNode.key)
        .join(ContentFrameworkTag, LifeFrameworkNode.id == ContentFrameworkTag.framework_node_id)
        .where(
            ContentFrameworkTag.org_id == resource.org_id,
            ContentFrameworkTag.content_type == FrameworkContentType.resource,
            ContentFrameworkTag.content_uuid == resource.resource_uuid,
        )
    ).all()
    return list(rows)


def upsert_resource_outcome_entry(
    *,
    user: PublicUser,
    resource: Resource,
    notes: str | None,
    outcome_text: str | None,
    outcome_link: str | None,
    outcome_file: str | None,
    db_session: Session,
) -> None:
    if not any([(notes or "").strip(), (outcome_text or "").strip(), (outcome_link or "").strip(), outcome_file]):
        return
    now = _now()
    entry = db_session.exec(
        select(UserKnowledgeEntry).where(
            UserKnowledgeEntry.user_id == user.id,
            UserKnowledgeEntry.org_id == resource.org_id,
            UserKnowledgeEntry.source_type == KnowledgeSourceType.resource_outcome,
            UserKnowledgeEntry.source_content_uuid == resource.resource_uuid,
        )
    ).first()
    raw_payload = {
        "resource_uuid": resource.resource_uuid,
        "resource_title": resource.title,
        "notes": notes,
        "outcome_text": outcome_text,
        "outcome_link": outcome_link,
        "outcome_file": outcome_file,
    }
    if not entry:
        entry = UserKnowledgeEntry(
            entry_uuid=f"knowledge_{uuid4()}",
            user_id=user.id,
            org_id=resource.org_id,
            source_type=KnowledgeSourceType.resource_outcome,
            source_id=resource.id,
            source_content_type="resource",
            source_content_uuid=resource.resource_uuid,
            title=f"Outcome from {resource.title}",
            creation_date=now,
        )
    entry.body = outcome_text or notes
    entry.source_url = outcome_link
    entry.file_url = outcome_file
    entry.raw_payload = raw_payload
    entry.status = KnowledgeEntryStatus.active
    entry.update_date = now
    db_session.add(entry)
    db_session.commit()
    db_session.refresh(entry)
    _set_entry_tags(entry, _resource_framework_node_keys(resource, db_session), db_session)
    db_session.commit()
