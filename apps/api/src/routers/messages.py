from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session
from src.core.events.database import get_db_session
from src.db.messages import InboxMessageResponse
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services import messages as messages_service

router = APIRouter()


@router.get("/me")
async def list_my_messages(
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return messages_service.list_my_messages(current_user, db_session)


@router.post("/me/viewed")
async def mark_my_messages_viewed(
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    return messages_service.mark_my_messages_viewed(current_user, db_session)


@router.post("/me/{message_uuid}/respond")
async def respond_to_message(
    request: Request,
    message_uuid: str,
    payload: InboxMessageResponse,
    current_user: PublicUser = Depends(get_authenticated_user),
    db_session: Session = Depends(get_db_session),
):
    message = messages_service.get_my_message(message_uuid, current_user, db_session)
    if message.action_status != "pending" or not message.action_kind:
        raise HTTPException(status_code=409, detail="This message no longer needs a response")
    action_data = message.action_data or {}

    if message.action_kind == "organization_invitation":
        from src.services.orgs.join import JoinOrg, join_org
        from src.services.orgs.users import (
            decline_my_organization_invitation,
            get_my_pending_invitation,
        )

        invitation_uuid = str(action_data.get("invitation_uuid") or "")
        invitation = get_my_pending_invitation(invitation_uuid, current_user, db_session)
        if payload.accept:
            result = await join_org(
                request,
                JoinOrg(
                    org_id=invitation.org_id,
                    user_id=current_user.id,
                    invitation_token=invitation.invitation_uuid,
                ),
                current_user,
                db_session,
            )
        else:
            result = decline_my_organization_invitation(
                request, invitation_uuid, current_user, db_session
            )
    elif message.action_kind == "plan_invitation":
        from src.services.planning import respond_to_invitation

        invitation_uuid = str(action_data.get("invitation_uuid") or "")
        result = respond_to_invitation(
            db_session, current_user, invitation_uuid, payload.accept
        )
    else:
        raise HTTPException(status_code=422, detail="Unsupported message action")

    messages_service.resolve_message_action(
        message, accepted=payload.accept, db_session=db_session
    )
    return {"message_uuid": message_uuid, "action_status": message.action_status, "result": result}
