import importlib.util
from pathlib import Path


MIGRATION_PATH = (
    Path(__file__).parents[2]
    / "migrations"
    / "versions"
    / "s4t5u6v7w8x9_retire_legacy_courses.py"
)


def _migration_module():
    spec = importlib.util.spec_from_file_location("retire_legacy_courses", MIGRATION_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_role_keys_are_mapped_without_overwriting_badge_rights():
    migration = _migration_module()
    legacy = {
        "courses": {"action_read": False},
        "badges": {"action_read": True},
        "collections": {"action_create": True},
        "activities": {"action_update": True},
        "coursechapters": {"action_read": True},
        "assignments": {"action_read": True},
        "certifications": {"action_read": True},
        "users": {"action_read": True},
    }

    migrated = migration._rename_keys(
        legacy, migration.RIGHT_KEYS, migration.REMOVED_RIGHT_KEYS
    )

    assert migrated["badges"] == {"action_read": True}
    assert migrated["badge_collections"] == {"action_create": True}
    assert migrated["learning_activities"] == {"action_update": True}
    assert migrated["users"] == legacy["users"]
    for removed in ("courses", "collections", "activities", "coursechapters", "assignments", "certifications"):
        assert removed not in migrated


def test_feature_keys_are_badge_native():
    migration = _migration_module()
    migrated = migration._rename_keys(
        {"courses": {"enabled": True}, "collections": {"limit": 5}, "assignments": {"enabled": True}},
        migration.FEATURE_KEYS,
        migration.REMOVED_FEATURE_KEYS,
    )

    assert migrated == {
        "badges": {"enabled": True},
        "badge_collections": {"limit": 5},
    }


def test_parent_tables_are_dropped_in_foreign_key_order():
    migration = _migration_module()
    order = migration.DROP_TABLE_ORDER

    assert order.index("quizanswer") < order.index("quizattempt")
    assert order.index("quizresult") < order.index("quizattempt")
    assert order.index("assignmenttasksubmission") < order.index("assignmenttask")
    assert order.index("assignmenttask") < order.index("assignment")
    assert order.index("activity") < order.index("course")
    assert order.index("chapter") < order.index("course")
    assert order.index("course") < order.index("collection")
