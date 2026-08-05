
from config.config import get_launchlms_config
from google import genai


def get_gemini_client() -> genai.Client | None:
    """Get Gemini client instance"""
    LH_CONFIG = get_launchlms_config()
    api_key = getattr(LH_CONFIG.ai_config, 'gemini_api_key', None)

    if not api_key:
        return None

    return genai.Client(api_key=api_key)