from datetime import datetime

from sqlalchemy import Column, Index, Text
from sqlmodel import Field, SQLModel


class ContentTranslation(SQLModel, table=True):
    """Text an organization or an outside source wrote, translated once by Coach's model and kept.

    Keyed by the text itself (its hash) and the language, so the same words anywhere reuse one
    translation, and an edited text gets a new one.
    """

    __tablename__ = "contenttranslation"
    __table_args__ = (Index("ix_contenttranslation_hash_language", "source_hash", "language", unique=True),)

    id: int | None = Field(default=None, primary_key=True)
    source_hash: str = Field(max_length=64)
    language: str = Field(max_length=8)
    source_text: str = Field(sa_column=Column(Text, nullable=False))
    translated_text: str = Field(sa_column=Column(Text, nullable=False))
    model: str = Field(default="", max_length=120)
    created_at: datetime = Field(default_factory=datetime.utcnow)
