
## 4. Epic-to-Sprint Strategic Roadmap (Revised)

The 11 epics are scheduled across four 2-week sprints. Totals now match the refined stories (163 points, 42 stories). Source: `conflict-resolution.md`.

- **Sprint 1: Core Ingestion, Security Baseline, Preprocessing & Legal Gate**
  - *Epics engaged:* EPIC-01 (Web Uploads), EPIC-02 (Preprocessing & Routing), EPIC-06 (Consent & Attestation), EPIC-10 (Zero-Trust Security)
  - *Story Points:* 46 pts
  - *Stories:* FR-01, FR-02, FR-03, FR-04, FR-07, FR-08, FR-09, FR-24, FR-25, FR-34, NFR-07, NFR-08, NFR-11
  - *Goal:* Upload works end to end for image/audio/video, files are checked and stored safely, consent + disclaimer are live before any real upload, first models run through a direct call (no queue yet). Also: repo + Slack setup, LICENSE file, concept poster (0 pts).
- **Sprint 2: Async Engine, Explainability & Robust Models**
  - *Epics engaged:* EPIC-01 (Direct-to-S3 Upload), EPIC-02 (Async Queue & SSE), EPIC-03 (Explainability & Heatmaps), EPIC-08 (Performance), EPIC-09 (Robustness & Compression)
  - *Story Points:* 47 pts
  - *Stories:* FR-05, FR-10, FR-11, FR-29, FR-13, FR-14, FR-16, NFR-01, NFR-02, NFR-04
  - *Goal:* Queue + progress updates replace the direct call, results show score + reason + heatmap, Inconclusive works, models tested on compressed data.
- **Sprint 3: Evidence Reports, Sharing, Moderation Console & Rights**
  - *Epics engaged:* EPIC-02 (Triage vs Deep Scan), EPIC-03 (PDF Reports & Metadata), EPIC-04 (Report Sharing), EPIC-05 (Moderation Console), EPIC-06 (Errors, Rights & Credits)
  - *Story Points:* 38 pts
  - *Stories:* FR-12, FR-15, FR-17, FR-30, FR-18, FR-20, FR-22, FR-23, FR-26, FR-27, FR-33
  - *Goal:* Everything a journalist or moderator needs after the result: PDF, share link, console, review queue, erasure form, credits page.
- **Sprint 4: Integrations, Extension, Governance & Polish (lighter on purpose)**
  - *Epics engaged:* EPIC-01 (WhatsApp Bot), EPIC-04 (WhatsApp Sharing), EPIC-05 (Feedback), EPIC-07 (Chrome Extension), EPIC-11 (Threshold Tuning & Governance)
  - *Story Points:* 32 pts
  - *Stories:* FR-06, FR-19, FR-21, FR-28, FR-31, NFR-05, NFR-06, NFR-15
  - *Goal:* Outside channels (WhatsApp sandbox, Chrome extension), small admin tools, final testing, report and demo. Kept lighter because Meta sandbox and Chrome review can slow us down.

## What changed from the old plan

- Totals fixed: old file said 42/52/46/44 (184), but the stories actually added up to 47/57/48/47 (199). New plan: 46/47/38/32 (163).
- US-FR-05 (S1 → S2) so it arrives together with the queue. US-FR-12 and US-FR-15 (S2 → S3). US-FR-21 (S3 → S4).
- Consent, disclaimer and rights checkbox stay in S1 (EPIC-06), as in the old plan.
- US-FR-31, US-NFR-05, US-NFR-06 now sit in EPIC-11 so they match its name in the old plan.
- US-NFR-03 (auto-scaling) removed; five other heavy stories shrunk. Details in `conflict-resolution.md`.

---
*Maintained by the Mad-Eye Moody Lens Engineering Team (IT314 Software Engineering).*