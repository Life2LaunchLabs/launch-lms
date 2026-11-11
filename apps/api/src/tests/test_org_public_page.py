"""An organization's public page: listing is opt-in, listed pages are public, unlisted ones are members-only,
and the page never shows people (no member count, no contact email)."""

import asyncio

import pytest
from fastapi import HTTPException

from src.db.organizations import Organization, PublicPageUpdate
from src.db.users import AnonymousUser
from src.services.goals import plan_access
from src.services.orgs import public_page
from src.services.orgs.orgs import get_discoverable_org_by_slug, list_discoverable_orgs
from src.tests.plan_world import _world
from src.tests.test_goals import ADMIN, LEARNER, _user

OUTSIDER = 77  # signed in, a member of nothing here


def _page(db, viewer, slug="studio"):
    return asyncio.run(get_discoverable_org_by_slug(db, viewer, slug))


def _shelf(db, viewer, query=""):
    return [org.slug for org in asyncio.run(list_discoverable_orgs(db, viewer, query=query, listed=True))]


def test_unlisted_page_is_members_only_and_shows_no_people():
    db, (plan, _) = _world()
    with db:
        member = _page(db, _user(LEARNER))
        assert member.is_member and member.listed is False and member.config is None
        assert not hasattr(member, "member_count")
        for viewer in (AnonymousUser(), _user(OUTSIDER)):
            with pytest.raises(HTTPException) as hidden:
                _page(db, viewer)
            assert hidden.value.status_code == 404
        assert _shelf(db, _user(OUTSIDER)) == []


def test_listing_needs_a_complete_page_then_it_is_public():
    db, (plan, _) = _world()
    with db:
        with pytest.raises(HTTPException) as early:
            public_page.update_public_page(db, _user(ADMIN), 1, PublicPageUpdate(listed=True))
        assert early.value.status_code == 409 and set(early.value.detail["missing"]) == {"cover", "tagline", "plan"}

        org = db.get(Organization, 1)
        org.thumbnail_image = "cover.jpg"
        db.add(org)
        plan_access.set_access(db, int(plan.id), 1, "open", None)  # type: ignore[arg-type]
        db.commit()
        saved = public_page.update_public_page(db, _user(ADMIN), 1, PublicPageUpdate(
            description="Paid summer crews", about="We build trails.", city="Medford, OR", website="https://studio.example",
            highlights=["Free", " ", "Paid"], listed=True))
        assert saved.listed and saved.plan_count == 1 and saved.badge_count == 1
        assert saved.page.highlights == ["Free", "Paid"] and saved.page.city == "Medford, OR"

        visitor = _page(db, AnonymousUser())
        assert visitor.email == "" and visitor.about == "We build trails." and not visitor.is_member
        assert _shelf(db, AnonymousUser()) == ["studio"]
        assert _shelf(db, _user(OUTSIDER), "summer") == ["studio"] and _shelf(db, _user(OUTSIDER), "nothing") == []

        # Hiding its only plan takes it off the shelf, but the page stays public.
        public_page.update_public_page(db, _user(ADMIN), 1, PublicPageUpdate(hidden_plans=[plan.template_uuid]))
        assert _shelf(db, AnonymousUser()) == [] and _page(db, AnonymousUser()).plan_count == 0


def test_only_admins_save_the_page_and_links_must_be_web_links():
    db, _ = _world()
    with db:
        with pytest.raises(HTTPException) as refused:
            public_page.update_public_page(db, _user(LEARNER), 1, PublicPageUpdate(description="Hi"))
        assert refused.value.status_code == 403
        with pytest.raises(HTTPException) as bad:
            public_page.update_public_page(db, _user(ADMIN), 1, PublicPageUpdate(website="javascript:alert(1)"))
        assert bad.value.status_code == 422
