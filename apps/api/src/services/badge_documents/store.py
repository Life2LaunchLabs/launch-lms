"""Read, validate, create, save and publish badges as Badge Documents.

The document is the badge's working version: its newest draft, or the live
version when there is no draft. A published version is never edited in place:
saving credential or Marketing changes over one starts a new draft, and
publishing stays a separate, explicit step. The listing (collection, public,
marketplace) is not versioned and applies at once.

Fields are written the way the admin badge editor writes them, legacy mirrors
included, so the editor and the Open Badges export read them unchanged.
"""

from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError
from sqlmodel import Session, func, select

from src.db.badge_routes import BadgeRoute, BadgeRouteInput, BadgeRoutesUpdate
from src.db.learning import (
    BadgeCollection,
    LearningBadge,
    LearningBadgeCreate,
    LearningBadgeVersion,
    LearningBadgeVersionPublish,
    LearningBadgeVersionState,
)
from src.db.programs import Objective, Program, ProgramObjective
from src.db.users import PublicUser
from src.security.org_auth import require_org_admin
from src.services import badge_routes
from src.services.badge_documents.models import (
    ACHIEVEMENT_TYPES,
    CERTIFICATE_THEMES,
    DOCUMENT_FORMAT,
    DOCUMENT_FORMAT_VERSION,
    BadgeDocument,
)
from src.services.learning import access_rules, badge_service, lookups, version_drafts

_LEGACY_ACHIEVEMENT_TYPES = {
    "assessment": "Assessment", "mastery": "Competency", "professional": "Certification",
    "achievement": "Achievement", "completion": "CertificateOfCompletion",
}


def _certificate_type(achievement_type: str) -> str:
    if achievement_type == "Assessment":
        return "assessment"
    if achievement_type == "Competency":
        return "mastery"
    if achievement_type in ("Certification", "Certificate"):
        return "professional"
    if achievement_type in ("Achievement", "Award", "Badge"):
        return "achievement"
    return "completion"


def _value(item) -> str:
    return item.value if hasattr(item, "value") else str(item)


def _path(loc) -> str:
    path = ""
    for part in loc:
        path += f"[{part}]" if isinstance(part, int) else (f".{part}" if path else str(part))
    return path or "document"


def document_etag(document: dict, version: LearningBadgeVersion) -> str:
    canonical = json.dumps({"document": document, "version": version.version_uuid, "state": _value(version.state)}, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


# Lookups ------------------------------------------------------------------------


def _badge(db: Session, org_id: int, badge_uuid: str) -> LearningBadge:
    badge = lookups._get_badge(db, badge_uuid)
    if badge.org_id != org_id:
        raise HTTPException(status_code=404, detail="Badge not found in the connected organization")
    return badge


def _versions(db: Session, badge: LearningBadge) -> list[LearningBadgeVersion]:
    return list(db.exec(select(LearningBadgeVersion).where(LearningBadgeVersion.badge_id == badge.id).order_by(LearningBadgeVersion.id.desc())).all())  # type: ignore[union-attr]


def _draft(db: Session, badge: LearningBadge) -> LearningBadgeVersion | None:
    return next((item for item in _versions(db, badge) if item.state == LearningBadgeVersionState.DRAFT), None)


def working_version(db: Session, badge: LearningBadge) -> LearningBadgeVersion:
    """The newest draft, else the live version, else the newest version."""
    versions = _versions(db, badge)
    draft = next((item for item in versions if item.state == LearningBadgeVersionState.DRAFT), None)
    live = next((item for item in versions if item.id == badge.active_version_id), None)
    version = draft or live or (versions[0] if versions else None)
    if version is None:
        raise HTTPException(status_code=404, detail="Badge version not found")
    return version


def _collection(db: Session, org_id: int, collection_uuid: str) -> BadgeCollection | None:
    return db.exec(select(BadgeCollection).where(
        BadgeCollection.collection_uuid == access_rules._clean_uuid(collection_uuid, "badge_collection_"),
        BadgeCollection.org_id == org_id, BadgeCollection.deleted_at.is_(None),  # type: ignore[union-attr]
    )).first()


# Export and apply -------------------------------------------------------------


def export_document(db: Session, badge: LearningBadge, definition: dict) -> dict:
    metadata = definition.get("badge_metadata") or {}
    achievement_type = metadata.get("achievement_type") or _LEGACY_ACHIEVEMENT_TYPES.get(str(metadata.get("certification_type") or ""), "Badge")
    theme = metadata.get("badge_theme") or metadata.get("certificate_pattern") or "professional"
    collection = db.get(BadgeCollection, badge.collection_id) if badge.collection_id else None
    return {
        "format": DOCUMENT_FORMAT,
        "format_version": DOCUMENT_FORMAT_VERSION,
        "badge": {
            "name": definition.get("name") or badge.name,
            "description": definition.get("description") or "",
            "criteria": definition.get("criteria") or "",
            "about": definition.get("about") or "",
            "image_url": definition.get("thumbnail_image") or metadata.get("badge_image_url") or "",
            "achievement_type": achievement_type if achievement_type in ACHIEVEMENT_TYPES else "Badge",
            "certificate_theme": theme if theme in CERTIFICATE_THEMES else "professional",
            "criteria_url": metadata.get("criteria_url") or metadata.get("badge_criteria_url") or "",
            "issuer_name": metadata.get("issuer_name") or "",
            "direct_issuance": bool(definition.get("direct_conferral_enabled", True)),
        },
        "marketing": {
            "subtitle": metadata.get("overview_subtitle") or "",
            "estimated_time": metadata.get("estimated_time_label") or metadata.get("estimated_time") or "",
            "trust_line": metadata.get("trust_line") or "",
            "highlights": [
                {
                    "title": str(card.get("title") or ""), "body": str(card.get("body") or ""),
                    "media_url": str(card.get("media_url") or ""), "image_side": "right" if card.get("image_side") == "right" else "left",
                }
                for card in metadata.get("overview_cards") or [] if isinstance(card, dict)
            ],
        },
        "listing": {
            "collection_uuid": collection.collection_uuid if collection and collection.deleted_at is None else None,
            "public": bool(badge.public),
            "marketplace_listed": bool(badge.marketplace_listed),
        },
    }


def apply_definition(definition: dict, document: BadgeDocument) -> dict:
    """The version definition with the document's credential and Marketing written in, other keys kept."""
    credential, marketing = document.badge, document.marketing
    updated = deepcopy(definition or {})
    updated.update({
        "name": credential.name.strip(),
        "description": credential.description.strip(),
        "criteria": credential.criteria.strip(),
        "about": credential.about.strip(),
        "thumbnail_image": credential.image_url.strip(),
        "direct_conferral_enabled": credential.direct_issuance,
    })
    metadata = dict(updated.get("badge_metadata") or {})
    metadata.update({
        "badge_name": credential.name.strip(),
        "certification_name": credential.name.strip(),
        "badge_description": credential.description.strip(),
        "certification_description": credential.description.strip(),
        "achievement_type": credential.achievement_type,
        "certification_type": _certificate_type(credential.achievement_type),
        "badge_theme": credential.certificate_theme,
        "certificate_pattern": credential.certificate_theme,
        "badge_criteria_text": credential.criteria.strip(),
        "criteria_url": credential.criteria_url.strip(),
        "badge_criteria_url": credential.criteria_url.strip(),
        "badge_image_url": credential.image_url.strip(),
        "issuer_name": credential.issuer_name.strip(),
        "overview_subtitle": marketing.subtitle.strip(),
        "estimated_time_label": marketing.estimated_time.strip(),
        "trust_line": marketing.trust_line.strip(),
        "overview_cards": [
            {"title": card.title.strip(), "body": card.body.strip(), "media_url": card.media_url.strip(), "image_side": card.image_side}
            for card in marketing.highlights if card.title.strip() or card.body.strip() or card.media_url.strip()
        ],
    })
    metadata.pop("estimated_time", None)  # superseded by estimated_time_label
    updated["badge_metadata"] = metadata
    return updated


# Validation -------------------------------------------------------------------

_URL = re.compile(r"^(https?://\S+|/content/\S+)$")


def _check(db: Session, org_id: int, raw) -> tuple[BadgeDocument | None, dict, dict]:
    errors: list[dict] = []
    warnings: list[dict] = []

    def report() -> dict:
        return {"valid": not errors, "errors": errors, "warnings": warnings}

    if not isinstance(raw, dict):
        errors.append({"path": "document", "message": "The document must be a JSON object"})
        return None, report(), {}
    raw = {"format": DOCUMENT_FORMAT, "format_version": DOCUMENT_FORMAT_VERSION, **raw}
    try:
        document = BadgeDocument.model_validate(raw)
    except ValidationError as exc:
        errors.extend({"path": _path(item["loc"]), "message": item["msg"]} for item in exc.errors())
        return None, report(), {}

    credential = document.badge
    prepared: dict = {"collection": None}
    if document.listing.collection_uuid:
        prepared["collection"] = _collection(db, org_id, document.listing.collection_uuid)
        if prepared["collection"] is None:
            errors.append({"path": "listing.collection_uuid", "message": f"No badge collection {document.listing.collection_uuid} in this organization (see list_badge_collections)"})
    for path, value in (("badge.image_url", credential.image_url), ("badge.criteria_url", credential.criteria_url)):
        if value.strip() and not _URL.match(value.strip()):
            errors.append({"path": path, "message": "Use an https:// URL (or a /content/... path for images already uploaded to Launch LMS)"})
    for index, card in enumerate(document.marketing.highlights):
        if card.media_url.strip() and not _URL.match(card.media_url.strip()):
            errors.append({"path": f"marketing.highlights[{index}].media_url", "message": "Use an https:// URL"})
        if not (card.title.strip() or card.body.strip() or card.media_url.strip()):
            warnings.append({"path": f"marketing.highlights[{index}]", "message": "Empty highlight; it will be dropped"})
    for field in ("description", "criteria"):
        if not getattr(credential, field).strip():
            warnings.append({"path": f"badge.{field}", "message": f"A {field} is required before the badge can be published"})
    if not credential.image_url.strip():
        warnings.append({"path": "badge.image_url", "message": "No badge image: cards and the certificate show a placeholder. Upload one in the editor or give an https URL."})
    if not credential.about.strip() and not document.marketing.subtitle.strip():
        warnings.append({"path": "marketing.subtitle", "message": "No subtitle or about text: the badge page will look empty in Discover"})
    return document, report(), prepared


def _reject(report: dict) -> HTTPException:
    return HTTPException(status_code=422, detail={"message": "The document has errors; nothing was saved", **report})


# Envelope ----------------------------------------------------------------------


def _version_entry(version: LearningBadgeVersion, badge: LearningBadge) -> dict:
    return {
        "version_uuid": version.version_uuid, "state": _value(version.state), "semantic_version": version.semantic_version,
        "title": version.title, "is_live": version.id == badge.active_version_id,
        "published_at": version.published_at.isoformat() if version.published_at else None,
    }


def route_summaries(db: Session, badge: LearningBadge) -> list[dict]:
    summaries = []
    for route, program in badge_routes._routes(db, badge):
        summary = badge_routes._route_summary(db, program)
        summaries.append({
            "template_uuid": program.program_uuid, "name": program.name, "recommended": route.recommended,
            "step_count": summary["step_count"], "activity_count": summary["activity_count"],
        })
    return summaries


def _semver(value: str | None) -> tuple[int, int, int] | None:
    match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", (value or "").strip())
    return tuple(int(part) for part in match.groups()) if match else None  # type: ignore[return-value]


def next_versions(db: Session, badge: LearningBadge) -> dict:
    published = [parsed for item in _versions(db, badge) if item.state == LearningBadgeVersionState.PUBLISHED and (parsed := _semver(item.semantic_version))]
    if not published:
        return {"first": "1.0.0"}
    major, minor, patch = max(published)
    return {"patch": f"{major}.{minor}.{patch + 1}", "minor": f"{major}.{minor + 1}.0", "major": f"{major + 1}.0.0"}


def envelope(db: Session, badge: LearningBadge) -> dict:
    version = working_version(db, badge)
    document = export_document(db, badge, version.definition or {})
    versions = _versions(db, badge)
    live = next((item for item in versions if item.id == badge.active_version_id), None)
    return {
        "document": document,
        "etag": document_etag(document, version),
        "context": {
            "badge_uuid": badge.badge_uuid,
            "status": _value(badge.status),
            "working_version": _version_entry(version, badge),
            "live_version": _version_entry(live, badge) if live else None,
            "has_unpublished_draft": version.state == LearningBadgeVersionState.DRAFT,
            "next_semantic_versions": next_versions(db, badge),
            "versions": [_version_entry(item, badge) for item in versions],
            "routes": route_summaries(db, badge),
        },
    }


# Operations -------------------------------------------------------------------


def list_badges(db: Session, current_user: PublicUser, org_id: int, query: str = "") -> list[dict]:
    require_org_admin(current_user.id, org_id, db)
    badges = db.exec(select(LearningBadge).where(LearningBadge.org_id == org_id, LearningBadge.deleted_at.is_(None)).order_by(LearningBadge.name.asc())).all()  # type: ignore[union-attr]
    route_counts = dict(db.exec(
        select(BadgeRoute.badge_id, func.count(BadgeRoute.id)).where(BadgeRoute.badge_id.in_([badge.id for badge in badges] or [0])).group_by(BadgeRoute.badge_id)  # type: ignore[arg-type, union-attr]
    ).all())
    collections = {item.id: item for item in db.exec(select(BadgeCollection).where(BadgeCollection.org_id == org_id)).all()}
    needle = query.strip().lower()
    items = []
    for badge in badges:
        if needle and needle not in f"{badge.name} {badge.description or ''}".lower():
            continue
        versions = _versions(db, badge)
        live = next((item for item in versions if item.id == badge.active_version_id), None)
        collection = collections.get(badge.collection_id)
        items.append({
            "badge_uuid": badge.badge_uuid, "name": badge.name, "description": badge.description or "",
            "status": _value(badge.status), "live_semantic_version": live.semantic_version if live else None,
            "has_unpublished_draft": any(item.state == LearningBadgeVersionState.DRAFT for item in versions),
            "route_count": route_counts.get(badge.id, 0),
            "collection": {"collection_uuid": collection.collection_uuid, "name": collection.name} if collection and collection.deleted_at is None else None,
        })
    return items


def get_badge_document(db: Session, current_user: PublicUser, org_id: int, badge_uuid: str) -> dict:
    require_org_admin(current_user.id, org_id, db)
    return envelope(db, _badge(db, org_id, badge_uuid))


def validate_badge_document(db: Session, current_user: PublicUser, org_id: int, raw) -> dict:
    require_org_admin(current_user.id, org_id, db)
    _, report, _ = _check(db, org_id, raw)
    return report


async def create_badge_from_document(db: Session, current_user: PublicUser, org_id: int, raw) -> dict:
    require_org_admin(current_user.id, org_id, db)
    document, report, prepared = _check(db, org_id, raw)
    if document is None or not report["valid"]:
        raise _reject(report)
    definition = apply_definition({}, document)
    collection = prepared["collection"]
    created = await badge_service.create_badge(
        None,  # type: ignore[arg-type]  # unused by create_badge
        LearningBadgeCreate(
            org_id=org_id, collection_id=collection.id if collection else None,
            name=definition["name"], description=definition["description"], about=definition["about"], criteria=definition["criteria"],
            thumbnail_image=definition["thumbnail_image"], direct_conferral_enabled=definition["direct_conferral_enabled"],
            public=document.listing.public, marketplace_listed=document.listing.marketplace_listed, badge_metadata=definition["badge_metadata"],
        ),
        current_user, db,
    )
    badge = _badge(db, org_id, created.badge_uuid)
    return {**envelope(db, badge), "changed": True, "warnings": report["warnings"]}


def save_badge_document(db: Session, current_user: PublicUser, org_id: int, badge_uuid: str, raw, base_etag: str) -> dict:
    require_org_admin(current_user.id, org_id, db)
    badge = _badge(db, org_id, badge_uuid)
    current = envelope(db, badge)
    if base_etag != current["etag"]:
        raise HTTPException(
            status_code=409,
            detail={"message": "The badge changed since it was read; merge your edit into `current` and save again", "current": current},
        )
    document, report, prepared = _check(db, org_id, raw)
    if document is None or not report["valid"]:
        raise _reject(report)
    version = working_version(db, badge)
    definition = apply_definition(version.definition or {}, document)
    exported = export_document(db, badge, definition)
    now = access_rules._now()
    started_draft = False
    if {key: exported[key] for key in ("badge", "marketing")} != {key: current["document"][key] for key in ("badge", "marketing")}:
        if version.state != LearningBadgeVersionState.DRAFT:
            base = version if version.state == LearningBadgeVersionState.PUBLISHED else None
            version = LearningBadgeVersion(
                version_uuid=f"badge_version_{uuid4()}", badge_id=badge.id or 0, org_id=badge.org_id,
                state=LearningBadgeVersionState.DRAFT, title="Draft", based_on_version_id=base.id if base else None,
                created_by_user_id=current_user.id, creation_date=now, update_date=now,
            )
            started_draft = True
        version.definition = definition
        lookups._bump_version(version)
        db.add(version)
    collection = prepared["collection"]
    listing = document.listing
    badge.collection_id = collection.id if collection else None
    badge.public = listing.public
    badge.marketplace_listed = listing.marketplace_listed
    if not badge.active_version_id:
        # Never published: the badge row mirrors the draft so lists show the new name.
        for key in lookups.VERSIONED_BADGE_FIELDS:
            if key in definition:
                setattr(badge, key, deepcopy(definition[key]))
    db.add(badge)
    after = export_document(db, badge, version.definition or {})
    if after == current["document"]:
        db.rollback()
        return {**current, "changed": False, "started_draft": False, "warnings": report["warnings"]}
    badge.update_date = now
    db.commit()
    db.refresh(badge)
    return {**envelope(db, badge), "changed": True, "started_draft": started_draft, "warnings": report["warnings"]}


def _templates_on_older_major(db: Session, badge: LearningBadge, major: int) -> list[dict]:
    rows = db.exec(
        select(Program, ProgramObjective).join(ProgramObjective, ProgramObjective.program_id == Program.id)
        .join(Objective, Objective.id == ProgramObjective.objective_id)
        .where(Objective.badge_id == badge.id, ProgramObjective.badge_major_version.is_not(None), ProgramObjective.badge_major_version < major)  # type: ignore[union-attr, operator]
    ).all()
    seen: dict[str, dict] = {}
    for program, _ in rows:
        seen.setdefault(program.program_uuid, {"template_uuid": program.program_uuid, "name": program.name, "org_id": program.org_id})
    return list(seen.values())


async def publish_badge(db: Session, current_user: PublicUser, org_id: int, badge_uuid: str, semantic_version: str | None, release_title: str | None, release_notes: str | None) -> dict:
    require_org_admin(current_user.id, org_id, db)
    badge = _badge(db, org_id, badge_uuid)
    draft = _draft(db, badge)
    if draft is None:
        raise HTTPException(status_code=409, detail="Nothing to publish: the badge has no draft. Save changes with save_badge first.")
    suggestions = next_versions(db, badge)
    version = (semantic_version or "").strip() or suggestions.get("first") or suggestions["minor"]
    await version_drafts.publish_badge_version(
        None,  # type: ignore[arg-type]  # unused by publish_badge_version
        badge.badge_uuid, draft.version_uuid,
        LearningBadgeVersionPublish(semantic_version=version, title=(release_title or "").strip() or f"Version {version}", description=release_notes or "", set_active=True),
        current_user, db,
    )
    db.refresh(badge)
    warnings = []
    if not badge_routes._routes(db, badge):
        warnings.append({"path": "routes", "message": "No plan template earns this badge yet, so learners cannot start it. Link one with set_badge_routes."})
    major = (_semver(version) or (1, 0, 0))[0]
    outdated = _templates_on_older_major(db, badge, major)
    if outdated:
        names = ", ".join(item["name"] for item in outdated)
        warnings.append({"path": "templates", "message": f"Templates still require an earlier major version: {names}. Move them with update_template_badge_versions if they should require this one."})
    return {**envelope(db, badge), "published_semantic_version": version, "warnings": warnings}


def set_badge_routes(db: Session, current_user: PublicUser, org_id: int, badge_uuid: str, routes: list[dict]) -> dict:
    require_org_admin(current_user.id, org_id, db)
    badge = _badge(db, org_id, badge_uuid)
    requested = {str(item.get("template_uuid") or "") for item in routes}
    dropped = [program.name for _, program in badge_routes._routes(db, badge) if program.program_uuid not in requested]
    if dropped:
        # Removing a route deletes the issuers' offers of it; the connector never deletes.
        raise HTTPException(status_code=409, detail=(
            f"This would stop {', '.join(dropped)} from earning the badge. The connector only adds routes and changes which one is recommended; "
            "remove a way to earn in the badge's Ways to earn tab in Launch LMS."
        ))
    payload = BadgeRoutesUpdate(routes=[
        BadgeRouteInput(program_uuid=str(item.get("template_uuid") or ""), recommended=bool(item.get("recommended")))
        for item in routes
    ])
    badge_routes.set_routes(db, current_user, badge.badge_uuid, payload)
    return envelope(db, badge)


def badge_routes_for_template(db: Session, program: Program) -> list[dict]:
    rows = db.exec(select(BadgeRoute, LearningBadge).join(LearningBadge, LearningBadge.id == BadgeRoute.badge_id).where(BadgeRoute.program_id == program.id, LearningBadge.deleted_at.is_(None))).all()  # type: ignore[union-attr]
    return [{"badge_uuid": badge.badge_uuid, "name": badge.name, "recommended": route.recommended} for route, badge in rows]


# Collections ------------------------------------------------------------------


def _collection_entry(db: Session, collection: BadgeCollection) -> dict:
    metadata = collection.collection_metadata or {}
    badges = db.exec(select(LearningBadge).where(LearningBadge.collection_id == collection.id, LearningBadge.deleted_at.is_(None))).all()  # type: ignore[union-attr]
    return {
        "collection_uuid": collection.collection_uuid, "name": collection.name, "description": collection.description or "",
        "thumbnail_image": collection.thumbnail_image or "", "public": collection.public, "hidden": collection.hidden,
        "credibility": metadata.get("credibility") or "", "endorsers": metadata.get("endorsers") or [],
        "badges": [{"badge_uuid": badge.badge_uuid, "name": badge.name} for badge in badges],
    }


def list_collections(db: Session, current_user: PublicUser, org_id: int) -> list[dict]:
    require_org_admin(current_user.id, org_id, db)
    collections = db.exec(select(BadgeCollection).where(BadgeCollection.org_id == org_id, BadgeCollection.deleted_at.is_(None)).order_by(BadgeCollection.name.asc())).all()  # type: ignore[union-attr]
    return [_collection_entry(db, item) for item in collections]


def save_collection(db: Session, current_user: PublicUser, org_id: int, args: dict) -> dict:
    require_org_admin(current_user.id, org_id, db)
    now = access_rules._now()
    if args.get("collection_uuid"):
        collection = _collection(db, org_id, str(args["collection_uuid"]))
        if collection is None:
            raise HTTPException(status_code=404, detail="Badge collection not found in the connected organization")
    else:
        name = str(args.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="A new collection needs a name")
        collection = BadgeCollection(org_id=org_id, name=name, collection_uuid=f"badge_collection_{uuid4()}", creation_date=now)
    for key in ("name", "description", "thumbnail_image"):
        if key in args and args[key] is not None:
            value = str(args[key]).strip()
            if key == "name" and not value:
                raise HTTPException(status_code=422, detail="Collection name cannot be empty")
            if key == "thumbnail_image" and value and not _URL.match(value):
                raise HTTPException(status_code=422, detail="thumbnail_image must be an https:// URL or a /content/... path")
            setattr(collection, key, value)
    for key in ("public", "hidden"):
        if key in args and args[key] is not None:
            setattr(collection, key, bool(args[key]))
    metadata = dict(collection.collection_metadata or {})
    if args.get("credibility") is not None:
        metadata["credibility"] = str(args["credibility"]).strip()
    if args.get("endorsers") is not None:
        endorsers = []
        for item in args["endorsers"]:
            if not isinstance(item, dict) or not str(item.get("name") or "").strip():
                raise HTTPException(status_code=422, detail="Each endorser needs a name")
            entry = {"name": str(item["name"]).strip()}
            for key in ("logo_url", "url"):
                if str(item.get(key) or "").strip():
                    entry[key] = str(item[key]).strip()
            endorsers.append(entry)
        metadata["endorsers"] = endorsers
    collection.collection_metadata = metadata
    collection.update_date = now
    db.add(collection)
    db.commit()
    db.refresh(collection)
    return _collection_entry(db, collection)
