"""Captures on the Riverside fixture: freezing a dashboard, who can open it, the log, and the read-only link."""

import pytest
from fastapi import HTTPException
from sqlmodel import Session

from src.db.insights import InsightCapture, InsightDashboard
from src.services.insights import captures, dashboards, engine
from src.tests.test_insights import ADMIN, ANA, REPORTS, _user
from src.tests.test_insights import db as riverside  # noqa: F401


@pytest.fixture
def db(riverside: Session) -> Session:  # noqa: F811
    InsightDashboard.__table__.create(riverside.get_bind())
    InsightCapture.__table__.create(riverside.get_bind())
    return riverside


def _codes(fn, *args, **kwargs) -> int:
    with pytest.raises(HTTPException) as caught:
        fn(*args, **kwargs)
    return caught.value.status_code


def _starter(db: Session, source: str) -> dict:
    return next(item for item in dashboards.list_dashboards(db, _user(ADMIN), 1) if item["source_template"] == source)


def _walk(value):
    """Every dict inside a JSON value."""
    if isinstance(value, dict):
        yield value
        for item in value.values():
            yield from _walk(item)
    elif isinstance(value, list):
        for item in value:
            yield from _walk(item)


def test_a_capture_freezes_what_the_dashboard_shows_with_a_note(db):
    board = _starter(db, "starter:org.overview")
    made = captures.capture_dashboard(db, _user(ADMIN), 1, board["dashboard_uuid"], range_="28d", note="  End of October  ")
    full = dashboards.get_dashboard(db, _user(ADMIN), 1, board["dashboard_uuid"])
    live = engine.run_cards(engine.context(db, _user(ADMIN), 1, "org", None), full["document"]["cards"], "28d")
    assert made["note"] == "End of October" and made["title"] == full["title"] and made["whole_org"] and made["mine"]
    assert made["range"]["asked"] == "28d" and made["range"]["start"] and made["range"]["end"]
    assert made["cards"] == full["document"]["cards"]
    assert {key: result["headline"] for key, result in made["results"].items()} == {key: result["headline"] for key, result in live.items()}
    assert made["learners"] > 0 and made["link"] is None and not made["scheduled"]


def test_a_plan_capture_names_its_plan_and_a_bad_attachment_is_refused(db):
    board = _starter(db, "starter:plan.performance")
    made = captures.capture_dashboard(db, _user(ADMIN), 1, board["dashboard_uuid"], key="tpl_cl")
    assert made["scope"] == "plan" and made["object_key"] == "tpl_cl" and made["object_label"]
    assert _codes(captures.capture_dashboard, db, _user(ADMIN), 1, board["dashboard_uuid"], key="tpl_cl", attach=["evidence"]) == 422


def test_who_can_open_a_capture(db):
    board = _starter(db, "starter:org.overview")
    admins = captures.capture_dashboard(db, _user(ADMIN), 1, board["dashboard_uuid"])
    anas = captures.capture_dashboard(db, _user(ANA), 1, board["dashboard_uuid"])
    assert not anas["whole_org"]

    # Staff without See reports only see their own; their learners are fewer than the capture counted.
    assert [item["capture_uuid"] for item in captures.list_captures(db, _user(ANA), 1)] == [anas["capture_uuid"]]
    assert _codes(captures.get_capture, db, _user(ANA), 1, admins["capture_uuid"]) == 404
    # See reports covers everyone's, newest first.
    assert [item["capture_uuid"] for item in captures.list_captures(db, _user(REPORTS), 1)] == [anas["capture_uuid"], admins["capture_uuid"]]
    assert captures.get_capture(db, _user(REPORTS), 1, admins["capture_uuid"])["results"] == admins["results"]
    assert [item["capture_uuid"] for item in captures.list_captures(db, _user(ADMIN), 1, mine=True)] == [admins["capture_uuid"]]


def test_a_capture_of_a_personal_dashboard_stays_with_its_owner(db):
    mine = dashboards.create_dashboard(db, _user(ADMIN), 1, scope="org", template="org.overview")
    made = captures.capture_dashboard(db, _user(ADMIN), 1, mine["dashboard_uuid"])
    assert _codes(captures.get_capture, db, _user(REPORTS), 1, made["capture_uuid"]) == 404


def test_captures_outlive_their_dashboard_and_the_log_filters(db):
    org = _starter(db, "starter:org.overview")
    plan = _starter(db, "starter:plan.performance")
    first = captures.capture_dashboard(db, _user(ADMIN), 1, org["dashboard_uuid"])
    second = captures.capture_dashboard(db, _user(ADMIN), 1, plan["dashboard_uuid"], key="tpl_cl")
    assert [item["capture_uuid"] for item in captures.list_captures(db, _user(ADMIN), 1, dashboard_uuid=org["dashboard_uuid"])] == [first["capture_uuid"]]
    assert [item["capture_uuid"] for item in captures.list_captures(db, _user(ADMIN), 1, scope="plan", key="tpl_cl")] == [second["capture_uuid"]]
    assert captures.list_captures(db, _user(ADMIN), 1, scheduled=True) == []
    assert "results" not in captures.list_captures(db, _user(ADMIN), 1)[0]

    dashboards.delete_dashboard(db, _user(ADMIN), 1, org["dashboard_uuid"])
    kept = captures.get_capture(db, _user(REPORTS), 1, first["capture_uuid"])
    assert kept["dashboard_uuid"] is None and kept["results"] == first["results"]


def test_only_the_maker_changes_the_note(db):
    board = _starter(db, "starter:org.overview")
    made = captures.capture_dashboard(db, _user(REPORTS), 1, board["dashboard_uuid"])
    assert captures.update_note(db, _user(REPORTS), 1, made["capture_uuid"], "For the board")["note"] == "For the board"
    assert _codes(captures.update_note, db, _user(ADMIN), 1, made["capture_uuid"], "Mine now") == 403


def test_the_read_only_link_hides_small_numbers_names_and_drills(db):
    board = _starter(db, "starter:group.progress")
    made = captures.capture_dashboard(db, _user(ADMIN), 1, board["dashboard_uuid"], key="grp_fall", note="Fall cohort")
    assert _codes(captures.set_link, db, _user(REPORTS), 1, made["capture_uuid"], on=True) == 403
    assert _codes(captures.set_link, db, _user(ADMIN), 1, made["capture_uuid"], on=True, days=3) == 422
    link = captures.set_link(db, _user(ADMIN), 1, made["capture_uuid"], on=True, days=30)["link"]
    assert link["token"] and link["expires_at"] and not link["expired"]

    public = captures.shared(db, link["token"])
    assert public["note"] == "Fall cohort" and public["object_label"] and "captured_by" not in public
    found = list(_walk(public["results"]))
    assert all(not item.get("drill") for item in found) and all(not item.get("link") for item in found)
    # The Fall group has six learners, so every count of them is hidden.
    hidden = [item for item in found if item.get("hidden")]
    assert hidden and all(item["v"] is None and item["text"] == "Fewer than 10" for item in hidden)

    captures.set_link(db, _user(ADMIN), 1, made["capture_uuid"], on=False)
    assert _codes(captures.shared, db, link["token"]) == 404


def test_an_expired_link_stops_working(db):
    board = _starter(db, "starter:org.overview")
    made = captures.capture_dashboard(db, _user(ADMIN), 1, board["dashboard_uuid"])
    token = captures.set_link(db, _user(ADMIN), 1, made["capture_uuid"], on=True, days=7)["link"]["token"]
    row = db.get(InsightCapture, 1)
    row.link_expires_at = "2020-01-01T00:00:00+00:00"
    db.add(row)
    db.commit()
    assert _codes(captures.shared, db, token) == 404
    assert _codes(captures.shared, db, "") == 404


def test_shield_rewrites_a_ranked_headline_without_the_hidden_row():
    result = {
        "measure": "completion_rate", "shape": "ranked", "headline": "Evening finishes most often (80%); Fall least (20%)",
        "auto_headline": "Evening finishes most often (80%); Fall least (20%)", "drill": "all",
        "value": {"v": 0.5, "n": 40, "text": "50%", "few": False},
        "compare": {"v": 0.4, "text": "40%", "change": "+10 pts", "tone": "good", "real": True, "against": "the 90 days before"},
        "rows": [
            {"key": "a", "label": "Evening", "v": 0.8, "n": 20, "text": "80%", "few": False, "drill": "group=a", "link": {"scope": "group", "key": "a"}},
            {"key": "b", "label": "Morning", "v": 0.5, "n": 15, "text": "50%", "few": False, "drill": "group=b", "link": None},
            {"key": "c", "label": "Fall", "v": 0.2, "n": 5, "text": "20%", "few": True, "drill": "group=c", "link": None},
        ],
        "series": None, "more": None,
    }
    out = captures.shield(result, {"measure": "completion_rate", "by": "group"})
    assert [row.get("hidden", False) for row in out["rows"]] == [False, False, True]
    assert "Fall" not in out["headline"] and "Evening" in out["headline"] and out["compare"]
    assert out["drill"] is None and all(row["drill"] is None and row["link"] is None for row in out["rows"])

    custom = {**result, "headline": "Our own words"}
    assert captures.shield(custom, {"by": "group"})["headline"] == "Our own words"

    tiny = {**result, "value": {"v": 0.5, "n": 4, "text": "50%", "few": True}}
    assert captures.shield(tiny, {"by": "group"})["headline"].startswith("Too few to share") and captures.shield(tiny, {"by": "group"})["compare"] is None


def test_attachments_are_built_with_the_capture_and_kept_off_links_unless_public(db, monkeypatch):
    built = []
    monkeypatch.setitem(captures.ATTACHMENTS, "roster", captures.Attachment("Roster", lambda ctx, row: built.append(row.title) or {"rows": [{"name": "Ana"}]}))
    monkeypatch.setitem(captures.ATTACHMENTS, "summary", captures.Attachment("Summary", lambda ctx, row: {"text": "ok"}, public=True))
    board = _starter(db, "starter:org.overview")
    made = captures.capture_dashboard(db, _user(ADMIN), 1, board["dashboard_uuid"], attach=["roster", "summary", "roster"])
    assert built == [board["title"]]
    assert [(item["kind"], item["label"]) for item in made["attachments"]] == [("roster", "Roster"), ("summary", "Summary")]
    assert made["attachments"][0]["rows"] == [{"name": "Ana"}]
    token = captures.set_link(db, _user(ADMIN), 1, made["capture_uuid"], on=True)["link"]["token"]
    assert [item["kind"] for item in captures.shared(db, token)["attachments"]] == ["summary"]


def test_the_read_only_link_route_needs_no_sign_in():
    from src.router import v1_router

    route = next(item for item in v1_router.routes if getattr(item, "path", "") == "/api/v1/insights/shared/{token}")
    calls = {getattr(dep.call, "__name__", "") for dep in route.dependant.dependencies}  # type: ignore[attr-defined]
    assert not calls & {"get_non_api_token_user", "get_current_user"}
    others = next(item for item in v1_router.routes if getattr(item, "path", "") == "/api/v1/insights/captures/{capture_uuid}" and "GET" in item.methods)  # type: ignore[attr-defined]
    assert "get_non_api_token_user" in {getattr(dep.call, "__name__", "") for dep in others.dependant.dependencies}  # type: ignore[attr-defined]
