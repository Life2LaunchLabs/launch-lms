"""add provider-specific Hub advisor configuration

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
"""

from alembic import op
import sqlalchemy as sa


revision = "e2f3a4b5c6d7"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "hubadvisorproviderconfiguration",
        sa.Column("provider", sa.String(length=50), primary_key=True),
        sa.Column("model", sa.String(length=200), nullable=False),
        sa.Column("api_key_ciphertext", sa.Text(), nullable=True),
        sa.Column("advanced_settings", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.execute(
        """INSERT INTO hubadvisorproviderconfiguration
        (provider, model, api_key_ciphertext, advanced_settings, updated_at)
        SELECT provider, model, api_key_ciphertext, '{}', updated_at
        FROM hubadvisorconfiguration"""
    )
    with op.batch_alter_table("hubadvisorconfiguration") as batch_op:
        batch_op.drop_column("model")
        batch_op.drop_column("api_key_ciphertext")


def downgrade() -> None:
    with op.batch_alter_table("hubadvisorconfiguration") as batch_op:
        batch_op.add_column(sa.Column("model", sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column("api_key_ciphertext", sa.Text(), nullable=True))
    op.execute(
        """UPDATE hubadvisorconfiguration
        SET model = (SELECT model FROM hubadvisorproviderconfiguration p
                     WHERE p.provider = hubadvisorconfiguration.provider),
            api_key_ciphertext = (SELECT api_key_ciphertext FROM hubadvisorproviderconfiguration p
                                  WHERE p.provider = hubadvisorconfiguration.provider)"""
    )
    op.drop_table("hubadvisorproviderconfiguration")
