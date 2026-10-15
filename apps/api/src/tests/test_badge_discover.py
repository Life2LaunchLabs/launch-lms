from sqlmodel import Session

from src.db.learning import BadgeCollection, LearningBadge, LearningBadgeAward, LearningBadgeStatus
from src.db.goals import StepStatus, StepStatusChange
from src.db.users import AnonymousUser
from src.services import badge_discover
from src.services.goals import goals
from src.services.goals.badges import start_badge_goal
from src.tests.test_goal_badges import _world
from src.tests.test_goals import LEARNER as LEARNER_ID, NOW, _user

LEARNER = _user(LEARNER_ID)


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
    session, _, _ = _world()
    with session:
        _collect(session)
        feed = badge_discover.discover(session, AnonymousUser())
        assert {card["name"] for card in feed["featured"]} == {"Leadership", "Adaptability"}
        assert feed["collections"][0]["name"] == "Work ready" and feed["collections"][0]["credibility"] == "Built with local employers"
        assert {card["name"] for card in feed["collections"][0]["badges"]} == {"Adaptability", "Leadership"}
        adapt = next(card for card in feed["badges"] if card["badge_uuid"] == "badge_adapt")
        assert adapt["subtitle"] == "Roll with it" and adapt["route_count"] == 2 and adapt["goal"] is None

        goal = start_badge_goal(session, LEARNER, session.get(LearningBadge, 1), None, None)
        first = goals.get_goal(session, LEARNER, goal.goal_uuid)["stages"][0]["steps"][0]
        goals.change_status(session, LEARNER, goal.goal_uuid, first["step_uuid"], StepStatusChange(status=StepStatus.COMPLETED))
        feed = badge_discover.discover(session, LEARNER)
        assert [(card["name"], card["goal"]["goal_uuid"], card["goal"]["done"], card["goal"]["total"]) for card in feed["keep_going"]] == [("Adaptability", goal.goal_uuid, 1, 2)]
        assert "badge_adapt" not in {card["badge_uuid"] for card in feed["badges"] + feed["featured"]}


def test_badge_page_tells_the_story_and_shows_the_set():
    session, _, _ = _world()
    with session:
        _collect(session)
        page = badge_discover.badge_page(session, LEARNER, "adapt")
        assert page["proves"] == [{"title": "Adjust fast", "body": "Change course when plans shift"}]
        assert [card["name"] for card in page["collection"]["badges"]] == ["Leadership"]
        assert page["collection"]["endorsers"] == [{"name": "Chamber of Commerce"}]
        assert page["ways"]["routes"][0]["recommended"] and page["ways"]["routes"][0]["steps"][0]["title"] == "Notice change"
        assert page["ways"]["goal"] is None and page["ways"]["routes"][0]["template_uuid"]

        collection = badge_discover.collection_page(session, None, "work")
        assert collection["creator"]["name"] == "Studio" and len(collection["badges"]) == 2
