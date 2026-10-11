from sqlmodel import Session

from src.db.learning import BadgeCollection, LearningBadge, LearningBadgeAward, LearningBadgeStatus
from src.db.planning import PlanObjectiveProgressUpdate, PlanObjectiveStatus
from src.db.users import AnonymousUser
from src.services import badge_discover, badge_routes, planning
from src.db.badge_routes import BadgePlanStart
from src.tests.test_badge_routes import LEARNER, _session, _world
from src.tests.test_programs import NOW


def _collect(session: Session) -> None:
    for model in (BadgeCollection, LearningBadgeAward):
        model.__table__.create(session.get_bind(), checkfirst=True)
    session.add(BadgeCollection(id=1, collection_uuid="badge_collection_work", org_id=1, name="Work ready", creation_date=NOW, update_date=NOW,
                                collection_metadata={"credibility": "Built with local employers", "endorsers": [{"name": "Chamber of Commerce"}]}))
    badge = session.get(LearningBadge, 1)
    badge.collection_id = 1
    badge.badge_metadata = {"overview_subtitle": "Roll with it", "overview_cards": [{"title": "Adjust fast", "body": "Change course when plans shift"}, {"title": ""}]}
    session.add(LearningBadge(id=2, badge_uuid="badge_lead", org_id=1, collection_id=1, name="Leadership", status=LearningBadgeStatus.PUBLISHED, creation_date=NOW, update_date=NOW))
    session.commit()


def test_discover_groups_badges_and_follows_the_learner():
    with _session() as session:
        _world(session)
        _collect(session)
        feed = badge_discover.discover(session, AnonymousUser())
        assert {card["name"] for card in feed["featured"]} == {"Leadership", "Adaptability"}
        assert feed["collections"][0]["name"] == "Work ready" and feed["collections"][0]["credibility"] == "Built with local employers"
        assert {card["name"] for card in feed["collections"][0]["badges"]} == {"Adaptability", "Leadership"}
        adapt = next(card for card in feed["badges"] if card["badge_uuid"] == "badge_adapt")
        assert adapt["subtitle"] == "Roll with it" and adapt["route_count"] == 2 and adapt["plan"] is None

        plan = badge_routes.start_badge_plan(session, LEARNER, "badge_adapt", BadgePlanStart())
        planning.update_objective_progress(session, LEARNER, plan["slug"], plan["objectives"][0]["objective_uuid"], PlanObjectiveProgressUpdate(status=PlanObjectiveStatus.COMPLETED))
        feed = badge_discover.discover(session, LEARNER)
        assert [(card["name"], card["plan"]["done"], card["plan"]["total"]) for card in feed["keep_going"]] == [("Adaptability", 1, 2)]
        assert "badge_adapt" not in {card["badge_uuid"] for card in feed["badges"] + feed["featured"]}


def test_badge_page_tells_the_story_and_shows_the_set():
    with _session() as session:
        _world(session)
        _collect(session)
        page = badge_discover.badge_page(session, LEARNER, "adapt")
        assert page["proves"] == [{"title": "Adjust fast", "body": "Change course when plans shift"}]
        assert [card["name"] for card in page["collection"]["badges"]] == ["Leadership"]
        assert page["collection"]["endorsers"] == [{"name": "Chamber of Commerce"}]
        assert page["ways"]["routes"][0]["recommended"] and page["ways"]["routes"][0]["steps"][0]["title"] == "Notice change"

        collection = badge_discover.collection_page(session, None, "work")
        assert collection["creator"]["name"] == "Studio" and len(collection["badges"]) == 2
