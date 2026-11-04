"""Download my data: what goes in the zip, and what never leaves the platform."""

import importlib
import io
import json
import pkgutil
import zipfile

import src.db as db_models
from sqlmodel import SQLModel, select

from src.db.coach_notes import CoachNote
from src.db.conversations import Conversation, ConversationMember, ConversationMessage
from src.db.media import MediaAsset, MediaOwnerType, MediaSourceType, MediaType
from src.db.portfolio import Portfolio
from src.db.users import User
from src.services.users import data_export
from src.tests.test_goal_sharing import _personal
from src.tests.test_goals import LEARNER, NOW, OTHER, _session as _goal_session, _user

for module in pkgutil.walk_packages(db_models.__path__, "src.db."):
    importlib.import_module(module.name)


def _session():
    db = _goal_session()
    SQLModel.metadata.create_all(db.get_bind())
    return db


def _zip(db, user_id: int = LEARNER) -> tuple[str, zipfile.ZipFile]:
    name, body = data_export.build_zip(db, _user(user_id))
    return name, zipfile.ZipFile(io.BytesIO(body.read()))


def _json(archive: zipfile.ZipFile, path: str):
    return json.loads(archive.read(path))


def test_every_part_names_a_real_table_and_column():
    tables = SQLModel.metadata.tables
    paths = set()
    for part in data_export._parts():
        assert part.table in tables, part.table
        for column in (part.column,) if isinstance(part.column, str) else part.column:
            assert column in tables[part.table].c, (part.table, column)
        if part.parent:
            assert part.parent in paths, f"{part.path} reads {part.parent} before it is collected"
        paths.add(part.path)


def test_export_holds_my_account_plans_and_chats_but_no_secrets_or_staff_notes(monkeypatch):
    with _session() as db:
        me = db.exec(select(User).where(User.id == LEARNER)).one()
        me.password = "argon2-hash-should-never-leave"
        me.last_login_ip = "10.0.0.1"
        db.add(me)
        goal = _personal(db)
        db.add(Portfolio(portfolio_uuid="portfolio_2", user_id=LEARNER, display_name="Lee", creation_date=NOW, update_date=NOW))
        db.add(Conversation(id=50, conversation_uuid="conv_50", kind="direct", creation_date=NOW, update_date=NOW))
        db.add_all([
            ConversationMember(conversation_id=50, user_id=LEARNER, creation_date=NOW, update_date=NOW),
            ConversationMember(conversation_id=50, user_id=OTHER, creation_date=NOW, update_date=NOW),
            ConversationMessage(conversation_id=50, message_uuid="m1", sender_user_id=LEARNER, body="Hi Sam", creation_date=NOW, update_date=NOW),
            ConversationMessage(conversation_id=50, message_uuid="m2", sender_user_id=OTHER, body="Hey Lee", creation_date=NOW, update_date=NOW),
            ConversationMessage(conversation_id=50, message_uuid="m3", sender_user_id=1, body="Staff: check in on Lee", visibility="staff", creation_date=NOW, update_date=NOW),
        ])
        db.add(CoachNote(note_uuid="n1", goal_id=1, user_id=LEARNER, kind="stalled", signal_key="s1", title="Pick a next step"))
        db.add_all([
            MediaAsset(asset_uuid="a1", owner_type=MediaOwnerType.user, owner_user_id=LEARNER, source_type=MediaSourceType.upload, media_type=MediaType.image,
                       title="Me", url="/content/users/user_2/media/me.png", filename="me.png", size_bytes=4, creation_date=NOW, update_date=NOW),
            # Someone else's file under my name in the table never pulls their file into my zip.
            MediaAsset(asset_uuid="a2", owner_type=MediaOwnerType.user, owner_user_id=LEARNER, source_type=MediaSourceType.upload, media_type=MediaType.image,
                       title="Not mine", url="/content/users/user_3/media/theirs.png", filename="theirs.png", size_bytes=4, creation_date=NOW, update_date=NOW),
            MediaAsset(asset_uuid="a3", owner_type=MediaOwnerType.user, owner_user_id=OTHER, source_type=MediaSourceType.upload, media_type=MediaType.image,
                       title="Sam's", url="/content/users/user_3/media/sam.png", filename="sam.png", size_bytes=4, creation_date=NOW, update_date=NOW),
        ])
        db.commit()
        read = []
        monkeypatch.setattr(data_export, "read_file_content", lambda key: read.append(key) or b"\x89PNG")

        name, archive = _zip(db)

        assert name.startswith("launch-lms-data_u2_") and name.endswith(".zip")
        everything = "".join(archive.read(item).decode("utf-8", "ignore") for item in archive.namelist())
        assert "argon2-hash-should-never-leave" not in everything and "10.0.0.1" not in everything
        profile = _json(archive, "account/profile.json")
        assert [row["email"] for row in profile] == ["l@example.com"] and "password" not in profile[0]
        assert [row["goal_uuid"] for row in _json(archive, "plans/plans.json")] == [goal["goal_uuid"]]
        assert [row["display_name"] for row in _json(archive, "portfolio/portfolio.json")] == ["Lee"]
        assert [row["body"] for row in _json(archive, "messages/messages.json")] == ["Hi Sam", "Hey Lee"]
        assert "Staff: check in" not in everything
        assert [row["title"] for row in _json(archive, "coach/notes.json")] == ["Pick a next step"]
        assert read == ["content/users/user_2/media/me.png"]
        assert archive.read("files/me.png") == b"\x89PNG"
        files = {item["asset_uuid"]: item for item in _json(archive, "files.json")}
        assert files["a1"]["included"] and not files["a2"]["included"] and "a3" not in files
        readme = archive.read("README.txt").decode()
        assert "plans/plans.json: 1 record." in readme and "files: 1 of 2 uploaded files." in readme


def test_someone_else_gets_only_their_own_data():
    with _session() as db:
        _personal(db)
        _, archive = _zip(db, OTHER)
        assert "plans/plans.json" not in archive.namelist()
        assert [row["username"] for row in _json(archive, "account/profile.json")] == ["sam"]


def test_content_key_only_accepts_my_own_upload_paths():
    assert data_export._content_key("https://x.org/content/users/user_2/media/a.png?v=1", "user_2") == "content/users/user_2/media/a.png"
    assert data_export._content_key("/content/users/user_3/media/a.png", "user_2") is None
    assert data_export._content_key("/content/users/user_2/../user_3/a.png", "user_2") is None
    assert data_export._content_key("/content/orgs/org_1/a.png", "user_2") is None
    assert data_export._content_key("https://images.pexels.com/a.png", "user_2") is None
