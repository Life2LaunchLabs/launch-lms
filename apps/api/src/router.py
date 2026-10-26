from fastapi import APIRouter, Depends
from src.routers import analytics as analytics_router_module
from src.routers import (
    api_tokens,
    auth,
    auth_handoff,
    candidate_feedback,
    feedback_connection,
    code_execution,
    connect,
    dev,
    discover,
    demo,
    assignments as assignments_router,
    goal_admin,
    goal_helper_requests,
    goal_coach_notes,
    goal_launch,
    goal_story,
    goal_home,
    goal_requirements,
    goal_reports,
    goal_sharing,
    goal_templates,
    goals,
    demo_guide,
    health,
    hub,
    hub_launch,
    hub_next,
    hub_questions,
    instance,
    media,
    messages,
    news,
    onboarding,
    orgs,
    operations_surface,
    plan_collections,
    plans,
    portfolio,
    portfolio_people,
    school,
    requirement_frameworks,
    roles,
    search,
    usergroups,
    users,
)
from src.routers import learning as learning_router_module
from src.routers import badges as badges_router_module
from src.routers import learning_documents as learning_documents_router_module
from src.routers import oauth as oauth_router_module
from src.routers import mcp as mcp_router_module
from src.routers import marketplace as marketplace_router_module
from src.routers import plan_joining as plan_joining_router_module
from src.routers import payments as payments_router_module
from src.routers import resource_library as resource_library_router_module
from src.routers import resources as resources_router_module
from src.routers import sso as sso_router_module
from src.routers import trending as trending_router_module
from src.routers.audit_logs import router as audit_logs_router
from src.routers.orgs import branding as org_branding
from src.routers.plan_requests import router as plan_requests_router
from src.routers.superadmin import router as superadmin_router
from src.routers.coach_admin import router as coach_admin_router
from src.routers.coach_reports import router as coach_reports_router
from src.routers.utils import router as utils_router
from src.security.api_token_utils import require_non_api_token_user
from src.security.auth import get_current_user
from src.security.access.access import require_feature
from src.services.dev.dev import isDevModeEnabledOrRaise

v1_router = APIRouter(prefix="/api/v1")
v1_router.include_router(demo.router, prefix="/demo", tags=["demo"])
v1_router.include_router(demo_guide.router, prefix="/demo", tags=["demo"])

# Helper dependency to reject API token access
async def get_non_api_token_user(user = Depends(get_current_user)):
    """Dependency that rejects API token access."""
    return await require_non_api_token_user(user)

# API Routes
v1_router.include_router(
    users.router,
    prefix="/users",
    tags=["users"],
    dependencies=[Depends(get_non_api_token_user)]
)
v1_router.include_router(
    usergroups.router,
    prefix="/usergroups",
    tags=["usergroups"],
    dependencies=[Depends(require_feature("groups", read_when_lapsed=True))]
)
# Fixed paths under /goals (home, invitations) register before /goals/{goal_uuid}.
for module in (goal_home, goal_sharing, goal_coach_notes, goal_launch, goal_story):
    v1_router.include_router(module.router, prefix="/goals", tags=["goals"], dependencies=[Depends(get_non_api_token_user)])
for module in (goal_admin, goal_requirements, goal_reports, goal_helper_requests):
    v1_router.include_router(module.router, prefix="/goal-admin", tags=["goals"], dependencies=[Depends(get_non_api_token_user)])
v1_router.include_router(assignments_router.router, prefix="/plan-assignments", tags=["assignments"], dependencies=[Depends(get_non_api_token_user)])
v1_router.include_router(
    goals.router,
    prefix="/goals",
    tags=["goals"],
    dependencies=[Depends(get_non_api_token_user)],
)
v1_router.include_router(
    goal_templates.router,
    prefix="/goal-templates",
    tags=["goals"],
    dependencies=[Depends(get_non_api_token_user)],
)
v1_router.include_router(
    plan_collections.router,
    prefix="/plan-collections",
    tags=["goals"],
    dependencies=[Depends(get_non_api_token_user)],
)
v1_router.include_router(onboarding.router, prefix="/onboarding", tags=["onboarding"])
v1_router.include_router(
    discover.router,
    prefix="/discover",
    tags=["goals"],
    dependencies=[Depends(get_non_api_token_user)],
)
v1_router.include_router(
    requirement_frameworks.router,
    prefix="/requirement-frameworks",
    tags=["requirements"],
    dependencies=[Depends(get_non_api_token_user)],
)
v1_router.include_router(auth.router, prefix="/auth", tags=["auth"])
v1_router.include_router(auth_handoff.router, prefix="/auth", tags=["auth"])
v1_router.include_router(
    operations_surface.router,
    prefix="/operations",
    tags=["operations-surface"],
    dependencies=[Depends(get_non_api_token_user)],
)
v1_router.include_router(
    candidate_feedback.router,
    prefix="/candidate",
    tags=["candidate-feedback"],
    dependencies=[Depends(get_non_api_token_user)],
)
v1_router.include_router(
    feedback_connection.router,
    prefix="/candidate",
    tags=["candidate-feedback"],
    dependencies=[Depends(get_non_api_token_user)],
)
v1_router.include_router(
    hub.router,
    prefix="/hub",
    tags=["hub"],
    dependencies=[Depends(get_non_api_token_user)],
)
v1_router.include_router(
    hub_launch.router,
    prefix="/hub",
    tags=["hub"],
    dependencies=[Depends(get_non_api_token_user)],
)
v1_router.include_router(
    coach_reports_router,
    prefix="/hub",
    tags=["hub"],
    dependencies=[Depends(get_non_api_token_user)],
)
v1_router.include_router(
    hub_next.router,
    prefix="/hub",
    tags=["hub"],
    dependencies=[Depends(get_non_api_token_user)],
)
v1_router.include_router(
    hub_questions.router,
    prefix="/hub",
    tags=["hub"],
    dependencies=[Depends(get_non_api_token_user)],
)
v1_router.include_router(
    orgs.router,
    prefix="/orgs",
    tags=["orgs"],
    dependencies=[Depends(get_non_api_token_user)]
)
v1_router.include_router(
    org_branding.router,
    prefix="/orgs",
    tags=["orgs"],
    dependencies=[Depends(get_non_api_token_user)]
)
v1_router.include_router(
    roles.router,
    prefix="/roles",
    tags=["roles"],
    dependencies=[Depends(get_non_api_token_user)]
)
v1_router.include_router(
    api_tokens.router,
    prefix="/orgs",
    tags=["api-tokens"],
    dependencies=[Depends(get_non_api_token_user), Depends(require_feature("api_tokens"))]
)
v1_router.include_router(search.router, prefix="/search", tags=["search"])
v1_router.include_router(learning_router_module.activities_router, prefix="/learning-activities", tags=["learning-activities"])
v1_router.include_router(learning_router_module.pages_router, prefix="/learning-pages", tags=["learning-pages"])
v1_router.include_router(learning_router_module.runs_router, prefix="/learning-runs", tags=["learning-runs"])
v1_router.include_router(learning_router_module.responses_router, prefix="/learning-responses", tags=["learning-responses"])
v1_router.include_router(badges_router_module.router, prefix="/badge-awards", tags=["badges"])
v1_router.include_router(learning_router_module.variables_router, prefix="/learning-variables", tags=["learning-variables"])
v1_router.include_router(learning_documents_router_module.router, prefix="/learning-documents", tags=["learning-documents"])
v1_router.include_router(learning_documents_router_module.previews_router, prefix="/learning-previews", tags=["learning-previews"])
v1_router.include_router(learning_documents_router_module.content_router, prefix="/learning-content", tags=["learning-content"])
v1_router.include_router(oauth_router_module.router, prefix="/oauth", tags=["oauth"])
v1_router.include_router(mcp_router_module.router, prefix="/mcp", tags=["mcp"])
v1_router.include_router(marketplace_router_module.router, prefix="/plan-marketplace", tags=["plan-marketplace"])
v1_router.include_router(plan_joining_router_module.router, prefix="/plan-joining", tags=["goals"])
v1_router.include_router(
    resources_router_module.router,
    prefix="/resources",
    tags=["resources"],
)
v1_router.include_router(resource_library_router_module.router, prefix="/resources", tags=["resources"])
v1_router.include_router(
    media.router,
    prefix="/media",
    tags=["media"],
    dependencies=[Depends(get_non_api_token_user)]
)
v1_router.include_router(
    connect.router,
    prefix="/connect",
    tags=["connect"],
    dependencies=[Depends(get_non_api_token_user)],
)
v1_router.include_router(
    messages.router,
    prefix="/messages",
    tags=["messages"],
    dependencies=[Depends(get_non_api_token_user)],
)
v1_router.include_router(
    school.router,
    prefix="/school",
    tags=["school"],
    dependencies=[Depends(get_non_api_token_user)],
)
v1_router.include_router(
    portfolio_people.router,
    prefix="/portfolio",
    tags=["portfolio"],
    dependencies=[Depends(get_non_api_token_user)],
)
v1_router.include_router(
    portfolio.router,
    prefix="/portfolio",
    tags=["portfolio"],
    dependencies=[Depends(get_non_api_token_user)],
)
v1_router.include_router(
    portfolio.public_router,
    prefix="/public/portfolio",
    tags=["public-portfolio"],
)
v1_router.include_router(
    news.router,
    prefix="/news",
    tags=["news"]
)
v1_router.include_router(
    analytics_router_module.router,
    prefix="/analytics",
    tags=["analytics"],
    dependencies=[Depends(get_non_api_token_user)],
)

v1_router.include_router(
    code_execution.router,
    prefix="/code",
    tags=["code-execution"],
    dependencies=[Depends(get_non_api_token_user)],
)

# Trending feed (public, optional auth)
v1_router.include_router(trending_router_module.router, tags=["trending"])

# Instance info (public, no auth)
v1_router.include_router(instance.router, prefix="/instance", tags=["instance"])

# Tiers and partner programs (public, no auth)
v1_router.include_router(plans.router, prefix="/plans", tags=["plans"])

v1_router.include_router(
    audit_logs_router,
    prefix="/audit_logs",
    tags=["audit-logs"],
    dependencies=[Depends(get_non_api_token_user), Depends(require_feature("audit_logs"))],
)

v1_router.include_router(
    superadmin_router,
    prefix="/superadmin",
    tags=["superadmin"],
    dependencies=[Depends(get_non_api_token_user)],
)

v1_router.include_router(
    coach_admin_router,
    prefix="/superadmin/coach",
    tags=["superadmin"],
    dependencies=[Depends(get_non_api_token_user)],
)

v1_router.include_router(
    plan_requests_router,
    tags=["plan-requests"],
    dependencies=[Depends(get_non_api_token_user)],
)

v1_router.include_router(
    health.router,
    prefix="/health",
    tags=["health"],
    dependencies=[Depends(get_non_api_token_user)]
)

# Dev Routes
v1_router.include_router(
    dev.router,
    prefix="/dev",
    tags=["dev"],
    dependencies=[Depends(isDevModeEnabledOrRaise), Depends(get_non_api_token_user)],
)

v1_router.include_router(
    utils_router,
    prefix="/utils",
    tags=["utils"],
    dependencies=[Depends(get_non_api_token_user)]
)


v1_router.include_router(
    payments_router_module.router,
    prefix="/payments",
    tags=["payments"],
    dependencies=[Depends(require_feature("payments"))],
)

# SSO - admin endpoints require authentication, auth endpoints are public
v1_router.include_router(
    sso_router_module.router,
    prefix="/auth/sso",
    tags=["sso", "auth"],
)
