# DriftBox — System Framework

> A personal cloud storage system inspired by Dropbox, built for learning distributed systems, file sync, and scalable architecture.

## 1. Project Overview

**DriftBox** is a cloud file storage and sync system that allows users to:
- Upload and download files from anywhere
- Automatically sync files across multiple devices
- Version files and restore previous states
- Share files and folders with other users

**Core Design Philosophy:**
- Files are split into **chunks** for efficient upload, deduplication, and partial sync
- Only **changed chunks** are synced (delta sync) — not entire files
- The system is built around **eventual consistency** with conflict resolution

---

### Functional Requirements
- User registration, login, and authentication
- Upload files (single + chunked for large files)
- Download files via secure, time-limited URLs
- Automatic file sync across devices
- File versioning (view and restore previous versions)
- Share files/folders with permissions (view / edit)
- Folder hierarchy support
- File search by name and metadata