"""add resource note blocks and review ratings

Revision ID: g4h5i6j7k8l9
Revises: f3g4h5i6j7k8
"""

from alembic import op
import sqlalchemy as sa


revision = "g4h5i6j7k8l9"
down_revision = "f3g4h5i6j7k8"
branch_labels = None
depends_on = None

LEGACY_NOTE_MIGRATIONS = (
    """
        INSERT INTO resourcenoteblock
            (user_id, resource_id, note_uuid, block_type, content, sort_order, creation_date, update_date)
        SELECT user_id, resource_id, 'legacy-notes-' || CAST(id AS VARCHAR), 'text', notes, 0, creation_date, update_date
        FROM usersavedresource
        WHERE notes IS NOT NULL AND trim(notes) <> ''
        ON CONFLICT (note_uuid) DO NOTHING
    """,
    """
        INSERT INTO resourcenoteblock
            (user_id, resource_id, note_uuid, block_type, content, sort_order, creation_date, update_date)
        SELECT user_id, resource_id, 'legacy-outcome-text-' || CAST(id AS VARCHAR), 'text', outcome_text, 1, creation_date, update_date
        FROM usersavedresource
        WHERE outcome_text IS NOT NULL AND trim(outcome_text) <> ''
        ON CONFLICT (note_uuid) DO NOTHING
    """,
    """
        INSERT INTO resourcenoteblock
            (user_id, resource_id, note_uuid, block_type, url, title, sort_order, creation_date, update_date)
        SELECT user_id, resource_id, 'legacy-outcome-link-' || CAST(id AS VARCHAR), 'link', outcome_link, 'Saved link', 2, creation_date, update_date
        FROM usersavedresource
        WHERE outcome_link IS NOT NULL AND trim(outcome_link) <> ''
        ON CONFLICT (note_uuid) DO NOTHING
    """,
    """
        INSERT INTO resourcenoteblock
            (user_id, resource_id, note_uuid, block_type, filename, original_filename, mime_type,
             storage_directory, sort_order, creation_date, update_date)
        SELECT user_id, resource_id, 'legacy-outcome-file-' || CAST(id AS VARCHAR), 'file', outcome_file, outcome_file,
               'application/octet-stream', 'outcomes', 3, creation_date, update_date
        FROM usersavedresource
        WHERE outcome_file IS NOT NULL AND trim(outcome_file) <> ''
        ON CONFLICT (note_uuid) DO NOTHING
    """,
)


def upgrade() -> None:
    op.create_table(
        "resourcenoteblock",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("resource_id", sa.Integer(), sa.ForeignKey("resource.id", ondelete="CASCADE"), nullable=False),
        sa.Column("note_uuid", sa.String(), nullable=False),
        sa.Column("block_type", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("preview_image_url", sa.Text(), nullable=True),
        sa.Column("filename", sa.String(), nullable=True),
        sa.Column("original_filename", sa.String(), nullable=True),
        sa.Column("mime_type", sa.String(), nullable=True),
        sa.Column("storage_directory", sa.String(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.CheckConstraint(
            "block_type IN ('text', 'link', 'image', 'file')",
            name="ck_resource_note_block_type",
        ),
        sa.UniqueConstraint("note_uuid"),
    )
    op.create_index("ix_resourcenoteblock_user_id", "resourcenoteblock", ["user_id"])
    op.create_index("ix_resourcenoteblock_resource_id", "resourcenoteblock", ["resource_id"])
    op.create_index("ix_resourcenoteblock_note_uuid", "resourcenoteblock", ["note_uuid"])
    op.add_column("resourcecomment", sa.Column("rating", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "ck_resource_comment_rating",
        "resourcecomment",
        "rating IS NULL OR (rating >= 1 AND rating <= 5)",
    )
    op.create_index(
        "uq_resourcecomment_rated_author",
        "resourcecomment",
        ["resource_id", "author_id"],
        unique=True,
        postgresql_where=sa.text("rating IS NOT NULL"),
    )

    # Keep the source columns through this compatibility release. Deterministic
    # UUIDs make the data copy safe to re-run while each former field remains a
    # distinct, editable Note block.
    for statement in LEGACY_NOTE_MIGRATIONS:
        op.execute(sa.text(statement))


def downgrade() -> None:
    op.drop_index("uq_resourcecomment_rated_author", table_name="resourcecomment")
    op.drop_constraint("ck_resource_comment_rating", "resourcecomment", type_="check")
    op.drop_column("resourcecomment", "rating")
    op.drop_index("ix_resourcenoteblock_note_uuid", table_name="resourcenoteblock")
    op.drop_index("ix_resourcenoteblock_resource_id", table_name="resourcenoteblock")
    op.drop_index("ix_resourcenoteblock_user_id", table_name="resourcenoteblock")
    op.drop_table("resourcenoteblock")
