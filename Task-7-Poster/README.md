# Mad Eye Moody Lens

**Unmasking Digital Deception through Multi-Modal AI Verification**
*Group 35 · IT314 Software Engineering · DA-IICT*

> Detect. Analyze. Explain. Verify.

## The Problem

- Manipulated media spreads rapidly across social networks and messaging apps.
- Journalists and moderators lack quick, accessible verification tools.
- Binary real/fake labels often fail to explain their reasoning.
- Heavy compression makes accurate forensic detection difficult.

## Objectives

1. Analyze images, videos, and audio for digital manipulation.
2. Provide probabilistic confidence scores instead of binary labels.
3. Generate clear, plain-language explanations of the reasoning.
4. Enable informed and trustworthy decisions for everyday users and professionals.

## Key Features

- **Multi-Modal Analysis:** specialized models for image, video, and audio manipulation.
- **Explainable AI (XAI):** visual heatmaps, suspicious segments, and clear text explanations.
- **Omnichannel Ingestion:** web interface, WhatsApp bot, and browser extension.
- **Evidence Reporting:** downloadable, watermarked reports with visual annotations and reasoning.

## Analysis Workflow

1. **Ingestion & Validation:** submit media via web, extension, or WhatsApp; validate file signatures and MIME types.
2. **Preprocessing:** face detection and cropping for visual media; audio standardized to 16 kHz mono WAV.
3. **Asynchronous Inference:** large media processed through event-driven task queues.
4. **Aggregation & Diagnostics:** frame-level predictions aggregated into a unified verdict.
5. **Result Delivery:** real-time progress updates and a detailed confidence score with a plain-language explanation.

## Key Stakeholders

- **End users:** general public, journalists, and social media moderators.
- **Internal operators:** ML engineers tuning detection thresholds and platform admins managing system health.
- **Regulatory & ecosystem partners:** legal bodies (e.g., DPDPA, GDPR), browser extension store reviewers, and dataset providers (e.g., FaceForensics++, ASVspoof).

## Development Roadmap

| Phase | Focus | Highlights |
|---|---|---|
| 1 | Core ML & Secure Ingest | Train models on compressed media datasets; build a secure, non-executable cloud storage pipeline |
| 2 | Asynchronous Architecture & XAI | Event-driven task queues; explainable AI components |
| 3 | Omnichannel Access | Browser extension for live web scanning; WhatsApp integration |
| 4 | Moderation & Compliance | Moderator dispute queue; multilingual consent notices; 24-hour auto-deletion policies |

## Compliance & Privacy

- **Strict data minimization:** uploaded media is never hosted publicly and is deleted immediately after analysis.
- **Regulatory alignment:** explicit consent before upload, in line with data privacy frameworks such as DPDPA and GDPR.
- **No unauthorized sharing:** user data and media are never used to train future models without explicit opt-in consent, nor shared with unauthorized third parties.
- **Liability protections:** all downloadable reports carry disclaimers that results are probabilistic and do not constitute definitive legal proof.

## Status

Early stage: requirements, planning, and dataset analysis are in progress. Detection models and the application are not yet implemented.
