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
from src.services.learning_content.models import Flow
from src.services.learning_content.recovery import content_issues
from src.services.learning_flow import (
    FlowValidationError,
    convert_button_destinations,
    node_reaches,
    page_node_id,
    validate_flow,
)
from src.services.learning_page_convert import iter_block_stacks, normalize_question_settings
from src.services.learning_portfolio_actions import PortfolioActionError, validate_outcomes

STORED_PAGE_PREFIX = "learning_page_"
_STORED_PAGE_REF = re.compile(r"(?<![^:])(learning_page_[0-9a-f-]{36})(?=$|\.)")


def _public(value: dict | None, hidden: frozenset[str]) -> dict:
    return {key: deepcopy(item) for key, item in (value or {}).items() if key not in hidden}


def export_document(activity: LearningActivity, pages: list[LearningPage]) -> dict:
    exported_pages = []
    for page in sorted(pages, key=lambda item: (item.order, item.id or 0)):
        exported_pages.append(
            {
                "page_uuid": page.page_uuid,
                "page_type": page.page_type.value if hasattr(page.page_type, "value") else str(page.page_type),
                "title": page.title,
                "required": bool(page.required),
                "content": _public(page.content, HIDDEN_CONTENT_KEYS),
                "design": deepcopy(page.design or {}),
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
    remap_stored_ids: bool = False,
    baseline: dict | None = None,
) -> PreparedDocument:
    """Validate ``raw`` and resolve new-page placeholders.

    ``baseline`` is the stored activity's own document: content issues it
    already has are reported as warnings instead of blocking the save, so a
    model change never locks admins (or Claude) out of older content.

    ``existing_page_uuids`` are the stored pages of the activity being saved
    (empty when creating). Stored uuids from any other activity are rejected,
    unless ``remap_stored_ids`` (creating a copy): then they get fresh uuids.
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
        if page_id.startswith(STORED_PAGE_PREFIX) and remap_stored_ids:
            result.new_page_ids[page_id] = f"{STORED_PAGE_PREFIX}{uuid4()}"
        elif page_id.startswith(STORED_PAGE_PREFIX):
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
    pages, converted_flow = convert_button_destinations(pages, activity["settings"].get("flow"))
    if converted_flow is not None:
        activity["settings"]["flow"] = converted_flow

    stored_content = {page["page_uuid"]: page.get("content") for page in (baseline or {}).get("pages") or []}
    stored_flow = (((baseline or {}).get("activity") or {}).get("settings") or {}).get("flow")
    carried_flow = content_issues(Flow, stored_flow) if stored_flow else []
    for index, page in enumerate(pages):
        content = page["content"] = normalize_question_settings(_public(page.get("content"), HIDDEN_CONTENT_KEYS))
        prefix = f"pages[{index}].content"
        page_type = LearningPageType(page["page_type"])
        if page_type == LearningPageType.STANDARD and not isinstance(content.get("blocks"), list):
            result.errors.append(DocumentIssue(path=f"{prefix}.blocks", message="Standard pages need a blocks array"))
            continue
        try:
            for issue in _validate_page_payload(page_type, content, stored_content.get(page["page_uuid"])):
                result.warnings.append(DocumentIssue(path=prefix, message=f"Existing issue (save allowed): {issue}"))
            _validate_page_button_destinations(content, page_ids)
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
        for block in (page["content"].get("blocks") or []) if isinstance(page["content"], dict) else []:
            if _scored_choice_without_answers(block):
                result.warnings.append(
                    DocumentIssue(
                        path=f"pages[{index}].content.blocks[{block.get('id')}]",
                        message="Scored choice question has no correct options, so learners cannot earn its points. Add correct_option_ids or make it a survey (scoring.mode 'off').",
                    )
                )
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
            carried=carried_flow,
        )
        current_flow = activity["settings"].get("flow")
        for issue in content_issues(Flow, current_flow) if current_flow else []:
            result.warnings.append(DocumentIssue(path="activity.settings.flow", message=f"Existing issue (save allowed): {issue}"))
    except FlowValidationError as exc:
        result.errors.append(DocumentIssue(path="activity.settings.flow", message=str(exc)))
    result.errors.extend(_button_route_issues(activity["settings"].get("flow"), pages))
    try:
        validate_outcomes(activity["settings"].get("outcomes"), allow_system_blocks)
    except PortfolioActionError as exc:
        result.errors.append(DocumentIssue(path="activity.settings.outcomes", message=str(exc)))

    result.activity, result.pages = activity, pages
    return result


def _button_route_issues(flow: dict | None, pages: list[dict]) -> list[DocumentIssue]:
    """Revisits must point back along the route; button edges must name real buttons."""
    issues: list[DocumentIssue] = []
    order = {page["page_uuid"]: index for index, page in enumerate(pages)}
    continue_buttons: dict[str, set[str]] = {}
    for index, page in enumerate(pages):
        for stack in iter_block_stacks(page["content"]):
            for block in stack:
                if not isinstance(block, dict) or block.get("type") != "button":
                    continue
                button = block.get("content") or {}
                if button.get("action") != "revisit":
                    continue_buttons.setdefault(page["page_uuid"], set()).add(str(block.get("id")))
                    continue
                target = str(button.get("revisit_page_uuid") or "")
                source_node, target_node = (page_node_id(flow, page["page_uuid"]), page_node_id(flow, target)) if flow else (None, None)
                earlier = node_reaches(flow, target_node, source_node) if source_node and target_node else order.get(target, len(pages)) < index
                if not earlier or target == page["page_uuid"]:
                    issues.append(DocumentIssue(path=f"pages[{index}].content.blocks[{block.get('id')}]", message="A revisit button must point to a page learners pass before this one"))
    for index, edge in enumerate((flow or {}).get("edges", [])):
        condition = edge.get("condition") or {}
        key = str((condition.get("left") or {}).get("key") or "")
        if key.endswith(".button") and condition.get("right") not in continue_buttons.get(key[: -len(".button")], set()):
            issues.append(DocumentIssue(path=f"activity.settings.flow.edges[{index}]", message=f"Routes on button {condition.get('right')!r}, which is not a continue button on that page"))
    return issues


def _scored_choice_without_answers(block) -> bool:
    if not isinstance(block, dict) or block.get("type") != "question":
        return False
    if block.get("kind") not in {"multiple_choice", "categorized_multi_select"}:
        return False
    scoring = block.get("scoring") or {}
    try:
        earns_points = float(scoring.get("points", 1) or 0) > 0
    except (TypeError, ValueError):
        earns_points = True
    return (
        scoring.get("mode") not in {"off", None}
        and earns_points
        and not scoring.get("correct_option_ids")
    )


def _strings(value):
    if isinstance(value, dict):
        for item in value.values():
            yield from _strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _strings(item)
    elif isinstance(value, str):
        yield value
