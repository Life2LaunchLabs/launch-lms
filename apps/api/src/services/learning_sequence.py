"""An activity's sequence: its pages in order, with one-level branches.

``settings.sequence`` replaces the older ``settings.flow`` graph. A stack can't
form a cycle and can't drift from the page order, which is what broke the flow
editor. Activities that only have a flow are converted when they are read
(``activity_sequence``), by the runtime, the preview engine and the editor
alike, so nothing has to be written before the editor ships. The converter
reports what it could not carry over exactly (``flags``) for the audit.

The runtime and the preview both route with ``resolve_sequence``.
"""

from __future__ import annotations

import json
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any

from src.services.learning_flow import FlowValidationError, ResolvedFlow, evaluate_condition, validate_condition

SEQUENCE_VERSION = 1
DEFAULT_PATH_ID = "default"


@dataclass
class ConvertedSequence:
    sequence: dict
    flags: list[dict] = field(default_factory=list)


def linear_sequence(page_uuids: list[str]) -> dict:
    return {"version": SEQUENCE_VERSION, "items": [{"type": "page", "page_uuid": uuid} for uuid in page_uuids]}


def sequence_page_uuids(sequence: dict) -> list[str]:
    """Every page the sequence places, in reading order (branch paths in turn)."""
    uuids: list[str] = []
    for item in sequence.get("items") or []:
        if item.get("type") == "page":
            uuids.append(str(item.get("page_uuid")))
        elif item.get("type") == "branch":
            for path in item.get("paths") or []:
                uuids.extend(str(uuid) for uuid in path.get("pages") or [])
    return uuids


def remove_page(sequence: dict, page_uuid: str) -> dict:
    items = []
    for item in deepcopy(sequence.get("items") or []):
        if item.get("type") == "page" and item.get("page_uuid") == page_uuid:
            continue
        if item.get("type") == "branch":
            for path in item.get("paths") or []:
                path["pages"] = [uuid for uuid in path.get("pages") or [] if uuid != page_uuid]
        items.append(item)
    return {**sequence, "items": items}


def append_page(sequence: dict, page_uuid: str) -> dict:
    return {**sequence, "items": [*(sequence.get("items") or []), {"type": "page", "page_uuid": page_uuid}]}


def _answer_page(rule: Any) -> set[str]:
    """Pages whose answers a rule reads."""
    if not isinstance(rule, dict):
        return set()
    if rule.get("op") in ("and", "or"):
        return set().union(*(_answer_page(item) for item in rule.get("conditions") or []))
    if rule.get("op") == "not":
        return _answer_page(rule.get("condition"))
    left = rule.get("left") or {}
    return {str(left.get("key") or "").split(".", 1)[0]} if left.get("source") == "answer" else set()


def _incomplete(rule: dict) -> bool:
    if rule.get("op") in ("and", "or"):
        return any(_incomplete(item) for item in rule.get("conditions") or [])
    if rule.get("op") == "not":
        return _incomplete(rule.get("condition") or {})
    return not str((rule.get("left") or {}).get("key") or "") or (rule.get("op") != "exists" and rule.get("right") in (None, ""))


def validate_sequence(sequence: dict | None, page_uuids: set[str], required_page_uuids: set[str]) -> list[str]:
    """Raise ``FlowValidationError`` with every problem; return the activity's pages the sequence leaves out."""
    if not sequence:
        return []
    from src.services.learning_content.models import Sequence, content_error

    error = content_error(Sequence, sequence)
    if error:
        raise FlowValidationError(f"Invalid sequence: {error}")
    problems: list[str] = []
    placed: list[str] = []
    answered_before: set[str] = set()
    branch_ids: set[str] = set()
    for index, item in enumerate(sequence.get("items") or []):
        if item["type"] == "page":
            placed.append(item["page_uuid"])
            answered_before.add(item["page_uuid"])
            continue
        where = f"Branch {item.get('label') or index + 1}"
        if item["id"] in branch_ids:
            problems.append(f"{where} reuses the id {item['id']!r}")
        branch_ids.add(item["id"])
        paths = item.get("paths") or []
        if len({path["id"] for path in paths}) != len(paths):
            problems.append(f"{where} has two paths with the same id")
        if sum(path.get("rule") is None for path in paths) != 1:
            problems.append(f"{where} needs exactly one Default path")
        signatures: set[str] = set()
        for path in paths:
            placed.extend(path.get("pages") or [])
            rule = path.get("rule")
            if rule is None:
                continue
            try:
                validate_condition(rule, f"{where} rule")
            except FlowValidationError as exc:
                problems.append(str(exc))
                continue
            signature = json.dumps(rule, sort_keys=True, separators=(",", ":"))
            if signature in signatures:
                problems.append(f"{where} has two paths with the same rule")
            signatures.add(signature)
            if _incomplete(rule):
                problems.append(f"{where} has an incomplete rule")
            if _answer_page(rule) - answered_before - {""}:
                problems.append(f"{where} has a rule on a question that comes after it")
        for path in paths:
            answered_before.update(path.get("pages") or [])
    unknown = sorted(set(placed) - page_uuids)
    if unknown:
        problems.append(f"The sequence names pages that aren't in this activity: {', '.join(unknown)}")
    duplicated = sorted({uuid for uuid in placed if placed.count(uuid) > 1})
    if duplicated:
        problems.append(f"Pages can appear once in the sequence: {', '.join(duplicated)}")
    missing = sorted(required_page_uuids - set(placed))
    if missing:
        problems.append(f"Required pages missing from the sequence: {', '.join(missing)}")
    if problems:
        raise FlowValidationError(problems[0], problems)
    return sorted(page_uuids - set(placed))


def resolve_sequence(sequence: dict, context: dict) -> ResolvedFlow:
    """The pages a learner sees: each page in turn and, at a branch, the first path whose rule
    matches (else Default). Paths always carry on after their branch, so a route always finishes."""
    item_ids: list[str] = []
    pages: list[str] = []
    trace: list[dict] = []
    for item in sequence.get("items") or []:
        if item.get("type") == "page":
            item_ids.append(f"page:{item['page_uuid']}")
            pages.append(item["page_uuid"])
            continue
        paths = item.get("paths") or []
        chosen = next((path for path in paths if path.get("rule") is not None and evaluate_condition(path["rule"], context, trace)), None)
        chosen = chosen or next((path for path in paths if path.get("rule") is None), None)
        item_ids.append(f"branch:{item.get('id')}")
        if chosen:
            item_ids.append(f"path:{item.get('id')}.{chosen.get('id')}")
            pages.extend(chosen.get("pages") or [])
    return ResolvedFlow(item_ids, pages, True, trace)


# --- Converting a flow ----------------------------------------------------------


def _all(*rules: Any) -> dict | None:
    parts: list[dict] = []
    for rule in rules:
        if not rule:
            continue
        parts.extend(rule["conditions"] if rule.get("op") == "and" else [rule])
    if not parts:
        return None
    return parts[0] if len(parts) == 1 else {"op": "and", "conditions": parts}


def _none_of(rules: list[dict]) -> dict | None:
    if not rules:
        return None
    return {"op": "not", "condition": rules[0] if len(rules) == 1 else {"op": "or", "conditions": rules}}


class _Converter:
    """Walks a flow graph from its entry and writes it out as a sequence.

    A node with several outgoing edges becomes a branch whose paths run until
    the first node every path reaches (where they rejoin). A split directly
    inside a path folds into its parent branch with both rules combined; a
    split after some of the path's pages is lifted out after the parent branch,
    gated on the parent's rule, so the inner rule can still read answers given
    on the path. The ids of branches and paths are stable for the same flow.
    """

    def __init__(self, flow: dict, page_uuids: list[str]):
        self.nodes = {str(node.get("id")): node for node in flow.get("nodes") or [] if isinstance(node, dict)}
        self.outgoing: dict[str, list[dict]] = {node_id: [] for node_id in self.nodes}
        for edge in flow.get("edges") or []:
            if isinstance(edge, dict) and str(edge.get("from")) in self.nodes and str(edge.get("to")) in self.nodes:
                self.outgoing[str(edge["from"])].append(edge)
        for edges in self.outgoing.values():
            edges.sort(key=lambda edge: -int(edge.get("priority") or 0))
        self.known = set(page_uuids)
        self.entry = str(flow.get("entry") or "")
        self.placed: set[str] = set()
        self.flags: list[dict] = []
        self.branch_count = 0
        self.order = self._topological()
        self.reach_memo: dict[str, set[str]] = {}

    def flag(self, code: str, message: str, **extra: Any) -> None:
        entry = {"code": code, "message": message, **extra}
        if entry not in self.flags:
            self.flags.append(entry)

    def _topological(self) -> list[str]:
        order: list[str] = []
        state: dict[str, int] = {}
        stack: list[tuple[str, int]] = [(self.entry, 0)] if self.entry in self.nodes else []
        while stack:
            node_id, index = stack.pop()
            if index == 0:
                if state.get(node_id) == 2:
                    continue
                if state.get(node_id) == 1:
                    raise FlowValidationError("Flow must be acyclic")
                state[node_id] = 1
            edges = self.outgoing[node_id]
            if index < len(edges):
                stack.append((node_id, index + 1))
                target = str(edges[index]["to"])
                if state.get(target) == 1:
                    raise FlowValidationError("Flow must be acyclic")
                if state.get(target) != 2:
                    stack.append((target, 0))
            else:
                state[node_id] = 2
                order.append(node_id)
        return order[::-1]

    def reach(self, node_id: str) -> set[str]:
        if node_id not in self.reach_memo:
            seen, stack = set(), [node_id]
            while stack:
                current = stack.pop()
                if current in seen:
                    continue
                seen.add(current)
                stack.extend(str(edge["to"]) for edge in self.outgoing.get(current, []))
            self.reach_memo[node_id] = seen
        return self.reach_memo[node_id]

    def rejoin(self, targets: list[str]) -> str | None:
        common = set.intersection(*(self.reach(target) for target in targets))
        return next((node_id for node_id in self.order if node_id in common), None)

    def walk(self, node_id: str | None, stop: str | None) -> list[dict]:
        """Items from ``node_id`` up to (not including) ``stop``."""
        items: list[dict] = []
        while node_id is not None and node_id != stop:
            node = self.nodes[node_id]
            if node.get("type") == "complete":
                if stop is not None:
                    self.flag("end_jump", "A path finished the activity early; its pages now carry on to the rest of the activity.", node_id=node_id)
                return items
            if node.get("type") == "page":
                uuid = str(node.get("page_uuid") or "")
                if uuid in self.placed:
                    self.flag("shared_page", "A page sat on more than one path; it now shows on the first path only.", page_uuid=uuid)
                elif uuid in self.known:
                    self.placed.add(uuid)
                    items.append({"type": "page", "page_uuid": uuid})
            edges = self.outgoing[node_id]
            if not edges:
                self.flag("dead_end", "A route stopped without finishing; it now carries on to the rest of the activity.", node_id=node_id)
                return items
            if len(edges) == 1:
                if edges[0].get("condition"):
                    self.flag("lone_rule", "A single onward route had a rule; it now always continues.", node_id=node_id)
                node_id = str(edges[0]["to"])
                continue
            # Routes below the default were never taken.
            default_at = next((index for index, edge in enumerate(edges) if not edge.get("condition")), len(edges) - 1)
            taken = edges[: default_at + 1]
            if len(taken) == 1:
                self.flag("shadowed_rules", "A split's rules were never used (its default came first); its default route stays.", node_id=node_id)
                node_id = str(taken[0]["to"])
                continue
            merge = self.rejoin([str(edge["to"]) for edge in taken])
            # Paths inside a path stop where the outer paths rejoin (one that finishes first is an end jump).
            if stop is not None and (merge is None or self.order.index(merge) > self.order.index(stop)):
                merge = stop
            paths: list[tuple[dict | None, list[dict]]] = [(edge.get("condition") or None, self.walk(str(edge["to"]), merge)) for edge in taken]
            if all(rule is not None for rule, _ in paths):
                paths.append((None, []))
                self.flag("no_default", "A split had no default route (learners who matched no rule were stuck); it now has an empty Default path.", node_id=node_id)
            items.extend(self.branch(paths))
            node_id = merge
        return items

    def new_branch(self, paths: list[tuple[dict | None, list[str]]]) -> dict:
        self.branch_count += 1
        branch_id = f"branch_{self.branch_count}"
        out = []
        for index, (rule, pages) in enumerate(paths):
            path_id = DEFAULT_PATH_ID if rule is None else f"path_{index + 1}"
            out.append({"id": path_id, "rule": rule, "pages": pages})
        return {"type": "branch", "id": branch_id, "paths": out}

    def branch(self, paths: list[tuple[dict | None, list[dict]]]) -> list[dict]:
        """One branch when every path is flat or is exactly one inner split; else gated branches."""
        nested = [items for _, items in paths if any(item["type"] == "branch" for item in items)]
        if not nested:
            return [self.new_branch([(rule, [item["page_uuid"] for item in items]) for rule, items in paths])]
        if all(len(items) == 1 for items in nested):
            flat: list[tuple[dict | None, list[str]]] = []
            for rule, items in paths:
                if items and items[0]["type"] == "branch":
                    inner = items[0]["paths"]
                    for inner_path in inner:
                        combined = _all(rule, inner_path["rule"])
                        if combined is None and rule is None and inner_path is not inner[-1]:
                            continue
                        flat.append((combined if inner_path["rule"] is not None or rule is not None else None, inner_path["pages"]))
                    self.flag("combined_rule", "A split inside a split became one branch with combined rules.")
                else:
                    flat.append((rule, [item["page_uuid"] for item in items]))
            return [self.new_branch(self._default_last(flat))]
        # Gate each path on being the one taken, then lay its pages and inner branches out in turn.
        self.flag("lifted_branch", "A split part-way down a path became branches after it, each checking the path's rule.")
        out: list[dict] = []
        taken_before: list[dict] = []
        for rule, items in paths:
            gate = _all(rule, _none_of(taken_before)) if rule is not None else _none_of(taken_before)
            if rule is not None:
                taken_before.append(rule)
            out.extend(self.gated(gate, items))
        return out

    def gated(self, gate: dict | None, items: list[dict]) -> list[dict]:
        out: list[dict] = []
        pages: list[str] = []

        def flush() -> None:
            if not pages:
                return
            if gate is None:
                out.extend({"type": "page", "page_uuid": uuid} for uuid in pages)
            else:
                out.append(self.new_branch([(gate, list(pages)), (None, [])]))
            pages.clear()

        for item in items:
            if item["type"] == "page":
                pages.append(item["page_uuid"])
                continue
            flush()
            inner = [(_all(gate, path["rule"]) if path["rule"] is not None else gate, path["pages"]) for path in item["paths"]]
            if gate is not None:
                inner.append((None, []))
            out.append(self.new_branch(self._default_last(inner)))
        flush()
        return out

    @staticmethod
    def _default_last(paths: list[tuple[dict | None, list[str]]]) -> list[tuple[dict | None, list[str]]]:
        """Drop paths shadowed by an earlier identical rule, and keep the one Default at the end."""
        seen: set[str] = set()
        ruled: list[tuple[dict | None, list[str]]] = []
        default: list[str] | None = None
        for rule, pages in paths:
            if rule is None:
                default = pages if default is None else default
                continue
            signature = json.dumps(rule, sort_keys=True)
            if signature in seen:
                continue
            seen.add(signature)
            ruled.append((rule, pages))
        return [*ruled, (None, default or [])]


def sequence_from_flow(flow: dict, page_uuids: list[str], pages: list[dict] | None = None) -> ConvertedSequence:
    """Convert a flow graph to a sequence. ``page_uuids`` are the activity's pages in display
    order; ``pages`` (dicts with ``page_uuid`` and ``content``) let the converter flag the
    page features the sequence no longer supports."""
    try:
        converter = _Converter(flow, page_uuids)
        items = converter.walk(converter.entry if converter.entry in converter.nodes else None, None)
    except FlowValidationError:
        converted = ConvertedSequence(linear_sequence(page_uuids))
        converted.flags.append({"code": "invalid_flow", "message": "The flow had a loop, so the pages now run in their list order."})
        return converted
    converted = ConvertedSequence({"version": SEQUENCE_VERSION, "items": items}, converter.flags)
    left_out = [uuid for uuid in page_uuids if uuid not in converter.placed]
    if left_out:
        converted.flags.append({"code": "unplaced", "message": "Some pages weren't on any route; they stay out of the sequence.", "page_uuids": left_out})
    converted.flags.extend(page_flags(pages or []))
    return converted


def page_flags(pages: list[dict]) -> list[dict]:
    from src.services.learning_page_convert import iter_block_stacks

    flags: list[dict] = []
    for page in pages:
        content = page.get("content") or {}
        if any(
            isinstance(block, dict) and block.get("type") == "button" and (block.get("content") or {}).get("action") == "revisit"
            for stack in iter_block_stacks(content)
            for block in stack
        ):
            flags.append({"code": "revisit", "message": "A button goes back to an earlier page; version 3 pages drop it.", "page_uuid": page.get("page_uuid")})
        if (content.get("variants") or {}).get("overrides"):
            flags.append({"code": "variants", "message": "The page swaps blocks on an earlier answer; it becomes a branch with a page per answer.", "page_uuid": page.get("page_uuid")})
    return flags


def activity_sequence(settings: dict | None, pages: list[dict]) -> ConvertedSequence:
    """The activity's sequence: the stored one, else its flow converted, else its pages in order.
    ``pages`` are dicts with ``page_uuid`` (and ``content`` for flags) in display order."""
    settings = settings or {}
    page_uuids = [str(page["page_uuid"]) for page in pages]
    if settings.get("sequence"):
        return ConvertedSequence(deepcopy(settings["sequence"]))
    if settings.get("flow"):
        return sequence_from_flow(settings["flow"], page_uuids, pages)
    return ConvertedSequence(linear_sequence(page_uuids), page_flags(pages))


def routes(settings: dict | None) -> bool:
    """Whether the activity branches or reorders (has a sequence or a flow) rather than running its pages in order."""
    return bool((settings or {}).get("sequence") or (settings or {}).get("flow"))


def resolve_activity(settings: dict | None, pages: list[dict], context: dict) -> ResolvedFlow:
    return resolve_sequence(activity_sequence(settings, pages).sequence, context)


def validate_player_settings(settings: dict) -> None:
    """``settings.design`` (how the player presents the activity) and ``settings.grading``."""
    from src.services.learning_content.models import ActivityDesign, ActivityGrading, content_error

    error = content_error(ActivityDesign, settings.get("design") or {})
    if error:
        raise FlowValidationError(f"Invalid activity design: {error}")
    error = content_error(ActivityGrading, settings.get("grading") or {})
    if error:
        raise FlowValidationError(f"Invalid grading: {error}")


def sequence_changed_by(stored: dict | None, patch: dict) -> dict:
    """Settings as saved: an editor that only knows flows (it changed ``flow`` and sent the stored
    ``sequence`` back untouched) makes the stored sequence stale, so it is dropped."""
    stored = stored or {}
    if "flow" in patch and patch.get("flow") != stored.get("flow") and patch.get("sequence") == stored.get("sequence") and stored.get("sequence"):
        return {key: value for key, value in patch.items() if key != "sequence"}
    return patch
