"""Add quiz activity type and quiz attempt/result tables

Revision ID: n1o2p3q4r5s6
Revises: h8c9d0e1f2a3
Create Date: 2026-03-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # noqa: F401

# revision identifiers, used by Alembic.
revision: str = 'n1o2p3q4r5s6'
down_revision: Union[str, None] = 'r7s8t9u0v1w2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── QuizAttempt table ───────────────────────────────────────────────────
    op.create_table(
        'quizattempt',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('attempt_uuid', sa.String(), nullable=False, index=True),
        sa.Column('activity_id', sa.Integer(),
                  sa.ForeignKey('activity.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('user_id', sa.Integer(),
                  sa.ForeignKey('user.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('org_id', sa.Integer(),
                  sa.ForeignKey('organization.id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('course_id', sa.Integer(),
                  sa.ForeignKey('course.id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('creation_date', sa.String(), nullable=False, server_default=''),
        sa.Column('update_date', sa.String(), nullable=False, server_default=''),
    )

    # ── QuizAnswer table ────────────────────────────────────────────────────
    op.create_table(
        'quizanswer',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('attempt_id', sa.Integer(),
                  sa.ForeignKey('quizattempt.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('question_uuid', sa.String(), nullable=False, index=True),
        sa.Column('answer_json', sa.JSON(), nullable=False),
        sa.Column('creation_date', sa.String(), nullable=False, server_default=''),
    )

    # ── QuizResult table ────────────────────────────────────────────────────
    op.create_table(
        'quizresult',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('attempt_id', sa.Integer(),
                  sa.ForeignKey('quizattempt.id', ondelete='CASCADE'),
                  nullable=False, unique=True),
        sa.Column('result_json', sa.JSON(), nullable=False),
        sa.Column('computed_at', sa.DateTime(), nullable=False),
        sa.Column('creation_date', sa.String(), nullable=False, server_default=''),
    )


def downgrade() -> None:
    op.drop_table('quizresult')
    op.drop_table('quizanswer')
    op.drop_table('quizattempt')
