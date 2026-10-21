import pytest
from pydantic import ValidationError

from src.db.organization_config import DarkLogoConfig, GeneralCustomization


def test_one_logo_serves_both_themes_by_default():
    general = GeneralCustomization()
    assert general.separate_dark_logo is False and general.dark_logo_image == ""


@pytest.mark.parametrize("image", ["", "https://cdn.example.org/logo-dark.png", "/content/orgs/o/logos/dark.png", "logo_dark.png", "  logo.png  "])
def test_dark_logo_accepts_media_urls_and_file_names(image):
    assert DarkLogoConfig(separate_dark_logo=True, dark_logo_image=image).dark_logo_image == image.strip()


@pytest.mark.parametrize("image", ["javascript:alert(1)", "data:image/svg+xml,<svg/>", "//evil.test/logo.png"])
def test_dark_logo_rejects_links_that_are_not_images(image):
    with pytest.raises(ValidationError):
        DarkLogoConfig(separate_dark_logo=True, dark_logo_image=image)
