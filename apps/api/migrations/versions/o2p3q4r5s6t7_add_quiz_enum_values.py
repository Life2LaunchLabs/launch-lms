"""Add TYPE_QUIZ and SUBTYPE_QUIZ_STANDARD to activity enums

Revision ID: o2p3q4r5s6t7
Revises: n1o2p3q4r5s6
Create Date: 2026-03-26 00:01:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa  # noqa: F401
import sqlmodel  # noqa: F401
from alembic_postgresql_enum import TableReference  # type: ignore

# revision identifiers, used by Alembic.
revision: str = 'o2p3q4r5s6t7'
down_revision: Union[str, None] = 'n1o2p3q4r5s6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.sync_enum_values(
        'public',
        'activitytypeenum',
        ['TYPE_VIDEO', 'TYPE_DOCUMENT', 'TYPE_DYNAMIC', 'TYPE_ASSIGNMENT', 'TYPE_CUSTOM', 'TYPE_SCORM', 'TYPE_QUIZ'],
        [TableReference(table_schema='public', table_name='activity', column_name='activity_type')],
        enum_values_to_rename=[]
    )

    op.sync_enum_values(
        'public',
        'activitysubtypeenum',
        [
            'SUBTYPE_DYNAMIC_PAGE', 'SUBTYPE_VIDEO_YOUTUBE', 'SUBTYPE_VIDEO_HOSTED',
            'SUBTYPE_DOCUMENT_PDF', 'SUBTYPE_DOCUMENT_DOC', 'SUBTYPE_ASSIGNMENT_ANY',
            'SUBTYPE_CUSTOM', 'SUBTYPE_SCORM_12', 'SUBTYPE_SCORM_2004', 'SUBTYPE_QUIZ_STANDARD',
        ],
        [TableReference(table_schema='public', table_name='activity', column_name='activity_sub_type')],
        enum_values_to_rename=[]
    )


def downgrade() -> None:
    op.sync_enum_values(
        'public',
        'activitytypeenum',
        ['TYPE_VIDEO', 'TYPE_DOCUMENT', 'TYPE_DYNAMIC', 'TYPE_ASSIGNMENT', 'TYPE_CUSTOM', 'TYPE_SCORM'],
        [TableReference(table_schema='public', table_name='activity', column_name='activity_type')],
        enum_values_to_rename=[]
    )

    op.sync_enum_values(
        'public',
        'activitysubtypeenum',
        [
            'SUBTYPE_DYNAMIC_PAGE', 'SUBTYPE_VIDEO_YOUTUBE', 'SUBTYPE_VIDEO_HOSTED',
            'SUBTYPE_DOCUMENT_PDF', 'SUBTYPE_DOCUMENT_DOC', 'SUBTYPE_ASSIGNMENT_ANY',
            'SUBTYPE_CUSTOM', 'SUBTYPE_SCORM_12', 'SUBTYPE_SCORM_2004',
        ],
        [TableReference(table_schema='public', table_name='activity', column_name='activity_sub_type')],
        enum_values_to_rename=[]
    )
