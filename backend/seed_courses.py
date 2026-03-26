"""
Seed course data from MinIO into the database.

Usage:
    python seed_courses.py
    python seed_courses.py --list
"""

import asyncio
import argparse
import uuid
from minio import Minio
from minio.error import S3Error

# MinIO config
MINIO_ENDPOINT = "localhost:9000"
MINIO_ACCESS_KEY = "minioadmin"
MINIO_SECRET_KEY = "minioadmin"
BUCKET_NAME = "zorbyo"


def get_minio_client() -> Minio:
    return Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=False,
    )


def list_courses_in_minio(client: Minio):
    """List all courses (folders) in MinIO bucket."""
    print(f"\n[*] Scanning bucket: {BUCKET_NAME}\n")

    courses = {}
    objects = client.list_objects(BUCKET_NAME, prefix="courses/", recursive=True)

    for obj in objects:
        if obj.object_name.endswith("/"):
            continue

        parts = obj.object_name.split("/")
        if len(parts) >= 3:
            course_folder = parts[1]
            filename = parts[-1]

            if course_folder not in courses:
                courses[course_folder] = []

            courses[course_folder].append(
                {
                    "filename": filename,
                    "object_name": obj.object_name,
                    "size": obj.size or 0,
                }
            )

    for course_name, files in courses.items():
        total_size = sum(f["size"] for f in files)
        size_mb = total_size / (1024 * 1024)
        print(f"  [Course] {course_name}")
        print(f"    Files: {len(files)}")
        print(f"    Size:  {size_mb:.1f} MB")
        for f in sorted(files, key=lambda x: x["filename"]):
            f_size_mb = f["size"] / (1024 * 1024)
            print(f"      - {f['filename']} ({f_size_mb:.1f} MB)")
        print()

    return courses


async def seed_courses():
    """Seed course data from MinIO into the database."""
    from app.core.database import async_session_factory
    from app.models.models import Course, CourseChapter
    from sqlalchemy import select, delete

    client = get_minio_client()
    courses_in_minio = list_courses_in_minio(client)

    if not courses_in_minio:
        print(
            "[!] No courses found in MinIO. Upload courses first using upload_courses.py"
        )
        return

    print(f"\n[*] Seeding {len(courses_in_minio)} courses into database...\n")

    async with async_session_factory() as db:
        for course_name, files in courses_in_minio.items():
            # Check if course already exists
            result = await db.execute(select(Course).where(Course.title == course_name))
            existing = result.scalar_one_or_none()

            if existing:
                print(f"  [=] Course already exists: {course_name}")
                continue

            # Create course
            course_id = str(uuid.uuid4())
            course = Course(
                id=course_id,
                title=course_name,
                description=f"Course: {course_name}",
                domain="General",
                chapters=len(files),
                duration_hours=round(
                    len(files) * 0.5, 1
                ),  # Estimate 30 min per chapter
            )
            db.add(course)
            await db.flush()

            # Create chapters from files
            sorted_files = sorted(files, key=lambda f: f["filename"])
            for i, file_info in enumerate(sorted_files):
                # Generate MinIO URL for video
                video_url = (
                    f"http://{MINIO_ENDPOINT}/{BUCKET_NAME}/{file_info['object_name']}"
                )

                chapter = CourseChapter(
                    id=str(uuid.uuid4()),
                    course_id=course_id,
                    chapter_index=i + 1,
                    title=file_info["filename"].replace("_", " ").replace(".mp4", ""),
                    video_url=video_url,
                    duration_seconds=1800,  # Default 30 min, can be updated later
                )
                db.add(chapter)

            print(f"  [+] Seeded course: {course_name} ({len(files)} chapters)")

        await db.commit()

    print(f"\n[✓] Seeding complete!")


async def list_seeded_courses():
    """List courses in the database."""
    from app.core.database import async_session_factory
    from app.models.models import Course, CourseChapter
    from sqlalchemy import select

    async with async_session_factory() as db:
        result = await db.execute(select(Course))
        courses = result.scalars().all()

        if not courses:
            print("\n[*] No courses in database. Run: python seed_courses.py")
            return

        print(f"\n[*] Courses in database ({len(courses)}):\n")
        for course in courses:
            chapters_result = await db.execute(
                select(CourseChapter)
                .where(CourseChapter.course_id == course.id)
                .order_by(CourseChapter.chapter_index)
            )
            chapters = chapters_result.scalars().all()

            print(f"  [{course.domain}] {course.title}")
            print(f"    ID: {course.id}")
            print(f"    Chapters: {len(chapters)}")
            for ch in chapters:
                print(f"      {ch.chapter_index}. {ch.title}")
            print()


def main():
    parser = argparse.ArgumentParser(description="Seed courses from MinIO to database")
    parser.add_argument(
        "--list", action="store_true", help="List courses in MinIO only"
    )
    parser.add_argument("--db", action="store_true", help="List courses in database")
    parser.add_argument(
        "--seed", action="store_true", help="Seed courses into database"
    )

    args = parser.parse_args()

    if args.list:
        client = get_minio_client()
        list_courses_in_minio(client)
    elif args.db:
        asyncio.run(list_seeded_courses())
    elif args.seed:
        asyncio.run(seed_courses())
    else:
        # Default: seed
        asyncio.run(seed_courses())


if __name__ == "__main__":
    main()
