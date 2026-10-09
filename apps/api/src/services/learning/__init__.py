"""Learning badges, paths, activities and the learner runtime.

Domain code lives in the submodules; this package re-exports every name so
`from src.services.learning import X` and `learning.X` keep working.
"""

from src.services.learning.constants import (  # noqa: F401
    LEARNING_SYSTEM_TYPE_ONBOARDING, ONBOARDING_COLLECTION_UUID, ONBOARDING_BADGE_UUID,
    ONBOARDING_ACTIVITY_UUID, ONBOARDING_NAME_PAGE_UUID, ONBOARDING_GOAL_PAGE_UUID,
    LAUNCH_READY_ACTIVITY_UUIDS, LEGACY_LAUNCH_READY_ACTIVITY_UUIDS, LAUNCH_READY_DEFAULT_IMAGES,
    _SYSTEM_FIELDS, _SAFE_CORE_VARIABLE_TARGETS, _SAFE_IMAGE_VARIABLE_TARGETS,
    _SAFE_PORTFOLIO_VARIABLE_TARGETS, _SAFE_VARIABLE_PREFIXES, _BLOCKED_VARIABLE_SEGMENTS,
)
from src.services.learning.access_rules import (  # noqa: F401
    _now, _clean_uuid, _actor_filters, _get_org, _get_owner_org, _strip_system_fields,
    _is_system_object, _is_locked_launch_ready_activity, _ensure_onboarding_for_owner_org,
    _get_org_config, _require_user, _require_org_admin,
)
from src.services.learning.enrollment import (  # noqa: F401
    _effective_issuing_org_id, _get_approved_issuer_authorization, _validate_issuer_selection,
    _badge_requires_manual_grading, _manual_enrollment_state, _program_cooperating_orgs,
    _program_assignment_context, _plan_objective_context, _assignment_badge_major,
    _published_badge_version_for_major, _get_badge, _version_major, _actor_run_for_badge_major,
    get_path,
)
from src.services.learning.lookups import (  # noqa: F401
    VERSIONED_BADGE_FIELDS, _badge_definition, _get_badge_version, _version_summary,
    _versioned_badge_read, _ensure_draft, _bump_version, _version_for_content,
    _assert_content_editable, _get_path_for_badge, _serialize_page, _serialize_activity,
    _get_activity, _get_page, _get_run, PUBLIC_BADGE_STATUSES, _is_publicly_visible_badge,
    _is_startable_badge, _public_badge_query, _can_read_badge, _ensure_read_badge, _latest_attempts,
)
from src.services.learning.run_navigation import (  # noqa: F401
    _question_block, _question_blocks, _flow_context, _resolved_activity_flow, _run_navigation,
    _block_scoring, _block_completion, _serialize_run,
)
from src.services.learning.answer_validation import (  # noqa: F401
    _as_int, _as_float, _word_count, _normalize_mcq_answer, _normalize_text_answer,
    _validate_mcq_answer, _validate_text_answer, _validate_image_answer,
)
from src.services.learning.learner_variables import (  # noqa: F401
    _normalize_bindings, _extract_learning_variables,
    _question_variable_bindings, _target_value_type, _is_variable_value_type_compatible,
    _is_safe_variable_target, _set_nested_value, _apply_learning_variables_to_user,
)
from src.services.learning.grading import (  # noqa: F401
    _normalize_question_answers, _grade_mcq_block, _grade_text_block, _grade_image_block,
    _grade_answer, _ensure_activity_run, _activity_grading_settings, _activity_score_summary,
    _question_block_points, _activity_meets_completion_rules, _has_pending_required_manual_grades,
    _issue_award_if_complete,
)
from src.services.learning.badge_service import (  # noqa: F401
    ensure_onboarding_learning_badge, create_badge, _require_badge_creation_access,
)
from src.services.learning.version_drafts import (  # noqa: F401
    _clone_version_graph, _version_graph_summary, _map_diff, _DEFINITION_FIELD_LABELS,
    _DEFINITION_SETTING_LABELS, _version_change_sections, list_badge_versions,
    create_badge_version_draft, update_badge_version_draft, get_badge_version_diff, _parse_semver,
    publish_badge_version, activate_badge_version, deactivate_badge_version,
    delete_badge_version_draft,
)
from src.services.learning.badge_admin import (  # noqa: F401
    update_badge, update_badge_thumbnail, create_badge_notification_signup, get_badge, list_badges,
    delete_badge, list_deleted_badges, restore_badge,
)
from src.services.learning.collection_service import (  # noqa: F401
    create_collection, update_collection, update_collection_thumbnail, delete_collection,
    list_deleted_collections, restore_collection, list_collections,
)
from src.services.learning.activity_authoring import (  # noqa: F401
    create_activity, import_activity, update_activity, delete_activity, duplicate_activity,
)
from src.services.learning.page_authoring import (  # noqa: F401
    convert_page_variants_to_flow, _validate_page_payload, _validate_page_button_destinations,
    create_page, update_page, delete_page, upload_page_media, upload_response_media,
)
from src.services.learning.variable_definitions import (  # noqa: F401
    _VARIABLE_SEGMENT_PATTERN, _validate_variable_key, _get_variable, list_learning_variables,
    create_learning_variable, update_learning_variable, delete_learning_variable,
)
from src.services.learning.runtime import (  # noqa: F401
    start_or_resume_run, complete_page, submit_response, _cooperating_org_ids_for_run,
    _cooperating_staff_ids_for_run,
)
from src.services.learning.response_review import (  # noqa: F401
    list_learning_responses, grade_learning_response,
)
from src.services.learning.award_service import (  # noqa: F401
    confer_award, build_learning_badge_class_payload, build_learning_assertion_payload,
    OPEN_BADGES_V3_CONTEXTS, build_ob3_profile, build_ob3_achievement, build_ob3_credential,
    build_award_response, get_award, list_user_awards,
)
