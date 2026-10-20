"""Requirement codes: the per-level numbering styles (A, 1, i, a, I) and their framework metadata."""

from __future__ import annotations

from fastapi import HTTPException


REQUIREMENT_CODE_STYLES = {
    "upper_alpha",
    "lower_alpha",
    "decimal",
    "upper_roman",
    "lower_roman",
}
DEFAULT_REQUIREMENT_CODE_STYLES = (
    "upper_alpha",
    "decimal",
    "lower_roman",
    "lower_alpha",
    "upper_roman",
)


def _default_code_style(depth: int) -> str:
    return DEFAULT_REQUIREMENT_CODE_STYLES[min(depth, len(DEFAULT_REQUIREMENT_CODE_STYLES) - 1)]


def _normalize_source_metadata(source_metadata: dict | None, *, validate: bool = False) -> dict:
    normalized = dict(source_metadata or {})
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
