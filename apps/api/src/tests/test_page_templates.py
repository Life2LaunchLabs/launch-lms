"""Page templates: one system plan in the owner organization, edited like any plan, served by its live version."""

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.learning import LearningActivity, LearningPage
from src.services.goals import templates
from src.services.goals.document import iter_steps
from src.services.learning import lookups, page_templates
from src.tests.test_goals import ADMIN, LEARNER, _session, _user


def _choice(scored: bool) -> dict:
    return {"id": "blk_q", "type": "question", "kind": "multiple_choice", "content": {"options": [{"id": "opt_a", "text": "A"}]},
            "scoring": {"mode": "points" if scored else "off", "points": 1 if scored else 0, "correct_option_ids": ["opt_a"] if scored else []}}


def _page(activity: LearningActivity, uuid: str, title: str, *blocks: dict) -> LearningPage:
    return LearningPage(page_uuid=uuid, activity_id=int(activity.id), org_id=activity.org_id, page_type="standard", title=title,  # type: ignore[arg-type]
                        content={"version": 3, "blocks": [{"id": "blk_h", "type": "heading", "content": {"text": title}}, *blocks]})


def _with_category(db, plan, name: str, *pages: tuple) -> None:
    document = plan.document
    document["stages"][0]["steps"].append({"type": "activity", "title": name})
    templates.save_template(db, _user(ADMIN), 1, plan.template_uuid, document)
    db.refresh(plan)
    uuid = [step for _, step in iter_steps(plan.document) if step["title"] == name][0]["config"]["activity_uuid"]
    activity = db.exec(select(LearningActivity).where(LearningActivity.activity_uuid == uuid)).one()
    for page_uuid, title, blocks in pages:
        db.add(_page(activity, page_uuid, title, *blocks))
    # Reading order comes from the sequence, not insertion.
    activity.settings = {"sequence": {"version": 1, "items": [{"type": "page", "page_uuid": item[0]} for item in reversed(pages)]}}
    db.add(activity)
    db.commit()


def test_the_plan_starts_empty_and_only_its_live_version_is_served():
    with _session() as db:
        plan = page_templates.ensure_plan(db)
        assert plan.system_type == "page_templates" and plan.org_id == 1
        assert page_templates.ensure_plan(db).id == plan.id
        empty = page_templates.served(db, _user(ADMIN))
        assert empty["categories"] == [] and empty["defaults"] == {} and empty["can_edit"] is True
        assert page_templates.served(db, _user(LEARNER))["can_edit"] is False

        _with_category(db, plan, "Check", ("p_written", "Your answer", [{"id": "blk_w", "type": "question", "kind": "text_input", "content": {"inputs": []}}]),
                       ("p_quiz", "Quiz", [_choice(True)]), ("p_poll", "Poll", [_choice(False)]))
        assert page_templates.served(db, _user(ADMIN))["categories"] == []  # the draft stays hidden

        templates.publish(db, _user(ADMIN), 1, plan.template_uuid, "First templates")
        served = page_templates.served(db, _user(LEARNER))
        assert [category["name"] for category in served["categories"]] == ["Check"]
        assert [page["title"] for page in served["categories"][0]["pages"]] == ["Poll", "Quiz", "Your answer"]
        assert {pick: page["title"] for pick, page in served["defaults"].items()} == {"pick_few": "Poll", "quick_check": "Quiz", "short_answer": "Your answer"}
        # Served pages are the version's frozen copies, not the working ones.
        assert "p_quiz" not in [page["page_uuid"] for page in served["categories"][0]["pages"]]


def test_the_plan_is_never_handed_out_or_trusted():
    with _session() as db:
        plan = page_templates.ensure_plan(db)
        _with_category(db, plan, "Start", ("p_intro", "Intro", []))
        templates.publish(db, _user(ADMIN), 1, plan.template_uuid, "First")
        db.refresh(plan)
        with pytest.raises(HTTPException) as refused:
            templates.issuable_version(db, plan)
        assert refused.value.status_code == 409
        activity = db.exec(select(LearningActivity).where(LearningActivity.goal_template_id == plan.id)).first()
        assert lookups._is_system_activity(db, activity) is False
        assert templates.release_managed(plan) is False
