from types import SimpleNamespace

from src.db.organizations import Organization
from src.services.shared_content import can_access_shared_resource, owner_org_payload


def _org(org_id: int, slug: str, name: str) -> Organization:
    return Organization(
        id=org_id,
        org_uuid=f"org_{org_id}",
        name=name,
        description=None,
        about=None,
        socials={},
        links={},
        scripts={},
        logo_image=None,
        thumbnail_image=None,
        previews={},
        explore=False,
        label=None,
        slug=slug,
        email=f"{slug}@example.com",
        creation_date="2026-01-01T00:00:00",
        update_date="2026-01-01T00:00:00",
    )


def test_can_access_shared_resource_requires_authenticated_user() -> None:
    resource = SimpleNamespace(shared=True, published=True)

    assert can_access_shared_resource(resource, is_authenticated=False) is False
    assert can_access_shared_resource(resource, is_authenticated=True) is True


def test_can_access_shared_resource_respects_published_requirement() -> None:
    unpublished_resource = SimpleNamespace(shared=True, published=False)

    assert (
        can_access_shared_resource(
            unpublished_resource,
            is_authenticated=True,
            require_published=True,
        )
        is False
    )


def test_can_access_shared_resource_rejects_non_shared_content() -> None:
    resource = SimpleNamespace(shared=False, published=True)

    assert can_access_shared_resource(resource, is_authenticated=True) is False


def test_owner_org_payload_marks_cross_org_content() -> None:
    owner_org = _org(2, "new-org", "New Org")

    payload = owner_org_payload(owner_org, current_org_id=1)

    assert payload == {
        "owner_org_id": 2,
        "owner_org_uuid": "org_2",
        "owner_org_slug": "new-org",
        "owner_org_name": "New Org",
        "is_shared_from_other_org": True,
    }


def test_owner_org_payload_marks_local_content() -> None:
    owner_org = _org(1, "default", "Default Org")

    payload = owner_org_payload(owner_org, current_org_id=1)

    assert payload["is_shared_from_other_org"] is False
