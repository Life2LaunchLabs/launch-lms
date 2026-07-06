from src.db.courses.activities import Activity, ActivityTypeEnum, ActivitySubTypeEnum
from src.db.collections import Collection
from src.db.courses.courses import Course
from src.db.learning import BadgeCollection
from src.db.organizations import Organization
from src.services.learning import _is_system_object
from src.services.learning_migration import convert_activity_to_page_specs
from src.services.learning_migration import _deterministic_collection_uuid, _legacy_deterministic_collection_uuid


def _course() -> Course:
    return Course(
        id=10,
        org_id=1,
        course_uuid="course_abc",
        name="Legacy Badge",
        description="Legacy description",
        about="About",
        learnings=None,
        tags=None,
        thumbnail_image="thumb.png",
        thumbnail_video="",
        public=True,
        shared=False,
        guest_access=False,
        published=True,
        open_to_contributors=False,
        creation_date="2026-01-01",
        update_date="2026-01-01",
    )


def _org() -> Organization:
    return Organization(
        id=1,
        org_uuid="org_abc",
        name="Org",
        description="Org",
        about=None,
        socials={},
        links={},
        scripts={},
        logo_image=None,
        thumbnail_image=None,
        previews={},
        explore=False,
        label=None,
        slug="org",
        email="org@example.com",
        creation_date="2026-01-01",
        update_date="2026-01-01",
    )


def _collection() -> Collection:
    return Collection(
        id=30,
        org_id=1,
        collection_uuid="collection_abc",
        name="Legacy Collection",
        public=True,
        shared=False,
        hidden=False,
        protected=False,
        system_type=None,
        description="Collection",
        creation_date="2026-01-01",
        update_date="2026-01-01",
    )


def _activity(activity_type: ActivityTypeEnum, content: dict, details: dict | None = None) -> Activity:
    return Activity(
        id=20,
        org_id=1,
        course_id=10,
        activity_uuid="activity_xyz",
        name="Legacy Activity",
        description="Activity description",
        icon=None,
        activity_type=activity_type,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_DYNAMIC_PAGE,
        content=content,
        details=details or {},
        published=True,
        creation_date="2026-01-01",
        update_date="2026-01-01",
    )


def test_dynamic_activity_converts_to_standard_page_with_text_blocks():
    content = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hello"}]}]}
    pages, warnings = convert_activity_to_page_specs(_course(), _activity(ActivityTypeEnum.TYPE_DYNAMIC, content), _org())

    assert warnings == []
    assert pages[0]["page_type"] == "standard"
    blocks = pages[0]["content"]["blocks"]
    assert [block["type"] for block in blocks] == ["text"]
    assert blocks[0]["content"]["node"] == content["content"][0]


def test_dynamic_activity_splits_imported_video_block_before_info_page():
    content = {
        "type": "doc",
        "content": [
            {
                "type": "blockVideo",
                "attrs": {
                    "blockObject": {
                        "block_uuid": "block_123",
                        "content": {
                            "file_id": "intro",
                            "file_format": "mp4",
                            "file_name": "Intro video",
                            "activity_uuid": "activity_xyz",
                        },
                    }
                },
            },
            {"type": "paragraph", "content": [{"type": "text", "text": "Read this after the video."}]},
        ],
    }

    pages, warnings = convert_activity_to_page_specs(_course(), _activity(ActivityTypeEnum.TYPE_DYNAMIC, content), _org())

    assert warnings == []
    assert [page["page_type"] for page in pages] == ["video", "standard"]
    assert pages[0]["content"]["video_url"] == "/api/v1/stream/block/org_abc/course_abc/activity_xyz/block_123/intro.mp4"
    assert pages[1]["content"]["blocks"][0]["content"]["node"] == {
        "type": "paragraph",
        "content": [{"type": "text", "text": "Read this after the video."}],
    }


def test_dynamic_activity_splits_video_embed_before_info_page():
    content = {
        "type": "doc",
        "content": [
            {
                "type": "blockEmbed",
                "attrs": {
                    "embedUrl": "https://www.youtube.com/watch?v=abc123",
                    "embedType": "url",
                },
            },
            {"type": "paragraph", "content": [{"type": "text", "text": "Notes"}]},
        ],
    }

    pages, warnings = convert_activity_to_page_specs(_course(), _activity(ActivityTypeEnum.TYPE_DYNAMIC, content), _org())

    assert warnings == []
    assert [page["page_type"] for page in pages] == ["video", "standard"]
    assert pages[0]["content"]["video_url"] == "https://www.youtube.com/watch?v=abc123"
    assert pages[1]["content"]["blocks"][0]["content"]["node"]["content"][0]["text"] == "Notes"


def test_dynamic_activity_with_only_video_does_not_create_empty_info_page():
    content = {
        "type": "doc",
        "content": [
            {
                "type": "blockEmbed",
                "attrs": {
                    "embedUrl": "https://vimeo.com/123",
                    "embedType": "url",
                },
            }
        ],
    }

    pages, warnings = convert_activity_to_page_specs(_course(), _activity(ActivityTypeEnum.TYPE_DYNAMIC, content), _org())

    assert warnings == []
    assert [page["page_type"] for page in pages] == ["video"]
    assert pages[0]["content"]["video_url"] == "https://vimeo.com/123"


def test_youtube_video_activity_converts_to_video_page():
    activity = _activity(ActivityTypeEnum.TYPE_VIDEO, {"uri": "https://youtube.com/watch?v=abc123"})
    pages, warnings = convert_activity_to_page_specs(_course(), activity, _org())

    assert warnings == []
    assert pages[0]["page_type"] == "video"
    assert pages[0]["content"]["video_url"] == "https://youtube.com/watch?v=abc123"


def test_hosted_video_activity_builds_stream_url():
    activity = _activity(ActivityTypeEnum.TYPE_VIDEO, {"filename": "intro.mp4"})
    pages, warnings = convert_activity_to_page_specs(_course(), activity, _org())

    assert warnings == []
    assert pages[0]["content"]["video_url"] == "/api/v1/stream/video/org_abc/course_abc/activity_xyz/intro.mp4"


def test_supported_quiz_blocks_convert_to_learning_question_pages():
    content = {
        "type": "doc",
        "content": [
            {
                "type": "quizSelectBlock",
                "attrs": {
                    "question_text": "Pick one",
                    "options": [{"option_uuid": "a", "label": "A"}, {"option_uuid": "b", "label": "B"}],
                },
            },
            {
                "type": "quizTextBlock",
                "attrs": {"question_uuid": "q_text", "question_text": "Explain", "placeholder": "Type here"},
            },
        ],
    }
    details = {"option_scores": {"b": {"correct": 1}}, "text_scores": {"q_text": {"mode": "min_length", "min_words": 3}}}
    pages, warnings = convert_activity_to_page_specs(_course(), _activity(ActivityTypeEnum.TYPE_QUIZ, content, details), _org())

    assert warnings == []
    assert [page["page_type"] for page in pages] == ["standard", "standard"]

    mcq_blocks = pages[0]["content"]["blocks"]
    assert [block["type"] for block in mcq_blocks] == ["text", "question"]
    assert mcq_blocks[0]["content"]["node"]["content"][0]["text"] == "Pick one"
    assert mcq_blocks[1]["kind"] == "multiple_choice"
    assert [option["id"] for option in mcq_blocks[1]["content"]["options"]] == ["a", "b"]
    assert pages[0]["scoring"]["correct_option_ids"] == ["b"]

    text_blocks = pages[1]["content"]["blocks"]
    assert text_blocks[-1]["kind"] == "text_input"
    assert text_blocks[-1]["content"]["inputs"][0]["id"] == "q_text"
    assert pages[1]["completion"]["inputs"]["q_text"]["min_words"] == 3


def test_unsupported_quiz_blocks_warn_without_blocking_conversion():
    content = {"type": "doc", "content": [{"type": "quizSliderBlock", "attrs": {"question_text": "Rate it"}}]}
    pages, warnings = convert_activity_to_page_specs(_course(), _activity(ActivityTypeEnum.TYPE_QUIZ, content), _org())

    assert pages[0]["page_type"] == "standard"
    assert warnings[0].code == "unsupported_quiz_block"
    assert any(warning.code == "quiz_empty_or_unsupported" for warning in warnings)


def test_unsupported_activity_type_creates_placeholder_warning():
    pages, warnings = convert_activity_to_page_specs(_course(), _activity(ActivityTypeEnum.TYPE_SCORM, {}), _org())

    assert pages[0]["page_type"] == "standard"
    assert warnings[0].code == "unsupported_activity_type"


def test_collection_conversion_reuses_legacy_collection_uuid():
    collection = _collection()

    assert _deterministic_collection_uuid(collection) == "collection_abc"
    assert _legacy_deterministic_collection_uuid(collection) == "badge_collection_migrated_abc"


def test_migrated_badge_collection_is_not_treated_as_system_locked():
    collection = BadgeCollection(
        id=40,
        org_id=1,
        collection_uuid="collection_abc",
        name="Converted Collection",
        public=True,
        hidden=False,
        protected=False,
        system_type="legacy_badge_migration",
    )

    assert _is_system_object(collection) is False
