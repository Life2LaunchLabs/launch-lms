import pytest

from src.services.learning_flow import (
    FlowValidationError,
    append_page_to_flow,
    evaluate_condition,
    resolve_flow,
    validate_flow,
)


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


def test_typed_user_variables_support_choice_and_presence_rules():
    context = {
        "variables": {
            "user.details.variables.audience": ["student"],
            "user.email": "",
        }
    }
    assert evaluate_condition(
        {
            "op": "contains",
            "left": {
                "source": "variable",
                "key": "user.details.variables.audience",
            },
            "right": "student",
        },
        context,
    )
    email_exists = {
        "op": "exists",
        "left": {"source": "variable", "key": "user.email"},
    }
    assert evaluate_condition(email_exists, context) is False
    context["variables"]["user.email"] = "learner@example.com"
    assert evaluate_condition(email_exists, context) is True


def test_split_junction_nodes_route_without_adding_a_page():
    flow = _flow()
    flow["nodes"].append({"id": "split", "type": "split"})
    branches = [edge for edge in flow["edges"] if edge["from"] == "question"]
    flow["edges"] = [
        edge for edge in flow["edges"] if edge["from"] != "question"
    ] + [{"from": "question", "to": "split", "priority": 0}] + [
        {**edge, "from": "split"} for edge in branches
    ]

    validate_flow(
        flow,
        {"page_question", "page_made", "page_default"},
        {"page_question"},
    )
    resolved = resolve_flow(
        flow,
        {"answers": {"page_question": {"result": {"option_ids": ["made"]}}}},
    )

    assert resolved.page_uuids == ["page_question", "page_made"]
    assert "split" in resolved.node_ids


def test_join_nodes_preserve_the_distinct_stacks_on_both_sides():
    flow = {
        "version": 1,
        "entry": "split",
        "nodes": [
            {"id": "split", "type": "split"},
            {"id": "a", "type": "page", "page_uuid": "page_a"},
            {"id": "b", "type": "page", "page_uuid": "page_b"},
            {"id": "join", "type": "join"},
            {"id": "c", "type": "page", "page_uuid": "page_c"},
            {"id": "complete", "type": "complete"},
        ],
        "edges": [
            {"from": "split", "to": "a", "priority": 0},
            {
                "from": "split",
                "to": "b",
                "priority": 1,
                "condition": {
                    "op": "eq",
                    "left": {"source": "variable", "key": "take_b"},
                    "right": True,
                },
            },
            {"from": "a", "to": "join", "priority": 0},
            {"from": "b", "to": "join", "priority": 0},
            {"from": "join", "to": "c", "priority": 0},
            {"from": "c", "to": "complete", "priority": 0},
        ],
    }
    validate_flow(flow, {"page_a", "page_b", "page_c"}, set())
    resolved = resolve_flow(flow, {"variables": {"take_b": True}})
    assert resolved.page_uuids == ["page_b", "page_c"]
    assert resolved.node_ids == ["split", "b", "join", "c", "complete"]


def test_rejects_cycles_and_ambiguous_priorities():
    flow = _flow()
    flow["edges"].append({"from": "made", "to": "question", "priority": 1})
    with pytest.raises(FlowValidationError, match="acyclic"):
        validate_flow(flow, {"page_question", "page_made", "page_default"}, {"page_question"})

    flow = _flow()
    flow["edges"][1]["priority"] = 10
    with pytest.raises(FlowValidationError, match="ambiguous"):
        validate_flow(flow, {"page_question", "page_made", "page_default"}, {"page_question"})


def test_rejects_duplicate_rules_and_questions_after_split():
    flow = _flow()
    flow["edges"].insert(
        1,
        {
            "from": "question",
            "to": "default",
            "priority": 9,
            "condition": flow["edges"][0]["condition"].copy(),
        },
    )
    with pytest.raises(FlowValidationError, match="duplicate rules"):
        validate_flow(
            flow,
            {"page_question", "page_made", "page_default"},
            {"page_question"},
        )

    flow = _flow()
    flow["edges"][0]["condition"]["left"]["key"] = (
        "page_made.result.questions.age.inputs.response.value"
    )
    with pytest.raises(FlowValidationError, match="answered after"):
        validate_flow(
            flow,
            {"page_question", "page_made", "page_default"},
            {"page_question"},
        )


def test_rejects_unsafe_fact_paths():
    flow = _flow()
    flow["edges"][0]["condition"]["left"] = {"source": "fact", "key": "private_email"}
    with pytest.raises(FlowValidationError, match="unsupported portfolio fact"):
        validate_flow(flow, {"page_question", "page_made", "page_default"}, {"page_question"})


def test_appends_new_page_after_every_branch_before_completion():
    flow = append_page_to_flow(_flow(), "page_new")

    validate_flow(
        flow,
        {"page_question", "page_made", "page_default", "page_new"},
        {"page_question", "page_new"},
    )
    made = resolve_flow(
        flow,
        {"answers": {"page_question": {"result": {"option_ids": ["made"]}}}},
    )
    default = resolve_flow(flow, {"answers": {}})
    assert made.page_uuids == ["page_question", "page_made", "page_new"]
    assert default.page_uuids == ["page_question", "page_default", "page_new"]
    assert made.terminal is default.terminal is True
