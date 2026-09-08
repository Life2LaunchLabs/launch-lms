"""Persistent and hybrid resource-search orchestration."""

import hashlib
import hmac
import json
import logging
import os
from datetime import datetime, timezone

import httpx
from sqlmodel import Session, func, select

from src.db.resources import (
    Resource,
    ResourceSearchDocument as PersistentResourceSearchDocument,
    ResourceTag,
    ResourceTagLink,
)
from src.services.search.resource_lexical import (
    HYBRID_SEARCH_VERSION,
    RESOURCE_SEARCH_VERSION,
    RankedResource,
    ResourceSearchDocument,
    fuse_resource_rankings,
    rank_resource_documents,
)

logger = logging.getLogger(__name__)

RESOURCE_DOCUMENT_VERSION = "resource-document-v1"
DEFAULT_EMBEDDING_MODEL = "all-minilm:33m"
DEFAULT_EMBEDDING_URL = "http://embeddings:11434/api/embed"
EMBEDDING_DIMENSIONS = 384
DEFAULT_SEMANTIC_MAX_DISTANCE = 0.65


def vector_search_enabled() -> bool:
    return os.getenv("LAUNCHLMS_RESOURCE_VECTOR_SEARCH_ENABLED", "false").lower() in {"1", "true", "yes"}


def embedding_model() -> str:
    return os.getenv("LAUNCHLMS_RESOURCE_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL).strip()


def embedding_url() -> str:
    return os.getenv("LAUNCHLMS_RESOURCE_EMBEDDING_URL", DEFAULT_EMBEDDING_URL).strip()


def semantic_max_distance() -> float:
    try:
        configured = float(os.getenv("LAUNCHLMS_RESOURCE_SEMANTIC_MAX_DISTANCE", DEFAULT_SEMANTIC_MAX_DISTANCE))
    except ValueError:
        return DEFAULT_SEMANTIC_MAX_DISTANCE
    return min(max(configured, 0.0), 2.0)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _tags_for_resource(resource_id: int, db_session: Session) -> list[str]:
    return list(db_session.exec(
        select(ResourceTag.name)
        .join(ResourceTagLink, ResourceTag.id == ResourceTagLink.tag_id)
        .where(ResourceTagLink.resource_id == resource_id)
        .order_by(ResourceTag.name.asc())
    ).all())


def live_search_document(resource: Resource, tags: list[str]) -> ResourceSearchDocument:
    return ResourceSearchDocument(
        key=str(resource.id),
        title=resource.title,
        description=resource.description or "",
        provider=resource.provider_name or "",
        resource_type=resource.resource_type.value,
        tags=tuple(tags),
    )


def _document_payload(document: ResourceSearchDocument) -> dict[str, str]:
    return {
        "title": document.title,
        "description": document.description,
        "provider": document.provider,
        "resource_type": document.resource_type,
        "tags_text": "\n".join(document.tags),
        "search_text": "\n".join(filter(None, [
            document.title,
            " ".join(document.tags),
            document.resource_type,
            document.provider,
            document.description,
        ])),
    }


def _content_hash(payload: dict[str, str]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


def refresh_resource_search_document(resource: Resource, db_session: Session) -> PersistentResourceSearchDocument:
    """Upsert one projection and invalidate only its stale embedding."""
    document = live_search_document(resource, _tags_for_resource(resource.id, db_session))
    payload = _document_payload(document)
    content_hash = _content_hash(payload)
    stored = db_session.exec(
        select(PersistentResourceSearchDocument).where(PersistentResourceSearchDocument.resource_id == resource.id)
    ).first()
    now = _now()
    if stored is None:
        stored = PersistentResourceSearchDocument(
            resource_id=resource.id,
            org_id=resource.org_id,
            document_version=RESOURCE_DOCUMENT_VERSION,
            content_hash=content_hash,
            creation_date=now,
            update_date=now,
            **payload,
        )
    elif stored.content_hash != content_hash or stored.document_version != RESOURCE_DOCUMENT_VERSION:
        for field, value in payload.items():
            setattr(stored, field, value)
        stored.org_id = resource.org_id
        stored.document_version = RESOURCE_DOCUMENT_VERSION
        stored.content_hash = content_hash
        stored.embedding = None
        stored.embedding_model = None
        stored.embedding_version = None
        stored.embedding_updated_at = None
        stored.update_date = now
    db_session.add(stored)
    db_session.commit()
    db_session.refresh(stored)
    return stored


def refresh_search_documents_for_tag(tag_id: int, db_session: Session) -> int:
    resource_ids = list(db_session.exec(
        select(ResourceTagLink.resource_id).where(ResourceTagLink.tag_id == tag_id)
    ).all())
    resources = db_session.exec(select(Resource).where(Resource.id.in_(resource_ids))).all() if resource_ids else []
    for resource in resources:
        refresh_resource_search_document(resource, db_session)
    return len(resources)


def refresh_search_documents(resource_ids: list[int], db_session: Session) -> int:
    resources = db_session.exec(select(Resource).where(Resource.id.in_(resource_ids))).all() if resource_ids else []
    for resource in resources:
        refresh_resource_search_document(resource, db_session)
    return len(resources)


async def _embed_texts(texts: list[str], model: str) -> list[list[float]]:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            embedding_url(),
            json={"input": texts, "model": model, "truncate": True},
        )
    response.raise_for_status()
    embeddings = response.json().get("embeddings", [])
    if len(embeddings) != len(texts) or any(len(embedding) != EMBEDDING_DIMENSIONS for embedding in embeddings):
        raise RuntimeError("Embedding provider returned an incomplete batch")
    return embeddings


async def refresh_resource_search_embedding(resource_id: int, db_session: Session) -> bool:
    if not vector_search_enabled() or db_session.get_bind().dialect.name != "postgresql":
        return False
    stored = db_session.exec(
        select(PersistentResourceSearchDocument).where(PersistentResourceSearchDocument.resource_id == resource_id)
    ).first()
    if not stored:
        return False
    model = embedding_model()
    embedding = (await _embed_texts([stored.search_text], model))[0]
    stored.embedding = embedding
    stored.embedding_model = model
    stored.embedding_version = f"ollama:{model}:{EMBEDDING_DIMENSIONS}"
    stored.embedding_updated_at = _now()
    stored.update_date = _now()
    db_session.add(stored)
    db_session.commit()
    return True


async def refresh_resource_search_embedding_task(resource_id: int) -> None:
    from src.core.events.database import engine

    with Session(engine) as db_session:
        try:
            await refresh_resource_search_embedding(resource_id, db_session)
        except (httpx.HTTPError, RuntimeError, ValueError):
            logger.warning("Resource embedding refresh failed resource_id=%s", resource_id, exc_info=True)


async def semantic_resource_ids(query: str, allowed_resource_ids: list[int], db_session: Session) -> list[str]:
    if not allowed_resource_ids or not vector_search_enabled() or db_session.get_bind().dialect.name != "postgresql":
        return []
    try:
        query_embedding = (await _embed_texts([query], embedding_model()))[0]
        distance = PersistentResourceSearchDocument.embedding.cosine_distance(query_embedding)
        rows = db_session.exec(
            select(PersistentResourceSearchDocument.resource_id)
            .where(
                PersistentResourceSearchDocument.resource_id.in_(allowed_resource_ids),
                PersistentResourceSearchDocument.embedding.is_not(None),
                PersistentResourceSearchDocument.embedding_model == embedding_model(),
                distance <= semantic_max_distance(),
            )
            .order_by(distance)
            .limit(min(len(allowed_resource_ids), 100))
        ).all()
        return [str(resource_id) for resource_id in rows]
    except (httpx.HTTPError, RuntimeError, ValueError):
        logger.warning("Semantic resource retrieval failed; using lexical fallback", exc_info=True)
        return []


async def rank_resources(
    resources: list[Resource],
    tags_by_resource: dict[int, list[str]],
    query: str,
    db_session: Session,
) -> tuple[list[RankedResource], str]:
    stored_rows = db_session.exec(
        select(PersistentResourceSearchDocument).where(
            PersistentResourceSearchDocument.resource_id.in_([resource.id for resource in resources])
        )
    ).all() if resources else []
    stored_by_resource = {row.resource_id: row for row in stored_rows}
    documents = []
    for resource in resources:
        stored = stored_by_resource.get(resource.id)
        if stored and stored.document_version == RESOURCE_DOCUMENT_VERSION:
            documents.append(ResourceSearchDocument(
                key=str(resource.id),
                title=stored.title,
                description=stored.description,
                provider=stored.provider,
                resource_type=stored.resource_type,
                tags=tuple(filter(None, stored.tags_text.split("\n"))),
            ))
        else:
            documents.append(live_search_document(resource, tags_by_resource.get(resource.id, [])))
    lexical = rank_resource_documents(documents, query)
    semantic = await semantic_resource_ids(query, [resource.id for resource in resources], db_session)
    if not semantic:
        return lexical, RESOURCE_SEARCH_VERSION
    document_map = {document.key: document for document in documents}
    return fuse_resource_rankings(lexical, semantic, document_map), HYBRID_SEARCH_VERSION


async def backfill_resource_search_documents(org_id: int) -> dict[str, int | str | bool]:
    from src.core.events.database import engine

    created_or_refreshed = 0
    embedded = 0
    with Session(engine) as db_session:
        resources = db_session.exec(select(Resource).where(Resource.org_id == org_id)).all()
        for resource in resources:
            stored = refresh_resource_search_document(resource, db_session)
            created_or_refreshed += 1
            if stored.embedding is None or stored.embedding_model != embedding_model():
                try:
                    embedded += int(await refresh_resource_search_embedding(resource.id, db_session))
                except (httpx.HTTPError, RuntimeError, ValueError):
                    logger.warning("Resource embedding backfill stopped after provider failure", exc_info=True)
                    break
    return {"documents": created_or_refreshed, "embedded": embedded, "vector_enabled": vector_search_enabled()}


def resource_search_index_status(org_id: int, db_session: Session) -> dict[str, int | str | bool]:
    total = db_session.exec(select(func.count(Resource.id)).where(Resource.org_id == org_id)).one()
    documents = db_session.exec(
        select(func.count(PersistentResourceSearchDocument.id)).where(PersistentResourceSearchDocument.org_id == org_id)
    ).one()
    embedded = db_session.exec(
        select(func.count(PersistentResourceSearchDocument.id)).where(
            PersistentResourceSearchDocument.org_id == org_id,
            PersistentResourceSearchDocument.embedding.is_not(None),
            PersistentResourceSearchDocument.embedding_model == embedding_model(),
        )
    ).one()
    return {
        "resources": int(total or 0),
        "documents": int(documents or 0),
        "embedded": int(embedded or 0),
        "document_version": RESOURCE_DOCUMENT_VERSION,
        "embedding_model": embedding_model(),
        "vector_enabled": vector_search_enabled(),
    }


def query_fingerprint(query: str, secret: str) -> str:
    normalized = " ".join(query.lower().split())
    return hmac.new(secret.encode(), normalized.encode(), hashlib.sha256).hexdigest()[:24]
