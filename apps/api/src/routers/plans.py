from fastapi import APIRouter
from src.security.access.catalog import FEATURES, LIMIT_LABELS, LIMITS, PARTNER_PROGRAMS, TIER_LABELS, TIERS, TRIAL_DAYS, TRIAL_TIER

router = APIRouter()


@router.get("")
async def api_get_catalog():
    """
    Public endpoint: the tiers with their limits and features, and the partner programs.
    Limits of 0 are unlimited. Legacy features are left out.
    """
    features = [spec for spec in FEATURES.values() if not spec.off]
    return {
        "tiers": [
            {
                "key": tier,
                "label": TIER_LABELS[tier],
                "limits": {name: LIMITS[name][tier] for name in LIMITS},
                "features": [spec.key for spec in features if spec.tier and TIERS.index(spec.tier) <= TIERS.index(tier)],
            }
            for tier in TIERS
        ],
        "limit_labels": LIMIT_LABELS,
        "trial": {"tier": TRIAL_TIER, "days": TRIAL_DAYS},
        "features": [
            {"key": spec.key, "label": spec.label, "tier": spec.tier, "partner": spec.partner, "on_request": spec.on_request}
            for spec in features
        ],
        "partner_programs": [
            {"key": program.key, "label": program.label, "description": program.description}
            for program in PARTNER_PROGRAMS.values()
        ],
    }
