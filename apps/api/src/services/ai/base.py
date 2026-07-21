from google import genai

from config.config import get_launchlms_config


def get_gemini_client():
    """Return the configured Gemini client used by standalone AI tools."""
    api_key = getattr(get_launchlms_config().ai_config, "gemini_api_key", None)
    if not api_key:
        raise RuntimeError("Gemini API key not configured")
    return genai.Client(api_key=api_key)
