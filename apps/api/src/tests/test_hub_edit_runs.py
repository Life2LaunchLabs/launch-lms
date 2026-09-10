from datetime import datetime, timedelta

from fastapi import HTTPException
import pytest
from sqlmodel import Session, SQLModel, create_engine, select

from src.db.hub import HubConversation, HubEditObjectState, HubEditRun, HubEditRunEvent
from src.db.planning import Plan
from src.services import hub_edit_runs


def _session(monkeypatch):
    monkeypatch.setattr(hub_edit_runs, "require_org_membership", lambda *_args: None)
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine, tables=[
        HubConversation.__table__, HubEditRun.__table__, HubEditRunEvent.__table__, HubEditObjectState.__table__, Plan.__table__,
    ])
    return Session(engine)


def test_edit_run_is_scoped_idempotent_and_cancellable(monkeypatch):
    with _session(monkeypatch) as db:
        conversation = HubConversation(
            conversation_uuid="conversation_owner", org_id=7, user_id=11, title="Plan",
        )
        db.add(conversation)
        db.commit()

        first = hub_edit_runs.begin_edit_run(
            db, conversation_uuid=conversation.conversation_uuid, org_id=7, user_id=11,
            action_id="hub_action_one", route="/plans?hub_action=create-plan",
            scope_kind="new_plan", target_label="New personal plan",
            goal="Create a personal plan together",
        )
        repeated = hub_edit_runs.begin_edit_run(
            db, conversation_uuid=conversation.conversation_uuid, org_id=7, user_id=11,
            action_id="hub_action_one", route="/plans?hub_action=create-plan",
            scope_kind="new_plan", target_label="New personal plan",
            goal="Create a personal plan together",
        )

        assert repeated["run_uuid"] == first["run_uuid"]
        assert first["status"] == "active"
        assert first["events"][0]["kind"] == "run.started"
        assert hub_edit_runs.active_edit_run(db, conversation.conversation_uuid, 7, 11)["run_uuid"] == first["run_uuid"]

        plan = Plan(plan_uuid="plan_one", slug="my-plan", name="My plan", owner_user_id=11, subject_user_id=11)
        db.add(plan)
        db.commit()
        bound = hub_edit_runs.bind_created_plan(db, first["run_uuid"], 7, 11, plan.plan_uuid)
        assert bound["scope"] == {
            "kind": "plan", "target_uuid": "plan_one", "label": "My plan", "route": "/plans/my-plan",
        }
        assert bound["events"][-1]["kind"] == "plan.created"

        stopped = hub_edit_runs.conclude_edit_run(db, first["run_uuid"], 7, 11, "cancelled")
        assert stopped["status"] == "cancelled"
        assert stopped["events"][-1]["kind"] == "run.cancelled"
        assert hub_edit_runs.active_edit_run(db, conversation.conversation_uuid, 7, 11) is None


def test_edit_run_cannot_cross_conversation_owner(monkeypatch):
    with _session(monkeypatch) as db:
        conversation = HubConversation(
            conversation_uuid="conversation_owner", org_id=7, user_id=11, title="Plan",
        )
        db.add(conversation)
        db.commit()
        run = hub_edit_runs.begin_edit_run(
            db, conversation_uuid=conversation.conversation_uuid, org_id=7, user_id=11,
            action_id="hub_action_one", route="/plans?hub_action=create-plan",
            scope_kind="new_plan", target_label="New personal plan",
            goal="Create a personal plan together",
        )

        with pytest.raises(HTTPException) as caught:
            hub_edit_runs.conclude_edit_run(db, run["run_uuid"], 7, 12, "cancelled")
        assert caught.value.status_code == 404


def test_native_object_state_recovers_and_rejects_stale_tabs(monkeypatch):
    with _session(monkeypatch) as db:
        conversation = HubConversation(
            conversation_uuid="conversation_owner", org_id=7, user_id=11, title="Plan",
        )
        db.add(conversation)
        db.commit()
        run = hub_edit_runs.begin_edit_run(
            db, conversation_uuid=conversation.conversation_uuid, org_id=7, user_id=11,
            action_id="hub_action_recovery", route="/plans?hub_action=create-plan",
            scope_kind="new_plan", target_label="New personal plan",
            goal="Create a personal plan together",
        )

        saved = hub_edit_runs.save_object_state(
            db, run_uuid=run["run_uuid"], org_id=7, user_id=11,
            object_key="new-plan", object_type="plan",
            current_fields={"name": "Career plan", "description": "", "due_date": "2099-12-31"},
            proposal_fields={"name": "Career plan"}, expected_revision=0,
        )
        assert saved["revision"] == 1
        recovered = hub_edit_runs.active_edit_run(db, conversation.conversation_uuid, 7, 11)
        assert recovered["objects"][0]["current_fields"]["name"] == "Career plan"

        with pytest.raises(HTTPException) as caught:
            hub_edit_runs.save_object_state(
                db, run_uuid=run["run_uuid"], org_id=7, user_id=11,
                object_key="new-plan", object_type="plan", current_fields={"name": "Stale"},
                proposal_fields={}, expected_revision=0,
            )
        assert caught.value.status_code == 409

        cancelled = hub_edit_runs.save_object_state(
            db, run_uuid=run["run_uuid"], org_id=7, user_id=11,
            object_key="new-plan", object_type="plan", current_fields={}, proposal_fields={},
            status="cancelled", expected_revision=1,
        )
        assert cancelled["revision"] == 2
        recovered = hub_edit_runs.active_edit_run(db, conversation.conversation_uuid, 7, 11)
        assert recovered["objects"][0]["status"] == "cancelled"
        assert recovered["events"][-1]["kind"] == "plan.cancelled"


def test_native_object_recovery_expires_after_thirty_inactive_days(monkeypatch):
    with _session(monkeypatch) as db:
        conversation = HubConversation(conversation_uuid="conversation_expiry", org_id=7, user_id=11, title="Plan")
        db.add(conversation)
        db.commit()
        run = hub_edit_runs.begin_edit_run(
            db, conversation_uuid=conversation.conversation_uuid, org_id=7, user_id=11,
            action_id="hub_action_expiry", route="/plans", scope_kind="plan",
            target_label="Career plan", target_uuid="plan_one", goal="Build the plan",
        )
        saved = hub_edit_runs.save_object_state(
            db, run_uuid=run["run_uuid"], org_id=7, user_id=11,
            object_key="hub_objective_old", object_type="objective",
            current_fields={"title": "Old"}, proposal_fields={"title": "Old"},
        )
        item = db.exec(select(HubEditObjectState).where(HubEditObjectState.object_key == saved["object_key"])).one()
        item.updated_at = datetime.utcnow() - timedelta(days=31)
        db.add(item)
        db.commit()

        recovered = hub_edit_runs.active_edit_run(db, conversation.conversation_uuid, 7, 11)

        assert recovered["objects"][0]["status"] == "expired"


def test_run_cannot_finish_while_an_object_is_still_being_reviewed(monkeypatch):
    with _session(monkeypatch) as db:
        conversation = HubConversation(conversation_uuid="conversation_pending", org_id=7, user_id=11, title="Plan")
        db.add(conversation)
        db.commit()
        run = hub_edit_runs.begin_edit_run(
            db, conversation_uuid=conversation.conversation_uuid, org_id=7, user_id=11,
            action_id="hub_action_pending", route="/plans", scope_kind="plan",
            target_label="Career plan", target_uuid="plan_one", goal="Build the plan",
        )
        hub_edit_runs.save_object_state(
            db, run_uuid=run["run_uuid"], org_id=7, user_id=11,
            object_key="hub_objective_pending", object_type="objective",
            current_fields={"title": "Pending"}, proposal_fields={"title": "Pending"},
        )

        with pytest.raises(HTTPException) as caught:
            hub_edit_runs.conclude_edit_run(db, run["run_uuid"], 7, 11, "completed")

        assert caught.value.status_code == 409
