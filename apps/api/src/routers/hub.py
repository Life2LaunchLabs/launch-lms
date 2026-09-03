from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.hub_advisor import (
    AdvisorMessage,
    AdvisorProviderLimited,
    AdvisorUnavailable,
    ask_hub_advisor,
)

router = APIRouter()


class HubAdvisorMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2_000)


class HubAdvisorRequest(BaseModel):
    messages: list[HubAdvisorMessage] = Field(min_length=1, max_length=12)


class HubAdvisorResponse(BaseModel):
    answer: str
    usage: dict[str, int]


@router.post("/advisor", response_model=HubAdvisorResponse)
async def create_hub_advice(
    request: Request,
    org_id: int,
    body: HubAdvisorRequest,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    try:
        result = await ask_hub_advisor(
            request,
            org_id,
            current_user.id,
            [AdvisorMessage(role=item.role, content=item.content.strip()) for item in body.messages],
            db_session,
        )
    except AdvisorProviderLimited as error:
        raise HTTPException(status_code=429, detail=str(error), headers={"Retry-After": "30"}) from None
    except AdvisorUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from None
    return HubAdvisorResponse(
        answer=result.text,
        usage={"input_tokens": result.input_tokens, "output_tokens": result.output_tokens},
    )
