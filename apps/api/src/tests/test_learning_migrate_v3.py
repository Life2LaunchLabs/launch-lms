"""The version 3 activity migration: page conversion, dry runs, batches, the audit and putting things back."""

from sqlmodel import select

from src.db.learning import LearningActivity, LearningContentBackup, LearningPage, LearningPageType
from src.db.organizations import Organization
from src.services.learning_content import migrate_v3
from src.services.learning_content.models import StandardPageContent, content_error
from src.services.learning_sequence import resolve_activity
from src.tests.test_goals import NOW, _session
from src.tests.test_learning_sequence import _context, _flow, _picked


def _doc(*nodes) -> dict:
    return {"type": "doc", "content": list(nodes)}


def _heading(text: str, level: int = 1) -> dict:
    return {"type": "heading", "attrs": {"level": level}, "content": [{"type": "text", "text": text}]}


def _paragraph(text: str) -> dict:
    return {"type": "paragraph", "content": [{"type": "text", "text": text}]}


def _text(block_id: str, *nodes) -> dict:
    return {"id": block_id, "type": "text", "content": {"node": _doc(*nodes)}}


def test_a_leading_heading_becomes_the_page_heading_and_the_rest_of_the_text_stays():
    content = {"version": 2, "blocks": [_text("t1", _heading("Needs vs wants"), _paragraph("Sort these.")), {"id": "i1", "type": "image", "content": {"src": "", "alt": ""}}]}
    upgraded, flags = migrate_v3.page_to_v3("p1", content)
    assert flags == [] and content_error(StandardPageContent, upgraded) is None
    heading, text, image = upgraded["blocks"]
    assert heading["type"] == "heading" and heading["content"] == {"text": "Needs vs wants", "size": "xl"}
    assert text["id"] == "t1" and text["content"]["node"]["content"] == [_paragraph("Sort these.")]
    assert image["id"] == "i1"
    # A text block that only held the heading goes away.
    upgraded, _ = migrate_v3.page_to_v3("p1", {"version": 2, "blocks": [_text("t1", _heading("Just this", 2))]})
    assert [block["type"] for block in upgraded["blocks"]] == ["heading"] and upgraded["blocks"][0]["content"]["size"] == "l"


def test_pages_without_a_heading_get_an_empty_one_and_go_back_buttons_are_removed():
    upgraded, flags = migrate_v3.page_to_v3("p1", {"blocks": [_text("t1", _paragraph("Hello"))]})
    assert [flag["code"] for flag in flags] == ["heading_empty"]
    assert [block["type"] for block in upgraded["blocks"]] == ["heading", "text"] and upgraded["blocks"][0]["content"]["text"] == ""
    assert upgraded["version"] == 3
    revisit = {"id": "b1", "type": "button", "content": {"label": "Back", "action": "revisit", "target_page_uuid": "p0"}}
    upgraded, flags = migrate_v3.page_to_v3("p1", {"blocks": [_text("t1", _heading("Check it")), revisit]})
    assert [flag["code"] for flag in flags] == ["revisit_removed"] and [block["type"] for block in upgraded["blocks"]] == ["heading"]


def test_variant_pages_and_version_3_pages_stay_as_they_are():
    variants = {"version": 2, "blocks": [], "variants": {"source": {"page_uuid": "p0"}, "overrides": {"a": {"blocks": []}}}}
    assert migrate_v3.page_to_v3("p1", variants) == (None, [{"code": "variants", "message": migrate_v3.page_to_v3("p1", variants)[1][0]["message"], "page_uuid": "p1"}])
    assert migrate_v3.page_to_v3("p1", {"version": 3, "blocks": [{"id": "h", "type": "heading", "content": {"text": "Hi"}}]}) == (None, [])


def _activity(db, title: str, settings: dict, pages: dict[str, dict], frozen_from_id=None) -> LearningActivity:
    activity = LearningActivity(org_id=1, title=title, activity_uuid=f"learning_activity_{title}", settings=settings, frozen_from_id=frozen_from_id, creation_date=NOW, update_date=NOW)
    db.add(activity)
    db.commit()
    for order, (uuid, content) in enumerate(pages.items()):
        db.add(LearningPage(activity_id=activity.id, org_id=1, page_uuid=uuid, page_type=LearningPageType.STANDARD, title=uuid, order=order,
                            content=content, creation_date=NOW, update_date=NOW))
    db.commit()
    return activity


def _world(db):
    LearningContentBackup.__table__.create(db.get_bind(), checkfirst=True)  # type: ignore[attr-defined]
    if not db.get(Organization, 1):
        db.add(Organization(id=1, name="Org", slug="org", email="org@example.com", org_uuid="org_1", creation_date=NOW, update_date=NOW))
        db.commit()
    page = lambda text: {"version": 2, "blocks": [_text(f"t_{text}", _heading(text), _paragraph("Body"))]}  # noqa: E731
    flow = _flow(["a1", "a2", "a3", "end"], [("a1", "a2", _picked("a1", "opt_a")), ("a1", "a3"), ("a2", "end", _picked("a2", "opt_quit")), ("a2", "a3"), ("a3", "end")])
    branching = _activity(db, "branching", {"flow": flow}, {"a1": page("One"), "a2": page("Two"), "a3": page("Three")})
    linear = _activity(db, "linear", {}, {"b1": page("Only")})
    return branching, linear


def test_a_dry_run_writes_nothing_and_reports_what_it_would_do():
    with _session() as db:
        branching, _ = _world(db)
        result = migrate_v3.migrate(db, apply=False, batch_size=1)
        assert (result["activities"], result["sequences"], result["pages_converted"]) == (2, 2, 4)
        assert result["flags"] == {"end_jump": 1, "lifted_branch": 1}
        assert [row["activity_uuid"] for row in result["flagged"]] == [branching.activity_uuid]
        db.expire_all()
        assert "sequence" not in db.get(LearningActivity, branching.id).settings
        assert db.exec(select(LearningPage).where(LearningPage.page_uuid == "a1")).one().content["version"] == 2
        assert db.exec(select(LearningContentBackup)).all() == []


def test_applying_writes_sequences_and_version_3_keeps_backups_and_can_run_again():
    with _session() as db:
        branching, linear = _world(db)
        before = {key: resolve_activity(branching.settings, [{"page_uuid": uuid} for uuid in ("a1", "a2", "a3")], _context(a1=key)).page_uuids for key in ("opt_a", "opt_b")}
        result = migrate_v3.migrate(db, apply=True, batch_size=1)
        assert (result["sequences"], result["pages_converted"]) == (2, 4)
        db.expire_all()
        stored = db.get(LearningActivity, branching.id).settings
        assert stored["sequence"] and stored["flow"]  # the flow stays for one release
        for key, route in before.items():
            assert resolve_activity(stored, [], _context(a1=key)).page_uuids == route
        page = db.exec(select(LearningPage).where(LearningPage.page_uuid == "a1")).one()
        assert page.content["version"] == 3 and page.content["blocks"][0]["content"]["text"] == "One"
        assert len(db.exec(select(LearningContentBackup)).all()) == 2 + 4

        again = migrate_v3.migrate(db, apply=True)
        assert (again["sequences"], again["pages_converted"]) == (0, 0)

        assert migrate_v3.restore(db) == 6
        db.expire_all()
        assert "sequence" not in db.get(LearningActivity, branching.id).settings
        assert db.get(LearningActivity, linear.id).settings == {}
        assert db.exec(select(LearningPage).where(LearningPage.page_uuid == "a1")).one().content["version"] == 2


def test_the_audit_lists_activities_that_need_a_person():
    with _session() as db:
        branching, linear = _world(db)
        _activity(db, "published", {}, {"c1": {"blocks": [], "variants": {"source": {"page_uuid": "b1"}, "overrides": {"a": {"blocks": []}}}}}, frozen_from_id=linear.id)
        rows = migrate_v3.audit_activities(db, org_id=1)
        assert [row["activity_uuid"] for row in rows] == [branching.activity_uuid]
        assert rows[0]["codes"] == {"end_jump": 1, "lifted_branch": 1} and rows[0]["org_slug"] == db.get(Organization, 1).slug
        assert {row["title"] for row in migrate_v3.audit_activities(db, include_frozen=True)} == {"branching", "published"}
        assert {row["title"] for row in migrate_v3.audit_activities(db, only_review=False, include_frozen=True)} == {"branching", "published"}
