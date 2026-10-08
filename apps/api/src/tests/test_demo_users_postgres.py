"""Deep copy and main-org publication against a disposable PostgreSQL database."""

import os
from datetime import datetime
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlmodel import Session, select

pytestmark = pytest.mark.skipif(
    not os.environ.get("DEMO_TEST_DATABASE_URL"),
    reason="Requires disposable PostgreSQL database",
)


@pytest.fixture
def world(tmp_path, monkeypatch):
    url = os.environ["DEMO_TEST_DATABASE_URL"]
    assert "test" in url.rsplit("/", 1)[-1]
    from src.core.events.database import import_all_models

    import_all_models()
    from src.db.demo import DemoConfiguration, DemoMember
    from src.db.learning import (
        LearningBadge,
        LearningBadgeAward,
        LearningBadgeVersion,
        LearningPath,
        LearningRun,
    )
    from src.db.organizations import Organization
    from src.db.planning import Plan, PlanPhase
    from src.db.portfolio import Portfolio, ProjectItem
    from src.db.roles import Role
    from src.db.user_organizations import UserOrganization
    from src.db.users import User
    from src.security.security import security_hash_password

    # Stored files resolve relative to the working directory.
    monkeypatch.chdir(tmp_path)
    media = Path("content/users/user_outside_owner/media")
    media.mkdir(parents=True)
    (media / "evidence.png").write_bytes(b"\x89PNG\r\n\x1a\nevidence")

    engine = create_engine(url)
    with engine.begin() as conn:
        for table in (
            "demomember democonfiguration demosession democheckpoint learningbadgeaward "
            "learningrun learningpath learningbadgeversion learningbadge projectitem "
            "portfolio planphase plancollaborator plan userorganization role "
            '"user" organization'
        ).split():
            conn.execute(text(f"TRUNCATE {table} RESTART IDENTITY CASCADE"))
    db = Session(engine)
    now = str(datetime.now())
    db.add(
        Organization(
            id=1,
            org_uuid="org_main",
            slug="life2launch",
            name="Life2Launch",
            email="m@example.com",
        )
    )
    db.add(
        Organization(
            id=2,
            org_uuid="org_school",
            slug="oregon-high",
            name="Oregon High",
            email="s@example.com",
        )
    )
    db.add(
        Organization(
            id=3,
            org_uuid="org_unrelated",
            slug="unrelated",
            name="Unrelated",
            email="u@example.com",
        )
    )
    for identifier in (1, 2, 4):
        db.add(Role(id=identifier, name=f"Role {identifier}"))
    db.add(
        User(
            id=10,
            user_uuid="user_admin",
            username="admin",
            email="admin@example.com",
            first_name="Admin",
            last_name="",
            is_superadmin=True,
        )
    )
    db.add(
        User(
            id=11,
            user_uuid="user_source",
            username="sam",
            email="sam@example.com",
            first_name="Sam",
            last_name="Real",
            avatar_image="avatar.png",
            password=security_hash_password("consented"),
            profile={"cover": "/content/users/user_source/covers/c.png"},
        )
    )
    db.add(
        User(
            id=12,
            user_uuid="user_outside_owner",
            username="teacher",
            email="teacher@example.com",
            first_name="Real",
            last_name="Teacher",
        )
    )
    db.flush()
    for user_id, org_id, role in ((11, 1, 4), (11, 2, 4), (11, 3, 4), (12, 1, 4)):
        db.add(
            UserOrganization(
                user_id=user_id,
                org_id=org_id,
                role_id=role,
                creation_date=now,
                update_date=now,
            )
        )
    db.add(LearningBadge(id=1, name="First Aid", status="published", org_id=1))
    db.flush()
    db.add(LearningBadgeVersion(id=1, badge_id=1, state="published", org_id=1))
    db.flush()
    db.add(LearningPath(id=1, badge_id=1, version_id=1))
    db.flush()
    db.add(
        LearningRun(
            id=1,
            run_uuid="run_source",
            badge_id=1,
            path_id=1,
            badge_version_id=1,
            org_id=1,
            user_id=11,
            started_at=datetime.utcnow(),
            data={"step": 3},
        )
    )
    db.flush()
    db.add(
        LearningBadgeAward(
            award_uuid="award_source",
            badge_id=1,
            badge_version_id=1,
            run_id=1,
            org_id=1,
            user_id=11,
            issued_at=datetime.utcnow(),
        )
    )
    db.add(
        Portfolio(
            id=1,
            portfolio_uuid="portfolio_source",
            user_id=11,
            short_bio="Real bio",
            visibility="public",
            moderation_status="approved",
            theme_settings={},
        )
    )
    db.flush()
    db.add(
        ProjectItem(
            portfolio_id=1,
            project_uuid="project_source",
            story_kind="project",
            title="Clinic volunteer",
            summary="See /api/v1/content/users/user_outside_owner/media/evidence.png",
            status="published",
            visibility="public",
            slug="clinic",
        )
    )
    db.add(
        Plan(
            id=1,
            plan_uuid="plan_source",
            slug="path-to-nursing",
            name="Path to nursing",
            status="active",
            subject_user_id=11,
            owner_user_id=11,
            source_org_id=2,
        )
    )
    db.flush()
    db.add(PlanPhase(phase_uuid="phase_source", plan_id=1, name="Junior year"))
    db.add(DemoConfiguration(id=1))
    db.commit()
    with engine.begin() as conn:
        for table in (
            "organization",
            "user",
            "learningbadge",
            "learningbadgeversion",
            "learningpath",
            "learningrun",
            "portfolio",
            "plan",
            "role",
        ):
            conn.execute(
                text(f"SELECT setval(pg_get_serial_sequence('\"{table}\"', 'id'), 100)")
            )
    from src.services.demo import users

    monkeypatch.setattr(users, "copy_user_files", lambda *args: None)
    monkeypatch.setattr(users, "check_rate_limit", lambda *args: (True, 0, 0))
    yield (
        db,
        engine,
        users,
        {
            "DemoMember": DemoMember,
            "User": User,
            "Run": LearningRun,
            "Award": LearningBadgeAward,
            "Portfolio": Portfolio,
            "Project": ProjectItem,
            "Plan": Plan,
            "Phase": PlanPhase,
            "Membership": UserOrganization,
        },
    )
    db.close()
    engine.dispose()


def test_copy_brings_the_whole_account_and_leaves_the_source_alone(world):
    db, _, users, M = world
    result = users.create_demo_user(
        db,
        10,
        users.CreateDemoUser(
            start_from="copy",
            first_name="Maya",
            last_name="Chen",
            source_email="sam@example.com",
            password="consented",
            orgs=[users.OrgChoice(slug="oregon-high")],
        ),
    )
    copy_id = result["user_id"]
    copy = db.get(M["User"], copy_id)
    run = db.exec(select(M["Run"]).where(M["Run"].user_id == copy_id)).one()
    award = db.exec(select(M["Award"]).where(M["Award"].user_id == copy_id)).one()
    portfolio = db.exec(
        select(M["Portfolio"]).where(M["Portfolio"].user_id == copy_id)
    ).one()
    project = db.exec(
        select(M["Project"]).where(M["Project"].portfolio_id == portfolio.id)
    ).one()
    plan = db.exec(select(M["Plan"]).where(M["Plan"].subject_user_id == copy_id)).one()
    phase = db.exec(select(M["Phase"]).where(M["Phase"].plan_id == plan.id)).one()
    # Shared catalog stays linked; personal rows are new and point at each other.
    assert run.badge_id == 1 and run.id != 1 and run.data == {"step": 3}
    assert award.run_id == run.id and award.award_uuid != "award_source"
    assert (
        portfolio.portfolio_uuid != "portfolio_source"
        and portfolio.short_bio == "Real bio"
    )
    assert project.title == "Clinic volunteer"
    assert plan.owner_user_id == copy_id and plan.slug.startswith("path-to-nursing-")
    assert phase.phase_uuid != "phase_source"
    assert copy.profile["cover"] == f"/content/users/{copy.user_uuid}/covers/c.png"
    # Only the chosen orgs plus the main org; the unrelated membership is not copied.
    orgs = {
        row.org_id
        for row in db.exec(
            select(M["Membership"]).where(M["Membership"].user_id == copy_id)
        )
    }
    assert orgs == {1, 2}
    assert result["copied"]["learningrun"] == 1 and result["copied"]["projectitem"] == 1
    assert db.exec(select(M["Run"]).where(M["Run"].user_id == 11)).one().id == 1
    assert (
        db.exec(select(M["Portfolio"]).where(M["Portfolio"].user_id == 11))
        .one()
        .portfolio_uuid
        == "portfolio_source"
    )


def test_preflight_and_publish_include_main_org_and_outside_files(world):
    db, engine, users, M = world
    created = users.create_demo_user(
        db,
        10,
        users.CreateDemoUser(
            start_from="copy",
            first_name="Maya",
            source_email="sam@example.com",
            password="consented",
            orgs=[users.OrgChoice(slug="oregon-high")],
        ),
    )
    from src.services.demo.lifecycle import preflight, publish
    from src.services.demo.namespaces import drop_namespace, materialize, remap

    report = preflight(db)
    assert report["ok"], report
    assert report["organizations"] == ["Life2Launch", "Oregon High"]
    [person] = report["users"]
    assert (
        person["badges"],
        person["badge_runs"],
        person["projects"],
        person["plans"],
    ) == (1, 1, 1, 1)
    outside = [item for item in report["warnings"] if item["kind"] == "outside_owner"]
    assert outside and outside[0]["table"] == "projectitem"
    assert not any(item["kind"] == "not_in_main_org" for item in report["warnings"])

    config_revision = db.exec(text("SELECT revision FROM democonfiguration")).scalar()
    checkpoint = publish(db, 10, config_revision)
    assert checkpoint.entry_org_slug == "life2launch"
    rows, files = checkpoint.data["rows"], checkpoint.data["files"]
    # The real teacher's identity never enters the snapshot, but their file does.
    assert not any("user_outside_owner" in path for path in files)
    assert "user_outside_owner" not in str(rows)
    assert str(created["user_id"]) in checkpoint.pilots
    session = "c" * 32
    data, aliases = remap(rows, session, files)
    namespace = f"demo_{session}"
    drop_namespace(engine, namespace)
    try:
        materialize(engine, namespace, data)
        with engine.connect() as conn:
            slugs = (
                conn.execute(
                    text(f'SELECT slug FROM "{namespace}".organization ORDER BY id')
                )
                .scalars()
                .all()
            )
            assert slugs == ["life2launch", "oregon-high"]
        assert all(
            f"_demo_{session}_" in path.replace(old, new)
            for path in files
            for old, new in aliases.items()
            if old in path
        )
    finally:
        drop_namespace(engine, namespace)


def test_publish_rejects_a_version_visitors_could_not_get(world, monkeypatch):
    db, engine, users, M = world
    users.create_demo_user(
        db,
        10,
        users.CreateDemoUser(
            start_from="copy",
            first_name="Maya",
            source_email="sam@example.com",
            password="consented",
            orgs=[users.OrgChoice(slug="oregon-high")],
        ),
    )
    from fastapi import HTTPException
    from src.services.demo import lifecycle, rehearsal

    real = rehearsal.materialize
    namespaces = []

    def broken(engine, namespace, data):
        namespaces.append(namespace)
        real(engine, namespace, data)
        raise ValueError("value too long for type character varying(120)")

    monkeypatch.setattr(rehearsal, "materialize", broken)
    revision = db.exec(text("SELECT revision FROM democonfiguration")).scalar()
    with pytest.raises(HTTPException) as rejected:
        lifecycle.publish(db, 10, revision)
    assert rejected.value.status_code == 422
    assert "character varying(120)" in rejected.value.detail
    db.rollback()
    assert db.exec(text("SELECT checkpoint_id FROM democonfiguration")).scalar() is None
    # The rehearsal workspace never outlives the publish attempt.
    with engine.connect() as conn:
        assert not conn.execute(
            text("SELECT 1 FROM pg_namespace WHERE nspname = :name"),
            {"name": namespaces[0]},
        ).first()


def test_failed_preparation_keeps_the_cause_for_operators(world, monkeypatch):
    db, engine, users, M = world
    created = users.create_demo_user(
        db,
        10,
        users.CreateDemoUser(
            start_from="copy",
            first_name="Maya",
            source_email="sam@example.com",
            password="consented",
            orgs=[users.OrgChoice(slug="oregon-high")],
        ),
    )
    from src.db.demo import DemoConfiguration, DemoSession
    from src.services.demo import lifecycle

    revision = db.exec(text("SELECT revision FROM democonfiguration")).scalar()
    lifecycle.publish(db, 10, revision)
    config = db.get(DemoConfiguration, 1)
    config.enabled = True
    db.add(config)
    db.commit()
    session = lifecycle.admit(db, "visitor", created["user_id"])
    identifier = session.id
    db.rollback()

    def disk_full(files, identifiers):
        raise OSError(28, "No space left on device")

    monkeypatch.setattr(lifecycle, "write_files", disk_full)
    assert not lifecycle.prepare(engine, identifier)
    db.expire_all()
    failed = db.get(DemoSession, identifier)
    assert failed.state == "failed"
    assert failed.error == "Workspace preparation failed. Please start again."
    assert "No space left on device" in failed.failure_detail
    from src.routers.demo import _preparation_error
    from src.services.demo.namespaces import drop_namespace

    assert "No space left" in _preparation_error(db, failed.checkpoint_id)
    drop_namespace(engine, failed.namespace)


def test_workspace_accepts_enums_the_live_schema_stores_as_text(world):
    """Migrations created some model enums as VARCHAR; their types never exist."""
    db, engine, users, M = world
    users.create_demo_user(
        db,
        10,
        users.CreateDemoUser(
            start_from="copy",
            first_name="Maya",
            source_email="sam@example.com",
            password="consented",
            orgs=[users.OrgChoice(slug="oregon-high")],
        ),
    )
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE learningvariable ALTER COLUMN value_type TYPE varchar "
                "USING value_type::text"
            )
        )
        conn.execute(text("DROP TYPE learningvariablevaluetype"))
        conn.execute(
            text(
                "INSERT INTO learningvariable (org_id, key, label, description, "
                "value_type, options, variable_uuid, creation_date, update_date) "
                "VALUES (1, 'goal', 'Goal', '', 'TEXT', '[]', 'var_goal', '', '')"
            )
        )
    from src.services.demo.lifecycle import publish
    from src.services.demo.namespaces import drop_namespace, materialize, remap

    try:
        revision = db.exec(text("SELECT revision FROM democonfiguration")).scalar()
        checkpoint = publish(db, 10, revision)
        assert checkpoint.data["rows"]["learningvariable"]
        session = "e" * 32
        namespace = f"demo_{session}"
        data, _ = remap(checkpoint.data["rows"], session, checkpoint.data["files"])
        drop_namespace(engine, namespace)
        try:
            materialize(engine, namespace, data)
            with engine.connect() as conn:
                assert (
                    conn.execute(
                        text(f'SELECT value_type FROM "{namespace}".learningvariable')
                    ).scalar()
                    == "TEXT"
                )
        finally:
            drop_namespace(engine, namespace)
    finally:
        db.rollback()
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM learningvariable"))
            from src.db.learning import LearningVariableValueType

            labels = ", ".join(f"'{item.name}'" for item in LearningVariableValueType)
            conn.execute(
                text(f"CREATE TYPE learningvariablevaluetype AS ENUM ({labels})")
            )
            conn.execute(
                text(
                    "ALTER TABLE learningvariable ALTER COLUMN value_type TYPE "
                    "learningvariablevaluetype USING value_type::learningvariablevaluetype"
                )
            )


def test_publish_includes_the_public_badge_catalog_of_every_org(world):
    """Visitors browse the same badge hub as live learners, not only their own badges."""
    db, engine, users, M = world
    users.create_demo_user(
        db,
        10,
        users.CreateDemoUser(
            start_from="copy",
            first_name="Maya",
            source_email="sam@example.com",
            password="consented",
            orgs=[users.OrgChoice(slug="oregon-high")],
        ),
    )
    from src.db.learning import (
        BadgeCollection,
        LearningBadge,
        LearningBadgeStatus,
        LearningBadgeVersion,
    )

    # "Unrelated" (org 3) has no demo user, as with a separate issuer org.
    db.add(
        BadgeCollection(
            id=50, org_id=3, name="Health careers", collection_uuid="collection_hc"
        )
    )
    db.flush()
    for identifier, name, state in (
        (50, "CPR", LearningBadgeStatus.PUBLISHED),
        (51, "Phlebotomy", LearningBadgeStatus.COMING_SOON),
        (52, "Unfinished", LearningBadgeStatus.DRAFT),
    ):
        db.add(
            LearningBadge(
                id=identifier,
                org_id=3,
                collection_id=50,
                name=name,
                status=state,
                badge_uuid=f"badge_{identifier}",
            )
        )
    db.flush()
    db.add(
        LearningBadgeVersion(
            id=50,
            version_uuid="version_cpr",
            badge_id=50,
            state="published",
            org_id=3,
        )
    )
    db.commit()
    from src.services.demo.lifecycle import publish

    revision = db.exec(text("SELECT revision FROM democonfiguration")).scalar()
    rows = publish(db, 10, revision).data["rows"]
    names = {row["name"] for row in rows["learningbadge"]}
    assert {"CPR", "Phlebotomy", "First Aid"} <= names
    assert "Unfinished" not in names
    assert any(row["id"] == 50 for row in rows["badgecollection"])
    assert any(row["id"] == 50 for row in rows["learningbadgeversion"])
    # The issuer org comes along for display, without making it a scenario org.
    assert "Unrelated" in {row["name"] for row in rows["organization"]}
