#!/usr/bin/env python3
"""Validate and render the repository-owned Launch LMS product map."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PRODUCT = ROOT / "docs" / "product"
MAP = PRODUCT / "map"
MANIFEST = PRODUCT / "manifest.json"
INDEX = PRODUCT / "index.md"
STATES = {"planned", "live", "deprecated", "sunset", "removed", "cancelled"}


def load() -> tuple[dict, list[dict]]:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    groups = [json.loads(path.read_text(encoding="utf-8")) for path in sorted(MAP.glob("*.json"))]
    return manifest, groups


def counts(groups: list[dict]) -> dict[str, int]:
    goals = [goal for group in groups for goal in group["goals"]]
    activities = [activity for goal in goals for activity in goal["activities"]]
    steps = [step for activity in activities for step in activity["steps"]]
    return {"groups": len(groups), "goals": len(goals), "activities": len(activities), "steps": len(steps)}


def import_export(source: Path) -> None:
    source_bytes = source.read_bytes()
    payload = json.loads(source_bytes)
    MAP.mkdir(parents=True, exist_ok=True)
    expected = counts(payload["groups"])
    manifest = {
        "schema_version": 1,
        "source": "productOS/workspaces/launch-lms/product.db",
        "source_exported_at": payload.get("exported_at"),
        "migration_source_sha256": hashlib.sha256(source_bytes).hexdigest(),
        "expected_counts": expected,
        "migration_baseline": metrics(payload["groups"]),
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    expected_files = set()
    for group in payload["groups"]:
        path = MAP / f"{group['display_order']:02d}-{group['id'].lower()}.json"
        expected_files.add(path)
        path.write_text(json.dumps(group, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    for path in MAP.glob("*.json"):
        if path not in expected_files:
            path.unlink()
    render(payload["groups"])


def nodes(groups: list[dict]):
    for group in groups:
        yield "group", group
        for goal in group["goals"]:
            yield "goal", goal
            for activity in goal["activities"]:
                yield "activity", activity
                for step in activity["steps"]:
                    yield "step", step


def metrics(groups: list[dict]) -> dict[str, object]:
    values = list(nodes(groups))
    return {
        "counts": counts(groups),
        "acceptance_criteria": sum(len(node.get("acceptance", [])) for _, node in values),
        "references": sum(len(node.get("references", [])) for _, node in values),
        "relationships": sum(len(node.get("relationships", [])) for _, node in values),
        "lifecycle_states": {
            state: sum(1 for kind, node in values if kind != "group" and node.get("product_state") == state)
            for state in sorted(STATES)
        },
    }


def validate(groups: list[dict], manifest: dict) -> list[str]:
    errors: list[str] = []
    identifiers: dict[str, str] = {}
    acceptance_ids: set[str] = set()
    actual = counts(groups)
    if manifest.get("schema_version") != 1:
        errors.append("manifest schema_version must be 1")
    if actual != manifest.get("expected_counts"):
        errors.append(f"count mismatch: expected {manifest.get('expected_counts')}, got {actual}")

    def unique_order(parent: str, items: list[dict]) -> None:
        values = [item["display_order"] for item in items]
        if len(values) != len(set(values)):
            errors.append(f"duplicate display_order below {parent}")

    unique_order("root", groups)
    for kind, node in nodes(groups):
        identifier = node.get("id")
        if not identifier:
            errors.append(f"{kind} without id")
            continue
        if identifier in identifiers:
            errors.append(f"duplicate id {identifier}")
        identifiers[identifier] = kind
        if kind != "group" and node.get("product_state") not in STATES:
            errors.append(f"{identifier}: invalid product_state {node.get('product_state')!r}")
        for required in ("title", "display_order"):
            if required not in node:
                errors.append(f"{identifier}: missing required field {required}")
        children = node.get({"group": "goals", "goal": "activities", "activity": "steps"}.get(kind, ""), [])
        if children:
            unique_order(identifier, children)

    for group in groups:
        for goal in group["goals"]:
            if goal.get("group_id") != group["id"]:
                errors.append(f"{goal['id']}: group_id does not match {group['id']}")
            for activity in goal["activities"]:
                if activity.get("goal_id") != goal["id"]:
                    errors.append(f"{activity['id']}: goal_id does not match {goal['id']}")
                for criterion in activity.get("acceptance", []):
                    if criterion.get("activity_id") != activity["id"]:
                        errors.append(f"{criterion.get('id')}: acceptance activity_id mismatch")
                    criterion_id = criterion.get("id")
                    if not criterion_id or criterion_id in acceptance_ids:
                        errors.append(f"{activity['id']}: missing or duplicate acceptance id {criterion_id}")
                    acceptance_ids.add(criterion_id)
                    if not criterion.get("criterion"):
                        errors.append(f"{criterion_id}: missing criterion text")
                for relation in activity.get("relationships", []):
                    if relation.get("target_id") not in identifiers:
                        errors.append(f"{activity['id']}: missing relationship target {relation.get('target_id')}")
                    if not relation.get("relationship_type"):
                        errors.append(f"{activity['id']}: relationship without type")
                for step in activity["steps"]:
                    if step.get("activity_id") != activity["id"]:
                        errors.append(f"{step['id']}: activity_id does not match {activity['id']}")
                for owner in [activity, *activity["steps"]]:
                    for reference in owner.get("references", []):
                        path = reference.get("path")
                        if reference.get("kind") not in {"code", "test", "doc", "documentation"}:
                            errors.append(f"{owner['id']}: invalid reference kind {reference.get('kind')}")
                        if path and not (ROOT / path).exists():
                            errors.append(f"{owner['id']}: missing {reference.get('kind')} reference {path}")
                        if not path:
                            errors.append(f"{owner['id']}: reference without path")
    return errors


def render(groups: list[dict], check: bool = False) -> str:
    actual = counts(groups)
    lines = [
        "# Launch LMS product map",
        "",
        f"{actual['groups']} groups · {actual['goals']} goals · {actual['activities']} activities · {actual['steps']} steps",
        "",
        "Generated by `scripts/product-map.py`; edit the group JSON files, not this index.",
        "",
    ]
    for group in groups:
        lines.extend([f"## {group['id']}: {group['title']}", "", group.get("intent", ""), ""])
        for goal in group["goals"]:
            lines.append(f"- **{goal['id']} — {goal['title']}**")
            for activity in goal["activities"]:
                lines.append(f"  - `{activity['id']}` [{activity['product_state']}] {activity['title']}")
                for step in activity["steps"]:
                    lines.append(f"    - `{step['id']}` [{step['product_state']} / {step['step_kind']}] {step['title']}")
        lines.append("")
    content = "\n".join(lines).rstrip() + "\n"
    if check:
        if not INDEX.exists() or INDEX.read_text(encoding="utf-8") != content:
            raise ValueError("docs/product/index.md is stale; run scripts/product-map.py render")
    else:
        INDEX.write_text(content, encoding="utf-8")
    return content


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    importer = sub.add_parser("import-export", help="one-time migration from a productOS JSON export")
    importer.add_argument("source", type=Path)
    renderer = sub.add_parser("render")
    renderer.add_argument("--check", action="store_true")
    sub.add_parser("validate")
    args = parser.parse_args()
    if args.command == "import-export":
        import_export(args.source)
    else:
        manifest, groups = load()
        errors = validate(groups, manifest)
        if errors:
            raise SystemExit("Product map validation failed:\n- " + "\n- ".join(errors))
        if args.command == "render":
            render(groups, check=args.check)
        print("Product map valid:", counts(groups))


if __name__ == "__main__":
    main()
