# ADR 0001: RustFS object storage

The user selected RustFS instead of MinIO. PostgreSQL continues to own document metadata; RustFS owns evidence bytes through the S3-compatible adapter.

Local S3 and console endpoints bind to loopback on ports 9000 and 9001. The container follows the official RustFS environment variable configuration:
https://docs.rustfs.com/en/installation/container

The local RustFS image is pinned to the verified pulled digest `sha256:8cc9801755448b71a786705ce76692c77e14936cccd87cf2fc31842e58f4d1ff`. S3 upload and retrieval are exercised by the live import test. Versioning, retention/object lock and conditional-write races require further integration evidence before production acceptance.
