"""Erase Coach memories that were only hidden (DEV-124)

Deleting a memory used to set its status to "deleted" (or "superseded") and keep the text, with
copies in the message receipts. Deletion now removes the row and blanks the receipts' words. This
erases what older deletions left behind: the hidden rows, their sources, every receipt copy of a
memory that no longer exists, and receipt copies of a memory's earlier wording.

Revision ID: u4m5e6m7e8r9
Revises: t3i4n5v6t7e8
Create Date: 2026-11-16
"""

from alembic import op

revision = "u4m5e6m7e8r9"
down_revision = "t3i4n5v6t7e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE hubconversationmessagememory SET content_snapshot = '', memory_id = NULL "
        "WHERE memory_id IS NULL OR memory_id IN (SELECT id FROM hubmemory WHERE status <> 'active')"
    )
    op.execute(
        "UPDATE hubconversationmessagememory SET content_snapshot = '' "
        "WHERE content_snapshot <> '' AND relationship IN ('deleted', 'superseded')"
    )
    op.execute(
        "UPDATE hubconversationmessagememory SET content_snapshot = '' "
        "WHERE content_snapshot <> '' AND EXISTS (SELECT 1 FROM hubmemory m "
        "WHERE m.id = hubconversationmessagememory.memory_id AND m.version > hubconversationmessagememory.memory_version)"
    )
    op.execute("DELETE FROM hubmemorysource WHERE memory_id IN (SELECT id FROM hubmemory WHERE status <> 'active')")
    op.execute("DELETE FROM hubmemory WHERE status <> 'active'")


def downgrade() -> None:
    # Erased text can't come back.
    pass
