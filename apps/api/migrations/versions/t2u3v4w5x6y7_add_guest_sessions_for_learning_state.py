"""Add guest sessions for learning state

Revision ID: t2u3v4w5x6y7
Revises: s1t2u3v4w5x6, o2p3q4r5s6t7
Create Date: 2026-03-31 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "t2u3v4w5x6y7"
down_revision: Union[str, tuple[str, str], None] = ("s1t2u3v4w5x6", "o2p3q4r5s6t7")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _column_exists(inspector, table_name: str, column_name: str) -> bool:
    if not _table_exists(inspector, table_name):
        return False
    return column_name in {column["name"] for column in inspector.get_columns(table_name)}


def _index_exists(inspector, table_name: str, index_name: str) -> bool:
    if not _table_exists(inspector, table_name):
        return False
    return index_name in {index["name"] for index in inspector.get_indexes(table_name)}


def _foreign_key_exists(inspector, table_name: str, fk_name: str) -> bool:
    if not _table_exists(inspector, table_name):
        return False
    return fk_name in {fk["name"] for fk in inspector.get_foreign_keys(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not _table_exists(inspector, "guestsession"):
        op.create_table(
            "guestsession",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("guest_session_uuid", sa.String(), nullable=False, unique=True),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("consumed_at", sa.DateTime(), nullable=True),
            sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
            sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        )
        inspector = inspect(bind)

    if not _index_exists(inspector, "guestsession", "ix_guestsession_guest_session_uuid"):
        op.create_index("ix_guestsession_guest_session_uuid", "guestsession", ["guest_session_uuid"], unique=True)
        inspector = inspect(bind)

    if not _column_exists(inspector, "trail", "guest_session_id"):
        op.add_column("trail", sa.Column("guest_session_id", sa.Integer(), nullable=True))
        inspector = inspect(bind)
    if not _foreign_key_exists(inspector, "trail", "fk_trail_guest_session_id_guestsession"):
        op.create_foreign_key(
            "fk_trail_guest_session_id_guestsession",
            "trail",
            "guestsession",
            ["guest_session_id"],
            ["id"],
            ondelete="CASCADE",
        )
        inspector = inspect(bind)
    if not _index_exists(inspector, "trail", "ix_trail_guest_session_id"):
        op.create_index("ix_trail_guest_session_id", "trail", ["guest_session_id"], unique=False)
    op.alter_column("trail", "user_id", existing_type=sa.Integer(), nullable=True)

    if not _column_exists(inspector, "trailrun", "guest_session_id"):
        op.add_column("trailrun", sa.Column("guest_session_id", sa.Integer(), nullable=True))
        inspector = inspect(bind)
    if not _foreign_key_exists(inspector, "trailrun", "fk_trailrun_guest_session_id_guestsession"):
        op.create_foreign_key(
            "fk_trailrun_guest_session_id_guestsession",
            "trailrun",
            "guestsession",
            ["guest_session_id"],
            ["id"],
            ondelete="CASCADE",
        )
        inspector = inspect(bind)
    if not _index_exists(inspector, "trailrun", "ix_trailrun_guest_session_id"):
        op.create_index("ix_trailrun_guest_session_id", "trailrun", ["guest_session_id"], unique=False)
    op.alter_column("trailrun", "user_id", existing_type=sa.Integer(), nullable=True)

    if not _column_exists(inspector, "trailstep", "guest_session_id"):
        op.add_column("trailstep", sa.Column("guest_session_id", sa.Integer(), nullable=True))
        inspector = inspect(bind)
    if not _foreign_key_exists(inspector, "trailstep", "fk_trailstep_guest_session_id_guestsession"):
        op.create_foreign_key(
            "fk_trailstep_guest_session_id_guestsession",
            "trailstep",
            "guestsession",
            ["guest_session_id"],
            ["id"],
            ondelete="CASCADE",
        )
        inspector = inspect(bind)
    if not _index_exists(inspector, "trailstep", "ix_trailstep_guest_session_id"):
        op.create_index("ix_trailstep_guest_session_id", "trailstep", ["guest_session_id"], unique=False)
    op.alter_column("trailstep", "user_id", existing_type=sa.Integer(), nullable=True)

    if not _column_exists(inspector, "quizattempt", "guest_session_id"):
        op.add_column("quizattempt", sa.Column("guest_session_id", sa.Integer(), nullable=True))
        inspector = inspect(bind)
    if not _foreign_key_exists(inspector, "quizattempt", "fk_quizattempt_guest_session_id_guestsession"):
        op.create_foreign_key(
            "fk_quizattempt_guest_session_id_guestsession",
            "quizattempt",
            "guestsession",
            ["guest_session_id"],
            ["id"],
            ondelete="CASCADE",
        )
        inspector = inspect(bind)
    if not _index_exists(inspector, "quizattempt", "ix_quizattempt_guest_session_id"):
        op.create_index("ix_quizattempt_guest_session_id", "quizattempt", ["guest_session_id"], unique=False)
    op.alter_column("quizattempt", "user_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if _column_exists(inspector, "quizattempt", "guest_session_id"):
        if _index_exists(inspector, "quizattempt", "ix_quizattempt_guest_session_id"):
            op.drop_index("ix_quizattempt_guest_session_id", table_name="quizattempt")
        if _foreign_key_exists(inspector, "quizattempt", "fk_quizattempt_guest_session_id_guestsession"):
            op.drop_constraint("fk_quizattempt_guest_session_id_guestsession", "quizattempt", type_="foreignkey")
        op.drop_column("quizattempt", "guest_session_id")
        op.alter_column("quizattempt", "user_id", existing_type=sa.Integer(), nullable=False)

    if _column_exists(inspector, "trailstep", "guest_session_id"):
        inspector = inspect(bind)
        if _index_exists(inspector, "trailstep", "ix_trailstep_guest_session_id"):
            op.drop_index("ix_trailstep_guest_session_id", table_name="trailstep")
        if _foreign_key_exists(inspector, "trailstep", "fk_trailstep_guest_session_id_guestsession"):
            op.drop_constraint("fk_trailstep_guest_session_id_guestsession", "trailstep", type_="foreignkey")
        op.drop_column("trailstep", "guest_session_id")
        op.alter_column("trailstep", "user_id", existing_type=sa.Integer(), nullable=False)

    if _column_exists(inspector, "trailrun", "guest_session_id"):
        inspector = inspect(bind)
        if _index_exists(inspector, "trailrun", "ix_trailrun_guest_session_id"):
            op.drop_index("ix_trailrun_guest_session_id", table_name="trailrun")
        if _foreign_key_exists(inspector, "trailrun", "fk_trailrun_guest_session_id_guestsession"):
            op.drop_constraint("fk_trailrun_guest_session_id_guestsession", "trailrun", type_="foreignkey")
        op.drop_column("trailrun", "guest_session_id")
        op.alter_column("trailrun", "user_id", existing_type=sa.Integer(), nullable=False)

    if _column_exists(inspector, "trail", "guest_session_id"):
        inspector = inspect(bind)
        if _index_exists(inspector, "trail", "ix_trail_guest_session_id"):
            op.drop_index("ix_trail_guest_session_id", table_name="trail")
        if _foreign_key_exists(inspector, "trail", "fk_trail_guest_session_id_guestsession"):
            op.drop_constraint("fk_trail_guest_session_id_guestsession", "trail", type_="foreignkey")
        op.drop_column("trail", "guest_session_id")
        op.alter_column("trail", "user_id", existing_type=sa.Integer(), nullable=False)

    inspector = inspect(bind)
    if _table_exists(inspector, "guestsession"):
        if _index_exists(inspector, "guestsession", "ix_guestsession_guest_session_uuid"):
            op.drop_index("ix_guestsession_guest_session_uuid", table_name="guestsession")
        op.drop_table("guestsession")
