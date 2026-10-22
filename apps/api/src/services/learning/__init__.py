"""Badges (the credential), collections, awards, and the activity runtime.

Activities are the content of plan template activity steps; learners play them
in runs on their plan steps. Domain code lives in the submodules; this package
re-exports the names other modules use as `learning.X`.
"""

from src.services.learning.access_rules import (  # noqa: F401
    _now, _clean_uuid, _get_org, _get_org_config, _require_user, _require_org_admin, _require_org_staff,
)
from src.services.learning.lookups import (  # noqa: F401
    VERSIONED_BADGE_FIELDS, _badge_definition, _get_badge, _get_badge_version, _version_summary,
    _versioned_badge_read, _ensure_draft, _bump_version, _require_activity_editor, _ensure_editable, _is_system_activity,
    _serialize_page, _serialize_activity, _get_activity, _get_page, _get_run, PUBLIC_BADGE_STATUSES,
    _is_publicly_visible_badge, _public_badge_query, _can_read_badge, _ensure_read_badge, _latest_attempts,
)
from src.services.learning.run_navigation import (  # noqa: F401
    _question_block, _question_blocks, _flow_context, _resolved_activity_flow, _run_navigation, _serialize_run,
)
from src.services.learning.answer_validation import _as_float  # noqa: F401
from src.services.learning.learner_variables import (  # noqa: F401
    _extract_learning_variables, _apply_learning_variables_to_user,
)
from src.services.learning.grading import (  # noqa: F401
    _grade_answer, _activity_grading_settings, _activity_score_summary,
    _question_block_points, _activity_meets_completion_rules, _has_pending_required_manual_grades,
)
from src.services.learning.badge_service import create_badge, _require_badge_creation_access  # noqa: F401
from src.services.learning.version_drafts import (  # noqa: F401
    list_badge_versions, create_badge_version_draft, update_badge_version_draft, get_badge_version_diff,
    publish_badge_version, activate_badge_version, deactivate_badge_version, delete_badge_version_draft,
)
from src.services.learning.badge_admin import (  # noqa: F401
    update_badge, get_badge, list_badges, delete_badge, list_deleted_badges, restore_badge,
)
from src.services.learning.collection_service import (  # noqa: F401
    create_collection, update_collection, update_collection_thumbnail, delete_collection,
    list_deleted_collections, restore_collection, list_collections,
)
from src.services.learning.activity_authoring import update_activity  # noqa: F401
from src.services.learning.page_authoring import (  # noqa: F401
    _validate_page_payload, _validate_page_button_destinations, create_page, update_page, delete_page, upload_page_media,
)
from src.services.learning.variable_definitions import (  # noqa: F401
    list_learning_variables, create_learning_variable, update_learning_variable, delete_learning_variable,
)
from src.services.learning.runtime import complete_page, submit_response  # noqa: F401
from src.services.learning.response_review import list_learning_responses, grade_learning_response  # noqa: F401
from src.services.learning.award_service import (  # noqa: F401
    confer_award, build_learning_badge_class_payload, build_learning_assertion_payload,
    OPEN_BADGES_V3_CONTEXTS, build_ob3_profile, build_ob3_achievement, build_ob3_credential,
    build_award_response, get_award, list_user_awards,
)
