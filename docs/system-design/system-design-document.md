# System Design Document: Mad-Eye Moody Lens

**Project:** Mad-Eye Moody Lens  
**Course:** DA-IICT IT314 Software Engineering  
**Version:** 1.0 (Production Release & Coursework Submission)  
**Date:** November 2026  
**Authors:** Student Engineering Team  

---

## 1. Introduction

The rapid proliferation of generative artificial intelligence and synthetic media generation tools has made creating convincing altered media effortless. Deepfake images, manipulated facial expressions, synthetic speech clones, and spliced videos pose substantial risks to democratic elections, public discourse, academic authenticity, and journalistic integrity.

**Mad-Eye Moody Lens** is an automated digital forensics and multi-modal deepfake detection platform developed as part of the DA-IICT IT314 Software Engineering curriculum. The platform evaluates uploaded images, audio clips, and videos to estimate the probability that the media has been AI-generated or manipulated.

Crucially, the system operates under realistic engineering constraints:
* **Pretrained Models Only:** The project team does not train custom deep learning models. Instead, verified open-source pretrained models from the scientific community are integrated behind standardized software interfaces.
* **CPU-Only Constrained Execution:** Designed and verified to run on commodity hardware (8 GB RAM, 256 GB disk, CPU-only execution without requiring GPU infrastructure).
* **Strict Privacy by Design:** The system never permanently stores, logs, or exposes uploaded user media bytes, facial crops, audio frames, original file names, or client IP addresses.
* **Hybrid Compute Forensics:** Heavy deep learning inference and perceptual batch matching are offloaded to backend workers, while privacy-sensitive utilities (cryptographic hash generation and EXIF metadata extraction) execute entirely client-side in the user's browser.

---

## 2. System Overview

### 2.1 Core Capabilities

Mad-Eye Moody Lens provides a multi-layered suite of forensic analysis and media integrity tools:

1. **Multi-Modal Deepfake Analysis:**
   * **AI-Generated Image Detection:** Evaluates structural diffusion and synthetic generative patterns using a Swin Transformer architecture.
   * **Facial Manipulation Detection:** Detects face-swapping, GAN artifacts, and blending boundaries on human faces extracted via Haar cascades using an EfficientNet-B0 convolutional network.
   * **Synthetic Speech & Audio Detection:** Evaluates voice recordings and soundtrack spectrograms across sliding 4-second windows using a Wav2Vec2 audio transformer.
   * **Comprehensive Video Analysis:** Samples 24 evenly spaced frames across the video duration for facial manipulation while simultaneously stripping and evaluating the underlying audio track.
2. **Explainable AI (XAI) with Grad-CAM:**
   * Generates Gradient-weighted Class Activation Mapping (Grad-CAM) attention heatmaps for the face model, pinpointing the exact spatial pixel coordinates (eyes, mouth, boundary seams) that triggered a manipulation verdict.
   * Returns attention values and bounding boxes as JSON coordinate arrays. The client browser composites the visual heatmap directly over the user's local file, ensuring zero server-side pixel retention.
3. **Forensic Utilities Suite:**
   * **Batch Duplicate Image Detector:** Analyzes collections of up to 20 images simultaneously, segregating them into exact byte duplicates (SHA-256), perceptual duplicates (pHash with Hamming distance $\le 10$), and unique images, complete with downloadable forensic PDF dossiers.
   * **SHA-256 Generator & Comparator:** High-throughput browser-based cryptographic fingerprinting, side-by-side hash comparison, NIST test vector verification, and tamper-evident manifest generation.
   * **Image Metadata & EXIF Viewer:** Browser-local extraction and normalization of EXIF, TIFF, camera, and GPS metadata, converting rational DMS coordinates into interactive OpenStreetMap coordinates without server transmission.

### 2.2 Primary User Personas

| Persona | Primary Goals | Key Platform Touchpoints |
| :--- | :--- | :--- |
| **General Public Citizen** | Rapid, friction-free triage of suspicious social media images or voice notes. | Zero-login web dashboard, rapid analysis (< 1 s for images), plain-language verdicts (`likely_real`, `uncertain`, `likely_fake`). |
| **Investigative Journalist & Fact-Checker** | In-depth technical verification, forensic explainability, and verifiable evidence export. | Grad-CAM spatial heatmaps, segment-by-segment timeline breakdowns, certified PDF audit dossiers, EXIF metadata inspection. |
| **Platform Moderator / Trust & Safety** | Bulk verification of suspicious post attachments and rapid image deduplication. | Batch Duplicate Image Detector, SHA-256 manifest verification, Browser Extension contextual menus. |
| **Academic Evaluator & Developer** | Code inspection, API contract validation, and architectural verification. | Standardized REST endpoints (`/api/v1`), automated contract parity checks, stub backend modes (`MML_DETECTOR_BACKEND=stub`). |

### 2.3 Supported Client Interfaces

* **Web Application (Primary):** Single Page Application (SPA) built with React 18, TypeScript, and Vite, featuring an accessible editorial design system.
* **Chrome Browser Extension:** Manifest V3 extension providing in-page right-click image and video inspection, communicating with the backend via a dedicated service worker.
* **Telegram Bot (`mml_bot`):** A headless, asynchronous client allowing mobile messaging users to forward photos, voice notes, and videos directly for automated forensic scoring.
* **Reddit Extension (`moody_lens_ext`):** A modular API router mounted directly into the FastAPI application to ingest and evaluate media embedded in Reddit community feeds.

---

## 3. Architectural Style

The architecture of Mad-Eye Moody Lens balances resource constraints (CPU execution on 8 GB RAM laptops), strict privacy guarantees, and diverse client integrations through several complementary architectural styles:

```
[ Web Browser (React SPA) ]   [ Browser Extension (MV3) ]   [ Telegram Bot ]   [ Reddit Client ]
              \                         |                        /                    /
               \                        |                       /                    /
                +-----------------------+----------------------+--------------------+
                                        | (HTTP/JSON REST API)
                                        v
                    +---------------------------------------+
                    |        FastAPI API Gateway            |
                    |  - Rate Limiting (HMAC IP)            |
                    |  - Upload Validation (Pillow/ffprobe) |
                    |  - Schemas & Error Envelope           |
                    +-------------------+-------------------+
                                        |
                 +----------------------+----------------------+
                 | (Redis Message Broker & Pub/Sub)            |
                 v                                             v
    +-------------------------+                   +-------------------------+
    |   Celery Worker: Fast   |                   |  Celery Worker: Video   |
    | - Queue: inference.fast |                   | - Queue: inference.video|
    | - Concurrency: 1        |                   | - Concurrency: 1        |
    | - Image + Face + Audio  |                   | - Face + Audio Models   |
    +-------------------------+                   +-------------------------+
                 |                                             |
                 +----------------------+----------------------+
                                        v
                    +---------------------------------------+
                    |          Data & Storage Layer         |
                    | - PostgreSQL / SQLite (Analyses, Jobs)|
                    | - Redis (Worker Heartbeats, Cache)    |
                    | - Ephemeral Local Storage / S3        |
                    +---------------------------------------+
```

### 3.1 Client-Server REST Architecture
The core backend exposes a stateless, contract-typed HTTP REST API under `/api/v1`. All client applications—whether the React SPA, the Chrome extension, or the Telegram bot—interact with the backend strictly through this standardized JSON contract. The backend enforces uniform error envelopes (`{"error": "<plain-language message>"}`) and structured HTTP status codes.

### 3.2 Modular Monolith Backend
The backend is structured as a modular monolith within a single Python repository (`functional-ui-models-backend/backend/app`). Rather than adopting an operationally complex microservices mesh that would exceed the 8 GB RAM laptop envelope, distinct domain boundaries (media preprocessing, model loading, pipeline orchestration, job state, persistence) are maintained through strict internal module interfaces and Python packaging.

### 3.3 Asynchronous Task Queue / Job Processing Pattern
To prevent long-running inference jobs from blocking the web server event loop:
* **API Isolation:** The FastAPI process **never imports** heavy machine learning libraries (PyTorch, Torchvision, Transformers, Librosa, or OpenCV). It accepts uploads, validates headers and magic bytes, creates database records, and immediately delegates compute to Celery workers.
* **Queue Segregation:**
  * `inference.fast`: Dedicated to single image and short audio analysis. The API waits synchronously up to 30 seconds for fast triage, returning HTTP 200 upon completion.
  * `inference.video`: Dedicated to heavy multi-frame video extraction. The API enqueues the job and immediately returns HTTP 202 Accepted with a unique `job_id`. Clients poll `/api/v1/jobs/{id}` for live progress.
  * `maintenance`: Handles background retention cleanup (purging records older than 7 days and ephemeral files), consumed by the video worker during idle periods.

### 3.4 Hybrid Server-Client Compute Partitioning
A defining architectural strategy of Mad-Eye Moody Lens is intelligent compute placement:
* **Server-Side Compute:** Reserved strictly for operations requiring complex models (transformer inference, Haar face detection) or multi-image comparison matrices (batch perceptual hash calculation).
* **Client-Side Compute:** Sensitive, privacy-critical forensic utilities execute entirely inside the client's browser using modern Web APIs (Web Crypto API for SHA-256 hashing; `exifr` for binary EXIF parsing; `jsPDF` for client-side report generation). This eliminates unnecessary bandwidth consumption and guarantees that private camera metadata and sensitive documents never touch server disks.

---

## 4. Subsystem Decomposition

The platform is decomposed into 8 major subsystems:

| Subsystem | Primary Responsibilities | Key Technologies / Paths | Relationships & Dependencies |
| :--- | :--- | :--- | :--- |
| **1. Client & Presentation** | User interaction, upload handling, analysis visualization, Grad-CAM overlay, responsive layout. | React 18, TypeScript, Vite, CSS Grid (`frontend/src/`) | Consumes API Gateway via `client.ts`; delegates client forensics to local hooks. |
| **2. API & Request Management** | Route handling, request validation, upload streaming, rate limiting, error formatting. | FastAPI, Pydantic, Gunicorn, Uvicorn (`app/api/`, `app/core/`) | Routes requests to Dispatcher; checks Redis rate limits; queries Database. |
| **3. Media Analysis** | Deep learning model abstraction, lazy loading, inference execution, score normalization. | PyTorch (CPU), Transformers, EfficientNet, Librosa (`app/detectors/`) | Loaded strictly within Celery workers; orchestrated by Pipelines. |
| **4. Job & Workflow Management** | Asynchronous task scheduling, worker heartbeats, progress tracking, queue management. | Celery, Redis Broker (`app/worker/`, `app/services/jobs.py`) | Receives tasks from API Gateway; dispatches to workers; updates Redis state. |
| **5. Forensic Utilities** | Batch duplicate detection, client-side SHA-256 fingerprinting, EXIF extraction, PDF generation. | Web Crypto API, `exifr`, `imagehash`, `jsPDF` (`features/forensic-utilities/`) | Operates predominantly client-side; calls `/duplicate-detection/compare` for pHash. |
| **6. Data & Persistence** | Storing analysis verdicts, job states, model metadata, and automated 7-day retention cleanup. | SQLAlchemy 2.0, PostgreSQL, Alembic, SQLite (`app/db/`) | Written by Celery workers upon task completion; queried by API polling routes. |
| **7. External Integrations** | In-browser scanning, Telegram bot triage, Reddit feed media analysis. | Manifest V3 Chrome Extension, `python-telegram-bot`, `moody_lens_ext` | Thin clients delegating to API Gateway `/api/v1` routes. |
| **8. Infrastructure & Operations** | Container orchestration, multi-stage builds, cloud hosting, CI/CD verification. | Docker, Docker Compose, Render, Vercel, GitHub Actions | Hosts API, workers, Redis, and PostgreSQL instances. |

---

## 5. Layered Design

The software follows a 5-tier layered design with strict unidirectional dependencies:

```
+-----------------------------------------------------------------------+
| 1. Presentation Layer                                                 |
|    - React Components (Analyser, ResultCard, HeatmapPanel, Nav)       |
|    - Forensic Feature Modules (SHA-256 Generator, EXIF Viewer)        |
|    - Chrome Extension UI & Telegram Bot Chat Formatter                |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
| 2. API / Interface Layer                                              |
|    - FastAPI Router (app/api/routes.py, moody_lens_ext)               |
|    - Pydantic Schema Contracts (app/schemas.py, client.ts)            |
|    - Request Middlewares (Security headers, Request ID, Rate Limiter) |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
| 3. Application / Service Layer                                        |
|    - Pipeline Orchestrators (pipelines.py: image, audio, video)       |
|    - Verdict Calibration & Band Mapping (verdict.py)                  |
|    - Job State & Dispatch (jobs.py, dispatch.py, heartbeat.py)        |
|    - Duplicate Detection Service (duplicate_detector.py)              |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
| 4. Domain & Analysis Layer                                            |
|    - Abstract Detector Hierarchy (detectors/base.py)                  |
|    - Pretrained Wrappers (image.py, face.py, audio.py, stub.py)       |
|    - Preprocessing (Haar cascades, librosa audio slicing, ffprobe)    |
|    - Explainability Engine (Grad-CAM attention maps on face crops)    |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
| 5. Infrastructure & Persistence Layer                                 |
|    - SQLAlchemy Models & Session Scope (db/models.py, session.py)     |
|    - PostgreSQL (production) & SQLite (testing)                       |
|    - Redis Message Broker, Job Cache & Worker Heartbeats              |
|    - Ephemeral File Storage (LocalStorage / S3 Storage)               |
+-----------------------------------------------------------------------+
```

### Traceability Walkthrough: Asynchronous Video Analysis Request

To illustrate how layers interact, consider a user uploading a video (`test_interview.mp4`):

1. **Presentation Layer (`frontend`):** User drops a video file into `Analyser.tsx`. File validation checks extension and file size ($\le 100\text{ MB}$). A multipart POST request is initiated.
2. **API Layer (`routes.py`):** `POST /api/v1/analyze/video` receives the stream. `uploads.py` validates the payload: checks size limit (413), verifies magic bytes via `filetype` (415), and runs `ffprobe` to verify video container structure and stream durations (422). An ephemeral file path is written to disk.
3. **Application Layer (`jobs.py` / `dispatch.py`):** An `Analysis` ID and `Job` ID are generated. A `Job` record with status `queued` is created in PostgreSQL and cached in Redis. Celery dispatches task `analyze_video_task` to the `inference.video` queue. The API immediately returns HTTP 202 with `JobStatus` envelope.
4. **Domain Layer (`worker/tasks.py` $\rightarrow$ `pipelines.py`):**
   * The `worker-video` process picks up the task.
   * `preprocessing/ffmpeg.py` samples 24 evenly spaced frames.
   * `preprocessing/face.py` executes OpenCV Haar cascade to locate human faces within each frame.
   * `detectors/face.py` evaluates facial crops using EfficientNet-B0.
   * `detectors/audio.py` extracts the soundtrack and runs sliding 4s Wav2Vec2 inference.
   * `pipelines.py` runs Grad-CAM on the single highest-scoring fake facial crop to extract attention coordinates.
5. **Infrastructure Layer (`results.py` $\rightarrow$ `db/models.py`):** Task writes the finalized `AnalysisResult` to the database, updates the `Job` status to `done`, cleans up the ephemeral video file from `/tmp/uploads`, and terminates.
6. **Frontend Polling & Render:** The frontend polls `GET /api/v1/jobs/{job_id}`. Once `status === "done"`, it fetches `/api/v1/analyses/{analysis_id}`, displaying overall verdict, frame timeline graph, audio check summary, and the interactive Grad-CAM heatmap overlay.

---

## 6. Module Design and Responsibilities

### 6.1 Backend Core Modules

* **`app.detectors.base` (`Detector`):** Abstract base class implementing thread-safe double-checked locking (`ensure_loaded()`). Declares abstract method `load()` and properties `name`, `media_type`, and `revision`. Houses universal label mapping logic (`label_is_fake()`) which maps heterogeneous model label vocabularies (`fake`, `spoof`, `generated`, `real`, `bonafide`) into a normalized boolean.
* **`app.detectors.registry` (`get_registry`):** Factory maintaining a singleton dictionary of active detectors. Controlled by `MML_DETECTOR_BACKEND`: returns real deep learning wrappers when `real`, or lightweight deterministic stubs when `stub`.
* **`app.services.pipelines`:** The central inference coordinator:
  * `run_image_pipeline()`: Invokes Swin Transformer on the entire image, detects faces via Haar cascades, scores detected faces with EfficientNet-B0, and computes Grad-CAM attention on the primary face.
  * `run_audio_pipeline()`: Validates sample rate (16 kHz mono), splits audio into 4-second sliding windows, and aggregates segment scores.
  * `run_video_pipeline()`: Coordinates frame extraction, facial scoring across 24 frames, audio track evaluation, and overall temporal aggregation.
* **`app.services.verdict` (`calculate_verdict`):** Implements the platform verdict calibration rule: the overall fake probability is the **maximum** across all evaluated checks. Maps continuous probability $p$ into calibrated bands:
  $$\text{Verdict}(p) = \begin{cases} 
  \text{likely\_real} & \text{if } p \le 0.35 \\
  \text{likely\_fake} & \text{if } p \ge 0.65 \\
  \text{uncertain} & \text{if } 0.35 < p < 0.65 
  \end{cases}$$
* **`app.services.jobs` (`create_job`, `update_job`, `get_job`):** Dual-layer state manager. Writes transient progress (0.0 to 1.0) and stage labels (`queued`, `frames`, `audio`, `finalising`, `done`) to Redis hash `job:<id>` for low-latency client polling, and flushes durable terminal states to PostgreSQL.
* **`app.core.storage` (`LocalStorage`, `S3Storage`):** Storage abstraction managing ephemeral uploads and generated heatmap artifacts. Configured via `MML_STORAGE_BACKEND`.

### 6.2 Inter-Module Communication

1. **Dependency Injection:** FastAPI routes access database sessions, storage providers, and rate limiters via `fastapi.Depends`.
2. **Thread Pool Delegation:** Because database operations and Redis interactions are synchronous in SQLAlchemy and `redis-py`, FastAPI routes invoke blocking calls inside worker thread pools via `starlette.concurrency.run_in_threadpool`.
3. **Decoupled Worker Heartbeats:** To answer `GET /api/v1/ready` and `GET /api/v1/models` without loading ML libraries, Celery workers publish heartbeats every 15 seconds to Redis keys `worker:<id>` with a 30-second TTL. The API reads readiness directly from Redis.

---

## 7. Cohesion and Coupling

The architecture emphasizes **high functional cohesion** and **low architectural coupling**:

### 7.1 High Functional Cohesion

* **Single-Responsibility Model Wrappers:** Each module in `app/detectors/` encapsulates exactly one pretrained model family. `face.py` contains only EfficientNet weight loading, image tensor transformation, and PyTorch inference. It knows nothing about HTTP requests, multipart encoding, or database rows.
* **Dedicated Upload Verification Pipeline:** `app/core/uploads.py` encapsulates all upload validation rules: stream size limits, byte inspection, Pillow pixel caps, and `ffprobe` duration parsing.
* **Self-Contained Forensic Utilities:** The browser utilities (`features/forensic-utilities/`) operate as fully encapsulated feature modules with their own components, state hooks, and export services.

### 7.2 Low Coupling Strategies

* **ML Isolation in API Process:** The FastAPI web process has **zero imports** of PyTorch, Transformers, Librosa, or OpenCV. This ensures that the web server starts in under 2 seconds, consumes less than 150 MB RAM, and cannot crash due to ML segmentation faults or PyTorch CPU deadlocks.
* **Abstract Base Classes for Detectors:** Pipeline orchestrators interact with models strictly through the abstract `Detector` interface. Replacing a model or running in stub mode requires no pipeline refactoring.
* **Standardized JSON Schema Contracts:** The frontend and backend communicate exclusively through Pydantic contracts mirrored in TypeScript (`app/schemas.py` $\leftrightarrow$ `frontend/src/api/client.ts`). Automated CI script `scripts.check_parity` guarantees that schema drift breaks CI builds before code reaches production.

---

## 8. Information Hiding and Interfaces

### 8.1 Encapsulation of Machine Learning Internals

External clients never see raw neural network tensors, hidden layer activations, or model vocabularies. 
* **Label Normalization:** Pretrained models use conflicting vocabulary labels (e.g., `Organika/sdxl-detector` outputs `{"Artificial": 0.82}`, while `Deepfake-audio-detection-V2` outputs `{"spoof": 0.91}`). The backend normalizes all outputs into a uniform float probability `fake_probability` $\in [0.0, 1.0]$.
* **Privacy-Preserving Grad-CAM:** Standard Grad-CAM implementations produce a modified pixel image. Mad-Eye Moody Lens computes the $7 \times 7$ attention matrix of the final convolutional layer, resizes it to the face crop bounding box, and serializes only the 2D floating-point attention array and bounding box coordinates:
  ```json
  {
    "box": [124, 88, 310, 274],
    "attention": [[0.12, 0.45, ...], [0.89, 0.95, ...]],
    "model_name": "Xicor9/efficientnet-b0-ffpp-c23"
  }
  ```
  The browser uses HTML5 Canvas to render a colored gradient over the user's original local image file. The server never stores or exposes client facial pixels.

### 8.2 API Contracts

The public interface is strictly defined by the following REST endpoints:

| Endpoint | Method | Status | Primary Request / Response |
| :--- | :---: | :---: | :--- |
| `/api/v1/health` | GET | 200 | Health check returning service status. |
| `/api/v1/ready` | GET | 200 / 503 | Readiness check verifying active Celery worker heartbeats in Redis. |
| `/api/v1/models` | GET | 200 | Returns loaded models, revisions, and operational status. |
| `/api/v1/analyze/image` | POST | 200 | Multipart upload $\rightarrow$ synchronous `AnalysisResult`. |
| `/api/v1/analyze/audio` | POST | 200 | Multipart upload $\rightarrow$ synchronous `AnalysisResult`. |
| `/api/v1/analyze/video` | POST | 202 | Multipart upload $\rightarrow$ asynchronous `JobStatus` (poll `/jobs/{id}`). |
| `/api/v1/jobs/{job_id}` | GET | 200 | Retrieves current job progress, stage, and finalized analysis ID. |
| `/api/v1/analyses/{id}` | GET | 200 | Fetches stored analysis verdict and segment scores within 7-day retention. |
| `/api/v1/analyses/{id}/explanation` | GET | 200 | Fetches Grad-CAM attention matrix for the primary manipulated face. |
| `/api/v1/duplicate-detection/compare` | POST | 200 | Batch image compare $\rightarrow$ exact SHA-256 and perceptual pHash clusters. |

---

## 9. Data and Object Design

### 9.1 Relational Database Schema (PostgreSQL)

The relational schema is intentionally minimal. It stores analysis results and asynchronous job states. In accordance with platform privacy invariants, **no media files, original file names, client IP addresses, or user account records are stored.**

```
+------------------------------------+       +------------------------------------+
|             analyses               |       |                jobs                |
+------------------------------------+       +------------------------------------+
| id: UUID [PK]                      |       | id: UUID [PK]                      |
| media_type: VARCHAR(8)             |       | status: VARCHAR(8)                 |
| verdict: VARCHAR(16)               |       | progress: FLOAT                    |
| fake_probability: FLOAT            |       | stage: VARCHAR(12)                 |
| scores: JSONB                      |       | analysis_id: UUID                  |
| segments: JSONB                    |       | error: TEXT                        |
| details: JSONB                     |       | celery_task_id: VARCHAR(64)        |
| model_versions: JSONB              |       | created_at: TIMESTAMPTZ            |
| explanation_count: INTEGER         |       | started_at: TIMESTAMPTZ            |
| processing_ms: INTEGER             |       | finished_at: TIMESTAMPTZ           |
| created_at: TIMESTAMPTZ            |       | expires_at: TIMESTAMPTZ            |
| expires_at: TIMESTAMPTZ            |       +------------------------------------+
+------------------------------------+
```

* **Constraints:** `media_type IN ('image', 'audio', 'video')`, `verdict IN ('likely_real', 'uncertain', 'likely_fake')`, `status IN ('queued', 'running', 'done', 'failed')`.
* **Index Strategy:** Indexed on `created_at` and `expires_at` for rapid hourly retention sweeps.
* **JSONB Columns:** Segment timelines, model metadata, and task scores are stored in flexible JSONB fields, supporting model additions without schema migrations.

### 9.2 Redis Data Structures

* **`worker:<worker_id>` (String):** JSON payload containing worker queues, loaded models, memory stats, and timestamp. TTL: 30 seconds.
* **`job:<job_id>` (Hash):** Fields `status`, `progress`, `stage`, `cancel`. Updated live during video analysis to support responsive frontend progress bars without hammering PostgreSQL.
* **`rl:<bucket>:<client_hmac>:<window>` (Integer):** Rate limit counter incremented atomically via pipeline with TTL matching the rate limit window.

---

## 10. Design Decisions and Trade-offs

| Engineering Decision | Chosen Alternative | Alternatives Considered | Rationale & Trade-offs |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | **React 18 + Vite + TypeScript** | Next.js, Vue, Plain HTML/JS | SPA architecture allows static hosting on Vercel CDN; client-side execution of forensic utilities avoids server overhead; strict typing prevents contract drift. |
| **API Framework** | **FastAPI (Python 3.11)** | Django, Flask, Express.js | Native OpenAPI documentation, automatic Pydantic request validation, high async performance, direct ecosystem compatibility with ML tools. |
| **Task Queue & Broker** | **Celery + Redis** | Celery + RabbitMQ, Kafka, RQ | Redis serves as both a low-overhead message broker and a fast in-memory store for rate-limiting, job progress, and worker heartbeats. |
| **Worker Concurrency** | **`--concurrency=1` (Solo Pool)** | Multi-threading, Prefork (4 workers) | **Laptop Resource Envelope:** Each deep learning model consumes 1.5–2.5 GB RAM. Single concurrency per container prevents out-of-memory (OOM) crashes on 8 GB RAM machines. |
| **Queue Partitioning** | **Dual Queues (`fast` vs `video`)** | Single Shared Queue | Prevents a single 60-second video analysis from blocking instant 500 ms image triage requests submitted by other users. |
| **Client-Side Forensics** | **Browser-Local (Web Crypto, `exifr`)** | Server-Side Extraction | **Privacy & Bandwidth:** Calculating SHA-256 and EXIF locally means sensitive user documents and location data are never uploaded to the server; drastically reduces server CPU load. |
| **Container Architecture** | **Single Image, Multi-Role** | Separate Images for API and Workers | One Dockerfile builds the entire environment; role is determined at runtime via command arguments (`celery worker` vs `gunicorn`). Simplifies deployment and reduces Docker build cache overhead. |
| **Database Strategy** | **PostgreSQL (Prod) / SQLite (Test)** | MongoDB, DynamoDB | Relational integrity with JSONB flexibility; SQLite in-memory engine allows instant, zero-dependency pytest execution in CI without spinning up database containers. |

---

## 11. Known Limitations and Incomplete Functionality

In the spirit of rigorous software engineering and transparent evaluation, the following limitations and unverified components in the current repository are noted:

1. **OAuth and Multi-Stakeholder RBAC (PR #128 Status):**
   * Multi-stakeholder RBAC and Google OAuth were developed on branch `vedant-dev` (PR #128). An independent audit identified critical vulnerabilities:
     * Privilege escalation risk on `/api/v1/auth/register` (unvalidated role assignment).
     * Hardcoded mock code bypass in the OAuth callback handler.
     * In-memory volatile user store (`USER_REGISTRY` dict) lacking persistent PostgreSQL database backing.
   * **Current State:** This implementation remains unmerged on `vedant-dev`. The production `main` branch maintains a zero-login anonymous access model.
2. **CPU Video Processing Latency:**
   * Video analysis on CPU requires 15 to 45 seconds depending on resolution and frame count. While the asynchronous Celery pipeline prevents HTTP timeouts, real-time video streaming analysis is not supported without GPU acceleration.
3. **Reddit Extension Single-Worker Constraint:**
   * The Reddit extension router (`moody_lens_ext/store.py`) tracks active analysis mappings in process memory. As a result, the Gunicorn API server must run with a single worker process (`-w 1`) to avoid state desynchronization across worker processes.
4. **Grad-CAM Availability Restricted to Face Model:**
   * Explainable Grad-CAM heatmaps are currently implemented exclusively for the EfficientNet-B0 face model (`Xicor9/efficientnet-b0-ffpp-c23`). Images containing no human faces (e.g., synthetic landscapes, AI-generated architecture) receive a verdict from the Swin Transformer without visual spatial heatmaps.
5. **Ephemeral Storage on Render Cloud Hosting:**
   * The free-tier cloud deployment on Render uses container-ephemeral storage (`/tmp/uploads`). Server restarts clear pending or active temporary files. Durable multi-region object storage (S3/MinIO) is architected via `app/core/storage.py` but requires external cloud credentials.
6. **Telegram Bot Local Test Dependencies:**
   * Telegram bot automated unit tests require `python-telegram-bot` to be present in the local environment; offline unit test runs skip telegram client verification if the dependency is not installed.
