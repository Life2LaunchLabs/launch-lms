"""Answer normalization and validation for question blocks."""

import re
from urllib.parse import urlparse
from fastapi import HTTPException


def _as_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _word_count(value: str) -> int:
    return len([word for word in str(value or "").strip().split() if word])


def _normalize_mcq_answer(answer: dict) -> list[str]:
    raw_options = answer.get("option_ids") or answer.get("optionIds")
    if raw_options is None:
        single = (
            answer.get("option_id") or answer.get("optionId") or answer.get("value")
        )
        raw_options = [single] if single else []
    if not isinstance(raw_options, list):
        raw_options = [raw_options]
    selected: list[str] = []
    for option_id in raw_options:
        if option_id is None:
            continue
        normalized = str(option_id)
        if normalized not in selected:
            selected.append(normalized)
    return selected


def _normalize_text_answer(question_content: dict, answer: dict) -> dict[str, dict]:
    raw_inputs = answer.get("inputs")
    if isinstance(raw_inputs, dict):
        return {
            str(input_id): value
            if isinstance(value, dict)
            else {"text": str(value or "")}
            for input_id, value in raw_inputs.items()
        }

    inputs = question_content.get("inputs") or []
    fallback_id = str(inputs[0].get("id") if inputs else "response")
    return {
        fallback_id: {
            "text": str(answer.get("text") or answer.get("value") or ""),
            **(
                {"rich_text": answer.get("rich_text")}
                if answer.get("rich_text") is not None
                else {}
            ),
        }
    }


def _validate_mcq_answer(
    question_content: dict,
    completion: dict,
    selected: list[str],
    answer: dict | None = None,
) -> None:
    options = question_content.get("options") or []
    option_ids = {
        str(option.get("id")) for option in options if option.get("id") is not None
    }
    completion = completion or {}
    min_selections = max(
        0,
        _as_int(completion.get("min_selections"), 1),
    )
    max_default = len(options) if options else max(1, len(selected))
    max_selections = max(
        1,
        _as_int(completion.get("max_selections"), max_default),
    )
    if len(selected) < min_selections:
        raise HTTPException(
            status_code=422, detail=f"Select at least {min_selections} option(s)"
        )
    if len(selected) > max_selections:
        raise HTTPException(
            status_code=422, detail=f"Select no more than {max_selections} option(s)"
        )
    custom_options = (answer or {}).get("custom_options") or []
    custom_ids: set[str] = set()
    for option in custom_options:
        if not isinstance(option, dict):
            raise HTTPException(status_code=422, detail="Custom option is invalid")
        option_id, text = (
            str(option.get("id") or "").strip(),
            str(option.get("text") or "").strip(),
        )
        if not text or len(text) > 80 or option_id != text:
            raise HTTPException(
                status_code=422,
                detail="Custom option must be between 1 and 80 characters",
            )
        custom_ids.add(option_id)
    if option_ids:
        invalid = [
            option_id
            for option_id in selected
            if option_id not in option_ids and option_id not in custom_ids
        ]
        if invalid:
            raise HTTPException(
                status_code=422, detail="Selected option is not available"
            )


def _validate_text_answer(
    question_content: dict, completion: dict, inputs: dict[str, dict]
) -> dict[str, dict]:
    configured_inputs = question_content.get("inputs") or [{"id": "response"}]
    completion_inputs = (completion or {}).get("inputs") or {}
    results: dict[str, dict] = {}

    for item in configured_inputs:
        input_id = str(item.get("id") or "response")
        input_type = str(item.get("input_type") or "text")
        rules = completion_inputs.get(input_id) or {}
        value = inputs.get(input_id) or {}
        text = str(value.get("text") or "").strip()
        words = _word_count(text)
        min_words = max(0, _as_int(rules.get("min_words"), 0))
        max_words = max(0, _as_int(rules.get("max_words"), 0))
        required = rules.get("required", min_words > 0)
        validation = str(rules.get("validation") or "none").lower()
        if validation == "none" and input_type in {"email", "url", "tel"}:
            validation = {"tel": "phone"}.get(input_type, input_type)

        if required and not text:
            raise HTTPException(
                status_code=422, detail="Required text response is missing"
            )
        if input_type == "number" and text:
            try:
                numeric_value = float(text)
                if numeric_value.is_integer():
                    numeric_value = int(numeric_value)
            except ValueError as exc:
                raise HTTPException(
                    status_code=422, detail="Enter a valid number"
                ) from exc
        else:
            numeric_value = None
        if text and validation == "name" and not re.fullmatch(
            r"[^\W\d_](?:[^\W\d_]|[' -])*", text, flags=re.UNICODE
        ):
            raise HTTPException(status_code=422, detail="Enter a valid name")
        if text and validation == "email" and not re.fullmatch(
            r"[^@\s]+@[^@\s]+\.[^@\s]+", text
        ):
            raise HTTPException(status_code=422, detail="Enter a valid email address")
        if text and validation == "phone":
            digits = re.sub(r"\D", "", text)
            if not re.fullmatch(r"[+()\d. -]+", text) or not 7 <= len(digits) <= 15:
                raise HTTPException(status_code=422, detail="Enter a valid phone number")
        if text and validation == "url":
            parsed_url = urlparse(text)
            if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
                raise HTTPException(status_code=422, detail="Enter a valid URL including http:// or https://")
        if input_type != "number" and text and words < min_words:
            raise HTTPException(
                status_code=422, detail=f"Response must be at least {min_words} word(s)"
            )
        if input_type != "number" and max_words and words > max_words:
            raise HTTPException(
                status_code=422,
                detail=f"Response must be no more than {max_words} word(s)",
            )

        results[input_id] = {
            "text": text,
            "word_count": words,
            "value_type": "number" if input_type == "number" else "text",
            **({"value": numeric_value} if input_type == "number" and text else {}),
            **(
                {"rich_text": value.get("rich_text")}
                if value.get("rich_text") is not None
                else {}
            ),
        }
    return results


def _validate_image_answer(completion: dict, answer: dict) -> dict:
    image_url = str(
        (answer or {}).get("url")
        or (answer or {}).get("image_url")
        or (answer or {}).get("imageUrl")
        or ""
    ).strip()
    required = (completion or {}).get("required", True)
    if required and not image_url:
        raise HTTPException(
            status_code=422, detail="Required image response is missing"
        )
    return {
        "url": image_url,
        "name": str(
            (answer or {}).get("name") or (answer or {}).get("filename") or ""
        ).strip(),
        "content_type": str(
            (answer or {}).get("content_type")
            or (answer or {}).get("contentType")
            or ""
        ).strip(),
        "size": _as_int((answer or {}).get("size"), 0),
        "value_type": "image",
    }
