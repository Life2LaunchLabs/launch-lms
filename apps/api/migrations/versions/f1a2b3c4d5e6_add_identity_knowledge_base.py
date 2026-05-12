"""add identity knowledge base

Revision ID: f1a2b3c4d5e6
Revises: e6f7g8h9i0j1
Create Date: 2026-05-08
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e6f7g8h9i0j1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TAXONOMY_ROWS = [
    (1, "inner_world", None, "Inner World", "Personal aspects that make you unique.", "domain", 10),
    (2, "inner_world.personal_drivers", 1, "Personal Drivers", "Dreams, interests, culture, and values.", "category", 20),
    (3, "inner_world.personal_drivers.dreams_ambitions", 2, "Dreams & Ambitions", "Future hopes, goals, and motivating possibilities.", "driver", 30),
    (4, "inner_world.personal_drivers.hobbies_interests", 2, "Hobbies & Interests", "Activities, topics, and curiosities that draw your attention.", "driver", 40),
    (5, "inner_world.personal_drivers.culture_values", 2, "Culture & Values", "Values, beliefs, traditions, and identity anchors.", "driver", 50),
    (6, "inner_world.personal_operating_system", 1, "Personal Operating System", "The inner systems that shape daily experience.", "category", 60),
    (7, "inner_world.personal_operating_system.mind", 6, "Mind", "Learning, attention, memory, emotion, and thought patterns.", "system", 70),
    (8, "inner_world.personal_operating_system.body", 6, "Body", "Energy, health, sensory needs, sleep, and physical wellbeing.", "system", 80),
    (9, "inner_world.personal_operating_system.inner_compass", 6, "Inner Compass", "Self-trust, decision-making, purpose, and direction.", "system", 90),
    (10, "outer_world", None, "Outer World", "Skills and tools used to interact with the world.", "domain", 100),
    (11, "outer_world.executive_function", 10, "Executive Function", "Planning, organization, initiation, time, and follow-through.", "skill", 110),
    (12, "outer_world.daily_living", 10, "Daily Living", "Home, money, transportation, routines, and self-management.", "skill", 120),
    (13, "outer_world.relational", 10, "Relational Skills", "Communication, connection, boundaries, and collaboration.", "skill", 130),
    (14, "outer_world.interest_based", 10, "Interest-Based Skills", "Skills developed through interests, projects, and practice.", "skill", 140),
    (15, "outer_world.academic", 10, "Academic Skills", "Study, school navigation, credentials, and learning strategies.", "skill", 150),
    (16, "target_lifestyle", None, "Target Lifestyle", "The life you are intentionally designing toward.", "domain", 200),
    (17, "target_lifestyle.environment", 16, "Environment", "The places, spaces, and sensory conditions that help you thrive.", "lifestyle", 210),
    (18, "target_lifestyle.relationships", 16, "Relationships", "The people, communities, and support patterns you want around you.", "lifestyle", 220),
    (19, "target_lifestyle.purpose", 16, "Purpose", "The contribution, meaning, and direction you want your life to hold.", "lifestyle", 230),
    (20, "target_lifestyle.rhythms", 16, "Rhythms", "The routines, pacing, seasons, and rituals that make life workable.", "lifestyle", 240),
    (21, "target_lifestyle.health", 16, "Health", "The wellbeing foundations that support your energy and capacity.", "lifestyle", 250),
]


def upgrade() -> None:
    op.create_table(
        "lifeframeworknode",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("node_type", sa.String(), nullable=False, server_default="category"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.ForeignKeyConstraint(["parent_id"], ["lifeframeworknode.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key", name="uq_lifeframeworknode_key"),
    )
    op.create_index("ix_lifeframeworknode_key", "lifeframeworknode", ["key"])
    op.create_index("ix_lifeframeworknode_parent_id", "lifeframeworknode", ["parent_id"])
    op.create_index("ix_lifeframeworknode_node_type", "lifeframeworknode", ["node_type"])

    op.bulk_insert(
        sa.table(
            "lifeframeworknode",
            sa.column("id", sa.Integer),
            sa.column("key", sa.String),
            sa.column("parent_id", sa.Integer),
            sa.column("title", sa.String),
            sa.column("description", sa.Text),
            sa.column("node_type", sa.String),
            sa.column("sort_order", sa.Integer),
            sa.column("is_active", sa.Boolean),
            sa.column("creation_date", sa.String),
            sa.column("update_date", sa.String),
        ),
        [
            {
                "id": row[0],
                "key": row[1],
                "parent_id": row[2],
                "title": row[3],
                "description": row[4],
                "node_type": row[5],
                "sort_order": row[6],
                "is_active": True,
                "creation_date": "2026-05-08T00:00:00+00:00",
                "update_date": "2026-05-08T00:00:00+00:00",
            }
            for row in TAXONOMY_ROWS
        ],
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("SELECT setval(pg_get_serial_sequence('lifeframeworknode', 'id'), (SELECT max(id) FROM lifeframeworknode))")

    op.create_table(
        "contentframeworktag",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("content_uuid", sa.String(), nullable=False),
        sa.Column("framework_node_id", sa.Integer(), nullable=False),
        sa.Column("relevance", sa.Float(), nullable=False, server_default="1"),
        sa.Column("intent", sa.String(), nullable=False, server_default="supports"),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.ForeignKeyConstraint(["framework_node_id"], ["lifeframeworknode.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_id", "content_type", "content_uuid", "framework_node_id", name="uq_contentframeworktag_org_content_node"),
    )
    op.create_index("ix_contentframeworktag_org_id", "contentframeworktag", ["org_id"])
    op.create_index("ix_contentframeworktag_content_type", "contentframeworktag", ["content_type"])
    op.create_index("ix_contentframeworktag_content_uuid", "contentframeworktag", ["content_uuid"])
    op.create_index("ix_contentframeworktag_framework_node_id", "contentframeworktag", ["framework_node_id"])
    op.create_index("ix_contentframeworktag_intent", "contentframeworktag", ["intent"])

    op.create_table(
        "userknowledgeentry",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("entry_uuid", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("source_type", sa.String(), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=True),
        sa.Column("source_content_type", sa.String(), nullable=True),
        sa.Column("source_content_uuid", sa.String(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("source_url", sa.String(), nullable=True),
        sa.Column("file_url", sa.String(), nullable=True),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("entry_uuid"),
        sa.UniqueConstraint("user_id", "org_id", "source_type", "source_content_uuid", name="uq_userknowledgeentry_user_org_source_content"),
    )
    op.create_index("ix_userknowledgeentry_entry_uuid", "userknowledgeentry", ["entry_uuid"])
    op.create_index("ix_userknowledgeentry_user_id", "userknowledgeentry", ["user_id"])
    op.create_index("ix_userknowledgeentry_org_id", "userknowledgeentry", ["org_id"])
    op.create_index("ix_userknowledgeentry_source_type", "userknowledgeentry", ["source_type"])
    op.create_index("ix_userknowledgeentry_source_id", "userknowledgeentry", ["source_id"])
    op.create_index("ix_userknowledgeentry_source_content_type", "userknowledgeentry", ["source_content_type"])
    op.create_index("ix_userknowledgeentry_source_content_uuid", "userknowledgeentry", ["source_content_uuid"])
    op.create_index("ix_userknowledgeentry_status", "userknowledgeentry", ["status"])

    op.create_table(
        "userknowledgeentrytag",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("entry_id", sa.Integer(), nullable=False),
        sa.Column("framework_node_id", sa.Integer(), nullable=False),
        sa.Column("relevance", sa.Float(), nullable=False, server_default="1"),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.ForeignKeyConstraint(["entry_id"], ["userknowledgeentry.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["framework_node_id"], ["lifeframeworknode.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("entry_id", "framework_node_id", name="uq_userknowledgeentrytag_entry_node"),
    )
    op.create_index("ix_userknowledgeentrytag_entry_id", "userknowledgeentrytag", ["entry_id"])
    op.create_index("ix_userknowledgeentrytag_framework_node_id", "userknowledgeentrytag", ["framework_node_id"])

    op.create_table(
        "userinsight",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("insight_uuid", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("framework_node_id", sa.Integer(), nullable=False),
        sa.Column("insight_type", sa.String(), nullable=False, server_default="general"),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("structured_value", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="confirmed"),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.ForeignKeyConstraint(["framework_node_id"], ["lifeframeworknode.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("insight_uuid"),
    )
    op.create_index("ix_userinsight_insight_uuid", "userinsight", ["insight_uuid"])
    op.create_index("ix_userinsight_user_id", "userinsight", ["user_id"])
    op.create_index("ix_userinsight_org_id", "userinsight", ["org_id"])
    op.create_index("ix_userinsight_framework_node_id", "userinsight", ["framework_node_id"])
    op.create_index("ix_userinsight_insight_type", "userinsight", ["insight_type"])
    op.create_index("ix_userinsight_status", "userinsight", ["status"])

    op.create_table(
        "userinsightevidence",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("insight_id", sa.Integer(), nullable=False),
        sa.Column("entry_id", sa.Integer(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.ForeignKeyConstraint(["entry_id"], ["userknowledgeentry.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["insight_id"], ["userinsight.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("insight_id", "entry_id", name="uq_userinsightevidence_insight_entry"),
    )
    op.create_index("ix_userinsightevidence_insight_id", "userinsightevidence", ["insight_id"])
    op.create_index("ix_userinsightevidence_entry_id", "userinsightevidence", ["entry_id"])

    op.create_table(
        "userframeworkprofile",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("framework_node_id", sa.Integer(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("development_state", sa.String(), nullable=True),
        sa.Column("user_confidence", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.String(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.ForeignKeyConstraint(["framework_node_id"], ["lifeframeworknode.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "org_id", "framework_node_id", name="uq_userframeworkprofile_user_org_node"),
    )
    op.create_index("ix_userframeworkprofile_user_id", "userframeworkprofile", ["user_id"])
    op.create_index("ix_userframeworkprofile_org_id", "userframeworkprofile", ["org_id"])
    op.create_index("ix_userframeworkprofile_framework_node_id", "userframeworkprofile", ["framework_node_id"])
    op.create_index("ix_userframeworkprofile_development_state", "userframeworkprofile", ["development_state"])

    op.execute(
        """
        INSERT INTO userknowledgeentry (
            entry_uuid, user_id, org_id, source_type, source_id, source_content_type,
            source_content_uuid, title, body, source_url, file_url, raw_payload, status,
            creation_date, update_date
        )
        SELECT
            'knowledge_backfill_resource_' || usr.id,
            usr.user_id,
            resource.org_id,
            'resource_outcome',
            resource.id,
            'resource',
            resource.resource_uuid,
            'Outcome from ' || resource.title,
            COALESCE(NULLIF(usr.outcome_text, ''), NULLIF(usr.notes, '')),
            usr.outcome_link,
            usr.outcome_file,
            NULL,
            'active',
            COALESCE(NULLIF(usr.creation_date, ''), '2026-05-08T00:00:00+00:00'),
            COALESCE(NULLIF(usr.update_date, ''), '2026-05-08T00:00:00+00:00')
        FROM usersavedresource usr
        JOIN resource ON resource.id = usr.resource_id
        WHERE
            COALESCE(NULLIF(usr.notes, ''), NULLIF(usr.outcome_text, ''), NULLIF(usr.outcome_link, ''), NULLIF(usr.outcome_file, '')) IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_userframeworkprofile_development_state", table_name="userframeworkprofile")
    op.drop_index("ix_userframeworkprofile_framework_node_id", table_name="userframeworkprofile")
    op.drop_index("ix_userframeworkprofile_org_id", table_name="userframeworkprofile")
    op.drop_index("ix_userframeworkprofile_user_id", table_name="userframeworkprofile")
    op.drop_table("userframeworkprofile")
    op.drop_index("ix_userinsightevidence_entry_id", table_name="userinsightevidence")
    op.drop_index("ix_userinsightevidence_insight_id", table_name="userinsightevidence")
    op.drop_table("userinsightevidence")
    op.drop_index("ix_userinsight_status", table_name="userinsight")
    op.drop_index("ix_userinsight_insight_type", table_name="userinsight")
    op.drop_index("ix_userinsight_framework_node_id", table_name="userinsight")
    op.drop_index("ix_userinsight_org_id", table_name="userinsight")
    op.drop_index("ix_userinsight_user_id", table_name="userinsight")
    op.drop_index("ix_userinsight_insight_uuid", table_name="userinsight")
    op.drop_table("userinsight")
    op.drop_index("ix_userknowledgeentrytag_framework_node_id", table_name="userknowledgeentrytag")
    op.drop_index("ix_userknowledgeentrytag_entry_id", table_name="userknowledgeentrytag")
    op.drop_table("userknowledgeentrytag")
    op.drop_index("ix_userknowledgeentry_status", table_name="userknowledgeentry")
    op.drop_index("ix_userknowledgeentry_source_content_uuid", table_name="userknowledgeentry")
    op.drop_index("ix_userknowledgeentry_source_content_type", table_name="userknowledgeentry")
    op.drop_index("ix_userknowledgeentry_source_id", table_name="userknowledgeentry")
    op.drop_index("ix_userknowledgeentry_source_type", table_name="userknowledgeentry")
    op.drop_index("ix_userknowledgeentry_org_id", table_name="userknowledgeentry")
    op.drop_index("ix_userknowledgeentry_user_id", table_name="userknowledgeentry")
    op.drop_index("ix_userknowledgeentry_entry_uuid", table_name="userknowledgeentry")
    op.drop_table("userknowledgeentry")
    op.drop_index("ix_contentframeworktag_intent", table_name="contentframeworktag")
    op.drop_index("ix_contentframeworktag_framework_node_id", table_name="contentframeworktag")
    op.drop_index("ix_contentframeworktag_content_uuid", table_name="contentframeworktag")
    op.drop_index("ix_contentframeworktag_content_type", table_name="contentframeworktag")
    op.drop_index("ix_contentframeworktag_org_id", table_name="contentframeworktag")
    op.drop_table("contentframeworktag")
    op.drop_index("ix_lifeframeworknode_node_type", table_name="lifeframeworknode")
    op.drop_index("ix_lifeframeworknode_parent_id", table_name="lifeframeworknode")
    op.drop_index("ix_lifeframeworknode_key", table_name="lifeframeworknode")
    op.drop_table("lifeframeworknode")
