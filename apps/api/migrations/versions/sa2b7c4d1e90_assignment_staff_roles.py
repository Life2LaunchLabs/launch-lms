"""assignment staff roles: lead, review, comment

Assignment collaborators used the template's plan roles. They now have one of three
assignment roles: the owner and plan admins lead, reviewers and editors review, and
everyone else comments. An assignment with nobody leading gets its owner as Lead.
Commenters' places on the assignment's goals move to the goal's Commenter role.

Revision ID: sa2b7c4d1e90
Revises: rf1a7c3e9d20
"""
import json
from datetime import datetime
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision: str = 'sa2b7c4d1e90'
down_revision: Union[str, None] = 'rf1a7c3e9d20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

LEGACY = {"plan_admin": "lead", "reviewer": "review", "editor": "review"}
COMMENTER = ["comment", "view_plan"]


def _json(value):
    if value is None:
        return []
    return json.loads(value) if isinstance(value, str) else value


def _roles(item: dict, owner_id) -> str:
    key = item.get("role_key")
    if key in ("lead", "review", "comment"):
        return key
    if owner_id is not None and int(item["user_id"]) == int(owner_id):
        return "lead"
    if key is None:
        return "review"
    return LEGACY.get(key, "comment")


def _commenter_role(bind, goal_id: int, now: str) -> int:
    found = bind.execute(sa.text("SELECT id FROM planrole WHERE goal_id = :goal AND key = 'commenter'"), {"goal": goal_id}).first()
    if found:
        return int(found[0])
    bind.execute(sa.text(
        "INSERT INTO planrole (role_uuid, goal_id, key, name, capabilities, grantable_role_keys, creation_date, update_date) "
        "VALUES (:uuid, :goal, 'commenter', 'Commenter', :caps, '[]', :now, :now)"
    ), {"uuid": f"plan_role_{uuid4()}", "goal": goal_id, "caps": json.dumps(COMMENTER), "now": now})
    return int(bind.execute(sa.text("SELECT id FROM planrole WHERE goal_id = :goal AND key = 'commenter'"), {"goal": goal_id}).first()[0])


def upgrade() -> None:
    bind = op.get_bind()
    now = datetime.now().isoformat()
    rows = bind.execute(sa.text("SELECT id, collaborators, staff_user_ids, owner_user_id, created_by_user_id FROM goal_assignment")).fetchall()
    for assignment_id, collaborators, staff_user_ids, owner_id, created_by in rows:
        owner_id = owner_id or created_by
        items = _json(collaborators) or [{"user_id": user_id, "role_key": None} for user_id in _json(staff_user_ids)]
        result: dict[int, str] = {}
        for item in items:
            result.setdefault(int(item["user_id"]), _roles(item, owner_id))
        if "lead" not in result.values() and owner_id is not None:
            result = {int(owner_id): "lead", **result}
        updated = [{"user_id": user_id, "role_key": role} for user_id, role in result.items()]
        bind.execute(sa.text("UPDATE goal_assignment SET collaborators = :collaborators, staff_user_ids = :staff WHERE id = :id"), {
            "collaborators": json.dumps(updated), "staff": json.dumps(list(result)), "id": assignment_id,
        })
        commenters = [user_id for user_id, role in result.items() if role == "comment"]
        if not commenters:
            continue
        for goal_id, goal_owner, subject in bind.execute(sa.text(
            "SELECT id, owner_user_id, subject_user_id FROM goal WHERE assignment_id = :id"
        ), {"id": assignment_id}).fetchall():
            for user_id in commenters:
                if user_id in {goal_owner, subject}:
                    continue
                member = bind.execute(sa.text("SELECT id FROM plancollaborator WHERE goal_id = :goal AND user_id = :user"),
                                      {"goal": goal_id, "user": user_id}).first()
                if member:
                    bind.execute(sa.text("UPDATE plancollaborator SET role_id = :role, update_date = :now WHERE id = :id"),
                                 {"role": _commenter_role(bind, goal_id, now), "now": now, "id": member[0]})


def downgrade() -> None:
    # Roles map back onto the template's: Lead to plan admin for the owner, reviewer otherwise; Comment to commenter.
    bind = op.get_bind()
    back = {"lead": "reviewer", "review": "reviewer", "comment": "commenter"}
    for assignment_id, collaborators, owner_id in bind.execute(sa.text("SELECT id, collaborators, owner_user_id FROM goal_assignment")).fetchall():
        items = [{"user_id": item["user_id"], "role_key": "plan_admin" if owner_id is not None and int(item["user_id"]) == int(owner_id)
                  else back.get(item.get("role_key"), item.get("role_key"))} for item in _json(collaborators)]
        bind.execute(sa.text("UPDATE goal_assignment SET collaborators = :collaborators WHERE id = :id"),
                     {"collaborators": json.dumps(items), "id": assignment_id})
