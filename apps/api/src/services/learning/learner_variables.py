"""Learner variables: bindings, extraction and safe application to profiles."""

from copy import deepcopy
from datetime import datetime
from sqlmodel import Session, select
from src.db.learning import (
    LearningPage,
    LearningVariable,
)
from src.db.users import User
from src.services.learning_portfolio_actions import (
    _portfolio,
)
from src.services.learning import access_rules, constants, run_navigation


def _normalize_bindings(value) -> list[dict]:
    if not value:
        return []
    if isinstance(value, list):
        items = value
    else:
        items = [value]
    return [item for item in items if isinstance(item, dict) and item.get("target")]


def _extract_learning_variables(page: LearningPage, result: dict) -> list[dict]:
    variables: list[dict] = []
    questions = run_navigation._question_blocks(page)
    question_results = (
        result.get("questions") if isinstance(result.get("questions"), dict) else {}
    )

    for question in questions:
        block_id = str(question.get("id") or "")
        bindings = _question_variable_bindings(page, question)
        sub_result = question_results.get(block_id) or (
            result if len(questions) == 1 else {}
        )
        kind = question.get("kind")

        if kind == "text_input":
            input_bindings = bindings.get("inputs") or {}
            if not isinstance(input_bindings, dict):
                continue
            inputs = sub_result.get("inputs") or {}
            for input_id, answer in inputs.items():
                value_type = str((answer or {}).get("value_type") or "text")
                value = (
                    (answer or {}).get("value")
                    if value_type == "number"
                    else str((answer or {}).get("text") or "").strip()
                )
                for binding in _normalize_bindings(input_bindings.get(input_id)):
                    variables.append(
                        {
                            "target": str(binding.get("target") or ""),
                            "value": value,
                            **(
                                {"value_type": value_type}
                                if value_type != "text"
                                else {}
                            ),
                            "source": {
                                "page_uuid": page.page_uuid,
                                "block_id": block_id,
                                "input_id": input_id,
                            },
                        }
                    )

        if kind == "image_upload":
            image_url = str(sub_result.get("url") or "").strip()
            for binding in _normalize_bindings(bindings.get("image")):
                variables.append(
                    {
                        "target": str(binding.get("target") or ""),
                        "value": image_url,
                        "value_type": "image",
                        "source": {"page_uuid": page.page_uuid, "block_id": block_id},
                    }
                )

        if kind in {"multiple_choice", "categorized_multi_select"}:
            option_bindings = bindings.get("options") or {}
            if not isinstance(option_bindings, dict):
                continue
            selected_options = [
                str(option_id)
                for option_id in sub_result.get("option_ids")
                or sub_result.get("selected")
                or []
            ]
            if bindings.get("options_value_mode") == "selected_text_list":
                options = (question.get("content") or {}).get("options") or []
                option_labels = {
                    str(option.get("id")): str(
                        option.get("text") or option.get("id") or ""
                    )
                    for option in options
                    if isinstance(option, dict) and option.get("id") is not None
                }
                values_by_target: dict[str, list] = {}
                for option_id in selected_options:
                    for binding in _normalize_bindings(option_bindings.get(option_id)):
                        target = str(binding.get("target") or "")
                        values_by_target.setdefault(target, []).append(
                            option_labels.get(option_id, option_id)
                        )
                for target, values in values_by_target.items():
                    variables.append(
                        {
                            "target": target,
                            "value": values,
                            "source": {
                                "page_uuid": page.page_uuid,
                                "block_id": block_id,
                                "option_ids": selected_options,
                            },
                        }
                    )
                continue

            for option_id in selected_options:
                for binding in _normalize_bindings(option_bindings.get(option_id)):
                    variables.append(
                        {
                            "target": str(binding.get("target") or ""),
                            "value": binding.get("value", option_id),
                            "source": {
                                "page_uuid": page.page_uuid,
                                "block_id": block_id,
                                "option_id": option_id,
                            },
                        }
                    )

    return variables


def _question_variable_bindings(page: LearningPage, question: dict) -> dict:
    completion = question.get("completion")
    bindings = completion.get("variable_bindings") if isinstance(completion, dict) else None
    return bindings if isinstance(bindings, dict) else {}


def _target_value_type(db_session: Session, org_id: int | None, target: str) -> str:
    if target in constants._SAFE_IMAGE_VARIABLE_TARGETS:
        return "image"
    if (
        target in constants._SAFE_CORE_VARIABLE_TARGETS
        or target in constants._SAFE_PORTFOLIO_VARIABLE_TARGETS
        or target == "user.email"
    ):
        return "text"
    if target.startswith("user.details.variables.") and org_id is not None:
        variable_key = target[len("user.details.variables.") :]
        variable = db_session.exec(
            select(LearningVariable).where(
                LearningVariable.org_id == org_id, LearningVariable.key == variable_key
            )
        ).first()
        if variable:
            return str(variable.value_type or "text")
    return "text"


def _is_variable_value_type_compatible(expected: str, actual: str, value) -> bool:
    if expected == "image":
        return actual == "image" and bool(str(value or "").strip())
    if actual == "image":
        return False
    if expected == "multiple_choice":
        return actual in ("option", "multiple_choice")
    return expected in ("text", "number", "boolean", "option")


def _is_safe_variable_target(
    target: str,
    value,
    user: User,
    db_session: Session,
    org_id: int | None = None,
    value_type: str = "text",
    allow_email_write: bool = False,
) -> tuple[bool, str | None]:
    expected_type = _target_value_type(db_session, org_id, target)
    if not _is_variable_value_type_compatible(expected_type, value_type, value):
        return (
            False,
            f"{expected_type.title()} variables cannot store {value_type} responses",
        )
    if target in constants._SAFE_IMAGE_VARIABLE_TARGETS:
        return True, None
    if target in constants._SAFE_CORE_VARIABLE_TARGETS:
        return True, None
    if target in constants._SAFE_PORTFOLIO_VARIABLE_TARGETS:
        return True, None
    if target == "user.email":
        current_email = (user.email or "").strip().lower()
        next_email = str(value or "").strip().lower()
        if allow_email_write or (next_email and next_email == current_email):
            return True, None
        return False, "Email can only be confirmed, not overwritten here"
    for prefix in constants._SAFE_VARIABLE_PREFIXES:
        if target.startswith(prefix):
            tail = target[len(prefix) :]
            segments = tail.split(".")
            if any(
                segment in constants._BLOCKED_VARIABLE_SEGMENTS or segment.startswith("_")
                for segment in segments
            ):
                return False, "Variable target is not writable"
            return True, None
    return False, "Variable target is not writable"


def _set_nested_value(root: dict, segments: list[str], value) -> dict:
    next_root = deepcopy(root) if isinstance(root, dict) else {}
    cursor = next_root
    for segment in segments[:-1]:
        existing = cursor.get(segment)
        if not isinstance(existing, dict):
            existing = {}
            cursor[segment] = existing
        cursor = existing
    cursor[segments[-1]] = value
    return next_root


def _apply_learning_variables_to_user(
    db_session: Session,
    user: User,
    variables: list[dict],
    org_id: int | None = None,
    allow_email_write: bool = False,
) -> tuple[list[dict], list[dict]]:
    applied: list[dict] = []
    skipped: list[dict] = []

    for variable in variables:
        target = str(variable.get("target") or "")
        value = variable.get("value")
        value_type = str(variable.get("value_type") or "text")
        safe, reason = _is_safe_variable_target(
            target,
            value,
            user,
            db_session,
            org_id=org_id,
            value_type=value_type,
            allow_email_write=allow_email_write,
        )
        if not safe:
            skipped.append({**variable, "reason": reason or "Target is not writable"})
            continue

        if target == "user.first_name":
            user.first_name = str(value or "").strip()
        elif target == "user.last_name":
            user.last_name = str(value or "").strip()
        elif target == "user.bio":
            user.bio = str(value or "").strip()
        elif target == "user.avatar_image":
            user.avatar_image = str(value or "").strip()
        elif target in constants._SAFE_PORTFOLIO_VARIABLE_TARGETS:
            portfolio = _portfolio(db_session, user, str(datetime.now()))
            setattr(
                portfolio,
                constants._SAFE_PORTFOLIO_VARIABLE_TARGETS[target],
                str(value or "").strip(),
            )
            portfolio.update_date = str(datetime.now())
            db_session.add(portfolio)
        elif target == "user.email":
            user.email = str(value or "").strip()
        elif target.startswith("user.profile."):
            segments = target[len("user.profile.") :].split(".")
            user.profile = _set_nested_value(user.profile or {}, segments, value)
        elif target.startswith("user.details."):
            segments = target[len("user.details.") :].split(".")
            user.details = _set_nested_value(user.details or {}, segments, value)
        else:
            skipped.append({**variable, "reason": "Target is not writable"})
            continue

        applied.append(variable)

    if applied:
        user.update_date = access_rules._now()
        db_session.add(user)
    return applied, skipped
