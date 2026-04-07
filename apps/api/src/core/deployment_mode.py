"""
Single source of truth for deployment mode detection.

Two modes:
- 'saas': hosted Launch LMS with plan-based gating
- 'core': self-hosted Launch LMS with a fixed capability set
"""

from config.config import get_launchlms_config
from src.core.capabilities import DeploymentMode


def get_deployment_mode() -> DeploymentMode:
    if get_launchlms_config().general_config.saas_mode:
        return "saas"
    return "core"
