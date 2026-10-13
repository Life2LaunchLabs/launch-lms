from datetime import datetime

from sqlalchemy import Column, ForeignKey, Integer, Text
from sqlmodel import Field, SQLModel


class FeedbackJiraConfiguration(SQLModel, table=True):
    """Singleton connection to the Jira board that holds tester feedback.

    Edited live from Platform → Feedback; environment variables remain the
    fallback for deployments that never saved a connection here.
    """

    __tablename__ = "feedbackjiraconfiguration"

    id: int | None = Field(default=None, primary_key=True)
    enabled: bool = True
    base_url: str = Field(default="", max_length=500)
    email: str = Field(default="", max_length=320)
    api_token_ciphertext: str | None = Field(
        default=None, sa_column=Column(Text, nullable=True)
    )
    project_key: str = Field(default="", max_length=50)
    issue_type: str = Field(default="Task", max_length=100)
    board_id: str = Field(default="", max_length=50)
    updated_by_user_id: int | None = Field(
        default=None,
        sa_column=Column(
            Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True
        ),
    )
    updated_at: datetime = Field(default_factory=datetime.utcnow)
