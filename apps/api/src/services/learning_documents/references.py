"""Rewrite page references inside activity settings and page payloads.

Pages are referenced in several shapes: a bare uuid (flow ``page_uuid``,
button ``revisit_page_uuid``, variant ``source.page_uuid``), a prefixed node
id (``page:<uuid>``, ``answer:<uuid>.…``) and an answer path whose first segment
is the page uuid (``<uuid>.result.questions.<block>.option_ids``). A plain
equality swap misses the last two, so every string is rewritten where a known
id appears at the start of the string or right after a colon, and ends the
string or is followed by a dot.
"""

from __future__ import annotations

import re
from typing import Any


def rewrite_page_references(value: Any, replacements: dict[str, str]) -> Any:
    if not replacements:
        return value
    alternatives = "|".join(
        re.escape(key) for key in sorted(replacements, key=len, reverse=True)
    )
    pattern = re.compile(rf"(?<![^:])({alternatives})(?=$|\.)")

    def rewrite(item: Any) -> Any:
        if isinstance(item, dict):
            return {key: rewrite(child) for key, child in item.items()}
        if isinstance(item, list):
            return [rewrite(child) for child in item]
        if isinstance(item, str):
            return pattern.sub(lambda match: replacements[match.group(1)], item)
        return item

    return rewrite(value)

