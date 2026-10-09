"""Generate the web app's content types from the typed content models.

Run from ``apps/api``::

    uv run python -m src.services.learning_content.typescript

``test_learning_content_models`` fails when the checked-in file is stale.
Only the JSON Schema subset the models produce is supported.
"""

from __future__ import annotations

import json
from pathlib import Path

from src.services.learning_content.models import Flow, StandardPageContent, VideoPageContent

OUTPUT = Path(__file__).resolve().parents[4] / "web" / "components" / "Learning" / "content.generated.ts"
HEADER = """// Generated from apps/api/src/services/learning_content/models.py — do not edit.
// Regenerate: cd apps/api && uv run python -m src.services.learning_content.typescript
"""


def _collect() -> dict:
    defs: dict = {}
    for model in (StandardPageContent, VideoPageContent, Flow):
        schema = model.model_json_schema(ref_template="#/$defs/{model}")
        defs.update(schema.pop("$defs", {}))
        defs[model.__name__] = schema
    return defs


def _type(schema: dict) -> str:
    if "$ref" in schema:
        return schema["$ref"].rsplit("/", 1)[-1]
    if "const" in schema:
        return json.dumps(schema["const"])
    if "enum" in schema:
        return " | ".join(json.dumps(value) for value in schema["enum"])
    for key in ("anyOf", "oneOf"):
        if key in schema:
            options = [_type(option) for option in schema[key] if option.get("type") != "null"]
            return " | ".join(dict.fromkeys(options)) or "null"
    kind = schema.get("type")
    if kind == "string":
        return "string"
    if kind in ("number", "integer"):
        return "number"
    if kind == "boolean":
        return "boolean"
    if kind == "array":
        item = _type(schema.get("items") or {})
        return f"Array<{item}>"
    if kind == "object":
        extra = schema.get("additionalProperties")
        return f"Record<string, {_type(extra) if isinstance(extra, dict) else 'any'}>"
    return "any"


def _comment(text: str | None, indent: str = "") -> str:
    if not text:
        return ""
    lines = " ".join(text.replace("``", "`").split())
    return f"{indent}/** {lines} */\n"


def _interface(name: str, schema: dict) -> str:
    if "properties" not in schema:
        return f"{_comment(schema.get('description'))}export type {name} = {_type(schema)}\n"
    required = set(schema.get("required") or [])
    lines = [f"{_comment(schema.get('description'))}export interface {name} {{"]
    for prop, prop_schema in schema["properties"].items():
        key = prop if prop.isidentifier() else json.dumps(prop)
        optional = "" if prop in required else "?"
        lines.append(f"{_comment(prop_schema.get('description'), '  ')}  {key}{optional}: {_type(prop_schema)}")
    if schema.get("additionalProperties") is not False:
        lines.append("  [key: string]: any")
    lines.append("}")
    return "\n".join(lines) + "\n"


def render() -> str:
    defs = _collect()
    body = "\n".join(_interface(name, defs[name]) for name in sorted(defs))
    unions = (
        "\nexport type Block = TextBlock | ImageBlock | ButtonBlock | QuestionBlock | PortfolioPreviewBlock\n"
        "export type Condition = Comparison | AllOf | Negation\n"
    )
    return HEADER + "\n" + body + unions


if __name__ == "__main__":
    OUTPUT.write_text(render(), encoding="utf-8")
    print(f"wrote {OUTPUT}")
