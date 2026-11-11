"""Job titles ending in "-wive" become "-wife" ("Nurse Midwive" -> "Nurse Midwife")

t1j2o3b4t5i6 singularized stored titles by dropping the "s" of "Midwives". The importer now makes it
"Midwife" (titles.py), but careers, pay figures, career resources and jobs in plans that were loaded
before that still say "Midwive". This fixes them in place. It only touches words ending in "wive",
which no occupation title uses on purpose, so running it again changes nothing.

Revision ID: x8w9i0f1e2t3
Revises: w7c8k9p0t1s2
Create Date: 2026-11-11
"""

import json
import re

from alembic import op
import sqlalchemy as sa

revision = "x8w9i0f1e2t3"
down_revision = "w7c8k9p0t1s2"
branch_labels = None
depends_on = None

_WIVE = re.compile(r"\b(\w*w)(ive)\b", re.IGNORECASE)


def fix_title(title):
    """The title with each word ending in "wive" ending in "wife" instead, keeping the letter case."""
    if not isinstance(title, str):
        return title
    return _WIVE.sub(lambda m: m.group(1) + ("IFE" if m.group(2).isupper() else "ife"), title)


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "careerentry" in tables:
        for row_id, title in bind.execute(sa.text("SELECT id, title FROM careerentry WHERE LOWER(title) LIKE '%wive%'")).all():
            new = fix_title(title)
            if new != title:
                bind.execute(sa.text("UPDATE careerentry SET title = :t WHERE id = :i"), {"t": new, "i": row_id})
    # Career resources are filed under the career's title, in every org that added them.
    if "resource" in tables:
        for row_id, title in bind.execute(sa.text(
                "SELECT id, title FROM resource WHERE LOWER(CAST(resource_type AS TEXT)) = 'career' AND LOWER(title) LIKE '%wive%'")).all():
            new = fix_title(title)
            if new != title:
                bind.execute(sa.text("UPDATE resource SET title = :t WHERE id = :i"), {"t": new, "i": row_id})
    if "resourcesearchdocument" in tables:
        for title in [r[0] for r in bind.execute(sa.text(
                "SELECT DISTINCT title FROM resourcesearchdocument WHERE LOWER(resource_type) = 'career' AND LOWER(title) LIKE '%wive%'")).all()]:
            new = fix_title(title)
            if new != title:
                bind.execute(sa.text("UPDATE resourcesearchdocument SET title = :new WHERE title = :old AND LOWER(resource_type) = 'career'"), {"new": new, "old": title})
    if "estimatefact" in tables:
        for label in [r[0] for r in bind.execute(sa.text(
                "SELECT DISTINCT label FROM estimatefact WHERE metric = 'wage' AND LOWER(label) LIKE '%wive%'")).all()]:
            new = fix_title(label)
            if new != label:
                bind.execute(sa.text("UPDATE estimatefact SET label = :new WHERE metric = 'wage' AND label = :old"), {"new": new, "old": label})
    # Jobs already in people's plans: the occupation names they picked.
    if "lifeplan" in tables:
        for row_id, raw in bind.execute(sa.text("SELECT id, document FROM lifeplan")).all():
            doc = json.loads(raw) if isinstance(raw, str) else raw
            if not isinstance(doc, dict) or not fix_plan(doc):
                continue
            bind.execute(sa.text("UPDATE lifeplan SET document = :d WHERE id = :i"), {"d": json.dumps(doc), "i": row_id})


def fix_plan(doc: dict) -> bool:
    changed = False
    for phase in doc.get("phases") or []:
        if not isinstance(phase, dict):
            continue
        for line in phase.get("lines") or []:
            st = line.get("settings") if isinstance(line, dict) else None
            old = st.get("soc_title") if isinstance(st, dict) else None
            if isinstance(old, str) and fix_title(old) != old:
                if line.get("title") == old:
                    line["title"] = fix_title(old)
                st["soc_title"] = fix_title(old)
                changed = True
        for act in phase.get("activities") or []:
            old = act.get("career_title") if isinstance(act, dict) else None
            if isinstance(old, str) and fix_title(old) != old:
                act["career_title"] = fix_title(old)
                changed = True
    return changed


def downgrade() -> None:
    # "Midwive" was never right; nothing to put back.
    pass
