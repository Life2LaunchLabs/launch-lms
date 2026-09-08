# Analytics event name constants

# Frontend events
PAGE_VIEW = "page_view"
COURSE_VIEW = "course_view"
ACTIVITY_VIEW = "activity_view"
SEARCH_QUERY = "search_query"
RESOURCE_SEARCH_QUERY = "resource_search_query"
RESOURCE_SEARCH_OPENED = "resource_search_opened"
TIME_ON_ACTIVITY = "time_on_activity"

# API events
COURSE_ENROLLED = "course_enrolled"
COURSE_COMPLETED = "course_completed"
ACTIVITY_COMPLETED = "activity_completed"
ASSIGNMENT_SUBMITTED = "assignment_submitted"
USER_SIGNED_UP = "user_signed_up"
CERTIFICATE_CLAIMED = "certificate_claimed"
DISCUSSION_POSTED = "discussion_posted"
RESOURCE_OPENED = "resource_opened"
RESOURCE_SAVED = "resource_saved"

# Allowed frontend event names (whitelist for the proxy endpoint)
ALLOWED_FRONTEND_EVENTS = {
    PAGE_VIEW,
    COURSE_VIEW,
    ACTIVITY_VIEW,
    SEARCH_QUERY,
    RESOURCE_SEARCH_OPENED,
    TIME_ON_ACTIVITY,
}
