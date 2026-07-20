"""Validation and deterministic traversal for versioned learning activity flows."""

from __future__ import annotations

from dataclasses import dataclass
from copy import deepcopy
from typing import Any


class FlowValidationError(ValueError):
    pass


ALLOWED_FACTS = {
    "has_work",
    "has_journey",
    "work_count",
    "journey_count",
    "readiness_blockers",
}
ALLOWED_CONTEXT = {"mode", "bindings"}
COMPARISONS = {"eq", "ne", "gt", "gte", "lt", "lte", "in", "contains", "exists"}


def append_page_to_flow(flow: dict | None, page_uuid: str) -> dict | None:
    """Append a page after every existing path, immediately before completion."""
    if not flow:
        return flow
    updated = deepcopy(flow)
    node_id = f"page:{page_uuid}"
    if any(node.get("page_uuid") == page_uuid for node in updated.get("nodes", [])):
        return updated

    terminals = [
        node for node in updated.get("nodes", []) if node.get("type") == "complete"
    ]
    if not terminals:
        return updated
    terminal_ids = {str(node.get("id")) for node in terminals}
    completion_id = str(terminals[0].get("id"))
    updated["nodes"] = [
        node
        for node in updated.get("nodes", [])
        if node.get("type") != "complete" or str(node.get("id")) == completion_id
    ]
    updated["nodes"].append(
        {"id": node_id, "type": "page", "page_uuid": page_uuid}
    )
    updated["edges"] = [
        {**edge, "to": node_id} if str(edge.get("to")) in terminal_ids else edge
        for edge in updated.get("edges", [])
    ]
    updated["edges"].append(
        {"from": node_id, "to": completion_id, "priority": 0}
    )
    if str(updated.get("entry")) in terminal_ids:
        updated["entry"] = node_id
    return updated


def _value(ref: Any, context: dict) -> Any:
    if not isinstance(ref, dict) or "source" not in ref:
        return ref
    source, key = ref.get("source"), str(ref.get("key") or "")
    if source == "answer":
        value: Any = context.get("answers", {})
        for part in key.split("."):
            if not isinstance(value, dict) or part not in value:
                return None
            value = value[part]
        return value
    if source == "variable":
        return context.get("variables", {}).get(key)
    if source == "fact" and key in ALLOWED_FACTS:
        return context.get("facts", {}).get(key)
    if source == "context" and key in ALLOWED_CONTEXT:
        return context.get("context", {}).get(key)
    return None


def validate_condition(condition: Any, path: str = "condition") -> None:
    if condition in (None, {}):
        return
    if not isinstance(condition, dict):
        raise FlowValidationError(f"{path} must be an object")
    op = condition.get("op")
    if op in {"and", "or"}:
        items = condition.get("conditions")
        if not isinstance(items, list) or not items:
            raise FlowValidationError(f"{path}.{op} needs conditions")
        for index, item in enumerate(items):
            validate_condition(item, f"{path}.conditions[{index}]")
        return
    if op == "not":
        validate_condition(condition.get("condition"), f"{path}.condition")
        return
    if op not in COMPARISONS:
        raise FlowValidationError(f"{path} uses unsupported operator {op!r}")
    left = condition.get("left")
    if not isinstance(left, dict) or left.get("source") not in {
        "answer",
        "variable",
        "fact",
        "context",
    }:
        raise FlowValidationError(f"{path}.left must use an approved source")
    if left.get("source") == "fact" and left.get("key") not in ALLOWED_FACTS:
        raise FlowValidationError(f"{path} references an unsupported portfolio fact")
    if left.get("source") == "context" and left.get("key") not in ALLOWED_CONTEXT:
        raise FlowValidationError(f"{path} references unsupported run context")


def evaluate_condition(
    condition: Any, context: dict, trace: list[dict] | None = None
) -> bool:
    if condition in (None, {}):
        result = True
    else:
        op = condition.get("op")
        if op == "and":
            result = all(
                evaluate_condition(item, context, trace)
                for item in condition.get("conditions", [])
            )
        elif op == "or":
            result = any(
                evaluate_condition(item, context, trace)
                for item in condition.get("conditions", [])
            )
        elif op == "not":
            result = not evaluate_condition(condition.get("condition"), context, trace)
        else:
            left, right = (
                _value(condition.get("left"), context),
                _value(condition.get("right"), context),
            )
            if op == "exists":
                result = left is not None
            elif left is None:
                result = False
            elif op == "eq":
                result = left == right
            elif op == "ne":
                result = left != right
            elif op == "in":
                result = isinstance(right, (list, tuple, set)) and left in right
            elif op == "contains":
                result = isinstance(left, (list, tuple, set, str)) and right in left
            else:
                try:
                    if op == "gt":
                        result = left > right
                    elif op == "gte":
                        result = left >= right
                    elif op == "lt":
                        result = left < right
                    elif op == "lte":
                        result = left <= right
                    else:
                        result = False
                except TypeError:
                    result = False
    if trace is not None:
        trace.append({"condition": condition, "result": result})
    return result


def validate_flow(
    flow: dict | None, page_uuids: set[str], required_page_uuids: set[str]
) -> list[str]:
    if not flow:
        return []
    if flow.get("version") != 1:
        raise FlowValidationError("Flow version must be 1")
    nodes = flow.get("nodes")
    edges = flow.get("edges")
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise FlowValidationError("Flow nodes and edges must be arrays")
    by_id = {
        str(node.get("id")): node
        for node in nodes
        if isinstance(node, dict) and node.get("id")
    }
    if len(by_id) != len(nodes):
        raise FlowValidationError("Every flow node needs a unique id")
    entry = str(flow.get("entry") or "")
    if entry not in by_id:
        raise FlowValidationError("Flow entry node is missing")
    page_nodes: set[str] = set()
    terminals: set[str] = set()
    for node_id, node in by_id.items():
        if node.get("type") == "complete":
            terminals.add(node_id)
        elif node.get("type") == "page" and node.get("page_uuid") in page_uuids:
            page_nodes.add(str(node.get("page_uuid")))
        else:
            raise FlowValidationError(f"Flow node {node_id} is invalid")
    if not terminals:
        raise FlowValidationError("Flow needs a completion node")
    outgoing: dict[str, list[dict]] = {node_id: [] for node_id in by_id}
    for index, edge in enumerate(edges):
        if (
            not isinstance(edge, dict)
            or edge.get("from") not in by_id
            or edge.get("to") not in by_id
        ):
            raise FlowValidationError(f"Flow edge {index} references a missing node")
        validate_condition(edge.get("condition"), f"edges[{index}].condition")
        edge["priority"] = int(edge.get("priority", 0))
        outgoing[edge["from"]].append(edge)
    seen: set[str] = set()
    stack: set[str] = set()

    def visit(node_id: str) -> None:
        if node_id in stack:
            raise FlowValidationError("Flow must be acyclic")
        if node_id in seen:
            return
        stack.add(node_id)
        for edge in outgoing[node_id]:
            visit(edge["to"])
        stack.remove(node_id)
        seen.add(node_id)

    visit(entry)
    unreachable = sorted(set(by_id) - seen)
    if unreachable:
        raise FlowValidationError(f"Unreachable flow nodes: {', '.join(unreachable)}")
    if not required_page_uuids.issubset(page_nodes):
        missing = sorted(required_page_uuids - page_nodes)
        raise FlowValidationError(
            f"Required pages missing from flow: {', '.join(missing)}"
        )
    for node_id in seen - terminals:
        if not outgoing[node_id]:
            raise FlowValidationError(f"Flow node {node_id} cannot reach completion")
        priorities = [edge["priority"] for edge in outgoing[node_id]]
        if len(priorities) != len(set(priorities)):
            raise FlowValidationError(
                f"Flow node {node_id} has ambiguous edge priorities"
            )
    return unreachable


@dataclass
class ResolvedFlow:
    node_ids: list[str]
    page_uuids: list[str]
    terminal: bool
    trace: list[dict]


def resolve_flow(flow: dict, context: dict) -> ResolvedFlow:
    nodes = {node["id"]: node for node in flow["nodes"]}
    outgoing: dict[str, list[dict]] = {}
    for edge in flow["edges"]:
        outgoing.setdefault(edge["from"], []).append(edge)
    node_id, node_ids, pages, trace = flow["entry"], [], [], []
    while node_id:
        node = nodes[node_id]
        node_ids.append(node_id)
        if node.get("type") == "complete":
            return ResolvedFlow(node_ids, pages, True, trace)
        pages.append(node["page_uuid"])
        candidates = sorted(
            outgoing.get(node_id, []),
            key=lambda item: int(item.get("priority", 0)),
            reverse=True,
        )
        chosen = next(
            (
                edge
                for edge in candidates
                if evaluate_condition(edge.get("condition"), context, trace)
            ),
            None,
        )
        if not chosen:
            return ResolvedFlow(node_ids, pages, False, trace)
        node_id = chosen["to"]
    return ResolvedFlow(node_ids, pages, False, trace)
