from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from copy import deepcopy
from typing import Any
from urllib.parse import urlparse

from fastapi import HTTPException, Request, status
from sqlmodel import Session, select

from src.db.collections import Collection
from src.db.collections_courses import CollectionCourse
from src.db.courses.activities import Activity, ActivityTypeEnum
from src.db.courses.chapter_activities import ChapterActivity
from src.db.courses.chapters import Chapter
from src.db.courses.course_chapters import CourseChapter
from src.db.courses.certifications import CertificateUser, Certifications
from src.db.courses.courses import Course
from src.db.learning import BadgeCollection, LearningActivity, LearningAwardSource, LearningBadge, LearningBadgeAward, LearningPage, LearningPageType, LearningPath
from src.db.organizations import Organization
from src.db.users import AnonymousUser, PublicUser
from src.services.learning import _get_path_for_badge, _require_org_admin


MIGRATION_SYSTEM_TYPE = "legacy_badge_migration"
UNSUPPORTED_ACTIVITY_TYPES = {
    ActivityTypeEnum.TYPE_ASSIGNMENT,
    ActivityTypeEnum.TYPE_DOCUMENT,
    ActivityTypeEnum.TYPE_SCORM,
    ActivityTypeEnum.TYPE_CUSTOM,
}
UNSUPPORTED_QUIZ_BLOCKS = {"quizSliderBlock", "quizSortBlock"}


@dataclass
class MigrationWarning:
    code: str
    message: str
    source: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, "source": self.source}


def _now() -> str:
    return str(datetime.now())


def _clean_uuid(value: str | None, prefix: str) -> str:
    cleaned = str(value or "").replace(prefix, "")
    return cleaned or "unknown"


def _deterministic_collection_uuid(collection: Collection) -> str:
    return collection.collection_uuid or f"badge_collection_migrated_{collection.id or 'unknown'}"


def _legacy_deterministic_collection_uuid(collection: Collection) -> str:
    return f"badge_collection_migrated_{_clean_uuid(collection.collection_uuid, 'collection_')}"


def _deterministic_badge_uuid(course: Course) -> str:
    return f"badge_migrated_{_clean_uuid(course.course_uuid, 'course_')}"


def _deterministic_activity_uuid(chapter: Chapter) -> str:
    return f"learning_activity_migrated_{_clean_uuid(chapter.chapter_uuid, 'chapter_')}"


def _deterministic_page_uuid(activity: Activity, index: int) -> str:
    return f"learning_page_migrated_{_clean_uuid(activity.activity_uuid, 'activity_')}_{index}"


def _deterministic_award_uuid(certificate_user: CertificateUser) -> str:
    return f"award_migrated_{_clean_uuid(certificate_user.user_certification_uuid, 'certificate_user_')}"


def _looks_like_media_url(value: str | None) -> bool:
    if not value:
        return False
    return value.startswith(("http://", "https://", "/", "data:", "content/"))


def _course_thumbnail_url(org: Organization | None, course: Course, fallback_url: str | None = None) -> str:
    if fallback_url:
        return fallback_url
    if course.thumbnail_image and org and org.org_uuid:
        return f"/content/orgs/{org.org_uuid}/courses/{course.course_uuid}/thumbnails/{course.thumbnail_image}"
    return course.thumbnail_image or ""


def _collection_thumbnail_url(org: Organization | None, collection: Collection) -> str:
    if collection.thumbnail_image and _looks_like_media_url(collection.thumbnail_image):
        return collection.thumbnail_image
    if collection.thumbnail_image and org and org.org_uuid:
        return f"/content/orgs/{org.org_uuid}/collections/{collection.collection_uuid}/thumbnails/{collection.thumbnail_image}"
    return collection.thumbnail_image or ""


def _parse_datetime(value: str | None) -> datetime:
    if not value:
        return datetime.utcnow()
    normalized = str(value).strip()
    if not normalized:
        return datetime.utcnow()
    try:
        parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
        if parsed.tzinfo:
            return parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
    except ValueError:
        return datetime.utcnow()


def _walk_nodes(node: Any):
    if isinstance(node, dict):
        yield node
        for child in node.get("content") or []:
            yield from _walk_nodes(child)
    elif isinstance(node, list):
        for child in node:
            yield from _walk_nodes(child)


def _extract_quiz_blocks(content: dict | None) -> list[dict]:
    blocks: list[dict] = []
    for node in _walk_nodes(content or {}):
        if str(node.get("type") or "").startswith("quiz"):
            blocks.append(node)
    return blocks


def _legacy_rich_text(content: dict | None) -> dict:
    if isinstance(content, dict) and content.get("type") == "doc":
        return content
    return {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Legacy activity content was migrated for review."}],
            }
        ],
    }


def _doc_has_content(content: dict | None) -> bool:
    if not isinstance(content, dict):
        return False
    return bool(content.get("content"))


def _legacy_source(course: Course, activity: Activity | None = None, chapter: Chapter | None = None) -> dict:
    source = {"course_uuid": course.course_uuid, "course_id": course.id}
    if chapter:
        source.update({"chapter_uuid": chapter.chapter_uuid, "chapter_id": chapter.id})
    if activity:
        source.update({"activity_uuid": activity.activity_uuid, "activity_id": activity.id, "activity_type": activity.activity_type})
    return source


def _video_url(org: Organization | None, course: Course, activity: Activity) -> str:
    content = activity.content or {}
    if content.get("uri"):
        return content["uri"]
    if content.get("filename") and org and org.org_uuid:
        return f"/api/v1/stream/video/{org.org_uuid}/{course.course_uuid}/{activity.activity_uuid}/{content['filename']}"
    return ""


def _is_video_url(value: str | None) -> bool:
    if not value:
        return False
    try:
        parsed = urlparse(value)
    except Exception:
        return False

    hostname = (parsed.hostname or "").lower()
    path = parsed.path.lower()
    if hostname in {
        "youtube.com",
        "www.youtube.com",
        "youtu.be",
        "www.youtu.be",
        "vimeo.com",
        "www.vimeo.com",
        "player.vimeo.com",
    }:
        return True
    return path.endswith((".mp4", ".webm", ".mov", ".ogg"))


def _video_page_spec(course: Course, activity: Activity, index: int, title: str, video_url: str, legacy_video: dict) -> dict:
    return {
        "page_uuid": _deterministic_page_uuid(activity, index),
        "page_type": LearningPageType.VIDEO,
        "title": title,
        "content": {
            "heading": title,
            "video_url": video_url,
            "legacy_video": legacy_video,
            "legacy_source": _legacy_source(course, activity),
        },
        "scoring": {},
        "completion": {},
    }


def _video_url_from_block_node(org: Organization | None, course: Course, activity: Activity, node: dict) -> tuple[str, str] | None:
    node_type = node.get("type")
    attrs = node.get("attrs") or {}

    if node_type == "blockEmbed":
        embed_url = attrs.get("embedUrl") or attrs.get("url") or attrs.get("src")
        if _is_video_url(embed_url):
            return str(embed_url), activity.name or "Video"
        return None

    if node_type not in {"blockVideo", "videoBlock"}:
        return None

    direct_url = attrs.get("url") or attrs.get("src") or attrs.get("video_url")
    if direct_url:
        return str(direct_url), activity.name or "Video"

    block_object = attrs.get("blockObject") or {}
    block_uuid = block_object.get("block_uuid") or attrs.get("block_uuid")
    block_content = block_object.get("content") or attrs.get("content") or {}
    activity_uuid = block_content.get("activity_uuid") or activity.activity_uuid
    file_id = block_content.get("file_id")
    file_format = block_content.get("file_format")
    filename = block_content.get("filename") or block_content.get("file_name")
    if file_id and file_format:
        filename = f"{file_id}.{file_format}"

    if org and org.org_uuid and block_uuid and filename:
        title = block_content.get("file_name") or activity.name or "Video"
        return f"/api/v1/stream/block/{org.org_uuid}/{course.course_uuid}/{activity_uuid}/{block_uuid}/{filename}", title

    return None


def _extract_dynamic_video_pages(
    course: Course,
    activity: Activity,
    org: Organization | None,
) -> tuple[list[dict], dict | None, list[MigrationWarning]]:
    warnings: list[MigrationWarning] = []
    video_specs: list[dict] = []

    def prune(node: Any) -> Any:
        if isinstance(node, list):
            pruned_children = []
            for child in node:
                pruned = prune(child)
                if pruned is not None:
                    pruned_children.append(pruned)
            return pruned_children

        if not isinstance(node, dict):
            return node

        video = _video_url_from_block_node(org, course, activity, node)
        if video:
            video_url, title = video
            video_specs.append(_video_page_spec(course, activity, len(video_specs) + 1, title, video_url, deepcopy(node)))
            return None

        if node.get("type") in {"blockVideo", "videoBlock"}:
            warnings.append(MigrationWarning("video_url_missing", "Embedded video block did not include enough data to build a video page.", _legacy_source(course, activity)))

        next_node = deepcopy(node)
        if "content" in next_node:
            next_node["content"] = prune(next_node.get("content") or [])
        return next_node

    residual_doc = prune(activity.content)
    if isinstance(residual_doc, dict) and residual_doc.get("type") == "doc":
        residual_doc["content"] = residual_doc.get("content") or []
    return video_specs, residual_doc if isinstance(residual_doc, dict) else None, warnings


def _option_scores(activity: Activity) -> dict:
    return (activity.details or {}).get("option_scores") or {}


def _correct_option_ids(activity: Activity, option_ids: list[str]) -> list[str]:
    scores = _option_scores(activity)
    return [
        option_id
        for option_id in option_ids
        if float((scores.get(option_id) or {}).get("correct") or 0) >= 0.5
    ]


def _convert_select_block(course: Course, activity: Activity, block: dict, index: int) -> dict:
    attrs = block.get("attrs") or {}
    prompt = attrs.get("question_text") or activity.name or "Question"
    options = [
        {"id": option.get("option_uuid") or f"option_{idx + 1}", "text": option.get("label") or f"Option {idx + 1}"}
        for idx, option in enumerate(attrs.get("options") or [])
    ]
    option_ids = [option["id"] for option in options]
    return {
        "page_uuid": _deterministic_page_uuid(activity, index),
        "page_type": LearningPageType.MULTIPLE_CHOICE,
        "title": prompt,
        "content": {
            "prompt": prompt,
            "options": options,
            "legacy_quiz_block": block,
            "legacy_source": _legacy_source(course, activity),
        },
        "scoring": {"mode": "points", "points": 1, "correct_option_ids": _correct_option_ids(activity, option_ids)},
        "completion": {"min_selections": 1, "max_selections": 1},
    }


def _convert_multi_select_block(course: Course, activity: Activity, block: dict, index: int) -> dict:
    attrs = block.get("attrs") or {}
    prompt = attrs.get("question_text") or activity.name or "Select all that apply"
    raw_options = [
        option
        for category in attrs.get("categories") or []
        for option in (category.get("options") or [])
    ]
    options = [
        {"id": option.get("option_uuid") or f"option_{idx + 1}", "text": option.get("label") or f"Option {idx + 1}"}
        for idx, option in enumerate(raw_options)
    ]
    option_ids = [option["id"] for option in options]
    correct_option_ids = _correct_option_ids(activity, option_ids)
    return {
        "page_uuid": _deterministic_page_uuid(activity, index),
        "page_type": LearningPageType.MULTIPLE_CHOICE,
        "title": prompt,
        "content": {
            "prompt": prompt,
            "options": options,
            "legacy_quiz_block": block,
            "legacy_source": _legacy_source(course, activity),
        },
        "scoring": {"mode": "points", "points": max(1, len(correct_option_ids) or 1), "correct_option_ids": correct_option_ids},
        "completion": {"min_selections": 1, "max_selections": max(1, len(options))},
    }


def _convert_text_block(course: Course, activity: Activity, block: dict, index: int) -> dict:
    attrs = block.get("attrs") or {}
    question_uuid = attrs.get("question_uuid") or f"text_{index}"
    text_scores = (activity.details or {}).get("text_scores") or {}
    scoring_rule = text_scores.get(question_uuid) or {}
    mode = "completion"
    if scoring_rule.get("mode") in {"manual", "min_length"}:
        mode = "manual" if scoring_rule.get("mode") == "manual" else "completion"
    return {
        "page_uuid": _deterministic_page_uuid(activity, index),
        "page_type": LearningPageType.TEXT_INPUT,
        "title": attrs.get("question_text") or activity.name or "Response",
        "content": {
            "heading": attrs.get("question_text") or "",
            "body": attrs.get("description") or "",
            "inputs": [{
                "id": question_uuid,
                "label": attrs.get("question_text") or "Response",
                "placeholder": attrs.get("placeholder") or "",
                "variant": "long_answer" if attrs.get("input_size") != "single_line" else "short_answer",
                "width": "full",
                "height": 180,
            }],
            "legacy_quiz_block": block,
            "legacy_source": _legacy_source(course, activity),
        },
        "scoring": {"mode": mode, "points": 1},
        "completion": {"inputs": {question_uuid: {"required": True, "min_words": int(scoring_rule.get("min_words") or 1)}}},
    }


def convert_activity_to_page_specs(course: Course, activity: Activity, org: Organization | None = None) -> tuple[list[dict], list[MigrationWarning]]:
    warnings: list[MigrationWarning] = []
    page_specs: list[dict] = []

    if activity.activity_type == ActivityTypeEnum.TYPE_DYNAMIC:
        video_page_specs, residual_content, video_warnings = _extract_dynamic_video_pages(course, activity, org)
        warnings.extend(video_warnings)
        page_specs.extend(video_page_specs)
        if not video_page_specs or _doc_has_content(residual_content):
            info_index = len(page_specs) + 1
            page_specs.append({
                "page_uuid": _deterministic_page_uuid(activity, info_index),
                "page_type": LearningPageType.INFO,
                "title": activity.name or "Info",
                "content": {"rich_text": _legacy_rich_text(residual_content or activity.content), "legacy_source": _legacy_source(course, activity)},
                "scoring": {},
                "completion": {},
            })
        return page_specs, warnings

    if activity.activity_type == ActivityTypeEnum.TYPE_VIDEO:
        video_url = _video_url(org, course, activity)
        if not video_url:
            warnings.append(MigrationWarning("video_url_missing", "Video activity did not include a usable video URL or hosted filename.", _legacy_source(course, activity)))
        page_specs.append(_video_page_spec(course, activity, 1, activity.name or "Video", video_url, activity.content or {}))
        return page_specs, warnings

    if activity.activity_type == ActivityTypeEnum.TYPE_QUIZ:
        index = 1
        for block in _extract_quiz_blocks(activity.content):
            block_type = block.get("type")
            if block_type == "quizInfoBlock":
                attrs = block.get("attrs") or {}
                page_specs.append({
                    "page_uuid": _deterministic_page_uuid(activity, index),
                    "page_type": LearningPageType.INFO,
                    "title": attrs.get("title") or activity.name or "Info",
                    "content": {"heading": attrs.get("title") or "", "body": attrs.get("body") or "", "legacy_quiz_block": block, "legacy_source": _legacy_source(course, activity)},
                    "scoring": {},
                    "completion": {},
                })
                index += 1
            elif block_type == "quizSelectBlock":
                page_specs.append(_convert_select_block(course, activity, block, index))
                index += 1
            elif block_type == "quizMultiSelectBlock":
                page_specs.append(_convert_multi_select_block(course, activity, block, index))
                index += 1
            elif block_type == "quizTextBlock":
                page_specs.append(_convert_text_block(course, activity, block, index))
                index += 1
            elif block_type in UNSUPPORTED_QUIZ_BLOCKS:
                warnings.append(MigrationWarning("unsupported_quiz_block", f"{block_type} is not supported by the new learning path system.", _legacy_source(course, activity)))
        if not page_specs:
            warnings.append(MigrationWarning("quiz_empty_or_unsupported", "Quiz did not contain supported question blocks.", _legacy_source(course, activity)))
        return page_specs or [_placeholder_page_spec(course, activity, 1)], warnings

    if activity.activity_type in UNSUPPORTED_ACTIVITY_TYPES:
        warnings.append(MigrationWarning("unsupported_activity_type", f"{activity.activity_type} is not supported by the new learning path system.", _legacy_source(course, activity)))
        return [_placeholder_page_spec(course, activity, 1)], warnings

    warnings.append(MigrationWarning("unknown_activity_type", f"{activity.activity_type} could not be migrated automatically.", _legacy_source(course, activity)))
    return [_placeholder_page_spec(course, activity, 1)], warnings


def _placeholder_page_spec(course: Course, activity: Activity, index: int) -> dict:
    return {
        "page_uuid": _deterministic_page_uuid(activity, index),
        "page_type": LearningPageType.INFO,
        "title": activity.name or "Unsupported activity",
        "content": {
            "heading": activity.name or "Unsupported activity",
            "body": "This legacy activity could not be converted automatically. Please rebuild it in the new learning path editor.",
            "legacy_source": _legacy_source(course, activity),
            "legacy_content": activity.content or {},
        },
        "scoring": {},
        "completion": {},
    }


def _legacy_certification_metadata(db_session: Session, course: Course) -> dict:
    certification = db_session.exec(select(Certifications).where(Certifications.course_id == course.id)).first()
    config = certification.config if certification else {}
    seo = course.seo or {}
    metadata = {
        "badge_name": config.get("badge_name") or config.get("certification_name") or course.name,
        "badge_description": config.get("badge_description") or config.get("certification_description") or course.description or "",
        "criteria_url": config.get("badge_criteria_url") or seo.get("canonical_url") or "",
        "badge_image_url": config.get("badge_image_url") or "",
        "support_url": config.get("badge_support_url") or "",
        "badge_theme": config.get("badge_theme") or "",
        "invite": {
            key: value
            for key, value in seo.items()
            if str(key).startswith("badge_invite_") and value
        },
        "legacy_certification_uuid": certification.certification_uuid if certification else None,
    }
    return {key: value for key, value in metadata.items() if value not in (None, "", {})}


def _migrate_certificate_awards(db_session: Session, course: Course, badge: LearningBadge, now: str) -> int:
    certifications = db_session.exec(select(Certifications).where(Certifications.course_id == course.id)).all()
    certification_ids = [certification.id for certification in certifications if certification.id]
    if not certification_ids or not badge.id:
        return 0

    certificate_users = db_session.exec(
        select(CertificateUser).where(CertificateUser.certification_id.in_(certification_ids))  # type: ignore
    ).all()
    migrated_count = 0
    for certificate_user in certificate_users:
        existing_award = db_session.exec(
            select(LearningBadgeAward).where(
                LearningBadgeAward.badge_id == badge.id,
                LearningBadgeAward.user_id == certificate_user.user_id,
            )
        ).first()
        if existing_award:
            evidence = existing_award.evidence or {}
            existing_award.evidence = {
                **evidence,
                "legacy_certificate_user_uuid": certificate_user.user_certification_uuid,
                "legacy_course_uuid": course.course_uuid,
                "legacy_migration": True,
            }
            existing_award.update_date = now
            db_session.add(existing_award)
            continue

        award = LearningBadgeAward(
            award_uuid=_deterministic_award_uuid(certificate_user),
            badge_id=badge.id,
            run_id=None,
            org_id=course.org_id,
            user_id=certificate_user.user_id,
            source=LearningAwardSource.PATH_COMPLETION,
            issued_at=_parse_datetime(certificate_user.created_at),
            evidence={
                "legacy_certificate_user_uuid": certificate_user.user_certification_uuid,
                "legacy_course_uuid": course.course_uuid,
                "legacy_migration": True,
            },
            creation_date=now,
            update_date=now,
        )
        db_session.add(award)
        migrated_count += 1
    return migrated_count


def _get_ordered_chapters(db_session: Session, course: Course) -> list[Chapter]:
    links = db_session.exec(
        select(CourseChapter).where(CourseChapter.course_id == course.id).order_by(CourseChapter.order.asc())  # type: ignore
    ).all()
    if links:
        chapters_by_id = {
            chapter.id: chapter
            for chapter in db_session.exec(select(Chapter).where(Chapter.id.in_([link.chapter_id for link in links]))).all()  # type: ignore
        }
        return [chapters_by_id[link.chapter_id] for link in links if link.chapter_id in chapters_by_id]
    return db_session.exec(select(Chapter).where(Chapter.course_id == course.id).order_by(Chapter.id.asc())).all()  # type: ignore


def _get_ordered_activities(db_session: Session, chapter: Chapter) -> list[Activity]:
    links = db_session.exec(
        select(ChapterActivity).where(ChapterActivity.chapter_id == chapter.id).order_by(ChapterActivity.order.asc())  # type: ignore
    ).all()
    if not links:
        return []
    activities_by_id = {
        activity.id: activity
        for activity in db_session.exec(select(Activity).where(Activity.id.in_([link.activity_id for link in links]))).all()  # type: ignore
    }
    return [activities_by_id[link.activity_id] for link in links if link.activity_id in activities_by_id]


def _get_course(db_session: Session, course_uuid: str) -> Course:
    full_uuid = course_uuid if course_uuid.startswith("course_") else f"course_{course_uuid}"
    course = db_session.exec(select(Course).where(Course.course_uuid == full_uuid)).first()
    if not course:
        raise HTTPException(status_code=404, detail="Legacy course not found")
    return course


def _get_collection(db_session: Session, collection_uuid: str) -> Collection:
    full_uuid = collection_uuid if collection_uuid.startswith("collection_") else f"collection_{collection_uuid}"
    collection = db_session.exec(select(Collection).where(Collection.collection_uuid == full_uuid)).first()
    if not collection:
        raise HTTPException(status_code=404, detail="Legacy collection not found")
    return collection


def _get_org(db_session: Session, org_id: int) -> Organization | None:
    return db_session.exec(select(Organization).where(Organization.id == org_id)).first()


def _preview_course(db_session: Session, course: Course) -> dict:
    org = _get_org(db_session, course.org_id)
    warnings: list[dict] = []
    activities_count = 0
    pages_count = 0
    chapters = []
    for chapter in _get_ordered_chapters(db_session, course):
        activity_previews = []
        for activity in _get_ordered_activities(db_session, chapter):
            page_specs, activity_warnings = convert_activity_to_page_specs(course, activity, org)
            warnings.extend([warning.as_dict() for warning in activity_warnings])
            activities_count += 1
            pages_count += len(page_specs)
            activity_previews.append({
                "activity_uuid": activity.activity_uuid,
                "title": activity.name,
                "activity_type": activity.activity_type,
                "pages": [{"title": page["title"], "page_type": page["page_type"]} for page in page_specs],
                "warnings": [warning.as_dict() for warning in activity_warnings],
            })
        chapters.append({
            "chapter_uuid": chapter.chapter_uuid,
            "title": chapter.name,
            "activities": activity_previews,
        })
    return {
        "source": {"course_uuid": course.course_uuid, "course_id": course.id},
        "target": {"badge_uuid": _deterministic_badge_uuid(course)},
        "summary": {"activities": activities_count, "pages": pages_count, "warnings": len(warnings)},
        "chapters": chapters,
        "warnings": warnings,
    }


def preview_course_migration(request: Request, course_uuid: str, current_user: PublicUser | AnonymousUser, db_session: Session) -> dict:
    course = _get_course(db_session, course_uuid)
    _require_org_admin(db_session, current_user, course.org_id)
    return _preview_course(db_session, course)


def _find_existing_badge(db_session: Session, course: Course) -> LearningBadge | None:
    return db_session.exec(select(LearningBadge).where(LearningBadge.badge_uuid == _deterministic_badge_uuid(course))).first()


def _find_existing_collection(db_session: Session, collection: Collection) -> BadgeCollection | None:
    existing = db_session.exec(select(BadgeCollection).where(BadgeCollection.collection_uuid == _deterministic_collection_uuid(collection))).first()
    if existing:
        return existing
    return db_session.exec(select(BadgeCollection).where(BadgeCollection.collection_uuid == _legacy_deterministic_collection_uuid(collection))).first()


def convert_course_migration(
    request: Request,
    course_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    target_collection: BadgeCollection | None = None,
) -> dict:
    course = _get_course(db_session, course_uuid)
    _require_org_admin(db_session, current_user, course.org_id)
    org = _get_org(db_session, course.org_id)
    now = _now()
    report = _preview_course(db_session, course)

    badge = _find_existing_badge(db_session, course)
    created = badge is None
    metadata = {
        **_legacy_certification_metadata(db_session, course),
        "legacy_migration": {
            "source_type": "course",
            "course_uuid": course.course_uuid,
            "course_id": course.id,
            "converted_at": now,
            "warnings": report["warnings"],
        },
    }
    thumbnail_image = _course_thumbnail_url(
        org,
        course,
        metadata.get("badge_image_url") if _looks_like_media_url(metadata.get("badge_image_url")) else None,
    )
    if badge is None:
        badge = LearningBadge(
            badge_uuid=_deterministic_badge_uuid(course),
            org_id=course.org_id,
            collection_id=target_collection.id if target_collection else None,
            name=metadata.get("badge_name") or course.name,
            description=metadata.get("badge_description") or course.description or "",
            about=course.about or "",
            criteria=metadata.get("badge_criteria_text") or "Complete the required badge learning path.",
            thumbnail_image=thumbnail_image,
            public=course.public,
            published=course.published,
            protected=False,
            system_type=None,
            direct_conferral_enabled=True,
            badge_metadata=metadata,
            creation_date=now,
            update_date=now,
        )
    else:
        badge.collection_id = target_collection.id if target_collection else badge.collection_id
        badge.system_type = None if badge.system_type == MIGRATION_SYSTEM_TYPE else badge.system_type
        badge.name = badge.name or metadata.get("badge_name") or course.name
        badge.description = badge.description or metadata.get("badge_description") or course.description or ""
        badge.thumbnail_image = thumbnail_image or badge.thumbnail_image
        badge.badge_metadata = {**(badge.badge_metadata or {}), **metadata}
        badge.update_date = now
    db_session.add(badge)
    db_session.commit()
    db_session.refresh(badge)

    path = _get_path_for_badge(db_session, badge)
    path.title = f"{badge.name} Path"
    path.description = badge.description or ""
    path.update_date = now
    db_session.add(path)

    for chapter_index, chapter in enumerate(_get_ordered_chapters(db_session, course), start=1):
        learning_activity = db_session.exec(
            select(LearningActivity).where(LearningActivity.activity_uuid == _deterministic_activity_uuid(chapter))
        ).first()
        if not learning_activity:
            learning_activity = LearningActivity(
                activity_uuid=_deterministic_activity_uuid(chapter),
                path_id=path.id or 0,
                badge_id=badge.id or 0,
                org_id=course.org_id,
                title=chapter.name,
                description=chapter.description or "",
                thumbnail_image=chapter.thumbnail_image or "",
                icon=chapter.icon,
                order=chapter_index,
                required=True,
                published=badge.published,
                settings={"legacy_migration": _legacy_source(course, chapter=chapter)},
                creation_date=now,
                update_date=now,
            )
            db_session.add(learning_activity)
            db_session.commit()
            db_session.refresh(learning_activity)
        else:
            learning_activity.path_id = path.id or learning_activity.path_id
            learning_activity.badge_id = badge.id or learning_activity.badge_id
            learning_activity.order = chapter_index
            learning_activity.settings = {**(learning_activity.settings or {}), "legacy_migration": _legacy_source(course, chapter=chapter)}
            learning_activity.update_date = now
            db_session.add(learning_activity)

        page_order = 1
        activity_warnings: list[dict] = []
        for legacy_activity in _get_ordered_activities(db_session, chapter):
            page_specs, warnings = convert_activity_to_page_specs(course, legacy_activity, org)
            activity_warnings.extend([warning.as_dict() for warning in warnings])
            for page_spec in page_specs:
                page = db_session.exec(select(LearningPage).where(LearningPage.page_uuid == page_spec["page_uuid"])).first()
                if not page:
                    page = LearningPage(
                        page_uuid=page_spec["page_uuid"],
                        activity_id=learning_activity.id or 0,
                        badge_id=badge.id or 0,
                        org_id=course.org_id,
                        page_type=page_spec["page_type"],
                        title=page_spec["title"],
                        order=page_order,
                        required=True,
                        content=page_spec["content"],
                        design={},
                        scoring=page_spec["scoring"],
                        completion=page_spec["completion"],
                        creation_date=now,
                        update_date=now,
                    )
                else:
                    page.activity_id = learning_activity.id or page.activity_id
                    page.badge_id = badge.id or page.badge_id
                    page.org_id = course.org_id
                    page.page_type = page_spec["page_type"]
                    page.title = page_spec["title"]
                    page.order = page_order
                    page.content = page_spec["content"]
                    page.scoring = page_spec["scoring"]
                    page.completion = page_spec["completion"]
                    page.update_date = now
                db_session.add(page)
                page_order += 1
        if activity_warnings:
            learning_activity.settings = {**(learning_activity.settings or {}), "migration_warnings": activity_warnings}
            db_session.add(learning_activity)

    db_session.commit()
    migrated_awards = _migrate_certificate_awards(db_session, course, badge, now)
    db_session.commit()
    return {
        **report,
        "created": created,
        "badge_uuid": badge.badge_uuid,
        "path_uuid": path.path_uuid,
        "migrated_awards": migrated_awards,
        "summary": {**report["summary"], "migrated_awards": migrated_awards},
    }


def _collection_courses(db_session: Session, collection: Collection) -> list[Course]:
    courses_by_id: dict[int, Course] = {}
    direct_courses = db_session.exec(select(Course).where(Course.collection_id == collection.id).order_by(Course.id.asc())).all()  # type: ignore
    for course in direct_courses:
        if course.id:
            courses_by_id[course.id] = course
    links = db_session.exec(select(CollectionCourse).where(CollectionCourse.collection_id == collection.id)).all()
    if links:
        linked_courses = db_session.exec(select(Course).where(Course.id.in_([link.course_id for link in links])).order_by(Course.id.asc())).all()  # type: ignore
        for course in linked_courses:
            if course.id:
                courses_by_id[course.id] = course
    return list(courses_by_id.values())


def preview_collection_migration(request: Request, collection_uuid: str, current_user: PublicUser | AnonymousUser, db_session: Session) -> dict:
    collection = _get_collection(db_session, collection_uuid)
    _require_org_admin(db_session, current_user, collection.org_id)
    courses = _collection_courses(db_session, collection)
    course_previews = [_preview_course(db_session, course) for course in courses]
    warnings = [warning for preview in course_previews for warning in preview["warnings"]]
    return {
        "source": {"collection_uuid": collection.collection_uuid, "collection_id": collection.id},
        "target": {"collection_uuid": _deterministic_collection_uuid(collection)},
        "summary": {"badges": len(courses), "warnings": len(warnings)},
        "courses": course_previews,
        "warnings": warnings,
    }


def convert_collection_migration(request: Request, collection_uuid: str, current_user: PublicUser | AnonymousUser, db_session: Session) -> dict:
    collection = _get_collection(db_session, collection_uuid)
    _require_org_admin(db_session, current_user, collection.org_id)
    org = _get_org(db_session, collection.org_id)
    now = _now()
    badge_collection = _find_existing_collection(db_session, collection)
    created = badge_collection is None
    if not badge_collection:
        badge_collection = BadgeCollection(
            collection_uuid=_deterministic_collection_uuid(collection),
            org_id=collection.org_id,
            name=collection.name,
            description=collection.description or "",
            thumbnail_image=_collection_thumbnail_url(org, collection),
            public=collection.public,
            hidden=collection.hidden,
            protected=False,
            system_type=None,
            creation_date=now,
            update_date=now,
        )
    else:
        badge_collection.collection_uuid = _deterministic_collection_uuid(collection)
        badge_collection.name = badge_collection.name or collection.name
        badge_collection.description = badge_collection.description or collection.description or ""
        badge_collection.thumbnail_image = _collection_thumbnail_url(org, collection) or badge_collection.thumbnail_image
        badge_collection.system_type = None if badge_collection.system_type == MIGRATION_SYSTEM_TYPE else badge_collection.system_type
        badge_collection.update_date = now
    db_session.add(badge_collection)
    db_session.commit()
    db_session.refresh(badge_collection)

    previews = []
    for course in _collection_courses(db_session, collection):
        previews.append(convert_course_migration(request, course.course_uuid, current_user, db_session, target_collection=badge_collection))

    warnings = [warning for preview in previews for warning in preview["warnings"]]
    return {
        "created": created,
        "collection_uuid": badge_collection.collection_uuid,
        "source": {"collection_uuid": collection.collection_uuid, "collection_id": collection.id},
        "summary": {"badges": len(previews), "warnings": len(warnings), "migrated_awards": sum(preview.get("migrated_awards", 0) for preview in previews)},
        "courses": previews,
        "warnings": warnings,
    }
