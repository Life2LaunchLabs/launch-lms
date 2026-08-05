import pytest
from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from src.db.learning import (
    LearningActivity,
    LearningActivityRun,
    LearningBadge,
    LearningBadgeAward,
    LearningPage,
    LearningPageProgress,
    LearningPath,
    LearningRun,
)
from src.db.media import MediaAsset
from src.db.organizations import Organization
from src.db.portfolio import (
    TimelineEntry,
    TimelineEntryBlock,
    TimelineEntryCreate,
    TimelineEntryUpdate,
    TimelineProjectLink,
    Portfolio,
    PortfolioFeaturedTimelineUpdate,
    PortfolioFeaturedProjectUpdate,
    PortfolioTraitsUpdate,
    PortfolioLink,
    ProfileTrait,
    PortfolioSection,
    PortfolioUpdate,
    PublishRequest,
    ProjectItem,
    ProjectItemBlock,
    ProjectItemCreate,
    ProjectItemUpdate,
)
from src.db.roles import Role
from src.db.user_organizations import UserOrganization
from src.db.users import PublicUser, User
from src.services import portfolio as service
from src.services.learning_portfolio_actions import (
    PortfolioActionError,
    apply_portfolio_outcomes,
)


def _session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    SQLModel.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Organization.__table__,
            Role.__table__,
            UserOrganization.__table__,
            MediaAsset.__table__,
            Portfolio.__table__,
            PortfolioSection.__table__,
            PortfolioLink.__table__,
            ProfileTrait.__table__,
            ProjectItem.__table__,
            ProjectItemBlock.__table__,
            TimelineEntry.__table__,
            TimelineEntryBlock.__table__,
            TimelineProjectLink.__table__,
            LearningBadge.__table__,
            LearningPath.__table__,
            LearningActivity.__table__,
            LearningPage.__table__,
            LearningRun.__table__,
            LearningActivityRun.__table__,
            LearningPageProgress.__table__,
            LearningBadgeAward.__table__,
        ],
    )
    return Session(engine)


def _user(user_id=1, username="maya"):
    return User(
        id=user_id,
        user_uuid=f"user_{user_id}",
        username=username,
        first_name="Maya",
        last_name="Rivera",
        email=f"{username}@example.com",
        email_verified=True,
        profile={},
        details={},
    )


def _public(user):
    return PublicUser.model_validate(user)


def test_launch_ready_checklist_is_content_derived():
    with _session() as db:
        user = _user()
        db.add(user)
        badge = LearningBadge(
            id=1,
            badge_uuid="badge_system_onboarding",
            org_id=1,
            collection_id=1,
            name="Launch Ready",
            system_type="onboarding",
        )
        path = LearningPath(
            id=1, path_uuid="learning_path_system_onboarding", badge_id=1, org_id=1
        )
        db.add(badge)
        db.add(path)
        activity = LearningActivity(id=1, activity_uuid="learning_activity_system_onboarding_intro", badge_id=1, path_id=1, org_id=1, title="Introduce yourself", order=1)
        db.add(activity)
        run = LearningRun(
            id=1, run_uuid="run_1", badge_id=1, path_id=1, org_id=1, user_id=1
        )
        db.add(run)
        db.add(LearningActivityRun(id=1, run_id=1, activity_id=1, status="completed"))
        db.commit()

        state = service._launch_ready_state(1, db)

        assert state["completed"] == 1
        assert state["total"] == 7
        assert state["items"][0]["complete"] is True
        assert state["nextIncomplete"]["key"] == "current_experience"

        portfolio = Portfolio(
            portfolio_uuid="por_timeline_checklist",
            user_id=1,
            creation_date="",
            update_date="",
        )
        db.add(portfolio)
        db.flush()
        db.add(TimelineEntry(
            timeline_uuid="tml_past",
            portfolio_id=portfolio.id,
            title="A previous experience",
            slug="previous-experience",
            is_current=False,
            creation_date="",
            update_date="",
        ))
        db.commit()

        state = service._launch_ready_state(1, db, timeline_count=1)
        assert state["items"][1]["complete"] is True


def test_existing_launch_ready_award_is_permanent_when_content_is_removed():
    with _session() as db:
        user = _user()
        org = Organization(
            id=1,
            org_uuid="org_1",
            name="Youth Lab",
            slug="youth",
            email="org@example.com",
        )
        badge = LearningBadge(
            id=1,
            badge_uuid="badge_system_onboarding",
            org_id=1,
            collection_id=1,
            name="Launch Ready",
        )
        path = LearningPath(
            id=1, path_uuid="learning_path_system_onboarding", badge_id=1, org_id=1
        )
        db.add_all([user, org, badge, path])
        db.add(
            LearningBadgeAward(
                award_uuid="award_launch_ready", badge_id=1, org_id=1, user_id=1
            )
        )
        db.commit()

        state = service._launch_ready_state(1, db)

        assert state["earned"] is True
        assert state["completed"] == 0


def test_private_by_default_and_created_project_is_public_after_portfolio_publish():
    with _session() as db:
        user = _user()
        org = Organization(
            id=1,
            org_uuid="org_1",
            name="Youth Lab",
            slug="youth",
            email="org@example.com",
        )
        role = Role(id=1, name="member")
        db.add(user)
        db.add(org)
        db.add(role)
        db.commit()
        db.add(
            UserOrganization(
                user_id=1, org_id=1, role_id=1, creation_date="", update_date=""
            )
        )
        db.commit()

        shell = service.get_owner_shell(_public(user), db)
        assert shell["portfolio"]["visibility"] == "private"
        assert shell["portfolio"]["username"] == "maya"
        service.create_project(
            ProjectItemCreate(title="My first build", summary="A prototype"),
            _public(user),
            db,
        )
        portfolio = service._get_portfolio(db, 1)
        portfolio.previewed_at = service._now()
        portfolio.privacy_confirmed_at = service._now()
        portfolio.revision += 1
        db.add(portfolio)
        db.commit()
        db.refresh(portfolio)
        service.publish_portfolio(
            PublishRequest(revision=portfolio.revision, privacy_confirmed=True),
            _public(user),
            db,
        )

        public = service.get_public_shell(1, "maya", db)
        assert len(public["projects"]) == 1
        assert public["projects"][0]["title"] == "My first build"


def test_empty_portfolio_can_publish_without_preview():
    with _session() as db:
        user = _user()
        db.add(user)
        db.commit()
        actor = _public(user)
        portfolio = service.get_or_create_portfolio(actor, db)
        published = service.publish_portfolio(PublishRequest(revision=portfolio.revision, privacy_confirmed=True), actor, db)

        assert published["portfolio"]["published_at"] is not None
        assert published["readiness"]["canPublish"] is True


def test_owner_preview_uses_public_section_visibility():
    with _session() as db:
        user = _user()
        db.add(user)
        db.commit()
        actor = _public(user)
        service.get_owner_shell(actor, db)
        about = db.exec(
            select(PortfolioSection).where(PortfolioSection.section_type == "about")
        ).one()
        about.enabled = False
        db.add(about)
        db.commit()

        preview = service.get_owner_shell(actor, db, mark_previewed=True)

        assert "about" not in {
            section["section_type"] for section in preview["sections"]
        }
        assert preview["checklist"] is None


def test_unverified_user_cannot_publish():
    with _session() as db:
        user = _user()
        user.email_verified = False
        db.add(user)
        db.commit()
        portfolio = service.get_or_create_portfolio(_public(user), db)

        with pytest.raises(HTTPException) as error:
            service.publish_portfolio(
                PublishRequest(revision=portfolio.revision, privacy_confirmed=True),
                _public(user),
                db,
            )

        assert error.value.status_code == 403


def test_traits_allow_more_than_five_labels():
    with _session() as db:
        user = _user()
        db.add(user)
        db.commit()
        labels = [f"Value {index}" for index in range(8)]

        shell = service.update_traits(
            PortfolioTraitsUpdate(trait_type="value", labels=labels),
            _public(user),
            db,
        )

        assert shell["traits"]["value"] == labels


def test_project_current_date_mode_clears_end_date():
    with _session() as db:
        user = _user()
        db.add(user)
        db.commit()
        actor = _public(user)

        project = service.create_project(
            ProjectItemCreate(
                title="Ongoing build",
                start_date="2026-03",
                end_date="2026-07",
                is_ongoing=True,
            ),
            actor,
            db,
        )

        assert project["start_date"] == "2026-03"
        assert project["end_date"] is None
        assert project["date_precision"] == "month"
        assert project["is_ongoing"] is True


def test_public_shell_uses_allowlisted_dtos_without_internal_fields():
    with _session() as db:
        user = _user()
        org = Organization(
            id=1,
            org_uuid="org_1",
            name="Youth Lab",
            slug="youth",
            email="org@example.com",
        )
        role = Role(id=1, name="member")
        db.add_all([user, org, role])
        db.commit()
        db.add(
            UserOrganization(
                user_id=1, org_id=1, role_id=1, creation_date="", update_date=""
            )
        )
        db.commit()
        actor = _public(user)
        project = service.create_project(
            ProjectItemCreate(
                title="Public build",
                blocks=[{"block_type": "text", "data": {"text": "Built safely"}}],
            ),
            actor,
            db,
        )
        portfolio = service._get_portfolio(db, 1)
        portfolio.previewed_at = service._now()
        portfolio.privacy_confirmed_at = service._now()
        portfolio.revision += 1
        db.add(portfolio)
        db.commit()
        db.refresh(portfolio)
        service.publish_portfolio(
            PublishRequest(revision=portfolio.revision, privacy_confirmed=True),
            actor,
            db,
        )

        public = service.get_public_shell(1, "maya", db)

        assert {
            "id",
            "user_id",
            "revision",
            "privacy_confirmed_at",
            "previewed_at",
            "moderation_status",
            "theme_settings",
        }.isdisjoint(public["portfolio"])
        assert {
            "id",
            "portfolio_id",
            "revision",
            "source",
            "source_reference",
            "visibility",
            "status",
        }.isdisjoint(public["projects"][0])
        assert {
            "id",
            "project_item_id",
            "visibility",
            "creation_date",
            "update_date",
        }.isdisjoint(public["projects"][0]["blocks"][0])
        assert public["projects"][0]["project_uuid"] == project["project_uuid"]


def test_activity_timeline_outcome_assigns_only_an_owned_cover_image():
    with _session() as db:
        user = _user()
        db.add(user)
        db.commit()
        owned = MediaAsset(
            asset_uuid="asset_owned",
            owner_type="user",
            owner_user_id=1,
            source_type="upload",
            media_type="image",
            title="Chapter",
            url="/experience.jpg",
        )
        foreign = MediaAsset(
            asset_uuid="asset_foreign",
            owner_type="user",
            owner_user_id=2,
            source_type="upload",
            media_type="image",
            title="Other",
            url="/other.jpg",
        )
        db.add(owned)
        db.add(foreign)
        db.commit()
        outcomes = {
            "version": 1,
            "actions": [
                {
                    "id": "experience",
                    "type": "create_timeline_entry",
                    "fields": {
                        "title": "My experience",
                        "cover_asset_uuid": "asset_owned",
                        "is_current": True,
                    },
                }
            ],
        }
        apply_portfolio_outcomes(db, user, 7, outcomes, {"answers": {}, "bindings": {}})
        db.commit()
        entry = db.exec(select(TimelineEntry)).one()
        assert entry.cover_asset_id == owned.id

        invalid = {
            "version": 1,
            "actions": [
                {
                    "id": "other",
                    "type": "create_timeline_entry",
                    "fields": {
                        "title": "Not mine",
                        "cover_asset_uuid": "asset_foreign",
                    },
                }
            ],
        }
        with pytest.raises(PortfolioActionError, match="owned by the learner"):
            apply_portfolio_outcomes(
                db, user, 8, invalid, {"answers": {}, "bindings": {}}
            )

        invalid_date = {
            "version": 1,
            "actions": [
                {
                    "id": "bad-date",
                    "type": "create_timeline_entry",
                    "fields": {
                        "title": "Broken date",
                        "start_date": "sometime last year",
                    },
                }
            ],
        }
        with pytest.raises(PortfolioActionError, match="YYYY-MM"):
            apply_portfolio_outcomes(
                db, user, 9, invalid_date, {"answers": {}, "bindings": {}}
            )


def test_activity_project_outcome_persists_story_cover_and_existing_timeline_link():
    with _session() as db:
        user = _user()
        db.add(user)
        db.commit()
        cover = MediaAsset(
            asset_uuid="asset_project",
            owner_type="user",
            owner_user_id=1,
            source_type="upload",
            media_type="image",
            title="Project cover",
            url="/project.jpg",
        )
        db.add(cover)
        db.commit()
        portfolio = Portfolio(
            portfolio_uuid="por_existing", user_id=1, creation_date="", update_date=""
        )
        db.add(portfolio)
        db.flush()
        timeline = TimelineEntry(
            timeline_uuid="tml_existing",
            portfolio_id=portfolio.id,
            title="My current experience",
            slug="current",
            creation_date="",
            update_date="",
        )
        db.add(timeline)
        db.commit()
        outcomes = {
            "version": 1,
            "actions": [
                {
                    "id": "project",
                    "type": "create_project_item",
                    "store_as": "project_item_id",
                    "fields": {
                        "title": "Community garden",
                        "subtitle": "Growing food together",
                        "story_kind": "made",
                    },
                    "story": "I planned the beds and learned how to coordinate volunteers.",
                    "cover_asset_uuid": "asset_project",
                },
                {
                    "id": "link",
                    "type": "link_project_to_timeline",
                    "project": {"$source": "binding", "key": "project_item_id"},
                    "timeline": "tml_existing",
                    "optional": True,
                },
            ],
        }
        apply_portfolio_outcomes(
            db, user, 10, outcomes, {"answers": {}, "bindings": {}}
        )
        db.commit()

        project = db.exec(select(ProjectItem)).one()
        blocks = db.exec(
            select(ProjectItemBlock)
            .where(ProjectItemBlock.project_item_id == project.id)
            .order_by(ProjectItemBlock.sort_order)
        ).all()
        assert project.cover_asset_id == cover.id
        assert [(block.block_type, block.data) for block in blocks] == [
            (
                "text",
                {
                    "text": "I planned the beds and learned how to coordinate volunteers."
                },
            ),
            ("image", {"asset_uuid": "asset_project", "url": "/project.jpg", "caption": ""}),
        ]
        assert db.exec(
            select(TimelineProjectLink).where(
                TimelineProjectLink.project_item_id == project.id,
                TimelineProjectLink.timeline_entry_id == timeline.id,
            )
        ).one()


def test_project_idempotency_revision_conflict_and_publish_flow():
    with _session() as db:
        user = _user()
        db.add(user)
        db.commit()
        actor = _public(user)
        first = service.create_project(
            ProjectItemCreate(title="Community garden", idempotency_key="request-1"),
            actor,
            db,
        )
        second = service.create_project(
            ProjectItemCreate(title="Duplicate", idempotency_key="request-1"), actor, db
        )
        assert first["project_uuid"] == second["project_uuid"]

        updated = service.update_project(
            first["project_uuid"],
            ProjectItemUpdate(revision=first["revision"], summary="We grew food together"),
            actor,
            db,
        )
        assert updated["status"] == "published"
        with pytest.raises(HTTPException) as error:
            service.update_project(
                first["project_uuid"],
                ProjectItemUpdate(revision=first["revision"], title="Stale edit"),
                actor,
                db,
            )
        assert error.value.status_code == 409


def test_featured_projects_allows_multiple_selections():
    with _session() as db:
        user = _user()
        db.add(user)
        db.commit()
        actor = _public(user)
        first = service.create_project(ProjectItemCreate(title="First"), actor, db)
        second = service.create_project(ProjectItemCreate(title="Second"), actor, db)

        shell = service.update_featured_projects(
            PortfolioFeaturedProjectUpdate(project_uuid=first["project_uuid"]), actor, db
        )
        assert [item["title"] for item in shell["projects"] if item["featured"]] == [
            "First"
        ]

        shell = service.update_featured_projects(
            PortfolioFeaturedProjectUpdate(
                project_uuids=[first["project_uuid"], second["project_uuid"]]
            ),
            actor,
            db,
        )
        assert {item["title"] for item in shell["projects"] if item["featured"]} == {
            "First",
            "Second",
        }

        shell = service.update_featured_projects(
            PortfolioFeaturedProjectUpdate(project_uuid=None), actor, db
        )
        assert not any(item["featured"] for item in shell["projects"])


def test_featured_timeline_allows_multiple_selections():
    with _session() as db:
        user = _user()
        db.add(user)
        db.commit()
        actor = _public(user)
        first = service.create_timeline(TimelineEntryCreate(title="First"), actor, db)
        second = service.create_timeline(TimelineEntryCreate(title="Second"), actor, db)

        shell = service.update_featured_timeline(
            PortfolioFeaturedTimelineUpdate(
                timeline_uuids=[first["timeline_uuid"], second["timeline_uuid"]]
            ),
            actor,
            db,
        )

        assert {item["title"] for item in shell["timeline"] if item["featured"]} == {
            "First",
            "Second",
        }
        with pytest.raises(HTTPException) as error:
            service.update_featured_timeline(
                PortfolioFeaturedTimelineUpdate(timeline_uuids=["not-mine"]), actor, db
            )
        assert error.value.status_code == 422


def test_legacy_import_is_repeatable_and_preserves_profile_json():
    with _session() as db:
        original = {
            "featured": {"cards": [{"title": "Robot", "description": "Built in class"}]}
        }
        user = _user()
        user.profile = original
        db.add(user)
        db.commit()
        actor = _public(user)
        first = service.execute_legacy_import(actor, db)
        second = service.execute_legacy_import(actor, db)
        db.refresh(user)
        assert first["imported"] == 1
        assert second["imported"] == 0
        assert second["shell"]["portfolio"]["has_legacy_portfolio"] is False
        assert user.profile == original


def test_legacy_import_can_be_dismissed_without_changing_profile():
    with _session() as db:
        original = {"featured": {"cards": [{"title": "Robot"}]}}
        user = _user()
        user.profile = original
        db.add(user)
        db.commit()
        actor = _public(user)

        shell = service.dismiss_legacy_import(actor, db)

        db.refresh(user)
        assert shell["portfolio"]["has_legacy_portfolio"] is False
        assert user.profile == original
        assert service.legacy_import_preview(actor, db)["projects"]


def test_portfolio_revision_conflict():
    with _session() as db:
        user = _user()
        db.add(user)
        db.commit()
        actor = _public(user)
        shell = service.get_owner_shell(actor, db)
        service.update_portfolio(
            PortfolioUpdate(
                revision=shell["portfolio"]["revision"], headline="I make useful things"
            ),
            actor,
            db,
        )
        with pytest.raises(HTTPException) as error:
            service.update_portfolio(
                PortfolioUpdate(
                    revision=shell["portfolio"]["revision"], headline="Stale"
                ),
                actor,
                db,
            )
        assert error.value.status_code == 409


def test_header_socials_can_be_added_edited_and_removed():
    with _session() as db:
        user = _user()
        db.add(user)
        db.commit()
        actor = _public(user)
        shell = service.get_owner_shell(actor, db)
        updated = service.update_portfolio(
            PortfolioUpdate(
                revision=shell["portfolio"]["revision"],
                socials=[{"type": "instagram", "url": "instagram.com/maya"}],
            ),
            actor,
            db,
        )
        assert updated["portfolio"]["socials"] == [
            {"type": "instagram", "url": "https://instagram.com/maya"}
        ]
        removed = service.update_portfolio(
            PortfolioUpdate(revision=updated["portfolio"]["revision"], socials=[]),
            actor,
            db,
        )
        assert removed["portfolio"]["socials"] == []


def test_timeline_current_first_links_project_and_checks_revision():
    with _session() as db:
        user = _user()
        db.add(user)
        db.commit()
        actor = _public(user)
        image = MediaAsset(
            asset_uuid="asset_experience",
            owner_type="user",
            owner_user_id=1,
            created_by_user_id=1,
            source_type="upload",
            media_type="image",
            url="/media/experience.jpg",
        )
        db.add(image)
        db.commit()
        project = service.create_project(ProjectItemCreate(title="StudyMate"), actor, db)
        older = service.create_timeline(
            TimelineEntryCreate(
                title="Started school", entry_type="education", start_date="2023-09"
            ),
            actor,
            db,
        )
        current = service.create_timeline(
            TimelineEntryCreate(
                title="Design internship",
                start_date="2025-01",
                is_current=True,
                cover_asset_uuid="asset_experience",
                blocks=[
                    {
                        "block_type": "image",
                        "data": {
                            "asset_uuid": "asset_experience",
                            "url": "/media/experience.jpg",
                        },
                    }
                ],
                project_links=[
                    {"project_uuid": project["project_uuid"], "relationship_label": "Built here"}
                ],
            ),
            actor,
            db,
        )
        shell = service.get_owner_shell(actor, db)
        assert shell["timeline"][0]["timeline_uuid"] == current["timeline_uuid"]
        assert shell["timeline"][0]["projects"][0]["title"] == "StudyMate"
        assert shell["timeline"][0]["cover_url"] == "/media/experience.jpg"
        assert shell["timeline"][0]["blocks"][0]["data"]["asset_uuid"] == "asset_experience"
        assert (
            next(view for view in shell["views"] if view["key"] == "timeline")["visible"]
            is True
        )
        with pytest.raises(HTTPException) as error:
            service.update_timeline(
                older["timeline_uuid"],
                TimelineEntryUpdate(revision=999, title="Stale"),
                actor,
                db,
            )
        assert error.value.status_code == 409


def test_legacy_timeline_import_is_repeatable():
    with _session() as db:
        user = _user()
        user.profile = {
            "timeline": [
                {
                    "title": "Community lead",
                    "category": "project",
                    "company": "Youth Lab",
                    "startDate": "2024-01",
                }
            ]
        }
        db.add(user)
        db.commit()
        actor = _public(user)
        first, second = (
            service.execute_legacy_import(actor, db),
            service.execute_legacy_import(actor, db),
        )
        assert first["timelineImported"] == 1
        assert second["timelineImported"] == 0
