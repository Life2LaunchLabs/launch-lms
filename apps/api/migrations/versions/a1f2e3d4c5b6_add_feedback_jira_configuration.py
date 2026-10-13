"""add live Jira connection for tester feedback

Revision ID: a1f2e3d4c5b6
Revises: x8y9z0a1b2c3

The feedback board connection moves from runtime environment variables to a
platform setting edited in Platform → Feedback. Deployments without a saved
row keep using the environment variables.
"""

from alembic import op
import sqlalchemy as sa


revision = "a1f2e3d4c5b6"
down_revision = "x8y9z0a1b2c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "feedbackjiraconfiguration",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("base_url", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("email", sa.String(length=320), nullable=False, server_default=""),
        sa.Column("api_token_ciphertext", sa.Text(), nullable=True),
        sa.Column("project_key", sa.String(length=50), nullable=False, server_default=""),
        sa.Column("issue_type", sa.String(length=100), nullable=False, server_default="Task"),
        sa.Column("board_id", sa.String(length=50), nullable=False, server_default=""),
        sa.Column(
            "updated_by_user_id",
            sa.Integer(),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("feedbackjiraconfiguration")
