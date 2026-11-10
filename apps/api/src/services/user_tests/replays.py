"""Replays: run a story again with fresh personas, for example after a fix.

The new cohort gets the same personas (names, briefs, starting state and test orgs) and the same
stages, so its run board and report compare directly with the first run's. Nothing is copied
from what the first run's personas did: every replay starts clean.
"""

from __future__ import annotations

import re

from sqlmodel import Session, select

from src.db.organizations import Organization
from src.db.user_tests import TestCohort, TestCohortOrg, TestPersona
from src.db.users import User
from src.services.user_tests import cohorts, personas, stories
from src.services.user_tests.cohorts import get_cohort

RUN_SUFFIX = re.compile(r"\s+·\s+run\s+\d+$")


def _name(db: Session, cohort: TestCohort) -> str:
    base = RUN_SUFFIX.sub("", cohort.name)
    runs = db.exec(select(TestCohort.name).where(TestCohort.name.like(f"{base}%"))).all()  # type: ignore[attr-defined]
    numbers = [int(match.group(1)) for name in runs if (match := re.search(r"·\s+run\s+(\d+)$", name))]
    return f"{base} · run {max(numbers, default=1) + 1}"[:120]


async def replay(db: Session, cohort_uuid: str, actor_id: int, days: int = 7) -> dict:
    source = get_cohort(db, cohort_uuid)
    rows = db.exec(
        select(TestPersona, User).join(User, User.id == TestPersona.user_id)
        .where(TestPersona.cohort_id == source.id).order_by(TestPersona.creation_date, TestPersona.user_id)
    ).all()
    org_names = {
        created_by: name for created_by, name in db.exec(
            select(TestCohortOrg.created_by_user_id, Organization.name)
            .join(Organization, Organization.id == TestCohortOrg.org_id).where(TestCohortOrg.cohort_id == source.id)
        ).all()
    }
    made = cohorts.create_cohort(db, actor_id, cohorts.CreateCohort(name=_name(db, source), days=days, notes=f"Replay of {source.name}. {source.notes}".strip()))
    handles: dict[str, str] = {}
    if rows:
        body = personas.CreatePersonas(personas=[
            personas.CreatePersona(
                first_name=user.first_name or persona.handle, last_name=user.last_name or "", brief=persona.brief,
                start_state=persona.start_state,  # type: ignore[arg-type]
                org_name=org_names.get(user.id, "") if persona.start_state == "org_owner" else "",
            )
            for persona, user in rows
        ])
        created = await personas.create_personas(db, made["cohort_uuid"], body)
        handles = {persona.handle: new["handle"] for (persona, _), new in zip(rows, created)}
    if source.stages:
        stories.set_stages(db, made["cohort_uuid"], stories.SetStages(stages=[
            stories.Stage(key=stage["key"], title=stage["title"], goal=stage.get("goal", ""),
                          after=stories.After(persona=handles.get(stage["after"]["persona"], stage["after"]["persona"]), stage=stage["after"]["stage"]) if stage.get("after") else None)
            for stage in source.stages
        ]))
    return cohorts.serialize(db, get_cohort(db, made["cohort_uuid"]), detail=True)
