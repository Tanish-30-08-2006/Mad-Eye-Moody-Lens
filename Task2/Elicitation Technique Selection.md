# Task 2 — Elicitation Technique Selection

## 1. System Overview & Elicitation Objectives
Mad-Eye Moody Lens is a multi-modal misinformation detection system designed to detect and flag AI-generated manipulations across images, audio, and video using Convolutional Neural Network (CNN) classifiers. 

To establish a disciplined and academically defensible requirements baseline, stakeholder identification and elicitation techniques were selected in accordance with **ISO/IEC/IEEE 29148:2018** and **BABOK v3** guidelines.

---

## 2. Primary Stakeholder & Elicitation Technique Matrix

| Stakeholder Class | Stakeholder Category | Relationship to System | Primary Concerns & Needs | Elicitation Technique | Methodological Justification | Resulting Requirement Areas |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **General Public User** | Primary End-User (Casual) | Direct operator of web UI / extension | Intuitive upload flow, rapid turnaround, simple authenticity verdict, privacy assurance that personal media is not stored. | **Survey / Questionnaire** | Broad, dispersed consumer base with low domain specialization. Surveys capture quantitative usage patterns, latency tolerance, and UI preferences across diverse demographics. | Functional (Drag-and-drop UI, simplified credibility score); Usability; Transparency. |
| **Social Media Content Moderator** | Primary End-User (Professional) | Direct operator of verification dashboard | Rapid verification under SLAs, explainable evidence (spatial heatmaps, temporal video markers, audio desync), clear policy violation flags, defensible escalation workflows. | **Semi-Structured Interview** | Complex, cognitive verification workflows. Semi-structured interviews unpack rule-enforcement heuristics, evidentiary thresholds, and decision-making under platform moderation pressures. | Functional (Explainable AI dashboard, multi-modal anomaly overlays, timeline glitch markers); Performance (Latency SLAs). |
| **ML / AI Engineering Team** | Internal Technical Stakeholder (Implementation SME) | Developers & maintainers of detection models | Model convergence, standardized input preprocessing (face cropping, 16 kHz mono WAV conversion), compression degradation, threshold calibration (FAR vs. FRR). | **Document Analysis & Secondary Literature Review** | Technical parameters, baseline architectures, and preprocessing boundaries are formally defined in peer-reviewed scientific literature (FaceForensics++, ASVspoof, DFDC). | System Constraints (Preprocessing pipelines, frame sampling rates); Model Performance Specifications. |
| **Platform Developer & System Admin Team** | Internal Technical & Operational Stakeholder | System architects & infrastructure maintainers | Asynchronous task queue orchestration (Celery/Redis) to prevent HTTP timeouts, OWASP file sanitization, automated 24-hour storage deletion lifecycle, health telemetry. | **Internal Technical Workshop & Brainstorming** | Internal cross-functional engineering trade-offs require structured collaborative whiteboarding to define API contracts, queue architecture, and security boundaries. | Technical Constraints (Asynchronous processing, REST API contracts); Security (File validation); Maintainability. |
| **Legal & Compliance Body** *(Includes Media Subject Proxy)* | External Regulatory & Ethical Authority | Statutory compliance & privacy oversight | Biometric data protection (DPDPA 2023, GDPR Art 9), avoidance of intermediary liability (IT Rules 2021), data minimization (immediate server deletion), liability disclaimers. | **Document Analysis** | Legal and ethical constraints are codified in statutory acts, ministry advisories, and AI ethics charters that require rigorous textual extraction. | Non-Functional (Data privacy, encryption in transit/rest); Legal/Domain Constraints (Consent notices, ephemeral storage policy, liability waivers). |
| **Dataset Providers & Research Community** | External Domain & Scientific Authority | Benchmark provider & legal data licensor | Non-commercial usage compliance, attribution mandates (CC BY 4.0), adherence to scientific evaluation metrics (AUC, EER, LogLoss). | **Document Analysis** | Contractual usage terms, licensing covenants, and benchmark standards are explicitly detailed in published repository terms of use and research papers. | Domain Constraints (Non-commercial open-source licensing, attribution notices); Quality Standards. |

---

## 3. Stakeholder Scope & Classification Register

The project initially identified 13 candidate entities. Following **ISO/IEC/IEEE 29148** principles regarding system boundaries and stakeholder identification, these candidates were systematically evaluated and classified to establish a realistic scope for this academic prototype:

1. **Role Consolidation:**
   * **Journalist / Fact-Checker & Social Media Moderator:** Both represent professional verification power-users whose functional interactions with the detection engine (Explainable AI, anomaly localization, confidence calibration) are largely identical. To eliminate redundant specifications, the **Social Media Content Moderator** was retained as the representative professional persona.
   * **Frontend/Backend Developer & Platform Admin:** Consolidated into the **Platform Developer & System Admin Team** to represent unified internal infrastructure, API orchestration, and maintenance concerns.

2. **Reclassification of Environmental Entities & Suppliers:**
   * **WhatsApp / Social Media Platforms:** Classified as an *External Environmental Entity*. Because the application interfaces solely via standard OS-level URI share links (`wa.me`) without automated API integrations or webhooks, WhatsApp resides in the operating environment rather than within the system stakeholder boundary.
   * **Cloud / Hosting Provider (AWS):** Classified as an *External Infrastructure Dependency / Source of Architectural Constraints*. In an academic prototype, vendor quotas (e.g., SageMaker synchronous payload limits, Lambda execution timeouts) represent physical implementation constraints on deployment rather than user requirements elicited from an organizational stakeholder.
   * **Subject of the Media:** Classified as an *Indirect / Affected Passive Stakeholder*. Because individual media subjects are unreachable prior to runtime, their essential rights (biometric privacy, right to erasure, protection against defamatory deepfakes) are systematically represented via proxy within the *Legal & Compliance Body* stakeholder class.
   * **Browser Extension Store Reviewer:** Excluded from the immediate prototype scope as the academic deliverable utilizes a locally loaded developer extension (`unpacked`), removing the dependency on commercial store review policies.

3. **Academic Governance vs. Product Boundary:**
   * **Course Instructor / Evaluator (IT-314):** Classified as the *Academic Project Sponsor / Acquirer*. While the instructor governs academic milestones and evaluation rubrics, they are separated from the operational software stakeholder matrix in accordance with standard SRS conventions.

---
*Note: This document refines the initial 13-entity stakeholder pool provided by P1 into an IEEE 29148-compliant, defensible baseline.*
