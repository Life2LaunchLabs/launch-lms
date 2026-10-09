"""route page buttons through the activity flow

Revision ID: k4b5u6t7t8n9
Revises: k3n4o5r6m7q8

Page buttons no longer carry ``destination_page_uuid``. A button whose
destination the page can already be reached from becomes a revisit
(``action: revisit`` + ``revisit_page_uuid``); any other destination becomes
a flow edge from the page conditioned on ``<page_uuid>.button``. Activities
without a flow only get one when a forward route is needed. Applies to every
activity in every badge version and to preview session documents. Helpers are
frozen copies. Downgrade is a no-op.
"""

import json
from copy import deepcopy

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "k4b5u6t7t8n9"
down_revision = "k3n4o5r6m7q8"
branch_labels = None
depends_on = None

BUTTON_ACTIONS = {"continue", "revisit"}


def iter_block_stacks(content: dict | None):
    """Yield every blocks array in a standard page: default + all variant overrides."""
    content = content or {}
    blocks = content.get("blocks")
    if isinstance(blocks, list):
        yield blocks
    overrides = ((content.get("variants") or {}).get("overrides")) or {}
    if isinstance(overrides, dict):
        for override in overrides.values():
            override_blocks = (
                (override or {}).get("blocks") if isinstance(override, dict) else None
            )
            if isinstance(override_blocks, list):
                yield override_blocks


def button_answer_key(page_uuid: str) -> str:
    return f"{page_uuid}.button"


def button_condition(page_uuid: str, button_id: str) -> dict:
    return {
        "op": "eq",
        "left": {"source": "answer", "key": button_answer_key(page_uuid)},
        "right": button_id,
    }


def linear_flow(page_uuids: list[str]) -> dict:
    nodes = [
        {"id": f"page:{uuid}", "type": "page", "page_uuid": uuid} for uuid in page_uuids
    ] + [{"id": "complete", "type": "complete"}]
    edges = [
        {
            "from": f"page:{uuid}",
            "to": f"page:{page_uuids[i + 1]}"
            if i + 1 < len(page_uuids)
            else "complete",
            "priority": 0,
        }
        for i, uuid in enumerate(page_uuids)
    ]
    return {"version": 1, "entry": nodes[0]["id"], "nodes": nodes, "edges": edges}


def page_node_id(flow: dict, page_uuid: str) -> str | None:
    return next(
        (
            str(node["id"])
            for node in flow.get("nodes", [])
            if node.get("page_uuid") == page_uuid
        ),
        None,
    )


def node_reaches(flow: dict, from_id: str, to_id: str) -> bool:
    outgoing: dict[str, list[str]] = {}
    for edge in flow.get("edges", []):
        outgoing.setdefault(str(edge.get("from")), []).append(str(edge.get("to")))
    seen, stack = set(), [from_id]
    while stack:
        node = stack.pop()
        if node == to_id:
            return True
        if node in seen:
            continue
        seen.add(node)
        stack.extend(outgoing.get(node, []))
    return False


def route_button(
    flow: dict, page_uuid: str, button_id: str, target_page_uuid: str
) -> dict:
    """Route a button press on a page to another page with a flow edge."""
    updated = deepcopy(flow)
    source, target = (
        page_node_id(updated, page_uuid),
        page_node_id(updated, target_page_uuid),
    )
    if not source or not target:
        raise ValueError("Button pages must both be in the flow")
    condition = button_condition(page_uuid, button_id)
    updated["edges"] = [
        edge
        for edge in updated["edges"]
        if not (edge.get("from") == source and edge.get("condition") == condition)
    ]
    priorities = [
        int(edge.get("priority", 0))
        for edge in updated["edges"]
        if edge.get("from") == source
    ]
    updated["edges"].append(
        {
            "from": source,
            "to": target,
            "priority": max(priorities, default=0) + 1,
            "condition": condition,
        }
    )
    return updated


def continue_buttons(content: dict | None) -> set[str]:
    """Ids of the buttons on a page that continue along the flow."""
    return {
        str(block.get("id"))
        for stack in iter_block_stacks(content or {})
        for block in stack
        if isinstance(block, dict)
        and block.get("type") == "button"
        and (block.get("content") or {}).get("action", "continue") == "continue"
    }


def convert_button_destinations(
    pages: list[dict], flow: dict | None
) -> tuple[list[dict], dict | None]:
    """Turn legacy ``destination_page_uuid`` buttons into flow edges or revisits.

    ``pages`` are dicts with ``page_uuid`` and ``content`` in display order.
    A destination the page can already be reached from becomes a revisit (the
    flow must stay acyclic); any other destination becomes a flow edge.
    """
    pages = deepcopy(pages)
    for page in pages:
        for stack in iter_block_stacks(page.get("content") or {}):
            for block in stack:
                if not isinstance(block, dict) or block.get("type") != "button":
                    continue
                content = block.setdefault("content", {})
                destination = str(content.pop("destination_page_uuid", "") or "")
                content.setdefault("action", "continue")
                if not destination or content.get("action") == "revisit":
                    continue
                graph = flow or linear_flow([item["page_uuid"] for item in pages])
                source, target = (
                    page_node_id(graph, page["page_uuid"]),
                    page_node_id(graph, destination),
                )
                if not source or not target:
                    continue
                if target == source or node_reaches(graph, target, source):
                    content.update(
                        {"action": "revisit", "revisit_page_uuid": destination}
                    )
                else:
                    # Only a forward route needs a flow; keep page order otherwise.
                    flow = route_button(
                        graph, page["page_uuid"], str(block.get("id")), destination
                    )
    return pages, flow


def _load(raw):
    if isinstance(raw, (dict, list)):
        return raw
    if isinstance(raw, str) and raw:
        try:
            return json.loads(raw)
        except ValueError:
            return {}
    return {}


def upgrade() -> None:
    bind = op.get_bind()
    tables = inspect(bind).get_table_names()
    if "learningactivity" in tables and "learningpage" in tables:
        pages_by_activity: dict[int, list] = {}
        for row in bind.execute(
            sa.text(
                'SELECT id, activity_id, page_uuid, content FROM learningpage ORDER BY activity_id, "order", id'
            )
        ).fetchall():
            pages_by_activity.setdefault(row[1], []).append(
                {"id": row[0], "page_uuid": row[2], "content": _load(row[3])}
            )
        for activity_id, raw_settings in bind.execute(
            sa.text("SELECT id, settings FROM learningactivity")
        ).fetchall():
            pages = pages_by_activity.get(activity_id) or []
            if "button" not in json.dumps([page["content"] for page in pages]):
                continue
            settings = _load(raw_settings) or {}
            converted, flow = convert_button_destinations(pages, settings.get("flow"))
            for before, after in zip(pages, converted):
                if after["content"] != before["content"]:
                    bind.execute(
                        sa.text(
                            "UPDATE learningpage SET content = :content WHERE id = :id"
                        ),
                        {"content": json.dumps(after["content"]), "id": before["id"]},
                    )
            if flow is not None and flow != settings.get("flow"):
                bind.execute(
                    sa.text(
                        "UPDATE learningactivity SET settings = :settings WHERE id = :id"
                    ),
                    {
                        "settings": json.dumps({**settings, "flow": flow}),
                        "id": activity_id,
                    },
                )
    if "learningactivitypreview" in tables:
        for preview_id, raw_document in bind.execute(
            sa.text("SELECT id, document FROM learningactivitypreview")
        ).fetchall():
            document = _load(raw_document)
            settings = (document.get("activity") or {}).get("settings") or {}
            pages, flow = convert_button_destinations(
                document.get("pages") or [], settings.get("flow")
            )
            document["pages"] = pages
            if flow is not None:
                document.setdefault("activity", {})["settings"] = {**settings, "flow": flow}
            bind.execute(
                sa.text(
                    "UPDATE learningactivitypreview SET document = :document WHERE id = :id"
                ),
                {"document": json.dumps(document), "id": preview_id},
            )


def downgrade() -> None:
    pass
