"""rename the portfolio journey domain to timeline

Revision ID: r4s5t6u7v8w9
Revises: r3s4t5u6v7w9
"""

from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "r4s5t6u7v8w9"
down_revision: Union[str, None] = "r3s4t5u6v7w9"
branch_labels = None
depends_on = None


def _rename_featured_setting(old_key: str, new_key: str) -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.text("SELECT id, theme_settings FROM portfolio")
    ).mappings()
    for row in rows:
        settings = dict(row["theme_settings"] or {})
        if old_key not in settings:
            continue
        settings[new_key] = settings.pop(old_key)
        connection.execute(
            sa.text(
                "UPDATE portfolio SET theme_settings = :settings WHERE id = :id"
            ).bindparams(sa.bindparam("settings", type_=sa.JSON())),
            {"id": row["id"], "settings": settings},
        )


def _merge_section_type(old_type: str, new_type: str) -> None:
    """Rename a section type while coalescing pre-existing legacy duplicates."""
    connection = op.get_bind()
    params = {"old_type": old_type, "new_type": new_type}
    connection.execute(
        sa.text(
            "UPDATE portfoliosection AS target SET "
            "title_override = source.title_override, "
            "enabled = source.enabled, visibility = source.visibility, "
            "sort_order = source.sort_order, settings = source.settings, "
            "update_date = source.update_date "
            "FROM portfoliosection AS source "
            "WHERE source.portfolio_id = target.portfolio_id "
            "AND source.section_type = :old_type "
            "AND target.section_type = :new_type"
        ),
        params,
    )
    connection.execute(
        sa.text(
            "DELETE FROM portfoliosection AS source "
            "USING portfoliosection AS target "
            "WHERE source.portfolio_id = target.portfolio_id "
            "AND source.section_type = :old_type "
            "AND target.section_type = :new_type"
        ),
        params,
    )
    connection.execute(
        sa.text(
            "UPDATE portfoliosection SET section_type = :new_type "
            "WHERE section_type = :old_type"
        ),
        params,
    )


def upgrade() -> None:
    op.rename_table("journeyentry", "timelineentry")
    op.alter_column("timelineentry", "journey_uuid", new_column_name="timeline_uuid")
    op.rename_table("journeyentryblock", "timelineentryblock")
    op.alter_column(
        "timelineentryblock",
        "journey_entry_id",
        new_column_name="timeline_entry_id",
    )
    op.rename_table("journeyworklink", "timelineworklink")
    op.alter_column(
        "timelineworklink",
        "journey_entry_id",
        new_column_name="timeline_entry_id",
    )
    _merge_section_type("current_journey", "current_timeline")
    _rename_featured_setting(
        "featured_journey_uuids", "featured_timeline_uuids"
    )


def downgrade() -> None:
    _rename_featured_setting(
        "featured_timeline_uuids", "featured_journey_uuids"
    )
    _merge_section_type("current_timeline", "current_journey")
    op.alter_column(
        "timelineworklink",
        "timeline_entry_id",
        new_column_name="journey_entry_id",
    )
    op.rename_table("timelineworklink", "journeyworklink")
    op.alter_column(
        "timelineentryblock",
        "timeline_entry_id",
        new_column_name="journey_entry_id",
    )
    op.rename_table("timelineentryblock", "journeyentryblock")
    op.alter_column("timelineentry", "timeline_uuid", new_column_name="journey_uuid")
    op.rename_table("timelineentry", "journeyentry")
