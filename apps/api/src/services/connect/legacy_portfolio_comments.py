"""Move portfolio comments into Connect, once, for migration d4e8a2c6f1b9.

The portfoliocomment table is described here as it last stood, since the model went with it.
Comments on someone's portfolio now are messages in the direct chat between its owner and the
person, tagged with the portfolio or the experience or project they're about (portfolio_talk.py).
Each thread moves into the chat between the owner and whoever started it; a reply by a third
person moves into their own chat with the owner. The owner's own threads have no one to go to.
"""

from __future__ import annotations

from uuid import uuid4

import sqlalchemy as sa
from sqlmodel import Session

from src.db.conversations import ConversationMessage
from src.db.portfolio import Portfolio
from src.services.connect import chats, portfolio_talk, workspace

PORTFOLIOCOMMENT = sa.Table(
    "portfoliocomment", sa.MetaData(),
    sa.Column("id", sa.Integer, primary_key=True),
    sa.Column("comment_uuid", sa.String),
    sa.Column("portfolio_id", sa.Integer),
    sa.Column("item_kind", sa.String),
    sa.Column("item_uuid", sa.String),
    sa.Column("parent_id", sa.Integer),
    sa.Column("author_user_id", sa.Integer),
    sa.Column("body", sa.Text),
    sa.Column("creation_date", sa.String),
    sa.Column("update_date", sa.String),
)


def move_all(db: Session) -> int:
    """Move every comment that has a chat to go to, and return how many moved. The caller drops the table."""
    rows = list(db.connection().execute(sa.select(PORTFOLIOCOMMENT).order_by(PORTFOLIOCOMMENT.c.id)).mappings())
    threads = {int(row["id"]): row for row in rows}
    moved = 0
    for row in rows:
        portfolio = db.get(Portfolio, row["portfolio_id"])
        first = threads.get(int(row["parent_id"])) if row["parent_id"] else row
        if not portfolio or not first or not row["author_user_id"]:
            continue
        other = row["author_user_id"] if row["author_user_id"] != portfolio.user_id else first["author_user_id"]
        conversation = chats.ensure_direct(db, int(portfolio.user_id), int(other)) if other and other != portfolio.user_id else None
        if not conversation:
            continue
        shown = {item["step_uuid"] for item in portfolio_talk.items(db, portfolio)}
        item_uuid = first["item_uuid"] if first["item_uuid"] in shown else None
        token = f"<step:{portfolio.portfolio_uuid}/{item_uuid}>" if item_uuid else f"<plan:{portfolio.portfolio_uuid}>"
        ref = {"kind": "step" if item_uuid else "plan", "goal_uuid": portfolio.portfolio_uuid, **({"step_uuid": item_uuid} if item_uuid else {}), "portfolio": True}
        stamp = row["update_date"] or row["creation_date"]
        message = ConversationMessage(
            message_uuid=f"chat_message_{uuid4()}", conversation_id=int(conversation.id), sender_user_id=row["author_user_id"],  # type: ignore[arg-type]
            kind="text", body=f"{token} {row['body']}", refs=[ref], creation_date=row["creation_date"], update_date=stamp,
        )
        db.add(message)
        db.flush()
        workspace.attach(db, message, [(None, portfolio.portfolio_uuid), *([(None, item_uuid)] if item_uuid else [])])
        conversation.last_message_at = max(conversation.last_message_at or "", stamp)
        db.add(conversation)
        moved += 1
    db.flush()
    return moved
