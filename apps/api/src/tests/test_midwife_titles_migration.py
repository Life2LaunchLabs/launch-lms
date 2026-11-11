"""FEED-74: career data loaded before the "-wives" fix still said "Nurse Midwive"; the migration corrects it."""
import importlib.util
import json
from pathlib import Path

import sqlalchemy as sa

MIGRATION_PATH = Path(__file__).parents[2] / "migrations" / "versions" / "x8w9i0f1e2t3_midwife_job_titles.py"


def _migration():
    spec = importlib.util.spec_from_file_location("midwife_job_titles", MIGRATION_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _db():
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE careerentry (id INTEGER PRIMARY KEY, title TEXT)"))
        conn.execute(sa.text("CREATE TABLE resource (id INTEGER PRIMARY KEY, title TEXT, resource_type TEXT)"))
        conn.execute(sa.text("CREATE TABLE resourcesearchdocument (id INTEGER PRIMARY KEY, title TEXT, resource_type TEXT)"))
        conn.execute(sa.text("CREATE TABLE estimatefact (id INTEGER PRIMARY KEY, metric TEXT, label TEXT)"))
        conn.execute(sa.text("CREATE TABLE lifeplan (id INTEGER PRIMARY KEY, document TEXT)"))
        conn.execute(sa.text("INSERT INTO careerentry VALUES (1, 'Nurse Midwive'), (2, 'Customer Service Representative'), (3, 'Detective or Criminal Investigator')"))
        conn.execute(sa.text("INSERT INTO resource VALUES (1, 'Nurse Midwive', 'career'), (2, 'Nurse Midwive', 'article'), (3, 'Customer Service Representative', 'CAREER')"))
        conn.execute(sa.text("INSERT INTO resourcesearchdocument VALUES (1, 'Nurse Midwive', 'career')"))
        conn.execute(sa.text("INSERT INTO estimatefact VALUES (1, 'wage', 'Nurse Midwive'), (2, 'rent', 'Midwive')"))
        doc = {"phases": [{"lines": [{"title": "Nurse Midwive", "settings": {"soc_title": "Nurse Midwive"}},
                                     {"title": "My job", "settings": {"soc_title": "NURSE MIDWIVE"}}],
                           "activities": [{"career_title": "Nurse Midwive"}, {"career_title": "Barista"}]}]}
        conn.execute(sa.text("INSERT INTO lifeplan VALUES (1, :d), (2, :e)"), {"d": json.dumps(doc), "e": json.dumps({"phases": []})})
    return engine


def _run(migration, engine, monkeypatch):
    with engine.begin() as conn:
        monkeypatch.setattr(migration.op, "get_bind", lambda: conn)
        migration.upgrade()


def _snapshot(engine):
    with engine.connect() as conn:
        return {t: conn.execute(sa.text(f"SELECT * FROM {t} ORDER BY id")).all()
                for t in ("careerentry", "resource", "resourcesearchdocument", "estimatefact", "lifeplan")}


def test_fix_title_only_changes_wive_endings():
    m = _migration()
    assert m.fix_title("Nurse Midwive") == "Nurse Midwife"
    assert m.fix_title("NURSE MIDWIVE") == "NURSE MIDWIFE"
    assert m.fix_title("Nurse Midwife") == "Nurse Midwife"
    assert m.fix_title("Customer Service Representative") == "Customer Service Representative"
    assert m.fix_title("Detective or Criminal Investigator") == "Detective or Criminal Investigator"
    assert m.fix_title(None) is None


def test_upgrade_fixes_stored_titles_and_is_idempotent(monkeypatch):
    m = _migration()
    engine = _db()
    _run(m, engine, monkeypatch)
    first = _snapshot(engine)

    assert [r.title for r in first["careerentry"]] == ["Nurse Midwife", "Customer Service Representative", "Detective or Criminal Investigator"]
    # Only career resources follow the career's title; an article someone named is left alone.
    assert [r.title for r in first["resource"]] == ["Nurse Midwife", "Nurse Midwive", "Customer Service Representative"]
    assert first["resourcesearchdocument"][0].title == "Nurse Midwife"
    assert [r.label for r in first["estimatefact"]] == ["Nurse Midwife", "Midwive"]
    doc = json.loads(first["lifeplan"][0].document)
    lines = doc["phases"][0]["lines"]
    assert lines[0] == {"title": "Nurse Midwife", "settings": {"soc_title": "Nurse Midwife"}}
    assert lines[1] == {"title": "My job", "settings": {"soc_title": "NURSE MIDWIFE"}}
    assert [a["career_title"] for a in doc["phases"][0]["activities"]] == ["Nurse Midwife", "Barista"]

    _run(m, engine, monkeypatch)
    assert _snapshot(engine) == first


def test_upgrade_skips_missing_tables(monkeypatch):
    m = _migration()
    engine = sa.create_engine("sqlite://")
    _run(m, engine, monkeypatch)
