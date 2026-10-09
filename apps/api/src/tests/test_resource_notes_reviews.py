from io import BytesIO

import pytest
from fastapi import HTTPException, UploadFile
from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine, select
from migrations.versions.g4h5i6j7k8l9_add_resource_notes_and_review_ratings import (
    LEGACY_NOTE_MIGRATIONS,
)
from src.db.media import MediaAsset, MediaOwnerType, MediaSourceType, MediaType
from src.db.organizations import Organization
from src.db.resources import (
    Resource,
    ResourceComment,
    ResourceNoteBlock,
    ResourceNoteBlockCreate,
    ResourceNoteBlockUpdate,
    ResourceReviewCreate,
    UserResourceChannel,
    UserSavedResource,
    UserSavedResourceChannel,
    UserSavedResourceUpdate,
)
from src.db.users import PublicUser, User
from src.services import resources as resource_service


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
    SQLModel.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Organization.__table__,
            Resource.__table__,
            UserResourceChannel.__table__,
            UserSavedResource.__table__,
            UserSavedResourceChannel.__table__,
            MediaAsset.__table__,
            ResourceNoteBlock.__table__,
            ResourceComment.__table__,
        ],
    )
    return Session(engine)


def _user(user_id: int, username: str) -> User:
    return User(
        id=user_id,
        user_uuid=f"user-{user_id}",
        username=username,
        first_name=username,
        last_name="Learner",
        email=f"{username}@example.com",
        password="secret",
    )


def _public(user: User) -> PublicUser:
    return PublicUser.model_validate(user)


def _seed(db: Session) -> tuple[Resource, User, User]:
    org = Organization(
        id=1,
        org_uuid="org-1",
        name="Test Org",
        slug="test-org",
        email="org@example.com",
    )
    owner = _user(1, "owner")
    other = _user(2, "other")
    resource = Resource(
        id=1,
        org_id=org.id,
        resource_uuid="resource-1",
        title="Interview guide",
        external_url="https://example.com/guide",
        creation_date="2026-09-07",
        update_date="2026-09-07",
    )
    db.add(org)
    db.add(owner)
    db.add(other)
    db.add(resource)
    db.commit()
    return resource, owner, other


def test_resource_counts_include_real_rating_summary():
    with _session() as db:
        resource, owner, other = _seed(db)
        db.add(ResourceComment(resource_id=resource.id, author_id=owner.id, comment_uuid="review-1", content="Great", rating=5))
        db.add(ResourceComment(resource_id=resource.id, author_id=other.id, comment_uuid="review-2", content="Useful", rating=3))
        db.add(ResourceComment(resource_id=resource.id, author_id=other.id, comment_uuid="comment-1", content="Question", rating=None))
        db.commit()

        save_counts, comment_counts, average_ratings, rating_counts = resource_service._resource_counts_map([resource.id], db)

        assert save_counts == {}
        assert comment_counts == {resource.id: 3}
        assert average_ratings == {resource.id: 4.0}
        assert rating_counts == {resource.id: 2}


@pytest.mark.asyncio
async def test_note_blocks_are_private_ordered_and_create_library_membership(monkeypatch):
    monkeypatch.setattr(resource_service, "_resource_in_accessible_channel", lambda *_args: True)
    monkeypatch.setattr(
        resource_service,
        "enrich_resource_metadata",
        lambda _url: {
            "title": "Useful page",
            "description": "A helpful description",
            "cover_image_url": "https://example.com/image.png",
            "provider_name": "example.com",
        },
    )

    with _session() as db:
        resource, owner, other = _seed(db)
        text_note = await resource_service.create_note_block(
            None,
            resource.resource_uuid,
            ResourceNoteBlockCreate(block_type="text", content="Remember this"),
            _public(owner),
            db,
        )
        link_note = await resource_service.create_note_block(
            None,
            resource.resource_uuid,
            ResourceNoteBlockCreate(block_type="link", url="https://example.com/useful"),
            _public(owner),
            db,
        )
        await resource_service.create_note_block(
            None,
            resource.resource_uuid,
            ResourceNoteBlockCreate(block_type="text", content="Other learner"),
            _public(other),
            db,
        )

        notes = await resource_service.list_note_blocks(None, resource.resource_uuid, _public(owner), db)
        membership = db.exec(
            select(UserSavedResource).where(
                UserSavedResource.user_id == owner.id,
                UserSavedResource.resource_id == resource.id,
            )
        ).first()

        assert membership is not None
        assert [note["note_uuid"] for note in notes] == [text_note["note_uuid"], link_note["note_uuid"]]
        assert link_note["title"] == "Useful page"
        assert link_note["preview_image_url"] == "https://example.com/image.png"


@pytest.mark.asyncio
async def test_note_owner_can_edit_but_other_learners_cannot(monkeypatch):
    monkeypatch.setattr(resource_service, "_resource_in_accessible_channel", lambda *_args: True)

    with _session() as db:
        resource, owner, other = _seed(db)
        created = await resource_service.create_note_block(
            None,
            resource.resource_uuid,
            ResourceNoteBlockCreate(block_type="text", content="First version"),
            _public(owner),
            db,
        )
        updated = await resource_service.update_note_block(
            None,
            created["note_uuid"],
            ResourceNoteBlockUpdate(content="Second version"),
            _public(owner),
            db,
        )

        assert updated["content"] == "Second version"
        with pytest.raises(HTTPException) as exc:
            await resource_service.update_note_block(
                None,
                created["note_uuid"],
                ResourceNoteBlockUpdate(content="Not mine"),
                _public(other),
                db,
            )
        assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_image_and_pdf_uploads_become_note_blocks(monkeypatch):
    monkeypatch.setattr(resource_service, "_resource_in_accessible_channel", lambda *_args: True)

    async def fake_upload_file(**kwargs):
        return f"stored-{kwargs['file'].filename}"

    monkeypatch.setattr(resource_service, "upload_file", fake_upload_file)

    with _session() as db:
        resource, owner, _ = _seed(db)
        image = UploadFile(filename="diagram.png", file=BytesIO(b"png"))
        image.headers = {"content-type": "image/png"}
        document = UploadFile(filename="guide.pdf", file=BytesIO(b"%PDF"))
        document.headers = {"content-type": "application/pdf"}

        image_note = await resource_service.upload_note_file(
            None, resource.resource_uuid, image, _public(owner), db
        )
        file_note = await resource_service.upload_note_file(
            None, resource.resource_uuid, document, _public(owner), db
        )

        assert image_note["block_type"] == "image"
        assert image_note["original_filename"] == "diagram.png"
        assert file_note["block_type"] == "file"
        assert file_note["mime_type"] == "application/pdf"
        assert file_note["storage_directory"] == "notes"


@pytest.mark.asyncio
async def test_owned_media_library_asset_can_be_attached_to_notes(monkeypatch):
    monkeypatch.setattr(resource_service, "_resource_in_accessible_channel", lambda *_args: True)

    with _session() as db:
        resource, owner, other = _seed(db)
        asset = MediaAsset(
            asset_uuid="asset-diagram",
            owner_type=MediaOwnerType.user,
            owner_user_id=owner.id,
            created_by_user_id=owner.id,
            source_type=MediaSourceType.upload,
            media_type=MediaType.image,
            title="Diagram",
            url="/content/users/user-1/media/diagram.png",
            thumbnail_url="/content/users/user-1/media/diagram-thumb.png",
            filename="diagram.png",
            mime_type="image/png",
            creation_date="2026-09-07",
            update_date="2026-09-07",
        )
        db.add(asset)
        db.commit()

        note = await resource_service.create_note_block(
            None,
            resource.resource_uuid,
            ResourceNoteBlockCreate(block_type="image", media_asset_uuid=asset.asset_uuid),
            _public(owner),
            db,
        )

        assert note["block_type"] == "image"
        assert note["media_asset_uuid"] == asset.asset_uuid
        assert note["url"] == asset.url
        assert note["storage_directory"] == "media-library"

        with pytest.raises(HTTPException) as exc:
            await resource_service.create_note_block(
                None,
                resource.resource_uuid,
                ResourceNoteBlockCreate(block_type="image", media_asset_uuid=asset.asset_uuid),
                _public(other),
                db,
            )
        assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_new_reviews_require_rating_and_one_rated_review_per_learner(monkeypatch):
    monkeypatch.setattr(resource_service, "_resource_in_accessible_channel", lambda *_args: True)
    monkeypatch.setattr(resource_service, "_serialize_resource", lambda resource, *_args: {"resource_uuid": resource.resource_uuid})

    with _session() as db:
        resource, owner, _ = _seed(db)
        await resource_service.get_resource(None, resource.resource_uuid, _public(owner), db)
        assert db.exec(
            select(UserSavedResource).where(
                UserSavedResource.user_id == owner.id,
                UserSavedResource.resource_id == resource.id,
            )
        ).first() is None
        legacy = ResourceComment(
            resource_id=resource.id,
            author_id=owner.id,
            comment_uuid="legacy-comment",
            content="Older comment",
            rating=None,
            creation_date="2026-01-01",
            update_date="2026-01-01",
        )
        db.add(legacy)
        db.commit()

        review = await resource_service.create_review(
            None,
            resource.resource_uuid,
            ResourceReviewCreate(content="Very useful", rating=5),
            _public(owner),
            db,
        )
        visible = await resource_service.list_comments(None, resource.resource_uuid, _public(owner), db)
        membership = db.exec(
            select(UserSavedResource).where(
                UserSavedResource.user_id == owner.id,
                UserSavedResource.resource_id == resource.id,
            )
        ).first()

        assert review["rating"] == 5
        assert membership is not None
        assert [item["rating"] for item in visible] == [None, 5]
        with pytest.raises(HTTPException) as exc:
            await resource_service.create_review(
                None,
                resource.resource_uuid,
                ResourceReviewCreate(content="A second review", rating=4),
                _public(owner),
                db,
            )
        assert exc.value.status_code == 409


def test_legacy_resource_fields_migrate_once_into_distinct_note_blocks():
    with _session() as db:
        resource, owner, _ = _seed(db)
        db.add(
            UserSavedResource(
                id=7,
                user_id=owner.id,
                resource_id=resource.id,
                notes="Private thought",
                outcome_text="What happened",
                outcome_link="https://example.com/result",
                outcome_file="evidence.pdf",
                creation_date="2026-01-01",
                update_date="2026-02-01",
            )
        )
        db.commit()

        for _ in range(2):
            for statement in LEGACY_NOTE_MIGRATIONS:
                db.exec(text(statement))
            db.commit()

        notes = db.exec(
            select(ResourceNoteBlock)
            .where(ResourceNoteBlock.user_id == owner.id)
            .order_by(ResourceNoteBlock.sort_order)
        ).all()

        assert [note.block_type for note in notes] == ["text", "text", "link", "file"]
        assert [note.note_uuid for note in notes] == [
            "legacy-notes-7",
            "legacy-outcome-text-7",
            "legacy-outcome-link-7",
            "legacy-outcome-file-7",
        ]
        assert notes[-1].storage_directory == "outcomes"


@pytest.mark.asyncio
async def test_library_membership_is_independent_from_lists_and_activity_updates_preserve_lists(monkeypatch):
    monkeypatch.setattr(resource_service, "_resource_in_accessible_channel", lambda *_args: True)
    monkeypatch.setattr(
        resource_service,
        "_serialize_resource",
        lambda resource, *_args: {"resource_uuid": resource.resource_uuid},
    )

    with _session() as db:
        resource, owner, _ = _seed(db)
        reading_list = UserResourceChannel(
            user_id=owner.id,
            org_id=resource.org_id,
            user_channel_uuid="reading-list",
            name="Reading",
            is_default=False,
            creation_date="2026-01-01",
            update_date="2026-01-01",
        )
        db.add(reading_list)
        db.commit()

        await resource_service.save_resource_for_user(
            None,
            resource.resource_uuid,
            UserSavedResourceUpdate(
                add_to_default_channel=True,
                user_channel_uuids=[reading_list.user_channel_uuid],
            ),
            _public(owner),
            db,
        )
        await resource_service.save_resource_for_user(
            None,
            resource.resource_uuid,
            UserSavedResourceUpdate(open_count_increment=1),
            _public(owner),
            db,
        )

        channels = db.exec(select(UserResourceChannel)).all()
        links = db.exec(select(UserSavedResourceChannel)).all()
        saved = db.exec(select(UserSavedResource)).one()

        assert [channel.user_channel_uuid for channel in channels] == ["reading-list"]
        assert len(links) == 1
        assert saved.open_count == 1

        monkeypatch.setattr(resource_service, "require_org_membership", lambda *_args: None)
        result = await resource_service.delete_user_channel(
            None,
            resource.org_id,
            reading_list.user_channel_uuid,
            _public(owner),
            db,
        )

        assert result["detail"] == "List deleted; Library resources were kept"
        assert db.exec(select(UserSavedResource)).one().id == saved.id
        assert db.exec(select(UserSavedResourceChannel)).all() == []
