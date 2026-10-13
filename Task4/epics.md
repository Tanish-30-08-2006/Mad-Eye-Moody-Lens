# Mad-Eye Moody Lens: Deepfake Detection Platform
## Comprehensive Agile Epics Specification
**Document Version:** 1.0.0  
**Project:** DA-IICT IT314 Software Engineering Course Project  
**Repository:** [Mad-Eye-Moody-Lens](https://github.com/Tanish-30-08-2006/Mad-Eye-Moody-Lens)  
**Standard:** Agile Scrum Epics Framework  
**Companion User Stories File:** [user_stories.md](./user_stories.md)  
**Traceability:** Mapped directly to Task 3 Requirements (FR-1 to FR-34, NFR-1 to NFR-25, DR-1 to DR-17)

---

## 1. Stakeholder & Persona Taxonomy

To ensure every Epic and User Story is anchored in real-world operational contexts, the system establishes six distinct primary and secondary personas:

| Persona Name | Role / Title | Primary Goals & Operational Context |
|---|---|---|
| **Sarah (The Fact-Checker)** | Investigative Journalist / Newsroom Fact-Checker | High-stress breaking news; needs <60s triage scanning, visual heatmaps, frame-by-frame scrubbing, and certified PDF evidence reports to protect editorial integrity. |
| **Alex (The Trust & Safety Lead)** | Social Media Platform Moderator | High-throughput queues; needs inline moderation actions (label, demote, remove, escalate), compressed UGC resilience, and documented dispute override logging. |
| **Priya (The Everyday Citizen)** | General Public / WhatsApp & Social Media Consumer | Receives viral multimedia forwards; requires low-friction web/WhatsApp verification, plain-language non-jargon explanations, and ironclad privacy guarantees. |
| **Dr. Chen (The ML Detection Engineer)** | Applied AI / Computer Vision Specialist | Builds and fine-tunes multi-modal models (RetinaFace, Xception, ASVspoof spectrograms), calibrates decision thresholds (FAR vs. FRR), and mitigates shortcut learning. |
| **Marcus (The Infrastructure / SRE Lead)** | Full-Stack & Cloud Systems Architect | Enforces async event-driven task distribution, AWS S3 pre-signed direct uploads, OWASP input sanitization, zero-trust 24h ephemeral lifecycles, and Prometheus telemetry. |
| **Advocate Mehta (The Compliance & Legal Officer)** | Privacy, Regulatory & Ethics Counsel | Enforces strict adherence to India's DPDPA 2023, EU AI Act, GDPR Art. 9/17/22, BNS 2023 defamation safeguards, CC BY 4.0 attribution, and mandatory academic liability watermarks. |

---

## 2. Epics Overview & Decomposition

An **Epic** represents a major system capability or functional umbrella that delivers significant stakeholder value and is composed of multiple granular User Stories. All detailed User Stories, complete with Gherkin acceptance criteria (Given-When-Then), priority ratings, and story points, are documented in [user_stories.md](./user_stories.md).

### 2.1 Functional Epics (Epic 1 through Epic 7)

#### Epic 1: Secure Media Ingestion & Multi-Channel Upload
- **Epic ID:** 
- **Objective:** Provide a secure, multi-modal ingestion gateway capable of receiving images, videos, and audio clips via a browser interface and WhatsApp Cloud API, while preventing server resource exhaustion and file-upload vulnerabilities.
- **Traceability:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
- **Primary Personas:** Sarah, Priya, Marcus
- **Included User Stories (see user_stories.md):**
  - : Multimodal File Ingestion via Web Interface (P0, 3 pts)
  - : Client-Side Pre-Flight File Validation (P0, 2 pts)
  - : Server-Side Cryptographic Magic-Number Validation (P0, 5 pts)
  - : UUIDv4 Sanitization and Isolated Storage Execution Prevention (P0, 3 pts)
  - : Direct-to-Cloud Pre-Signed Object Storage Ingestion (P0, 5 pts)
  - : WhatsApp "Forward-to-Verify" Cloud Ingestion Gateway (P1, 8 pts)

#### Epic 2: Multi-Modal AI Detection & Async Processing Engine
- **Epic ID:** 
- **Objective:** Route incoming media to domain-specific detection models (face-manipulation CNNs, audio spectrogram classifiers, video frame aggregators) through an asynchronous, non-blocking task queue with real-time status reporting.
- **Traceability:** FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-29, FR-31
- **Primary Personas:** Dr. Chen, Sarah, Marcus
- **Included User Stories (see user_stories.md):**
  - : Specialized Multi-Modal Model Routing (P0, 5 pts)
  - : Facial Landmark Detection & 1.3x Dynamic Bounding Box Cropping (P0, 5 pts)
  - : Audio Transcoding and LFCC/CQCC Spectral Feature Extraction (P0, 5 pts)
  - : Asynchronous Task Ticket Issuance & Non-Blocking Polling (P0, 5 pts)
  - : Real-Time SSE/WebSocket Inference Progress Telemetry (P1, 5 pts)
  - : Dual-Tier Rapid Triage vs. Deep Forensic Scan (P0, 5 pts)
  - : Transparent Frame-Level Aggregation & Method Disclosure (P0, 3 pts)
  - : Admin Decision-Threshold Calibration Interface (P1, 5 pts)

#### Epic 3: Explainable AI (XAI), Visual Evidence & Reporting
- **Epic ID:** 
- **Objective:** Deliver human-understandable evidence that explains detection decisions via confidence breakdowns, plain-language contributing factor narratives, interactive Grad-CAM heatmaps, keyframe timelines, and downloadable watermarked evidence PDF reports.
- **Traceability:** FR-13, FR-14, FR-15, FR-16, FR-17, FR-30
- **Primary Personas:** Sarah, Alex, Advocate Mehta
- **Included User Stories (see user_stories.md):**
  - : Probabilistic Score & Plain-Language Contributing Factor Narrative (P0, 5 pts)
  - : Interactive Spatial Bounding Box & Video Timeline Heatmaps (P0, 8 pts)
  - : Granular Manipulation Taxonomy Classification (P1, 5 pts)
  - : Explicit "Inconclusive" Diagnostic State Fallback (P0, 3 pts)
  - : Exportable Plain-Language Evidence Report with Academic Disclaimer Watermark (P0, 5 pts)
  - : Automated Keyframe & Container Metadata Inspection (P1, 5 pts)

#### Epic 4: Collaborative Verification & Secure Sharing
- **Epic ID:** 
- **Objective:** Enable verified results to be shared with newsroom colleagues and messaging contacts via password-protected, ephemeral links and pre-filled WhatsApp click-to-chat links, without publicly exposing or indexing private media.
- **Traceability:** FR-18, FR-19
- **Primary Personas:** Sarah, Priya
- **Included User Stories (see user_stories.md):**
  - : Access-Controlled Ephemeral Verification Link Generation (P1, 3 pts)
  - : One-Click WhatsApp "Click-to-Chat" Verification Sharing (P2, 2 pts)

#### Epic 5: Enterprise Moderation Queue & Workflow Integration
- **Epic ID:** 
- **Objective:** Provide content moderators with an integrated queue interface featuring one-click action triggers (label, demote, remove, escalate), human-in-the-loop feedback logging, dispute overrides, and automated reverse-lookup assistance.
- **Traceability:** FR-20, FR-21, FR-22, FR-23
- **Primary Personas:** Alex, Dr. Chen
- **Included User Stories (see user_stories.md):**
  - : Integrated Moderation Triage Console with Action Triggers (P0, 5 pts)
  - : Human-in-the-Loop Feedback & Active Learning Flagging (P1, 3 pts)
  - : Ambiguity Routing to Manual Dispute & Documented Override Queue (P1, 5 pts)
  - : Automated Reverse-Image & Contextual Provenance Assistance (P1, 5 pts)

#### Epic 6: Trust, Governance, Legal Compliance & Privacy
- **Epic ID:** 
- **Objective:** Enforce compliance with India's DPDPA 2023, IT Rules 2021, BNS 2023, EU GDPR, and research dataset terms through multilingual affirmative consent, non-legal disclaimers, anti-NCII user attestations, and dataset attributions.
- **Traceability:** FR-24, FR-25, FR-26, FR-27, FR-32, FR-33, FR-34
- **Primary Personas:** Advocate Mehta, Priya
- **Included User Stories (see user_stories.md):**
  - : Multilingual Pre-Upload Informed Consent Modal (P0, 3 pts)
  - : Prominent Probabilistic & Non-Legal Determination Disclaimer (P0, 2 pts)
  - : Non-Technical Error Handling & Self-Service Upload Reset (P1, 3 pts)
  - : Academic Dataset Attribution & Open-Source Credits (P1, 1 pt)
  - : User Consent Revocation & Grievance Redressal Gateway (P1, 3 pts)
  - : Mandatory Anti-NCII & Individual Rights Attestation Checkbox (P0, 2 pts)

#### Epic 7: Real-Time Web Browser Extension
- **Epic ID:** 
- **Objective:** Enable desktop users to verify multimedia content directly inside social media web pages via Chrome Manifest V3 context menus without navigating away.
- **Traceability:** FR-28
- **Primary Personas:** Priya, Sarah
- **Included User Stories (see user_stories.md):**
  - : In-Situ Social Media DOM Element Scanning & Inline Verification (P1, 8 pts)

---

### 2.2 Non-Functional & Architectural Epics (Epic 8 through Epic 11)

#### Epic 8: Performance, Latency & Autoscaling Infrastructure
- **Epic ID:** 
- **Objective:** Meet sub-minute image triage (<30s) and bounded video analysis SLAs through horizontal worker scaling, asynchronous queue throttling, and cost-effective CPU/GPU compute tiering.
- **Traceability:** NFR-1, NFR-2, NFR-3, NFR-21, NFR-22
- **Primary Personas:** Marcus, Sarah
- **Included User Stories (see user_stories.md):**
  - : Low-Latency Inference SLAs & Asynchronous Job Throttling (P0, 5 pts)
  - : GPU Acceleration with Dynamic CPU Cost-Tier Fallback (P1, 5 pts)
  - : Elastic Autoscaling on Viral Traffic Surges (P1, 5 pts)

#### Epic 9: Model Robustness, Degradation & Zero-Downtime Governance
- **Epic ID:** 
- **Objective:** Ensure detectors maintain calibrated accuracy on compressed social media files, degrade gracefully to "Inconclusive" when inputs are compromised, support zero-downtime hot-swapping, and maintain demographic fairness.
- **Traceability:** NFR-4, NFR-5, NFR-6, DR-17
- **Primary Personas:** Dr. Chen, Advocate Mehta
- **Included User Stories (see user_stories.md):**
  - : Compression-Resilient Robustness & Fallback Boundaries (P0, 8 pts)
  - : Dynamic Zero-Downtime Model Hot-Swapping (P1, 5 pts)
  - : Demographic Parity & Algorithmic Fairness Auditing (P1, 5 pts)

#### Epic 10: Zero-Trust Security, Data Minimization & Ephemeral Storage
- **Epic ID:** 
- **Objective:** Protect user media with end-to-end TLS encryption, non-executable storage isolation, automated 24-hour shredding, biometric consent gating, and private utility architecture.
- **Traceability:** NFR-7, NFR-8, NFR-9, NFR-11, NFR-12, NFR-13, NFR-14, DR-5, DR-10, DR-12, DR-13
- **Primary Personas:** Marcus, Advocate Mehta, Priya
- **Included User Stories (see user_stories.md):**
  - : End-to-End Cryptographic Encryption in Transit and at Rest (P0, 3 pts)
  - : Zero-Trust Ephemeral Media Lifecycle & 24-Hour Automated Shredding (P0, 3 pts)
  - : Strict Prohibition of User Media Re-Use for Model Training (P0, 2 pts)
  - : Biometric Signal Processing Consent Gate & Non-Identification Guarantee (P0, 3 pts)
  - : Private Utility Architecture & Intermediary Exemption (P0, 3 pts)

#### Epic 11: Usability, Observability & Platform Governance
- **Epic ID:** 
- **Objective:** Maintain honest accuracy claims, enforce academic non-commercial licensing, adhere to Chrome Manifest V3 local packaging constraints, and emit real-time Prometheus operational telemetry.
- **Traceability:** NFR-15, NFR-16, NFR-18, NFR-20, NFR-23, NFR-24, DR-3, DR-8, DR-9, DR-14, DR-15, DR-16
- **Primary Personas:** Sarah, Advocate Mehta, Marcus
- **Included User Stories (see user_stories.md):**
  - : Honest Metrics & Regulatory Transparency in UI (P0, 2 pts)
  - : Academic Non-Commercial Scope Enforcement (P0, 1 pt)
  - : Chrome Extension Manifest V3 Compliance (P1, 3 pts)
  - : SRE Operational Health Telemetry & Prometheus Metrics (P1, 3 pts)
  - : WhatsApp Cloud Sandbox & Anti-Abuse Rate Limiting (P1, 3 pts)

---

## 3. Bi-Directional Traceability Matrix

| Requirement Category | Task 3 Requirement ID | User Story ID | Parent Epic | Priority | Story Points |
|---|---|---|---|---|---|
| **Media Ingestion** | FR-1 |  | EPIC-01 | P0 | 3 pts |
| | FR-2 |  | EPIC-01 | P0 | 2 pts |
| | FR-3 |  | EPIC-01 | P0 | 5 pts |
| | FR-4 |  | EPIC-01 | P0 | 3 pts |
| | FR-5 |  | EPIC-01 | P0 | 5 pts |
| | FR-6, DR-14, DR-15 | ,  | EPIC-01, EPIC-11 | P1 | 8 pts + 3 pts |
| **Detection Engine** | FR-7 |  | EPIC-02 | P0 | 5 pts |
| | FR-8 |  | EPIC-02 | P0 | 5 pts |
| | FR-9 |  | EPIC-02 | P0 | 5 pts |
| | FR-10 |  | EPIC-02 | P0 | 5 pts |
| | FR-11 |  | EPIC-02 | P1 | 5 pts |
| | FR-12 |  | EPIC-02 | P0 | 5 pts |
| | FR-29 |  | EPIC-02 | P0 | 3 pts |
| | FR-31 |  | EPIC-02 | P1 | 5 pts |
| **Explainability (XAI)** | FR-13, DR-2 |  | EPIC-03 | P0 | 5 pts |
| | FR-14 |  | EPIC-03 | P0 | 8 pts |
| | FR-15 |  | EPIC-03 | P1 | 5 pts |
| | FR-16 |  | EPIC-03 | P0 | 3 pts |
| | FR-17, DR-8 |  | EPIC-03 | P0 | 5 pts |
| | FR-30 |  | EPIC-03 | P1 | 5 pts |
| **Sharing & Collab** | FR-18, NFR-10 |  | EPIC-04 | P1 | 3 pts |
| | FR-19 |  | EPIC-04 | P2 | 2 pts |
| **Moderation Queue** | FR-20 |  | EPIC-05 | P0 | 5 pts |
| | FR-21 |  | EPIC-05 | P1 | 3 pts |
| | FR-22 |  | EPIC-05 | P1 | 5 pts |
| | FR-23 |  | EPIC-05 | P1 | 5 pts |
| **Consent & Governance**| FR-24, FR-32, DR-6 |  | EPIC-06 | P0 | 3 pts |
| | FR-25 |  | EPIC-06 | P0 | 2 pts |
| | FR-26 |  | EPIC-06 | P1 | 3 pts |
| | FR-27, DR-4 |  | EPIC-06 | P1 | 1 pt |
| | FR-33, DR-13 |  | EPIC-06 | P1 | 3 pts |
| | FR-34, DR-11 |  | EPIC-06 | P0 | 2 pts |
| **Browser Extension** | FR-28, NFR-23 | ,  | EPIC-07, EPIC-11 | P1 | 8 pts + 3 pts |
| **Performance & Scale** | NFR-1, NFR-2 |  | EPIC-08 | P0 | 5 pts |
| | NFR-3, NFR-22 |  | EPIC-08 | P1 | 5 pts |
| | NFR-21, NFR-25 |  | EPIC-08 | P1 | 5 pts |
| **Robustness & Ethics** | NFR-4, NFR-5 |  | EPIC-09 | P0 | 8 pts |
| | NFR-6 |  | EPIC-09 | P1 | 5 pts |
| | DR-17 |  | EPIC-09 | P1 | 5 pts |
| **Security & Privacy** | NFR-7 |  | EPIC-10 | P0 | 3 pts |
| | NFR-8, NFR-9 | Covered in  | EPIC-01, EPIC-10 | P0 | — |
| | NFR-11, DR-13 |  | EPIC-10 | P0 | 3 pts |
| | NFR-12, DR-12 |  | EPIC-10 | P0 | 2 pts |
| | NFR-13, DR-5, DR-10 |  | EPIC-10 | P0 | 3 pts |
| | NFR-14, DR-7 |  | EPIC-10 | P0 | 3 pts |
| **Observability & Usability** | NFR-15, NFR-16, DR-9 |  | EPIC-11 | P0 | 2 pts |
| | NFR-17 | Embedded in  | EPIC-09 | P0 | — |
| | NFR-18, DR-3 |  | EPIC-11 | P0 | 1 pt |
| | NFR-24 |  | EPIC-11 | P1 | 3 pts |

---

## 4. Epic-to-Sprint Strategic Roadmap

The 11 Epics are scheduled across four 2-week agile sprints:

- **Sprint 1: Core Ingestion, Security Baseline & Model Preprocessing**
  - *Epics engaged:* EPIC-01 (Web Uploads), EPIC-02 (Preprocessing), EPIC-06 (Consent & Attestation), EPIC-10 (Zero-Trust Security).
  - *Story Points:* 42 pts.
- **Sprint 2: Asynchronous Worker Engine, Detection Models & Explainability (XAI)**
  - *Epics engaged:* EPIC-02 (Async Task Queue & SSE), EPIC-03 (Explainability & Heatmaps), EPIC-08 (Performance SLAs), EPIC-09 (Robustness & Compression).
  - *Story Points:* 52 pts.
- **Sprint 3: Evidence Reports, Privacy Automations & Moderation Queue Console**
  - *Epics engaged:* EPIC-03 (PDF Reports & Metadata), EPIC-04 (Ephemeral Sharing), EPIC-05 (Moderation Console), EPIC-06 (Rights Revocation & Credits).
  - *Story Points:* 46 pts.
- **Sprint 4: Multi-Channel Integrations, Edge Extensions & Production Polish**
  - *Epics engaged:* EPIC-01 (WhatsApp Cloud Bot), EPIC-04 (WhatsApp Sharing), EPIC-07 (Chrome Extension), EPIC-11 (Telemetry, Threshold Tuning & Governance).
  - *Story Points:* 44 pts.

---
*Maintained by the Mad-Eye Moody Lens Engineering Team (IT314 Software Engineering).*
