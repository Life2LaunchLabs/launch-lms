import os
import yaml
from typing import Literal, Optional
from pydantic import BaseModel
from dotenv import load_dotenv


class CookieConfig(BaseModel):
    domain: str


class SentryConfig(BaseModel):
    dsn: str | None


class TinybirdConfig(BaseModel):
    api_url: str        # e.g., "https://api.europe-west2.gcp.tinybird.co"
    ingest_token: str   # Token with DATASOURCE:APPEND scope
    read_token: str     # Token with PIPE:READ or SQL:READ scope


class Judge0Config(BaseModel):
    api_url: str
    client_id: str | None
    client_secret: str | None


class GeneralConfig(BaseModel):
    development_mode: bool
    sentry_config: SentryConfig
    require_email_verification: bool
    env: str


class SecurityConfig(BaseModel):
    auth_jwt_secret_key: str


class AIConfig(BaseModel):
    gemini_api_key: str | None
    is_ai_enabled: bool | None


class S3ApiConfig(BaseModel):
    bucket_name: str | None
    endpoint_url: str | None


class ContentDeliveryConfig(BaseModel):
    type: Literal["filesystem", "s3api"]
    s3api: S3ApiConfig


class HostingConfig(BaseModel):
    domain: str
    frontend_domain: str
    ssl: bool
    port: int
    use_default_org: bool
    allowed_origins: list
    allowed_regexp: str
    self_hosted: bool
    cookie_config: CookieConfig
    content_delivery: ContentDeliveryConfig


class MailingConfig(BaseModel):
    email_provider: Literal["resend", "smtp"]
    system_email_address: str
    resend_api_key: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_use_tls: Optional[bool] = True


class DatabaseConfig(BaseModel):
    sql_connection_string: Optional[str]


class RedisConfig(BaseModel):
    redis_connection_string: Optional[str]


class InternalStripeConfig(BaseModel):
    stripe_secret_key: str | None
    stripe_publishable_key: str | None
    stripe_webhook_standard_secret: str | None
    stripe_webhook_connect_secret: str | None
    stripe_client_id: str | None


class InternalPaymentsConfig(BaseModel):
    stripe: InternalStripeConfig


class LaunchLMSConfig(BaseModel):
    site_name: str
    site_description: str
    contact_email: str
    general_config: GeneralConfig
    hosting_config: HostingConfig
    database_config: DatabaseConfig
    redis_config: RedisConfig
    security_config: SecurityConfig
    ai_config: AIConfig
    mailing_config: MailingConfig
    payments_config: InternalPaymentsConfig
    tinybird_config: TinybirdConfig | None
    judge0_config: Judge0Config | None


def get_launchlms_config() -> LaunchLMSConfig:

    load_dotenv()

    # Get the YAML file
    yaml_path = os.path.join(os.path.dirname(__file__), "config.yaml")

    # Load the YAML file
    with open(yaml_path, "r") as f:
        yaml_config = yaml.safe_load(f)
    
    # Ensure yaml_config is not None (defensive programming)
    if yaml_config is None:
        yaml_config = {}

    # General Config

    # Development Mode
    env_development_mode_str = os.environ.get("LAUNCHLMS_DEVELOPMENT_MODE", "None")
    if env_development_mode_str != "None":
        env_development_mode = env_development_mode_str.lower() in ("true", "1", "yes")
    else:
        env_development_mode = None
    development_mode = (
        env_development_mode
        if env_development_mode is not None
        else yaml_config.get("general", {}).get("development_mode")
    )

    # Sentry config
    env_sentry_dsn = os.environ.get("LAUNCHLMS_SENTRY_DSN")
    sentry_dsn = env_sentry_dsn or yaml_config.get("general", {}).get("sentry_dsn")

    # Environment (dev or prod)
    launchlms_env = os.environ.get("LAUNCHLMS_ENV", "dev")

    # Email verification requirement (disabled by default)
    env_require_email_verification = os.environ.get("LAUNCHLMS_REQUIRE_EMAIL_VERIFICATION", "None")
    require_email_verification = (
        env_require_email_verification.lower() in ("true", "1", "yes")
        if env_require_email_verification != "None"
        else yaml_config.get("general", {}).get("require_email_verification", False)
    )

    # Security Config
    env_auth_jwt_secret_key = os.environ.get("LAUNCHLMS_AUTH_JWT_SECRET_KEY")
    auth_jwt_secret_key = env_auth_jwt_secret_key or yaml_config.get(
        "security", {}
    ).get("auth_jwt_secret_key")

    # SECURITY: Validate JWT secret key exists and has sufficient entropy
    if not auth_jwt_secret_key:
        raise ValueError(
            "SECURITY ERROR: LAUNCHLMS_AUTH_JWT_SECRET_KEY must be set. "
            "Generate a secure key with: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
        )
    if len(auth_jwt_secret_key) < 32:
        raise ValueError(
            "SECURITY ERROR: LAUNCHLMS_AUTH_JWT_SECRET_KEY must be at least 32 characters. "
            "Current length: {}. Generate a secure key with: python -c \"import secrets; print(secrets.token_urlsafe(32))\"".format(
                len(auth_jwt_secret_key)
            )
        )

    # Check if environment variables are defined
    env_site_name = os.environ.get("LAUNCHLMS_SITE_NAME")
    env_site_description = os.environ.get("LAUNCHLMS_SITE_DESCRIPTION")
    env_contact_email = os.environ.get("LAUNCHLMS_CONTACT_EMAIL")
    env_domain = os.environ.get("LAUNCHLMS_DOMAIN")
    os.environ.get("LAUNCHLMS_PORT")
    env_ssl = os.environ.get("LAUNCHLMS_SSL")
    env_port = os.environ.get("LAUNCHLMS_PORT")
    env_use_default_org = os.environ.get("LAUNCHLMS_USE_DEFAULT_ORG")
    env_allowed_origins = os.environ.get("LAUNCHLMS_ALLOWED_ORIGINS")
    env_cookie_domain = os.environ.get("LAUNCHLMS_COOKIE_DOMAIN")
    env_frontend_domain = os.environ.get("LAUNCHLMS_FRONTEND_DOMAIN")

    # Allowed origins should be a comma separated string
    if env_allowed_origins:
        env_allowed_origins = env_allowed_origins.split(",")
    env_allowed_regexp = os.environ.get("LAUNCHLMS_ALLOWED_REGEXP")
    env_self_hosted = os.environ.get("LAUNCHLMS_SELF_HOSTED")
    env_sql_connection_string = os.environ.get("LAUNCHLMS_SQL_CONNECTION_STRING")

    

    # Fill in values with YAML file if they are not provided
    site_name = env_site_name or yaml_config.get("site_name")
    site_description = env_site_description or yaml_config.get("site_description")
    contact_email = env_contact_email or yaml_config.get("contact_email")

    domain = env_domain or yaml_config.get("hosting_config", {}).get("domain")
    ssl = env_ssl or yaml_config.get("hosting_config", {}).get("ssl")
    port = env_port or yaml_config.get("hosting_config", {}).get("port")
    use_default_org = env_use_default_org or yaml_config.get("hosting_config", {}).get(
        "use_default_org"
    )
    allowed_origins = env_allowed_origins or yaml_config.get("hosting_config", {}).get(
        "allowed_origins"
    )
    allowed_regexp = env_allowed_regexp or yaml_config.get("hosting_config", {}).get(
        "allowed_regexp"
    )
    self_hosted = env_self_hosted or yaml_config.get("hosting_config", {}).get(
        "self_hosted"
    )

    cookies_domain = env_cookie_domain or yaml_config.get("hosting_config", {}).get(
        "cookies_config", {}
    ).get("domain")
    cookie_config = CookieConfig(domain=cookies_domain)

    frontend_domain = env_frontend_domain or yaml_config.get("hosting_config", {}).get(
        "frontend_domain", "localhost:3000"
    )

    env_content_delivery_type = os.environ.get("LAUNCHLMS_CONTENT_DELIVERY_TYPE")
    content_delivery_type: str = env_content_delivery_type or (
        (yaml_config.get("hosting_config", {}).get("content_delivery", {}).get("type"))
        or "filesystem"
    )  # default to filesystem

    env_bucket_name = os.environ.get("LAUNCHLMS_S3_API_BUCKET_NAME")
    env_endpoint_url = os.environ.get("LAUNCHLMS_S3_API_ENDPOINT_URL")
    bucket_name = (
        yaml_config.get("hosting_config", {})
        .get("content_delivery", {})
        .get("s3api", {})
        .get("bucket_name")
    ) or env_bucket_name
    endpoint_url = (
        yaml_config.get("hosting_config", {})
        .get("content_delivery", {})
        .get("s3api", {})
        .get("endpoint_url")
    ) or env_endpoint_url

    content_delivery = ContentDeliveryConfig(
        type=content_delivery_type,  # type: ignore
        s3api=S3ApiConfig(bucket_name=bucket_name, endpoint_url=endpoint_url),  # type: ignore
    )

    # Database config
    sql_connection_string = env_sql_connection_string or yaml_config.get(
        "database_config", {}
    ).get("sql_connection_string")

    # AI Config
    env_gemini_api_key = os.environ.get("LAUNCHLMS_GEMINI_API_KEY")
    env_is_ai_enabled_str = os.environ.get("LAUNCHLMS_IS_AI_ENABLED")

    gemini_api_key = env_gemini_api_key or yaml_config.get("ai_config", {}).get(
        "gemini_api_key"
    )
    
    # Parse is_ai_enabled from env or yaml
    if env_is_ai_enabled_str:
        is_ai_enabled = env_is_ai_enabled_str.lower() in ("true", "1", "yes")
    else:
        is_ai_enabled = yaml_config.get("ai_config", {}).get("is_ai_enabled", False)

    # Redis config
    env_redis_connection_string = os.environ.get("LAUNCHLMS_REDIS_CONNECTION_STRING")
    redis_connection_string = env_redis_connection_string or yaml_config.get(
        "redis_config", {}
    ).get("redis_connection_string")

    # Mailing config
    env_email_provider = os.environ.get("LAUNCHLMS_EMAIL_PROVIDER")
    env_resend_api_key = os.environ.get("LAUNCHLMS_RESEND_API_KEY")
    env_system_email_address = os.environ.get("LAUNCHLMS_SYSTEM_EMAIL_ADDRESS")
    env_smtp_host = os.environ.get("LAUNCHLMS_SMTP_HOST")
    env_smtp_port = os.environ.get("LAUNCHLMS_SMTP_PORT")
    env_smtp_username = os.environ.get("LAUNCHLMS_SMTP_USERNAME")
    env_smtp_password = os.environ.get("LAUNCHLMS_SMTP_PASSWORD")
    env_smtp_use_tls = os.environ.get("LAUNCHLMS_SMTP_USE_TLS")

    email_provider = env_email_provider or yaml_config.get("mailing_config", {}).get(
        "email_provider", "resend"
    )
    resend_api_key = env_resend_api_key or yaml_config.get("mailing_config", {}).get(
        "resend_api_key"
    )
    system_email_address = env_system_email_address or yaml_config.get(
        "mailing_config", {}
    ).get("system_email_address")
    smtp_host = env_smtp_host or yaml_config.get("mailing_config", {}).get("smtp_host")
    smtp_port = int(env_smtp_port) if env_smtp_port else yaml_config.get("mailing_config", {}).get("smtp_port", 587)
    smtp_username = env_smtp_username or yaml_config.get("mailing_config", {}).get("smtp_username")
    smtp_password = env_smtp_password or yaml_config.get("mailing_config", {}).get("smtp_password")
    smtp_use_tls = (
        env_smtp_use_tls.lower() in ("true", "1", "yes") if env_smtp_use_tls
        else yaml_config.get("mailing_config", {}).get("smtp_use_tls", True)
    )

    # Tinybird config — auto-enabled when API URL is set
    env_tinybird_api_url = os.environ.get("LAUNCHLMS_TINYBIRD_API_URL")
    env_tinybird_ingest_token = os.environ.get("LAUNCHLMS_TINYBIRD_INGEST_TOKEN")
    env_tinybird_read_token = os.environ.get("LAUNCHLMS_TINYBIRD_READ_TOKEN")

    tinybird_api_url = env_tinybird_api_url or yaml_config.get("tinybird_config", {}).get("api_url", "")
    tinybird_ingest_token = env_tinybird_ingest_token or yaml_config.get("tinybird_config", {}).get("ingest_token", "")
    tinybird_read_token = env_tinybird_read_token or yaml_config.get("tinybird_config", {}).get("read_token", "")

    tinybird_config = None
    if tinybird_api_url:
        tinybird_config = TinybirdConfig(
            api_url=tinybird_api_url.rstrip("/"),
            ingest_token=tinybird_ingest_token,
            read_token=tinybird_read_token,
        )

    # Judge0 config — auto-enabled when API URL is set
    env_judge0_api_url = os.environ.get("LAUNCHLMS_JUDGE0_API_URL")
    env_judge0_client_id = os.environ.get("LAUNCHLMS_JUDGE0_CLIENT_ID")
    env_judge0_client_secret = os.environ.get("LAUNCHLMS_JUDGE0_CLIENT_SECRET")

    judge0_api_url = env_judge0_api_url or yaml_config.get("judge0_config", {}).get("api_url", "")
    judge0_client_id = env_judge0_client_id or yaml_config.get("judge0_config", {}).get("client_id")
    judge0_client_secret = env_judge0_client_secret or yaml_config.get("judge0_config", {}).get("client_secret")

    judge0_config = None
    if judge0_api_url:
        judge0_config = Judge0Config(
            api_url=judge0_api_url.rstrip("/"),
            client_id=judge0_client_id,
            client_secret=judge0_client_secret,
        )

    # Payments config
    env_stripe_secret_key = os.environ.get("LAUNCHLMS_STRIPE_SECRET_KEY")
    env_stripe_publishable_key = os.environ.get("LAUNCHLMS_STRIPE_PUBLISHABLE_KEY")
    env_stripe_webhook_standard_secret = os.environ.get("LAUNCHLMS_STRIPE_WEBHOOK_STANDARD_SECRET")
    env_stripe_webhook_connect_secret = os.environ.get("LAUNCHLMS_STRIPE_WEBHOOK_CONNECT_SECRET")
    env_stripe_client_id = os.environ.get("LAUNCHLMS_STRIPE_CLIENT_ID")
    
    stripe_secret_key = env_stripe_secret_key or yaml_config.get("payments_config", {}).get(
        "stripe", {}
    ).get("stripe_secret_key")
    
    stripe_publishable_key = env_stripe_publishable_key or yaml_config.get("payments_config", {}).get(
        "stripe", {}
    ).get("stripe_publishable_key")

    stripe_webhook_standard_secret = env_stripe_webhook_standard_secret or yaml_config.get("payments_config", {}).get(
        "stripe", {}
    ).get("stripe_webhook_standard_secret")

    stripe_webhook_connect_secret = env_stripe_webhook_connect_secret or yaml_config.get("payments_config", {}).get(
        "stripe", {}
    ).get("stripe_webhook_connect_secret")

    stripe_client_id = env_stripe_client_id or yaml_config.get("payments_config", {}).get(
        "stripe", {}
    ).get("stripe_client_id")

    # Create HostingConfig and DatabaseConfig objects
    hosting_config = HostingConfig(
        domain=domain,
        frontend_domain=frontend_domain,
        ssl=bool(ssl),
        port=int(port),
        use_default_org=bool(use_default_org),
        allowed_origins=list(allowed_origins),
        allowed_regexp=allowed_regexp,
        self_hosted=bool(self_hosted),
        cookie_config=cookie_config,
        content_delivery=content_delivery,
    )
    database_config = DatabaseConfig(
        sql_connection_string=sql_connection_string,
    )

    # AI Config
    ai_config = AIConfig(
        gemini_api_key=gemini_api_key,
        is_ai_enabled=bool(is_ai_enabled),
    )

    # Create LaunchLMSConfig object
    config = LaunchLMSConfig(
        site_name=site_name,
        site_description=site_description,
        contact_email=contact_email,
        general_config=GeneralConfig(
            development_mode=bool(development_mode),
            sentry_config=SentryConfig(dsn=sentry_dsn),
            require_email_verification=bool(require_email_verification),
            env=launchlms_env,
        ),
        hosting_config=hosting_config,
        database_config=database_config,
        security_config=SecurityConfig(auth_jwt_secret_key=auth_jwt_secret_key),
        ai_config=ai_config,
        redis_config=RedisConfig(redis_connection_string=redis_connection_string),
        mailing_config=MailingConfig(
            email_provider=email_provider,
            system_email_address=system_email_address,
            resend_api_key=resend_api_key,
            smtp_host=smtp_host,
            smtp_port=smtp_port,
            smtp_username=smtp_username,
            smtp_password=smtp_password,
            smtp_use_tls=smtp_use_tls,
        ),
        payments_config=InternalPaymentsConfig(
            stripe=InternalStripeConfig(
                stripe_secret_key=stripe_secret_key,
                stripe_publishable_key=stripe_publishable_key,
                stripe_webhook_standard_secret=stripe_webhook_standard_secret,
                stripe_webhook_connect_secret=stripe_webhook_connect_secret,
                stripe_client_id=stripe_client_id
            )
        ),
        tinybird_config=tinybird_config,
        judge0_config=judge0_config,
    )

    return config


def get_launch_lms_config() -> LaunchLMSConfig:
    """Backward-compatible alias for older imports."""
    return get_launchlms_config()
