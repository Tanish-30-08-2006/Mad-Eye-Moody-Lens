**will update in future**

# Deepfake Detection Web App — Requirements Specification
*Derived from stakeholder interviews (Journalist/Fact-Checker, Social Media Moderator) and technical/legal elicitation (Cloud Provider, Compliance, Datasets, Frontend/Backend, ML/Data Engineering, Social Media Platform)*

---

## 1. Functional Requirements (FR)

### 1.1 Media Upload & Ingestion
| ID | Requirement | Source |
|---|---|---|
| FR-1 | The system shall allow users to upload images, videos, and audio files through a web interface, restricted via the file picker `accept` attribute (`image/*,video/*,audio/*`). | Journalist, Moderator, Frontend/Backend |
| FR-2 | The system shall validate file size and MIME type client-side before upload (e.g., 10MB images, 100MB video) and reject oversized/invalid files with an on-screen warning. | Frontend/Backend |
| FR-3 | The system shall re-validate every uploaded file server-side by checking file signature ("magic numbers"), not just extension/MIME type, before passing it to the ML pipeline. | Frontend/Backend (OWASP) |
| FR-4 | The system shall rename uploaded files to randomly generated identifiers (UUIDv4) and store them in non-executable, isolated storage. | Frontend/Backend (OWASP) |
| FR-5 | For large media (video/audio), the frontend shall request a pre-signed upload URL from the backend and upload directly to cloud object storage (e.g., AWS S3), bypassing the application server. | Cloud Provider |
| FR-6 | The system shall support a WhatsApp "forward-to-verify" channel via the WhatsApp Business Cloud API, downloading forwarded media within 5 minutes of webhook receipt (before the temporary media URL expires). It shall not attempt to intercept private user-to-user chats. | Social Media Platform |

### 1.2 Detection & Processing
| ID | Requirement | Source |
|---|---|---|
| FR-7 | The system shall support multi-modal detection: images, video, and audio, each routed to a specialized detection model (face-manipulation CNN for image/video, spectrogram-based classifier for audio). | Journalist, Moderator, ML Engineer |
| FR-8 | The system shall run a face-detection and cropping preprocessing step (e.g., MTCNN/RetinaFace, 1.3× bounding-box expansion, resized to model input size) before facial-image/video inference. | ML Engineer, Dataset (FF++) |
| FR-9 | The system shall automatically transcode/standardize uploaded audio (any input format) to 16kHz, 16-bit, mono WAV, then extract LFCC/CQCC spectrogram features before classification. | ML Engineer, Dataset (ASVspoof) |
| FR-10 | The system shall process video/audio analysis asynchronously: upon upload, it shall immediately return a "processing" status with a unique task ID rather than holding the connection open. | Journalist, Cloud Provider, Frontend/Backend, ML Engineer |
| FR-11 | The system shall stream real-time progress updates (e.g., "Uploading," "Extracting frames," "Analyzing," "Completed") to the frontend via Server-Sent Events or polling against the task ID. | Frontend/Backend |
| FR-12 | The system shall provide a rapid initial "triage" scan (target ≤60 seconds) in addition to an optional deeper forensic analysis for cases warranting closer review. | Journalist |

### 1.3 Results, Explainability & Evidence
| ID | Requirement | Source |
|---|---|---|
| FR-13 | The system shall never present a bare binary (real/fake) label or a standalone confidence score; every result must include a confidence percentage **and** a plain-language explanation of contributing factors (e.g., "unnatural blending near the jawline," "audio-lip sync mismatch at second 14"). | Journalist, Moderator, Compliance (EU AI Act) |
| FR-14 | The system shall visually highlight suspicious regions in images (bounding box/heatmap) and mark suspicious frame ranges or a timeline heatmap in videos, allowing users to jump directly to flagged segments. | Journalist, Moderator |
| FR-15 | The system shall identify and display the specific type of manipulation detected where possible (e.g., face-swap, voice clone, metadata tampering) rather than a single generic flag. | Moderator |
| FR-16 | The system shall support a distinct **"Inconclusive"** result state, accompanied by a diagnostic reason (e.g., "resolution too low," "excessive compression artifacts") whenever confidence is insufficient for a determination. | Journalist, Moderator |
| FR-17 | The system shall generate a downloadable, plain-language Evidence/Detection Report (PDF or clean webpage) summarizing findings, visual annotations, and explanations, watermarked as an "Uncertified Academic AI Analysis" not valid as standalone legal proof. | Journalist, Compliance (BNS) |

### 1.4 Sharing & Collaboration
| ID | Requirement | Source |
|---|---|---|
| FR-18 | The system shall provide a shareable verification link/report with access controls (password protection and/or expiry), restricted to authorized recipients rather than being publicly indexable. | Journalist, Compliance (IT Rules 2021) |
| FR-19 | The system shall generate a "Click to Chat" (`wa.me`) link pre-filled with the verification result, enabling users to manually forward results via WhatsApp. | Social Media Platform |

### 1.5 Moderation Workflow (Platform/Moderator Use Case)
| ID | Requirement | Source |
|---|---|---|
| FR-20 | The system shall integrate with a moderation queue, offering quick-access actions (label, demote, remove, escalate) directly alongside the detection result. | Moderator |
| FR-21 | The system shall allow moderators to agree/disagree with a result (feedback loop) to flag false positives/negatives for review. | Moderator |
| FR-22 | The system shall route low-confidence results to a manual-review/dispute queue and allow a documented override of the automated recommendation. | Moderator |
| FR-23 | The system shall provide automated reverse-image/source-lookup assistance to help distinguish "cheapfakes"/out-of-context real media from genuine manipulations. | Journalist, Moderator |

### 1.6 Consent, Compliance & Error Handling
| ID | Requirement | Source |
|---|---|---|
| FR-24 | The system shall display a clear, affirmative consent notice (stating data collected and purpose) before permitting any upload, per applicable data-protection law (e.g., India's DPDPA). | Compliance |
| FR-25 | The system shall display a prominent disclaimer that results are automated/probabilistic and do not constitute legal proof or a definitive determination. | Compliance (GDPR Art. 22, EU AI Act) |
| FR-26 | The frontend shall explicitly check HTTP response status and surface backend error payloads (e.g., file too large, unsupported type) as clear, non-technical messages, resetting the upload state for retry. | Frontend/Backend |
| FR-27 | The "About"/Credits page shall display attribution for any dataset used under an attribution license (e.g., ASVspoof 2019, CC BY 4.0). | Dataset |

---

## 2. Non-Functional Requirements (NFR)

### 2.1 Performance
| ID | Requirement | Source |
|---|---|---|
| NFR-1 | Image triage results should be returned in well under a minute (ideal target: <5–30 seconds depending on use case); full video analysis should ideally complete within ~2–5 minutes. | Journalist, Moderator |
| NFR-2 | The system shall not rely on synchronous request/response for ML inference exceeding platform gateway timeouts (typically 60s); long-running jobs must use an asynchronous, event-driven architecture (task queue + task ID). | Cloud Provider, Frontend/Backend, ML Engineer |
| NFR-3 | The system should use GPU-backed inference where feasible for deep model architectures (e.g., Xception, EfficientNet), falling back to optimized CPU instances during development to control cost. | Cloud Provider, ML Engineer |

### 2.2 Reliability & Robustness
| ID | Requirement | Source |
|---|---|---|
| NFR-4 | Detection models must be trained/validated on compressed and low-resolution media (matching real-world social-media conditions), since accuracy degrades significantly on heavily compressed input (observed drop from ~99.7% raw to ~81% heavily compressed in reference literature). | Dataset (FF++), ML Engineer, Journalist |
| NFR-5 | The system must degrade gracefully to an "Inconclusive" state rather than returning an overconfident wrong answer under poor input conditions (low resolution, heavy compression, short duration). | Journalist, Moderator |
| NFR-6 | The architecture should support modular model swapping/retraining without downtime, since deepfake generation techniques evolve continuously and detection models require periodic updates. | ML Engineer |

### 2.3 Security
| ID | Requirement | Source |
|---|---|---|
| NFR-7 | All data in transit must be encrypted (TLS/HTTPS); any temporary storage during processing must be encrypted at rest. | Compliance, Cloud Provider |
| NFR-8 | Uploaded media must never be publicly accessible; storage buckets must block public access, with writes performed only via authenticated, pre-signed URLs. | Cloud Provider |
| NFR-9 | Server-side file-type verification (magic-number checking) and secure, randomized file naming are mandatory to prevent malicious upload/execution attacks. | Frontend/Backend (OWASP) |
| NFR-10 | Shared verification links must be access-controlled (password/expiry) — never public-by-default or indexable by search engines. | Journalist |

### 2.4 Privacy & Data Minimization
| ID | Requirement | Source |
|---|---|---|
| NFR-11 | Uploaded media must be deleted immediately after analysis completes; a storage lifecycle policy (e.g., 24-hour auto-delete) must act as a fail-safe against orphaned files. | Cloud Provider, Compliance, Social Media Platform |
| NFR-12 | The system must not use uploaded user media to train models without explicit, opt-in consent. | Social Media Platform, Compliance |
| NFR-13 | Processing of biometric-like signals (facial landmarks, voiceprints) requires explicit, separate consent, particularly for EU users under GDPR Art. 9. | Compliance |
| NFR-14 | The application must operate as a private utility — results and uploaded media are visible only to the uploading session, not hosted or indexed publicly (to avoid "intermediary" classification under Indian IT Rules). | Compliance |

### 2.5 Usability & Trust
| ID | Requirement | Source |
|---|---|---|
| NFR-15 | Explanations of detection results must be understandable to non-technical audiences (editors, readers, policy teams, legal counsel) — not raw technical/statistical jargon. | Journalist, Moderator |
| NFR-16 | The UI/marketing must never claim "100% accuracy" or "foolproof" detection; it must state tested, validated accuracy metrics honestly. | Compliance (Consumer Protection Act) |
| NFR-17 | The system should minimize false positives on compressed/degraded but authentic media, since these damage user trust and can cause wrongful takedowns or false accusations. | Journalist, Moderator |

### 2.6 Legal, Ethical & Regulatory Compliance
| ID | Requirement | Source |
|---|---|---|
| NFR-18 | The application (if built on research datasets like FaceForensics++) must remain non-commercial / academic in scope, per dataset licensing terms. | Dataset (FF++) |
| NFR-19 | Downloadable reports must carry a liability disclaimer/"uncertified" watermark to prevent use as unverified legal/forensic evidence. | Compliance (BNS) |
| NFR-20 | The system must comply with regional data-protection regimes relevant to its user base (e.g., India's DPDPA, EU's GDPR/AI Act) regarding consent, transparency, and right to erasure. | Compliance |

### 2.7 Scalability & Maintainability
| ID | Requirement | Source |
|---|---|---|
| NFR-21 | Cloud storage and compute must scale to handle concurrent uploads and inference requests (e.g., via managed autoscaling compute and object storage). | Cloud Provider |
| NFR-22 | The system should be cost-aware during development (e.g., capped upload sizes, CPU-tier inference) to operate within free-tier/limited-budget constraints typical of an academic project. | Cloud Provider |
| NFR-23 | Browser-extension components (if built) must bundle all logic locally and declare explicit host permissions, per Manifest V3 constraints — no remotely hosted code. | Frontend/Backend |

---
