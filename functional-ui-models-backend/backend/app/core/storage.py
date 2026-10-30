"""Short-lived storage for uploads and Grad-CAM heatmaps.

Two backends behind one interface (design doc Sections 2, 7, 11):

* ``local`` – a directory on a Docker volume shared by the API and workers.
  Default on the 8 GB demo laptop: no extra container, no extra RAM.
* ``s3``    – any S3-compatible store (MinIO, AWS S3) for a multi-host setup.

Keys are random (``uploads/<uuid>``); original file names are never used.
Uploads are deleted by the worker when its task ends; ``sweep_older_than``
is the safety net run by the hourly retention task.
"""

from __future__ import annotations

import os
import shutil
import time
import uuid
from abc import ABC, abstractmethod
from pathlib import Path

from app.core.config import settings


def new_upload_key() -> str:
    return f"uploads/{uuid.uuid4().hex}"


def explanation_prefix(analysis_id: str) -> str:
    return f"explanations/{analysis_id}/"


class Storage(ABC):
    @abstractmethod
    def put_file(self, key: str, path: str) -> None: ...

    @abstractmethod
    def put_bytes(self, key: str, data: bytes) -> None: ...

    @abstractmethod
    def get_to_file(self, key: str, path: str) -> None: ...

    @abstractmethod
    def get_bytes(self, key: str) -> bytes: ...

    @abstractmethod
    def exists(self, key: str) -> bool: ...

    @abstractmethod
    def delete(self, key: str) -> None: ...

    @abstractmethod
    def delete_prefix(self, prefix: str) -> int: ...

    @abstractmethod
    def sweep_older_than(self, prefix: str, max_age_s: float) -> int: ...

    @abstractmethod
    def healthy(self) -> bool: ...


class LocalStorage(Storage):
    """Files under ``MML_STORAGE_ROOT``; keys map to relative paths."""

    def __init__(self, root: str):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        # Defence in depth: keys are generated server-side, but never escape the root.
        if self.root.resolve() not in p.parents and p != self.root.resolve():
            raise ValueError("storage key escapes root")
        return p

    def put_file(self, key: str, path: str) -> None:
        dest = self._path(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(path, dest)  # same volume -> rename, no copy

    def put_bytes(self, key: str, data: bytes) -> None:
        dest = self._path(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(".part")
        tmp.write_bytes(data)
        os.replace(tmp, dest)

    def get_to_file(self, key: str, path: str) -> None:
        shutil.copyfile(self._path(key), path)

    def get_bytes(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def exists(self, key: str) -> bool:
        return self._path(key).exists()

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def delete_prefix(self, prefix: str) -> int:
        target = self._path(prefix.rstrip("/"))
        if not target.exists():
            return 0
        count = sum(1 for p in target.rglob("*") if p.is_file())
        shutil.rmtree(target, ignore_errors=True)
        return count

    def sweep_older_than(self, prefix: str, max_age_s: float) -> int:
        base = self._path(prefix.rstrip("/"))
        if not base.exists():
            return 0
        cutoff, removed = time.time() - max_age_s, 0
        for p in base.rglob("*"):
            if p.is_file() and p.stat().st_mtime < cutoff:
                p.unlink(missing_ok=True)
                removed += 1
        return removed

    def healthy(self) -> bool:
        probe = self.root / ".probe"
        try:
            probe.write_bytes(b"ok")
            probe.unlink()
            return True
        except OSError:
            return False


class S3Storage(Storage):
    """S3-compatible backend; boto3 is imported lazily (not needed on the laptop)."""

    def __init__(self) -> None:
        import boto3  # noqa: PLC0415 – optional dependency

        self.bucket = settings.s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
        )

    def put_file(self, key: str, path: str) -> None:
        self.client.upload_file(path, self.bucket, key)
        os.remove(path)

    def put_bytes(self, key: str, data: bytes) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data)

    def get_to_file(self, key: str, path: str) -> None:
        self.client.download_file(self.bucket, key, path)

    def get_bytes(self, key: str) -> bytes:
        return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:  # noqa: BLE001 – botocore ClientError on 404
            return False

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def _list(self, prefix: str):  # type: ignore[no-untyped-def]
        paginator = self.client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            yield from page.get("Contents", [])

    def delete_prefix(self, prefix: str) -> int:
        n = 0
        for obj in self._list(prefix):
            self.delete(obj["Key"])
            n += 1
        return n

    def sweep_older_than(self, prefix: str, max_age_s: float) -> int:
        cutoff, n = time.time() - max_age_s, 0
        for obj in self._list(prefix):
            if obj["LastModified"].timestamp() < cutoff:
                self.delete(obj["Key"])
                n += 1
        return n

    def healthy(self) -> bool:
        try:
            self.client.head_bucket(Bucket=self.bucket)
            return True
        except Exception:  # noqa: BLE001
            return False


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        _storage = S3Storage() if settings.storage_backend == "s3" else LocalStorage(settings.storage_root)
    return _storage


def set_storage(storage: Storage | None) -> None:
    """Test hook."""
    global _storage
    _storage = storage
