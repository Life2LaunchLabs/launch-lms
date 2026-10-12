"""Variable-safety rules for learner variables written by activities."""

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
