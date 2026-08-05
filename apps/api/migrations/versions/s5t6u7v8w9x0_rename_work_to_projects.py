"""rename the portfolio work domain to projects

Revision ID: s5t6u7v8w9x0
Revises: r4s5t6u7v8w9
"""


import sqlalchemy as sa
from alembic import op

revision: str = "s5t6u7v8w9x0"
down_revision: str | None = "r4s5t6u7v8w9"
branch_labels = None
depends_on = None


def _merge_section_type(old_type: str, new_type: str) -> None:
    connection = op.get_bind()
    params = {"old_type": old_type, "new_type": new_type}
    connection.execute(sa.text("DELETE FROM portfoliosection AS source USING portfoliosection AS target WHERE source.portfolio_id = target.portfolio_id AND source.section_type = :old_type AND target.section_type = :new_type"), params)
    connection.execute(sa.text("UPDATE portfoliosection SET section_type = :new_type WHERE section_type = :old_type"), params)


def upgrade() -> None:
    op.rename_table("workitem", "projectitem")
    op.alter_column("projectitem", "work_uuid", new_column_name="project_uuid")
    op.rename_table("workitemblock", "projectitemblock")
    op.alter_column("projectitemblock", "work_item_id", new_column_name="project_item_id")
    op.rename_table("timelineworklink", "timelineprojectlink")
    op.alter_column("timelineprojectlink", "work_item_id", new_column_name="project_item_id")
    _merge_section_type("featured_work", "featured_projects")
    op.execute("ALTER INDEX IF EXISTS ix_workitem_work_uuid RENAME TO ix_projectitem_project_uuid")
    op.execute("ALTER INDEX IF EXISTS ix_workitem_portfolio_id RENAME TO ix_projectitem_portfolio_id")
    op.execute("ALTER INDEX IF EXISTS ix_workitem_status RENAME TO ix_projectitem_status")
    op.execute("ALTER INDEX IF EXISTS ix_workitem_slug RENAME TO ix_projectitem_slug")
    op.execute("ALTER INDEX IF EXISTS ix_workitemblock_work_item_id RENAME TO ix_projectitemblock_project_item_id")


def downgrade() -> None:
    op.execute("ALTER INDEX IF EXISTS ix_projectitemblock_project_item_id RENAME TO ix_workitemblock_work_item_id")
    op.execute("ALTER INDEX IF EXISTS ix_projectitem_slug RENAME TO ix_workitem_slug")
    op.execute("ALTER INDEX IF EXISTS ix_projectitem_status RENAME TO ix_workitem_status")
    op.execute("ALTER INDEX IF EXISTS ix_projectitem_portfolio_id RENAME TO ix_workitem_portfolio_id")
    op.execute("ALTER INDEX IF EXISTS ix_projectitem_project_uuid RENAME TO ix_workitem_work_uuid")
    _merge_section_type("featured_projects", "featured_work")
    op.alter_column("timelineprojectlink", "project_item_id", new_column_name="work_item_id")
    op.rename_table("timelineprojectlink", "timelineworklink")
    op.alter_column("projectitemblock", "project_item_id", new_column_name="work_item_id")
    op.rename_table("projectitemblock", "workitemblock")
    op.alter_column("projectitem", "project_uuid", new_column_name="work_uuid")
    op.rename_table("projectitem", "workitem")
