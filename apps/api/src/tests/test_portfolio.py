import pytest
from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from src.db.learning import LearningActivity, LearningActivityRun, LearningBadge, LearningPage, LearningPageProgress, LearningPageType, LearningPath, LearningRun
from src.db.media import MediaAsset
from src.db.organizations import Organization
from src.db.portfolio import JourneyEntry, JourneyEntryBlock, JourneyEntryCreate, JourneyEntryUpdate, JourneyWorkLink, Portfolio, PortfolioLink, PortfolioSection, PortfolioUpdate, PublishRequest, WorkItem, WorkItemBlock, WorkItemCreate, WorkItemUpdate
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services import portfolio as service
from src.services.learning_portfolio_actions import PortfolioActionError, apply_portfolio_outcomes


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[User.__table__, Organization.__table__, Role.__table__, UserOrganization.__table__, MediaAsset.__table__, Portfolio.__table__, PortfolioSection.__table__, PortfolioLink.__table__, WorkItem.__table__, WorkItemBlock.__table__, JourneyEntry.__table__, JourneyEntryBlock.__table__, JourneyWorkLink.__table__])
    return Session(engine)


def _user(user_id=1, username="maya"):
    return User(id=user_id, user_uuid=f"user_{user_id}", username=username, first_name="Maya", last_name="Rivera", email=f"{username}@example.com", profile={}, details={})


def _public(user):
    return PublicUser.model_validate(user)


def test_launch_ready_next_action_uses_badge_path_order_and_page_completion():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    for model in (User, LearningBadge, LearningPath, LearningActivity, LearningPage, LearningRun, LearningActivityRun, LearningPageProgress):
        model.__table__.create(engine)
    with Session(engine) as db:
        user = _user(); db.add(user)
        badge = LearningBadge(id=1, badge_uuid="badge_system_onboarding", org_id=1, collection_id=1, name="Launch Ready")
        path = LearningPath(id=1, path_uuid="learning_path_system_onboarding", badge_id=1, org_id=1)
        db.add(badge); db.add(path)
        activities = [
            LearningActivity(id=1, activity_uuid="learning_activity_system_onboarding_intro", badge_id=1, path_id=1, org_id=1, title="Introduce yourself", order=1),
            LearningActivity(id=2, activity_uuid="learning_activity_custom_complete_portfolio", badge_id=1, path_id=1, org_id=1, title="Complete your portfolio", thumbnail_image="/custom/complete.png", order=2),
            LearningActivity(id=3, activity_uuid="learning_activity_system_onboarding_journey", badge_id=1, path_id=1, org_id=1, title="Add your current chapter", order=3),
        ]
        db.add_all(activities)
        pages = [LearningPage(id=index, page_uuid=f"page_{index}", activity_id=index, badge_id=1, org_id=1, page_type=LearningPageType.STANDARD, title=f"Page {index}", order=1, required=True) for index in range(1, 4)]
        db.add_all(pages)
        run = LearningRun(id=1, run_uuid="run_1", badge_id=1, path_id=1, org_id=1, user_id=1)
        db.add(run); db.add(LearningPageProgress(run_id=1, page_id=1, complete=True)); db.commit()

        state = service._launch_ready_state(1, db)

        assert state["nextAction"]["label"] == "Complete your portfolio"
        assert state["nextAction"]["thumbnailImage"] == "/custom/complete.png"
        assert state["progress"] == {"completed": 1, "total": 3}


def test_private_by_default_and_created_work_is_public_after_portfolio_publish():
    with _session() as db:
        user = _user()
        org = Organization(id=1, org_uuid="org_1", name="Youth Lab", slug="youth", email="org@example.com")
        role = Role(id=1, name="member")
        db.add(user); db.add(org); db.add(role); db.commit()
        db.add(UserOrganization(user_id=1, org_id=1, role_id=1, creation_date="", update_date="")); db.commit()

        shell = service.get_owner_shell(_public(user), db)
        assert shell["portfolio"]["visibility"] == "private"
        assert shell["portfolio"]["username"] == "maya"
        service.create_work(WorkItemCreate(title="My first build", summary="A prototype"), _public(user), db)
        portfolio = service._get_portfolio(db, 1)
        portfolio.previewed_at = service._now(); portfolio.privacy_confirmed_at = service._now(); portfolio.revision += 1
        db.add(portfolio); db.commit(); db.refresh(portfolio)
        service.publish_portfolio(PublishRequest(revision=portfolio.revision, privacy_confirmed=True), _public(user), db)

        public = service.get_public_shell(1, "maya", db)
        assert len(public["work"]) == 1
        assert public["work"][0]["status"] == "published"


def test_activity_journey_outcome_assigns_only_an_owned_cover_image():
    with _session() as db:
        user = _user(); db.add(user); db.commit()
        owned = MediaAsset(asset_uuid="asset_owned", owner_type="user", owner_user_id=1, source_type="upload", media_type="image", title="Chapter", url="/chapter.jpg")
        foreign = MediaAsset(asset_uuid="asset_foreign", owner_type="user", owner_user_id=2, source_type="upload", media_type="image", title="Other", url="/other.jpg")
        db.add(owned); db.add(foreign); db.commit()
        outcomes = {"version": 1, "actions": [{"id": "chapter", "type": "create_journey_entry", "fields": {"title": "My chapter", "cover_asset_uuid": "asset_owned", "is_current": True}}]}
        apply_portfolio_outcomes(db, user, 7, outcomes, {"answers": {}, "bindings": {}})
        db.commit()
        entry = db.exec(select(JourneyEntry)).one()
        assert entry.cover_asset_id == owned.id

        invalid = {"version": 1, "actions": [{"id": "other", "type": "create_journey_entry", "fields": {"title": "Not mine", "cover_asset_uuid": "asset_foreign"}}]}
        with pytest.raises(PortfolioActionError, match="owned by the learner"):
            apply_portfolio_outcomes(db, user, 8, invalid, {"answers": {}, "bindings": {}})

        invalid_date = {"version": 1, "actions": [{"id": "bad-date", "type": "create_journey_entry", "fields": {"title": "Broken date", "start_date": "sometime last year"}}]}
        with pytest.raises(PortfolioActionError, match="YYYY-MM"):
            apply_portfolio_outcomes(db, user, 9, invalid_date, {"answers": {}, "bindings": {}})


def test_activity_work_outcome_persists_story_cover_and_existing_journey_link():
    with _session() as db:
        user = _user(); db.add(user); db.commit()
        cover = MediaAsset(asset_uuid="asset_work", owner_type="user", owner_user_id=1, source_type="upload", media_type="image", title="Work cover", url="/work.jpg")
        db.add(cover); db.commit()
        portfolio = Portfolio(portfolio_uuid="por_existing", user_id=1, creation_date="", update_date="")
        db.add(portfolio); db.flush()
        journey = JourneyEntry(journey_uuid="jrn_existing", portfolio_id=portfolio.id, title="My current chapter", slug="current", creation_date="", update_date="")
        db.add(journey); db.commit()
        outcomes = {"version": 1, "actions": [
            {"id": "work", "type": "create_work_item", "store_as": "work_item_id", "fields": {"title": "Community garden", "subtitle": "Growing food together", "story_kind": "made"}, "story": "I planned the beds and learned how to coordinate volunteers.", "cover_asset_uuid": "asset_work"},
            {"id": "link", "type": "link_work_to_journey", "work": {"$source": "binding", "key": "work_item_id"}, "journey": "jrn_existing", "optional": True},
        ]}
        apply_portfolio_outcomes(db, user, 10, outcomes, {"answers": {}, "bindings": {}}); db.commit()

        work = db.exec(select(WorkItem)).one()
        blocks = db.exec(select(WorkItemBlock).where(WorkItemBlock.work_item_id == work.id).order_by(WorkItemBlock.sort_order)).all()
        assert work.cover_asset_id == cover.id
        assert [(block.block_type, block.data) for block in blocks] == [
            ("text", {"text": "I planned the beds and learned how to coordinate volunteers."}),
            ("image", {"asset_uuid": "asset_work", "url": "/work.jpg", "caption": ""}),
        ]
        assert db.exec(select(JourneyWorkLink).where(JourneyWorkLink.work_item_id == work.id, JourneyWorkLink.journey_entry_id == journey.id)).one()


def test_work_idempotency_revision_conflict_and_publish_flow():
    with _session() as db:
        user = _user()
        db.add(user); db.commit()
        actor = _public(user)
        first = service.create_work(WorkItemCreate(title="Community garden", idempotency_key="request-1"), actor, db)
        second = service.create_work(WorkItemCreate(title="Duplicate", idempotency_key="request-1"), actor, db)
        assert first["work_uuid"] == second["work_uuid"]

        updated = service.update_work(first["work_uuid"], WorkItemUpdate(revision=first["revision"], summary="We grew food together"), actor, db)
        assert updated["status"] == "published"
        with pytest.raises(HTTPException) as error:
            service.update_work(first["work_uuid"], WorkItemUpdate(revision=first["revision"], title="Stale edit"), actor, db)
        assert error.value.status_code == 409


def test_legacy_import_is_repeatable_and_preserves_profile_json():
    with _session() as db:
        original = {"featured": {"cards": [{"title": "Robot", "description": "Built in class"}]}}
        user = _user(); user.profile = original
        db.add(user); db.commit()
        actor = _public(user)
        first = service.execute_legacy_import(actor, db)
        second = service.execute_legacy_import(actor, db)
        db.refresh(user)
        assert first["imported"] == 1
        assert second["imported"] == 0
        assert user.profile == original


def test_portfolio_revision_conflict():
    with _session() as db:
        user = _user(); db.add(user); db.commit()
        actor = _public(user)
        shell = service.get_owner_shell(actor, db)
        service.update_portfolio(PortfolioUpdate(revision=shell["portfolio"]["revision"], headline="I make useful things"), actor, db)
        with pytest.raises(HTTPException) as error:
            service.update_portfolio(PortfolioUpdate(revision=shell["portfolio"]["revision"], headline="Stale"), actor, db)
        assert error.value.status_code == 409


def test_header_socials_can_be_added_edited_and_removed():
    with _session() as db:
        user = _user(); db.add(user); db.commit()
        actor = _public(user)
        shell = service.get_owner_shell(actor, db)
        updated = service.update_portfolio(PortfolioUpdate(revision=shell["portfolio"]["revision"], socials=[{"type": "instagram", "url": "instagram.com/maya"}]), actor, db)
        assert updated["portfolio"]["socials"] == [{"type": "instagram", "url": "https://instagram.com/maya"}]
        removed = service.update_portfolio(PortfolioUpdate(revision=updated["portfolio"]["revision"], socials=[]), actor, db)
        assert removed["portfolio"]["socials"] == []


def test_journey_current_first_links_work_and_checks_revision():
    with _session() as db:
        user = _user(); db.add(user); db.commit(); actor = _public(user)
        image = MediaAsset(asset_uuid="asset_chapter", owner_type="user", owner_user_id=1, created_by_user_id=1, source_type="upload", media_type="image", url="/media/chapter.jpg")
        db.add(image); db.commit()
        work = service.create_work(WorkItemCreate(title="StudyMate"), actor, db)
        older = service.create_journey(JourneyEntryCreate(title="Started school", entry_type="education", start_date="2023-09"), actor, db)
        current = service.create_journey(JourneyEntryCreate(title="Design internship", start_date="2025-01", is_current=True, cover_asset_uuid="asset_chapter", blocks=[{"block_type": "image", "data": {"asset_uuid": "asset_chapter", "url": "/media/chapter.jpg"}}], work_links=[{"work_uuid": work["work_uuid"], "relationship_label": "Built here"}]), actor, db)
        shell = service.get_owner_shell(actor, db)
        assert shell["journey"][0]["journey_uuid"] == current["journey_uuid"]
        assert shell["journey"][0]["work"][0]["title"] == "StudyMate"
        assert shell["journey"][0]["cover_url"] == "/media/chapter.jpg"
        assert shell["journey"][0]["blocks"][0]["data"]["asset_uuid"] == "asset_chapter"
        assert next(view for view in shell["views"] if view["key"] == "journey")["visible"] is True
        with pytest.raises(HTTPException) as error:
            service.update_journey(older["journey_uuid"], JourneyEntryUpdate(revision=999, title="Stale"), actor, db)
        assert error.value.status_code == 409


def test_legacy_timeline_import_is_repeatable():
    with _session() as db:
        user = _user(); user.profile = {"timeline": [{"title": "Community lead", "category": "work", "company": "Youth Lab", "startDate": "2024-01"}]}; db.add(user); db.commit(); actor = _public(user)
        first, second = service.execute_legacy_import(actor, db), service.execute_legacy_import(actor, db)
        assert first["journeyImported"] == 1
        assert second["journeyImported"] == 0
