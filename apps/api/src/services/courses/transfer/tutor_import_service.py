"""
Tutor LMS course import service.

Imports Tutor LMS JSON exports directly into LearnHouse courses.
"""

import json
import os
import shutil
from datetime import datetime
from html import unescape
from typing import Any
from urllib.parse import quote, unquote, urlparse
from uuid import uuid4

from bs4 import BeautifulSoup, NavigableString, Tag
from fastapi import HTTPException, Request, UploadFile
import httpx
from sqlmodel import Session, select

from src.db.courses.activities import Activity, ActivitySubTypeEnum, ActivityTypeEnum
from src.db.courses.blocks import Block, BlockTypeEnum
from src.db.courses.chapter_activities import ChapterActivity
from src.db.courses.chapters import Chapter
from src.db.courses.course_chapters import CourseChapter
from src.db.courses.courses import Course, ThumbnailType
from src.db.organizations import Organization
from src.db.resource_authors import (
    ResourceAuthor,
    ResourceAuthorshipEnum,
    ResourceAuthorshipStatusEnum,
)
from src.db.users import PublicUser, AnonymousUser, APITokenUser
from src.security.file_validation import (
    get_safe_filename,
    validate_audio_content,
    validate_image_content,
    validate_video_content,
)
from src.security.features_utils.usage import check_limits_with_usage, increase_feature_usage
from src.security.rbac import AccessAction, check_resource_access
from src.services.utils.upload_content import upload_content

from .models import (
    ImportAnalysisResponse,
    ImportCourseInfo,
    ImportCourseResult,
    ImportOptions,
    ImportResult,
    TutorImportLogEntry,
    TutorImportProgressResponse,
)


TEMP_TUTOR_IMPORT_DIR = "content/temp/tutor-imports"
MAX_TUTOR_FILES = 20
MAX_TUTOR_TOTAL_SIZE = 50 * 1024 * 1024
SUPPORTED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}
SUPPORTED_DOCUMENT_EXTENSIONS = {".pdf"}
SUPPORTED_OFFICE_EXTENSIONS = {".docx", ".pptx"}
SUPPORTED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
SUPPORTED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".m4a"}
PROGRESS_FILENAME = "progress.json"
EMBED_VIDEO_KEYS = ("source_youtube", "source_vimeo", "source_embedded")
MAX_PROGRESS_LOGS = 200


def _strip_html(value: str | None) -> str:
    if not value:
        return ""
    soup = BeautifulSoup(value, "html.parser")
    return soup.get_text("\n", strip=True)


def _first_non_empty(*values: str | None) -> str:
    for value in values:
        if value and str(value).strip():
            return str(value).strip()
    return ""


def _text_node(text: str, marks: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    node: dict[str, Any] = {"type": "text", "text": text}
    if marks:
        node["marks"] = marks
    return node


def _collect_inline_nodes(node: Any, active_marks: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    marks = list(active_marks or [])

    if isinstance(node, NavigableString):
        text = str(node)
        if not text:
            return []
        return [_text_node(text, marks)] if text else []

    if not isinstance(node, Tag):
        return []

    tag_name = node.name.lower()
    next_marks = list(marks)

    if tag_name in {"strong", "b"}:
        next_marks.append({"type": "bold"})
    elif tag_name in {"em", "i"}:
        next_marks.append({"type": "italic"})
    elif tag_name == "a":
        href = node.get("href")
        if href:
            next_marks.append(
                {
                    "type": "link",
                    "attrs": {
                        "href": href,
                        "target": "_blank",
                        "rel": "noopener noreferrer nofollow",
                        "class": None,
                    },
                }
            )

    if tag_name == "br":
        return [_text_node("\n", marks)]

    content: list[dict[str, Any]] = []
    for child in node.children:
        content.extend(_collect_inline_nodes(child, next_marks))
    return content


def _paragraph_from_html_node(node: Tag) -> dict[str, Any]:
    content = _collect_inline_nodes(node)
    if not content:
        content = [{"type": "text", "text": ""}]
    return {"type": "paragraph", "content": content}


def _list_item_from_tag(tag: Tag) -> dict[str, Any]:
    paragraph_children: list[dict[str, Any]] = []
    nested_items: list[dict[str, Any]] = []

    for child in tag.children:
        if isinstance(child, Tag) and child.name.lower() in {"ul", "ol"}:
            nested_type = "bulletList" if child.name.lower() == "ul" else "orderedList"
            nested_items.append(
                {
                    "type": nested_type,
                    "content": [_list_item_from_tag(li) for li in child.find_all("li", recursive=False)],
                }
            )
        else:
            paragraph_children.extend(_collect_inline_nodes(child))

    item_content: list[dict[str, Any]] = []
    if paragraph_children:
        item_content.append({"type": "paragraph", "content": paragraph_children})
    item_content.extend(nested_items)

    if not item_content:
        item_content.append({"type": "paragraph", "content": [{"type": "text", "text": ""}]})

    return {"type": "listItem", "content": item_content}


def html_to_tiptap_doc(value: str | None) -> dict[str, Any]:
    if not value:
        return {"type": "doc", "content": []}

    soup = BeautifulSoup(value, "html.parser")
    body_children = soup.body.contents if soup.body else soup.contents
    content: list[dict[str, Any]] = []

    for child in body_children:
        if isinstance(child, NavigableString):
            text = str(child).strip()
            if text:
                content.append({"type": "paragraph", "content": [{"type": "text", "text": text}]})
            continue

        if not isinstance(child, Tag):
            continue

        tag_name = child.name.lower()
        if tag_name in {"p", "div"}:
            content.append(_paragraph_from_html_node(child))
        elif tag_name in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            level = min(max(int(tag_name[1]), 1), 6)
            heading_content = _collect_inline_nodes(child) or [{"type": "text", "text": _strip_html(str(child))}]
            content.append({"type": "heading", "attrs": {"level": level}, "content": heading_content})
        elif tag_name in {"ul", "ol"}:
            list_type = "bulletList" if tag_name == "ul" else "orderedList"
            content.append(
                {
                    "type": list_type,
                    "content": [_list_item_from_tag(li) for li in child.find_all("li", recursive=False)],
                }
            )
        else:
            flattened = _strip_html(str(child))
            if flattened:
                content.append({"type": "paragraph", "content": [{"type": "text", "text": flattened}]})

    return {"type": "doc", "content": content}


def append_paragraph(doc: dict[str, Any], text: str) -> None:
    if not text.strip():
        return
    doc.setdefault("content", []).append(
        {"type": "paragraph", "content": [{"type": "text", "text": text}]}
    )


def append_heading(doc: dict[str, Any], text: str, level: int = 2) -> None:
    if not text.strip():
        return
    doc.setdefault("content", []).append(
        {"type": "heading", "attrs": {"level": level}, "content": [{"type": "text", "text": text}]}
    )


def append_bullet_list(doc: dict[str, Any], items: list[str]) -> None:
    cleaned_items = [item.strip() for item in items if item and item.strip()]
    if not cleaned_items:
        return

    doc.setdefault("content", []).append(
        {
            "type": "bulletList",
            "content": [
                {
                    "type": "listItem",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": item}],
                        }
                    ],
                }
                for item in cleaned_items
            ],
        }
    )


def _make_learning_items(values: list[str]) -> str:
    items = []
    for value in values:
        text = str(value).strip()
        if not text:
            continue
        items.append(
            {
                "id": str(uuid4()),
                "text": text,
                "emoji": "📝",
            }
        )
    return json.dumps(items)


def _split_learning_values(values: list[Any]) -> list[str]:
    split_values: list[str] = []
    for value in values:
        if value is None:
            continue
        parts = str(value).replace("\r\n", "\n").replace("\r", "\n").split("\n")
        for part in parts:
            cleaned = part.strip()
            if cleaned:
                split_values.append(cleaned)
    return split_values


def _default_correct_vector() -> dict[str, Any]:
    return {
        "key": "correct",
        "label": "Correct",
        "type": "binary",
        "low_label": "False",
        "high_label": "True",
    }


def _get_url_extension(url: str) -> str:
    path = unquote(urlparse(url).path)
    _, ext = os.path.splitext(path)
    return ext.lower()


def _basename_from_url(url: str, fallback: str) -> str:
    path = unquote(urlparse(url).path)
    basename = os.path.basename(path)
    return basename or fallback


def _is_embeddable_external_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except Exception:
        return False

    hostname = (parsed.hostname or "").lower()
    if hostname in {
        "drive.google.com",
        "docs.google.com",
        "youtube.com",
        "www.youtube.com",
        "youtu.be",
        "www.youtu.be",
        "vimeo.com",
        "www.vimeo.com",
        "player.vimeo.com",
    }:
        return True
    return False


def _normalize_embed_url(url: str) -> str:
    try:
        parsed = urlparse(url)
    except Exception:
        return url

    hostname = (parsed.hostname or "").lower()
    path = parsed.path or ""

    if hostname == "drive.google.com":
        parts = [part for part in path.split("/") if part]
        if len(parts) >= 3 and parts[0] == "file" and parts[1] == "d":
            file_id = parts[2]
            return f"https://drive.google.com/file/d/{file_id}/preview"

    if hostname == "docs.google.com":
        parts = [part for part in path.split("/") if part]
        if len(parts) >= 3 and parts[0] in {"document", "presentation"} and parts[1] == "d":
            doc_id = parts[2]
            return f"https://docs.google.com/{parts[0]}/d/{doc_id}/preview"

    if _get_url_extension(url) in SUPPORTED_OFFICE_EXTENSIONS:
        return f"https://view.officeapps.live.com/op/embed.aspx?src={quote(url, safe='')}"

    return url


def _get_tutor_video_url(video_meta: Any) -> str | None:
    if not isinstance(video_meta, list):
        return None

    for video in video_meta:
        if not isinstance(video, dict):
            continue
        for key in ("source_html5", "source_external_url"):
            url = video.get(key)
            if url and _get_url_extension(url) in SUPPORTED_VIDEO_EXTENSIONS:
                return url

    return None


def extract_downloadable_media(item: dict[str, Any]) -> list[dict[str, str]]:
    media_items: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    meta = item.get("meta") or {}

    for video in meta.get("_video") or []:
        for key in ("source_html5", "source_external_url"):
            url = video.get(key)
            ext = _get_url_extension(url or "")
            if url and ext in SUPPORTED_VIDEO_EXTENSIONS and url not in seen_urls:
                seen_urls.add(url)
                media_items.append({"kind": "video", "url": url, "name": item.get("post_title") or "Video"})

    for url in item.get("attachment_links") or []:
        ext = _get_url_extension(url)
        if ext in SUPPORTED_DOCUMENT_EXTENSIONS:
            kind = "document"
        elif ext in SUPPORTED_VIDEO_EXTENSIONS:
            kind = "video"
        elif ext in SUPPORTED_AUDIO_EXTENSIONS:
            kind = "audio"
        else:
            continue

        if url not in seen_urls:
            seen_urls.add(url)
            media_items.append({"kind": kind, "url": url, "name": item.get("post_title") or "Attachment"})

    return media_items


def extract_embeddable_media(item: dict[str, Any]) -> list[dict[str, str]]:
    media_items: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    meta = item.get("meta") or {}

    for video in meta.get("_video") or []:
        if not isinstance(video, dict):
            continue

        for key in EMBED_VIDEO_KEYS:
            url = video.get(key)
            if not url or url in seen_urls:
                continue

            seen_urls.add(url)
            media_items.append(
                {
                    "kind": "embed",
                    "url": url,
                    "name": item.get("post_title") or "Embedded Video",
                }
            )

        external_url = video.get("source_external_url")
        if external_url and _is_embeddable_external_url(external_url) and external_url not in seen_urls:
            seen_urls.add(external_url)
            media_items.append(
                {
                    "kind": "embed",
                    "url": external_url,
                    "name": item.get("post_title") or "Embedded Video",
                }
            )

    for url in item.get("attachment_links") or []:
        ext = _get_url_extension(url)
        if ext in SUPPORTED_OFFICE_EXTENSIONS and url not in seen_urls:
            seen_urls.add(url)
            media_items.append(
                {
                    "kind": "embed",
                    "url": url,
                    "name": item.get("post_title") or "Embedded Document",
                }
            )

    return media_items


def extract_inline_image_media(item: dict[str, Any]) -> list[dict[str, str]]:
    media_items: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    content = item.get("post_content")
    if not content:
        return media_items

    soup = BeautifulSoup(str(content), "html.parser")
    for image in soup.find_all("img"):
        url = image.get("src")
        if not url or url in seen_urls:
            continue
        if _get_url_extension(url) not in SUPPORTED_IMAGE_EXTENSIONS:
            continue

        seen_urls.add(url)
        media_items.append(
            {
                "kind": "image",
                "url": url,
                "name": image.get("alt") or item.get("post_title") or "Image",
            }
        )

    return media_items


def _build_quiz_info_slide(item: dict[str, Any]) -> dict[str, Any] | None:
    intro_text = _strip_html(item.get("post_content"))
    if not intro_text:
        return None

    return {
        "type": "quizInfoBlock",
        "attrs": {
            "slide_uuid": str(uuid4()),
            "gradient_seed": str(uuid4()),
            "title": item.get("post_title") or "",
            "body": intro_text,
            "image_block_object": None,
            "image_file_id": None,
        },
    }


def _build_quiz_question_text(question: dict[str, Any]) -> tuple[str, str]:
    title = unescape(_first_non_empty(question.get("question_title"), "Untitled question"))
    description = _strip_html(question.get("question_description"))
    return title, description


def _normalize_tutor_text_input_size(question_type: str) -> str:
    if question_type == "open_ended":
        return "open_ended"
    if question_type == "short_answer":
        return "short_answer"
    return "single_line"


def build_tutor_quiz_payload(item: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]] | None:
    question_answer = item.get("question_answer") or []
    if not question_answer:
        return None

    tutor_options = ((item.get("meta") or {}).get("tutor_quiz_option") or [{}])[0] or {}
    pass_is_required = str(tutor_options.get("pass_is_required", "0")) == "1"
    raw_passing_grade = tutor_options.get("passing_grade", 100)
    try:
        passing_grade = float(raw_passing_grade)
    except (TypeError, ValueError):
        passing_grade = 100.0

    raw_attempts_allowed = tutor_options.get("attempts_allowed")
    try:
        attempts_allowed = int(raw_attempts_allowed)
    except (TypeError, ValueError):
        attempts_allowed = 0

    content_nodes: list[dict[str, Any]] = []
    intro_slide = _build_quiz_info_slide(item)
    if intro_slide:
        content_nodes.append(intro_slide)

    option_scores: dict[str, dict[str, float]] = {}
    text_scores: dict[str, dict[str, Any]] = {}

    for question_entry in question_answer:
        question = question_entry.get("question") or {}
        question_type = str(question.get("question_type") or "").strip()
        question_uuid = str(uuid4())
        question_text, description = _build_quiz_question_text(question)
        select_question_text = (
            f"{question_text}\n\n{description}" if description and question_type == "multiple_choice" else question_text
        )

        if question_type in {"short_answer", "open_ended"}:
            content_nodes.append(
                {
                    "type": "quizTextBlock",
                    "attrs": {
                        "question_uuid": question_uuid,
                        "question_text": question_text,
                        "description": description,
                        "placeholder": "Type your answer...",
                        "input_size": _normalize_tutor_text_input_size(question_type),
                        "background_gradient_seed": str(uuid4()),
                        "background_image_file_id": None,
                        "background_image_block_object": None,
                    },
                }
            )
            text_scores[question_uuid] = {"mode": "min_length", "min_chars": 1}
            continue

        answers = question_entry.get("answers") or []
        if question_type != "multiple_choice" or len(answers) < 2:
            return None

        sorted_answers = sorted(
            answers,
            key=lambda answer: int(answer.get("answer_order") or 0),
        )
        correct_answers = [answer for answer in sorted_answers if str(answer.get("is_correct")) == "1"]
        if len(correct_answers) != 1:
            return None

        option_nodes = []
        for answer in sorted_answers:
            option_uuid = str(uuid4())
            option_nodes.append(
                {
                    "option_uuid": option_uuid,
                    "label": unescape(str(answer.get("answer_title") or "")),
                    "image_file_id": None,
                    "image_block_object": None,
                    "gradient_seed": str(uuid4()),
                    "info_message": "",
                    "info_image_file_id": None,
                    "info_image_block_object": None,
                    "show_info_expanded": False,
                }
            )
            option_scores[option_uuid] = {"correct": 1.0 if str(answer.get("is_correct")) == "1" else 0.0}

        content_nodes.append(
            {
                "type": "quizSelectBlock",
                "attrs": {
                    "question_uuid": question_uuid,
                    "question_text": select_question_text,
                    "display_style": "text",
                    "show_responses": False,
                    "option_count": min(max(len(option_nodes), 2), 4),
                    "options": option_nodes,
                    "background_gradient_seed": str(uuid4()),
                    "background_image_file_id": None,
                    "background_image_block_object": None,
                },
            }
        )

    if not content_nodes:
        return None

    details = {
        "import_source": "tutor_lms",
        "quiz_mode": "graded",
        "grading_rules": {
            "pass_percent": passing_grade if pass_is_required else 0,
            "max_attempts": attempts_allowed if attempts_allowed > 0 else None,
        },
        "scoring_vectors": [_default_correct_vector()],
        "category_scoring_vectors": [],
        "graded_scoring_vectors": [_default_correct_vector()],
        "option_scores": option_scores,
        "text_scores": text_scores,
    }
    return {"type": "doc", "content": content_nodes}, details


def tutor_item_to_doc(
    item: dict[str, Any],
    include_downloadable_media_links: bool = True,
    downloadable_media: list[dict[str, str]] | None = None,
    include_embeddable_media_links: bool = True,
    embeddable_media: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    doc = html_to_tiptap_doc(item.get("post_content"))
    meta = item.get("meta") or {}
    video_meta = meta.get("_video") or []
    attachment_links = list(item.get("attachment_links") or [])
    downloadable_media = downloadable_media if downloadable_media is not None else extract_downloadable_media(item)
    embeddable_media = embeddable_media if embeddable_media is not None else extract_embeddable_media(item)
    downloadable_urls = {media["url"] for media in downloadable_media}
    embeddable_urls = {media["url"] for media in embeddable_media}

    if video_meta:
        urls = []
        for video in video_meta:
            urls.extend(
                [
                    video.get("source_html5"),
                    video.get("source_external_url"),
                    video.get("source_youtube"),
                    video.get("source_vimeo"),
                    video.get("source_embedded"),
                ]
            )
        cleaned_urls = [
            url for url in urls
            if url
            and (include_downloadable_media_links or url not in downloadable_urls)
            and (include_embeddable_media_links or url not in embeddable_urls)
        ]
        if cleaned_urls:
            append_heading(doc, "Media", 3)
            append_bullet_list(doc, cleaned_urls)

    if attachment_links:
        filtered_attachments = [
            url for url in attachment_links
            if (include_downloadable_media_links or url not in downloadable_urls)
            and (include_embeddable_media_links or url not in embeddable_urls)
        ]
        if filtered_attachments:
            append_heading(doc, "Attachments", 3)
            append_bullet_list(doc, filtered_attachments)

    question_answer = item.get("question_answer") or []
    if question_answer:
        append_heading(doc, "Quiz Questions", 2)
        for index, question_entry in enumerate(question_answer, start=1):
            question = question_entry.get("question") or {}
            title = _first_non_empty(
                question.get("question_title"),
                f"Question {index}",
            )
            append_heading(doc, f"{index}. {unescape(title)}", 3)

            description = _strip_html(question.get("question_description"))
            if description:
                append_paragraph(doc, description)

            answers = question_entry.get("answers") or []
            answer_lines = []
            for answer in answers:
                title = answer.get("answer_title")
                if not title:
                    continue
                prefix = "[Correct] " if str(answer.get("is_correct")) == "1" else ""
                answer_lines.append(f"{prefix}{unescape(str(title))}")
            append_bullet_list(doc, answer_lines)

    return doc


def _item_needs_dynamic_activity(item: dict[str, Any], media_items: list[dict[str, str]] | None = None) -> bool:
    if build_tutor_quiz_payload(item):
        return True
    media_items = media_items if media_items is not None else extract_downloadable_media(item)
    embeddable_media = extract_embeddable_media(item)
    inline_image_media = extract_inline_image_media(item)
    doc = tutor_item_to_doc(
        item,
        include_downloadable_media_links=False,
        downloadable_media=media_items,
        include_embeddable_media_links=False,
        embeddable_media=embeddable_media,
    )
    return bool(doc.get("content") or embeddable_media or inline_image_media)


def _create_embed_block_node_from_url(media: dict[str, str]) -> dict[str, Any] | None:
    url = media.get("url")
    if not url:
        return None

    normalized_url = _normalize_embed_url(url)

    return {
        "type": "blockEmbed",
        "attrs": {
            "embedUrl": normalized_url,
            "embedCode": None,
            "embedType": "url",
            "embedHeight": 420,
            "embedWidth": "100%",
            "alignment": "center",
        },
    }


def _image_file_type_from_extension(ext: str) -> str:
    ext = ext.lower()
    if ext == ".png":
        return "image/png"
    if ext == ".webp":
        return "image/webp"
    if ext == ".gif":
        return "image/gif"
    return "image/jpeg"


async def _download_remote_bytes(url: str) -> tuple[bytes, str | None]:
    async with httpx.AsyncClient(follow_redirects=True, timeout=120.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.content, response.headers.get("content-type")


async def _store_remote_file(
    *,
    url: str,
    org_uuid: str,
    directory: str,
    prefix: str,
    kind: str,
) -> str | None:
    try:
        content, _content_type = await _download_remote_bytes(url)
    except Exception:
        return None

    ext = _get_url_extension(url)
    original_name = _basename_from_url(url, f"{prefix}{ext or ''}")
    filename = get_safe_filename(original_name, f"{uuid4()}_{prefix}")

    if kind == "video":
        if ext not in SUPPORTED_VIDEO_EXTENSIONS or not validate_video_content(content):
            return None
    elif kind == "document":
        if ext not in SUPPORTED_DOCUMENT_EXTENSIONS or not content.startswith(b"%PDF-"):
            return None
    elif kind == "audio":
        if ext not in SUPPORTED_AUDIO_EXTENSIONS or not validate_audio_content(content):
            return None
    elif kind == "image":
        if ext not in SUPPORTED_IMAGE_EXTENSIONS or not validate_image_content(content):
            return None
    else:
        return None

    await upload_content(
        directory=directory,
        type_of_dir="orgs",
        uuid=org_uuid,
        file_binary=content,
        file_and_format=filename,
    )
    return filename


def _build_course_info(tutor_course: dict[str, Any]) -> ImportCourseInfo:
    course = tutor_course.get("course") or {}
    contents = course.get("contents") or []
    chapters_count = len(contents)
    activities_count = 0
    media_count = 0

    for topic in contents:
        for child in topic.get("children") or []:
            media_items = extract_downloadable_media(child)
            media_count += len(media_items)
            if _item_needs_dynamic_activity(child, media_items):
                activities_count += 1

    course_id = str(course.get("ID") or uuid4())
    return ImportCourseInfo(
        course_uuid=f"tutor_{course_id}",
        name=course.get("post_title") or "Untitled Course",
        description=_first_non_empty(course.get("post_excerpt"), _strip_html(course.get("post_content"))[:180]),
        chapters_count=chapters_count,
        activities_count=activities_count,
        has_thumbnail=bool(course.get("thumbnail_url")),
        media_count=media_count,
    )


def _load_tutor_course_payload(content: bytes) -> dict[str, Any]:
    try:
        parsed = json.loads(content.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid Tutor JSON file: {exc}") from exc

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="Invalid Tutor JSON file: expected a JSON object")

    data = parsed.get("data")
    if not isinstance(data, list) or not data:
        raise HTTPException(status_code=400, detail="Invalid Tutor JSON file: missing data array")

    first_entry = data[0]
    if first_entry.get("content_type") != "courses":
        raise HTTPException(status_code=400, detail="Invalid Tutor JSON file: expected Tutor course export")

    if not isinstance(first_entry.get("data"), dict) or not isinstance(first_entry["data"].get("course"), dict):
        raise HTTPException(status_code=400, detail="Invalid Tutor JSON file: missing course data")

    return first_entry["data"]


def _progress_path(temp_dir: str) -> str:
    return os.path.join(temp_dir, PROGRESS_FILENAME)


def _write_progress(temp_dir: str, progress: TutorImportProgressResponse) -> None:
    progress_path = _progress_path(temp_dir)
    tmp_path = f"{progress_path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as handle:
        json.dump(progress.model_dump(), handle)
    os.replace(tmp_path, progress_path)


def _read_progress(temp_dir: str) -> TutorImportProgressResponse:
    progress_path = _progress_path(temp_dir)
    if not os.path.exists(progress_path):
        return TutorImportProgressResponse()
    with open(progress_path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    return TutorImportProgressResponse(**data)


def _append_progress_log(
    temp_dir: str,
    *,
    message: str,
    level: str = "info",
    course_name: str | None = None,
    activity_name: str | None = None,
) -> None:
    progress = _read_progress(temp_dir)
    progress.logs.append(
        TutorImportLogEntry(
            timestamp=datetime.utcnow().isoformat(),
            level=level,
            message=message,
            course_name=course_name,
            activity_name=activity_name,
        )
    )
    if len(progress.logs) > MAX_PROGRESS_LOGS:
        progress.logs = progress.logs[-MAX_PROGRESS_LOGS:]
    _write_progress(temp_dir, progress)


def get_tutor_import_progress(temp_id: str) -> TutorImportProgressResponse:
    temp_dir = os.path.join(TEMP_TUTOR_IMPORT_DIR, temp_id)
    if not os.path.exists(temp_dir):
        raise HTTPException(status_code=404, detail="Tutor import package not found. Please analyze again.")
    return _read_progress(temp_dir)


async def analyze_tutor_import_files(
    request: Request,
    tutor_files: list[UploadFile],
    org_id: int,
    current_user: PublicUser | AnonymousUser | APITokenUser,
    db_session: Session,
) -> ImportAnalysisResponse:
    statement = select(Organization).where(Organization.id == org_id)
    organization = db_session.exec(statement).first()
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")

    await check_resource_access(request, db_session, current_user, "course_x", AccessAction.CREATE)

    if not tutor_files:
        raise HTTPException(status_code=400, detail="At least one Tutor LMS JSON file is required")
    if len(tutor_files) > MAX_TUTOR_FILES:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_TUTOR_FILES} Tutor files can be imported at once")

    total_size = 0
    parsed_courses: list[dict[str, Any]] = []

    for tutor_file in tutor_files:
        if not tutor_file.filename or not tutor_file.filename.lower().endswith(".json"):
            raise HTTPException(status_code=400, detail="Tutor import only supports .json exports")

        content = await tutor_file.read()
        total_size += len(content)
        if total_size > MAX_TUTOR_TOTAL_SIZE:
            raise HTTPException(status_code=413, detail="Tutor import is limited to 50MB per request")

        tutor_data = _load_tutor_course_payload(content)
        parsed_courses.append(tutor_data)

    temp_id = str(uuid4())
    temp_dir = os.path.join(TEMP_TUTOR_IMPORT_DIR, temp_id)
    os.makedirs(temp_dir, exist_ok=True)

    try:
        with open(os.path.join(temp_dir, "courses.json"), "w", encoding="utf-8") as handle:
            json.dump(parsed_courses, handle)
        _write_progress(
            temp_dir,
            TutorImportProgressResponse(
                status="pending",
                message="Ready to import Tutor LMS courses",
                logs=[],
            ),
        )
    except Exception as exc:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to store Tutor import package: {exc}") from exc

    courses = [_build_course_info(course_data) for course_data in parsed_courses]
    return ImportAnalysisResponse(
        temp_id=temp_id,
        version="tutor-lms-json-2.0",
        courses=courses,
    )


async def import_tutor_courses(
    request: Request,
    temp_id: str,
    org_id: int,
    options: ImportOptions,
    current_user: PublicUser | AnonymousUser | APITokenUser,
    db_session: Session,
) -> ImportResult:
    statement = select(Organization).where(Organization.id == org_id)
    organization = db_session.exec(statement).first()
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")

    await check_resource_access(request, db_session, current_user, "course_x", AccessAction.CREATE)

    temp_dir = os.path.join(TEMP_TUTOR_IMPORT_DIR, temp_id)
    courses_path = os.path.join(temp_dir, "courses.json")
    if not os.path.exists(courses_path):
        raise HTTPException(status_code=404, detail="Tutor import package not found. Please analyze again.")

    with open(courses_path, "r", encoding="utf-8") as handle:
        stored_courses = json.load(handle)

    course_map = {}
    for stored_course in stored_courses:
        course_info = _build_course_info(stored_course)
        course_map[course_info.course_uuid] = stored_course

    selected_courses = [
        course_map[selected_uuid]
        for selected_uuid in options.course_uuids
        if selected_uuid in course_map
    ]
    total_media = sum(_build_course_info(course).media_count for course in selected_courses)
    progress = TutorImportProgressResponse(
        status="running",
        total_media=total_media,
        completed_media=0,
        current_media_name=None,
        current_course_name=None,
        message="Preparing Tutor LMS import",
    )
    _write_progress(temp_dir, progress)
    _append_progress_log(
        temp_dir,
        message=f"Starting import for {len(selected_courses)} Tutor course(s)",
        level="info",
    )

    results = []
    successful = 0
    failed = 0

    for selected_uuid in options.course_uuids:
        tutor_course = course_map.get(selected_uuid)
        if not tutor_course:
            results.append(
                ImportCourseResult(
                    original_uuid=selected_uuid,
                    new_uuid="",
                    name="",
                    success=False,
                    error=f"Course not found in Tutor package: {selected_uuid}",
                )
            )
            failed += 1
            continue

        try:
            check_limits_with_usage("courses", org_id, db_session)
            new_course = await _import_single_tutor_course(
                tutor_course=tutor_course,
                organization=organization,
                current_user=current_user,
                options=options,
                db_session=db_session,
                temp_dir=temp_dir,
            )
            results.append(
                ImportCourseResult(
                    original_uuid=selected_uuid,
                    new_uuid=new_course.course_uuid,
                    name=new_course.name,
                    success=True,
                )
            )
            successful += 1
        except Exception as exc:
            progress = _read_progress(temp_dir)
            progress.current_media_name = None
            progress.current_course_name = None
            progress.message = f"Failed importing a course: {exc}"
            _write_progress(temp_dir, progress)
            _append_progress_log(
                temp_dir,
                message=f"Course import failed: {exc}",
                level="error",
            )
            results.append(
                ImportCourseResult(
                    original_uuid=selected_uuid,
                    new_uuid="",
                    name="",
                    success=False,
                    error=str(exc),
                )
            )
            failed += 1

    progress = _read_progress(temp_dir)
    progress.status = "complete"
    progress.current_media_name = None
    progress.current_course_name = None
    progress.message = "Tutor import complete"
    _write_progress(temp_dir, progress)
    _append_progress_log(temp_dir, message="Tutor import complete", level="info")

    return ImportResult(
        total_courses=len(options.course_uuids),
        successful=successful,
        failed=failed,
        courses=results,
    )


async def _import_single_tutor_course(
    tutor_course: dict[str, Any],
    organization: Organization,
    current_user: PublicUser | AnonymousUser | APITokenUser,
    options: ImportOptions,
    db_session: Session,
    temp_dir: str,
) -> Course:
    course_data = tutor_course.get("course") or {}
    new_course_uuid = f"course_{uuid4()}"
    course_name = course_data.get("post_title") or "Untitled Course"
    if options.name_prefix:
        course_name = f"{options.name_prefix} {course_name}"

    progress = _read_progress(temp_dir)
    progress.current_course_name = course_name
    progress.current_media_name = None
    progress.message = f"Importing {course_name}"
    _write_progress(temp_dir, progress)
    _append_progress_log(
        temp_dir,
        message="Creating LearnHouse course",
        level="info",
        course_name=course_name,
    )

    benefits = (course_data.get("meta") or {}).get("_tutor_course_benefits") or []
    materials = (course_data.get("meta") or {}).get("_tutor_course_material_includes") or []
    learning_values = _split_learning_values(benefits)
    for material in materials:
        if material:
            learning_values.extend(_split_learning_values([f"Materials: {material}"]))
    learnings = _make_learning_items(learning_values)

    tags = ",".join(
        [
            str(tag.get("name"))
            for tag in (course_data.get("taxonomies", {}) or {}).get("tags", [])
            if isinstance(tag, dict) and tag.get("name")
        ]
    )

    about = _strip_html(course_data.get("post_content"))
    description = _first_non_empty(course_data.get("post_excerpt"), about[:220])

    new_course = Course(
        org_id=organization.id,
        name=course_name,
        description=description,
        about=about,
        learnings=learnings,
        tags=tags,
        thumbnail_type=ThumbnailType.IMAGE,
        thumbnail_image="",
        thumbnail_video="",
        public=not options.set_private,
        published=(course_data.get("post_status") == "publish") if not options.set_unpublished else False,
        open_to_contributors=False,
        course_uuid=new_course_uuid,
        seo=None,
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )

    db_session.add(new_course)
    db_session.commit()
    db_session.refresh(new_course)

    thumbnail_url = course_data.get("thumbnail_url")
    if thumbnail_url:
        progress = _read_progress(temp_dir)
        progress.current_media_name = _basename_from_url(thumbnail_url, "thumbnail")
        progress.message = f"Downloading thumbnail for {course_name}"
        _write_progress(temp_dir, progress)
        thumbnail_filename = await _store_remote_file(
            url=thumbnail_url,
            org_uuid=organization.org_uuid,
            directory=f"courses/{new_course.course_uuid}/thumbnails",
            prefix="thumbnail",
            kind="image",
        )
        if thumbnail_filename:
            new_course.thumbnail_image = thumbnail_filename
            db_session.add(new_course)
            db_session.commit()
            db_session.refresh(new_course)
            _append_progress_log(
                temp_dir,
                message=f"Imported course thumbnail: {thumbnail_filename}",
                level="info",
                course_name=course_name,
            )

    course_video_url = _get_tutor_video_url((course_data.get("meta") or {}).get("_video"))
    if course_video_url:
        progress = _read_progress(temp_dir)
        progress.current_media_name = _basename_from_url(course_video_url, "course-overview-video")
        progress.message = f"Downloading course overview video for {course_name}"
        _write_progress(temp_dir, progress)
        course_video_filename = await _store_remote_file(
            url=course_video_url,
            org_uuid=organization.org_uuid,
            directory=f"courses/{new_course.course_uuid}/thumbnails",
            prefix="thumbnail_video",
            kind="video",
        )
        if course_video_filename:
            new_course.thumbnail_video = course_video_filename
            new_course.thumbnail_type = (
                ThumbnailType.BOTH if new_course.thumbnail_image else ThumbnailType.VIDEO
            )
            db_session.add(new_course)
            db_session.commit()
            db_session.refresh(new_course)
            _append_progress_log(
                temp_dir,
                message=f"Imported course overview video: {course_video_filename}",
                level="info",
                course_name=course_name,
            )

    author_user_id = current_user.created_by_user_id if isinstance(current_user, APITokenUser) else current_user.id
    db_session.add(
        ResourceAuthor(
            resource_uuid=new_course.course_uuid,
            user_id=author_user_id,
            authorship=ResourceAuthorshipEnum.CREATOR,
            authorship_status=ResourceAuthorshipStatusEnum.ACTIVE,
            creation_date=str(datetime.now()),
            update_date=str(datetime.now()),
        )
    )
    db_session.commit()

    for topic_index, topic in enumerate(course_data.get("contents") or []):
        chapter = Chapter(
            name=topic.get("post_title") or f"Chapter {topic_index + 1}",
            description="",
            thumbnail_image="",
            chapter_uuid=f"chapter_{uuid4()}",
            org_id=organization.id,
            course_id=new_course.id,
            creation_date=str(datetime.now()),
            update_date=str(datetime.now()),
        )
        db_session.add(chapter)
        db_session.commit()
        db_session.refresh(chapter)

        db_session.add(
            CourseChapter(
                course_id=new_course.id,
                chapter_id=chapter.id,
                org_id=organization.id,
                order=topic_index + 1,
                creation_date=str(datetime.now()),
                update_date=str(datetime.now()),
            )
        )
        db_session.commit()

        activity_order = 1

        for child in topic.get("children") or []:
            media_items = extract_downloadable_media(child)
            embeddable_media = extract_embeddable_media(child)
            inline_image_media = extract_inline_image_media(child)
            activity_name = child.get("post_title") or f"Activity {activity_order}"
            published = (child.get("post_status") == "publish") if not options.set_unpublished else False
            quiz_payload = build_tutor_quiz_payload(child)

            if quiz_payload or media_items or embeddable_media or inline_image_media or tutor_item_to_doc(
                child,
                include_downloadable_media_links=False,
                downloadable_media=media_items,
                include_embeddable_media_links=False,
                embeddable_media=embeddable_media,
            ).get("content"):
                if quiz_payload:
                    child_doc, child_details = quiz_payload
                    _append_progress_log(
                        temp_dir,
                        message="Creating graded quiz activity",
                        level="info",
                        course_name=course_name,
                        activity_name=activity_name,
                    )
                    activity = await _create_tutor_quiz_activity(
                        name=activity_name,
                        content=child_doc,
                        details=child_details,
                        course=new_course,
                        chapter=chapter,
                        organization=organization,
                        db_session=db_session,
                        order=activity_order,
                        published=published,
                    )
                else:
                    child_doc = tutor_item_to_doc(
                        child,
                        include_downloadable_media_links=False,
                        downloadable_media=media_items,
                        include_embeddable_media_links=False,
                        embeddable_media=embeddable_media,
                    )
                    if not child_doc.get("content"):
                        child_doc = {"type": "doc", "content": []}
                    _append_progress_log(
                        temp_dir,
                        message="Creating dynamic activity",
                        level="info",
                        course_name=course_name,
                        activity_name=activity_name,
                    )
                    activity = await _create_tutor_activity(
                        name=activity_name,
                        content=child_doc,
                        course=new_course,
                        chapter=chapter,
                        organization=organization,
                        db_session=db_session,
                        order=activity_order,
                        published=published,
                    )

                media_nodes: list[dict[str, Any]] = []
                for media in embeddable_media:
                    media_node = _create_embed_block_node_from_url(media)
                    if media_node:
                        media_nodes.append(media_node)
                        _append_progress_log(
                            temp_dir,
                            message=f"Embedded external media: {media.get('url')}",
                            level="info",
                            course_name=course_name,
                            activity_name=activity_name,
                        )
                for media in inline_image_media:
                    media_node = await _create_embedded_media_block_from_url(
                        media=media,
                        activity=activity,
                        course=new_course,
                        chapter=chapter,
                        organization=organization,
                        db_session=db_session,
                        temp_dir=temp_dir,
                        course_name=course_name,
                        activity_name=activity_name,
                    )
                    if media_node:
                        media_nodes.append(media_node)
                for media in media_items:
                    media_node = await _create_embedded_media_block_from_url(
                        media=media,
                        activity=activity,
                        course=new_course,
                        chapter=chapter,
                        organization=organization,
                        db_session=db_session,
                        temp_dir=temp_dir,
                        course_name=course_name,
                        activity_name=activity_name,
                    )
                    if media_node:
                        media_nodes.append(media_node)

                if media_nodes:
                    existing_content = list(activity.content.get("content", []))
                    activity.content = {
                        **activity.content,
                        "content": media_nodes + existing_content,
                    }
                    db_session.add(activity)
                    db_session.commit()

                activity_order += 1
            else:
                _append_progress_log(
                    temp_dir,
                    message="Skipped item because no supported content was detected",
                    level="warning",
                    course_name=course_name,
                    activity_name=activity_name,
                )

    increase_feature_usage("courses", organization.id, db_session)
    _append_progress_log(
        temp_dir,
        message="Finished course import",
        level="info",
        course_name=course_name,
    )
    return new_course


async def _create_tutor_activity(
    name: str,
    content: dict[str, Any],
    course: Course,
    chapter: Chapter,
    organization: Organization,
    db_session: Session,
    order: int,
    published: bool,
) -> Activity:
    activity = Activity(
        name=name,
        activity_type=ActivityTypeEnum.TYPE_DYNAMIC,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_DYNAMIC_PAGE,
        content=content,
        details={"import_source": "tutor_lms"},
        published=published,
        org_id=organization.id,
        course_id=course.id,
        activity_uuid=f"activity_{uuid4()}",
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)

    db_session.add(
        ChapterActivity(
            chapter_id=chapter.id,
            activity_id=activity.id,
            course_id=course.id,
            org_id=organization.id,
            order=order,
            creation_date=str(datetime.now()),
            update_date=str(datetime.now()),
        )
    )
    db_session.commit()
    return activity


async def _create_tutor_quiz_activity(
    name: str,
    content: dict[str, Any],
    details: dict[str, Any],
    course: Course,
    chapter: Chapter,
    organization: Organization,
    db_session: Session,
    order: int,
    published: bool,
) -> Activity:
    activity = Activity(
        name=name,
        activity_type=ActivityTypeEnum.TYPE_QUIZ,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_QUIZ_STANDARD,
        content=content,
        details=details,
        published=published,
        org_id=organization.id,
        course_id=course.id,
        activity_uuid=f"activity_{uuid4()}",
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)

    db_session.add(
        ChapterActivity(
            chapter_id=chapter.id,
            activity_id=activity.id,
            course_id=course.id,
            org_id=organization.id,
            order=order,
            creation_date=str(datetime.now()),
            update_date=str(datetime.now()),
        )
    )
    db_session.commit()
    return activity


async def _create_embedded_media_block_from_url(
    *,
    media: dict[str, str],
    activity: Activity,
    course: Course,
    chapter: Chapter,
    organization: Organization,
    db_session: Session,
    temp_dir: str,
    course_name: str,
    activity_name: str | None = None,
) -> dict[str, Any] | None:
    kind = media.get("kind")
    url = media.get("url")
    if not url or not kind:
        return None

    media_name = _basename_from_url(url, media.get("name") or kind)
    progress = _read_progress(temp_dir)
    progress.current_course_name = course_name
    progress.current_media_name = media_name
    progress.message = f"Downloading {media_name}"
    _write_progress(temp_dir, progress)

    def mark_attempt_finished(message: str) -> None:
        latest = _read_progress(temp_dir)
        latest.completed_media += 1
        latest.current_media_name = media_name
        latest.current_course_name = course_name
        latest.message = message
        _write_progress(temp_dir, latest)

    block_uuid = f"block_{uuid4()}"
    if kind == "video":
        folder_name = "videoBlock"
        prefix = "block_video"
        block_type = BlockTypeEnum.BLOCK_VIDEO
        node_type = "blockVideo"
    elif kind == "image":
        folder_name = "imageBlock"
        prefix = "block_image"
        block_type = BlockTypeEnum.BLOCK_IMAGE
        node_type = "blockImage"
    elif kind == "document":
        folder_name = "pdfBlock"
        prefix = "block_pdf"
        block_type = BlockTypeEnum.BLOCK_DOCUMENT_PDF
        node_type = "blockPDF"
    elif kind == "audio":
        folder_name = "audioBlock"
        prefix = "block_audio"
        block_type = BlockTypeEnum.BLOCK_AUDIO
        node_type = "blockAudio"
    else:
        mark_attempt_finished(f"Skipped {media_name}")
        _append_progress_log(
            temp_dir,
            message=f"Skipped unsupported media type: {media_name}",
            level="warning",
            course_name=course_name,
            activity_name=activity_name,
        )
        return None

    filename = await _store_remote_file(
        url=url,
        org_uuid=organization.org_uuid,
        directory=f"courses/{course.course_uuid}/activities/{activity.activity_uuid}/dynamic/blocks/{folder_name}/{block_uuid}",
        prefix=prefix,
        kind=kind,
    )
    if not filename:
        mark_attempt_finished(f"Skipped {media_name}")
        _append_progress_log(
            temp_dir,
            message=f"Failed to download or validate media: {media_name}",
            level="warning",
            course_name=course_name,
            activity_name=activity_name,
        )
        return None

    stem, ext = os.path.splitext(filename)
    block_content = {
        "file_id": stem,
        "file_format": ext.lstrip("."),
        "file_name": media_name,
        "file_size": 0,
        "file_type": (
            "video/quicktime" if ext.lower() == ".mov"
            else _image_file_type_from_extension(ext) if kind == "image"
            else "application/pdf" if kind == "document"
            else "audio/mpeg" if kind == "audio"
            else "video/mp4"
        ),
        "activity_uuid": activity.activity_uuid,
    }

    block = Block(
        activity_id=activity.id if activity.id else 0,
        block_type=block_type,
        content=block_content,
        org_id=organization.id,
        course_id=course.id if course.id else 0,
        chapter_id=chapter.id if chapter.id else None,
        block_uuid=block_uuid,
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )
    db_session.add(block)
    db_session.commit()
    db_session.refresh(block)

    mark_attempt_finished(f"Imported {media_name}")
    _append_progress_log(
        temp_dir,
        message=f"Imported {kind} media block: {media_name}",
        level="info",
        course_name=course_name,
        activity_name=activity_name,
    )
    return {
        "type": node_type,
        "attrs": {
            **(
                {
                    "blockObject": {
                        "block_uuid": block.block_uuid,
                        "content": block.content,
                    },
                    "size": {"width": 720},
                    "alignment": "center",
                }
                if kind == "image"
                else {
                    "blockObject": {
                        "block_uuid": block.block_uuid,
                        "content": block.content,
                        **({"size": "full"} if kind in {"video", "audio"} else {}),
                    }
                }
            )
        },
    }


async def _create_media_activity_from_url(
    *,
    media: dict[str, str],
    course: Course,
    chapter: Chapter,
    organization: Organization,
    db_session: Session,
    order: int,
    published: bool,
    temp_dir: str,
    course_name: str,
) -> Activity | None:
    kind = media.get("kind")
    url = media.get("url")
    if not kind or not url:
        return None

    activity_uuid = f"activity_{uuid4()}"
    media_name = _basename_from_url(url, media.get("name") or "media")
    progress = _read_progress(temp_dir)
    progress.current_course_name = course_name
    progress.current_media_name = media_name
    progress.message = f"Downloading {media_name}"
    _write_progress(temp_dir, progress)

    def mark_attempt_finished(message: str) -> None:
        latest = _read_progress(temp_dir)
        latest.completed_media += 1
        latest.current_media_name = media_name
        latest.current_course_name = course_name
        latest.message = message
        _write_progress(temp_dir, latest)

    if kind == "video":
        filename = await _store_remote_file(
            url=url,
            org_uuid=organization.org_uuid,
            directory=f"courses/{course.course_uuid}/activities/{activity_uuid}/video",
            prefix="video",
            kind="video",
        )
        if not filename:
            mark_attempt_finished(f"Skipped {media_name}")
            return None
        activity_type = ActivityTypeEnum.TYPE_VIDEO
        activity_sub_type = ActivitySubTypeEnum.SUBTYPE_VIDEO_HOSTED
        content = {"filename": filename, "activity_uuid": activity_uuid}
        title_suffix = "Video"
    elif kind == "document":
        filename = await _store_remote_file(
            url=url,
            org_uuid=organization.org_uuid,
            directory=f"courses/{course.course_uuid}/activities/{activity_uuid}/documentpdf",
            prefix="documentpdf",
            kind="document",
        )
        if not filename:
            mark_attempt_finished(f"Skipped {media_name}")
            return None
        activity_type = ActivityTypeEnum.TYPE_DOCUMENT
        activity_sub_type = ActivitySubTypeEnum.SUBTYPE_DOCUMENT_PDF
        content = {"filename": filename, "activity_uuid": activity_uuid}
        title_suffix = "Document"
    else:
        mark_attempt_finished(f"Skipped {media_name}")
        return None

    activity = Activity(
        name=f"{media.get('name') or 'Imported Media'} {title_suffix}",
        activity_type=activity_type,
        activity_sub_type=activity_sub_type,
        content=content,
        details={"import_source": "tutor_lms", "source_url": url},
        published=published,
        org_id=organization.id,
        course_id=course.id,
        activity_uuid=activity_uuid,
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)

    db_session.add(
        ChapterActivity(
            chapter_id=chapter.id,
            activity_id=activity.id,
            course_id=course.id,
            org_id=organization.id,
            order=order,
            creation_date=str(datetime.now()),
            update_date=str(datetime.now()),
        )
    )
    db_session.commit()
    mark_attempt_finished(f"Imported {media_name}")
    return activity
