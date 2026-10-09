"""Export, fingerprint and validate Activity Documents.

Validation never stops at the first problem: it reports every issue with a
JSON path so an author (human or Claude) can fix them all in one pass.
"""

from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from dataclasses import dataclass, field
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError

from src.db.learning import LearningActivity, LearningPage, LearningPageType
from src.services.learning import _validate_page_button_destinations, _validate_page_payload
from src.services.learning_documents.models import (
    DOCUMENT_FORMAT,
    DOCUMENT_FORMAT_VERSION,
    HIDDEN_CONTENT_KEYS,
    HIDDEN_SETTINGS_KEYS,
    NEW_PAGE_ID_PATTERN,
    ActivityDocument,
    DocumentIssue,
)
from src.services.learning_documents.references import rewrite_page_references
from src.services.learning_flow import FlowValidationError, validate_flow
from src.services.learning_page_convert import convert_legacy_page, iter_block_stacks
from src.services.learning_portfolio_actions import PortfolioActionError, validate_outcomes

STORED_PAGE_PREFIX = "learning_page_"
_STORED_PAGE_REF = re.compile(r"(?<![^:])(learning_page_[0-9a-f-]{36})(?=$|\.)")


def _public(value: dict | None, hidden: frozenset[str]) -> dict:
    return {key: deepcopy(item) for key, item in (value or {}).items() if key not in hidden}


def _page_type(page: LearningPage) -> tuple[str, dict]:
    page_type = page.page_type.value if hasattr(page.page_type, "value") else str(page.page_type)
    content = _public(page.content, HIDDEN_CONTENT_KEYS)
    if page_type in {LearningPageType.STANDARD.value, LearningPageType.VIDEO.value}:
        return page_type, content
    # Legacy page types are upgraded on export so documents only ever carry
    # the two current types; saving the document completes the migration.
    return convert_legacy_page(page_type, content)


def export_document(activity: LearningActivity, pages: list[LearningPage]) -> dict:
    exported_pages = []
    for page in sorted(pages, key=lambda item: (item.order, item.id or 0)):
        page_type, content = _page_type(page)
        exported_pages.append(
            {
                "page_uuid": page.page_uuid,
                "page_type": page_type,
                "title": page.title,
                "required": bool(page.required),
                "content": content,
                "design": deepcopy(page.design or {}),
                "scoring": deepcopy(page.scoring or {}),
                "completion": deepcopy(page.completion or {}),
            }
        )
    return {
        "format": DOCUMENT_FORMAT,
        "format_version": DOCUMENT_FORMAT_VERSION,
        "activity": {
            "activity_uuid": activity.activity_uuid,
            "title": activity.title,
            "description": activity.description or "",
            "icon": activity.icon,
            "thumbnail_image": activity.thumbnail_image or "",
            "required": bool(activity.required),
            "settings": _public(activity.settings, HIDDEN_SETTINGS_KEYS),
        },
        "pages": exported_pages,
    }


def document_etag(document: dict) -> str:
    canonical = json.dumps(document, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


@dataclass
class PreparedDocument:
    """A validated document with placeholders resolved to stored page uuids."""

    activity: dict = field(default_factory=dict)
    pages: list[dict] = field(default_factory=list)
    new_page_ids: dict[str, str] = field(default_factory=dict)
    errors: list[DocumentIssue] = field(default_factory=list)
    warnings: list[DocumentIssue] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def _loc(parts) -> str:
    path = ""
    for part in parts:
        path += f"[{part}]" if isinstance(part, int) else (f".{part}" if path else str(part))
    return path or "document"


def _detail(exc: HTTPException) -> str:
    detail = exc.detail
    if isinstance(detail, dict):
        return str(detail.get("message") or detail.get("detail") or detail)
    return str(detail)


def prepare_document(
    raw: dict,
    *,
    existing_page_uuids: set[str],
    allow_system_blocks: bool,
) -> PreparedDocument:
    """Validate ``raw`` and resolve new-page placeholders.

    ``existing_page_uuids`` are the stored pages of the activity being saved
    (empty when creating). Stored uuids from any other activity are rejected.
    """
    result = PreparedDocument()
    try:
        document = ActivityDocument.model_validate(raw)
    except ValidationError as exc:
        result.errors = [
            DocumentIssue(path=_loc(error["loc"]), message=error["msg"]) for error in exc.errors()
        ]
        return result

    data = document.model_dump()
    seen: set[str] = set()
    for index, page in enumerate(data["pages"]):
        page_id = page["page_uuid"]
        path = f"pages[{index}].page_uuid"
        if page_id in seen:
            result.errors.append(DocumentIssue(path=path, message=f"Duplicate page id {page_id!r}"))
            continue
        seen.add(page_id)
        if page_id in existing_page_uuids:
            continue
        if page_id.startswith(STORED_PAGE_PREFIX):
            result.errors.append(
                DocumentIssue(
                    path=path,
                    message="This page uuid is not part of this activity. Use a short placeholder id for new pages.",
                )
            )
        elif not re.fullmatch(NEW_PAGE_ID_PATTERN, page_id):
            result.errors.append(
                DocumentIssue(path=path, message="New page ids may only use letters, digits, '_' and '-' (max 64).")
            )
        else:
            result.new_page_ids[page_id] = f"{STORED_PAGE_PREFIX}{uuid4()}"
    if result.errors:
        return result

    settings = data["activity"].get("settings") or {}
    for key in sorted(HIDDEN_SETTINGS_KEYS & set(settings)):
        result.warnings.append(
            DocumentIssue(path=f"activity.settings.{key}", message="Platform-managed setting ignored")
        )
        settings.pop(key)
    activity = rewrite_page_references(data["activity"], result.new_page_ids)
    pages = rewrite_page_references(data["pages"], result.new_page_ids)
    page_ids = {page["page_uuid"] for page in pages}

    for index, page in enumerate(pages):
        content = page["content"] = _public(page.get("content"), HIDDEN_CONTENT_KEYS)
        prefix = f"pages[{index}].content"
        page_type = LearningPageType(page["page_type"])
        if page_type == LearningPageType.STANDARD and not isinstance(content.get("blocks"), list):
            result.errors.append(DocumentIssue(path=f"{prefix}.blocks", message="Standard pages need a blocks array"))
            continue
        for check in (
            lambda: _validate_page_payload(page_type, content),
            lambda: _validate_page_button_destinations(content, page_ids),
        ):
            try:
                check()
            except HTTPException as exc:
                result.errors.append(DocumentIssue(path=prefix, message=_detail(exc)))
        if not allow_system_blocks and any(
            isinstance(block, dict) and block.get("type") == "portfolio_preview"
            for stack in iter_block_stacks(content)
            for block in stack
        ):
            result.errors.append(
                DocumentIssue(path=prefix, message="Portfolio preview blocks are limited to trusted system activities")
            )

    for index, page in enumerate(pages):
        dangling = {
            match.group(1)
            for text in _strings(page)
            for match in _STORED_PAGE_REF.finditer(text)
        } - page_ids
        for page_uuid in sorted(dangling):
            result.warnings.append(
                DocumentIssue(path=f"pages[{index}]", message=f"References {page_uuid}, which is not in this activity")
            )

    try:
        validate_flow(
            deepcopy(activity["settings"].get("flow")),
            page_ids,
            {page["page_uuid"] for page in pages if page["required"]},
        )
    except FlowValidationError as exc:
        result.errors.append(DocumentIssue(path="activity.settings.flow", message=str(exc)))
    try:
        validate_outcomes(activity["settings"].get("outcomes"), allow_system_blocks)
    except PortfolioActionError as exc:
        result.errors.append(DocumentIssue(path="activity.settings.outcomes", message=str(exc)))

    result.activity, result.pages = activity, pages
    return result


def _strings(value):
    if isinstance(value, dict):
        for item in value.values():
            yield from _strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _strings(item)
    elif isinstance(value, str):
        yield value
