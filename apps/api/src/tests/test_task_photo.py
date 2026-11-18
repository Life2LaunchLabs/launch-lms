"""A task can ask for a photo to show it's done ("Build it and show me"): the learner adds one from their camera or photos."""

import pytest
from fastapi import HTTPException

from src.db.goals import StepEntryCreate, StepStatus
from src.db.media import MediaAsset
from src.services.goals import entries, goals
from src.tests.test_goals import LEARNER, NOW, _issue, _published, _session, _status, _step, _user


def _photo(db, uuid: str, owner: int = LEARNER) -> None:
    db.add(MediaAsset(asset_uuid=uuid, owner_user_id=owner, owner_type="user", media_type="image", source_type="upload", filename=f"{uuid}.jpg",
                      url=f"https://files.example.com/{uuid}.jpg", creation_date=NOW, update_date=NOW))
    db.commit()


def test_a_task_that_asks_for_a_photo_needs_one_to_finish():
    with _session() as db:
        template = _published(db, {"type": "task", "title": "Build it and show me", "config": {"photo": True}}, {"type": "task", "title": "Tidy up"})
        goal = _issue(db, template)
        build = _step(goals.get_goal(db, _user(LEARNER), goal.goal_uuid), "Build it and show me")
        with pytest.raises(HTTPException, match="Add a photo first"):
            _status(db, LEARNER, goal, build, StepStatus.COMPLETED)
        _photo(db, "asset_build")
        view = entries.add_entry(db, _user(LEARNER), goal.goal_uuid, build["step_uuid"], StepEntryCreate(kind="file", asset_uuid="asset_build", url="https://files.example.com/asset_build.jpg", title="build.jpg"))
        build = _step(view, "Build it and show me")
        assert build["result"]["kind"] == "files" and build["result"]["files"][0]["url"].endswith("asset_build.jpg")
        assert _step(_status(db, LEARNER, goal, build, StepStatus.COMPLETED), "Build it and show me")["state"] == "done"


def test_a_task_that_doesnt_ask_takes_no_photo_and_someone_elses_photo_is_refused():
    with _session() as db:
        template = _published(db, {"type": "task", "title": "Tidy up"}, {"type": "task", "title": "Show me", "config": {"photo": True}})
        goal = _issue(db, template)
        view = goals.get_goal(db, _user(LEARNER), goal.goal_uuid)
        _photo(db, "asset_mine")
        with pytest.raises(HTTPException, match="doesn't ask for a photo"):
            entries.add_entry(db, _user(LEARNER), goal.goal_uuid, _step(view, "Tidy up")["step_uuid"], StepEntryCreate(kind="file", asset_uuid="asset_mine"))
        _photo(db, "asset_theirs", owner=LEARNER + 1000)
        with pytest.raises(HTTPException, match="File not found"):
            entries.add_entry(db, _user(LEARNER), goal.goal_uuid, _step(view, "Show me")["step_uuid"], StepEntryCreate(kind="file", asset_uuid="asset_theirs"))
