"""Connect: chats, finding people by @handle, and blocking and reporting."""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.core.events.database import get_db_session
from src.db.conversations import ChatMessageCreate, ChatReportCreate, ConnectSettingsUpdate, DirectChatOpen
from src.db.users import PublicUser
from src.security.auth import get_authenticated_user
from src.services.connect import chats, people, profile, workspace

router = APIRouter()
DB = Depends(get_db_session)
USER = Depends(get_authenticated_user)


@router.get("/chats")
async def list_chats(current_user: PublicUser = USER, db_session: Session = DB):
    return chats.list_chats(db_session, current_user)


@router.get("/counts")
async def chat_counts(current_user: PublicUser = USER, db_session: Session = DB):
    return chats.counts(db_session, current_user)


@router.post("/chats/direct")
async def open_direct_chat(payload: DirectChatOpen, current_user: PublicUser = USER, db_session: Session = DB):
    return chats.open_direct(db_session, current_user, payload)


@router.get("/chats/{conversation_uuid}")
async def get_chat(conversation_uuid: str, before: str | None = None, goal_uuid: str | None = None, step_uuid: str | None = None, current_user: PublicUser = USER, db_session: Session = DB):
    return chats.get_chat(db_session, current_user, conversation_uuid, before, goal_uuid, step_uuid)


@router.get("/goals/{goal_uuid}/chat")
async def goal_chat(goal_uuid: str, current_user: PublicUser = USER, db_session: Session = DB):
    return workspace.goal_chat(db_session, current_user, goal_uuid)


@router.post("/chats/{conversation_uuid}/messages")
async def send_message(conversation_uuid: str, payload: ChatMessageCreate, current_user: PublicUser = USER, db_session: Session = DB):
    return chats.send(db_session, current_user, conversation_uuid, payload.body)


@router.post("/chats/{conversation_uuid}/read")
async def mark_chat_read(conversation_uuid: str, current_user: PublicUser = USER, db_session: Session = DB):
    return chats.mark_read(db_session, current_user, conversation_uuid)


@router.post("/chats/{conversation_uuid}/accept")
async def accept_chat(conversation_uuid: str, current_user: PublicUser = USER, db_session: Session = DB):
    return chats.accept(db_session, current_user, conversation_uuid)


@router.post("/chats/{conversation_uuid}/decline")
async def decline_chat(conversation_uuid: str, current_user: PublicUser = USER, db_session: Session = DB):
    return chats.decline(db_session, current_user, conversation_uuid)


@router.post("/chats/{conversation_uuid}/block")
async def block_chat(conversation_uuid: str, current_user: PublicUser = USER, db_session: Session = DB):
    return chats.block(db_session, current_user, conversation_uuid)


@router.post("/chats/{conversation_uuid}/report")
async def report_chat(conversation_uuid: str, payload: ChatReportCreate, current_user: PublicUser = USER, db_session: Session = DB):
    return chats.report(db_session, current_user, conversation_uuid, payload)


@router.get("/blocked")
async def list_blocked(current_user: PublicUser = USER, db_session: Session = DB):
    return chats.list_blocked(db_session, current_user)


@router.delete("/blocked/{user_uuid}")
async def unblock(user_uuid: str, current_user: PublicUser = USER, db_session: Session = DB):
    return chats.unblock(db_session, current_user, user_uuid)


@router.get("/search")
async def search_people(q: str = "", current_user: PublicUser = USER, db_session: Session = DB):
    return people.search(db_session, current_user, q)


@router.get("/people/{username}")
async def person_profile(username: str, current_user: PublicUser = USER, db_session: Session = DB):
    return profile.profile(db_session, current_user, username)


@router.get("/settings")
async def get_settings(current_user: PublicUser = USER, db_session: Session = DB):
    return people.get_settings(db_session, current_user)


@router.put("/settings")
async def update_settings(payload: ConnectSettingsUpdate, current_user: PublicUser = USER, db_session: Session = DB):
    return people.update_settings(db_session, current_user, payload.discoverable)
