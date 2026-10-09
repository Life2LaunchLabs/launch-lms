"""Shared identifiers and variable-safety rules for learning badges."""

LEARNING_SYSTEM_TYPE_ONBOARDING = "onboarding"
ONBOARDING_COLLECTION_UUID = "badge_collection_system_onboarding"
ONBOARDING_BADGE_UUID = "badge_system_onboarding"
ONBOARDING_ACTIVITY_UUID = "learning_activity_system_onboarding_intro"
ONBOARDING_NAME_PAGE_UUID = "learning_page_system_onboarding_name"
ONBOARDING_GOAL_PAGE_UUID = "learning_page_system_onboarding_goal"
LAUNCH_READY_ACTIVITY_UUIDS = {
    "identity": ONBOARDING_ACTIVITY_UUID,
    "profile": "learning_activity_system_onboarding_profile",
    "timeline": "learning_activity_system_onboarding_timeline",
    "project": "learning_activity_system_onboarding_project",
    "traits": "learning_activity_system_onboarding_traits",
    "links": "learning_activity_system_onboarding_links",
    "badges": "learning_activity_system_onboarding_badges",
    "launch": "learning_activity_system_onboarding_launch",
}
LEGACY_LAUNCH_READY_ACTIVITY_UUIDS = {
    "learning_activity_system_onboarding_theme",
}
LAUNCH_READY_DEFAULT_IMAGES = {
    key: f"/images/launch-ready/{key}.png" for key in LAUNCH_READY_ACTIVITY_UUIDS
}
LAUNCH_READY_DEFAULT_IMAGES["badges"] = "/images/launch-ready/traits.png"

_SYSTEM_FIELDS = {"protected", "system_type"}
_SAFE_CORE_VARIABLE_TARGETS = {"user.first_name", "user.last_name", "user.bio"}
_SAFE_IMAGE_VARIABLE_TARGETS = {"user.avatar_image"}
_SAFE_PORTFOLIO_VARIABLE_TARGETS = {
    "user.portfolio.display_name": "display_name",
    "user.portfolio.headline": "headline",
    "user.portfolio.short_bio": "short_bio",
    "user.portfolio.location_label": "location_label",
}
_SAFE_VARIABLE_PREFIXES = (
    "user.profile.onboarding.",
    "user.details.variables.",
    "user.details.onboarding.",
)
_BLOCKED_VARIABLE_SEGMENTS = {
    "",
    "id",
    "user_id",
    "user_uuid",
    "uuid",
    "password",
    "hashed_password",
    "roles",
    "role",
    "role_id",
    "is_superadmin",
    "superadmin",
    "permissions",
}
