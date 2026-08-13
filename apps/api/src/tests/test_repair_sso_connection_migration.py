import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest


MIGRATION_PATH = (
    Path(__file__).parents[2]
    / "migrations"
    / "versions"
    / "t6u7v8w9x0y1_repair_missing_sso_connection.py"
)


def _migration_module():
    spec = importlib.util.spec_from_file_location("repair_sso_connection", MIGRATION_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _inspector(*, tables=(), columns=(), indexes=()):
    return SimpleNamespace(
        get_table_names=lambda: list(tables),
        get_columns=lambda _table: [{"name": name} for name in columns],
        get_indexes=lambda _table: list(indexes),
    )


def test_upgrade_replays_original_migration_when_table_is_missing(monkeypatch):
    migration = _migration_module()
    calls = []
    original = SimpleNamespace(upgrade=lambda: calls.append("original"))

    monkeypatch.setattr(migration.context, "is_offline_mode", lambda: False)
    monkeypatch.setattr(migration, "inspect", lambda _bind: _inspector())
    monkeypatch.setattr(migration.op, "get_bind", lambda: object())
    monkeypatch.setattr(migration.importlib, "import_module", lambda _name: original)

    migration.upgrade()

    assert calls == ["original"]


def test_upgrade_is_noop_for_complete_schema(monkeypatch):
    migration = _migration_module()
    created_indexes = []
    indexes = [
        {"name": migration.ORG_INDEX, "unique": True},
        {"name": migration.PROVIDER_INDEX, "unique": False},
    ]

    monkeypatch.setattr(migration.context, "is_offline_mode", lambda: False)
    monkeypatch.setattr(
        migration,
        "inspect",
        lambda _bind: _inspector(
            tables=[migration.TABLE_NAME],
            columns=migration.EXPECTED_COLUMNS,
            indexes=indexes,
        ),
    )
    monkeypatch.setattr(migration.op, "get_bind", lambda: object())
    monkeypatch.setattr(migration.op, "create_index", lambda *args, **kwargs: created_indexes.append((args, kwargs)))

    migration.upgrade()

    assert created_indexes == []


def test_upgrade_restores_missing_indexes(monkeypatch):
    migration = _migration_module()
    created_indexes = []

    monkeypatch.setattr(migration.context, "is_offline_mode", lambda: False)
    monkeypatch.setattr(
        migration,
        "inspect",
        lambda _bind: _inspector(
            tables=[migration.TABLE_NAME],
            columns=migration.EXPECTED_COLUMNS,
        ),
    )
    monkeypatch.setattr(migration.op, "get_bind", lambda: object())
    monkeypatch.setattr(migration.op, "create_index", lambda *args, **kwargs: created_indexes.append((args, kwargs)))

    migration.upgrade()

    assert [call[0][0] for call in created_indexes] == [
        migration.ORG_INDEX,
        migration.PROVIDER_INDEX,
    ]
    assert created_indexes[0][1]["unique"] is True


def test_upgrade_rejects_partial_table(monkeypatch):
    migration = _migration_module()
    partial_columns = migration.EXPECTED_COLUMNS - {"provider_config"}

    monkeypatch.setattr(migration.context, "is_offline_mode", lambda: False)
    monkeypatch.setattr(
        migration,
        "inspect",
        lambda _bind: _inspector(
            tables=[migration.TABLE_NAME],
            columns=partial_columns,
        ),
    )
    monkeypatch.setattr(migration.op, "get_bind", lambda: object())

    with pytest.raises(RuntimeError, match="Missing columns: provider_config"):
        migration.upgrade()
