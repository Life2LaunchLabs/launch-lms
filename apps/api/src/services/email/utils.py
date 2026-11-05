import logging
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from urllib.parse import urlparse

import resend
from config.config import get_launchlms_config
from fastapi import Request
from pydantic import EmailStr

logger = logging.getLogger(__name__)


def _is_allowed_base_url(url: str) -> bool:
    """Validate that a URL is an allowed origin for email links."""
    config = get_launchlms_config()
    allowed_origins = config.hosting_config.allowed_origins

    # Check against configured allowed origins
    url_stripped = url.rstrip("/")
    for allowed in allowed_origins:
        if url_stripped == allowed.rstrip("/"):
            return True

    # Check against allowed_regexp if configured
    import re
    allowed_regexp = config.hosting_config.allowed_regexp
    if allowed_regexp:
        try:
            if re.match(allowed_regexp, url_stripped):
                return True
        except re.error:
            pass

    # In development mode, allow localhost
    if config.general_config.development_mode:
        parsed = urlparse(url_stripped)
        if parsed.hostname in ("localhost", "127.0.0.1"):
            return True

    return False


def get_base_url_from_request(request: Request) -> str:
    """
    Extract the base URL from a FastAPI request.

    Uses the Origin or Referer header to determine the frontend URL,
    but validates against allowed origins to prevent open redirect.

    Args:
        request: FastAPI Request object

    Returns:
        Base URL string (e.g., "https://myorg.example.com")
    """
    # Try Origin header first
    origin = request.headers.get("origin")
    if origin:
        candidate = origin.rstrip("/")
        if _is_allowed_base_url(candidate):
            return candidate
        logger.warning("Rejected untrusted Origin header for email URL: %s", candidate)

    # Try Referer header as fallback
    referer = request.headers.get("referer")
    if referer:
        parsed = urlparse(referer)
        candidate = f"{parsed.scheme}://{parsed.netloc}"
        if _is_allowed_base_url(candidate):
            return candidate
        logger.warning("Rejected untrusted Referer header for email URL: %s", candidate)

    # Fall back to configured frontend_domain (preferred over raw request URL
    # which would point to the API server, not the frontend)
    config = get_launchlms_config()
    frontend_domain = config.hosting_config.frontend_domain
    if frontend_domain:
        scheme = "https" if config.hosting_config.ssl else "http"
        return f"{scheme}://{frontend_domain}"

    # Last resort: construct from request URL
    return f"{request.url.scheme}://{request.url.netloc}"


class EmailDeliveryError(Exception):
    """An email the provider did not take, with a reason an admin can act on (``reason``)."""

    def __init__(self, reason: str, *, retryable: bool = False):
        super().__init__(reason)
        self.reason = reason
        self.retryable = retryable


# Resend answers a burst over its per-second limit with 429 rate_limit_exceeded, and has the odd
# 5xx or dropped connection: those pass on a short wait. Quotas, a bad key or an unverified domain don't.
_RESEND_RETRY_WAITS = (1.0, 2.5)


def _resend_failure(exc: Exception) -> EmailDeliveryError:
    if isinstance(exc, resend.exceptions.ResendError):
        kind = str(getattr(exc, "error_type", "") or "")
        code = str(getattr(exc, "code", "") or "")
        message = str(getattr(exc, "message", "") or exc)
        lowered = message.lower()
        if kind in ("daily_quota_exceeded", "monthly_quota_exceeded"):
            period = "daily" if kind.startswith("daily") else "monthly"
            return EmailDeliveryError(f"The app's {period} email limit is used up, so the email wasn't sent. Raise the limit with the email provider (Resend) or try again later.")
        if kind == "rate_limit_exceeded":
            return EmailDeliveryError("The email provider was busy (too many emails at once). Try again in a minute.", retryable=True)
        if kind in ("missing_api_key", "invalid_api_key") or code in ("401", "403") and "key" in lowered:
            return EmailDeliveryError("Email isn't set up on this server: the email provider's API key is missing or wrong.")
        if "testing emails" in lowered or "verify a domain" in lowered or "domain is not verified" in lowered:
            return EmailDeliveryError("The email provider only sends to the account owner until the sending domain is verified in Resend.")
        if code.startswith("5") or kind == "application_error":
            return EmailDeliveryError("The email provider had a problem. Try again in a minute.", retryable=True)
        return EmailDeliveryError(f"The email provider didn't accept it: {message}")
    # The SDK turns a dropped or timed-out connection into a RuntimeError ("Request failed: ...").
    return EmailDeliveryError("Couldn't reach the email provider. Try again in a minute.", retryable=True)


def send_email(to: EmailStr, subject: str, body: str, *, idempotency_key: str | None = None):
    """Send one email. Raises EmailDeliveryError (with ``reason``) when it can't be delivered.

    This blocks (network calls, and short waits between retries): from an async route, call it
    through ``run_in_threadpool``. ``idempotency_key`` lets a retry never send the same email twice.
    """
    from src.services.demo.context import current_demo
    if current_demo.get():
        # Do not deliver live messages from a visitor copy.
        return {"id": None, "demo": True, "delivered": False}
    lh_config = get_launchlms_config()
    mailing = lh_config.mailing_config
    sender = f"Launch LMS <{mailing.system_email_address}>"

    if mailing.email_provider == "smtp":
        try:
            return _send_email_smtp(sender, to, subject, body, mailing)
        except Exception as exc:
            logger.exception("SMTP send to %s failed", to)
            raise EmailDeliveryError(f"The mail server didn't accept it: {exc}") from exc
    else:
        return _send_email_resend(sender, to, subject, body, mailing, idempotency_key=idempotency_key)


def _send_email_resend(sender: str, to: EmailStr, subject: str, body: str, mailing, *, idempotency_key: str | None = None):
    if not mailing.resend_api_key:
        raise EmailDeliveryError("Email isn't set up on this server: the email provider's API key is missing.")
    resend.api_key = mailing.resend_api_key
    params = {"from": sender, "to": [str(to)], "subject": subject, "html": body}
    options = {"idempotency_key": idempotency_key} if idempotency_key else None
    for attempt in range(len(_RESEND_RETRY_WAITS) + 1):
        try:
            return resend.Emails.send(params, options) if options else resend.Emails.send(params)
        except Exception as exc:
            failure = _resend_failure(exc)
            if not failure.retryable or attempt == len(_RESEND_RETRY_WAITS):
                logger.warning("Resend send to %s failed after %d attempt(s): %r", to, attempt + 1, exc)
                raise failure from exc
            logger.info("Resend send to %s failed (%r); retrying", to, exc)
            time.sleep(_RESEND_RETRY_WAITS[attempt])


def _send_email_smtp(sender: str, to: EmailStr, subject: str, body: str, mailing):
    msg = MIMEMultipart("alternative")
    msg["From"] = sender
    msg["To"] = str(to)
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "html"))

    if mailing.smtp_use_tls:
        server = smtplib.SMTP(mailing.smtp_host, mailing.smtp_port)
        server.starttls()
    else:
        server = smtplib.SMTP(mailing.smtp_host, mailing.smtp_port)

    if mailing.smtp_username and mailing.smtp_password:
        server.login(mailing.smtp_username, mailing.smtp_password)

    server.sendmail(mailing.system_email_address, str(to), msg.as_string())
    server.quit()

    return {"id": None, "to": str(to)}

