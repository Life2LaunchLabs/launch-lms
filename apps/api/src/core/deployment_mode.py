"""
Single source of truth for deployment mode detection.

Two modes:
- 'saas': hosted LearnHouse with plan-based gating
- 'core': self-hosted LearnHouse with a fixed capability set
"""

from config.config import get_learnhouse_config
from src.core.capabilities import DeploymentMode


def get_deployment_mode() -> DeploymentMode:
    if get_learnhouse_config().general_config.saas_mode:
        return "saas"
    return "core"
