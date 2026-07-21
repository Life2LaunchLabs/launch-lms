from pathlib import Path


FORBIDDEN = (
    "src.db.courses",
    "src.db.collections",
    "src.services.courses",
    "src.services.learning_migration",
    'prefix="/courses"',
    'prefix="/chapters"',
    'prefix="/activities"',
    'prefix="/assignments"',
    'prefix="/badge-migrations"',
    'prefix="/tutor"',
    "tutor_badge_import",
)


def test_runtime_has_no_legacy_course_imports_or_routes():
    source_root = Path(__file__).parents[1]
    offenders = []
    for path in source_root.rglob("*.py"):
        if "tests" in path.parts:
            continue
        content = path.read_text(encoding="utf-8")
        for token in FORBIDDEN:
            if token in content:
                offenders.append(f"{path.relative_to(source_root)}: {token}")
    assert not offenders, "Legacy course runtime references remain:\n" + "\n".join(offenders)
