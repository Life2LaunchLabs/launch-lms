"""Focused boundary tests, plus opt-in PostgreSQL namespace integration."""

import os
from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlmodel import Session, SQLModel, select
from src.db.demo import DemoConfiguration, DemoSession, DemoUsage, DemoCheckpoint
from src.db.users import User
from src.services.demo.budgets import reserve
from src.services.demo.checkpoints import encode_value, scrub_json
from src.services.demo.context import DemoContext, cache_key, current_demo
from src.services.demo.lifecycle import active_session, end, extend, start
from src.services.demo.namespaces import remap, validate_namespace, visitor_session


@pytest.fixture
def control():
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(
        engine,
        tables=[
            DemoConfiguration.__table__,
            DemoSession.__table__,
            DemoUsage.__table__,
            DemoCheckpoint.__table__,
        ],
    )
    with Session(engine) as db:
        db.add(DemoConfiguration())
        db.commit()
        yield engine, db


def test_revocation_expiry_and_extension_preserve_visitor(control):
    engine, db = control
    identifier = uuid4().hex
    db.add(
        DemoSession(
            id=identifier,
            namespace=f"demo_{identifier}",
            checkpoint_id="checkpoint",
            visitor_id="visitor",
            state="active",
            expires_at=datetime.utcnow() + timedelta(minutes=4),
        )
    )
    db.commit()
    assert extend(db, identifier).visitor_id == "visitor"
    assert active_session(db, identifier).expires_at > datetime.utcnow() + timedelta(
        minutes=20
    )
    end(db, identifier)
    end(db, identifier)  # idempotent
    with pytest.raises(HTTPException) as error:
        active_session(db, identifier)
    assert error.value.status_code == 401


def test_usage_is_reserved_before_calls_and_shared_across_resets(control):
    engine, db = control
    config = db.get(DemoConfiguration, 1)
    config.ai_tokens_per_visitor = 2000
    config.ai_tokens_per_day = 5000
    db.add(config)
    db.commit()
    first = current_demo.set(DemoContext("first", "demo_" + "a" * 32, "same-visitor"))
    try:
        reserve(engine, 1500)
    finally:
        current_demo.reset(first)
    second = current_demo.set(
        DemoContext("replacement", "demo_" + "b" * 32, "same-visitor")
    )
    try:
        with pytest.raises(HTTPException) as error:
            reserve(engine, 600)
        assert error.value.status_code == 429
    finally:
        current_demo.reset(second)
    assert (
        db.exec(select(DemoUsage).where(DemoUsage.id.startswith("day:"))).one().tokens
        == 1500
    )


def test_identifiers_nested_references_and_private_keys():
    identifier = "a" * 32
    data = {
        "user": [{"id": 9, "user_uuid": "user_original", "email": "demo@example.test"}],
        "organization": [{"org_uuid": "org_original"}],
        "plan": [
            {
                "plan_uuid": "plan_original",
                "data": {
                    "user_original": "https://live.example/content/users/user_original/media/file.png"
                },
            }
        ],
    }
    copied, mapping = remap(data, identifier)
    assert copied["user"][0]["user_uuid"] != "user_original"
    assert copied["user"][0]["email"] == "demo@example.test"
    assert mapping["user_original"] in copied["plan"][0]["data"]
    assert copied["plan"][0]["data"][mapping["user_original"]].startswith("/content/")
    assert "user_original" not in str(copied)
    assert scrub_json({"nested": {"api_key": "secret", "title": "Plan"}}) == {
        "nested": {"api_key": None, "title": "Plan"}
    }
    assert encode_value(b"example") == {"$bytes": "ZXhhbXBsZQ=="}
    with pytest.raises(ValueError):
        validate_namespace("public; DROP SCHEMA public")


def test_cache_keys_do_not_overlap_live_or_other_visitors():
    assert cache_key("session:9") == "session:9"
    token = current_demo.set(DemoContext("first", "demo_" + "a" * 32, "visitor"))
    try:
        assert cache_key("session:9") == "demo:first:session:9"
    finally:
        current_demo.reset(token)


def test_checkpoint_media_copies_embedded_urls_and_binary_board_uploads(
    tmp_path, monkeypatch
):
    from pathlib import Path
    from src.services.demo.media import capture_files, write_files, clean_files
    from src.services.utils import storage

    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(storage, "get_content_delivery_type", lambda: "filesystem")
    monkeypatch.setattr(storage, "get_storage_client", lambda: None)
    original = Path("content/users/user_source/media/avatar.png")
    board_file = Path("content/orgs/org_source/boards/board_source/uploads/image.png")
    for path in (original, board_file):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"checkpoint image")
    rows = {
        "user": [
            {
                "id": 1,
                "user_uuid": "user_source",
                "profile": '<img src="https://live.example/api/v1/content/users/user_source/media/avatar.png">',
            }
        ],
        "organization": [{"id": 1, "org_uuid": "org_source"}],
        "board": [{"id": 1, "org_id": 1, "board_uuid": "board_source"}],
    }
    files = capture_files(rows, 1)
    assert set(files) == {str(original), str(board_file)}
    identifier = "c" * 32
    copied, aliases = remap(rows, identifier)
    assert 'src="/content/' in copied["user"][0]["profile"]
    paths = write_files(files, aliases)
    assert all(Path(path).read_bytes() == b"checkpoint image" for path in paths)
    clean_files(identifier)
    assert all(not Path(path).exists() for path in paths)
    assert original.exists() and board_file.exists()


def test_email_is_simulated_without_reading_delivery_credentials(monkeypatch):
    from src.services.email import utils

    def unexpected_delivery():
        raise AssertionError("A visitor must not initialize email delivery")

    monkeypatch.setattr(utils, "get_launchlms_config", unexpected_delivery)
    token = current_demo.set(DemoContext("copy", "demo_" + "a" * 32, "visitor"))
    try:
        assert (
            utils.send_email("example@example.com", "Invitation", "Try this plan")[
                "delivered"
            ]
            is False
        )
    finally:
        current_demo.reset(token)


def test_operator_controls_recheck_live_permission_and_deny_visitors(monkeypatch):
    from types import SimpleNamespace
    from src.services.demo import access

    actor = SimpleNamespace(id=7)
    db = SimpleNamespace(get=lambda *args: actor)
    payload = {"sub": "source@example.test", "demo_operator": 7}
    monkeypatch.setattr(access, "claims", lambda request: payload)
    monkeypatch.setattr(access, "is_user_superadmin", lambda *args: True)
    monkeypatch.setattr(access, "is_user_owner_org_admin", lambda *args: False)
    assert access.operator(None, db) is actor
    monkeypatch.setattr(access, "is_user_superadmin", lambda *args: False)
    with pytest.raises(HTTPException) as revoked:
        access.operator(None, db)
    assert revoked.value.status_code == 403
    payload.clear()
    payload.update(sub="demo@example.test", demo_session="private")
    with pytest.raises(HTTPException) as visitor:
        access.operator(None, db)
    assert visitor.value.status_code == 403


def test_stale_checkpoint_revision_is_rejected_before_capture(control):
    from src.services.demo.lifecycle import publish

    engine, db = control
    with pytest.raises(HTTPException) as error:
        publish(db, 1, 99)
    assert error.value.status_code == 409


def test_background_admission_pins_checkpoint_and_reserves_capacity(control):
    from src.services.demo.lifecycle import admit
    from src.services.demo.namespaces import schema_signature

    engine, db = control
    checkpoint = DemoCheckpoint(
        id="release",
        schema_signature=schema_signature(),
        created_by=1,
        source_user_id=2,
        source_email="demo@example.com",
        entry_org_slug="demo",
        data={},
    )
    db.add(checkpoint)
    config = db.get(DemoConfiguration, 1)
    config.enabled, config.capacity, config.checkpoint_id = True, 1, checkpoint.id
    db.add(config)
    db.commit()
    admitted = admit(db, "visitor")
    assert admitted.state == "preparing" and admitted.checkpoint_id == "release"
    assert admitted.duration_minutes == 60
    with pytest.raises(HTTPException) as error:
        admit(db, "second")
    assert error.value.status_code == 503
    db.rollback()
    end(db, admitted.id)
    assert admit(db, "replacement").state == "preparing"


def test_clean_pool_is_bounded_and_disabled_without_ending_visitors(control):
    from src.services.demo.worker import replenish
    from src.services.demo.lifecycle import admit
    from src.services.demo.namespaces import schema_signature

    engine, db = control
    db.add(
        DemoCheckpoint(
            id="release",
            schema_signature=schema_signature(),
            created_by=1,
            source_user_id=2,
            source_email="demo@example.com",
            entry_org_slug="demo",
            data={},
        )
    )
    config = db.get(DemoConfiguration, 1)
    config.enabled, config.capacity, config.checkpoint_id = True, 2, "release"
    db.add(config)
    db.commit()
    replenish(engine)
    db.expire_all()
    slots = db.exec(select(DemoSession)).all()
    assert len(slots) == 2 and all(not slot.visitor_id for slot in slots)
    slots[0].state = "available"
    db.add(slots[0])
    db.commit()
    visitor = admit(db, "visitor")
    assert visitor.id == slots[0].id and visitor.state == "active"
    replenish(engine)
    assert len(db.exec(select(DemoSession)).all()) == 2
    config = db.get(DemoConfiguration, 1)
    config.enabled = False
    db.add(config)
    db.commit()
    replenish(engine)
    db.expire_all()
    assert db.get(DemoSession, visitor.id).state == "active"
    assert all(
        slot.ended_at
        for slot in db.exec(
            select(DemoSession).where(DemoSession.visitor_id == "")
        ).all()
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("allowance,allowed", [(1000, False), (100000, True)])
async def test_demo_ai_reserves_before_provider_network(
    control, monkeypatch, allowance, allowed
):
    import httpx
    from src.core.events import database
    from src.services.hub_advisor import AdvisorMessage, OpenAIResponsesProvider

    engine, db = control
    config = db.get(DemoConfiguration, 1)
    config.ai_tokens_per_visitor = config.ai_tokens_per_day = allowance
    db.add(config)
    db.commit()
    monkeypatch.setattr(database, "engine", engine)
    calls = []

    async def handler(request):
        calls.append(request)
        return httpx.Response(
            200,
            json={
                "model": "gpt-test",
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {"type": "output_text", "text": "Explore your next step."}
                        ],
                    }
                ],
            },
        )

    token = current_demo.set(DemoContext("copy", "demo_" + "a" * 32, "visitor"))
    try:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = OpenAIResponsesProvider("test-only", "gpt-test", client)
            if allowed:
                result = await provider.respond(
                    [AdvisorMessage("user", "What next?")], "visitor"
                )
                assert result.text == "Explore your next step."
                assert len(calls) == 1
                assert db.exec(
                    select(DemoUsage).where(DemoUsage.id.startswith("day:"))
                ).one().tokens > len(calls[0].content)
            else:
                with pytest.raises(HTTPException) as error:
                    await provider.respond(
                        [AdvisorMessage("user", "What next?")], "visitor"
                    )
                assert error.value.status_code == 429
                assert not calls
    finally:
        current_demo.reset(token)


@pytest.mark.skipif(
    not os.environ.get("DEMO_TEST_DATABASE_URL"),
    reason="Requires disposable PostgreSQL",
)
def test_checkpoint_excludes_private_peer_work_and_credentials():
    url = os.environ["DEMO_TEST_DATABASE_URL"]
    assert "test" in url.rsplit("/", 1)[-1]
    from src.core.events.database import import_all_models
    from src.db.boards import Board
    from src.db.planning import Plan
    from src.services.demo.checkpoints import capture

    import_all_models()
    engine = create_engine(url)
    with Session(engine) as db:
        db.add(
            Board(
                id=90001,
                board_uuid="board_peer_private_test",
                name="Peer private",
                org_id=1,
                created_by=1,
                public=False,
            )
        )
        db.add(
            Plan(
                id=90001,
                plan_uuid="plan_peer_private_test",
                slug="peer-private-test",
                name="Peer private",
                subject_user_id=1,
                owner_user_id=1,
                source_org_id=1,
            )
        )
        db.flush()
        snapshot = capture(db, 2, 1)
        assert not any(
            row["board_uuid"] == "board_peer_private_test"
            for row in snapshot.get("board", [])
        )
        assert not any(
            row["plan_uuid"] == "plan_peer_private_test"
            for row in snapshot.get("plan", [])
        )
        assert snapshot["plan"][0]["source_org_id"] == 1
        for user in snapshot["user"]:
            assert user["password"] == "!demo-login-disabled"
            assert user["is_superadmin"] is False
            if user["id"] != 2:
                assert user["profile"] == {} and user["bio"] == ""
        assert not set(snapshot) & {
            "apitoken",
            "hubadvisorproviderconfiguration",
            "organizationinvitation",
        }
        db.rollback()
    engine.dispose()


@pytest.mark.skipif(
    not os.environ.get("DEMO_TEST_DATABASE_URL"),
    reason="Requires dedicated disposable PostgreSQL database",
)
def test_postgres_copy_isolation_and_end_revocation():
    url = os.environ["DEMO_TEST_DATABASE_URL"]
    assert "test" in url.rsplit("/", 1)[-1], (
        "Only disposable test databases are allowed"
    )
    from src.core.events.database import import_all_models

    import_all_models()
    engine = create_engine(url, pool_size=5)
    identifiers = []
    try:
        with Session(engine) as db:
            first = start(db, engine, "integration-first")
            identifiers.append(first.id)
            second = start(db, engine, "integration-second")
            identifiers.append(second.id)
            source = db.get(User, 2)
            original = source.first_name
            with visitor_session(engine, first.namespace, first.id) as isolated:
                user = isolated.get(User, 2)
                user.first_name = "Only in first copy"
                isolated.add(user)
                isolated.commit()
                from src.db.resources import ResourceSearchDocument
                from src.services.demo.namespaces import vector_distance

                embedding = [1.0] + [0.0] * 383
                document = isolated.exec(
                    select(ResourceSearchDocument).where(
                        ResourceSearchDocument.resource_id == 1
                    )
                ).first()
                document = document or ResourceSearchDocument(
                    resource_id=1,
                    org_id=1,
                    document_version="test",
                    content_hash="test",
                    title="Test",
                )
                document.embedding = embedding
                isolated.add(document)
                isolated.commit()
                context = current_demo.set(
                    DemoContext(first.id, first.namespace, "integration-first")
                )
                try:
                    distance = vector_distance(
                        ResourceSearchDocument.embedding, embedding
                    )
                    assert (
                        isolated.exec(
                            select(distance).where(
                                ResourceSearchDocument.resource_id == 1
                            )
                        ).one()
                        == 0
                    )
                finally:
                    current_demo.reset(context)
            with visitor_session(engine, second.namespace, second.id) as isolated:
                assert isolated.get(User, 2).first_name == original
            db.refresh(source)
            assert source.first_name == original
            end(db, first.id)
            with pytest.raises(HTTPException) as error:
                with visitor_session(engine, first.namespace, first.id) as isolated:
                    isolated.get(User, 2)
            assert error.value.status_code == 401
    finally:
        from src.services.demo.lifecycle import cleanup

        with Session(engine) as db:
            for identifier in identifiers:
                end(db, identifier)
            cleanup(db, engine)
        engine.dispose()
