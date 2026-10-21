"""
What each tier includes, and what partner programs and requests grant.

The single definition of org access. `org_access()` reads it; nothing else
compares tiers or reads an org's tier from its config.

Tiers sell scale and structure: Free for one person helping a few learners,
Full for an organization running programs with groups and several staff,
Enterprise for institutions at scale. Publishing to other people's Discover
is never part of a tier: an org applies for a partner program and a
superadmin approves it.
"""

from dataclasses import dataclass
from typing import Literal

Tier = Literal["free", "full", "enterprise"]

TIERS: tuple[Tier, ...] = ("free", "full", "enterprise")

TIER_LABELS: dict[str, str] = {"free": "Free", "full": "Full", "enterprise": "Enterprise"}

# A Free org can try Full once, for this long. When it ends nothing is deleted: what it made with
# Full features stays readable, and it can't add more until it's under Free's limits or upgraded.
TRIAL_TIER: Tier = "full"
TRIAL_DAYS = 30

# Counted limits per tier. 0 means unlimited.
LIMITS: dict[str, dict[str, int]] = {
    "learners": {"free": 25, "full": 200, "enterprise": 0},
    "staff_seats": {"free": 2, "full": 12, "enterprise": 0},
    "invite_batch": {"free": 10, "full": 100, "enterprise": 500},
    "invite_daily": {"free": 25, "full": 500, "enterprise": 5000},
    "join_links": {"free": 2, "full": 25, "enterprise": 100},
}

LIMIT_LABELS: dict[str, str] = {
    "learners": "active learners",
    "staff_seats": "staff seats",
    "invite_batch": "invitations per batch",
    "invite_daily": "invitations per day",
    "join_links": "active join links",
}


@dataclass(frozen=True)
class PartnerProgram:
    key: str
    label: str
    description: str


PARTNER_PROGRAMS: dict[str, PartnerProgram] = {
    program.key: program
    for program in (
        PartnerProgram(
            "badge_publisher",
            "Verified badge publisher",
            "List your badges in learners' Discover and authorize other organizations to issue them.",
        ),
        PartnerProgram(
            "plan_publisher",
            "Plan publisher",
            "List your plan templates in Discover and the shared library.",
        ),
        PartnerProgram(
            "resource_partner",
            "Resource partner",
            "Publish resources other organizations and learners can discover.",
        ),
    )
}


@dataclass(frozen=True)
class Feature:
    key: str
    label: str
    # Lowest tier that includes it.
    tier: Tier | None = None
    # Partner program that grants it.
    partner: str | None = None
    # Granted only on request, by a superadmin.
    on_request: bool = False
    # Switched off for everyone and awaiting removal.
    off: bool = False


FEATURES: dict[str, Feature] = {
    feature.key: feature
    for feature in (
        Feature("groups", "Groups", tier="full"),
        Feature("bulk_invites", "Bulk invites", tier="full"),
        Feature("advanced_reports", "Advanced reporting", tier="enterprise"),
        Feature("sso", "Single sign-on", tier="enterprise"),
        Feature("audit_logs", "Audit logs", tier="enterprise"),
        Feature("api_tokens", "API tokens", tier="enterprise"),
        Feature("payments", "Payments", on_request=True),
        Feature("badge_publishing", "Badge publishing", partner="badge_publisher"),
        Feature("plan_publishing", "Plan publishing", partner="plan_publisher"),
        Feature("resource_publishing", "Resource publishing", partner="resource_partner"),
        # Legacy: off for everyone, removed on the pruning branch.
        Feature("ai", "AI features", off=True),
        Feature("boards", "Boards", off=True),
        Feature("playgrounds", "Playgrounds", off=True),
        Feature("podcasts", "Podcasts", off=True),
        Feature("communities", "Communities", off=True),
        Feature("scorm", "SCORM", off=True),
        Feature("custom_domains", "Custom domains", off=True),
        Feature("custom_roles", "Custom roles", off=True),
    )
}


def tier_index(tier: str) -> int:
    return TIERS.index(tier) if tier in TIERS else 0
