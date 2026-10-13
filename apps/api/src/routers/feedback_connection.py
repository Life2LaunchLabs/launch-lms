"""Platform → Feedback: the live Jira connection behind tester feedback."""

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from src.core.events.database import engine
from src.db.users import PublicUser
from src.security.superadmin import require_superadmin
from src.services import feedback_configuration as jira_connection
from src.services.candidate_jira import CandidateJira
from src.services.feedback_configuration import FeedbackJiraConfigurationUpdate

router = APIRouter()


def _primary_db():
    # Platform settings live in the primary database, never a demo sandbox.
    with Session(engine) as db_session:
        yield db_session


@router.get("/feedback/connection")
def get_feedback_connection(
    db_session: Session = Depends(_primary_db),
    current_user: PublicUser = Depends(require_superadmin),
):
    return jira_connection.serialize(db_session)


@router.put("/feedback/connection")
def save_feedback_connection(
    body: FeedbackJiraConfigurationUpdate,
    db_session: Session = Depends(_primary_db),
    current_user: PublicUser = Depends(require_superadmin),
):
    return jira_connection.save(db_session, body, current_user.id)


@router.post("/feedback/connection/test")
def test_feedback_connection(
    body: FeedbackJiraConfigurationUpdate,
    db_session: Session = Depends(_primary_db),
    current_user: PublicUser = Depends(require_superadmin),
):
    """Check the form's values against Jira before saving them."""
    record = jira_connection.get_record(db_session)
    saved = (
        jira_connection.record_settings(record)
        if record
        else jira_connection.environment_settings()
    )
    token = saved["token"] if body.api_token is None else body.api_token
    client = CandidateJira(
        settings={
            "base_url": body.base_url,
            "email": body.email,
            "token": token,
            "project": body.project_key.strip().upper(),
            "issue_type": body.issue_type,
            "board_id": body.board_id,
        }
    )
    if not client.configured:
        raise HTTPException(
            status_code=422,
            detail="Fill in the Jira URL, email, API token, and project key",
        )
    project = client._request("GET", f"/rest/api/3/project/{quote(client.project)}")
    columns = client.board_columns()
    return {
        "ok": True,
        "project_name": project.get("name", client.project),
        "columns": [column["name"] for column in columns],
    }
