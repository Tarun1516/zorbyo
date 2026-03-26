"""
Upload local course files to MinIO with proper folder structure.

Usage:
    python upload_courses.py
    python upload_courses.py --course "Intro to Data Science" --path "D:\zorbyo\courses\Into to Data science"
"""

import argparse
import os
import sys
from pathlib import Path
from minio import Minio
from minio.error import S3Error

# MinIO config (matches docker-compose.yml)
MINIO_ENDPOINT = "localhost:9000"
MINIO_ACCESS_KEY = "minioadmin"
MINIO_SECRET_KEY = "minioadmin"
BUCKET_NAME = "zorbyo"


def get_client() -> Minio:
    """Create MinIO client."""
    return Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=False,
    )


def ensure_bucket(client: Minio, bucket: str):
    """Create bucket if it doesn't exist."""
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
        print(f"[+] Created bucket: {bucket}")
    else:
        print(f"[=] Bucket exists: {bucket}")


def upload_course(
    client: Minio,
    bucket: str,
    course_name: str,
    local_dir: str,
    content_type: str = "video/mp4",
):
    """
    Upload all files from local_dir to:
        {bucket}/courses/{course_name}/{filename}
    """
    local_path = Path(local_dir)
    if not local_path.exists():
        print(f"[!] Directory not found: {local_dir}")
        return

    files = sorted(
        [f for f in local_path.iterdir() if f.is_file()],
        key=lambda f: f.name,
    )

    if not files:
        print(f"[!] No files found in: {local_dir}")
        return

    print(f"\n[*] Uploading {len(files)} files to: {bucket}/courses/{course_name}/\n")

    uploaded = 0
    for file in files:
        # Build object path: courses/{course_name}/{filename}
        object_name = f"courses/{course_name}/{file.name}"

        file_size = file.stat().st_size
        file_size_mb = file_size / (1024 * 1024)

        try:
            # Detect content type from extension
            ext = file.suffix.lower()
            ct = {
                ".mp4": "video/mp4",
                ".webm": "video/webm",
                ".pdf": "application/pdf",
                ".jpg": "image/jpeg",
                ".png": "image/png",
                ".json": "application/json",
            }.get(ext, "application/octet-stream")

            client.fput_object(
                bucket_name=bucket,
                object_name=object_name,
                file_path=str(file),
                content_type=ct,
            )
            uploaded += 1
            print(f"  [+] {file.name} ({file_size_mb:.1f} MB)")

        except S3Error as e:
            print(f"  [!] Failed: {file.name} — {e}")

    print(f"\n[✓] Uploaded {uploaded}/{len(files)} files")
    print(f"[=] Path: {bucket}/courses/{course_name}/")


def list_courses(client: Minio, bucket: str):
    """List all courses in the bucket."""
    print(f"\n[*] Courses in {bucket}/courses/:\n")

    # List unique course folders
    objects = client.list_objects(bucket, prefix="courses/", recursive=False)
    folders = set()
    for obj in objects:
        if obj.object_name.endswith("/"):
            folders.add(obj.object_name)

    if not folders:
        # Try recursive to find nested files
        all_objects = client.list_objects(bucket, prefix="courses/", recursive=True)
        for obj in all_objects:
            parts = obj.object_name.split("/")
            if len(parts) >= 3:
                folders.add(f"courses/{parts[1]}/")

    if not folders:
        print("  (empty)")
        return

    for folder in sorted(folders):
        # Count files in each course
        count = 0
        total_size = 0
        items = client.list_objects(bucket, prefix=folder, recursive=True)
        for item in items:
            if not item.object_name.endswith("/"):
                count += 1
                total_size += item.size or 0

        size_mb = total_size / (1024 * 1024)
        print(f"  {folder} — {count} files, {size_mb:.1f} MB")


def main():
    parser = argparse.ArgumentParser(description="Upload courses to MinIO")
    parser.add_argument(
        "--list",
        action="store_true",
        help="List existing courses in MinIO",
    )
    parser.add_argument(
        "--course",
        type=str,
        help="Course name (used as folder name, e.g. 'intro-to-data-science')",
    )
    parser.add_argument(
        "--path",
        type=str,
        help="Local directory containing course files",
    )
    parser.add_argument(
        "--bucket",
        type=str,
        default=BUCKET_NAME,
        help=f"Bucket name (default: {BUCKET_NAME})",
    )

    args = parser.parse_args()

    # Connect to MinIO
    print(f"[*] Connecting to MinIO at {MINIO_ENDPOINT}...")
    try:
        client = get_client()
        ensure_bucket(client, args.bucket)
    except Exception as e:
        print(f"[!] Cannot connect to MinIO: {e}")
        print("[?] Is MinIO running? Try: docker-compose up -d minio")
        sys.exit(1)

    if args.list:
        list_courses(client, args.bucket)
        return

    if args.course and args.path:
        upload_course(client, args.bucket, args.course, args.path)
        list_courses(client, args.bucket)
        return

    # Interactive mode: upload the default course
    default_course = "intro-to-data-science"
    default_path = r"D:\zorbyo\courses\Into to Data science"

    if Path(default_path).exists():
        print(f"\n[*] Found course files at: {default_path}")
        upload_course(client, args.bucket, default_course, default_path)
        list_courses(client, args.bucket)
    else:
        print("\n[*] Usage examples:")
        print(f"  python {__file__} --list")
        print(
            f'  python {__file__} --course "intro-to-data-science" --path "D:\\zorbyo\\courses\\Into to Data science"'
        )
        print(
            f'  python {__file__} --course "web-development" --path "D:\\courses\\webdev"'
        )


if __name__ == "__main__":
    main()
