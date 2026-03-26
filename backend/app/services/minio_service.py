from minio import Minio
from minio.error import S3Error
from typing import Optional
import io
import uuid

from app.core.config import settings


class MinIOService:
    """Service for MinIO file storage"""

    def __init__(self):
        self.client = None
        self.bucket_name = settings.MINIO_BUCKET_NAME
        self._initialized = False

    def _lazy_init(self):
        """Lazy initialization - only connect when needed"""
        if self._initialized:
            return True
        try:
            self.client = Minio(
                settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=settings.MINIO_SECURE,
            )
            self._ensure_bucket()
            self._initialized = True
            return True
        except Exception as e:
            print(f"MinIO initialization failed: {e}")
            return False

    def _ensure_bucket(self):
        """Ensure bucket exists"""
        try:
            if self.client and not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
                print(f"Bucket '{self.bucket_name}' created")
        except S3Error as e:
            print(f"Error creating bucket: {e}")

    async def upload_file(
        self,
        file_data: bytes,
        file_name: str,
        content_type: str = "application/octet-stream",
        folder: str = "uploads",
    ) -> str:
        """
        Upload file to MinIO

        Args:
            file_data: File bytes
            file_name: Original file name
            content_type: MIME type
            folder: Folder path in bucket

        Returns:
            URL of uploaded file
        """
        if not self._lazy_init():
            raise Exception("MinIO service not available")

        try:
            # Generate unique file name
            ext = file_name.split(".")[-1] if "." in file_name else ""
            unique_name = (
                f"{folder}/{uuid.uuid4().hex}.{ext}"
                if ext
                else f"{folder}/{uuid.uuid4().hex}"
            )

            # Upload file
            self.client.put_object(
                self.bucket_name,
                unique_name,
                io.BytesIO(file_data),
                len(file_data),
                content_type=content_type,
            )

            # Return URL
            scheme = "https" if settings.MINIO_SECURE else "http"
            return (
                f"{scheme}://{settings.MINIO_ENDPOINT}/{self.bucket_name}/{unique_name}"
            )
        except S3Error as e:
            print(f"Error uploading file: {e}")
            raise

    async def upload_video(
        self, video_data: bytes, course_id: str, chapter_index: int
    ) -> str:
        """
        Upload course video

        Args:
            video_data: Video file bytes
            course_id: Course ID
            chapter_index: Chapter number

        Returns:
            URL of uploaded video
        """
        return await self.upload_file(
            video_data,
            f"chapter_{chapter_index}.mp4",
            "video/mp4",
            f"courses/{course_id}",
        )

    async def get_file_url(self, object_name: str, expires: int = 3600) -> str:
        """
        Get presigned URL for file

        Args:
            object_name: Object path in bucket
            expires: URL expiration in seconds

        Returns:
            Presigned URL
        """
        if not self._lazy_init():
            raise Exception("MinIO service not available")

        try:
            return self.client.presigned_get_object(
                self.bucket_name, object_name, expires=expires
            )
        except S3Error as e:
            print(f"Error getting file URL: {e}")
            raise

    async def delete_file(self, object_name: str) -> bool:
        """
        Delete file from MinIO

        Args:
            object_name: Object path in bucket

        Returns:
            Success status
        """
        if not self._lazy_init():
            return False

        try:
            self.client.remove_object(self.bucket_name, object_name)
            return True
        except S3Error as e:
            print(f"Error deleting file: {e}")
            return False

    async def list_files(self, prefix: str = "", recursive: bool = False) -> list:
        """
        List files in bucket

        Args:
            prefix: Folder prefix
            recursive: List recursively

        Returns:
            List of object names
        """
        if not self._lazy_init():
            return []

        try:
            objects = self.client.list_objects(
                self.bucket_name, prefix=prefix, recursive=recursive
            )
            return [obj.object_name for obj in objects]
        except S3Error as e:
            print(f"Error listing files: {e}")
            return []

    async def list_courses_from_minio(self) -> dict:
        """
        Scan MinIO bucket and return courses with their files.

        Returns:
            Dict mapping course_name -> list of file info dicts
        """
        if not self._lazy_init():
            return {}

        try:
            courses = {}
            objects = self.client.list_objects(
                self.bucket_name, prefix="courses/", recursive=True
            )

            for obj in objects:
                if not obj.object_name or obj.object_name.endswith("/"):
                    continue

                parts = obj.object_name.split("/")
                if len(parts) >= 3:
                    course_folder = parts[1]
                    filename = parts[-1]

                    if course_folder not in courses:
                        courses[course_folder] = []

                    scheme = "https" if settings.MINIO_SECURE else "http"
                    video_url = f"{scheme}://{settings.MINIO_ENDPOINT}/{self.bucket_name}/{obj.object_name}"

                    courses[course_folder].append(
                        {
                            "filename": filename,
                            "object_name": obj.object_name,
                            "video_url": video_url,
                            "size": obj.size or 0,
                        }
                    )

            return courses
        except S3Error as e:
            print(f"Error listing courses from MinIO: {e}")
            return {}


minio_service = MinIOService()
