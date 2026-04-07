import uvicorn
import sentry_sdk
from fastapi import FastAPI
from config.config import LaunchLMSConfig, get_launchlms_config
from src.core.events.events import shutdown_app, startup_app
from src.router import v1_router
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from src.core.audit_middleware import log_request_audit_event
from src.routers.content_files import router as content_files_router
from src.routers.local_content import router as local_content_router


########################
# Version 1.0.0
########################

# Get Launch LMS Config
launchlms_config: LaunchLMSConfig = get_launchlms_config()

# Initialize Sentry if configured
if launchlms_config.general_config.sentry_config.dsn:
    sentry_sdk.init(
        dsn=launchlms_config.general_config.sentry_config.dsn,
        environment=launchlms_config.general_config.env,
        send_default_pii=False,
        enable_logs=True,
        traces_sample_rate=1.0 if launchlms_config.general_config.development_mode else 0.1,
        profile_session_sample_rate=1.0 if launchlms_config.general_config.development_mode else 0.1,
        profile_lifecycle="trace",
    )

# Global Config
app = FastAPI(
    title=launchlms_config.site_name,
    description=launchlms_config.site_description,
    docs_url="/docs" if launchlms_config.general_config.development_mode else None,
    redoc_url="/redoc" if launchlms_config.general_config.development_mode else None,
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=launchlms_config.hosting_config.allowed_regexp,
    allow_methods=["*"],
    allow_credentials=True,
    allow_headers=["*"],
)

# Gzip Middleware (will add brotli later)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Events
app.add_event_handler("startup", startup_app(app))
app.add_event_handler("shutdown", shutdown_app(app))


# Static Files - use S3-aware router when S3 is enabled, otherwise serve locally
# SECURITY: Both paths use routers with access control instead of raw StaticFiles
if launchlms_config.hosting_config.content_delivery.type == "s3api":
    app.include_router(content_files_router)
else:
    app.include_router(local_content_router)

# Global Routes
app.include_router(v1_router)


@app.middleware("http")
async def audit_log_middleware(request, call_next):
    response = await call_next(request)
    try:
        await log_request_audit_event(request, response.status_code)
    except Exception:
        # Audit logs are best-effort. We do not want logging failures to break requests.
        pass
    return response


if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=launchlms_config.hosting_config.port,
        reload=launchlms_config.general_config.development_mode,
    )


# General Routes
@app.get("/")
async def root():
    return {"Message": "Welcome to Launch LMS ✨"}
