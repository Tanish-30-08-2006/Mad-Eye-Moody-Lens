# Task 6 - Conflict Identification & Resolution
**Project:** Mad-Eye Moody Lens - Deepfake AI Detector · **Course:** IT314 Software Engineering · **Group:** 35
**Inputs:** `User-Stories.md` (49 stories, 11 epics), `sprints.md` (4 sprints), stakeholder list, Task 3 requirements report
**Outputs:** this file (conflicts + refined backlog + revised sprint plan) and `sprints-revised.md`

---

## 1. What This Document Is

- Our stories came from six personas and a few outside parties, so some of them pull against each other.
- Task 6 is where we find those clashes, fix them, and write the fixes down before anyone codes.
- The order we're following:
  1. Stakeholders → 2. Elicitation → 3. Requirements → 4. User stories → 5. Epics + sprints → **6. Conflicts (this doc)** → refined stories → updated sprints → **7. Start Sprint 1.**
- So yes, after this doc some stories get **updated**, some **merged**, a few **removed**, and the sprint plan gets updated before Sprint 1 starts. That's all in Sections 9 and 10.
- Backlog refinement doesn't stop here. Later sprints can still adjust stories, but anything that touches Sprint 1 has to be settled now.

---

## 2. Project Rules & Deliverables

### 2.1 Course instructions and where we stand

| # | Instruction | Our deliverable | Status |
|---|---|---|---|
| 1 | Identify stakeholders & end users | Stakeholder list (13 groups) | Done |
| 2 | Pick elicitation techniques per stakeholder | Elicitation techniques doc | Done |
| 3 | Apply the techniques (FR, NFR, domain) | Requirements report (FR-1–34, NFR-1–25, DR-1–17) | Done, except the general-public survey and the media-subject ethics brainstorm, which are still open. Any new story from them goes through the same conflict check |
| 4 | User stories with front + back of card | `User-Stories.md` | Done; gets refreshed with Section 9 changes |
| 5 | EPICs grouped into sprints | `sprints.md` | Done; revised in `sprints-revised.md` |
| 6 | Identify & resolve conflicts | **This document** | Done |
| 7 | Start Sprint 1 + concept poster | Sprint 1 board + poster | Next |

### 2.2 Mandatory tools

- **Agile (Scrum):** product backlog, 2-week sprints, sprint goals, a Scrum Master (P1) running standups.
- **GitHub:** all work goes through the repo. All 11 members are contributors. The person who did the work makes the commit, since it's checked later.
- **Slack:** all discussion and decisions stay there. Post the Section 7 summary there so the decisions are visible.

---

## 3. Fixed Rules & Requirements We Can't Break

Conflicts get solved *around* these. If a story clashes with one of them, the story changes.

| Rule | Source |
|---|---|
| Project stays non-commercial and academic (FaceForensics++ licence) | DLE01 |
| Consent notice before any upload | DLE02 · DPDPA 2023 |
| Delete media right after analysis; 24-hour storage rule as backup | DLE03 |
| Results are private to the user. No public hosting, no public gallery | DLE05 · IT Rules 2021 |
| Results are probabilities, always with the disclaimer. Never a bare "Real/Fake". Never "100% accurate" | NFR06, NFR07, DLE07 |
| Reports carry the "Uncertified Academic AI Analysis" watermark | DLE09 |
| User media is never used for training without opt-in | DLE12 |
| No non-consensual intimate content: terms + checkbox | DLE04 |
| Credit ASVspoof 2019 (CC BY 4.0) and the other datasets | DLE10 |
| HTTPS, encrypted storage, magic-number check, UUID file names | SEC01–SEC05 |
| Video/audio jobs return 202 + task ID (async) | FR12 |
| Extension uses Manifest V3, `activeTab`, no remote code | TC07, SEC07 |
| WhatsApp: sandbox only, forward-only, download media within 5 minutes | TC09, TC10 |
| Uploads capped at 50 MB (AWS free tier) | TC06 |

---

## 4. How We Decide

### 4.1 Resolution rules

| Rule | Meaning |
|---|---|
| **R1 - Law first** | Legal rule involved? Law wins over convenience. |
| **R2 - Privacy over extras** | A nice feature that needs extra personal data gets cut or limited. |
| **R3 - Must-have beats nice-to-have** | P0 beats P1, P1 beats P2. |
| **R4 - Keep it simple** | It's an academic prototype. If a small version does the job, build that. |
| **R5 - User decides, system warns** | The user makes the final call; the tool just warns. |
| **R6 - Middle path** | If both sides have a fair point, give each most of what it needs. |

### 4.2 Method

1. Listed all stories by epic and by persona.
2. Compared each epic with every other epic: "Can both be true at once?"
3. Compared personas: who wins and who loses if story X is built as written?
4. Checked stories against the fixed rules in Section 3.
5. Checked numbers that appear in more than one place (limits, thresholds, points).
6. Checked `sprints.md` against the stories: right epics, right order, right totals.
7. Picked a fix with the rules above, logged it, and updated the backlog.

---

## 5. Stakeholders in the Conflicts

| Who | Wants | Worries about | Conflicts |
|---|---|---|---|
| **Sarah** (journalist) | Fast, explainable results; shareable PDF | Being unable to defend a result | C-02, C-04, C-06, C-07, C-11 |
| **Alex** (moderator) | One-click actions, quick decisions | Queue speed, false positives | C-03, C-04, C-05, C-07 |
| **Priya** (everyday user) | Easy WhatsApp / browser checks | Her media being kept or shared | C-01, C-02, C-08, C-09, C-12 |
| **Dr. Chen** (ML engineer) | Good models, feedback data, tuning | Compressed media, weak accuracy | C-01, C-06, C-13, C-14 |
| **Marcus** (infra) | Safe uploads, stable system | Cost, limits, complexity | C-12, C-14 |
| **Advocate Mehta** (legal) | Consent, deletion, disclaimers | Liability, wrong claims | C-01–C-04, C-07–C-11, C-13 |
| Dataset providers | Licence followed, credit given | Commercial use | C-13, C-14 |
| Chrome Web Store / Meta | Their policies followed | Over-broad access, spam | C-08, C-09 |
| Course instructor | Prototype scope, all deliverables | Over-ambitious plan | C-14, C-15, C-17 |

---

## 6. Epics (from `sprints.md`, with final sprint)

| Epic | Name | What's in it | Sprint(s) after revision |
|---|---|---|---|
| EPIC-01 | Web Uploads & Channels | Upload, file checks, S3 upload, WhatsApp bot | S1, S2, S4 |
| EPIC-02 | Detection & Async Engine | Routing, preprocessing, queue, progress, triage/deep scan | S1, S2, S3 |
| EPIC-03 | Explainability & Reports | Score + reason, heatmaps, PDF, metadata | S2, S3 |
| EPIC-04 | Sharing | Share link, WhatsApp share | S3, S4 |
| EPIC-05 | Moderation Console | Console, review queue, feedback, provenance | S3, S4 |
| EPIC-06 | Consent, Rights & Credits | Consent, disclaimer, checkbox, errors, erasure, credits | S1, S3 |
| EPIC-07 | Chrome Extension | Right-click verify | S4 |
| EPIC-08 | Performance | Speed goals, CPU-first run | S2 |
| EPIC-09 | Robustness | Compressed-media accuracy | S2 |
| EPIC-10 | Zero-Trust Security | HTTPS, deletion, private results | S1 |
| EPIC-11 | Governance & Operations | Threshold page, model reload, subgroup check, health page | S4 |

---

## 7. Conflict Summary

| ID | Conflict | Epics | Severity | Status |
|---|---|---|---|---|
| C-01 | Delete media now vs. feedback and PDF evidence | 10 vs 5, 3 | High | Resolved |
| C-02 | Share links last days vs. 24h deletion and "private" | 4 vs 10, 6 | High | Resolved |
| C-03 | Moderation queue holds items vs. "private utility" | 5 vs 10 | High | Resolved |
| C-04 | Fast takedown vs. "never a bare verdict, humans decide" | 5 vs 3, 6 | High | Resolved |
| C-05 | Two different "uncertain" ranges (40–60 vs 45–65) | 3 vs 5 | Medium | Resolved |
| C-06 | Fast results vs. explanation and accuracy | 8 vs 2, 3 | Medium | Resolved |
| C-07 | Reverse-image search sends images out vs. privacy | 5 vs 10 | Medium | Resolved |
| C-08 | WhatsApp bot vs. consent, sandbox and privacy | 1 vs 6 | Medium | Resolved |
| C-09 | Extension scans every post vs. Chrome rules | 7 vs 6, 11 | Medium | Resolved |
| C-10 | Legal pop-ups every time vs. deadline users | 6 vs 2, 3 | Low | Resolved |
| C-11 | Showing GPS/camera metadata vs. privacy | 3 vs 10, 4 | Medium | Resolved |
| C-12 | Video limit 100 MB vs. 50 MB free-tier cap | 1 vs cloud | Medium | Resolved |
| C-13 | Accuracy target vs. honest-claims rule | 9 vs 6 | Low | Resolved |
| C-14 | Company-sized infra stories vs. student scope | 8, 9, 11 vs scope | High | Resolved |
| C-15 | `sprints.md` epic grouping vs. the stories | Sprint plan | Medium | Resolved |
| C-16 | Sprint order: features needed before they exist | Sprint plan | High | Resolved |
| C-17 | Sprint point totals wrong and uneven | Sprint plan | Medium | Resolved |

---

## 8. Conflicts in Detail

### C-01 - Delete media now vs. feedback and PDF evidence
- **Clash:** US-NFR-08/09 say the file is gone as soon as the result is ready. US-FR-21 (feedback for retraining) and US-FR-17 (PDF with image crops) seem to need it.
- **Who/where:** Priya, Mehta (EPIC-10) vs. Dr. Chen, Alex, Sarah (EPIC-05, EPIC-03).
- **Decision:** Delete the file, keep only small non-personal data: task ID, model version, thumbs up/down, optional comment. Build the PDF *before* deleting; the crops live only inside the PDF the user downloads. No retraining on user media in this project.
- **Rule:** R1, R2 · **Stories:** US-FR-21, US-FR-17, US-NFR-08 · **Status:** Resolved

### C-02 - Share links last days vs. 24h deletion and "private"
- **Clash:** US-FR-18 allows 7-day links. US-NFR-08/11 say nothing stays past 24 hours and results stay private. US-FR-33 says erase on request.
- **Who/where:** Sarah (EPIC-04) vs. Mehta, Priya (EPIC-10, EPIC-06).
- **Decision:** A link opens a read-only **report** (score, reason, heatmap image), never the original file. Random token, optional password, expiry 2h/24h/7 days, creator can revoke, report is deleted at expiry, erasure requests kill the links too. Pages carry `noindex`.
- **Rule:** R1, R6 · **Stories:** US-FR-18, US-FR-33 · **Status:** Resolved

### C-03 - Moderation queue holds items vs. "private utility"
- **Clash:** A shared queue (US-FR-20, 22) looks like a shared content store, which US-NFR-11 forbids so we don't count as a social platform under IT Rules 2021.
- **Who/where:** Alex (EPIC-05) vs. Mehta (EPIC-10).
- **Decision:** The queue holds **job info only** (job ID, score, status, notes), never media. Moderator login required. Entries expire in 24h. Since we don't own a real platform, the action buttons are **simulated**: they log the action and show a confirmation.
- **Rule:** R1, R4 · **Stories:** US-FR-20, US-FR-22, US-NFR-11 · **Status:** Resolved

### C-04 - Fast takedown vs. "never a bare verdict, humans decide"
- **Clash:** Moderators have 30–60 seconds per ticket and like clear answers. Legal and journalists want likelihoods only, with a human in charge.
- **Who/where:** Alex (EPIC-05) vs. Mehta, Sarah (EPIC-03, EPIC-06).
- **Decision:** The tool never acts alone; every action is a human click. Results always show score + reason + disclaimer, plus a green/amber/red band so they read in seconds. On an Inconclusive result the Takedown button is off; the moderator escalates or overrides with a written reason.
- **Rule:** R1, R5, R6 · **Stories:** US-FR-20, US-FR-13 · **Status:** Resolved

### C-05 - Two different "uncertain" ranges
- **Clash:** US-FR-16 says Inconclusive is 40–60%. US-FR-22 says "needs senior review" is 45–65%. A 42% score would be treated two ways.
- **Decision:** One band, one config value, default **40–60%**. Inside it the result says Inconclusive, and for moderators it also lands in the review queue. Same event, two views. The admin page (US-FR-31) edits that one value.
- **Rule:** R4 · **Stories:** US-FR-16, US-FR-22, US-FR-31 · **Status:** Resolved

### C-06 - Fast results vs. explanation and accuracy
- **Clash:** Speed targets (US-NFR-01) vs. heatmaps and full scans (US-FR-12, US-FR-14).
- **Who/where:** Sarah, Alex (EPIC-08) vs. Dr. Chen (EPIC-02, EPIC-03).
- **Decision:** Keep two modes: Rapid Triage and Deep Scan. The score shows first; the heatmap and detail load after. Triage is labelled "Quick check - not final". Time targets are goals; we measure on our hardware and report honestly.
- **Rule:** R4, R6 · **Stories:** US-FR-14, US-FR-12, US-NFR-01 · **Status:** Resolved

### C-07 - Reverse-image search sends images out
- **Clash:** US-FR-23 sends keyframes to Google Vision / TinEye. US-NFR-09 says nothing goes to third parties without opt-in.
- **Decision:** Nothing is sent automatically. A "Check Historical Provenance" button warns "This opens an outside service" and then opens Google Lens / TinEye in a new tab, where the user uploads the frame themselves. No paid API.
- **Rule:** R2, R4, R5 · **Stories:** US-FR-23 · **Status:** Resolved

### C-08 - WhatsApp bot vs. consent, sandbox and privacy
- **Clash:** The web consent pop-up can't appear in WhatsApp. The bot works only for sandbox test numbers. Rate limiting means remembering senders.
- **Decision:** A new number gets a short consent message first; analysis starts only after the user replies **AGREE** (it includes the "I have the right to share this, nothing intimate or illegal" line). For rate limits we keep only a **hashed** number for one hour. Media is fetched at once (link expires in ~5 min) and deleted after analysis. The bot is labelled a sandbox demo.
- **Rule:** R1, R2 · **Stories:** US-FR-06 (absorbs US-NFR-16) · **Status:** Resolved

### C-09 - Extension scans every post vs. Chrome rules
- **Clash:** US-FR-28 watches every media element on a feed. Chrome wants minimum permissions, and sending media out needs consent.
- **Decision:** The extension does nothing until the user acts: right-click media → "Verify with Moody Lens", or click the icon on the current tab. It uses `activeTab` and the context menu only. A one-time consent box on first use. The hover badge is dropped.
- **Rule:** R1, R3, R4 · **Stories:** US-FR-28 (absorbs US-NFR-14) · **Status:** Resolved

### C-10 - Legal pop-ups every time vs. deadline users
- **Clash:** Consent + attestation on every upload slows people checking many files.
- **Decision:** The full consent box (English/Hindi) shows **once per session**. The short rights checkbox stays on **every** upload (one click). Both stay mandatory; they just repeat less.
- **Rule:** R1, R6 · **Stories:** US-FR-24, US-FR-34 · **Status:** Resolved

### C-11 - Showing GPS/camera metadata vs. privacy
- **Clash:** US-FR-30 shows metadata that can reveal location and device. US-NFR-10 wants minimal personal data; share links and PDFs could leak it.
- **Decision:** Metadata is shown only to the uploader in their own session. If GPS is found, we show a flag ("location data found") and leave it out of PDFs and share links unless the user ticks a box. It's deleted with the file.
- **Rule:** R2, R5 · **Stories:** US-FR-30, US-FR-17, US-FR-18 · **Status:** Resolved

### C-12 - Video limit 100 MB vs. 50 MB cap
- **Clash:** US-FR-02 allows 100 MB video and US-FR-05 uses a 70 MB example, but our cloud analysis caps uploads at 50 MB for the free tier.
- **Decision:** Limits: **image 10 MB, video 50 MB, audio 20 MB**. The error message names the exact limit. One config value if we ever raise it.
- **Rule:** R4 · **Stories:** US-FR-02, US-FR-05 · **Status:** Resolved

### C-13 - Accuracy target vs. honest claims
- **Clash:** US-NFR-04 aims for AUC above 0.82 on heavily compressed media, but our own research notes show accuracy can fall to about 81% there. US-NFR-12 bans over-claiming.
- **Decision:** 0.82 stays a **goal**, not a promise. The app shows only numbers we measured ourselves, with the method linked. If we miss the goal, the limitations text says so and Inconclusive covers more cases. The claims wording rule (merged into US-FR-27) applies from Sprint 1.
- **Rule:** R1, R4 · **Stories:** US-NFR-04, US-FR-27 · **Status:** Resolved

### C-14 - Company-sized infra stories vs. student scope
- **Clash:** Several stories describe a company system. We have 11 students, 4 sprints and free-tier credits.
- **Decision:** Keep each story's goal, build the small version. US-NFR-03 (auto-scaling) is removed and goes to Future Work.

| Story | Original idea | What we build instead |
|---|---|---|
| US-NFR-02 | GPU + optimised CPU fallback | Small model on CPU; GPU only if the machine has one |
| US-NFR-03 | Auto-scaling workers | **Removed.** Fixed workers + "busy, try again" message |
| US-NFR-05 | Zero-downtime model swap | Replace the model file, restart the worker at a quiet time |
| US-NFR-06 | Full fairness audit | Report results per subgroup our datasets label |
| US-NFR-15 | Monitoring and alerts | Health page + log file + error counter |
| US-FR-08 | RetinaFace or MTCNN | MTCNN only |
| US-FR-31 | ROC curves + sliders | One simple page editing the threshold values |
| US-FR-30 | Full metadata + 10 keyframes | Key EXIF fields + 5 keyframes |
| US-FR-33 | Ticketing with tracking numbers | Simple form, logged, data purged |
| US-FR-15 | Four subtype labels | Three labels our datasets support: Face Swap, Expression Re-enactment, Voice Clone |
| US-FR-23 | Reverse-search API | Manual links (C-07) |
| US-NFR-01 | Hard speed SLAs | Goals we measure (C-06) |

- **Rule:** R3, R4 · **Status:** Resolved

### C-15 - `sprints.md` epic grouping vs. the stories
- **Clash:** `sprints.md` puts all of EPIC-08 and EPIC-09 in Sprint 2, which would pull auto-scaling, model swap and the fairness audit in beside the queue and heatmaps. It also names EPIC-11 "Threshold Tuning & Governance", but US-FR-31 sits in EPIC-02 in the stories. And US-NFR-12/13 (honest claims, licence) sit in EPIC-11, which is Sprint 4, too late for legal rules.
- **Decision:** US-NFR-03 removed. US-FR-31, US-NFR-05, US-NFR-06 move to EPIC-11 (S4) so the name fits. US-NFR-12/13 merge into US-FR-27 (EPIC-06, S3). The LICENSE file is added in Sprint 1 repo setup.
- **Rule:** R3, R4 · **Status:** Resolved

### C-16 - Sprint order: features needed before they exist
- **Clash:**
  - US-FR-05 (S1) triggers inference through the queue, which arrives in S2 (US-FR-10).
  - US-FR-22 (S3) needs thresholds, but the admin page (US-FR-31) is S4.
  - Consent and disclaimer must exist before any real upload. `sprints.md` already has them in S1, which is right.
- **Decision:** US-FR-05 moves to S2 with the queue; S1 uses a plain upload and a direct model call. In S3 thresholds come from a config file; the S4 page edits the same file. Consent, disclaimer and rights checkbox stay in S1.
- **Rule:** R3 · **Stories:** US-FR-05, US-FR-22, US-FR-31 · **Status:** Resolved

### C-17 - Sprint totals wrong and uneven
- **Clash:** `sprints.md` says 42 / 52 / 46 / 44 (184). Adding the real story points gives 47 / 57 / 48 / 47 (199), and Sprint 2 is overloaded.
- **Decision:** Recalculate after refinement and rebalance: US-FR-12 and US-FR-15 move S2 → S3, US-FR-21 moves S3 → S4. New totals are in Section 10. Sprint 4 is deliberately lighter because the Meta sandbox and Chrome review can slow us down, and we need time for the final report and demo.
- **Rule:** R4 · **Status:** Resolved

---

## 9. Refined Backlog (After Conflict Resolution)

| ID | Story | Epic | Pts (old → new) | Action | Sprint | Conflict |
|---|---|---|---|---|---|---|
| US-FR-01 | Upload with file-type filter | EPIC-01 | 3 → 3 | Keep | S1 | - |
| US-FR-02 | Browser file checks (10/50/20 MB) | EPIC-01 | 2 → 2 | Update | S1 | C-12 |
| US-FR-03 | Server magic-number check | EPIC-01 | 5 → 5 | Keep | S1 | - |
| US-FR-04 | UUID rename + safe storage | EPIC-01 | 3 → 3 | Keep | S1 | - |
| US-FR-07 | Image/video vs audio routing | EPIC-02 | 5 → 5 | Keep | S1 | - |
| US-FR-08 | Face detect + 1.3x crop (MTCNN) | EPIC-02 | 5 → 5 | Update | S1 | C-14 |
| US-FR-09 | Audio convert + LFCC/CQCC | EPIC-02 | 5 → 5 | Keep | S1 | - |
| US-FR-24 | Consent modal EN/HI (+ biometric note) | EPIC-06 | 3 → 4 | Update + merge | S1 | C-10 |
| US-FR-25 | Probabilistic disclaimer badge | EPIC-06 | 2 → 2 | Keep | S1 | C-16 |
| US-FR-34 | Rights / no-NCII checkbox | EPIC-06 | 2 → 2 | Keep | S1 | C-10 |
| US-NFR-07 | HTTPS + encryption | EPIC-10 | 3 → 3 | Keep | S1 | - |
| US-NFR-08 | Delete after analysis + no training reuse | EPIC-10 | 3 → 4 | Update + merge | S1 | C-01 |
| US-NFR-11 | Private results (token, else 404) | EPIC-10 | 3 → 3 | Update | S1 | C-03 |
| US-FR-05 | Direct-to-S3 upload | EPIC-01 | 5 → 5 | Update | S2 | C-12, C-16 |
| US-FR-10 | Task ID + 202 response | EPIC-02 | 5 → 5 | Keep | S2 | - |
| US-FR-11 | Live progress (SSE) | EPIC-02 | 5 → 5 | Keep | S2 | - |
| US-FR-29 | Frame-score aggregation shown | EPIC-02 | 3 → 3 | Keep | S2 | - |
| US-FR-13 | Score + plain-language reason | EPIC-03 | 5 → 5 | Update | S2 | C-04 |
| US-FR-14 | Heatmaps + video timeline | EPIC-03 | 8 → 8 | Update | S2 | C-06 |
| US-FR-16 | Inconclusive state | EPIC-03 | 3 → 3 | Update | S2 | C-05 |
| US-NFR-01 | Speed goals, measured | EPIC-08 | 5 → 3 | Simplify | S2 | C-06 |
| US-NFR-02 | CPU-first model run | EPIC-08 | 5 → 2 | Simplify | S2 | C-14 |
| US-NFR-04 | Compression robustness | EPIC-09 | 8 → 8 | Update | S2 | C-13 |
| US-FR-12 | Triage vs deep scan | EPIC-02 | 5 → 5 | Update (moved) | S3 | C-06, C-17 |
| US-FR-15 | Manipulation-type label | EPIC-03 | 5 → 3 | Simplify (moved) | S3 | C-17 |
| US-FR-17 | PDF evidence report + watermark | EPIC-03 | 5 → 5 | Update | S3 | C-01, C-11 |
| US-FR-30 | Metadata + keyframes | EPIC-03 | 5 → 3 | Simplify | S3 | C-11, C-14 |
| US-FR-18 | Report-only share link | EPIC-04 | 3 → 3 | Update | S3 | C-02 |
| US-FR-20 | Moderation console | EPIC-05 | 5 → 4 | Update | S3 | C-03, C-04 |
| US-FR-22 | Dispute / senior-review queue | EPIC-05 | 5 → 5 | Update | S3 | C-03, C-05, C-16 |
| US-FR-23 | Provenance lookup (manual links) | EPIC-05 | 5 → 2 | Simplify | S3 | C-07 |
| US-FR-26 | Friendly errors + retry | EPIC-06 | 3 → 3 | Keep | S3 | - |
| US-FR-27 | Credits, licence & honest-claims page | EPIC-06 | 1 → 3 | Merge | S3 | C-13 |
| US-FR-33 | Erasure / grievance form | EPIC-06 | 3 → 2 | Simplify | S3 | C-02, C-14 |
| US-FR-06 | WhatsApp forward-to-verify (+ rate limit) | EPIC-01 | 8 → 10 | Update + merge | S4 | C-08 |
| US-FR-19 | WhatsApp click-to-chat share | EPIC-04 | 2 → 2 | Keep | S4 | - |
| US-FR-21 | Agree/disagree feedback | EPIC-05 | 3 → 3 | Update (moved) | S4 | C-01, C-17 |
| US-FR-28 | Chrome extension (+ Manifest V3) | EPIC-07 | 8 → 9 | Update + merge | S4 | C-09 |
| US-FR-31 | Threshold settings page | EPIC-11 | 5 → 3 | Simplify (moved) | S4 | C-05, C-15 |
| US-NFR-05 | Model reload (manual) | EPIC-11 | 5 → 2 | Simplify (moved) | S4 | C-14, C-15 |
| US-NFR-06 | Subgroup results check | EPIC-11 | 5 → 2 | Simplify (moved) | S4 | C-14, C-15 |
| US-NFR-15 | Health page + logs | EPIC-11 | 3 → 1 | Simplify | S4 | C-14 |

**Merged or removed stories (7):**

| ID | Story | Old pts | What happened | Conflict |
|---|---|---|---|---|
| US-NFR-03 | Auto-scaling | 5 | Removed - Future Work | C-14 |
| US-NFR-09 | No training on user media | 2 | Merged into US-NFR-08 | C-01 |
| US-NFR-10 | Biometric consent gate | 3 | Merged into US-FR-24 | C-10 |
| US-NFR-12 | Honest metrics in UI | 2 | Merged into US-FR-27 | C-13 |
| US-NFR-13 | Non-commercial licence | 1 | Merged into US-FR-27 | C-13 |
| US-NFR-14 | Manifest V3 rules | 3 | Merged into US-FR-28 | C-09 |
| US-NFR-16 | WhatsApp sandbox + rate limit | 3 | Merged into US-FR-06 | C-08 |

**Totals:** 49 stories → **42 stories**. 199 points → **163 points**. Actions: 13 kept as-is, 18 updated, 10 simplified, 1 merged-in (US-FR-27), 7 merged/removed.

## 10. Revised Sprint Plan

| Sprint | Points | Stories |
|---|---|---|
| S1 | 46 | FR-01, FR-02, FR-03, FR-04, FR-07, FR-08, FR-09, FR-24, FR-25, FR-34, NFR-07, NFR-08, NFR-11 |
| S2 | 47 | FR-05, FR-10, FR-11, FR-29, FR-13, FR-14, FR-16, NFR-01, NFR-02, NFR-04 |
| S3 | 38 | FR-12, FR-15, FR-17, FR-30, FR-18, FR-20, FR-22, FR-23, FR-26, FR-27, FR-33 |
| S4 | 32 | FR-06, FR-19, FR-21, FR-28, FR-31, NFR-05, NFR-06, NFR-15 |
| **Total** | **163** | 42 stories |

Sprint 1 also carries a few zero-point tasks: repo and Slack setup, LICENSE file, and the concept poster (instruction 7). Sprint 4 is lighter on purpose (see C-17).

---

## 11. Requirement Coverage After Refinement

- **Functional (FR-1 to FR-34):** every one still has a story. Several are smaller (see C-14).
- **Domain (DR-1 to DR-17):** every legal and ethical rule still has a story, so none are dropped. DR-17 (fairness) shrinks to the subgroup check in US-NFR-06.
- **Non-functional (NFR-1 to NFR-25):**
  - **Deferred to Future Work:** NFR-21 and NFR-25 (auto-scaling, from US-NFR-03). We'll say so in the final report.
  - **Reduced but kept:** NFR-3 and NFR-22 (GPU), NFR-6 (model swap), NFR-24 (monitoring).
  - **Everything else:** unchanged.

---

## 12. Next Steps

1. Post the Section 7 summary in Slack and get the team's OK.
2. Commit `conflict-resolution.md` and `sprints-revised.md` to GitHub, from whoever merged them.
3. Update `User-Stories.md` so each changed story's acceptance criteria match Section 9.
4. Start Sprint 1 and build the concept poster.

### Open points for the team

- Confirm the upload limits (10 / 50 / 20 MB) with whoever sets up the cloud.
- Confirm that moderation actions stay **simulated** (C-03). If the instructor wants a real integration, we revisit.
- Choose who owns the single "uncertain band" value (C-05).
- Agree on the sandbox label wording for the WhatsApp bot (C-08).
- When the general-public survey and the media-subject ethics session finish, run any new stories through Section 4.

---
*End of Task 6 document.*