from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio
from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv
from datetime import datetime
import json

from app.core.config import settings
from app.core.database import engine, Base, init_db
from app.routers import (
    auth,
    users,
    courses,
    projects,
    payments,
    chat,
    bug_bounty,
    profile,
)

load_dotenv()


# Create database tables
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup - Initialize database
    print("Starting ZORBYO API...")
    print(f"Database: {settings.DATABASE_URL}")
    try:
        await init_db()
        print("Database initialized successfully!")
    except Exception as e:
        print(f"Database init warning: {e}")
    yield
    # Shutdown
    try:
        await engine.dispose()
        print("Shutdown complete.")
    except:
        pass


# Initialize FastAPI app
app = FastAPI(
    title="ZORBYO API",
    description="Backend API for ZORBYO - Freelancing & Learning Platform",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Socket.IO setup
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

# Store connected users
connected_users = {}
user_public_keys = {}

# Mount routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(courses.router, prefix="/api/v1/courses", tags=["Courses"])
app.include_router(projects.router, prefix="/api/v1/projects", tags=["Projects"])
app.include_router(payments.router, prefix="/api/v1/payments", tags=["Payments"])
app.include_router(chat.router, prefix="/api/v1/chat", tags=["Chat"])
app.include_router(bug_bounty.router, prefix="/api/v1/bounties", tags=["Bug Bounty"])
app.include_router(profile.router, prefix="/api/v1/profile", tags=["Profile"])


# Root endpoint
@app.get("/")
async def root():
    return {
        "name": "ZORBYO API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
    }


# Health check
@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}


# Socket.IO events
@sio.event
async def connect(sid, environ, auth):
    """Handle client connection"""
    user_id = auth.get("userId") if auth else None
    public_key = auth.get("publicKey") if auth else None

    print(f"Client connected: {sid}, User: {user_id}")

    if user_id:
        connected_users[sid] = user_id
        if public_key:
            user_public_keys[user_id] = public_key

        # Notify other users that this user is online
        await sio.emit("user_joined", {"sid": sid, "user_id": user_id})

        # Send list of online users to the connected client
        await sio.emit(
            "online_users", {"users": list(connected_users.values())}, to=sid
        )


@sio.event
async def disconnect(sid):
    """Handle client disconnection"""
    user_id = connected_users.get(sid)
    print(f"Client disconnected: {sid}, User: {user_id}")

    if user_id:
        # Notify other users that this user is offline
        await sio.emit("user_left", {"sid": sid, "user_id": user_id})

        # Remove user from connected users
        del connected_users[sid]


@sio.event
async def join_channel(sid, data):
    """Handle user joining a channel"""
    channel_id = data.get("channel_id")
    if channel_id:
        await sio.enter_room(sid, channel_id)
        user_id = connected_users.get(sid)

        print(f"User {user_id} joined channel {channel_id}")

        # Notify other users in the channel
        await sio.emit(
            "user_joined_channel",
            {"sid": sid, "user_id": user_id, "channel_id": channel_id},
            room=channel_id,
            skip_sid=sid,
        )


@sio.event
async def leave_channel(sid, data):
    """Handle user leaving a channel"""
    channel_id = data.get("channel_id")
    if channel_id:
        await sio.leave_room(sid, channel_id)
        user_id = connected_users.get(sid)

        print(f"User {user_id} left channel {channel_id}")

        # Notify other users in the channel
        await sio.emit(
            "user_left_channel",
            {"sid": sid, "user_id": user_id, "channel_id": channel_id},
            room=channel_id,
            skip_sid=sid,
        )


@sio.event
async def send_message(sid, data):
    """Handle sending a message to a channel"""
    channel_id = data.get("channel_id")
    content = data.get("content")
    encrypted_content = data.get("encrypted_content")
    message_type = data.get("message_type", "text")
    timestamp = data.get("timestamp")
    user_id = connected_users.get(sid)

    if channel_id and content:
        print(f"Message in channel {channel_id} from user {user_id}")

        # Create message object
        message = {
            "id": f"msg_{datetime.utcnow().timestamp()}",
            "channel_id": channel_id,
            "sender_id": user_id,
            "sender_name": f"User {user_id}",
            "content": content,
            "encrypted_content": encrypted_content,
            "message_type": message_type,
            "sent_at": timestamp or datetime.utcnow().isoformat(),
        }

        # Broadcast message to all users in the channel
        await sio.emit("new_message", message, room=channel_id)


@sio.event
async def typing_start(sid, data):
    """Handle typing indicator start"""
    channel_id = data.get("channel_id")
    user_id = data.get("user_id")
    user_name = data.get("user_name")

    if channel_id:
        print(f"User {user_name} is typing in channel {channel_id}")

        # Notify other users in the channel
        await sio.emit(
            "user_typing",
            {
                "sid": sid,
                "channel_id": channel_id,
                "user_id": user_id,
                "user_name": user_name,
            },
            room=channel_id,
            skip_sid=sid,
        )


@sio.event
async def typing_stop(sid, data):
    """Handle typing indicator stop"""
    channel_id = data.get("channel_id")
    user_id = data.get("user_id")

    if channel_id:
        # Notify other users in the channel
        await sio.emit(
            "user_stop_typing",
            {"sid": sid, "channel_id": channel_id, "user_id": user_id},
            room=channel_id,
            skip_sid=sid,
        )


@sio.event
async def exchange_public_key(sid, data):
    """Handle public key exchange for E2E encryption"""
    user_id = data.get("user_id")
    public_key = data.get("publicKey")

    if user_id and public_key:
        user_public_keys[user_id] = public_key
        print(f"Public key received from user {user_id}")

        # Broadcast public key to all connected users
        await sio.emit("public_key", {"user_id": user_id, "publicKey": public_key})


@sio.event
async def get_public_key(sid, data):
    """Get public key for a specific user"""
    target_user_id = data.get("user_id")

    if target_user_id and target_user_id in user_public_keys:
        await sio.emit(
            "public_key",
            {"user_id": target_user_id, "publicKey": user_public_keys[target_user_id]},
            to=sid,
        )


@sio.event
async def video_call_invite(sid, data):
    """Handle video call invitation"""
    channel_id = data.get("channel_id")
    meeting_url = data.get("meeting_url")
    initiator_id = connected_users.get(sid)

    if channel_id and meeting_url:
        print(f"Video call initiated by {initiator_id} in channel {channel_id}")

        # Notify all users in the channel
        await sio.emit(
            "video_call_started",
            {
                "channel_id": channel_id,
                "meeting_url": meeting_url,
                "initiated_by": initiator_id,
            },
            room=channel_id,
            skip_sid=sid,
        )


@sio.event
async def video_call_end(sid, data):
    """Handle video call ending"""
    channel_id = data.get("channel_id")

    if channel_id:
        print(f"Video call ended in channel {channel_id}")

        # Notify all users in the channel
        await sio.emit("video_call_ended", {"channel_id": channel_id}, room=channel_id)


# Mount Socket.IO
socket_app = socketio.ASGIApp(sio, app)

if __name__ == "__main__":
    import uvicorn

    print(f"\n{'=' * 50}")
    print(f"  ZORBYO API Server")
    print(f"  Running on: http://localhost:{settings.PORT}")
    print(f"  API Docs: http://localhost:{settings.PORT}/docs")
    print(f"{'=' * 50}\n")

    # Run without reload for stability
    uvicorn.run(
        socket_app,
        host=settings.HOST,
        port=settings.PORT,
        reload=False,  # Disable reload to prevent shutdown issues
    )
