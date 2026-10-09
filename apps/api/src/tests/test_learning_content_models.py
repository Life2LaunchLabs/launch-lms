"""The typed content models validate pages and flows and generate the web types."""

import pytest

from src.services.learning_content import typescript
from src.services.learning_content.models import Flow, StandardPageContent, content_error
from src.services.learning_flow import FlowValidationError, linear_flow, validate_flow


def _page(*blocks, **extra):
    return {"version": 2, "blocks": list(blocks), **extra}


def test_generated_typescript_is_current():
    assert typescript.OUTPUT.read_text(encoding="utf-8") == typescript.render(), (
        "Regenerate: cd apps/api && uv run python -m src.services.learning_content.typescript"
    )


@pytest.mark.parametrize(
    ("content", "message"),
    [
        (_page({"id": "a", "type": "video"}), "does not match any of the expected tags"),
        (_page({"id": "a", "type": "text", "colour": "red"}), "Extra inputs are not permitted"),
        (_page({"id": "a", "type": "text"}, {"id": "a", "type": "image"}), "Block ids must be unique"),
        (_page({"id": "b", "type": "button", "content": {"label": "Go", "destination_page_uuid": "p"}}), "flow edges"),
        (_page({"id": "b", "type": "button", "content": {"action": "revisit"}}), "continue along the flow or revisit"),
        (_page({"id": "i", "type": "image", "content": {"binding": {"source": "answer", "path": "../x"}}}), "unsupported source or path"),
        (_page({"id": "q", "type": "question", "kind": "essay"}), "kind"),
        (_page({"id": "q", "type": "question", "kind": "text_input"}, variants={"overrides": {}}), "cannot contain a question"),
    ],
)
def test_invalid_content_is_rejected_with_a_useful_message(content, message):
    error = content_error(StandardPageContent, content)
    assert error and message in error, error


def test_text_bindings_are_checked_inside_tiptap_nodes():
    bad = {"type": "paragraph", "content": [{"type": "displayBinding", "attrs": {"binding": {"source": "secret", "path": "x"}}}]}
    assert "unsupported source" in content_error(StandardPageContent, _page({"id": "t", "type": "text", "content": {"nodes": [bad]}}))
    good = {"type": "paragraph", "content": [{"type": "displayBinding", "attrs": {"binding": {"source": "answer", "path": ""}}}]}
    assert content_error(StandardPageContent, _page({"id": "t", "type": "text", "content": {"nodes": [good]}})) is None


def test_flow_shape_is_checked_before_graph_rules():
    flow = linear_flow(["p1", "p2"])
    assert content_error(Flow, flow) is None
    flow["edges"][0]["condition"] = {"op": "matches", "left": {"source": "answer", "key": "p1.button"}, "right": "x"}
    with pytest.raises(FlowValidationError, match="Invalid flow"):
        validate_flow(flow, {"p1", "p2"}, set())
