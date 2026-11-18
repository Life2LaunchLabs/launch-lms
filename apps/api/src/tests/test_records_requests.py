"""A parent's records request (OP-3): who opened a learner's records, the readable export, and deleting the learner."""

import importlib
import io
import pkgutil
import zipfile

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlmodel import Session, SQLModel, select

import src.db as db_models
from src.db.audit_logs import AuditLog
from src.db.conversations import Conversation, ConversationMember, ConversationMessage
from src.db.epp_records import EppRecord
from src.db.goals import Goal, GoalOwnership, GoalStage, GoalStep, StepEntry, StepProgress
from src.db.media import MediaAsset, MediaOwnerType, MediaSourceType, MediaType
from src.db.organizations import Organization
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.security.access.catalog import FEATURES
from src.services.orgs import records_access, records_requests

for module in pkgutil.walk_packages(db_models.__path__, "src.db."):
    importlib.import_module(module.name)

NOW = "2026-11-18T12:00:00"
PLATFORM, SCHOOL, ELSEWHERE = 1, 2, 3
ADMIN, STAFF, LEARNER, SHARED, HELPER = 10, 11, 12, 13, 14


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    # Keys behave as on Postgres: deletes cascade, and a RESTRICT key stops a delete.
    event.listen(engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
    SQLModel.metadata.create_all(engine)
    db = Session(engine)
    for org_id, name in ((PLATFORM, "Life2Launch"), (SCHOOL, "Pinecrest High"), (ELSEWHERE, "Ridge Academy")):
        db.add(Organization(id=org_id, org_uuid=f"org_{org_id}", name=name, slug=name.lower().replace(" ", "-"), email=f"o{org_id}@example.com", creation_date=NOW, update_date=NOW))
    db.add_all([Role(id=1, name="Admin", rights={}, role_uuid="role_admin"), Role(id=2, name="Staff", rights={}, role_uuid="role_staff"),
                Role(id=4, name="Learner", rights={}, role_uuid="role_learner")])
    for user_id, username, first in ((ADMIN, "dana", "Dana"), (STAFF, "sam", "Sam"), (LEARNER, "maya", "Maya"), (SHARED, "theo", "Theo"), (HELPER, "mom", "Mom")):
        db.add(User(id=user_id, user_uuid=f"user_{user_id}", username=username, email=f"{username}@example.com", first_name=first, last_name="Test", creation_date=NOW, update_date=NOW))
    db.commit()
    memberships = [(ADMIN, SCHOOL, 1), (STAFF, SCHOOL, 2), (LEARNER, PLATFORM, 4), (LEARNER, SCHOOL, 4), (SHARED, PLATFORM, 4), (SHARED, SCHOOL, 4), (SHARED, ELSEWHERE, 4)]
    for user_id, org_id, role_id in memberships:
        db.add(UserOrganization(user_id=user_id, org_id=org_id, role_id=role_id, creation_date=NOW, update_date=NOW))
    db.commit()
    return db


def _user(db: Session, user_id: int) -> PublicUser:
    return PublicUser(**db.get(User, user_id).model_dump(exclude={"password"}))


def _plan(db: Session) -> Goal:
    goal = Goal(id=1, goal_uuid="goal_1", org_id=SCHOOL, owner_user_id=ADMIN, subject_user_id=LEARNER, ownership=GoalOwnership.EXTERNAL, title="Career Explorer", creation_date=NOW, update_date=NOW)
    db.add(goal)
    db.flush()
    db.add(GoalStage(id=1, stage_uuid="stage_1", goal_id=1, title="Explore", creation_date=NOW, update_date=NOW))
    db.add(GoalStep(id=1, step_uuid="step_1", goal_id=1, stage_id=1, type="task", title="Write about a career", creation_date=NOW, update_date=NOW))
    db.flush()
    db.add(StepProgress(progress_uuid="p1", step_id=1, status="completed", answer="I want to be a vet tech", reviewer_note="Great start", staff_notes=[{"note": "Staff-only: check in with mom"}], creation_date=NOW, update_date=NOW))
    db.add(MediaAsset(id=5, asset_uuid="a5", owner_type=MediaOwnerType.user, owner_user_id=LEARNER, source_type=MediaSourceType.upload, media_type=MediaType.document,
                      title="Essay", url="/content/users/user_12/media/essay.pdf", filename="essay.pdf", size_bytes=4, creation_date=NOW, update_date=NOW))
    db.flush()
    db.add(StepEntry(entry_uuid="e1", step_id=1, kind="file", title="My essay", asset_id=5, creation_date=NOW, update_date=NOW))
    # A personal goal of the learner's is theirs, not the school's record.
    db.add(Goal(id=2, goal_uuid="goal_2", org_id=SCHOOL, owner_user_id=LEARNER, subject_user_id=LEARNER, title="Private diary", creation_date=NOW, update_date=NOW))
    db.commit()
    return goal


def test_audit_logs_are_on_every_tier():
    assert FEATURES["audit_logs"].tier == "free"


def test_staff_reads_are_logged_once_and_only_for_staff():
    with _session() as db:
        records_access.note(db, STAFF, SCHOOL, LEARNER, "profile")
        records_access.note(db, STAFF, SCHOOL, LEARNER, "profile")  # a refresh stays one line
        records_access.note(db, STAFF, SCHOOL, LEARNER, "plan", "Career Explorer")
        records_access.note(db, LEARNER, SCHOOL, LEARNER, "profile")  # their own records
        records_access.note(db, HELPER, SCHOOL, LEARNER, "plan", "Career Explorer")  # not staff
        rows = db.exec(select(AuditLog)).all()
        assert [(row.user_id, row.resource) for row in rows] == [(STAFF, "learner:12:profile"), (STAFF, "learner:12:plan")]

        seen = records_requests.access(db, _user(db, ADMIN), SCHOOL, LEARNER)
        assert [(item["by"]["name"], item["label"], item["detail"]) for item in seen["items"]] == [
            ("Sam Test", "Opened a plan", "Career Explorer"), ("Sam Test", "Opened their profile", "")]
        with pytest.raises(HTTPException) as denied:
            records_requests.access(db, _user(db, STAFF), SCHOOL, LEARNER)
        assert denied.value.status_code == 403


def test_opening_a_plan_logs_it(monkeypatch):
    from src.services.goals import goals as goal_service

    with _session() as db:
        _plan(db)
        monkeypatch.setattr(goal_service.access, "require", lambda *args, **kwargs: {"view_plan"})
        monkeypatch.setattr(goal_service, "goal_dict", lambda *args, **kwargs: {})
        monkeypatch.setattr(goal_service.completion, "end_routines", lambda *args: None)
        monkeypatch.setattr(goal_service.portfolio_steps, "check_goal", lambda *args: None)
        goal_service.get_goal(db, _user(db, STAFF), "goal_1")
        assert [row.resource_id for row in db.exec(select(AuditLog).where(AuditLog.resource == "learner:12:plan")).all()] == ["Career Explorer"]


def test_export_is_a_readable_pdf_with_hand_ins_and_no_staff_notes(monkeypatch):
    from src.services.orgs import records_requests as service

    with _session() as db:
        _plan(db)
        monkeypatch.setattr(service, "read_file_content", lambda key: b"%PDF-essay" if key == "content/users/user_12/media/essay.pdf" else None)
        name, body = service.export(db, _user(db, ADMIN), SCHOOL, LEARNER)
        archive = zipfile.ZipFile(io.BytesIO(body.read()))
        assert name.startswith("Records_Maya_Test_") and name.endswith(".zip")
        assert sorted(archive.namelist()) == ["Maya_Test.pdf", "files/essay.pdf"]
        assert archive.read("files/essay.pdf") == b"%PDF-essay"
        data = service.collect(db, SCHOOL, db.get(User, LEARNER), _user(db, ADMIN))
        assert [plan["title"] for plan in data["plans"]] == ["Career Explorer"]
        step = data["plans"][0]["steps"][0]
        assert step["answers"] == ["I want to be a vet tech"] and step["feedback"] == ["Great start"]
        assert "Staff-only" not in repr(data)
        assert archive.read("Maya_Test.pdf").startswith(b"%PDF")
        assert db.exec(select(AuditLog).where(AuditLog.action == records_access.EXPORT)).one().resource == "learner:12:records"

        with pytest.raises(HTTPException) as denied:
            service.export(db, _user(db, STAFF), SCHOOL, LEARNER)
        assert denied.value.status_code == 403


def test_delete_shows_what_is_kept_and_removes_the_account(monkeypatch):
    from src.services.users import files

    monkeypatch.setattr(files, "remove_user_files", lambda uuid: True)
    with _session() as db:
        _plan(db)
        db.add(EppRecord(record_uuid="r1", org_id=SCHOOL, user_id=LEARNER, learner_name="Maya Test", school_year="2026-27", creation_date=NOW, update_date=NOW))
        db.add(Conversation(id=7, conversation_uuid="chat_7", kind="school", direct_key=f"school:{SCHOOL}:{LEARNER}", org_id=SCHOOL, creation_date=NOW, update_date=NOW))
        db.add(Conversation(id=8, conversation_uuid="chat_8", kind="group", org_id=SCHOOL, creation_date=NOW, update_date=NOW))
        db.flush()
        db.add_all([
            ConversationMember(conversation_id=7, user_id=LEARNER, creation_date=NOW, update_date=NOW),
            ConversationMember(conversation_id=7, user_id=STAFF, creation_date=NOW, update_date=NOW),
            ConversationMessage(conversation_id=7, message_uuid="m1", sender_user_id=STAFF, body="How is the essay going?", creation_date=NOW, update_date=NOW),
            ConversationMessage(conversation_id=8, message_uuid="m2", sender_user_id=LEARNER, body="Hi class", creation_date=NOW, update_date=NOW),
            ConversationMessage(conversation_id=8, message_uuid="m3", sender_user_id=STAFF, body="Welcome", creation_date=NOW, update_date=NOW),
        ])
        db.commit()
        records_access.note(db, STAFF, SCHOOL, LEARNER, "profile")
        preview = records_requests.delete_preview(db, _user(db, ADMIN), SCHOOL, LEARNER)
        assert preview["can_delete"] is True
        assert [item["what"] for item in preview["kept"]] == ["Their Education Plan and Profile records (1 reviewed record)", "The access log of who opened their records"]

        with pytest.raises(HTTPException) as wrong:
            records_requests.delete(db, _user(db, ADMIN), SCHOOL, LEARNER, "someone")
        assert wrong.value.status_code == 422

        records_requests.delete(db, _user(db, ADMIN), SCHOOL, LEARNER, "@maya")
        assert db.get(User, LEARNER) is None
        assert db.exec(select(UserOrganization).where(UserOrganization.user_id == LEARNER)).first() is None
        assert db.exec(select(Goal)).all() == []  # the plan staff own for her and her own goal
        assert db.exec(select(StepProgress)).all() == [] and db.exec(select(StepEntry)).all() == []
        assert db.get(Conversation, 7) is None and [row.body for row in db.exec(select(ConversationMessage)).all()] == ["Welcome"]
        kept = db.exec(select(EppRecord)).one()
        assert kept.learner_name == "Maya Test" and kept.user_id is None
        assert {row.action for row in db.exec(select(AuditLog)).all()} == {records_access.VIEW, records_access.DELETE}


def test_an_account_in_another_organization_waits():
    with _session() as db:
        preview = records_requests.delete_preview(db, _user(db, ADMIN), SCHOOL, SHARED)
        assert preview["can_delete"] is False and "Ridge Academy" in preview["blocked_reason"]
        with pytest.raises(HTTPException) as blocked:
            records_requests.delete(db, _user(db, ADMIN), SCHOOL, SHARED, "theo")
        assert blocked.value.status_code == 409
        assert db.get(User, SHARED) is not None
