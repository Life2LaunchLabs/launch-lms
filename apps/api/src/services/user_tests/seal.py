"""The cohort seal: no saved row may tie a test persona or test org to a real person or real org.

Every account and org belongs to one world: the real world, or the cohort of a test run. After
each flush (ids assigned, still inside the transaction) the seal looks at the rows that were
added, and at the people columns of rows that changed. It gathers the people a row names (user
and organization columns, invited addresses, and the people of the conversation, goal or
portfolio it belongs to) and refuses the flush if they come from more than one world. The main
(owner) org is shared, since every account is a member of it, so it never counts on its own.

Working at the data layer means one rule covers every path (invites, join links, messages,
shared goals, helper requests, background jobs) instead of a check in each router. Rows that
only name real people never match, so real traffic only pays two indexed lookups per flush.
"""

from __future__ import annotations

import functools
import logging
import weakref

from fastapi import HTTPException
from sqlalchemy import event, func, inspect as sa_inspect, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

REAL = 0  # the real world; a test world is its cohort id

# Bookkeeping that names people without connecting them.
SKIP_TABLES = {"auditlog", "test_cohort", "test_persona", "test_cohort_org", "test_mail", "test_login_ticket", "test_event", "test_checkpoint"}
# Rows in these tables are places where people meet, so a row pointing at one names their people too.
FOLLOW_TARGETS = {"conversation", "conversationmessage", "goal", "portfolio", "resourcecomment"}
# Public writes read by everyone in the org: here the main org counts as real, not shared.
STRICT_FOLLOWS = {("resourcecomment", "resource_id"): "resource"}
# Addresses a row reaches before an account exists.
EMAIL_COLUMNS = {
    "organizationinvitation": "email_normalized",
    "organization_join_request": "email_normalized",
    "planinvitation": "email_normalized",
    "plancollaboratorrequest": "email_normalized",
    "inboxmessage": "recipient_email_normalized",
    "goal_assignment": "subject_email",
}
# Credit, not a connection: a badge names the org that wrote the plan, and personas may earn it.
IGNORED_COLUMNS = {("badge_award", "creator_org_id")}
# Writes a test world never makes: they publish, bill or hand out access beyond the cohort.
TEST_FORBIDDEN_TABLES = {
    "goal_template_listing", "plan_request", "paymentsconfig", "paymentsoffer", "paymentsenrollment",
    "apitoken", "oauthgrant", "oauthauthorizationcode", "ssoconnection",
}
TEST_FORBIDDEN_COLUMNS = {("goal_template", "library_published_at")}
# A persona can't change who it is: no new address, password or platform role.
PERSONA_LOCKED_COLUMNS = ("email", "password", "is_superadmin")

_has_tables: weakref.WeakKeyDictionary[Engine, bool] = weakref.WeakKeyDictionary()


class CohortSealError(HTTPException):
    def __init__(self, message: str, detail: dict | None = None):
        super().__init__(403, {"code": "test_cohort_sealed", "message": message, **(detail or {})})
        from src.services.user_tests.stories import record_blocked

        record_blocked(message, detail)  # a blocked step still shows in the run's report


def tables_ready(session: Session) -> bool:
    """False where the test tables don't exist (tests with partial schemas): no personas there."""
    engine = session.get_bind()
    engine = getattr(engine, "engine", engine)
    if engine not in _has_tables:
        # Through the flush's own connection: a second one could end its transaction (SQLite).
        _has_tables[engine] = sa_inspect(session.connection()).has_table("test_persona")
    return _has_tables[engine]


class Worlds:
    """Resolves accounts, orgs and addresses to worlds for one flush.

    Orgs created in the flush belong to no world yet: the org a persona creates joins its cohort
    right after it is saved.
    """

    def __init__(self, session: Session, new_org_ids: set[int] = frozenset()):  # type: ignore[assignment]
        self.session = session
        self.users: dict[int, int] = {}
        self.orgs: dict[int, int] = {}
        self.emails: dict[str, int | None] = {}
        self.new_org_ids = set(new_org_ids)
        if not session.info.get("owner_org_id"):
            from src.db.organizations import Organization

            session.info["owner_org_id"] = session.execute(select(func.min(Organization.id))).scalar()
        self.owner_org_id: int = session.info["owner_org_id"] or 0

    def load(self, user_ids: set[int], org_ids: set[int], emails: set[str]) -> None:
        from src.db.user_tests import TestCohortOrg, TestPersona
        from src.db.users import User
        from src.services.user_tests.settings import is_test_address

        if missing := user_ids - self.users.keys():
            found = dict(self.session.execute(select(TestPersona.user_id, TestPersona.cohort_id).where(TestPersona.user_id.in_(missing))).all())  # type: ignore[attr-defined]
            self.users.update({user_id: found.get(user_id, REAL) for user_id in missing})
        if missing := org_ids - self.orgs.keys():
            found = dict(self.session.execute(select(TestCohortOrg.org_id, TestCohortOrg.cohort_id).where(TestCohortOrg.org_id.in_(missing))).all())  # type: ignore[attr-defined]
            self.orgs.update({org_id: found.get(org_id, REAL) for org_id in missing})
        if missing := emails - self.emails.keys():
            test = {email for email in missing if is_test_address(email)}
            found = dict(self.session.execute(
                select(func.lower(User.email), TestPersona.cohort_id).join(TestPersona, TestPersona.user_id == User.id).where(func.lower(User.email).in_(test))
            ).all()) if test else {}
            # A test address no persona holds yet belongs to no world, so it can't connect two.
            self.emails.update({email: (found.get(email) if email in test else REAL) for email in missing})


class _Row:
    """The people one row names."""

    def __init__(self) -> None:
        self.users: set[int] = set()
        self.orgs: set[int] = set()
        self.strict_orgs: set[int] = set()
        self.emails: set[str] = set()


def people_columns(table) -> tuple[list[str], list[str], list[tuple[str, str]]]:
    users, orgs, follows = [], [], []
    for column in table.columns:
        if (table.name, column.name) in IGNORED_COLUMNS:
            continue
        for fk in column.foreign_keys:
            target = fk.column.table.name
            if target == "user":
                users.append(column.name)
            elif target == "organization":
                orgs.append(column.name)
            elif target in FOLLOW_TARGETS:
                follows.append((column.name, target))
    return users, orgs, follows


def collect(session: Session, table, get, row: _Row, follow: bool = True, strict: bool = False) -> None:
    """Add the people a row of ``table`` names to ``row``; ``get(column)`` reads its values."""
    users, orgs, follows = people_columns(table)
    for name in users:
        if (value := get(name)) is not None:
            row.users.add(int(value))
    for name in orgs:
        if (value := get(name)) is not None:
            (row.strict_orgs if strict else row.orgs).add(int(value))
    if (email_column := EMAIL_COLUMNS.get(table.name)) and (email := get(email_column)):
        row.emails.add(str(email).strip().lower())
    if not follow:
        return
    targets = dict(follows)
    for (table_name, column), target in STRICT_FOLLOWS.items():
        if table_name == table.name:
            targets[column] = target
    for column, target in targets.items():
        value = get(column)
        parent_class = class_for(target)
        if value is None or parent_class is None:
            continue
        parent = session.get(parent_class, value)
        if parent is not None:
            collect(session, sa_inspect(parent).mapper.local_table, lambda name, p=parent: getattr(p, name, None),
                    row, follow=False, strict=(table.name, column) in STRICT_FOLLOWS)


@functools.cache
def class_for(table_name: str):
    from sqlmodel import SQLModel

    for mapper in SQLModel._sa_registry.mappers:  # type: ignore[attr-defined]
        if mapper.local_table is not None and mapper.local_table.name == table_name:
            return mapper.class_
    return None


def _changed_people(obj) -> bool:
    """True when an updated row changed a column that names a person, org or address."""
    state = sa_inspect(obj)
    table = state.mapper.local_table
    users, orgs, follows = people_columns(table)
    names = set(users) | set(orgs) | {name for name, _ in follows}
    if email_column := EMAIL_COLUMNS.get(table.name):
        names.add(email_column)
    return any(state.attrs[name].history.has_changes() for name in names if name in state.attrs)


def worlds_of(session: Session, row: _Row, worlds: Worlds) -> set[int]:
    worlds.load(row.users, row.orgs | row.strict_orgs, row.emails)
    found = {worlds.users[user_id] for user_id in row.users}
    found |= {worlds.orgs[org_id] for org_id in row.orgs if org_id not in worlds.new_org_ids | {worlds.owner_org_id}}
    found |= {worlds.orgs[org_id] for org_id in row.strict_orgs if org_id not in worlds.new_org_ids}
    found |= {world for email in row.emails if (world := worlds.emails.get(email)) is not None}
    return found


def check_object(session: Session, obj, worlds: Worlds, is_new: bool) -> None:
    table = sa_inspect(obj).mapper.local_table.name
    if table in SKIP_TABLES:
        return
    if table == "user":
        _check_persona_identity(session, obj, worlds, is_new)
        return
    if not is_new and not _changed_people(obj) and not _publishes(obj, table):
        return
    row = _Row()
    collect(session, sa_inspect(obj).mapper.local_table, lambda name: getattr(obj, name, None), row)
    if not (row.users or row.orgs or row.strict_orgs or row.emails):
        return
    found = worlds_of(session, row, worlds)
    if len(found) > 1:
        logger.warning("Cohort seal refused a %s row linking worlds %s", table, sorted(found))
        raise CohortSealError(
            "Test personas and test orgs are sealed off from real people and orgs, so this can't be saved.",
            {"table": table},
        )
    tested = found - {REAL}
    if tested and (table in TEST_FORBIDDEN_TABLES or _publishes(obj, table)):
        logger.warning("Cohort seal refused a public %s write from test cohort %s", table, sorted(tested))
        raise CohortSealError("Test personas and test orgs can't publish, bill or hand out access.", {"table": table})


def _publishes(obj, table: str) -> bool:
    state = sa_inspect(obj)
    return any(
        (table, name) in TEST_FORBIDDEN_COLUMNS and getattr(obj, name, None) is not None and state.attrs[name].history.has_changes()
        for name in state.attrs.keys()
    )


def _check_persona_identity(session: Session, obj, worlds: Worlds, is_new: bool) -> None:
    if is_new or obj.id is None:
        return
    state = sa_inspect(obj)
    changed = [name for name in PERSONA_LOCKED_COLUMNS if state.attrs[name].history.has_changes()]
    if not changed:
        return
    worlds.load({int(obj.id)}, set(), set())
    if worlds.users.get(int(obj.id), REAL) != REAL:
        logger.warning("Cohort seal refused a change to persona %s: %s", obj.id, changed)
        raise CohortSealError("Test personas can't change their email, password or platform role.", {"fields": changed})


def after_flush(session: Session, _flush_context) -> None:
    from src.services.demo.context import current_demo

    candidates = [(obj, True) for obj in session.new] + [(obj, False) for obj in session.dirty]
    # A demo visitor copy is private to one visitor: published personas act there freely.
    if not candidates or current_demo.get() or not tables_ready(session):
        return
    with session.no_autoflush:
        new_orgs = {int(obj.id) for obj, is_new in candidates if is_new and sa_inspect(obj).mapper.local_table.name == "organization" and obj.id}
        worlds = Worlds(session, new_orgs)
        for obj, is_new in candidates:
            check_object(session, obj, worlds, is_new)


def install() -> None:
    """Register the seal for every session. Safe to call more than once."""
    if not event.contains(Session, "after_flush", after_flush):
        event.listen(Session, "after_flush", after_flush)
