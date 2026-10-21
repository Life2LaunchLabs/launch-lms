"""drop the retired features: boards, playgrounds, podcasts, communities, custom domains, packs

These features were switched off for every organization when org access moved to tiers
(b3ee9e60e07c), and their code is gone. This drops their tables and data:

- boards (board, boardmember) and playgrounds (playground, playgroundreaction)
- podcasts (podcast, podcastepisode)
- communities and discussions (community, discussion, discussioncomment, discussionvote,
  discussioncommentvote, discussionreaction)
- custom domains (customdomain), seat and AI-credit packs (orgpack) and overage usage
  events (usageevent)
- group access rows pointing at those resources, and custom organization roles nobody holds
  any more (d5e2b8f3c1a6 moved their members to Staff or Learner)

Uploaded podcast and board media stays in storage; the API no longer serves it.
Irreversible: take a backup first.

Revision ID: f9a3c6d8e2b4
Revises: e7f8a9b0c1d2
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f9a3c6d8e2b4'
down_revision: Union[str, None] = 'e7f8a9b0c1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Children before parents.
TABLES = (
    "boardmember", "board",
    "playgroundreaction", "playground",
    "podcastepisode", "podcast",
    "discussioncommentvote", "discussioncomment", "discussionvote", "discussionreaction", "discussion", "community",
    "customdomain", "orgpack", "usageevent",
)
RESOURCE_PREFIXES = ("board_", "podcast_", "community_", "playground_")


def upgrade() -> None:
    conn = op.get_bind()
    existing = set(sa.inspect(conn).get_table_names())
    if "usergroupresource" in existing:
        for prefix in RESOURCE_PREFIXES:
            conn.execute(sa.text("DELETE FROM usergroupresource WHERE resource_uuid LIKE :prefix"), {"prefix": f"{prefix}%"})
    for table in TABLES:
        if table in existing:
            op.drop_table(table)
    # Custom roles: every member was moved off them; anything still pointing at one keeps the row.
    conn.execute(sa.text(
        "DELETE FROM role WHERE role_type = 'TYPE_ORGANIZATION'"
        " AND id NOT IN (SELECT role_id FROM userorganization WHERE role_id IS NOT NULL)"
        " AND id NOT IN (SELECT role_id FROM organizationinvitation WHERE role_id IS NOT NULL)"
        " AND id NOT IN (SELECT role_id FROM organizationjoinlink WHERE role_id IS NOT NULL)"
        " AND id NOT IN (SELECT default_role_id FROM ssoconnection WHERE default_role_id IS NOT NULL)"
    ))


def downgrade() -> None:
    raise NotImplementedError("The retired features' data is gone; restore the backup taken before upgrading.")
