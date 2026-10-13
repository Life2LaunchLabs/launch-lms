"""Editorial Discover settings stored in the organization's existing JSON config."""
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, field_validator, model_validator


def safe_presentation_url(value: str) -> str:
    value = value.strip()
    if not value:
        return value
    if any(ord(char) < 32 for char in value) or "\\" in value:
        raise ValueError("Use a relative path or an HTTP(S) URL")
    if value.startswith("/") and not value.startswith("//"):
        return value
    parsed = urlsplit(value)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError("Use a relative path or an HTTP(S) URL")
    return value


class DiscoverSlide(BaseModel):
    kind: Literal["badge", "collection", "link", "challenges"]
    target: str = Field(min_length=1, max_length=2048)
    title: str = Field(default="", max_length=160)
    description: str = Field(default="", max_length=500)
    eyebrow: str = Field(default="", max_length=80)
    action_label: str = Field(default="", max_length=60)
    image_url: str = Field(default="", max_length=2048)
    thumbnail_url: str = Field(default="", max_length=2048)
    theme: Literal["blue", "dark", "light"] = "dark"

    @field_validator("image_url", "thumbnail_url")
    @classmethod
    def validate_images(cls, value: str) -> str:
        return safe_presentation_url(value)

    @model_validator(mode="after")
    def validate_destination(self):
        if self.kind == "link":
            self.target = safe_presentation_url(self.target)
            if not self.target:
                raise ValueError("Custom slides need a destination")
            if not self.title.strip():
                raise ValueError("Custom slides need a title")
        elif self.kind == "challenges" and self.target != "challenges":
            raise ValueError("Choose the challenges announcement")
        elif not all(char.isalnum() or char in "_-" for char in self.target):
            raise ValueError("Choose a badge or collection identifier")
        return self


class DiscoverSettings(BaseModel):
    enabled: bool = True
    mode: Literal["automatic", "curated"] = "automatic"
    slides: list[DiscoverSlide] = Field(default_factory=list, max_length=6)

    @model_validator(mode="after")
    def unique_destinations(self):
        targets = [(slide.kind, slide.target) for slide in self.slides]
        if len(targets) != len(set(targets)):
            raise ValueError("Each featured destination can appear only once")
        return self
