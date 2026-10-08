"""Deep-copy one account's own work onto another live account.

Copies what belongs to the person (portfolio, badge runs and awards, plans,
saved resources, media and, optionally, coach conversations) with fresh row ids
and identifiers. Shared content they reference (badges, resources, programs)
is linked, not duplicated. Inbox messages and other people's work never copy.
"""

import json
import re
from collections import defaultdict
from uuid import uuid4

from sqlalchemy import select
from sqlmodel import Session, SQLModel

from src.services.demo.checkpoints import ANCHORS

OWNED = {
    "portfolio": "user_id",
    "learningrun": "user_id",
    "learningresponseattempt": "user_id",
    "learningbadgeaward": "user_id",
    "badgeissuerlearnerlink": "user_id",
    "objectiveprogress": "user_id",
    "programparticipant": "user_id",
    "requirementenrollment": "user_id",
    "usersavedresource": "user_id",
    "userresourcechannel": "user_id",
    "resourcenoteblock": "user_id",
    "mediaasset": "owner_user_id",
    "mediafolder": "owner_user_id",
    "usergroupuser": "user_id",
}
CONVERSATIONS = {
    "hubconversation": "user_id",
    "hubmemory": "user_id",
    "hubmemorypreference": "user_id",
    "hubeditrun": "user_id",
}
CHILD_TABLES = frozenset(
    """
learningactivityrun learningpageprogress usersavedresourcechannel portfoliosection
projectitem projectitemblock timelineentry timelineentryblock timelineprojectlink
portfoliolink profiletrait planrole planphase planobjective planobjectiveprogress
planattachment planactivity requirementattainmentsource
""".split()
)
CONVERSATION_CHILDREN = frozenset(
    """
hubconversationmessage hubconversationmessageresource hubconversationresource
hubmemorysource hubconversationmessagememory hubeditrunevent hubeditobjectstate
""".split()
)
COPYABLE = (
    frozenset(OWNED)
    | frozenset(CONVERSATIONS)
    | CHILD_TABLES
    | CONVERSATION_CHILDREN
    | {"plan", "plancollaborator"}
)
# Rows tied to an organization only make sense where the copy is also a member.
ORG_SCOPED = frozenset(
    """
objectiveprogress programparticipant requirementenrollment userresourcechannel
usergroupuser hubconversation hubmemory hubmemorypreference hubeditrun
""".split()
)


def _own_identifier_columns(table) -> set[str]:
    """`*_uuid` columns that identify the row itself (unique), not a reference."""
    single = {
        next(iter(constraint.columns)).name
        for constraint in table.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
        and len(constraint.columns) == 1
    }
    return {
        column.name
        for column in table.c
        if column.name.endswith("_uuid") and (column.unique or column.name in single)
    }


def _fresh(value: str) -> str:
    prefix = value.split("_", 1)[0] if "_" in value else ""
    return f"{prefix}_{uuid4()}" if prefix and prefix != value else str(uuid4())


def _order(names: set[str], tables) -> list[str]:
    """Parents before children among the copied tables."""
    remaining, ordered = set(names), []
    while remaining:
        ready = sorted(
            name
            for name in remaining
            if not any(
                fk.column.table.name in remaining and fk.column.table.name != name
                for column in tables[name].c
                for fk in column.foreign_keys
            )
        )
        if not ready:  # Cycles do not exist today; fall back to a stable order.
            ready = sorted(remaining)
        ordered.extend(ready)
        remaining -= set(ready)
    return ordered


def collect(
    db: Session, source_id: int, org_ids: set[int], conversations: bool
) -> dict[str, list[dict]]:
    tables = SQLModel.metadata.tables
    rows: dict[str, dict] = defaultdict(dict)

    def add(name, condition):
        for record in db.execute(select(tables[name]).where(condition)).mappings():
            rows[name][record["id"]] = dict(record)

    owned = {**OWNED, **(CONVERSATIONS if conversations else {})}
    for name, column in owned.items():
        table = tables[name]
        condition = table.c[column] == source_id
        if name in ORG_SCOPED and "org_id" in table.c:
            condition &= table.c.org_id.in_(org_ids)
        add(name, condition)
    plan = tables["plan"]
    add(
        "plan",
        (plan.c.subject_user_id == source_id) | (plan.c.owner_user_id == source_id),
    )
    collaborator = tables["plancollaborator"]
    if rows["plan"]:
        add(
            "plancollaborator",
            collaborator.c.plan_id.in_(list(rows["plan"]))
            & (collaborator.c.user_id == source_id),
        )
    children = CHILD_TABLES | (CONVERSATION_CHILDREN if conversations else frozenset())
    for _ in range(len(children) + 1):
        before = sum(map(len, rows.values()))
        for name in children:
            anchor = ANCHORS.get(name)
            table = tables[name]
            if not anchor or anchor not in table.c:
                continue
            parent = next(iter(table.c[anchor].foreign_keys)).column.table.name
            if rows.get(parent):
                add(name, table.c[anchor].in_(list(rows[parent])))
        if sum(map(len, rows.values())) == before:
            break
    return {name: list(records.values()) for name, records in rows.items() if records}


def copy_rows(
    db: Session, rows: dict[str, list[dict]], source, target
) -> dict[str, int]:
    tables = SQLModel.metadata.tables
    # Fresh identifiers first, so string references inside JSON/HTML follow them.
    strings = {source.user_uuid: target.user_uuid}
    for name, records in rows.items():
        own = _own_identifier_columns(tables[name])
        for record in records:
            for column in own:
                if isinstance(record.get(column), str) and record[column]:
                    strings.setdefault(record[column], _fresh(record[column]))
    pattern = (
        re.compile(
            "|".join(re.escape(key) for key in sorted(strings, key=len, reverse=True))
        )
        if strings
        else None
    )

    def rewrite(value):
        if isinstance(value, str) and pattern:
            return pattern.sub(lambda match: strings[match.group(0)], value)
        if isinstance(value, (dict, list)):
            return json.loads(rewrite(json.dumps(value)))
        return value

    ids: dict[str, dict[int, int]] = defaultdict(dict)
    counts: dict[str, int] = {}
    for name in _order(set(rows), tables):
        table = tables[name]
        for record in rows[name]:
            values = {}
            drop = False
            for column in table.c:
                if column.primary_key:
                    continue
                value = record[column.name]
                for fk in column.foreign_keys:
                    parent = fk.column.table.name
                    if value is None:
                        break
                    if parent == "user":
                        value = target.id if value == source.id else value
                    elif parent in COPYABLE:
                        # Never point the copy at the source person's own rows.
                        value = ids[parent].get(value)
                        if value is None and not column.nullable:
                            drop = True
                    break
                values[column.name] = rewrite(value)
            if drop:
                continue
            if name == "plan" and values.get("slug"):
                values["slug"] = f"{values['slug'][:80]}-{uuid4().hex[:6]}"
            new_id = db.execute(
                table.insert().values(**values).returning(table.c.id)
            ).scalar_one()
            ids[name][record["id"]] = new_id
            counts[name] = counts.get(name, 0) + 1
    return counts


def copy_account(
    db: Session, source, target, org_ids: set[int], conversations: bool = False
) -> dict[str, int]:
    """Copy rows inside the caller's transaction; files are the caller's job."""
    return copy_rows(db, collect(db, source.id, org_ids, conversations), source, target)
