"""Requirement codes and structure: how each group numbers its children, when a group counts as met, and the framework's fields.

There are no levels. The framework says how its top-level categories are numbered (`numbering` in source_metadata),
and every node with children says how they are numbered (`numbering` in its metadata) and when the node is met
(`rule`: all of its children, or any N of them). Fields are defined once for the framework. Frameworks saved before
this kept one code style per depth in `requirement_levels`; `upgrade_levels` turns that into the shape above.
"""

from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException


REQUIREMENT_CODE_STYLES = {
    "upper_alpha",
    "lower_alpha",
    "decimal",
    "upper_roman",
    "lower_roman",
}
# custom: each child keeps the code written for it; none: children have no code
NUMBERING_STYLES = REQUIREMENT_CODE_STYLES | {"custom", "none"}
DEFAULT_NUMBERING = "custom"
FIELD_TYPES = {"text", "number", "link", "date", "boolean"}
FIELD_APPLIES = {"all", "groups", "requirements"}
STRUCTURE_KEYS = ("numbering", "rule")
DEFAULT_REQUIREMENT_CODE_STYLES = (
    "upper_alpha",
    "decimal",
    "lower_roman",
    "lower_alpha",
    "upper_roman",
)


def _default_code_style(depth: int) -> str:
    return DEFAULT_REQUIREMENT_CODE_STYLES[min(depth, len(DEFAULT_REQUIREMENT_CODE_STYLES) - 1)]


def _fail(validate: bool, message: str) -> None:
    if validate:
        raise HTTPException(status_code=422, detail=message)


def _normalize_fields(raw_fields, validate: bool) -> list[dict]:
    if not isinstance(raw_fields, list):
        _fail(validate and raw_fields is not None, "Fields must be a list")
        return []
    fields = []
    for raw in raw_fields:
        if not isinstance(raw, dict) or not str(raw.get("name") or "").strip():
            _fail(validate, "Every field needs a name")
            continue
        kind = raw.get("type") or "text"
        if kind not in FIELD_TYPES:
            _fail(validate, f"Unsupported field type: {kind}")
            kind = "text"
        applies = raw.get("applies") or "all"
        if applies not in FIELD_APPLIES:
            _fail(validate, f"Unsupported field target: {applies}")
            applies = "all"
        fields.append({**raw, "field_uuid": raw.get("field_uuid") or f"metadata_field_{uuid4()}", "name": str(raw["name"]).strip(),
                       "type": kind, "applies": applies, "required": bool(raw.get("required"))})
    return fields


def _normalize_source_metadata(source_metadata: dict | None, *, validate: bool = False) -> dict:
    normalized = dict(source_metadata or {})
    numbering = normalized.get("numbering") or DEFAULT_NUMBERING
    if numbering not in NUMBERING_STYLES:
        _fail(validate, f"Unsupported numbering: {numbering}")
        numbering = DEFAULT_NUMBERING
    normalized["numbering"] = numbering
    normalized["fields"] = _normalize_fields(normalized.get("fields"), validate)
    raw_levels = normalized.get("requirement_levels")
    if not isinstance(raw_levels, list):
        if validate and raw_levels is not None:
            raise HTTPException(status_code=422, detail="Requirement levels must be a list")
        return normalized
    levels = []
    for depth, raw_level in enumerate(raw_levels):
        if not isinstance(raw_level, dict):
            if validate:
                raise HTTPException(status_code=422, detail="Every requirement level must be an object")
            continue
        level = dict(raw_level)
        code_style = level.get("code_style") or _default_code_style(depth)
        if code_style not in REQUIREMENT_CODE_STYLES:
            if validate:
                raise HTTPException(status_code=422, detail=f"Unsupported requirement code style: {code_style}")
            code_style = _default_code_style(depth)
        level["code_style"] = code_style
        levels.append(level)
    normalized["requirement_levels"] = levels
    return normalized


def _alpha_code(number: int) -> str:
    result = ""
    while number > 0:
        number, remainder = divmod(number - 1, 26)
        result = chr(65 + remainder) + result
    return result


def _roman_code(number: int) -> str:
    numerals = (
        (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
        (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
        (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
    )
    result = ""
    for value, numeral in numerals:
        while number >= value:
            result += numeral
            number -= value
    return result


def _code_segment(number: int, style: str) -> str:
    if style == "decimal":
        return str(number)
    if style == "upper_alpha":
        return _alpha_code(number)
    if style == "lower_alpha":
        return _alpha_code(number).lower()
    if style == "upper_roman":
        return _roman_code(number)
    if style == "lower_roman":
        return _roman_code(number).lower()
    raise HTTPException(status_code=422, detail=f"Unsupported requirement code style: {style}")


def node_numbering(metadata: dict | None) -> str:
    numbering = (metadata or {}).get("numbering") or DEFAULT_NUMBERING
    return numbering if numbering in NUMBERING_STYLES else DEFAULT_NUMBERING


def node_rule(metadata: dict | None) -> dict:
    rule = (metadata or {}).get("rule") or {}
    if rule.get("kind") == "any" and isinstance(rule.get("count"), int):
        return {"kind": "any", "count": rule["count"]}
    return {"kind": "all"}


def node_fields(metadata: dict | None) -> dict:
    """A node's field values: its metadata without the structure keys."""
    return {key: value for key, value in (metadata or {}).items() if key not in STRUCTURE_KEYS}


def upgrade_levels(source_metadata: dict | None, nodes: list[dict]) -> tuple[dict, list[dict]]:
    """Turn the old per-depth `requirement_levels` into each parent's numbering and the framework's fields.

    `nodes` are dicts with node_uuid, parent_node_uuid and metadata. Returns copies; anything without levels comes back as is.
    """
    meta = dict(source_metadata or {})
    levels = meta.pop("requirement_levels", None)
    if not isinstance(levels, list) or not levels:
        return meta, nodes
    styles = [(level.get("code_style") if isinstance(level, dict) else None) or _default_code_style(depth) for depth, level in enumerate(levels)]
    by_uuid = {node["node_uuid"]: node for node in nodes}

    def depth(node: dict) -> int:
        level, parent, seen = 0, node.get("parent_node_uuid"), set()
        while parent and parent in by_uuid and parent not in seen:
            seen.add(parent)
            level, parent = level + 1, by_uuid[parent].get("parent_node_uuid")
        return level

    meta["numbering"] = styles[0]
    upgraded = []
    for node in nodes:
        metadata = dict(node.get("metadata") or {})
        below = depth(node) + 1
        if below < len(styles):
            metadata["numbering"] = styles[below]
        upgraded.append({**node, "metadata": metadata})
    fields = list(meta.get("fields") or [])
    deepest = len(levels) - 1
    for depth_index, level in enumerate(levels):
        for field in (level.get("metadata_fields") or []) if isinstance(level, dict) else []:
            if not isinstance(field, dict) or any(item.get("field_uuid") == field.get("field_uuid") for item in fields):
                continue
            # a level's field was only asked of nodes at that depth; only the deepest level maps cleanly onto requirements
            last = depth_index == deepest and len(levels) > 1
            fields.append({**field, "applies": "requirements" if last else "all", "required": bool(field.get("required")) and last})
    meta["fields"] = fields
    return meta, upgraded
