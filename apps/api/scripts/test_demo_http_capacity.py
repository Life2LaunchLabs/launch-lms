"""Exercise 200 HTTP demo admissions and copies against disposable local fixtures."""

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit

import httpx
from sqlmodel import Session, select
from src.core.events.database import engine
from src.db.demo import DemoConfiguration, DemoSession, DemoCheckpoint
from src.db.users import User
from src.services.demo.lifecycle import cleanup, end
from src.services.demo.namespaces import visitor_session

api = os.environ.get("DEMO_TEST_API_URL", "http://127.0.0.1:19001/api/v1").rstrip("/")
assert "test" in str(engine.url.database), "Requires a disposable test database"
assert urlsplit(api).hostname in {"localhost", "127.0.0.1"}, "Requires a local test API"
with Session(engine) as db:
    configuration = db.get(DemoConfiguration, 1)
    checkpoint = db.get(DemoCheckpoint, configuration.checkpoint_id)
    pilot_ids = [int(identifier) for identifier in checkpoint.pilots] or [
        configuration.source_user_id
    ]
    originals = {identifier: db.get(User, identifier).bio for identifier in pilot_ids}
    cohort_size = len(checkpoint.data["rows"]["user"])
    for previous in db.exec(
        select(DemoSession).where(
            DemoSession.state.in_(["active", "preparing", "provisioning"])
        )
    ).all():
        end(db, previous.id)
    while cleanup(db, engine):
        pass

visits = []
started = time.monotonic()
with httpx.Client(timeout=60, limits=httpx.Limits(max_connections=40)) as client:

    def admit(index):
        pilot_id = pilot_ids[index % len(pilot_ids)]
        response = client.post(api + "/demo/start", json={"user_id": pilot_id})
        assert response.status_code == 202, (
            response.status_code,
            response.json().get("detail"),
        )
        return {
            "index": index,
            "pilot_id": pilot_id,
            "ticket": response.json()["pending_token"],
        }

    try:
        with ThreadPoolExecutor(max_workers=32) as pool:
            visits = list(pool.map(admit, range(200)))
        admission_seconds = time.monotonic() - started
        assert (
            client.post(api + "/demo/start", json={"user_id": pilot_ids[0]}).status_code
            == 503
        )
        print(
            json.dumps(
                {
                    "admitted": 200,
                    "admission_seconds": round(admission_seconds, 2),
                    "over_capacity": 503,
                }
            ),
            flush=True,
        )

        def ready(visit):
            response = client.get(
                api + "/demo/ready",
                headers={"Cookie": "demo_pending_cookie=" + visit["ticket"]},
            )
            response.raise_for_status()
            data = response.json()
            if data.get("tokens"):
                visit["token"] = data["tokens"]["access_token"]

        deadline = time.monotonic() + 600
        while any("token" not in visit for visit in visits):
            assert time.monotonic() < deadline, "Preparation timed out"
            with ThreadPoolExecutor(max_workers=24) as pool:
                list(
                    pool.map(ready, [visit for visit in visits if "token" not in visit])
                )
            print("ready", sum("token" in visit for visit in visits), flush=True)
            time.sleep(2)
        with Session(engine) as db:
            sessions = db.exec(
                select(DemoSession).where(DemoSession.state == "active")
            ).all()
            assert len(sessions) == 200
            for session in sessions:
                with visitor_session(engine, session.namespace, session.id) as copy:
                    assert len(copy.exec(select(User)).all()) == cohort_size
                    user = copy.get(User, session.pilot_user_id)
                    user.bio = "Private edit " + session.id
                    copy.add(user)
                    copy.commit()

        def verify(visit):
            response = client.get(
                api + "/users/session",
                headers={"Authorization": "Bearer " + visit["token"]},
            )
            response.raise_for_status()
            user = response.json()["user"]
            assert user["id"] == visit["pilot_id"]
            from src.security.auth import decode_jwt

            identifier = decode_jwt(visit["token"])["demo_session"]
            assert user["bio"] == "Private edit " + identifier

        with ThreadPoolExecutor(max_workers=24) as pool:
            list(pool.map(verify, visits))
        with Session(engine) as db:
            assert all(
                db.get(User, identifier).bio == original
                for identifier, original in originals.items()
            )
        print(
            json.dumps(
                {
                    "sessions": 200,
                    "pilots": len(pilot_ids),
                    "cohort_members_per_copy": cohort_size,
                    "concurrent_http_workers": 32,
                    "isolation": "passed",
                    "live_unchanged": True,
                    "elapsed_seconds": round(time.monotonic() - started, 2),
                }
            ),
            flush=True,
        )
    finally:
        for visit in visits:
            headers = (
                {"Authorization": "Bearer " + visit["token"]}
                if visit.get("token")
                else {"Cookie": "demo_pending_cookie=" + visit["ticket"]}
            )
            client.post(api + "/demo/end", headers=headers)
        with Session(engine) as db:
            while cleanup(db, engine):
                pass
engine.dispose()
