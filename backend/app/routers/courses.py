# pyright: reportImplicitRelativeImport=false, reportGeneralTypeIssues=false, reportAttributeAccessIssue=false, reportArgumentType=false
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
import uuid
import httpx
import mimetypes

from app.core.database import get_db
from app.models.models import (
    Course,
    CourseChapter,
    CourseProgress,
    Quiz,
    QuizAttempt,
    QuizResult,
    Certificate,
    User,
    PracticeDomainLevel,
)
from app.services.minio_service import minio_service
from app.services.ai_service import ai_service
from app.services.certificate_service import certificate_service
from app.core.config import settings

router = APIRouter()


def _rewrite_video_url(video_url: str, request: Request) -> str:
    """Rewrite MinIO localhost URLs to use the API server host so it works on mobile."""
    if not video_url:
        return video_url

    # Extract the object path from the MinIO URL
    # Handle both http and https, and various MinIO endpoint formats
    bucket = settings.MINIO_BUCKET_NAME

    # Try to find the bucket name in the URL and extract object path
    # Pattern: http(s)://host/bucket_name/object_path
    bucket_marker = f"/{bucket}/"
    if bucket_marker in video_url:
        parts = video_url.split(bucket_marker, 1)
        if len(parts) == 2:
            object_path = parts[1]
            # Use the request host to build the proxy URL
            scheme = request.url.scheme
            host = request.headers.get("host", f"localhost:{settings.PORT}")
            return f"{scheme}://{host}/api/v1/courses/video/{object_path}"

    # Fallback: if URL contains MinIO endpoint pattern, try to extract path
    minio_endpoint = settings.MINIO_ENDPOINT
    if minio_endpoint in video_url:
        # Try extracting after the endpoint
        endpoint_pattern = f"{minio_endpoint}/"
        if endpoint_pattern in video_url:
            path_part = video_url.split(endpoint_pattern, 1)[1]
            # Remove bucket name if present at start of path
            if path_part.startswith(f"{bucket}/"):
                object_path = path_part[len(bucket) + 1 :]
            else:
                object_path = path_part
            scheme = request.url.scheme
            host = request.headers.get("host", f"localhost:{settings.PORT}")
            return f"{scheme}://{host}/api/v1/courses/video/{object_path}"

    return video_url


# Schemas
class CourseBase(BaseModel):
    title: str
    description: Optional[str] = None
    domain: Optional[str] = None


class CourseCreate(CourseBase):
    pass


class CourseResponse(CourseBase):
    id: str
    thumbnail_url: Optional[str]
    chapters: int
    duration_hours: float
    created_at: datetime

    class Config:
        from_attributes = True


class ChapterResponse(BaseModel):
    id: str
    course_id: str
    chapter_index: int
    title: str
    video_url: str
    duration_seconds: int

    class Config:
        from_attributes = True


class ProgressUpdate(BaseModel):
    chapter_index: int
    video_timestamp: float


class ProgressResponse(BaseModel):
    user_id: str
    course_id: str
    chapter_index: int
    video_timestamp: float
    completed: bool
    last_updated: datetime

    class Config:
        from_attributes = True


class QuizQuestion(BaseModel):
    question: str
    options: List[str]
    correct_answer: int


class QuizResponse(BaseModel):
    id: str
    course_id: str
    chapter_index: int
    questions: List[QuizQuestion]

    class Config:
        from_attributes = True


class QuizSubmission(BaseModel):
    quiz_id: str
    answers: List[int]


class QuizResultResponse(BaseModel):
    id: str
    quiz_id: str
    score: int
    total_questions: int
    completed_at: datetime

    class Config:
        from_attributes = True


class FinalExamSubmission(BaseModel):
    quiz_id: str
    answers: List[int]


class FinalExamResultResponse(BaseModel):
    id: str
    quiz_id: str
    score: int
    total_questions: int
    percentage: float
    passed: bool
    completed_at: datetime

    class Config:
        from_attributes = True


CHAPTER_QUIZ_QUESTION_COUNT = 5
CHAPTER_QUIZ_PASS_SCORE = 3
FINAL_EXAM_QUESTION_COUNT = 15
FINAL_EXAM_PASS_PERCENTAGE = 0.7
FINAL_EXAM_CHAPTER_INDEX = -1
PRACTICE_QUIZ_QUESTION_COUNT = 25
PRACTICE_QUIZ_PASS_SCORE = 18  # 70% pass rate (18/25 = 72%)
PRACTICE_QUIZ_XP_REWARD = 100  # XP awarded for passing a practice quiz level


@router.post("/sync-from-minio")
async def sync_courses_from_minio(db: AsyncSession = Depends(get_db)):
    """Sync courses from MinIO bucket into the database"""
    try:
        minio_courses = await minio_service.list_courses_from_minio()

        if not minio_courses:
            return {"message": "No courses found in MinIO bucket", "synced": 0}

        synced = 0
        for course_name, files in minio_courses.items():
            # Check if course already exists
            existing_result = await db.execute(
                select(Course).where(Course.title == course_name)
            )
            existing = existing_result.scalar_one_or_none()
            if existing:
                continue

            course_id = str(uuid.uuid4())
            course = Course(
                id=course_id,
                title=course_name,
                description=f"Course: {course_name}",
                domain="General",
                chapters=len(files),
                duration_hours=round(len(files) * 0.5, 1),
            )
            db.add(course)
            await db.flush()

            sorted_files = sorted(files, key=lambda f: f["filename"])
            for i, file_info in enumerate(sorted_files):
                chapter = CourseChapter(
                    id=str(uuid.uuid4()),
                    course_id=course_id,
                    chapter_index=i + 1,
                    title=file_info["filename"].replace("_", " ").replace(".mp4", ""),
                    video_url=file_info["video_url"],
                    duration_seconds=1800,
                )
                db.add(chapter)

            synced += 1

        await db.commit()
        return {"message": f"Synced {synced} courses from MinIO", "synced": synced}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")


class CertificateResponse(BaseModel):
    id: str
    user_id: str
    course_id: str
    issued_at: datetime
    certificate_url: str
    certificate_number: str

    class Config:
        from_attributes = True


@router.get("/", response_model=List[CourseResponse])
async def list_courses(
    domain: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    """List all available courses - auto-seeds from MinIO if database is empty"""
    query = select(Course)
    if domain:
        query = query.where(Course.domain == domain)
    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    courses = result.scalars().all()

    # If no courses in database, attempt to seed from MinIO
    if not courses:
        try:
            minio_courses = await minio_service.list_courses_from_minio()
            if minio_courses:
                for course_name, files in minio_courses.items():
                    # Check if course already exists
                    existing_result = await db.execute(
                        select(Course).where(Course.title == course_name)
                    )
                    if existing_result.scalar_one_or_none():
                        continue

                    course_id = str(uuid.uuid4())
                    course = Course(
                        id=course_id,
                        title=course_name,
                        description=f"Course: {course_name}",
                        domain="General",
                        chapters=len(files),
                        duration_hours=round(len(files) * 0.5, 1),
                    )
                    db.add(course)
                    await db.flush()

                    sorted_files = sorted(files, key=lambda f: f["filename"])
                    for i, file_info in enumerate(sorted_files):
                        chapter = CourseChapter(
                            id=str(uuid.uuid4()),
                            course_id=course_id,
                            chapter_index=i + 1,
                            title=file_info["filename"]
                            .replace("_", " ")
                            .replace(".mp4", ""),
                            video_url=file_info["video_url"],
                            duration_seconds=1800,
                        )
                        db.add(chapter)

                await db.commit()

                # Re-query after seeding
                result = await db.execute(select(Course).offset(skip).limit(limit))
                courses = result.scalars().all()
        except Exception as e:
            print(f"Auto-seed from MinIO failed: {e}")

    # Return empty array if still no courses
    if not courses:
        return []

    return courses


@router.get("/{course_id}", response_model=CourseResponse)
async def get_course(course_id: str, db: AsyncSession = Depends(get_db)):
    """Get course details"""
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()

    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    return course


@router.get("/{course_id}/chapters")
async def get_course_chapters(
    course_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """Get all chapters for a course with rewritten video URLs"""
    result = await db.execute(
        select(CourseChapter)
        .where(CourseChapter.course_id == course_id)
        .order_by(CourseChapter.chapter_index)
    )
    chapters = result.scalars().all()

    response = []
    for ch in chapters:
        response.append(
            {
                "id": ch.id,
                "course_id": ch.course_id,
                "chapter_index": ch.chapter_index,
                "title": ch.title,
                "video_url": _rewrite_video_url(ch.video_url, request),
                "duration_seconds": ch.duration_seconds,
            }
        )

    return response


@router.get("/video/{object_path:path}")
async def proxy_video(object_path: str, request: Request):
    """Proxy MinIO video through the API server with full Range request support for any video format."""
    try:
        # Initialize MinIO client
        if not minio_service._lazy_init():
            raise HTTPException(status_code=503, detail="MinIO service unavailable")

        bucket = settings.MINIO_BUCKET_NAME
        print(f"Video proxy request: bucket={bucket}, object_path={object_path}")

        # Get object stat for size and content type
        try:
            stat = minio_service.client.stat_object(bucket, object_path)
        except Exception as e:
            print(
                f"MinIO stat_object failed: bucket={bucket}, path={object_path}, error={e}"
            )
            # Try listing the bucket to debug
            try:
                objects = list(
                    minio_service.client.list_objects(
                        bucket, prefix="courses/", recursive=True
                    )
                )
                print(
                    f"Available objects in bucket '{bucket}' with prefix 'courses/': {[obj.object_name for obj in objects[:10]]}"
                )
            except Exception as list_err:
                print(f"Could not list bucket: {list_err}")
            raise HTTPException(
                status_code=404, detail=f"Video not found: {object_path}"
            )

        file_size = stat.size
        content_type = stat.content_type or "application/octet-stream"
        print(f"Video found: size={file_size}, content_type={content_type}")

        # Detect content type from file extension if MinIO didn't provide a useful one
        if content_type == "application/octet-stream":
            guessed_type, _ = mimetypes.guess_type(object_path)
            if guessed_type:
                content_type = guessed_type
                print(f"Guessed content type: {content_type}")

        # Parse Range header for partial content support
        range_header = request.headers.get("range")

        if range_header:
            try:
                range_str = range_header.replace("bytes=", "")
                parts = range_str.split("-")
                start = int(parts[0]) if parts[0] else 0
                end = int(parts[1]) if parts[1] else file_size - 1

                if start >= file_size:
                    return Response(
                        status_code=416,
                        headers={
                            "Content-Range": f"bytes */{file_size}",
                            "Accept-Ranges": "bytes",
                        },
                    )

                end = min(end, file_size - 1)
                length = end - start + 1

                # Fetch byte range from MinIO using offset and length
                response = minio_service.client.get_object(
                    bucket, object_path, offset=start, length=length
                )

                def generate():
                    try:
                        for chunk in response.stream(32 * 1024):
                            yield chunk
                    finally:
                        response.close()
                        response.release_conn()

                return StreamingResponse(
                    generate(),
                    status_code=206,
                    media_type=content_type,
                    headers={
                        "Content-Range": f"bytes {start}-{end}/{file_size}",
                        "Content-Length": str(length),
                        "Accept-Ranges": "bytes",
                        "Cache-Control": "public, max-age=3600",
                    },
                )
            except Exception as range_err:
                print(
                    f"Range request failed: {range_err}, falling back to full response"
                )

        # Full file response (no Range header)
        response = minio_service.client.get_object(bucket, object_path)

        def generate():
            try:
                for chunk in response.stream(32 * 1024):
                    yield chunk
            finally:
                response.close()
                response.release_conn()

        return StreamingResponse(
            generate(),
            media_type=content_type,
            headers={
                "Content-Length": str(file_size),
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Video proxy error: {e}")
        raise HTTPException(status_code=500, detail=f"Video proxy error: {str(e)}")


@router.post("/{course_id}/upload")
async def upload_course_video(
    course_id: str,
    file: UploadFile = File(...),
    chapter_index: int = Form(...),
    chapter_title: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a video chapter to MinIO"""
    try:
        # Read file data
        file_data = await file.read()

        # Upload to MinIO
        video_url = await minio_service.upload_video(
            file_data, course_id, chapter_index
        )

        # Create or update chapter in database
        result = await db.execute(
            select(CourseChapter).where(
                CourseChapter.course_id == course_id,
                CourseChapter.chapter_index == chapter_index,
            )
        )
        chapter = result.scalar_one_or_none()

        if chapter:
            chapter.video_url = video_url
            chapter.title = chapter_title
        else:
            chapter = CourseChapter(
                id=str(uuid.uuid4()),
                course_id=course_id,
                chapter_index=chapter_index,
                title=chapter_title,
                video_url=video_url,
                duration_seconds=0,  # Will be updated after processing
            )
            db.add(chapter)

        await db.commit()

        return {
            "message": "Video uploaded successfully",
            "video_url": video_url,
            "chapter_id": chapter.id,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/{course_id}/progress")
async def get_progress(
    course_id: str, user_id: str, db: AsyncSession = Depends(get_db)
):
    """Get user progress for a course"""
    result = await db.execute(
        select(CourseProgress).where(
            CourseProgress.user_id == user_id, CourseProgress.course_id == course_id
        )
    )
    progress = result.scalar_one_or_none()

    if not progress:
        return {
            "user_id": user_id,
            "course_id": course_id,
            "chapter_index": 0,
            "video_timestamp": 0,
            "completed": False,
            "last_updated": datetime.utcnow(),
        }

    return progress


@router.post("/{course_id}/progress")
async def update_progress(
    course_id: str,
    user_id: str,
    progress: ProgressUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update user progress for a course"""
    # Ensure user exists to satisfy foreign key constraint
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        user = User(
            id=user_id,
            email=f"{user_id}@zorbyo.local",
            name="User",
        )
        db.add(user)
        await db.flush()

    result = await db.execute(
        select(CourseProgress).where(
            CourseProgress.user_id == user_id, CourseProgress.course_id == course_id
        )
    )
    progress_record = result.scalar_one_or_none()

    if progress_record:
        progress_record.chapter_index = progress.chapter_index
        progress_record.video_timestamp = progress.video_timestamp
        progress_record.last_updated = datetime.utcnow()
    else:
        progress_record = CourseProgress(
            id=str(uuid.uuid4()),
            user_id=user_id,
            course_id=course_id,
            chapter_index=progress.chapter_index,
            video_timestamp=progress.video_timestamp,
            completed=False,
        )
        db.add(progress_record)

    await db.commit()

    return {
        "message": "Progress updated",
        "user_id": user_id,
        "course_id": course_id,
        "chapter_index": progress.chapter_index,
        "video_timestamp": progress.video_timestamp,
    }


class VideoWatchedUpdate(BaseModel):
    chapter_index: int


@router.post("/{course_id}/video-watched")
async def mark_video_watched(
    course_id: str,
    user_id: str,
    body: VideoWatchedUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Mark a chapter's video as fully watched by the user."""
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        user = User(
            id=user_id,
            email=f"{user_id}@zorbyo.local",
            name="User",
        )
        db.add(user)
        await db.flush()

    # Get chapter to determine duration
    chapter_result = await db.execute(
        select(CourseChapter).where(
            CourseChapter.course_id == course_id,
            CourseChapter.chapter_index == body.chapter_index,
        )
    )
    chapter = chapter_result.scalar_one_or_none()
    chapter_duration = chapter.duration_seconds if chapter else 0

    # Find or create per-chapter progress
    result = await db.execute(
        select(CourseProgress).where(
            CourseProgress.user_id == user_id,
            CourseProgress.course_id == course_id,
            CourseProgress.chapter_index == body.chapter_index,
        )
    )
    record = result.scalar_one_or_none()

    if record:
        record.video_timestamp = float(chapter_duration)
        record.last_updated = datetime.utcnow()
    else:
        record = CourseProgress(
            id=str(uuid.uuid4()),
            user_id=user_id,
            course_id=course_id,
            chapter_index=body.chapter_index,
            video_timestamp=float(chapter_duration),
            completed=False,
        )
        db.add(record)

    await db.commit()

    return {
        "message": "Video marked as watched",
        "user_id": user_id,
        "course_id": course_id,
        "chapter_index": body.chapter_index,
    }


@router.get("/{course_id}/chapter-progress")
async def get_chapter_progress(
    course_id: str, user_id: str, db: AsyncSession = Depends(get_db)
):
    """Get per-chapter progress for a user including video watched and quiz completed status."""
    result = await db.execute(
        select(CourseProgress).where(
            CourseProgress.user_id == user_id,
            CourseProgress.course_id == course_id,
        )
    )
    progress_records = result.scalars().all()

    chapters_result = await db.execute(
        select(CourseChapter).where(CourseChapter.course_id == course_id)
    )
    chapters = chapters_result.scalars().all()
    chapter_map = {ch.chapter_index: ch for ch in chapters}

    chapters_progress = []
    for ch in chapters:
        prog = next(
            (p for p in progress_records if p.chapter_index == ch.chapter_index),
            None,
        )
        video_watched = False
        if prog and ch.duration_seconds > 0:
            watch_pct = (prog.video_timestamp / ch.duration_seconds) * 100
            video_watched = watch_pct >= 95 or (
                prog.completed and prog.video_timestamp > 0
            )

        chapters_progress.append(
            {
                "chapter_index": ch.chapter_index,
                "video_watched": video_watched,
                "quiz_completed": prog.completed if prog else False,
                "chapter_completed": (
                    video_watched and (prog.completed if prog else False)
                ),
                "video_timestamp": prog.video_timestamp if prog else 0,
                "duration_seconds": ch.duration_seconds,
            }
        )

    return {
        "user_id": user_id,
        "course_id": course_id,
        "chapters": chapters_progress,
    }


@router.post("/{course_id}/quiz/generate")
async def generate_quiz(
    course_id: str,
    chapter_index: int,
    user_id: str = None,
    db: AsyncSession = Depends(get_db),
):
    """Generate AI quiz for a chapter based on video content"""
    # Verify video completion before allowing quiz generation
    if user_id:
        progress_result = await db.execute(
            select(CourseProgress).where(
                CourseProgress.user_id == user_id,
                CourseProgress.course_id == course_id,
                CourseProgress.chapter_index == chapter_index,
            )
        )
        progress = progress_result.scalar_one_or_none()

        # Check if user has watched enough of the video (at least 95% or marked as completed)
        if progress and progress.video_timestamp:
            chapter_result = await db.execute(
                select(CourseChapter).where(
                    CourseChapter.course_id == course_id,
                    CourseChapter.chapter_index == chapter_index,
                )
            )
            chapter = chapter_result.scalar_one_or_none()
            if chapter and chapter.duration_seconds > 0:
                watch_percentage = (
                    progress.video_timestamp / chapter.duration_seconds
                ) * 100
                if watch_percentage < 95 and not progress.completed:
                    raise HTTPException(
                        status_code=403,
                        detail="Please watch at least 95% of the video before taking the quiz",
                    )

    # Get chapter content
    result = await db.execute(
        select(CourseChapter).where(
            CourseChapter.course_id == course_id,
            CourseChapter.chapter_index == chapter_index,
        )
    )
    chapter = result.scalar_one_or_none()

    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    # Generate quiz questions using AI
    # Note: In production, you would analyze the video content
    # For now, we'll use the chapter title as context
    questions = await ai_service.generate_quiz_questions(
        f"Chapter: {chapter.title}\nVideo URL: {chapter.video_url}",
        num_questions=CHAPTER_QUIZ_QUESTION_COUNT,
    )

    if not questions:
        questions = []

    # Ensure chapter quiz contains exactly 5 questions
    questions = questions[:CHAPTER_QUIZ_QUESTION_COUNT]

    # Save quiz to database
    quiz = Quiz(
        id=str(uuid.uuid4()),
        course_id=course_id,
        chapter_index=chapter_index,
        questions=questions,
    )
    db.add(quiz)
    await db.commit()

    return {
        "message": "Quiz generated",
        "quiz_id": quiz.id,
        "questions_count": len(questions),
    }


@router.get("/{course_id}/quiz/{chapter_index}", response_model=QuizResponse)
async def get_quiz(
    course_id: str, chapter_index: int, db: AsyncSession = Depends(get_db)
):
    """Get quiz for a chapter"""
    result = await db.execute(
        select(Quiz).where(
            Quiz.course_id == course_id, Quiz.chapter_index == chapter_index
        )
    )
    quiz = result.scalar_one_or_none()

    if not quiz:
        # Generate quiz with AI if not exists
        return {
            "id": str(uuid.uuid4()),
            "course_id": course_id,
            "chapter_index": chapter_index,
            "questions": [],
        }

    return {
        "id": quiz.id,
        "course_id": quiz.course_id,
        "chapter_index": quiz.chapter_index,
        "questions": quiz.questions,
    }


@router.post("/{course_id}/quiz/submit", response_model=QuizResultResponse)
async def submit_quiz(
    course_id: str,
    submission: QuizSubmission,
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Submit quiz answers and check if user can proceed"""
    # Get quiz
    result = await db.execute(select(Quiz).where(Quiz.id == submission.quiz_id))
    quiz = result.scalar_one_or_none()

    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    if quiz.course_id != course_id:
        raise HTTPException(
            status_code=400, detail="Quiz does not belong to this course"
        )

    # Check active lockout
    now = datetime.utcnow()
    attempts_result = await db.execute(
        select(QuizAttempt)
        .where(
            QuizAttempt.user_id == user_id, QuizAttempt.quiz_id == submission.quiz_id
        )
        .order_by(QuizAttempt.attempted_at.desc())
    )
    attempts = attempts_result.scalars().all()

    latest_attempt = attempts[0] if attempts else None
    if (
        latest_attempt
        and latest_attempt.locked_until
        and latest_attempt.locked_until > now
    ):
        raise HTTPException(
            status_code=403,
            detail=f"Quiz is locked until {latest_attempt.locked_until.isoformat()} UTC",
        )

    attempt_number = (latest_attempt.attempt_number + 1) if latest_attempt else 1

    # Calculate score
    questions = quiz.questions or []
    score = 0
    for i, answer in enumerate(submission.answers):
        if i < len(questions) and answer == questions[i].get("correct_answer"):
            score += 1

    # Chapter quiz pass logic: pass >= 3/5
    passed = score >= CHAPTER_QUIZ_PASS_SCORE
    locked_until = None
    if not passed and attempt_number >= 2:
        locked_until = now + timedelta(hours=24)

    quiz_attempt = QuizAttempt(
        id=str(uuid.uuid4()),
        user_id=user_id,
        quiz_id=submission.quiz_id,
        attempt_number=attempt_number,
        score=score,
        passed=passed,
        locked_until=locked_until,
        attempted_at=now,
    )
    db.add(quiz_attempt)

    # Save result
    quiz_result = QuizResult(
        id=str(uuid.uuid4()),
        user_id=user_id,
        quiz_id=submission.quiz_id,
        score=score,
        total_questions=len(questions),
        answers=submission.answers,
    )
    db.add(quiz_result)

    # Update per-chapter progress if quiz passed
    if passed:
        progress_result = await db.execute(
            select(CourseProgress).where(
                CourseProgress.user_id == user_id,
                CourseProgress.course_id == course_id,
                CourseProgress.chapter_index == quiz.chapter_index,
            )
        )
        progress = progress_result.scalar_one_or_none()
        if progress:
            progress.completed = True
        else:
            # Create a new per-chapter progress record marking quiz as completed
            progress_record = CourseProgress(
                id=str(uuid.uuid4()),
                user_id=user_id,
                course_id=course_id,
                chapter_index=quiz.chapter_index,
                video_timestamp=0,
                completed=True,
            )
            db.add(progress_record)

    await db.commit()

    return {
        "id": quiz_result.id,
        "quiz_id": submission.quiz_id,
        "score": score,
        "total_questions": len(questions),
        "completed_at": datetime.utcnow(),
    }


@router.get("/{course_id}/final-exam", response_model=QuizResponse)
async def get_final_exam(course_id: str, db: AsyncSession = Depends(get_db)):
    """Get final exam for a course (15 questions)."""
    result = await db.execute(
        select(Quiz).where(
            Quiz.course_id == course_id, Quiz.chapter_index == FINAL_EXAM_CHAPTER_INDEX
        )
    )
    final_exam = result.scalar_one_or_none()

    if not final_exam:
        return {
            "id": str(uuid.uuid4()),
            "course_id": course_id,
            "chapter_index": FINAL_EXAM_CHAPTER_INDEX,
            "questions": [],
        }

    return {
        "id": final_exam.id,
        "course_id": final_exam.course_id,
        "chapter_index": final_exam.chapter_index,
        "questions": final_exam.questions or [],
    }


@router.post("/{course_id}/final-exam/generate")
async def generate_final_exam(course_id: str, db: AsyncSession = Depends(get_db)):
    """Generate final exam with 15 questions across course chapters."""
    chapters_result = await db.execute(
        select(CourseChapter)
        .where(CourseChapter.course_id == course_id)
        .order_by(CourseChapter.chapter_index)
    )
    chapters = chapters_result.scalars().all()

    if not chapters:
        raise HTTPException(
            status_code=404,
            detail="No chapters found for this course. Add chapters before final exam generation.",
        )

    context_lines = [
        f"Chapter {chapter.chapter_index}: {chapter.title}" for chapter in chapters
    ]
    final_exam_context = "\n".join(context_lines)

    questions = await ai_service.generate_quiz_questions(
        f"Final exam for course {course_id}.\n{final_exam_context}",
        num_questions=FINAL_EXAM_QUESTION_COUNT,
    )
    questions = (questions or [])[:FINAL_EXAM_QUESTION_COUNT]

    existing_result = await db.execute(
        select(Quiz).where(
            Quiz.course_id == course_id, Quiz.chapter_index == FINAL_EXAM_CHAPTER_INDEX
        )
    )
    existing_final_exam = existing_result.scalar_one_or_none()

    if existing_final_exam:
        existing_final_exam.questions = questions
        quiz_id = existing_final_exam.id
    else:
        final_exam = Quiz(
            id=str(uuid.uuid4()),
            course_id=course_id,
            chapter_index=FINAL_EXAM_CHAPTER_INDEX,
            questions=questions,
        )
        db.add(final_exam)
        quiz_id = final_exam.id

    await db.commit()

    return {
        "message": "Final exam generated",
        "quiz_id": quiz_id,
        "questions_count": len(questions),
    }


@router.post("/{course_id}/final-exam/submit", response_model=FinalExamResultResponse)
async def submit_final_exam(
    course_id: str,
    submission: FinalExamSubmission,
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Submit final exam answers and evaluate pass at >=70%."""
    result = await db.execute(
        select(Quiz).where(
            Quiz.id == submission.quiz_id,
            Quiz.course_id == course_id,
            Quiz.chapter_index == FINAL_EXAM_CHAPTER_INDEX,
        )
    )
    final_exam = result.scalar_one_or_none()

    if not final_exam:
        raise HTTPException(status_code=404, detail="Final exam not found")

    questions = final_exam.questions or []
    score = 0
    for i, answer in enumerate(submission.answers):
        if i < len(questions) and answer == questions[i].get("correct_answer"):
            score += 1

    total_questions = len(questions)
    percentage = (score / total_questions) if total_questions else 0
    passed = percentage >= FINAL_EXAM_PASS_PERCENTAGE

    result_record = QuizResult(
        id=str(uuid.uuid4()),
        user_id=user_id,
        quiz_id=submission.quiz_id,
        score=score,
        total_questions=total_questions,
        answers=submission.answers,
    )
    db.add(result_record)
    await db.commit()

    return {
        "id": result_record.id,
        "quiz_id": submission.quiz_id,
        "score": score,
        "total_questions": total_questions,
        "percentage": round(percentage * 100, 2),
        "passed": passed,
        "completed_at": datetime.utcnow(),
    }


@router.post("/{course_id}/download")
async def download_course(
    course_id: str, user_id: str, db: AsyncSession = Depends(get_db)
):
    """Download course for offline viewing"""
    # Get all chapters for the course
    result = await db.execute(
        select(CourseChapter).where(CourseChapter.course_id == course_id)
    )
    chapters = result.scalars().all()

    # Generate presigned URLs for each chapter video
    download_urls = []
    for chapter in chapters:
        try:
            # Extract object name from video URL
            object_name = chapter.video_url.split(f"/{minio_service.bucket_name}/")[-1]
            url = await minio_service.get_file_url(object_name, expires=3600)
            download_urls.append(
                {
                    "chapter_index": chapter.chapter_index,
                    "title": chapter.title,
                    "url": url,
                }
            )
        except Exception as e:
            print(f"Error generating URL for chapter {chapter.chapter_index}: {e}")

    return {
        "message": "Download started",
        "course_id": course_id,
        "download_urls": download_urls,
    }


@router.post("/{course_id}/certificate", response_model=CertificateResponse)
async def issue_certificate(
    course_id: str, user_id: str, db: AsyncSession = Depends(get_db)
):
    """Issue certificate upon course completion"""
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    course_result = await db.execute(select(Course).where(Course.id == course_id))
    course = course_result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Check completion
    progress_result = await db.execute(
        select(CourseProgress).where(
            CourseProgress.user_id == user_id,
            CourseProgress.course_id == course_id,
        )
    )
    progress_records = progress_result.scalars().all()
    if not progress_records or not any(p.completed for p in progress_records):
        raise HTTPException(
            status_code=400,
            detail="Complete all chapters and quizzes to get certificate",
        )

    # Must pass final exam (>=70%)
    final_exam_result = await db.execute(
        select(Quiz).where(
            Quiz.course_id == course_id, Quiz.chapter_index == FINAL_EXAM_CHAPTER_INDEX
        )
    )
    final_exam = final_exam_result.scalar_one_or_none()
    if not final_exam:
        raise HTTPException(status_code=400, detail="Final exam not generated")

    final_exam_submissions_result = await db.execute(
        select(QuizResult)
        .where(QuizResult.user_id == user_id, QuizResult.quiz_id == final_exam.id)
        .order_by(QuizResult.completed_at.desc())
    )
    final_exam_submissions = final_exam_submissions_result.scalars().all()
    final_exam_passed = any(
        (item.score / item.total_questions) >= FINAL_EXAM_PASS_PERCENTAGE
        for item in final_exam_submissions
        if item.total_questions
    )
    if not final_exam_passed:
        raise HTTPException(
            status_code=400,
            detail="Pass the final exam with at least 70% to get certificate",
        )

    # Return existing certificate if already issued
    existing_certificate_result = await db.execute(
        select(Certificate).where(
            Certificate.user_id == user_id,
            Certificate.course_id == course_id,
        )
    )
    existing_certificate = existing_certificate_result.scalar_one_or_none()
    if existing_certificate:
        return {
            "id": existing_certificate.id,
            "user_id": user_id,
            "course_id": course_id,
            "issued_at": existing_certificate.issued_at,
            "certificate_url": existing_certificate.certificate_url,
            "certificate_number": existing_certificate.certificate_number,
        }

    # Generate certificate
    certificate_number = f"ZORBYO-{uuid.uuid4().hex[:8].upper()}"
    issued_at = datetime.utcnow()
    pdf_data = certificate_service.generate_certificate_pdf(
        user_name=user.name or user.email,
        course_name=course.title,
        completion_date=issued_at,
        certificate_number=certificate_number,
    )

    certificate_url = await minio_service.upload_file(
        file_data=pdf_data,
        file_name=f"{certificate_number}.pdf",
        content_type="application/pdf",
        folder=f"certificates/{course_id}",
    )

    certificate = Certificate(
        id=str(uuid.uuid4()),
        user_id=user_id,
        course_id=course_id,
        issued_at=issued_at,
        certificate_url=certificate_url,
        certificate_number=certificate_number,
    )
    db.add(certificate)
    await db.commit()

    return {
        "id": certificate.id,
        "user_id": user_id,
        "course_id": course_id,
        "issued_at": certificate.issued_at,
        "certificate_url": certificate.certificate_url,
        "certificate_number": certificate_number,
    }


# Practice Quiz Schemas
class PracticeQuizRequest(BaseModel):
    domain: str
    level: int = 1


class PracticeQuizQuestion(BaseModel):
    question: str
    options: List[str]
    correct_answer: int
    explanation: Optional[str] = None


class PracticeQuizResponse(BaseModel):
    id: str
    domain: str
    level: int
    questions: List[PracticeQuizQuestion]
    pass_score: int


class PracticeQuizSubmission(BaseModel):
    quiz_id: str
    answers: List[int]
    domain: Optional[str] = None


class PracticeQuizResultResponse(BaseModel):
    id: str
    quiz_id: str
    domain: str
    level: int
    score: int
    total_questions: int
    percentage: float
    passed: bool
    completed_at: datetime
    feedback: Optional[str] = None


# Practice Quiz Endpoints
@router.post("/practice/generate")
async def generate_practice_quiz(
    request: PracticeQuizRequest,
    user_id: str = None,
    db: AsyncSession = Depends(get_db),
):
    """Generate a practice quiz for a specific domain and level"""
    domain_descriptions = {
        "Web Dev": "web development including HTML, CSS, JavaScript, React, Node.js, REST APIs, databases, and web security",
        "Mobile": "mobile app development including React Native, Flutter, iOS, Android, and cross-platform development",
        "UI/UX": "user interface and user experience design including wireframing, prototyping, accessibility, and design systems",
        "Graphics": "graphic design including typography, color theory, layout, branding, and design tools",
        "Video": "video production including filming, editing, motion graphics, and post-production",
        "Data Sci": "data science including statistics, machine learning, data visualization, and Python libraries like Pandas and NumPy",
        "ML/AI": "machine learning and artificial including neural networks, deep learning, NLP, computer vision, and model training",
        "Security": "cybersecurity including network security, penetration testing, encryption, and vulnerability assessment",
        "Cloud": "cloud computing including AWS, Azure, GCP, serverless, containers, and cloud architecture",
        "DevOps": "DevOps including CI/CD, Docker, Kubernetes, infrastructure as code, and monitoring",
        "Blockchain": "blockchain technology including smart contracts, DeFi, NFTs, and distributed systems",
        "Games": "game development including game design, Unity, Unreal Engine, and game mechanics",
        "Marketing": "digital marketing including SEO, social media, content marketing, and analytics",
        "Writing": "technical writing, copywriting, content creation, and documentation",
        "SEO": "search engine optimization including on-page, off-page, technical SEO, and analytics",
        "Social": "social media management including content strategy, community building, and platform optimization",
        "Photo": "photography including composition, lighting, editing, and camera techniques",
        "Audio": "audio production including recording, mixing, mastering, and sound design",
        "Animation": "animation including 2D, 3D, motion graphics, and character animation",
        "3D": "3D modeling and rendering including Blender, Maya, 3ds Max, and game assets",
        "Sales": "sales techniques including lead generation, CRM, negotiation, and closing deals",
        "Finance": "financial analysis, investment, budgeting, and financial modeling",
        "Accounting": "accounting principles, bookkeeping, financial statements, and tax preparation",
        "PM": "project management including Agile, Scrum, risk management, and team coordination",
        "HR": "human resources including recruitment, employee relations, and HR policies",
    }

    domain_context = domain_descriptions.get(
        request.domain, f"{request.domain} related topics"
    )

    # Adjust difficulty based on level
    difficulty_map = {
        1: "intermediate to advanced",
        2: "advanced",
        3: "expert level",
    }
    difficulty = difficulty_map.get(request.level, "intermediate to advanced")

    prompt = f"""
    Generate {PRACTICE_QUIZ_QUESTION_COUNT} difficult multiple-choice questions about {domain_context}.
    
    Requirements:
    - Questions should be {difficulty} difficulty
    - Each question must have exactly 4 options (A, B, C, D)
    - Include an explanation for why the correct answer is correct
    - Questions should test deep understanding, not just memorization
    - Cover a variety of subtopics within {request.domain}
    - Make questions challenging enough that only someone with real expertise would get most right
    
    Return ONLY valid JSON array format (no markdown, no code blocks):
    [
        {{
            "question": "Challenging question text?",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correct_answer": 0,
            "explanation": "Why this answer is correct"
        }}
    ]
    
    Make sure to generate exactly {PRACTICE_QUIZ_QUESTION_COUNT} questions.
    """

    try:
        questions = await ai_service.generate_quiz_questions(
            prompt,
            num_questions=PRACTICE_QUIZ_QUESTION_COUNT,
        )

        if not questions or len(questions) < PRACTICE_QUIZ_QUESTION_COUNT:
            # If AI fails, return a placeholder response
            return {
                "id": str(uuid.uuid4()),
                "domain": request.domain,
                "level": request.level,
                "questions": [],
                "pass_score": PRACTICE_QUIZ_PASS_SCORE,
                "message": "Failed to generate enough questions. Please try again.",
            }

        # Ensure we have exactly the required number of questions
        questions = questions[:PRACTICE_QUIZ_QUESTION_COUNT]

        # Save quiz to database (course_id is None for practice quizzes)
        practice_quiz = Quiz(
            id=str(uuid.uuid4()),
            course_id=None,
            chapter_index=request.level,  # Use level as chapter_index
            questions=questions,
        )
        db.add(practice_quiz)
        await db.commit()

        return {
            "id": practice_quiz.id,
            "domain": request.domain,
            "level": request.level,
            "questions": questions,
            "pass_score": PRACTICE_QUIZ_PASS_SCORE,
        }
    except Exception as e:
        print(f"Error generating practice quiz: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to generate quiz: {str(e)}"
        )


@router.post("/practice/submit", response_model=PracticeQuizResultResponse)
async def submit_practice_quiz(
    submission: PracticeQuizSubmission,
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Submit practice quiz answers and get results"""
    # Get quiz
    result = await db.execute(select(Quiz).where(Quiz.id == submission.quiz_id))
    quiz = result.scalar_one_or_none()

    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    # Calculate score
    questions = quiz.questions or []
    score = 0
    feedback_parts = []

    for i, answer in enumerate(submission.answers):
        if i < len(questions):
            question = questions[i]
            if answer == question.get("correct_answer"):
                score += 1
                feedback_parts.append(f"Q{i + 1}: Correct!")
            else:
                explanation = question.get("explanation", "")
                correct_option = question.get("options", [])[
                    question.get("correct_answer", 0)
                ]
                feedback_parts.append(
                    f"Q{i + 1}: Incorrect. The correct answer was: {correct_option}. {explanation}"
                )

    total_questions = len(questions)
    percentage = (score / total_questions) * 100 if total_questions > 0 else 0
    passed = score >= PRACTICE_QUIZ_PASS_SCORE

    # Save result
    quiz_result = QuizResult(
        id=str(uuid.uuid4()),
        user_id=user_id,
        quiz_id=submission.quiz_id,
        score=score,
        total_questions=total_questions,
        answers=submission.answers,
    )
    db.add(quiz_result)

    # Get domain from submission or infer from quiz
    domain = submission.domain or "Practice"
    level = quiz.chapter_index

    # Update or create PracticeDomainLevel record
    domain_level_result = await db.execute(
        select(PracticeDomainLevel).where(
            PracticeDomainLevel.user_id == user_id,
            PracticeDomainLevel.domain == domain,
        )
    )
    domain_level_record = domain_level_result.scalar_one_or_none()

    if domain_level_record:
        domain_level_record.attempts += 1
        if score > domain_level_record.best_score:
            domain_level_record.best_score = score
        if passed and level >= (domain_level_record.current_level - 1):
            domain_level_record.current_level = level + 1  # Next level to attempt
            domain_level_record.passed = True
            domain_level_record.completed_at = datetime.utcnow()
        domain_level_record.updated_at = datetime.utcnow()
    else:
        domain_level_record = PracticeDomainLevel(
            id=str(uuid.uuid4()),
            user_id=user_id,
            domain=domain,
            current_level=(level + 1) if passed else 1,
            passed=passed,
            best_score=score,
            attempts=1,
            completed_at=datetime.utcnow() if passed else None,
        )
        db.add(domain_level_record)

    # Update user XP and level if passed
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user and passed:
        user.xp = (user.xp or 0) + PRACTICE_QUIZ_XP_REWARD
        # Level up every 500 XP
        new_level = (user.xp // 500) + 1
        if new_level > (user.level or 1):
            user.level = new_level

    await db.commit()

    # Generate feedback summary
    feedback = f"Score: {score}/{total_questions} ({percentage:.1f}%). "
    feedback += "Passed! " if passed else "Not passed. "
    feedback += f"You need {PRACTICE_QUIZ_PASS_SCORE} correct answers to pass. "

    if passed:
        feedback += "Great job! You have demonstrated strong knowledge in this domain."
    else:
        feedback += "Keep practicing! Review the explanations for questions you missed."

    return {
        "id": quiz_result.id,
        "quiz_id": submission.quiz_id,
        "domain": domain,
        "level": level,
        "score": score,
        "total_questions": total_questions,
        "percentage": round(percentage, 2),
        "passed": passed,
        "completed_at": datetime.utcnow(),
        "feedback": feedback,
    }


@router.get("/practice/progress")
async def get_practice_progress(
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get practice progress for all domains for a user"""
    result = await db.execute(
        select(PracticeDomainLevel).where(PracticeDomainLevel.user_id == user_id)
    )
    domain_levels = result.scalars().all()

    progress = {}
    for dl in domain_levels:
        progress[dl.domain] = {
            "domain": dl.domain,
            "current_level": dl.current_level,
            "passed": dl.passed,
            "best_score": dl.best_score,
            "attempts": dl.attempts,
            "completed_at": dl.completed_at.isoformat() if dl.completed_at else None,
        }

    # Also return the user's current level and XP
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()

    return {
        "user_id": user_id,
        "level": user.level if user else 1,
        "xp": user.xp if user else 0,
        "domains": progress,
    }
