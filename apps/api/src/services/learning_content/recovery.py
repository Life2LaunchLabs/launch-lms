"""Graceful handling of stored content that predates the typed models.

Content saved before a model tightened can fail validation. Learners are
unaffected (the runtime does not validate), but admins must not be locked out
of their own pages, so:

- saves only reject issues the edit *introduces*; issues already present in
  the stored content are carried over and reported as warnings
  (``split_issues``);
- ``repair`` fixes what is safe to fix mechanically (keys the model does not
  know, invalid optional settings), verifying every change, and leaves the
  rest for the admin.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from pydantic import BaseModel, ValidationError

BLOCK_TYPES = {"text", "image", "button", "question", "portfolio_preview"}

# Error types a repair may resolve by deleting the offending key. Anything
# else (unknown block type, missing id, bad flow graph) needs a person.
REPAIRABLE = {"extra_forbidden", "literal_error", "enum", "string_type", "int_type", "int_parsing", "float_type", "float_parsing", "bool_type", "bool_parsing", "greater_than_equal", "less_than_equal"}


def _errors(model: type[BaseModel], value: Any) -> list[dict]:
    try:
        model.model_validate(value)
    except ValidationError as error:
        return error.errors()
    return []


def _where(loc: tuple) -> str:
    """``("blocks", 0, "text", "design", "align")`` -> ``Block 1 (text) › design.align``."""
    parts, words, index = list(loc), [], 0
    while index < len(parts):
        part = parts[index]
        if part == "blocks" and index + 1 < len(parts) and isinstance(parts[index + 1], int):
            label = f"Block {parts[index + 1] + 1}"
            tag = parts[index + 2] if index + 2 < len(parts) and isinstance(parts[index + 2], str) and parts[index + 2] in BLOCK_TYPES else None
            words.append(f"{label} ({tag})" if tag else label)
            index += 3 if tag else 2
        elif part == "overrides" and index + 1 < len(parts):
            words.append(f"Variant '{parts[index + 1]}'")
            index += 2
        else:
            field = str(part)
            if words and words[-1].startswith("."):
                words[-1] += f".{field}"
            elif field != "variants":
                words.append(f".{field}")
            index += 1
    return " › ".join(word.lstrip(".") for word in words)


def _message(error: dict) -> str:
    message = str(error.get("msg") or "Invalid content").removeprefix("Value error, ")
    if error.get("type") == "value_error":
        return message
    if error.get("type") == "union_tag_invalid":
        tag = (error.get("ctx") or {}).get("tag")
        message = f"unknown block type '{tag}'; remove it or replace it with a supported block"
    elif error.get("type") == "extra_forbidden":
        message = "not a supported setting"
    where = _where(tuple(error.get("loc") or ()))
    return f"{where}: {message}" if where else message


def content_issues(model: type[BaseModel], value: Any) -> list[str]:
    """Every validation problem, as stable human-readable messages."""
    return list(dict.fromkeys(_message(error) for error in _errors(model, value)))


def split_issues(model: type[BaseModel], value: Any, previous: Any = None) -> tuple[list[str], list[str]]:
    """``(introduced, carried)``: issues new in ``value`` vs. already in ``previous``."""
    issues = content_issues(model, value)
    if not issues or previous is None:
        return issues, []
    existing = set(content_issues(model, previous))
    return [issue for issue in issues if issue not in existing], [issue for issue in issues if issue in existing]


def _resolve(value: Any, loc: tuple) -> tuple[Any, Any] | None:
    """Find ``(container, key)`` for an error location. Pydantic inserts union
    tags (block types, model names) into locations; those are skipped."""
    current, parts = value, list(loc)
    for index, part in enumerate(parts):
        last = index == len(parts) - 1
        if isinstance(current, list) and isinstance(part, int) and part < len(current):
            if last:
                return current, part
            current = current[part]
        elif isinstance(current, dict) and part in current:
            if last:
                return current, part
            current = current[part]
        elif isinstance(current, dict) and not last:
            continue  # a union tag such as "question" or "Comparison"
        else:
            return None
    return None


def repair(model: type[BaseModel], value: Any) -> tuple[Any, list[str]]:
    """Delete unknown keys and invalid optional settings, one verified change at
    a time: a change is kept only if it lowers the error count without making
    anything required go missing. Returns the repaired value and what changed."""
    current, changes = deepcopy(value), []
    for _ in range(200):
        errors = _errors(model, current)
        progressed = False
        for error in errors:
            if error.get("type") not in REPAIRABLE:
                continue
            found = _resolve(current, tuple(error.get("loc") or ()))
            if not found or not isinstance(found[0], dict):
                continue
            container, key = found
            candidate = deepcopy(current)
            target = _resolve(candidate, tuple(error["loc"]))
            del target[0][target[1]]  # type: ignore[index]
            after = _errors(model, candidate)
            if len(after) < len(errors) and not any(item.get("type") == "missing" for item in after if item not in errors):
                changes.append(f"{_where(tuple(error['loc']))}: removed {container[key]!r} ({_message(error).split(': ', 1)[-1]})")
                current, progressed = candidate, True
                break
        if not progressed:
            break
    return current, changes
