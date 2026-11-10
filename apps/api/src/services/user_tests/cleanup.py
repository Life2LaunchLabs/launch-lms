"""Leak audit and purge for a test cohort.

The audit looks for anything that ties the cohort to a real person or org: a row that names
people from two worlds (the same test as the cohort seal, run over saved data), and a group,
conversation, shared goal or portfolio whose members come from two worlds. Zero is the target.

Purge deletes the cohort's personas and orgs, and the rows that hang off them. It only runs on
a closed cohort with a clean audit, so a cascade can never reach a real person's data. Captured
mail stays for review.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel
from src.db.user_tests import TestCohort, TestCohortOrg, TestLoginTicket, TestMail, TestPersona
from src.db.users import User
from src.services.user_tests.cohorts import get_cohort, is_open
from src.services.user_tests.seal import EMAIL_COLUMNS, REAL, SKIP_TABLES, Worlds, _Row, collect, people_columns, worlds_of

MAX_REPORTED = 100
# Rows that put people together: a mix of worlds among one parent's members is a leak.
MEMBERSHIPS = (
    ("usergroupuser", "usergroup_id"),
    ("conversationmember", "conversation_id"),
    ("plancollaborator", "goal_id"),
    ("portfolioperson", "portfolio_id"),
)


def _ids(db: Session, cohort: TestCohort) -> tuple[set[int], set[int], set[str]]:
    rows = db.execute(select(TestPersona.user_id, User.email).join(User, User.id == TestPersona.user_id).where(TestPersona.cohort_id == cohort.id)).all()
    orgs = set(db.execute(select(TestCohortOrg.org_id).where(TestCohortOrg.cohort_id == cohort.id)).scalars())
    return {int(user_id) for user_id, _ in rows}, {int(org_id) for org_id in orgs}, {str(email).lower() for _, email in rows}


def _label(world: int, cohort: TestCohort) -> str:
    return "real" if world == REAL else ("this cohort" if world == cohort.id else "another cohort")


def _row_leaks(db: Session, cohort: TestCohort, users: set[int], orgs: set[int], emails: set[str], worlds: Worlds) -> list[dict]:
    leaks: list[dict] = []
    for table in SQLModel.metadata.sorted_tables:
        if table.name in SKIP_TABLES or table.name == "user":
            continue
        user_columns, org_columns, _ = people_columns(table)
        clauses = [table.c[name].in_(users) for name in user_columns if users]
        clauses += [table.c[name].in_(orgs) for name in org_columns if orgs]
        if (email_column := EMAIL_COLUMNS.get(table.name)) and emails:
            clauses.append(table.c[email_column].in_(emails))
        if not clauses:
            continue
        for record in db.execute(select(table).where(or_(*clauses))).mappings():
            row = _Row()
            collect(db, table, record.get, row)
            found = worlds_of(db, row, worlds)
            if len(found) > 1:
                key = {column.name: record[column.name] for column in table.primary_key.columns}
                leaks.append({"table": table.name, "key": key, "worlds": sorted(_label(world, cohort) for world in found)})
    return leaks


def _membership_leaks(db: Session, cohort: TestCohort, users: set[int], worlds: Worlds) -> list[dict]:
    leaks: list[dict] = []
    if not users:
        return leaks
    for table_name, parent_column in MEMBERSHIPS:
        table = SQLModel.metadata.tables.get(table_name)
        if table is None:
            continue
        parents = {value for value in db.execute(select(table.c[parent_column]).where(table.c.user_id.in_(users))).scalars() if value is not None}
        if not parents:
            continue
        members: dict[int, set[int]] = {}
        for parent, user_id in db.execute(select(table.c[parent_column], table.c.user_id).where(table.c[parent_column].in_(parents))).all():
            members.setdefault(int(parent), set()).add(int(user_id))
        worlds.load(set().union(*members.values()), set(), set())
        for parent, member_ids in members.items():
            found = {worlds.users[user_id] for user_id in member_ids}
            if len(found) > 1:
                leaks.append({"table": table_name, "key": {parent_column: parent}, "worlds": sorted(_label(world, cohort) for world in found)})
    return leaks


def audit(db: Session, cohort_uuid: str) -> dict:
    cohort = get_cohort(db, cohort_uuid)
    users, orgs, emails = _ids(db, cohort)
    worlds = Worlds(db)
    leaks = _row_leaks(db, cohort, users, orgs, emails, worlds) + _membership_leaks(db, cohort, users, worlds)
    return {"clean": not leaks, "count": len(leaks), "leaks": leaks[:MAX_REPORTED], "checked_at": datetime.utcnow().isoformat()}


def purge(db: Session, cohort_uuid: str, *, dry_run: bool = True) -> dict:
    cohort = get_cohort(db, cohort_uuid)
    if cohort.status == "purged":
        raise HTTPException(409, "This cohort was already purged.")
    if is_open(cohort):
        raise HTTPException(409, "Close the cohort before purging it.")
    users, orgs, _ = _ids(db, cohort)
    from src.services.user_tests.checkpoints import demo_members

    if in_demo := demo_members(db, users):
        raise HTTPException(409, f"{len(in_demo)} of this cohort's personas are demo users. Remove them in Demo Studio first, so the demo never points at deleted accounts.")
    report = audit(db, cohort_uuid)
    counts = {
        "personas": len(users),
        "orgs": len(orgs),
        "mail_kept": len(db.execute(select(TestMail.id).where(TestMail.cohort_id == cohort.id)).all()),
    }
    result = {"dry_run": dry_run, "counts": counts, "audit": report}
    if not report["clean"]:
        # Deleting would cascade into the real rows the leaks point at.
        raise HTTPException(409, {"code": "leaks_found", "message": "The leak audit found links to real people or orgs. Fix those first; purge never touches real data.", **result})
    if dry_run:
        return result
    try:
        _delete(db, cohort, users, orgs)
    except IntegrityError as exc:
        db.rollback()
        # Say which link stopped it, so a failed purge never shows up as a bare server error.
        constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None) or str(exc.orig).splitlines()[0]
        raise HTTPException(409, {"code": "purge_blocked", "message": f"A row still points at this cohort's personas or orgs ({constraint}). Nothing was deleted.", **result}) from exc
    return {**result, "status": "purged"}


def _delete(db: Session, cohort: TestCohort, users: set[int], orgs: set[int]) -> None:
    from src.db.organizations import Organization
    from src.db.user_organizations import UserOrganization
    from src.services.superadmin.users import _invalidate_session_cache

    from src.db.api_tokens import APIToken
    from src.db.goals import Goal, GoalAssignment
    from src.db.requirements import RequirementAssignmentBatch, RequirementEnrollment

    for ticket in db.execute(select(TestLoginTicket).where(TestLoginTicket.persona_user_id.in_(users))).scalars() if users else []:  # type: ignore[attr-defined]
        db.delete(ticket)
    # Rows whose keys RESTRICT (or don't cascade) would stop the user and org deletes below, so they
    # go first. The clean audit means every one of them belongs to this cohort.
    if users:
        db.execute(delete(Goal).where(Goal.owner_user_id.in_(users)))  # type: ignore[attr-defined]
        db.execute(delete(APIToken).where(APIToken.created_by_user_id.in_(users)))  # type: ignore[attr-defined]
        db.execute(delete(RequirementEnrollment).where(RequirementEnrollment.user_id.in_(users)))  # type: ignore[attr-defined]
    if orgs:
        db.execute(delete(RequirementEnrollment).where(RequirementEnrollment.org_id.in_(orgs)))  # type: ignore[attr-defined]
        db.execute(delete(RequirementAssignmentBatch).where(RequirementAssignmentBatch.org_id.in_(orgs)))  # type: ignore[attr-defined]
        db.execute(delete(GoalAssignment).where(GoalAssignment.org_id.in_(orgs)))  # type: ignore[attr-defined]
    for org_id in orgs:
        if (org := db.get(Organization, org_id)) is not None:
            db.delete(org)  # its rows go with it (ON DELETE CASCADE)
    db.flush()
    for user_id in users:
        for membership in db.execute(select(UserOrganization).where(UserOrganization.user_id == user_id)).scalars().all():
            db.delete(membership)
        db.flush()
        if (user := db.get(User, user_id)) is not None:
            db.delete(user)
    cohort.status, cohort.update_date = "purged", datetime.utcnow()
    db.add(cohort)
    db.commit()
    for user_id in users:
        _invalidate_session_cache(user_id)
