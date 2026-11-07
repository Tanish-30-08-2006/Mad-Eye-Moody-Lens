### Technology / Document Analysis

---

#### **Technology / Document:**
MDN Web Docs: HTML5 File API (`<input type="file">` and `File` interface)

**Relevant Area:**
Upload / Frontend

**Key Finding:**
The HTML5 File API allows web applications to access file objects on the client side before transmission. The `File` interface exposes metadata including `File.size` (in bytes) and `File.type` (MIME type). The `<input type="file">` element supports the `accept`attribute to filter file types in the native OS file picker.

**Requirement / Constraint Derived:**
* **Fact:** Client-side validation using `File.size` and `File.type` can prevent unnecessary network transmission of invalid filesbut can be easily bypassed by modifying client-side code.
* **Inferred Requirement:** The frontend must implement pre-upload validation. It must restrict file selection using `accept="image/*,video/*,audio/*"` on the file input. Before initiating the upload request, the frontend must check `File.size` against configured limits (e.g., 10MB for images, 100MB for videos) and reject files immediately with an on-screen warning if they exceed these limits.

**Requirement Type:**
Technical Constraint / Functional

**Confidence:**
High

---

#### **Technology / Document:**
OWASP File Upload Security Cheat Sheet

**Relevant Area:**
Security / Storage

**Key Finding:**
OWASP states that relying solely on the user-provided `Content-Type` header or file extension is highly insecure. It recommends:
1. Validating file extensions against an allowlist of permitted formats.
2. Verifying the file header ("magic numbers") to confirm the actual file type.
3. Storing uploaded files outside the web root directory to prevent direct execution.
4. Renaming files to randomly generated names (e.g., UUIDs) to prevent path traversal and execution attacks.

**Requirement / Constraint Derived:**
* **Fact:** Attackers can spoof MIME types and file extensions to upload malicious scripts (e.g., uploading a `.php` file disguised as a `.jpg`).
* **Inferred Requirement:** The backend must perform server-side validation of all uploaded media. It must read the initial bytes of the file to verify its magic number (e.g., checking for `FF D8 FF` for JPEG or `89 50 4E 47` for PNG) before passing it to the ML pipeline. Files must be saved to an isolated, non-executable temporary directory or object storage bucket, with their filenames replaced by a secure UUIDv4.

**Requirement Type:**
Security Requirement

**Confidence:**
High

---

#### **Technology / Document:**
FastAPI Background Tasks & Celery Distributed Task Queue Documentation

**Relevant Area:**
API / Backend / Performance

**Key Finding:**
Standard HTTP connections have strict gateway timeouts (typically 60 seconds on services like Nginx, AWS ALB, or Heroku). Heavy computations, such as running deep learning inference on large video files, can easily exceed this limit, resulting in `504 Gateway Timeout` errors. FastAPI and Celery recommend offloading long-running tasks to background workers and returning an immediate HTTP `202 Accepted` response.

**Requirement / Constraint Derived:**
* **Fact:** ML inference for deepfake detection (especially video/audio) is computationally expensive and cannot be completed within a standard synchronous HTTP request-response cycle.
* **Inferred Requirement:** The backend must expose an asynchronous endpoint (e.g., `POST /api/v1/detect/async`). Upon receiving avalid file, the backend must save the file, queue an ML inference job in Celery (or a similar task runner), and immediately returna `202 Accepted` status containing a unique `task_id` and a status URL (e.g., `/api/v1/tasks/{task_id}`).

**Requirement Type:**
Technical Constraint

**Confidence:**
High

---

#### **Technology / Document:**
AWS S3 Developer Guide: Presigned URLs & Lifecycle Policies

**Relevant Area:**
Storage / Performance

**Key Finding:**
Uploading large files (such as high-definition videos) through an application server consumes significant server memory, I/O bandwidth, and CPU cycles. AWS S3 allows generating "Presigned URLs," which grant temporary write permissions directly to an S3 bucket. S3 Lifecycle Policies allow automatic deletion or transition of objects based on age.

**Requirement / Constraint Derived:**
* **Fact:** Direct-to-cloud uploads bypass the backend application server, preventing server starvation during concurrent large video uploads.
* **Inferred Requirement:** For video and audio uploads, the frontend must first request a presigned upload URL from the backend API (`POST /api/v1/uploads/presign`). The frontend then uploads the file directly to AWS S3. To manage storage costs and protect user privacy, the S3 bucket must be configured with a Lifecycle Policy that permanently deletes all uploaded media exactly 24 hours after creation.

**Requirement Type:**
Technical Constraint / Non-functional

**Confidence:**
High

---

#### **Technology / Document:**
Chrome Extension Developer Guide (Manifest V3)

**Relevant Area:**
Browser Extension

**Key Finding:**
Manifest V3 enforces strict security policies:
1. Remotely hosted code is forbidden; all extension logic must be bundled locally.
2. Network requests must comply with Cross-Origin Resource Sharing (CORS) and require explicit host permissions declared in the `manifest.json` file.
3. Content scripts run in isolated worlds but can read and manipulate the active tab's DOM.

**Requirement / Constraint Derived:**
* **Fact:** The extension cannot download external scripts at runtime and must declare all API endpoints it intends to communicatewith.
* **Inferred Requirement:** The browser extension must bundle all UI and detection-triggering logic locally. The `manifest.json` must declare `host_permissions` for the Deepfake Detection Web App's API domain (e.g., `https://api.deepfakedetect.com/*`). The extension's content script will scan the DOM of the active webpage for `<img>`, `<video>`, and `<audio>` tags, inject a "Verify with Deepfake Detector" button overlay, and send the media URL to the extension's background service worker to initiate the API analysis.

**Requirement Type:**
Technical Constraint

**Confidence:**
High

---

#### **Technology / Document:**
MDN Web Docs: Server-Sent Events (SSE) & WebSockets

**Relevant Area:**
API / Frontend / Performance

**Key Finding:**
Server-Sent Events (SSE) allow a server to push real-time, unidirectional updates to a client over a standard HTTP connection using the `EventSource` API. WebSockets provide bidirectional, full-duplex communication but require a protocol upgrade (`ws://`) and specialized server handling.

**Requirement / Constraint Derived:**
* **Fact:** Users need real-time feedback on the progress of their deepfake analysis (e.g., "Uploading", "Extracting Audio", "Analyzing Frames", "Completed") without polling the server repeatedly.
* **Inferred Requirement:** The backend should implement an SSE endpoint (`GET /api/v1/tasks/{task_id}/progress`) to stream processing status updates to the frontend. The frontend must establish an `EventSource` connection to this endpoint upon receiving a `202Accepted` response, updating the progress bar and status messages dynamically until the final detection payload is delivered.

**Requirement Type:**
Functional

**Confidence:**
High

---

#### **Technology / Document:**
MDN Web Docs: Fetch API & HTTP Status Codes

**Relevant Area:**
Error Handling / Frontend

**Key Finding:**
The Fetch API `fetch()` promise only rejects on network failures or if anything prevented the request from completing. It does notreject on HTTP error statuses (e.g., `413 Payload Too Large`, `415 Unsupported Media Type`, `422 Unprocessable Entity`, `500 Internal Server Error`). The developer must check the `response.ok` property (which is true for status codes in the range 200–299).

**Requirement / Constraint Derived:**
* **Fact:** If the backend rejects a file due to size or format constraints, the frontend Fetch call will resolve successfully with an error status code rather than throwing a catchable error.
* **Inferred Requirement:** The frontend API client wrapper must explicitly check `if (!response.ok)`. If false, it must parse theJSON error payload (e.g., `{ "error": "FILE_TOO_LARGE", "message": "Limit is 100MB" }`) and throw a custom error. The UI must catch this error and display a clear, non-technical error message to the user, resetting the upload state so the user can try again.

**Requirement Type:**
Functional / Non-functional

**Confidence:**
High

---

### Summary Table

| Technology / Source | Key Finding | Requirement / Constraint | Type |
| :--- | :--- | :--- | :--- |
| **MDN Web Docs (HTML5 File API)** | Client-side access to `File.size` and `File.type` is available before upload. | Implement client-side validation on file size and MIME type; restrict file picker using the `accept` attribute. | Technical Constraint / Functional |
| **OWASP File Upload Security** | Spoofing MIME types is easy; files must be validated via magic numbers and stored securely. | Perform server-side magic number verification; rename files to UUIDs; store them in non-executable directories. | Security Requirement |
| **FastAPI / Celery Docs** | Long-running tasks exceed HTTP gateway timeouts; async background tasks are recommended. | Use an asynchronous endpoint returning `202 Accepted` with a `task_id` for video/audio processing. | Technical Constraint |
| **AWS S3 Developer Guide** | Presigned URLs allow direct-to-S3 uploads; Lifecycle Policies automate object deletion. | Upload large media directly to S3 via presigned URLs; configure a 24-hour automatic deletion lifecycle policy. | Technical Constraint / Non-functional |
| **Chrome Extension (Manifest V3)** | Remotely hosted code is banned; host permissions must be declared; content scripts run in isolated worlds. | Bundle all extension code locally; declare API domain in `host_permissions`; use content scripts to extract mediaURLs from the DOM. | Technical Constraint |
| **MDN Web Docs (SSE / WebSockets)** | SSE allows unidirectional real-time server-to-client streaming over standard HTTP. | Implement an SSE endpoint to stream real-time ML processing progress updates to the frontend UI. | Functional |
| **MDN Web Docs (Fetch API)** | `fetch()` does not reject on HTTP error status codes (e.g., 413, 415, 422). | Explicitly check `response.ok` in frontend code, parse backend error payloads, and display user-friendly error messages. | Functional / Non-functional|
