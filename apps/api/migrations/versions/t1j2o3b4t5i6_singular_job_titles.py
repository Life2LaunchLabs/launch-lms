"""Job titles in the singular: careers, pay figures and career resources ("Barista", not "Baristas")

Revision ID: t1j2o3b4t5i6
Revises: s9h0m1e2b3a4
Create Date: 2026-11-08
"""

import json
import re

from alembic import op
import sqlalchemy as sa

revision = "t1j2o3b4t5i6"
down_revision = "s9h0m1e2b3a4"
branch_labels = None
depends_on = None

# A frozen copy of src/services/life_plans/titles.py, so this migration keeps doing what it did.
# Words that end in "s" but are already singular (or have no singular) at the end of a job title.
_KEEP = {"police", "personnel", "staff", "clergy", "series", "news", "sales", "logistics", "athletics", "aerobics",
         "bus", "gas", "status", "campus", "chorus", "census", "corps", "us", "this", "his"}
_IRREGULAR = {"people": "person", "men": "man", "women": "woman", "children": "child", "fishermen": "fisherman",
              "firemen": "fireman", "chairmen": "chairman", "foremen": "foreman", "craftsmen": "craftsman"}
_STOPS = re.compile(r"(,?\s+Except\b|,?\s+Including\b|\s+of\s+|\s+for\s+|\s+\()")
_PARTS = re.compile(r"(,\s+and\s+|,\s+or\s+|\s+and\s+|\s+or\s+|,\s+|/)")


def _word(w: str) -> str:
    low = w.lower()
    if low in _IRREGULAR:
        out = _IRREGULAR[low]
        return out.capitalize() if w[:1].isupper() else out
    if low.endswith("men") and len(low) > 4:
        return w[:-3] + ("man" if w[-3:].islower() else "MAN")
    if len(low) < 4 or low in _KEEP or not low.endswith("s") or low.endswith(("ss", "us", "is", "'s")):
        return w
    if low.endswith("ies"):
        return w[:-3] + "y"
    if low.endswith(("sses", "ches", "shes", "xes", "zes")):
        return w[:-2]
    return w[:-1]


def singular_title(title: str | None) -> str:
    """The singular of an occupation title; a title that is already singular comes back as it was."""
    t = (title or "").strip()
    if not t:
        return t
    m = _STOPS.search(t)
    head, tail = (t[:m.start()], t[m.start():]) if m else (t, "")
    bits = _PARTS.split(head)
    changed = False
    out: list[str] = []
    for i, bit in enumerate(bits):
        if i % 2 == 1:  # a separator
            if changed and bit.strip() in ("and", ", and"):
                bit = bit.replace("and", "or")
            out.append(bit)
            continue
        words = bit.split(" ")
        last = _word(words[-1]) if words and words[-1] else (words[-1] if words else "")
        changed = bool(words) and last != words[-1]
        if words:
            words[-1] = last
        out.append(" ".join(words))
    return "".join(out) + tail


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "careerentry" in tables:
        renamed: dict[str, str] = {}
        for row_id, title in bind.execute(sa.text("SELECT id, title FROM careerentry")).all():
            new = singular_title(title)
            if new != title:
                bind.execute(sa.text("UPDATE careerentry SET title = :t WHERE id = :i"), {"t": new, "i": row_id})
                renamed[title] = new
        # Career resources were filed under the career's title.
        if "resource" in tables:
            for old, new in renamed.items():
                bind.execute(sa.text("UPDATE resource SET title = :new WHERE title = :old AND CAST(resource_type AS TEXT) ILIKE 'career'"), {"new": new, "old": old})
                if "resourcesearchdocument" in tables:
                    bind.execute(sa.text("UPDATE resourcesearchdocument SET title = :new WHERE title = :old AND resource_type ILIKE 'career'"), {"new": new, "old": old})
    if "estimatefact" in tables:
        for label in [r[0] for r in bind.execute(sa.text("SELECT DISTINCT label FROM estimatefact WHERE metric = 'wage'")).all()]:
            new = singular_title(label)
            if new != label:
                bind.execute(sa.text("UPDATE estimatefact SET label = :new WHERE metric = 'wage' AND label = :old"), {"new": new, "old": label})


    # Jobs already in people's plans: the occupation names they picked.
    if "lifeplan" in tables:
        for row_id, raw in bind.execute(sa.text("SELECT id, document FROM lifeplan")).all():
            doc = json.loads(raw) if isinstance(raw, str) else raw
            if not isinstance(doc, dict) or not _fix_plan(doc):
                continue
            bind.execute(sa.text("UPDATE lifeplan SET document = :d WHERE id = :i"), {"d": json.dumps(doc), "i": row_id})


def _fix_plan(doc: dict) -> bool:
    changed = False
    for phase in doc.get("phases") or []:
        for line in phase.get("lines") or []:
            st = line.get("settings") or {}
            old = st.get("soc_title")
            if isinstance(old, str) and singular_title(old) != old:
                new = singular_title(old)
                if line.get("title") == old:
                    line["title"] = new
                st["soc_title"] = new
                changed = True
        for act in phase.get("activities") or []:
            old = act.get("career_title") if isinstance(act, dict) else None
            if isinstance(old, str) and singular_title(old) != old:
                act["career_title"] = singular_title(old)
                changed = True
    return changed


def downgrade() -> None:
    # The plural titles come back with the next import of the source data.
    pass
