import pytest
from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine

from src.db.coach import (
    CoachKeyCreate,
    CoachKeyUpdate,
    CoachModelSettings,
    CoachOrder,
    CoachPlaybook,
    CoachPlaybookWrite,
    CoachPolicy,
    CoachPolicyUpdate,
    CoachProviderKey,
    CoachRelease,
    CoachRoutine,
    CoachRoutineWrite,
    CoachTierUpdate,
)
from src.db.users import PublicUser, User
from src.services.coach import keys, policy
from src.services.coach.policy import DEFAULT_METHOD, CoachRuntime


def _db() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[
        User.__table__, CoachRelease.__table__, CoachPolicy.__table__, CoachProviderKey.__table__, CoachPlaybook.__table__, CoachRoutine.__table__,
    ])
    return Session(engine)


def _admin() -> PublicUser:
    return PublicUser(id=7, user_uuid="user_7", username="admin", email="admin@example.com", first_name="P", last_name="A", is_superadmin=True)


def _key(db: Session, provider="openai", secret="sk-test-secret-that-must-not-leak-1234") -> str:
    return keys.create_key(db, _admin(), CoachKeyCreate(provider=provider, label=f"{provider} main", api_key=secret))["key_uuid"]


def test_keys_are_encrypted_and_never_returned():
    with _db() as db:
        created = keys.create_key(db, _admin(), CoachKeyCreate(provider="openai", label="Main", api_key="sk-test-secret-that-must-not-leak-1234"))
        stored = keys.get_key(db, created["key_uuid"])
        assert "sk-test-secret" not in stored.ciphertext
        assert keys.decrypt_api_key(stored.ciphertext) == "sk-test-secret-that-must-not-leak-1234"
        assert created["last_four"] == "1234" and "api_key" not in created and "ciphertext" not in created
        view = policy.policy_view(db)
        assert "sk-test-secret" not in repr(view)


def test_a_key_can_be_relabelled_and_replaced():
    with _db() as db:
        key_uuid = _key(db)
        result = keys.update_key(db, _admin(), key_uuid, CoachKeyUpdate(label="Renamed", api_key="sk-another-secret-value-9876"))
        assert result["label"] == "Renamed" and result["last_four"] == "9876"
        assert keys.decrypt_api_key(keys.get_key(db, key_uuid).ciphertext) == "sk-another-secret-value-9876"


def test_a_key_in_use_by_a_tier_cannot_be_deleted():
    with _db() as db:
        key_uuid = _key(db)
        policy.update_policy(db, _admin(), CoachPolicyUpdate(tiers={"deep": CoachTierUpdate(key_uuid=key_uuid, model="gpt-x")}))
        with pytest.raises(HTTPException) as error:
            keys.delete_key(db, key_uuid)
        assert error.value.status_code == 409 and "Deep" in error.value.detail
        policy.update_policy(db, _admin(), CoachPolicyUpdate(tiers={"deep": CoachTierUpdate()}))
        keys.delete_key(db, key_uuid)
        assert keys.list_keys(db) == []


def test_turning_coach_on_needs_a_standard_key_and_model():
    with _db() as db:
        with pytest.raises(HTTPException, match="Standard tier"):
            policy.update_policy(db, _admin(), CoachPolicyUpdate(enabled=True))
        with pytest.raises(HTTPException, match="no longer exists"):
            policy.update_policy(db, _admin(), CoachPolicyUpdate(tiers={"standard": CoachTierUpdate(key_uuid="missing", model="m")}))
        key_uuid = _key(db)
        with pytest.raises(HTTPException, match="Choose a model"):
            policy.update_policy(db, _admin(), CoachPolicyUpdate(tiers={"standard": CoachTierUpdate(key_uuid=key_uuid)}))
        view = policy.update_policy(db, _admin(), CoachPolicyUpdate(
            enabled=True, tiers={"standard": CoachTierUpdate(key_uuid=key_uuid, model="gpt-test", settings=CoachModelSettings(max_output_tokens=900))},
        ))
        assert view["enabled"] is True
        assert view["tiers"]["standard"]["provider"] == "openai" and view["tiers"]["standard"]["settings"]["max_output_tokens"] == 900


def test_tiers_run_on_their_own_provider_and_fall_back_to_standard():
    with _db() as db:
        openai = _key(db, "openai", "sk-openai-secret-value-0001")
        anthropic = _key(db, "anthropic", "sk-ant-secret-value-00002")
        policy.update_policy(db, _admin(), CoachPolicyUpdate(enabled=True, tiers={
            "standard": CoachTierUpdate(key_uuid=openai, model="gpt-test"),
            "deep": CoachTierUpdate(key_uuid=anthropic, model="claude-test", settings=CoachModelSettings(thinking_effort="high")),
        }))
        runtime = policy._load(db)
        deep = runtime.model("deep")
        assert (deep.provider, deep.api_key, deep.model, deep.settings["thinking_effort"]) == ("anthropic", "sk-ant-secret-value-00002", "claude-test", "high")
        fast = runtime.model("fast")
        assert (fast.provider, fast.api_key, fast.model) == ("openai", "sk-openai-secret-value-0001", "gpt-test")


def test_unconfigured_runtime_raises_and_uses_the_default_method():
    with _db() as db:
        runtime = policy._load(db)
        assert runtime.enabled is False and runtime.method == DEFAULT_METHOD
        with pytest.raises(RuntimeError, match="not configured"):
            runtime.model("standard")


def test_abilities_default_on_and_reject_unknown_keys():
    with _db() as db:
        assert policy._load(db).can("plan_goals") is True
        view = policy.update_policy(db, _admin(), CoachPolicyUpdate(abilities={"plan_goals": False}))
        assert next(item for item in view["abilities"] if item["key"] == "plan_goals")["enabled"] is False
        assert policy._load(db).can("plan_goals") is False and policy._load(db).can("remember") is True
        with pytest.raises(HTTPException, match="Unknown abilities"):
            policy.update_policy(db, _admin(), CoachPolicyUpdate(abilities={"send_email": True}))


def _runtime(**overrides) -> CoachRuntime:
    values = {"enabled": True, "method": "Coach well.", "abilities": {}, "tiers": {}}
    return CoachRuntime(**{**values, **overrides})


def _book(title, used_when="", body="Body", always=False):
    return {"title": title, "used_when": used_when, "body": body, "always": always}


def test_knowledge_includes_always_playbooks_and_the_best_two_matches():
    runtime = _runtime(playbooks=(
        _book("Safety", body="Be safe.", always=True),
        _book("Career dreams", "Learner wants a career in gaming or sports", body="Shape big dreams."),
        _book("Exam stress", "Learner is anxious about exams", body="Calm first."),
        _book("Money", "Learner asks about budgeting", body="Budget."),
        _book("Gaming careers", "gaming esports streaming career", body="Esports paths."),
    ))
    knowledge = runtime.knowledge("I want a career in gaming")
    assert "Be safe." in knowledge and "Shape big dreams." in knowledge and "Esports paths." in knowledge
    assert "Calm first." not in knowledge and "Budget." not in knowledge
    assert runtime.knowledge("") == '<coach_playbook title="Safety">\nBe safe.\n</coach_playbook>'


def test_knowledge_stays_within_its_budget():
    runtime = _runtime(playbooks=(_book("Huge", body="x" * 13_000, always=True), _book("Small", body="ok", always=True)))
    knowledge = runtime.knowledge()
    assert "x" * 100 not in knowledge and "ok" in knowledge


def test_instructions_layer_method_knowledge_routines_and_contract():
    runtime = _runtime(
        playbooks=(_book("Safety", body="Be safe.", always=True),),
        routines=(
            {"name": "Warm notes", "trigger": "goal_check_in", "instructions": "Be warm.", "tier": "deep"},
            {"name": "Chat", "trigger": "learner_message", "instructions": "Chat rule.", "tier": "fast"},
        ),
    )
    text = runtime.instructions("goal_check_in", contract="Return JSON.")
    assert text.index("Coach well.") < text.index("Be safe.") < text.index("Be warm.") < text.index("Return JSON.")
    assert "Chat rule." not in text
    assert runtime.tier_for("goal_check_in") == "deep" and runtime.tier_for("goal_finished") == "standard"


def test_playbooks_and_routines_are_saved_ordered_and_validated():
    with _db() as db:
        first = policy.save_playbook(db, _admin(), CoachPlaybookWrite(title="One", body="1"))
        second = policy.save_playbook(db, _admin(), CoachPlaybookWrite(title="Two", body="2"))
        ordered = policy.reorder(db, "playbooks", CoachOrder(uuids=[second["playbook_uuid"], first["playbook_uuid"]]))
        assert [item["title"] for item in ordered] == ["Two", "One"]
        policy.save_playbook(db, _admin(), CoachPlaybookWrite(title="One", body="1", enabled=False), first["playbook_uuid"])
        assert [book["title"] for book in policy._load(db).playbooks] == ["Two"]

        with pytest.raises(HTTPException):
            policy.save_routine(db, _admin(), CoachRoutineWrite(name="Nope", trigger="every_hour"))
        routine = policy.save_routine(db, _admin(), CoachRoutineWrite(name="Notes", trigger="goal_check_in", instructions="Warm.", tier="deep"))
        assert policy._load(db).tier_for("goal_check_in") == "deep"
        policy.delete_routine(db, routine["routine_uuid"])
        assert policy._load(db).routines == ()
        policy.delete_playbook(db, second["playbook_uuid"])
        assert len(policy.policy_view(db)["playbooks"]) == 1


def test_policy_view_shows_built_in_rules_and_what_runs_on_each_tier():
    with _db() as db:
        view = policy.policy_view(db)
        assert {rule["title"] for rule in view["built_in_rules"]} >= {"Every reply", "Planning sessions"}
        assert "Remembering what the learner shares" in view["tier_uses"]["fast"]
        assert len(view["tier_uses"]["standard"]) == len(view["triggers"])
        assert [group["key"] for group in view["ability_groups"]] == ["reads", "chat", "own"]


def test_coach_admin_routes_are_superadmin_only():
    from src.router import v1_router
    from src.routers.coach_admin import router
    from src.security.superadmin import require_superadmin

    assert any(dep.dependency is require_superadmin for dep in router.dependencies)
    paths = {route.path for route in v1_router.routes}
    assert {"/api/v1/superadmin/coach", "/api/v1/superadmin/coach/keys", "/api/v1/superadmin/coach/routines/order"} <= paths


def test_chat_runs_on_the_triggers_tier_with_only_the_allowed_tools(monkeypatch):
    from src.services.coach import providers

    with _db() as db:
        standard = _key(db, "openai", "sk-openai-secret-value-0001")
        deep = _key(db, "anthropic", "sk-ant-secret-value-00002")
        policy.update_policy(db, _admin(), CoachPolicyUpdate(enabled=True, abilities={"open_pages": False}, tiers={
            "standard": CoachTierUpdate(key_uuid=standard, model="gpt-test"),
            "deep": CoachTierUpdate(key_uuid=deep, model="claude-test"),
        }))
        policy.save_routine(db, _admin(), CoachRoutineWrite(name="Plan deeply", trigger="planning_session", instructions="Think it through.", tier="deep"))
        snapshot = policy._load(db)
    monkeypatch.setattr(providers, "coach_runtime", lambda *_args: snapshot)
    monkeypatch.setattr(providers, "_ui_test_provider", lambda **_kwargs: None)

    chat = providers.configured_advisor_provider(object())
    assert isinstance(chat, providers.OpenAIResponsesProvider) and "Think it through." not in chat.instructions
    assert chat.tools == frozenset({"questions", "goal_edit"})

    planning = providers.configured_advisor_provider(object(), edit_scope="goal")
    assert isinstance(planning, providers.AnthropicMessagesProvider) and "Think it through." in planning.instructions


def test_a_new_platform_starts_with_the_safety_playbook_and_seed_routines():
    with _db() as db:
        policy.seed_defaults(db)
        policy.seed_defaults(db)
        runtime = policy._load(db)
        assert runtime.method == DEFAULT_METHOD and runtime.enabled is False
        assert [(book["title"], book["always"]) for book in runtime.playbooks] == [("Safety", True)]
        assert [routine["trigger"] for routine in runtime.routines] == ["goal_check_in", "goal_finished"]
