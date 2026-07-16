import pytest

from src.services.learning_flow import FlowValidationError, evaluate_condition, resolve_flow, validate_flow


def _flow():
    return {
        "version": 1,
        "entry": "question",
        "nodes": [
            {"id": "question", "type": "page", "page_uuid": "page_question"},
            {"id": "made", "type": "page", "page_uuid": "page_made"},
            {"id": "default", "type": "page", "page_uuid": "page_default"},
            {"id": "complete", "type": "complete"},
        ],
        "edges": [
            {"from": "question", "to": "made", "priority": 10, "condition": {"op": "contains", "left": {"source": "answer", "key": "page_question.result.option_ids"}, "right": "made"}},
            {"from": "question", "to": "default", "priority": 0},
            {"from": "made", "to": "complete", "priority": 0},
            {"from": "default", "to": "complete", "priority": 0},
        ],
    }


def test_validates_and_resolves_prioritized_branch_with_trace():
    flow = _flow()
    validate_flow(flow, {"page_question", "page_made", "page_default"}, {"page_question"})
    resolved = resolve_flow(flow, {"answers": {"page_question": {"result": {"option_ids": ["made"]}}}})
    assert resolved.page_uuids == ["page_question", "page_made"]
    assert resolved.terminal is True
    assert any(item["result"] for item in resolved.trace)


def test_default_branch_and_missing_values_are_safe():
    resolved = resolve_flow(_flow(), {"answers": {}})
    assert resolved.page_uuids == ["page_question", "page_default"]
    assert evaluate_condition({"op": "exists", "left": {"source": "variable", "key": "missing"}}, {}) is False


def test_rejects_cycles_and_ambiguous_priorities():
    flow = _flow()
    flow["edges"].append({"from": "made", "to": "question", "priority": 1})
    with pytest.raises(FlowValidationError, match="acyclic"):
        validate_flow(flow, {"page_question", "page_made", "page_default"}, {"page_question"})

    flow = _flow()
    flow["edges"][1]["priority"] = 10
    with pytest.raises(FlowValidationError, match="ambiguous"):
        validate_flow(flow, {"page_question", "page_made", "page_default"}, {"page_question"})


def test_rejects_unsafe_fact_paths():
    flow = _flow()
    flow["edges"][0]["condition"]["left"] = {"source": "fact", "key": "private_email"}
    with pytest.raises(FlowValidationError, match="unsupported portfolio fact"):
        validate_flow(flow, {"page_question", "page_made", "page_default"}, {"page_question"})
