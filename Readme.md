# DriftBox

A personal cloud storage and file sync system built as a deep dive into distributed systems, microservices architecture, and scalable backend design. Inspired by Dropbox.

---

## What It Does

- Upload and download files from anywhere via chunked, resumable transfers
- Automatically sync file changes across multiple connected devices in real time
- Version every file and restore any previous state
- Share files with other users via signed links with optional expiry
- Search files by name across your entire file system

## Architecture

Five independent microservices behind an NGINX API gateway, communicating via RabbitMQ for async events and WebSockets for real-time device sync.

<img src="images/Architecture.jpg" width="700" />

## Services

### Auth Service
Handles registration, login, logout, and token management. Issues short-lived JWT access tokens (15 minutes) and long-lived refresh tokens (30 days) stored in PostgreSQL. Refresh tokens are rotated on every use.

### Upload Service
Accepts files as 4MB chunks. Each chunk is SHA-256 hashed before storage — if the hash already exists in MinIO, the upload is skipped entirely (content-addressed deduplication). Upload sessions are tracked in Redis. On completion, a database transaction records the file and version, and a `file.uploaded` event is published to RabbitMQ.

### Metadata Service
Manages the logical file and folder structure per user. Handles file listing with pagination, single file retrieval, soft deletion, version history, version restore, and name search. Hot metadata is cached in Redis with a 60-second TTL. Version restore runs inside a Postgres transaction to guarantee consistency.

### Sync Service
Consumes `file.uploaded` and `file.shared` events from RabbitMQ. Maintains persistent WebSocket connections per user, grouped by device. When an event arrives, it pushes a real-time notification to all connected devices belonging to that user. Each user's devices are isolated — events never leak across users.

### Share Service
Generates signed share links with optional expiry. Public link access requires no authentication. Link management (create, revoke, list) requires auth and is scoped to the owning user - you cannot revoke someone else's link. Publishes a `file.shared` event on creation.

---

