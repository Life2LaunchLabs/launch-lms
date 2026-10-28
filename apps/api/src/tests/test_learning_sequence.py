"""Sequences: validation, routing, and converting older flow graphs without changing a route."""

import itertools

import pytest

from src.services.learning_flow import FlowValidationError, resolve_flow
from src.services.learning_sequence import (
    activity_sequence,
    append_page,
    linear_sequence,
    remove_page,
    resolve_sequence,
    sequence_changed_by,
    sequence_from_flow,
    sequence_page_uuids,
    validate_sequence,
)


def _picked(page: str, option: str) -> dict:
    return {"op": "contains", "left": {"source": "answer", "key": f"{page}.result.option_ids"}, "right": option}


def _pressed(page: str, button: str) -> dict:
    return {"op": "eq", "left": {"source": "answer", "key": f"{page}.button"}, "right": button}


def _flow(nodes: list[str], edges: list[tuple], entry: str | None = None) -> dict:
    """Page nodes are named after their page; ``end`` is the complete node.
    Edges are (from, to) or (from, to, rule) and earlier edges win."""
    built = []
    for index, edge in enumerate(edges):
        source, target = edge[0], edge[1]
        rule = edge[2] if len(edge) > 2 else None
        built.append({"from": source, "to": target, "priority": 100 - index, **({"condition": rule} if rule else {})})
    return {
        "version": 1,
        "entry": entry or nodes[0],
        "nodes": [{"id": "end", "type": "complete"} if node == "end" else {"id": node, "type": "split"} if node.startswith("split") else {"id": node, "type": "page", "page_uuid": node} for node in nodes],
        "edges": built,
    }


def _context(**answers) -> dict:
    """``p1="opt_a"`` picks an option on p1; ``p1_button="btn"`` presses a button on p1."""
    out: dict = {}
    for key, value in answers.items():
        if key.endswith("_button"):
            out.setdefault(key[: -len("_button")], {})["button"] = value
        else:
            out.setdefault(key, {}).setdefault("result", {})["option_ids"] = [value]
    return {"answers": out}


def _contexts(choices: dict[str, list[str | None]]):
    keys = list(choices)
    for values in itertools.product(*(choices[key] for key in keys)):
        yield _context(**{key: value for key, value in zip(keys, values) if value is not None})


def _same_routes(flow: dict, pages: list[str], choices: dict[str, list[str | None]]) -> dict:
    converted = sequence_from_flow(flow, pages)
    validate_sequence(converted.sequence, set(pages), set())
    for context in _contexts(choices):
        assert resolve_sequence(converted.sequence, context).page_uuids == resolve_flow(flow, context).page_uuids, context
    return converted.sequence


def _codes(converted) -> set[str]:
    return {flag["code"] for flag in converted.flags}


# --- Converting ---------------------------------------------------------------


def test_linear_flow_becomes_its_pages_in_order():
    flow = _flow(["p1", "p2", "p3", "end"], [("p1", "p2"), ("p2", "p3"), ("p3", "end")])
    converted = sequence_from_flow(flow, ["p1", "p2", "p3"])
    assert converted.sequence == linear_sequence(["p1", "p2", "p3"]) and converted.flags == []


def test_split_and_join_becomes_one_branch_with_a_default_last():
    flow = _flow(
        ["p1", "p2", "p3", "p4", "end"],
        [("p1", "p2", _picked("p1", "opt_make")), ("p1", "p3"), ("p2", "p4"), ("p3", "p4"), ("p4", "end")],
    )
    sequence = _same_routes(flow, ["p1", "p2", "p3", "p4"], {"p1": ["opt_make", "opt_help", None]})
    page, branch, after = sequence["items"]
    assert page == {"type": "page", "page_uuid": "p1"} and after == {"type": "page", "page_uuid": "p4"}
    assert [(path["rule"], path["pages"]) for path in branch["paths"]] == [(_picked("p1", "opt_make"), ["p2"]), (None, ["p3"])]


def test_split_nodes_and_a_default_listed_first_are_handled():
    # The default edge sits above a rule: that rule was never used.
    flow = _flow(["p1", "split", "p2", "p3", "end"], [("p1", "split"), ("split", "p3"), ("split", "p2", _picked("p1", "opt_make")), ("p2", "end"), ("p3", "end")])
    converted = sequence_from_flow(flow, ["p1", "p2", "p3"])
    assert sequence_page_uuids(converted.sequence) == ["p1", "p3"]
    assert {"shadowed_rules", "unplaced"} <= _codes(converted)
    _same_routes(flow, ["p1", "p2", "p3"], {"p1": ["opt_make", None]})


def test_a_split_straight_inside_a_path_combines_rules():
    flow = _flow(
        ["p1", "p2", "split", "p3", "p4", "p5", "p6", "end"],
        [
            ("p1", "p2"),
            ("p2", "split", _picked("p1", "opt_a")),
            ("p2", "p5"),
            ("split", "p3", _picked("p2", "opt_x")),
            ("split", "p4"),
            ("p3", "p6"),
            ("p4", "p6"),
            ("p5", "p6"),
            ("p6", "end"),
        ],
    )
    sequence = _same_routes(flow, ["p1", "p2", "p3", "p4", "p5", "p6"], {"p1": ["opt_a", "opt_b"], "p2": ["opt_x", "opt_y"]})
    branches = [item for item in sequence["items"] if item["type"] == "branch"]
    assert len(branches) == 1 and len(branches[0]["paths"]) == 3
    assert branches[0]["paths"][-1]["rule"] is None
    assert "combined_rule" in _codes(sequence_from_flow(flow, ["p1", "p2", "p3", "p4", "p5", "p6"]))


def test_a_split_part_way_down_a_path_is_lifted_and_gated():
    # The inner split reads p3, which is answered on the outer path itself.
    flow = _flow(
        ["p1", "p2", "p3", "p4", "p5", "p6", "end"],
        [
            ("p1", "p3", _picked("p1", "opt_a")),
            ("p1", "p2"),
            ("p3", "p4", _picked("p3", "opt_x")),
            ("p3", "p5"),
            ("p2", "p6"),
            ("p4", "p6"),
            ("p5", "p6"),
            ("p6", "end"),
        ],
    )
    pages = ["p1", "p2", "p3", "p4", "p5", "p6"]
    sequence = _same_routes(flow, pages, {"p1": ["opt_a", "opt_b", None], "p3": ["opt_x", "opt_y", None]})
    assert all(item["type"] == "page" or len(item["paths"]) >= 2 for item in sequence["items"])
    assert sorted(sequence_page_uuids(sequence)) == pages
    assert "lifted_branch" in _codes(sequence_from_flow(flow, pages))


def test_button_routes_become_a_branch_on_the_button():
    flow = _flow(
        ["p1", "p2", "p3", "p4", "end"],
        [("p1", "p2", _pressed("p1", "btn_more")), ("p1", "p3", _pressed("p1", "btn_skip")), ("p1", "p4"), ("p2", "p4"), ("p3", "p4"), ("p4", "end")],
    )
    sequence = _same_routes(flow, ["p1", "p2", "p3", "p4"], {"p1_button": ["btn_more", "btn_skip", None]})
    branch = sequence["items"][1]
    assert [path["rule"] for path in branch["paths"]] == [_pressed("p1", "btn_more"), _pressed("p1", "btn_skip"), None]


def test_a_split_without_a_default_gets_an_empty_default_path():
    flow = _flow(
        ["p1", "p2", "p3", "p4", "end"],
        [("p1", "p2", _picked("p1", "opt_a")), ("p1", "p3", _picked("p1", "opt_b")), ("p2", "p4"), ("p3", "p4"), ("p4", "end")],
    )
    converted = sequence_from_flow(flow, ["p1", "p2", "p3", "p4"])
    branch = converted.sequence["items"][1]
    assert branch["paths"][-1] == {"id": "default", "rule": None, "pages": []}
    assert "no_default" in _codes(converted)
    for option in ("opt_a", "opt_b"):
        context = _context(p1=option)
        assert resolve_sequence(converted.sequence, context).page_uuids == resolve_flow(flow, context).page_uuids
    # A learner who matched nothing used to be stuck; now they carry on.
    assert resolve_sequence(converted.sequence, _context()).page_uuids == ["p1", "p4"]


def test_a_path_that_finishes_where_the_others_rejoin_is_exact():
    flow = _flow(
        ["p1", "p2", "p3", "p4", "end"],
        [("p1", "p2", _picked("p1", "opt_quit")), ("p1", "p3"), ("p2", "end"), ("p3", "p4"), ("p4", "end")],
    )
    _same_routes(flow, ["p1", "p2", "p3", "p4"], {"p1": ["opt_quit", "opt_go"]})


def test_an_early_finish_inside_a_path_carries_on_and_is_flagged():
    flow = _flow(
        ["p1", "p2", "p3", "p4", "p5", "end"],
        [
            ("p1", "p2", _picked("p1", "opt_a")),
            ("p1", "p3"),
            ("p2", "end", _picked("p2", "opt_quit")),
            ("p2", "p4"),
            ("p4", "p5"),
            ("p3", "p5"),
            ("p5", "end"),
        ],
    )
    converted = sequence_from_flow(flow, ["p1", "p2", "p3", "p4", "p5"])
    assert "end_jump" in _codes(converted)
    validate_sequence(converted.sequence, {"p1", "p2", "p3", "p4", "p5"}, set())
    assert sorted(sequence_page_uuids(converted.sequence)) == ["p1", "p2", "p3", "p4", "p5"]
    assert converted.sequence["items"][-1] == {"type": "page", "page_uuid": "p5"}
    assert resolve_sequence(converted.sequence, _context(p1="opt_a", p2="opt_quit")).page_uuids == ["p1", "p2", "p5"]
    # Everyone else keeps their route.
    for context in (_context(p1="opt_a", p2="opt_stay"), _context(p1="opt_b")):
        assert resolve_sequence(converted.sequence, context).page_uuids == resolve_flow(flow, context).page_uuids


def test_a_flow_with_a_loop_falls_back_to_page_order():
    flow = _flow(["p1", "p2", "end"], [("p1", "p2"), ("p2", "p1")])
    converted = sequence_from_flow(flow, ["p1", "p2"])
    assert converted.sequence == linear_sequence(["p1", "p2"]) and _codes(converted) == {"invalid_flow"}


def test_pages_the_sequence_cannot_carry_are_flagged():
    pages = [
        {"page_uuid": "p1", "content": {"version": 2, "blocks": [{"id": "b", "type": "button", "content": {"label": "Back", "action": "revisit", "revisit_page_uuid": "p0"}}]}},
        {"page_uuid": "p2", "content": {"version": 2, "blocks": [], "variants": {"source": {"page_uuid": "p1"}, "overrides": {"opt": {"blocks": []}}}}},
    ]
    converted = activity_sequence({}, pages)
    assert [(flag["code"], flag["page_uuid"]) for flag in converted.flags] == [("revisit", "p1"), ("variants", "p2")]


def test_conversion_is_stable():
    flow = _flow(["p1", "p2", "p3", "end"], [("p1", "p2", _picked("p1", "opt_a")), ("p1", "p3"), ("p2", "end"), ("p3", "end")])
    assert sequence_from_flow(flow, ["p1", "p2", "p3"]).sequence == sequence_from_flow(flow, ["p1", "p2", "p3"]).sequence


# --- The stored sequence ------------------------------------------------------


def _branching() -> dict:
    return {
        "version": 1,
        "items": [
            {"type": "page", "page_uuid": "p1"},
            {
                "type": "branch",
                "id": "br",
                "on": {"source": "answer", "key": "p1.result.option_ids"},
                "paths": [{"id": "make", "rule": _picked("p1", "opt_make"), "pages": ["p2"]}, {"id": "default", "rule": None, "pages": ["p3"]}],
            },
            {"type": "page", "page_uuid": "p4"},
        ],
    }


def test_resolving_takes_the_first_matching_path_and_reports_it():
    resolved = resolve_sequence(_branching(), _context(p1="opt_make"))
    assert resolved.page_uuids == ["p1", "p2", "p4"] and resolved.terminal
    assert "path:br.make" in resolved.node_ids
    assert resolve_sequence(_branching(), _context()).page_uuids == ["p1", "p3", "p4"]


def test_a_stored_sequence_wins_over_the_flow():
    flow = _flow(["p1", "p3", "end"], [("p1", "p3"), ("p3", "end")])
    pages = [{"page_uuid": uuid} for uuid in ("p1", "p2", "p3", "p4")]
    assert activity_sequence({"sequence": _branching(), "flow": flow}, pages).sequence == _branching()


def test_validation_returns_unplaced_pages_and_lists_every_problem():
    assert validate_sequence(_branching(), {"p1", "p2", "p3", "p4", "p5"}, {"p1"}) == ["p5"]
    broken = _branching()
    broken["items"][1]["paths"][0]["rule"] = _picked("p4", "opt_late")
    broken["items"][1]["paths"].append({"id": "default2", "rule": None, "pages": ["p1"]})
    with pytest.raises(FlowValidationError) as exc:
        validate_sequence(broken, {"p1", "p2", "p3", "p4"}, {"p9"})
    problems = " | ".join(exc.value.problems)
    for expected in ("exactly one Default", "comes after it", "appear once", "Required pages missing"):
        assert expected in problems


def test_validation_rejects_branches_inside_paths():
    nested = _branching()
    nested["items"][1]["paths"][0]["pages"] = [{"type": "branch"}]
    with pytest.raises(FlowValidationError):
        validate_sequence(nested, {"p1", "p2", "p3", "p4"}, set())


def test_adding_and_removing_pages_keeps_the_sequence_whole():
    grown = append_page(_branching(), "p5")
    assert sequence_page_uuids(grown) == ["p1", "p2", "p3", "p4", "p5"]
    assert sequence_page_uuids(remove_page(grown, "p2")) == ["p1", "p3", "p4", "p5"]


def test_an_editor_that_only_changes_the_flow_drops_the_stale_sequence():
    stored = {"sequence": _branching(), "flow": {"version": 1}}
    patched = sequence_changed_by(stored, {"sequence": _branching(), "flow": {"version": 1, "entry": "x"}})
    assert "sequence" not in patched
    kept = sequence_changed_by(stored, {"sequence": linear_sequence(["p1"]), "flow": {"version": 1, "entry": "x"}})
    assert kept["sequence"] == linear_sequence(["p1"])
