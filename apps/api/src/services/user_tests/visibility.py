"""Keeping test personas and test orgs out of what real users see.

A real viewer never sees a persona or a test org. A persona sees real people (it can't reach
them: the cohort seal refuses any link) and its own cohort, never another cohort.
"""

from __future__ import annotations

from sqlalchemy import exists, true
from sqlmodel import Session
from src.db.user_tests import TestCohortOrg, TestPersona


def _ready(db: Session) -> bool:
    from src.services.user_tests.seal import tables_ready

    return hasattr(db, "get_bind") and tables_ready(db)  # stand-in sessions in unit tests have no tables


def viewer_cohort(db: Session, viewer_id: int | None) -> int | None:
    persona = db.get(TestPersona, int(viewer_id)) if viewer_id else None
    return persona.cohort_id if persona else None


def visible_people(db: Session, viewer_id: int | None, user_id_column):
    """A WHERE clause for queries listing accounts: hides personas outside the viewer's world."""
    if not _ready(db):
        return true()
    cohort = viewer_cohort(db, viewer_id)
    hidden = exists().where(TestPersona.user_id == user_id_column)
    if cohort is not None:
        hidden = hidden.where(TestPersona.cohort_id != cohort)
    return ~hidden


def visible_orgs(db: Session, viewer_id: int | None, org_id_column):
    """A WHERE clause for queries listing orgs: hides test orgs outside the viewer's cohort."""
    if not _ready(db):
        return true()
    cohort = viewer_cohort(db, viewer_id)
    hidden = exists().where(TestCohortOrg.org_id == org_id_column)
    if cohort is not None:
        hidden = hidden.where(TestCohortOrg.cohort_id != cohort)
    return ~hidden


def is_test_org(db: Session, org_id: int | None) -> bool:
    return bool(org_id) and _ready(db) and db.get(TestCohortOrg, int(org_id)) is not None  # type: ignore[arg-type]

