"""Opt-in capacity probe for an already seeded, disposable demo test database.

Run from apps/api with LAUNCHLMS_SQL_CONNECTION_STRING ending in a test database.
Never run against a production database: this probe revokes existing demo sessions.
"""

import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from sqlmodel import Session, select
from src.core.events.database import engine
from src.db.demo import DemoSession, DemoConfiguration
from src.db.users import User
from src.services.demo.lifecycle import start, end, cleanup
from src.services.demo.namespaces import visitor_session

assert "test" in str(engine.url.database), "Requires a disposable test database"
with Session(engine) as db:
    source_id = db.get(DemoConfiguration, 1).source_user_id
    source_bio = db.get(User, source_id).bio
    for previous in db.exec(
        select(DemoSession).where(DemoSession.state.in_(["active", "preparing"]))
    ).all():
        end(db, previous.id)
    while cleanup(db, engine):
        pass
print("Clean test database; starting capacity probe", flush=True)
started = time.monotonic()
identifiers = []


def provision(index):
    with Session(engine) as db:
        session = start(db, engine, f"load-visitor-{index}", source_id)
        return session.id, session.namespace


try:
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = [pool.submit(provision, index) for index in range(200)]
        for future in as_completed(futures):
            identifiers.append(future.result())
            if len(identifiers) % 25 == 0:
                print("provisioned", len(identifiers), flush=True)

    def exercise(item):
        identifier, namespace = item
        with visitor_session(engine, namespace, identifier) as db:
            user = db.get(User, source_id)
            user.bio = f"Private edit {identifier}"
            db.add(user)
            db.commit()
            return db.get(User, source_id).bio == f"Private edit {identifier}"

    with ThreadPoolExecutor(max_workers=20) as pool:
        assert all(pool.map(exercise, identifiers))
    with Session(engine) as db:
        assert db.get(User, source_id).bio == source_bio
        try:
            start(db, engine, "over-capacity", source_id)
        except Exception as exc:
            assert getattr(exc, "status_code", None) == 503
        else:
            raise AssertionError("Capacity exceeded")
    print(
        json.dumps(
            {
                "sessions": len(identifiers),
                "parallel_provision_workers": 12,
                "parallel_edit_workers": 20,
                "elapsed_seconds": round(time.monotonic() - started, 2),
                "isolation": "passed",
                "capacity_rejection": "passed",
            }
        ),
        flush=True,
    )
finally:
    with Session(engine) as db:
        for identifier, namespace in identifiers:
            end(db, identifier)
        for _ in range(25):
            cleanup(db, engine)
    engine.dispose()
