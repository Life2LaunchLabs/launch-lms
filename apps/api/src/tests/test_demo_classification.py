"""Every table has a deliberate demo policy, so a new feature can't publish empty."""

from sqlalchemy import JSON, Column, ForeignKey, Integer, MetaData, String, Table
from sqlmodel import SQLModel

from src.core.events.database import import_all_models
from src.services.demo import checkpoints, copy
from src.services.demo.scenario import exclude_real_users


def test_every_table_has_exactly_one_demo_policy():
    import_all_models()
    tables = SQLModel.metadata.tables
    missing = checkpoints.unclassified(tables)
    assert not missing, (
        "New tables need a demo policy in services/demo/checkpoints.py "
        f"(CONTENT, PERSONAL, CHILDREN, CONNECT, REFERENCE or FORBIDDEN): {sorted(missing)}"
    )
    seen: dict[str, int] = {}
    for policy in checkpoints.CLASSIFIED:
        for name in policy:
            seen[name] = seen.get(name, 0) + 1
    assert not [name for name, count in seen.items() if count > 1]
    # A stale name would hide a renamed table.
    assert not set(seen) - set(tables)


def test_child_tables_name_the_parent_they_follow():
    import_all_models()
    tables = SQLModel.metadata.tables
    children = (
        checkpoints.CHILDREN
        | (checkpoints.CONNECT - {"conversation"})
        | copy.CHILD_TABLES
        | copy.CONVERSATION_CHILDREN
    )
    for name in children:
        anchor = checkpoints.ANCHORS.get(name)
        assert anchor and tables[name].c[anchor].foreign_keys, name
    # The visitor copy is what the Studio account copy draws from.
    assert set(copy.COPYABLE) - {"goal", "plancollaborator"} <= (
        checkpoints.PERSONAL | checkpoints.CHILDREN
    )


def test_life_plan_and_portfolio_records_are_published():
    for name in ("lifeplan", "planweeklyfocus"):
        assert name in checkpoints.PERSONAL and name in copy.OWNED
    for name in (
        "portfolioresult",
        "portfolioperson",
        "portfolioquote",
        "portfoliocontact",
        "portfoliocredential",
        "portfoliodocument",
        "portfolioimport",
        "resumeversion",
    ):
        assert name in checkpoints.CHILDREN and name in copy.CHILD_TABLES


def test_chats_with_anyone_outside_the_cohort_never_copy():
    metadata = MetaData()
    Table("user", metadata, Column("id", Integer, primary_key=True), Column("email", String), Column("user_uuid", String))
    Table("conversation", metadata, Column("id", Integer, primary_key=True), Column("direct_key", String))
    Table(
        "conversationmember",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("conversation_id", Integer, ForeignKey("conversation.id"), nullable=False),
        Column("user_id", Integer, ForeignKey("user.id"), nullable=False),
    )
    Table(
        "conversationmessage",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("conversation_id", Integer, ForeignKey("conversation.id"), nullable=False),
        Column("sender_user_id", Integer, ForeignKey("user.id"), nullable=True),
        Column("body", String),
        Column("card", JSON),
    )
    rows = {name: {} for name in metadata.tables}
    rows["user"] = {
        (2,): {"id": 2, "email": "maya@example.com", "user_uuid": "user_maya"},
        (3,): {"id": 3, "email": "sam@example.com", "user_uuid": "user_sam"},
        (99,): {"id": 99, "email": "real@example.com", "user_uuid": "user_real"},
    }
    # 1: Maya and Sam (both fictional). 2: Maya and a real person.
    rows["conversation"] = {(1,): {"id": 1, "direct_key": "2:3"}, (2,): {"id": 2, "direct_key": "2:99"}}
    rows["conversationmember"] = {
        (1,): {"id": 1, "conversation_id": 1, "user_id": 2},
        (2,): {"id": 2, "conversation_id": 1, "user_id": 3},
        (3,): {"id": 3, "conversation_id": 2, "user_id": 2},
        (4,): {"id": 4, "conversation_id": 2, "user_id": 99},
    }
    rows["conversationmessage"] = {
        (1,): {"id": 1, "conversation_id": 1, "sender_user_id": 2, "body": "Want to study?", "card": None},
        (2,): {"id": 2, "conversation_id": 1, "sender_user_id": None, "body": "Sam joined", "card": {"user_id": 3}},
        (3,): {"id": 3, "conversation_id": 2, "sender_user_id": 2, "body": "Hi coach", "card": None},
        (4,): {"id": 4, "conversation_id": 2, "sender_user_id": 99, "body": "Real reply", "card": None},
        # A former member who left: their words never copy, even in a fictional chat.
        (5,): {"id": 5, "conversation_id": 1, "sender_user_id": 99, "body": "Real words", "card": None},
    }
    exclude_real_users(rows, metadata.tables, {2, 3})
    assert list(rows["conversation"]) == [(1,)]
    assert sorted(rows["conversationmember"]) == [(1,), (2,)]
    assert sorted(row["body"] for row in rows["conversationmessage"].values()) == ["Sam joined", "Want to study?"]
