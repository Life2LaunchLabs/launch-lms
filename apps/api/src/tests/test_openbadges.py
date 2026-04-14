from starlette.requests import Request

from src.db.courses.certifications import CertificateUser, Certifications
from src.db.courses.courses import Course
from src.db.organizations import Organization
from src.db.organization_config import OrganizationConfig
from src.db.users import User
from src.services.courses.openbadges import (
    build_assertion_payload,
    build_badge_class_payload,
    build_issuer_payload,
)


def _request() -> Request:
    return Request({
        "type": "http",
        "headers": [(b"origin", b"http://localhost:3000")],
        "scheme": "http",
        "server": ("localhost", 8000),
        "path": "/",
        "query_string": b"",
    })


def _org() -> Organization:
    return Organization(
        id=1,
        org_uuid="org_123",
        name="Wayne Academy",
        description="Issuer for course badges",
        about=None,
        socials={},
        links={},
        scripts={},
        logo_image="logo.png",
        thumbnail_image=None,
        previews={},
        explore=False,
        label=None,
        slug="wayne",
        email="issuer@example.com",
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )


def _org_config() -> OrganizationConfig:
    return OrganizationConfig(
        id=1,
        org_id=1,
        config={
            "config_version": "2.0",
            "customization": {
                "badge_issuer": {
                    "name": "Wayne Credentials",
                    "url": "https://credentials.example.com",
                    "email": "badges@example.com",
                    "description": "Open badge issuer",
                    "image_url": "https://cdn.example.com/badge-issuer.png",
                }
            }
        },
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )


def _course() -> Course:
    return Course(
        id=10,
        org_id=1,
        course_uuid="course_123",
        name="Advanced JavaScript",
        description="A course about modern JavaScript",
        about=None,
        learnings=None,
        tags=None,
        thumbnail_type="image",
        thumbnail_image="course.png",
        thumbnail_video="",
        public=True,
        guest_access=False,
        published=True,
        open_to_contributors=False,
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
        seo=None,
    )


def _certification() -> Certifications:
    return Certifications(
        id=20,
        course_id=10,
        certification_uuid="certification_123",
        config={
            "badge_name": "Advanced JavaScript Badge",
            "badge_description": "Awarded for completing the Advanced JavaScript course",
            "badge_criteria_text": "Finish every activity in the course.",
            "badge_criteria_url": "https://example.com/criteria",
            "badge_image_url": "https://example.com/badge.png",
            "badge_support_url": "https://example.com/support",
            "badge_theme": "tech",
            "certification_type": "completion",
        },
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )


def _user() -> User:
    return User(
        id=30,
        user_uuid="user_1234",
        username="learner",
        email="learner@example.com",
        first_name="Test",
        last_name="Learner",
        password="secret",
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )


def _certificate_user() -> CertificateUser:
    return CertificateUser(
        id=40,
        user_id=30,
        certification_id=20,
        user_certification_uuid="AB-20260409-1234-001",
        created_at="2026-04-09T12:00:00",
        updated_at="2026-04-09T12:00:00",
    )


def test_build_issuer_payload_uses_org_badge_issuer_config():
    payload = build_issuer_payload(_request(), _org(), _org_config())

    assert payload["type"] == "Issuer"
    assert payload["name"] == "Wayne Credentials"
    assert payload["url"] == "https://credentials.example.com"
    assert payload["email"] == "badges@example.com"
    assert payload["image"] == "https://cdn.example.com/badge-issuer.png"


def test_build_badge_class_payload_contains_open_badges_fields():
    payload = build_badge_class_payload(_request(), _org(), _course(), _certification(), _org_config())

    assert payload["@context"] == "https://w3id.org/openbadges/v2"
    assert payload["type"] == "BadgeClass"
    assert payload["name"] == "Advanced JavaScript Badge"
    assert payload["criteria"]["id"] == "https://example.com/criteria"
    assert payload["criteria"]["narrative"] == "Finish every activity in the course."
    assert payload["extensions:supportUrl"] == "https://example.com/support"


def test_build_assertion_payload_hashes_email_recipient():
    payload = build_assertion_payload(
        _request(),
        _org(),
        _course(),
        _certification(),
        _certificate_user(),
        _user(),
        _org_config(),
    )

    assert payload["@context"] == "https://w3id.org/openbadges/v2"
    assert payload["type"] == "Assertion"
    assert payload["recipient"]["type"] == "email"
    assert payload["recipient"]["hashed"] is True
    assert payload["recipient"]["identity"].startswith("sha256$")
    assert payload["badge"].endswith("/certifications/badge-class/course/course_123")
