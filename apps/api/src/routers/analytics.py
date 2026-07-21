import csv
import io
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select
from config.config import get_launchlms_config
from src.core.events.database import get_db_session
from src.db.users import PublicUser, AnonymousUser, User
from src.db.user_organizations import UserOrganization
from src.db.roles import Role
from src.security.auth import get_current_user
from src.security.superadmin import is_user_superadmin
from src.security.features_utils.plan_check import get_org_plan
from src.security.features_utils.plans import plan_meets_requirement
import httpx
from src.services.analytics.analytics import track
from src.services.analytics.cache import get_cached_result, set_cached_result
from src.services.analytics.events import ALLOWED_FRONTEND_EVENTS
from src.services.analytics.queries import (
    ALL_QUERIES,
    DETAIL_QUERIES,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# -------------------------------------------------------------------
# Request / response models
# -------------------------------------------------------------------
class FrontendEvent(BaseModel):
    event_name: str
    org_id: int
    session_id: str = ""
    properties: dict = {}


class PlanInfoResponse(BaseModel):
    tier: str  # "core" | "advanced"
    plan: str


class AnalyticsStatusResponse(BaseModel):
    configured: bool


# Lazy singleton httpx client for Tinybird Query API
_read_client: httpx.AsyncClient | None = None


def _get_read_client() -> httpx.AsyncClient | None:
    global _read_client
    if _read_client is not None:
        return _read_client

    config = get_launchlms_config()
    tb = config.tinybird_config
    if tb is None:
        return None

    _read_client = httpx.AsyncClient(
        base_url=tb.api_url,
        headers={"Authorization": f"Bearer {tb.read_token}"},
        timeout=30.0,
    )
    return _read_client


# -------------------------------------------------------------------
# Shared Tinybird query execution with Redis caching
# -------------------------------------------------------------------
async def _execute_tinybird_query(
    query_name: str,
    sql: str,
    org_id: int,
    days: int,
    course_id: str | None = None,
    empty_response: dict | None = None,
) -> dict:
    """
    Execute a SQL query via Tinybird Query API with Redis caching.

    1. Check Redis cache for a previous result.
    2. On miss, POST SQL to Tinybird /v0/sql.
    3. Cache the response on success.
    4. Return the JSON result dict.
    """
    if empty_response is None:
        empty_response = {"data": [], "rows": 0, "meta": []}

    # --- cache check ---
    cached = get_cached_result(query_name, org_id, days, course_id)
    if cached is not None:
        return cached

    # --- Tinybird SQL API call ---
    client = _get_read_client()
    if client is None:
        raise HTTPException(status_code=503, detail="Analytics not configured")

    try:
        resp = await client.post("/v0/sql", content=sql + " FORMAT JSON")
        resp.raise_for_status()
        result = resp.json()
    except httpx.HTTPStatusError as exc:
        error_msg = exc.response.text[:500]
        logger.warning(
            "Tinybird query '%s' failed (%s): %s",
            query_name, exc.response.status_code, error_msg,
        )
        if any(s in error_msg for s in ("UNKNOWN_TABLE", "doesn't exist", "not found")):
            return empty_response
        raise HTTPException(status_code=502, detail="Analytics query failed")
    except Exception as exc:
        logger.warning("Tinybird query '%s' failed: %s", query_name, str(exc)[:500])
        raise HTTPException(status_code=502, detail="Analytics query failed")

    # Tinybird returns {"data": [...], "rows": N, "meta": [...]} — same shape as frontend expects.
    # Safety net: sanitize NaN/Inf values in the response
    rows = result.get("data", [])
    for row in rows:
        for key, val in row.items():
            if isinstance(val, float) and (val != val or val == float('inf') or val == float('-inf')):
                logger.debug("Query '%s' returned NaN/Inf for key '%s', converting to None", query_name, key)
                row[key] = None

    response = {
        "data": rows,
        "rows": result.get("rows", len(rows)),
        "meta": result.get("meta", []),
    }

    # --- cache store ---
    set_cached_result(query_name, org_id, days, response, course_id)

    return response


def _verify_org_membership(user_id: int, org_id: int, db_session: Session) -> None:
    """Verify the user is a member of the specified organization.

    Prevents cross-org data access (IDOR) by ensuring the requesting user
    actually belongs to the org whose data they are querying.
    Superadmins bypass this check (they have access to all organizations).
    """
    if is_user_superadmin(user_id, db_session):
        return

    membership = db_session.exec(
        select(UserOrganization).where(
            UserOrganization.user_id == user_id,
            UserOrganization.org_id == org_id,
        )
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")


def _verify_org_admin(user_id: int, org_id: int, db_session: Session) -> None:
    """Verify the user has admin/maintainer role or a custom role with
    organizations.action_update permission in the specific organization.

    Unlike the old 'org_x' check, this ensures admin status is scoped
    to the actual organization being accessed — not any org the user belongs to.
    Superadmins bypass this check.
    """
    if is_user_superadmin(user_id, db_session):
        return

    # Get the user's role in this specific org
    membership = db_session.exec(
        select(UserOrganization).where(
            UserOrganization.user_id == user_id,
            UserOrganization.org_id == org_id,
        )
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Admin access required for this organization")

    # Fetch the role to check permissions
    role = db_session.exec(
        select(Role).where(Role.id == membership.role_id)
    ).first()
    if not role:
        raise HTTPException(status_code=403, detail="Admin access required for this organization")

    # Check if the role has organizations.action_update permission
    if role.rights:
        rights = role.rights
        org_rights = rights.get("organizations") if isinstance(rights, dict) else getattr(rights, "organizations", None)
        if org_rights:
            has_update = org_rights.get("action_update", False) if isinstance(org_rights, dict) else getattr(org_rights, "action_update", False)
            if has_update:
                return

    raise HTTPException(status_code=403, detail="Admin access required for this organization")


def _parse_safe_params(
    org_id: int,
    request: Request,
    default_days: int,
) -> tuple[int, int]:
    """Validate and return (safe_org_id, safe_days)."""
    days_param = request.query_params.get("days", str(default_days))
    try:
        safe_org_id = int(org_id)
        safe_days = int(days_param) if days_param else default_days
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid parameter")
    return safe_org_id, safe_days


# -------------------------------------------------------------------
# GET /status — Whether analytics (Tinybird) is configured
# -------------------------------------------------------------------
@router.get("/status")
async def analytics_status(
    current_user: PublicUser | AnonymousUser = Depends(get_current_user),
):
    if isinstance(current_user, AnonymousUser):
        raise HTTPException(status_code=401, detail="Authentication required")

    config = get_launchlms_config()
    return AnalyticsStatusResponse(configured=config.tinybird_config is not None)


# -------------------------------------------------------------------
# POST /events — Frontend event proxy
# -------------------------------------------------------------------
@router.post("/events")
async def ingest_frontend_event(
    body: FrontendEvent,
    request: Request,
    current_user: PublicUser | AnonymousUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    if isinstance(current_user, AnonymousUser):
        raise HTTPException(status_code=401, detail="Authentication required")

    _verify_org_membership(current_user.id, body.org_id, db_session)

    if body.event_name not in ALLOWED_FRONTEND_EVENTS:
        raise HTTPException(status_code=400, detail="Invalid event name")

    ip = request.client.host if request.client else ""

    # Sanitize seconds_spent — cap at 4 hours, reject negatives
    properties = dict(body.properties)
    if "seconds_spent" in properties:
        try:
            seconds = float(properties["seconds_spent"])
            if seconds <= 0:
                properties.pop("seconds_spent")
            elif seconds > 14400:
                properties["seconds_spent"] = 14400
        except (ValueError, TypeError):
            properties.pop("seconds_spent")

    # Enrich all frontend events with server-side geo data from proxy headers
    country = (
        request.headers.get("cf-ipcountry")  # Cloudflare
        or request.headers.get("x-country-code")  # Custom proxy
        or ""
    )
    if country and country not in ("XX", "T1"):
        properties.setdefault("country_code", country.upper())

    await track(
        event_name=body.event_name,
        org_id=body.org_id,
        user_id=current_user.id,
        session_id=body.session_id,
        properties=properties,
        source="frontend",
        ip=ip,
    )
    return {"ok": True}


# -------------------------------------------------------------------
# GET /dashboard/detail/{query_name} — Tinybird + PostgreSQL enrichment
# -------------------------------------------------------------------
@router.get("/dashboard/detail/{query_name}")
async def query_dashboard_detail(
    query_name: str,
    org_id: int,
    request: Request,
    current_user: PublicUser | AnonymousUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    if isinstance(current_user, AnonymousUser):
        raise HTTPException(status_code=401, detail="Authentication required")

    _verify_org_membership(current_user.id, org_id, db_session)

    _verify_org_admin(current_user.id, org_id, db_session)

    if query_name not in DETAIL_QUERIES:
        raise HTTPException(status_code=404, detail="Unknown detail query")

    sql_template, default_days = DETAIL_QUERIES[query_name]
    safe_org_id, safe_days = _parse_safe_params(org_id, request, default_days)

    sql = _build_sql(sql_template, safe_org_id, safe_days)

    ch_result = await _execute_tinybird_query(
        query_name, sql, safe_org_id, safe_days,
        empty_response={"data": [], "users": {}},
    )

    ch_data = ch_result.get("data", [])

    # Enrich with user info from PostgreSQL
    user_ids = list({int(row["user_id"]) for row in ch_data if row.get("user_id")})
    users_map: dict[int, dict] = {}
    if user_ids:
        users = db_session.exec(select(User).where(User.id.in_(user_ids))).all()  # type: ignore
        users_map = {
            u.id: {
                "user_uuid": u.user_uuid,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "username": u.username,
                "email": u.email,
                "avatar_image": u.avatar_image,
            }
            for u in users
        }

    return {"data": ch_data, "users": users_map}


# -------------------------------------------------------------------
# GET /dashboard/{query_name} — Run analytics query via Tinybird
# -------------------------------------------------------------------
@router.get("/dashboard/{query_name}")
async def query_dashboard(
    query_name: str,
    org_id: int,
    request: Request,
    current_user: PublicUser | AnonymousUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    if isinstance(current_user, AnonymousUser):
        raise HTTPException(status_code=401, detail="Authentication required")

    _verify_org_membership(current_user.id, org_id, db_session)

    # Admin check
    _verify_org_admin(current_user.id, org_id, db_session)

    if query_name not in ALL_QUERIES:
        raise HTTPException(status_code=404, detail="Unknown query")


    sql_template, default_days = ALL_QUERIES[query_name]
    safe_org_id, safe_days = _parse_safe_params(org_id, request, default_days)

    sql = _build_sql(sql_template, safe_org_id, safe_days)

    result = await _execute_tinybird_query(query_name, sql, safe_org_id, safe_days)
    return result


# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------
def _build_sql(
    sql_template: str,
    org_id: int,
    days: int,
) -> str:
    """
    Build SQL from template with validated parameters.

    Tinybird SQL API does not support parameterized queries, so we must
    interpolate values. This function centralizes that interpolation and
    enforces type safety so callers cannot accidentally pass unvalidated input.
    """
    # org_id and days are already validated as int by _parse_safe_params
    if not isinstance(org_id, int) or not isinstance(days, int):
        raise HTTPException(status_code=400, detail="Invalid parameter types")

    return sql_template.format(org_id=org_id, days=days)


# -------------------------------------------------------------------
# GET /export — Export analytics data as JSON or CSV
# -------------------------------------------------------------------
@router.get("/export")
async def export_analytics(
    org_id: int,
    request: Request,
    current_user: PublicUser | AnonymousUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    if isinstance(current_user, AnonymousUser):
        raise HTTPException(status_code=401, detail="Authentication required")

    _verify_org_membership(current_user.id, org_id, db_session)

    _verify_org_admin(current_user.id, org_id, db_session)

    # Parse params
    fmt = request.query_params.get("format", "json")
    if fmt not in ("json", "csv"):
        raise HTTPException(status_code=400, detail="format must be 'json' or 'csv'")

    queries_param = request.query_params.get("queries", "")
    if not queries_param:
        raise HTTPException(status_code=400, detail="queries parameter required")

    query_names = [q.strip() for q in queries_param.split(",") if q.strip()]
    days_param = request.query_params.get("days", "30")
    try:
        safe_org_id = int(org_id)
        safe_days = int(days_param)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid parameter")

    # Determine which query registries to check
    allowed = {**ALL_QUERIES}

    # Execute requested queries
    results: dict[str, dict] = {}
    for qname in query_names:
        if qname not in allowed:
            continue
        sql_template, default_days = allowed[qname]
        d = safe_days if safe_days else default_days
        sql = _build_sql(sql_template, safe_org_id, d)
        result = await _execute_tinybird_query(qname, sql, safe_org_id, d)
        results[qname] = result

    if fmt == "json":
        return results

    # CSV format: sections separated by query name headers
    output = io.StringIO()
    for qname, result in results.items():
        rows = result.get("data", [])
        output.write(f"# {qname}\n")
        if rows:
            writer = csv.DictWriter(output, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
        output.write("\n")

    filename = f"analytics_export_{safe_org_id}_{safe_days}d.csv"
    db_session.close()
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# -------------------------------------------------------------------
# GET /plan-info — Returns analytics tier for the org
# -------------------------------------------------------------------
@router.get("/plan-info")
async def get_plan_info(
    org_id: int,
    current_user: PublicUser | AnonymousUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    if isinstance(current_user, AnonymousUser):
        raise HTTPException(status_code=401, detail="Authentication required")

    _verify_org_membership(current_user.id, org_id, db_session)

    current_plan = get_org_plan(org_id, db_session)
    tier = "advanced" if plan_meets_requirement(current_plan, "pro") else "core"
    return PlanInfoResponse(tier=tier, plan=current_plan)
