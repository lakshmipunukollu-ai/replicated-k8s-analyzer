import os
from typing import Optional

import boto3

from app.config import settings


class S3Service:
    def __init__(self):
        if settings.USE_S3:
            self.client = boto3.client(
                "s3",
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                region_name=settings.AWS_S3_REGION,
            )
        else:
            self.client = None

    def upload_bundle(self, file_path: str, bundle_id: str, filename: str) -> str:
        """Upload bundle to S3, return S3 key."""
        if not settings.USE_S3 or not self.client:
            return file_path
        s3_key = f"bundles/{bundle_id}/{filename}"
        self.client.upload_file(file_path, settings.AWS_S3_BUCKET, s3_key)
        return s3_key

    def download_bundle(self, s3_key: str, local_path: str) -> str:
        """Download bundle from S3 to local path, return local path."""
        if not settings.USE_S3 or not self.client:
            return s3_key
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        self.client.download_file(settings.AWS_S3_BUCKET, s3_key, local_path)
        return local_path

    def delete_bundle(self, s3_key: str) -> None:
        """Delete bundle from S3."""
        if not settings.USE_S3 or not self.client:
            return
        self.client.delete_object(Bucket=settings.AWS_S3_BUCKET, Key=s3_key)

    def get_presigned_url(self, s3_key: str, expiry: int = 3600) -> str:
        """Generate presigned download URL."""
        if not settings.USE_S3 or not self.client:
            return ""
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.AWS_S3_BUCKET, "Key": s3_key},
            ExpiresIn=expiry,
        )

    def ensure_bundle_local(self, file_path: str, s3_key: Optional[str]) -> str:
        """If bundle is in S3 and local file is missing, download it. Return local path."""
        if not s3_key or not settings.USE_S3 or not self.client:
            return file_path
        if os.path.isfile(file_path):
            return file_path
        self.download_bundle(s3_key, file_path)
        return file_path
