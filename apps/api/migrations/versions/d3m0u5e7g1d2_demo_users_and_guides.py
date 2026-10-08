"""Demo users without a scenario org: presentation, guides, links and tags.

Revision ID: d3m0u5e7g1d2
Revises: x4y5z6a7b8c9
"""

from alembic import op
import sqlalchemy as sa

revision = "d3m0u5e7g1d2"
down_revision = "x4y5z6a7b8c9"
branch_labels = None
depends_on = None


def upgrade():
    for name, column in (
        (
            "role_line",
            sa.Column("role_line", sa.String(), nullable=False, server_default=""),
        ),
        ("handle", sa.Column("handle", sa.String(), nullable=True)),
        (
            "start_path",
            sa.Column("start_path", sa.String(), nullable=False, server_default=""),
        ),
        (
            "start_org_slug",
            sa.Column("start_org_slug", sa.String(), nullable=False, server_default=""),
        ),
        ("guide", sa.Column("guide", sa.JSON(), nullable=False, server_default="{}")),
        (
            "position",
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        ),
        ("last_setup_at", sa.Column("last_setup_at", sa.DateTime(), nullable=True)),
    ):
        op.add_column("demomember", column)
    op.create_unique_constraint("uq_demomember_handle", "demomember", ["handle"])
    op.add_column("demosession", sa.Column("tag", sa.String(), nullable=True))
    # 100 concurrent visitors is the supported ceiling now that snapshots include
    # the main organization's content.
    op.execute("UPDATE democonfiguration SET capacity = 100 WHERE capacity > 100")


def downgrade():
    op.drop_column("demosession", "tag")
    op.drop_constraint("uq_demomember_handle", "demomember", type_="unique")
    for name in (
        "last_setup_at",
        "position",
        "guide",
        "start_org_slug",
        "start_path",
        "handle",
        "role_line",
    ):
        op.drop_column("demomember", name)
