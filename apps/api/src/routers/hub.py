from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.resources import ResourceTypeEnum
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.hub_advisor import (
    AdvisorMessage,
    AdvisorProviderLimited,
    AdvisorUnavailable,
    ask_hub_advisor,
    advisor_resources_for_request,
)
from src.services.resources import list_resources

router = APIRouter()


class HubAdvisorMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2_000)


class HubAdvisorRequest(BaseModel):
    messages: list[HubAdvisorMessage] = Field(min_length=1, max_length=12)
    resource_uuids: list[str] = Field(default_factory=list, max_length=8)


class HubAdvisorResource(BaseModel):
    resource_uuid: str
    title: str
    description: str | None = None
    resource_type: ResourceTypeEnum
    provider_name: str | None = None
    external_url: str
    cover_image_url: str | None = None
    thumbnail_image: str | None = None
    owner_org_uuid: str | None = None
    access_mode: str
    tags: list[str]


class HubAdvisorResponse(BaseModel):
    answer: str
    usage: dict[str, int]
    resources: list[HubAdvisorResource]


@router.post("/advisor", response_model=HubAdvisorResponse)
async def create_hub_advice(
    request: Request,
    org_id: int,
    body: HubAdvisorRequest,
    current_user: PublicUser = Depends(get_current_user),
    db_session: Session = Depends(get_db_session),
):
    accessible_resources = await list_resources(
        request,
        org_id,
        current_user,
        db_session,
    )
    grounding_resources = advisor_resources_for_request(
        body.messages[-1].content,
        accessible_resources,
        body.resource_uuids,
    )
    try:
        result = await ask_hub_advisor(
            request,
            org_id,
            current_user.id,
            [AdvisorMessage(role=item.role, content=item.content.strip()) for item in body.messages],
            db_session,
            grounding_resources=grounding_resources,
        )
    except AdvisorProviderLimited as error:
        raise HTTPException(
            status_code=429,
            detail=str(error),
            headers={"Retry-After": str(error.retry_after)},
        ) from None
    except AdvisorUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from None
    return HubAdvisorResponse(
        answer=result.text,
        usage={"input_tokens": result.input_tokens, "output_tokens": result.output_tokens},
        resources=grounding_resources,
    )
