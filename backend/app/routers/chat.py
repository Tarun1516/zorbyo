# pyright: reportImplicitRelativeImport=false, reportGeneralTypeIssues=false, reportAttributeAccessIssue=false, reportMissingTypeArgument=false, reportArgumentType=false
# pyright: reportImplicitRelativeImport=false, reportGeneralTypeIssues=false, reportAttributeAccessIssue=false, reportMissingTypeArgument=false
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import uuid

from app.core.database import get_db
from app.models.models import (
    ChatChannel,
    ChatMessage,
    User,
    ConnectionRequest,
    Connection,
    MessageDeliveryStatus,
)
from app.schemas.schemas import (
    ConnectionRequestCreate,
    ConnectionRequestResponse,
    ConnectionResponse,
    MessageDeliveryResponse,
)

router = APIRouter()


# In-memory online presence tracker (user_id -> last_seen_at)
# NOTE: Non-persistent by design. Replace with Redis for multi-instance deployments.
ONLINE_USERS: dict[str, datetime] = {}


def is_user_online(user_id: str) -> bool:
    return user_id in ONLINE_USERS


def resolve_delivery_status_for_sender(statuses: List[MessageDeliveryStatus]) -> str:
    """Resolve tick state for sender's perspective."""
    if not statuses:
        return "sent"
    if all(s.read for s in statuses):
        return "read"
    if all(s.delivered for s in statuses):
        return "delivered"
    return "sent"


async def _are_users_connected(
    db: AsyncSession, user_a_id: str, user_b_id: str
) -> bool:
    """Check if two users are connected (bi-directional)."""
    if user_a_id == user_b_id:
        return False

    result = await db.execute(
        select(Connection).where(
            or_(
                and_(
                    Connection.user1_id == user_a_id, Connection.user2_id == user_b_id
                ),
                and_(
                    Connection.user1_id == user_b_id, Connection.user2_id == user_a_id
                ),
            )
        )
    )
    return result.scalar_one_or_none() is not None


# Schemas
class ChannelCreate(BaseModel):
    name: str
    type: str  # direct, group, community
    members: List[str] = []
    description: Optional[str] = None


class ChannelResponse(BaseModel):
    id: str
    name: str
    type: str
    description: Optional[str] = None
    created_at: datetime
    last_message: Optional[str] = None
    unread_count: int = 0
    members: List[str] = []

    class Config:
        from_attributes = True


class MessageCreate(BaseModel):
    content: str
    message_type: str = "text"


class MessageResponse(BaseModel):
    id: str
    channel_id: str
    sender_id: str
    sender_name: Optional[str] = None
    content: str
    message_type: str
    sent_at: datetime
    delivery_status: Optional[str] = None  # sent, delivered, read

    class Config:
        from_attributes = True


class UserPresenceResponse(BaseModel):
    user_id: str
    online: bool
    last_seen_at: Optional[datetime] = None


# ==================== Channel Endpoints ====================


@router.get("/channels", response_model=List[ChannelResponse])
async def list_channels(
    user_id: str, channel_type: Optional[str] = None, db: AsyncSession = Depends(get_db)
):
    """List chat channels for a user"""
    query = select(ChatChannel)
    if channel_type:
        query = query.where(ChatChannel.type == channel_type)

    result = await db.execute(query.order_by(ChatChannel.created_at.desc()))
    all_channels = result.scalars().all()

    # Filter channels where user_id is in the members list
    # Handle JSON members field manually for cross-DB compatibility
    channels = []
    for ch in all_channels:
        members = ch.members if isinstance(ch.members, list) else []
        if user_id in members:
            channels.append(ch)

    # Return empty list if no channels exist (no mock data)
    if not channels:
        return []

    return channels


@router.post("/channels", response_model=ChannelResponse)
async def create_channel(
    channel: ChannelCreate, creator_id: str, db: AsyncSession = Depends(get_db)
):
    """Create a new chat channel"""
    if channel.type == "direct" and len(channel.members) == 1:
        target_user_id = channel.members[0]

        # Restrict DMs: direct channel only between connected users
        if not await _are_users_connected(db, creator_id, target_user_id):
            raise HTTPException(
                status_code=403,
                detail="Direct messages are allowed only between connected users",
            )

        existing = await db.execute(
            select(ChatChannel).where(
                ChatChannel.type == "direct",
                ChatChannel.members.contains([creator_id]),
                ChatChannel.members.contains([target_user_id]),
            )
        )
        existing_channel = existing.scalar_one_or_none()
        if existing_channel:
            return {
                "id": existing_channel.id,
                "name": existing_channel.name,
                "type": existing_channel.type,
                "description": existing_channel.description,
                "created_at": existing_channel.created_at,
                "last_message": None,
                "unread_count": 0,
                "members": existing_channel.members or [],
            }

    # Ensure creator is in members list
    all_members = list(set([creator_id] + channel.members))

    new_channel = ChatChannel(
        id=str(uuid.uuid4()),
        name=channel.name,
        type=channel.type,
        description=channel.description,
        members=all_members,
        created_at=datetime.utcnow(),
    )
    db.add(new_channel)
    await db.commit()
    await db.refresh(new_channel)

    return {
        "id": new_channel.id,
        "name": new_channel.name,
        "type": new_channel.type,
        "description": new_channel.description,
        "created_at": new_channel.created_at,
        "last_message": None,
        "unread_count": 0,
        "members": new_channel.members or [],
    }


@router.get("/channels/{channel_id}", response_model=ChannelResponse)
async def get_channel(channel_id: str, db: AsyncSession = Depends(get_db)):
    """Get channel details"""
    result = await db.execute(select(ChatChannel).where(ChatChannel.id == channel_id))
    channel = result.scalar_one_or_none()

    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    return {
        "id": channel.id,
        "name": channel.name,
        "type": channel.type,
        "description": channel.description,
        "created_at": channel.created_at,
        "last_message": None,
        "unread_count": 0,
        "members": channel.members or [],
    }


# ==================== Message Endpoints ====================


@router.get("/channels/{channel_id}/messages", response_model=List[MessageResponse])
async def get_messages(
    channel_id: str,
    user_id: Optional[str] = None,
    before: Optional[datetime] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """Get messages from a channel with delivery status"""
    query = select(ChatMessage).where(ChatMessage.channel_id == channel_id)
    if before:
        query = query.where(ChatMessage.sent_at < before)

    query = query.order_by(ChatMessage.sent_at.desc()).limit(limit)
    result = await db.execute(query)
    messages = result.scalars().all()

    if not messages:
        return []

    # Batch load delivery statuses for these messages
    message_ids = [msg.id for msg in messages]
    status_result = await db.execute(
        select(MessageDeliveryStatus).where(
            MessageDeliveryStatus.message_id.in_(message_ids)
        )
    )
    all_statuses = status_result.scalars().all()

    statuses_by_message: dict[str, list[MessageDeliveryStatus]] = {}
    for status in all_statuses:
        statuses_by_message.setdefault(str(status.message_id), []).append(status)

    # Build response with delivery status
    response = []
    for msg in messages:
        statuses = statuses_by_message.get(str(msg.id), [])

        # If user_id is provided, resolve status from user perspective.
        if user_id:
            if str(msg.sender_id) == user_id:
                delivery_status = resolve_delivery_status_for_sender(statuses)
            else:
                my_status = next(
                    (s for s in statuses if str(s.user_id) == user_id), None
                )
                if my_status and my_status.read:
                    delivery_status = "read"
                elif my_status and my_status.delivered:
                    delivery_status = "delivered"
                else:
                    delivery_status = "sent"
        else:
            delivery_status = resolve_delivery_status_for_sender(statuses)

        response.append(
            {
                "id": msg.id,
                "channel_id": msg.channel_id,
                "sender_id": msg.sender_id,
                "sender_name": None,
                "content": msg.content,
                "message_type": msg.message_type,
                "sent_at": msg.sent_at,
                "delivery_status": delivery_status,
            }
        )

    return response


@router.post("/channels/{channel_id}/messages", response_model=MessageResponse)
async def send_message(
    channel_id: str,
    message: MessageCreate,
    sender_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Send a message to a channel"""
    channel_result = await db.execute(
        select(ChatChannel).where(ChatChannel.id == channel_id)
    )
    channel = channel_result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    # Restrict DMs: only connected users can message in direct channels
    if channel.type == "direct":
        members = channel.members if isinstance(channel.members, list) else []

        if sender_id not in members:
            raise HTTPException(
                status_code=403, detail="Sender is not a channel member"
            )

        direct_members = list(dict.fromkeys(members))
        if len(direct_members) != 2:
            raise HTTPException(
                status_code=400,
                detail="Invalid direct channel configuration",
            )

        recipient_id = (
            direct_members[1] if direct_members[0] == sender_id else direct_members[0]
        )
        if recipient_id == sender_id or not await _are_users_connected(
            db, sender_id, recipient_id
        ):
            raise HTTPException(
                status_code=403,
                detail="Direct messages are allowed only between connected users",
            )

    new_message = ChatMessage(
        id=str(uuid.uuid4()),
        channel_id=channel_id,
        sender_id=sender_id,
        content=message.content,
        message_type=message.message_type,
        sent_at=datetime.utcnow(),
    )
    db.add(new_message)

    # Initialize per-recipient delivery state.
    channel_members = list(channel.members or [])
    recipient_ids = [
        str(member_id) for member_id in channel_members if str(member_id) != sender_id
    ]
    recipient_statuses: List[MessageDeliveryStatus] = []
    now = datetime.utcnow()
    for recipient_id in recipient_ids:
        delivered_now = is_user_online(recipient_id)
        status = MessageDeliveryStatus(
            id=str(uuid.uuid4()),
            message_id=new_message.id,
            user_id=recipient_id,
            delivered=delivered_now,
            delivered_at=now if delivered_now else None,
            read=False,
            read_at=None,
        )
        recipient_statuses.append(status)
        db.add(status)

    await db.commit()

    delivery_status = resolve_delivery_status_for_sender(recipient_statuses)

    return {
        "id": new_message.id,
        "channel_id": channel_id,
        "sender_id": sender_id,
        "content": message.content,
        "message_type": message.message_type,
        "sent_at": new_message.sent_at,
        "delivery_status": delivery_status,
    }


@router.put("/messages/{message_id}/delivered", response_model=MessageDeliveryResponse)
async def mark_message_delivered(
    message_id: str, user_id: str, db: AsyncSession = Depends(get_db)
):
    """Mark a message as delivered to a user"""
    message_result = await db.execute(
        select(ChatMessage).where(ChatMessage.id == message_id)
    )
    message = message_result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    if message.sender_id == user_id:
        raise HTTPException(
            status_code=400,
            detail="Sender cannot update delivery state for own message",
        )

    # Check if status exists
    result = await db.execute(
        select(MessageDeliveryStatus).where(
            MessageDeliveryStatus.message_id == message_id,
            MessageDeliveryStatus.user_id == user_id,
        )
    )
    status = result.scalar_one_or_none()

    if status:
        status.delivered = True
        status.delivered_at = datetime.utcnow()
    else:
        status = MessageDeliveryStatus(
            id=str(uuid.uuid4()),
            message_id=message_id,
            user_id=user_id,
            delivered=True,
            delivered_at=datetime.utcnow(),
        )
        db.add(status)

    await db.commit()
    return {
        "message_id": message_id,
        "delivered": status.delivered,
        "delivered_at": status.delivered_at,
        "read": status.read,
        "read_at": status.read_at,
    }


@router.put("/messages/{message_id}/read", response_model=MessageDeliveryResponse)
async def mark_message_read(
    message_id: str, user_id: str, db: AsyncSession = Depends(get_db)
):
    """Mark a message as read by a user"""
    message_result = await db.execute(
        select(ChatMessage).where(ChatMessage.id == message_id)
    )
    message = message_result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    if message.sender_id == user_id:
        raise HTTPException(
            status_code=400,
            detail="Sender cannot update delivery state for own message",
        )

    result = await db.execute(
        select(MessageDeliveryStatus).where(
            MessageDeliveryStatus.message_id == message_id,
            MessageDeliveryStatus.user_id == user_id,
        )
    )
    status = result.scalar_one_or_none()

    if status:
        status.delivered = True
        status.delivered_at = status.delivered_at or datetime.utcnow()
        status.read = True
        status.read_at = datetime.utcnow()
    else:
        status = MessageDeliveryStatus(
            id=str(uuid.uuid4()),
            message_id=message_id,
            user_id=user_id,
            delivered=True,
            delivered_at=datetime.utcnow(),
            read=True,
            read_at=datetime.utcnow(),
        )
        db.add(status)

    await db.commit()
    return {
        "message_id": message_id,
        "delivered": status.delivered,
        "delivered_at": status.delivered_at,
        "read": status.read,
        "read_at": status.read_at,
    }


@router.put("/users/{user_id}/online", response_model=UserPresenceResponse)
async def mark_user_online(user_id: str):
    """Mark a user as online (in-memory presence)."""
    ONLINE_USERS[user_id] = datetime.utcnow()
    return {"user_id": user_id, "online": True, "last_seen_at": ONLINE_USERS[user_id]}


@router.put("/users/{user_id}/offline", response_model=UserPresenceResponse)
async def mark_user_offline(user_id: str):
    """Mark a user as offline (in-memory presence)."""
    last_seen_at = ONLINE_USERS.pop(user_id, None) or datetime.utcnow()
    return {"user_id": user_id, "online": False, "last_seen_at": last_seen_at}


@router.get("/users/{user_id}/presence", response_model=UserPresenceResponse)
async def get_user_presence(user_id: str):
    """Get online/offline state for a user."""
    last_seen_at = ONLINE_USERS.get(user_id)
    return {
        "user_id": user_id,
        "online": last_seen_at is not None,
        "last_seen_at": last_seen_at,
    }


# ==================== Connection Request Endpoints ====================


@router.post("/connections/request")
async def send_connection_request(
    request: ConnectionRequestCreate,
    sender_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Send a connection request to another user"""
    if sender_id == request.receiver_id:
        raise HTTPException(
            status_code=400, detail="You cannot send a connection request to yourself"
        )

    receiver_result = await db.execute(
        select(User).where(User.id == request.receiver_id)
    )
    receiver = receiver_result.scalar_one_or_none()
    if not receiver:
        raise HTTPException(status_code=404, detail="Receiver user not found")

    # Check if request already exists
    existing = await db.execute(
        select(ConnectionRequest).where(
            or_(
                and_(
                    ConnectionRequest.sender_id == sender_id,
                    ConnectionRequest.receiver_id == request.receiver_id,
                    ConnectionRequest.status == "pending",
                ),
                and_(
                    ConnectionRequest.sender_id == request.receiver_id,
                    ConnectionRequest.receiver_id == sender_id,
                    ConnectionRequest.status == "pending",
                ),
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Connection request already exists")

    # Check if already connected
    existing_conn = await db.execute(
        select(Connection).where(
            or_(
                and_(
                    Connection.user1_id == sender_id,
                    Connection.user2_id == request.receiver_id,
                ),
                and_(
                    Connection.user1_id == request.receiver_id,
                    Connection.user2_id == sender_id,
                ),
            )
        )
    )
    if existing_conn.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Already connected")

    new_request = ConnectionRequest(
        id=str(uuid.uuid4()),
        sender_id=sender_id,
        receiver_id=request.receiver_id,
        message=request.message,
        status="pending",
        created_at=datetime.utcnow(),
    )
    db.add(new_request)
    await db.commit()

    return {
        "id": new_request.id,
        "sender_id": sender_id,
        "receiver_id": request.receiver_id,
        "status": "pending",
        "created_at": new_request.created_at,
    }


@router.get(
    "/connections/requests/pending", response_model=List[ConnectionRequestResponse]
)
async def get_pending_requests(user_id: str, db: AsyncSession = Depends(get_db)):
    """Get pending connection requests received by user"""
    result = await db.execute(
        select(ConnectionRequest)
        .where(
            ConnectionRequest.receiver_id == user_id,
            ConnectionRequest.status == "pending",
        )
        .order_by(ConnectionRequest.created_at.desc())
    )
    requests_list = result.scalars().all()

    if not requests_list:
        return []

    response = []
    for req in requests_list:
        sender = await db.execute(select(User).where(User.id == req.sender_id))
        sender_user = sender.scalar_one_or_none()
        response.append(
            {
                "id": req.id,
                "sender_id": req.sender_id,
                "sender_name": sender_user.name if sender_user else None,
                "receiver_id": req.receiver_id,
                "message": req.message,
                "status": req.status,
                "created_at": req.created_at,
                "responded_at": req.responded_at,
            }
        )

    return response


@router.get(
    "/connections/requests/sent", response_model=List[ConnectionRequestResponse]
)
async def get_sent_requests(user_id: str, db: AsyncSession = Depends(get_db)):
    """Get connection requests sent by user"""
    result = await db.execute(
        select(ConnectionRequest)
        .where(
            ConnectionRequest.sender_id == user_id,
            ConnectionRequest.status == "pending",
        )
        .order_by(ConnectionRequest.created_at.desc())
    )
    requests_list = result.scalars().all()

    if not requests_list:
        return []

    response = []
    for req in requests_list:
        receiver = await db.execute(select(User).where(User.id == req.receiver_id))
        receiver_user = receiver.scalar_one_or_none()
        response.append(
            {
                "id": req.id,
                "sender_id": req.sender_id,
                "receiver_id": req.receiver_id,
                "receiver_name": receiver_user.name if receiver_user else None,
                "message": req.message,
                "status": req.status,
                "created_at": req.created_at,
                "responded_at": req.responded_at,
            }
        )

    return response


@router.put("/connections/{request_id}/accept")
async def accept_connection(
    request_id: str, user_id: str, db: AsyncSession = Depends(get_db)
):
    """Accept a connection request"""
    result = await db.execute(
        select(ConnectionRequest).where(
            ConnectionRequest.id == request_id,
            ConnectionRequest.receiver_id == user_id,
            ConnectionRequest.status == "pending",
        )
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Connection request not found")

    # Update request status
    req.status = "accepted"
    req.responded_at = datetime.utcnow()

    # Avoid duplicate connection records
    existing_conn = await db.execute(
        select(Connection).where(
            or_(
                and_(
                    Connection.user1_id == req.sender_id,
                    Connection.user2_id == req.receiver_id,
                ),
                and_(
                    Connection.user1_id == req.receiver_id,
                    Connection.user2_id == req.sender_id,
                ),
            )
        )
    )
    existing_connection = existing_conn.scalar_one_or_none()
    if existing_connection:
        await db.commit()
        return {
            "message": "Connection already exists",
            "connection_id": existing_connection.id,
            "status": "accepted",
        }

    # Create connection
    new_connection = Connection(
        id=str(uuid.uuid4()),
        user1_id=req.sender_id,
        user2_id=req.receiver_id,
        connected_at=datetime.utcnow(),
    )
    db.add(new_connection)
    await db.commit()

    return {
        "message": "Connection accepted",
        "connection_id": new_connection.id,
        "status": "accepted",
    }


@router.put("/connections/{request_id}/reject")
async def reject_connection(
    request_id: str, user_id: str, db: AsyncSession = Depends(get_db)
):
    """Reject a connection request"""
    result = await db.execute(
        select(ConnectionRequest).where(
            ConnectionRequest.id == request_id,
            ConnectionRequest.receiver_id == user_id,
            ConnectionRequest.status == "pending",
        )
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Connection request not found")

    req.status = "rejected"
    req.responded_at = datetime.utcnow()
    await db.commit()

    return {"message": "Connection rejected", "status": "rejected"}


@router.get("/connections", response_model=List[ConnectionResponse])
async def list_connections(user_id: str, db: AsyncSession = Depends(get_db)):
    """List all connections for a user"""
    result = await db.execute(
        select(Connection)
        .where(
            or_(
                Connection.user1_id == user_id,
                Connection.user2_id == user_id,
            )
        )
        .order_by(Connection.connected_at.desc())
    )
    connections = result.scalars().all()

    if not connections:
        return []

    response = []
    for conn in connections:
        other_user_id = conn.user2_id if conn.user1_id == user_id else conn.user1_id
        other_user = await db.execute(select(User).where(User.id == other_user_id))
        user = other_user.scalar_one_or_none()

        response.append(
            {
                "id": conn.id,
                "user1_id": conn.user1_id,
                "user1_name": None,
                "user2_id": conn.user2_id,
                "user2_name": user.name if user else None,
                "connected_at": conn.connected_at,
            }
        )

    return response


# ==================== User Endpoints ====================


@router.get("/users", response_model=List[dict])
async def list_users(
    current_user_id: str,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """List all users sorted by join date (created_at)"""
    query = select(User).where(User.id != current_user_id)
    if search:
        query = query.where(
            or_(User.name.ilike(f"%{search}%"), User.email.ilike(f"%{search}%"))
        )
    query = query.order_by(User.created_at.desc(), User.id.desc()).limit(50)

    result = await db.execute(query)
    users = result.scalars().all()

    if not users:
        return []

    # Check connection status for each user
    response = []
    for user in users:
        # Check if connected
        conn_result = await db.execute(
            select(Connection).where(
                or_(
                    and_(
                        Connection.user1_id == current_user_id,
                        Connection.user2_id == user.id,
                    ),
                    and_(
                        Connection.user1_id == user.id,
                        Connection.user2_id == current_user_id,
                    ),
                )
            )
        )
        connection = conn_result.scalar_one_or_none()

        # Check if pending request
        req_result = await db.execute(
            select(ConnectionRequest).where(
                or_(
                    and_(
                        ConnectionRequest.sender_id == current_user_id,
                        ConnectionRequest.receiver_id == user.id,
                        ConnectionRequest.status == "pending",
                    ),
                    and_(
                        ConnectionRequest.sender_id == user.id,
                        ConnectionRequest.receiver_id == current_user_id,
                        ConnectionRequest.status == "pending",
                    ),
                )
            )
        )
        pending_request = req_result.scalar_one_or_none()

        connection_status = "none"
        if connection:
            connection_status = "connected"
        elif pending_request:
            connection_status = "pending"

        response.append(
            {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "user_type": user.user_type,
                "connection_status": connection_status,
                "created_at": (
                    user.created_at.isoformat() if user.created_at is not None else None
                ),
            }
        )

    return response


# ==================== Video Call Endpoints ====================


@router.post("/channels/{channel_id}/video-call")
async def start_video_call(
    channel_id: str, initiator_id: str, db: AsyncSession = Depends(get_db)
):
    """Start a video call in a channel"""
    room_name = f"zorbyo-{channel_id}-{uuid.uuid4().hex[:8]}"

    return {
        "meeting_url": f"https://meet.jit.si/{room_name}",
        "room_name": room_name,
        "initiated_by": initiator_id,
    }
