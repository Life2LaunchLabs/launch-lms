"""Builders and converters for the block-based learning page content model.

Standard pages store `content = {"version": 2, "blocks": [...], "variants": {...}}`.
Blocks are `{"id", "type": "text"|"image"|"question", "design": {...}, ...}`.
This module is the single source of truth for producing that shape from the
legacy page types (info / multiple_choice / text_input / question_response),
shared by the course migration, package import, and the alembic data migration
(which inlines copies of these helpers).
"""

from copy import deepcopy
from uuid import uuid4

STANDARD_CONTENT_VERSION = 2

LEGACY_PAGE_TYPES = {"info", "multiple_choice", "text_input", "question_response"}
QUESTION_KINDS = {"multiple_choice", "text_input"}
RESERVED_VARIANT_KEYS = {"correct", "incorrect"}
PAGE_TYPE_ALIASES = {
    "INFO": "info",
    "MULTIPLE_CHOICE": "multiple_choice",
    "TEXT_INPUT": "text_input",
    "QUESTION_RESPONSE": "question_response",
    "VIDEO": "video",
    "STANDARD": "standard",
}


def normalize_page_type(page_type: str) -> str:
    raw = str(page_type or "").strip()
    return PAGE_TYPE_ALIASES.get(raw, raw.lower())


def make_block_id() -> str:
    return f"blk_{uuid4().hex[:8]}"


def text_block(node: dict, design: dict | None = None, block_id: str | None = None) -> dict:
    return {
        "id": block_id or make_block_id(),
        "type": "text",
        "design": design or {},
        "content": {"node": node},
    }


def image_block(src: str = "", alt: str = "", height: int | None = None, design: dict | None = None, block_id: str | None = None) -> dict:
    block_design = dict(design or {})
    if height is not None:
        block_design["height"] = height
    return {
        "id": block_id or make_block_id(),
        "type": "image",
        "design": block_design,
        "content": {"src": src or "", "alt": alt or ""},
    }


def question_block(
    kind: str,
    content: dict,
    block_id: str | None = None,
    scoring: dict | None = None,
    completion: dict | None = None,
) -> dict:
    block = {
        "id": block_id or make_block_id(),
        "type": "question",
        "kind": kind,
        "design": {},
        "content": content or {},
    }
    if scoring is not None:
        block["scoring"] = scoring
    if completion is not None:
        block["completion"] = completion
    return block


def paragraph_node(text: str) -> dict:
    if not text:
        return {"type": "paragraph"}
    return {"type": "paragraph", "content": [{"type": "text", "text": str(text)}]}


def heading_node(text: str, level: int = 1) -> dict:
    node: dict = {"type": "heading", "attrs": {"level": level}}
    if text:
        node["content"] = [{"type": "text", "text": str(text)}]
    return node


def find_question_block(content: dict | None) -> dict | None:
    blocks = find_question_blocks(content)
    return blocks[0] if blocks else None


def find_question_blocks(content: dict | None) -> list[dict]:
    return [
        block
        for block in (content or {}).get("blocks") or []
        if isinstance(block, dict) and block.get("type") == "question"
    ]


def iter_block_stacks(content: dict | None):
    """Yield every blocks array in a standard page: default + all variant overrides."""
    content = content or {}
    blocks = content.get("blocks")
    if isinstance(blocks, list):
        yield blocks
    overrides = ((content.get("variants") or {}).get("overrides")) or {}
    if isinstance(overrides, dict):
        for override in overrides.values():
            override_blocks = (override or {}).get("blocks") if isinstance(override, dict) else None
            if isinstance(override_blocks, list):
                yield override_blocks


def _question_content_from_legacy(page_type: str, content: dict) -> dict:
    if page_type == "multiple_choice":
        return {"options": deepcopy(content.get("options") or [])}
    return {"inputs": deepcopy(content.get("inputs") or [])}


def _rich_text_nodes(content: dict) -> list[dict]:
    rich_text = content.get("rich_text")
    if isinstance(rich_text, dict) and isinstance(rich_text.get("content"), list):
        return rich_text["content"]
    return []


def _node_has_text(node: dict) -> bool:
    if node.get("text"):
        return True
    return any(_node_has_text(child) for child in node.get("content") or [] if isinstance(child, dict))


def rich_text_nodes_to_blocks(nodes: list[dict], question_factory=None) -> list[dict]:
    """Convert legacy tiptap top-level nodes into blocks.

    `question_factory` builds the question block for a `learningQuestion` node;
    it is called at most once (legacy pages only ever had one question node).
    """
    blocks: list[dict] = []
    question_added = False
    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_type = node.get("type")
        if node_type == "learningImage":
            attrs = node.get("attrs") or {}
            height = attrs.get("height")
            blocks.append(image_block(src=str(attrs.get("src") or ""), height=int(height) if height else None))
        elif node_type == "learningQuestion":
            if question_factory and not question_added:
                blocks.append(question_factory())
                question_added = True
        else:
            blocks.append(text_block(deepcopy(node)))
    if question_factory and not question_added:
        blocks.append(question_factory())
    return blocks


def _fallback_text_blocks(content: dict) -> list[dict]:
    blocks: list[dict] = []
    heading = str(content.get("heading") or content.get("prompt") or "").strip()
    body = str(content.get("body") or "").strip()
    if heading:
        blocks.append(text_block(heading_node(heading)))
    if body:
        blocks.append(text_block(paragraph_node(body)))
    return blocks


def convert_legacy_page(page_type: str, content: dict | None) -> tuple[str, dict]:
    """Convert a legacy page (type + content) to ('video'|'standard', new content)."""
    page_type = normalize_page_type(page_type)
    content = deepcopy(content or {})
    if page_type == "video":
        return "video", content
    if page_type not in LEGACY_PAGE_TYPES:
        # Already-converted standard pages pass through untouched.
        return page_type, content

    question_factory = None
    if page_type in QUESTION_KINDS:
        question_factory = lambda: question_block(page_type, _question_content_from_legacy(page_type, content))  # noqa: E731

    nodes = _rich_text_nodes(content)
    if nodes:
        blocks = rich_text_nodes_to_blocks(nodes, question_factory)
    else:
        blocks = _fallback_text_blocks(content)
        if question_factory:
            blocks.append(question_factory())

    new_content: dict = {"version": STANDARD_CONTENT_VERSION, "blocks": blocks}
    if page_type == "question_response":
        variants = _convert_question_response_variants(content)
        if variants:
            new_content["variants"] = variants
    return "standard", new_content


def _convert_question_response_variants(content: dict) -> dict | None:
    linked_page_uuid = content.get("linked_page_uuid") or content.get("linkedPageUuid")
    raw_variants = content.get("response_variants") or {}
    overrides: dict = {}
    if isinstance(raw_variants, dict):
        for key, variant in raw_variants.items():
            if key == "default" or not isinstance(variant, dict):
                continue
            if not variant.get("enabled"):
                continue
            variant_nodes = _rich_text_nodes(variant)
            if not variant_nodes:
                continue
            overrides[str(key)] = {"blocks": rich_text_nodes_to_blocks(variant_nodes)}
    if not linked_page_uuid and not overrides:
        return None
    variants: dict = {"overrides": overrides}
    if linked_page_uuid:
        variants["source"] = {"page_uuid": str(linked_page_uuid)}
    return variants


def link_variant_sources_to_question_blocks(pages: list[dict]) -> None:
    """Fill variants.source.block_id from the source page's question block.

    `pages` are dicts with at least `page_uuid` and `content`, already converted.
    Mutates in place.
    """
    question_block_by_page = {
        page["page_uuid"]: find_question_block(page.get("content"))
        for page in pages
    }
    for page in pages:
        variants = (page.get("content") or {}).get("variants") or {}
        source = variants.get("source") or {}
        source_uuid = source.get("page_uuid")
        if not source_uuid or source.get("block_id"):
            continue
        source_question = question_block_by_page.get(source_uuid)
        if source_question:
            source["block_id"] = source_question.get("id")
