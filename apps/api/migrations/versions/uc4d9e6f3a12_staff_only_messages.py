"""staff-only messages: one thread per assignment, staff notes folded in

Messages get a visibility: "all", or "staff" for the organization's staff alone. The staff-only
chat of each assignment folds into the thread its learners are in, as staff-only messages: a group
assignment's chat with the whole group, a person assignment's learner's chat with the
organization. Staff notes about a learner become staff-only messages in that learner's chat with
the organization, and the staff note table goes.

Revision ID: uc4d9e6f3a12
Revises: tb3c8d5e2f01
"""
from datetime import datetime
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision: str = 'uc4d9e6f3a12'
down_revision: Union[str, None] = 'tb3c8d5e2f01'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _one(bind, sql: str, **params):
    return bind.execute(sa.text(sql), params).first()


def _school_chat(bind, org_id: int, user_id: int, now: str) -> int:
    """The learner's chat with the organization, created when missing (members settle when it's next opened)."""
    key = f"school:{org_id}:{user_id}"
    found = _one(bind, "SELECT id FROM conversation WHERE direct_key = :key", key=key)
    if found:
        return int(found[0])
    org = _one(bind, "SELECT name FROM organization WHERE id = :id", id=org_id)
    bind.execute(sa.text(
        "INSERT INTO conversation (conversation_uuid, kind, direct_key, title, org_id, creation_date, update_date) "
        "VALUES (:uuid, 'school', :key, :title, :org, :now, :now)"
    ), {"uuid": f"chat_{uuid4()}", "key": key, "title": org[0] if org else "School", "org": org_id, "now": now})
    return int(_one(bind, "SELECT id FROM conversation WHERE direct_key = :key", key=key)[0])


def _move(bind, source: int, target: int) -> None:
    """A chat's messages and their tags into another chat, as staff-only messages; the emptied chat goes."""
    bind.execute(sa.text("UPDATE conversationmessage SET conversation_id = :target, visibility = 'staff' WHERE conversation_id = :source"),
                 {"source": source, "target": target})
    bind.execute(sa.text("UPDATE conversationmessageref SET conversation_id = :target WHERE conversation_id = :source"), {"source": source, "target": target})
    bind.execute(sa.text("UPDATE conversationreport SET conversation_id = :target WHERE conversation_id = :source"), {"source": source, "target": target})
    bind.execute(sa.text("DELETE FROM conversationmember WHERE conversation_id = :source"), {"source": source})
    bind.execute(sa.text("DELETE FROM conversation WHERE id = :source"), {"source": source})


def _person_refs(bind, conversation_id: int, assignment_id: int, user_id: int) -> None:
    """Template-step tags from the old staff chat, pointed at the learner's own plan and step."""
    goal = _one(bind, "SELECT id FROM goal WHERE assignment_id = :a AND subject_user_id = :u", a=assignment_id, u=user_id)
    if not goal:
        return
    for ref_id, step_key in bind.execute(sa.text(
        "SELECT id, step_uuid FROM conversationmessageref WHERE conversation_id = :c AND goal_id IS NULL"
    ), {"c": conversation_id}).fetchall():
        step = _one(bind, "SELECT step_uuid FROM goal_step WHERE goal_id = :g AND template_key = :k", g=goal[0], k=step_key) if step_key else None
        bind.execute(sa.text("UPDATE conversationmessageref SET goal_id = :g, step_uuid = :s WHERE id = :id"),
                     {"g": goal[0], "s": step[0] if step else None, "id": ref_id})


def upgrade() -> None:
    op.add_column('conversationmessage', sa.Column('visibility', sa.String(), nullable=False, server_default='all'))
    bind = op.get_bind()
    now = datetime.now().isoformat()
    staff_chats = bind.execute(sa.text(
        "SELECT c.id, a.id, a.org_id, a.usergroup_id, a.user_id, a.template_id FROM conversation c "
        "JOIN goal_assignment a ON a.id = c.assignment_id WHERE c.channel = 'group_staff'"
    )).fetchall()
    for conversation_id, assignment_id, org_id, group_id, user_id, template_id in staff_chats:
        if group_id:
            group_chat = _one(bind, "SELECT id FROM conversation WHERE assignment_id = :a AND channel = 'group_all'", a=assignment_id)
            if group_chat:
                _move(bind, conversation_id, int(group_chat[0]))
                continue
            template = _one(bind, "SELECT title FROM goal_template WHERE id = :id", id=template_id)
            group = _one(bind, "SELECT name FROM usergroup WHERE id = :id", id=group_id)
            bind.execute(sa.text("UPDATE conversation SET channel = 'group_all', title = :title WHERE id = :id"),
                         {"title": f"{template[0] if template else 'Assignment'} · {group[0] if group else 'Group'}", "id": conversation_id})
            bind.execute(sa.text("UPDATE conversationmessage SET visibility = 'staff' WHERE conversation_id = :id"), {"id": conversation_id})
            continue
        subject = user_id or (_one(bind, "SELECT subject_user_id FROM goal WHERE assignment_id = :a AND subject_user_id IS NOT NULL", a=assignment_id) or [None])[0]
        if not subject:
            # An email invitation nobody accepted: the old staff chat stays, its messages staff only.
            bind.execute(sa.text("UPDATE conversationmessage SET visibility = 'staff' WHERE conversation_id = :id"), {"id": conversation_id})
            continue
        _person_refs(bind, conversation_id, assignment_id, int(subject))
        _move(bind, conversation_id, _school_chat(bind, int(org_id), int(subject), now))

    for _, org_id, subject_id, author_id, body, created in bind.execute(sa.text(
        "SELECT id, org_id, subject_user_id, author_user_id, body, creation_date FROM staffnote ORDER BY id"
    )).fetchall():
        chat_id = _school_chat(bind, int(org_id), int(subject_id), now)
        bind.execute(sa.text(
            "INSERT INTO conversationmessage (message_uuid, conversation_id, sender_user_id, kind, body, visibility, creation_date, update_date) "
            "VALUES (:uuid, :chat, :author, 'text', :body, 'staff', :created, :created)"
        ), {"uuid": f"chat_message_{uuid4()}", "chat": chat_id, "author": author_id, "body": body, "created": created or now})
    op.drop_table('staffnote')


def downgrade() -> None:
    # Staff-only messages stay where they are (as messages everyone in the chat reads); the note table comes back empty.
    op.create_table(
        'staffnote',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('note_uuid', sa.String(), nullable=False),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
        sa.Column('subject_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('author_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('creation_date', sa.String(), nullable=False),
        sa.Column('update_date', sa.String(), nullable=False),
    )
    op.create_index('ix_staffnote_note_uuid', 'staffnote', ['note_uuid'], unique=True)
    op.create_index('ix_staffnote_org_id', 'staffnote', ['org_id'])
    op.create_index('ix_staffnote_subject_user_id', 'staffnote', ['subject_user_id'])
    op.drop_column('conversationmessage', 'visibility')
