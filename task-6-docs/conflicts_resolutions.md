# Task 6 - Identifying & Resolving Conflicts
**Project:** Mad-Eye Moody Lens - Deepfake AI Detector (IT314, Group 35)
**Input documents:** `User-Stories.md` (49 user stories, 11 epics, 4 sprints), Task 2/3 requirements report

---

## 1. Why This Document Exists

- Our user stories came from many different people: journalists, moderators, everyday users, ML engineers, infra people, and legal.
- Different people want different things, so some stories pull in opposite directions.
- Before we build, we have to find those clashes, pick a fix, and write the fix down so nobody builds two things that fight each other.
- This document lists every conflict we found, what we decided, and which stories change because of it.

---

## 2. How We Found the Conflicts (Method)

1. **Listed all stories by epic** - 11 epics, 49 stories (Section 3).
2. **Compared every epic against every other epic**, asking: "Can both of these be true at the same time?"
3. **Compared stakeholders** - what does each persona want, and who loses if the other wins?
4. **Checked stories against hard limits** - law (DPDPA, IT Rules, GDPR), free-tier cloud limits, Chrome Web Store rules, dataset licenses.
5. **Checked the numbers** - thresholds, file sizes, and story points that appear in more than one place.
6. **Checked sprint order** - does any sprint need something that is only built in a later sprint?
7. **Picked a fix for each** using the rules below and logged it.

### Conflict types we looked for

| Type | Meaning |
|---|---|
| Stakeholder vs stakeholder | Two personas want opposite things |
| Requirement vs requirement | Two stories can't both be built as written |
| Requirement vs constraint | A story breaks a law, a budget, or a platform rule |
| Story vs story (data) | Same thing described with different numbers |
| Sprint / dependency | A sprint needs something that comes later |

### Resolution rules (how we decide)

| Rule | Meaning |
|---|---|
| **R1 - Law first** | If a legal rule is involved, the law wins over convenience. |
| **R2 - Privacy over extras** | If a nice-to-have feature needs extra personal data, we cut or limit the feature. |
| **R3 - Must-have beats nice-to-have** | P0 stories win over P1/P2 stories. |
| **R4 - Keep it simple** | This is an academic prototype. If a simple version meets the need, we build the simple version. |
| **R5 - User decides, system warns** | Where possible, the user makes the final call and the system just warns them. |
| **R6 - Middle path** | If both sides have a fair point, we build a version that gives each side most of what it needs. |

---

## 3. Epics & Sprints Recap

| Epic | Name | Stories | Planned Sprint |
|---|---|---|---|
| 1 | Secure Media Ingestion & Upload | US-FR-01 to 06 | S1 (US-FR-06 in S4) |
| 2 | Multi-Modal Detection & Async Engine | US-FR-07 to 12, 29, 31 | S1, S2 (US-FR-31 in S4) |
| 3 | Explainability, Visual Evidence & Reports | US-FR-13 to 17, 30 | S2, S3 |
| 4 | Secure Sharing | US-FR-18, 19 | S3, S4 |
| 5 | Moderation Queue | US-FR-20 to 23 | S3 |
| 6 | Trust, Legal & Privacy | US-FR-24 to 27, 32 to 34 | S1, S3 |
| 7 | Browser Extension | US-FR-28 | S4 |
| 8 | Performance & Scaling | US-NFR-01 to 03 | S2, S4 |
| 9 | Model Robustness & Governance | US-NFR-04 to 06 | S2, S4 |
| 10 | Security & Data Minimisation | US-NFR-07 to 11 | S1 |
| 11 | Usability & Operations | US-NFR-12 to 16 | S3, S4 |

---

## 4. Conflict Summary Table

| ID | Conflict (short) | Type | Epics | Severity | Status |
|---|---|---|---|---|---|
| C-01 | Delete media immediately vs. learn from feedback / keep evidence | Requirement vs requirement | 10 vs 5, 3 | High | Resolved |
| C-02 | Share links that last days vs. 24-hour deletion and "private only" | Requirement vs requirement | 4 vs 10, 6 | High | Resolved |
| C-03 | Moderation queue that holds items vs. "private utility, no public store" | Requirement vs constraint | 5 vs 10 | High | Resolved |
| C-04 | Moderators want fast takedown vs. "never a bare Real/Fake, humans must oversee" | Stakeholder vs stakeholder | 5 vs 3, 6 | High | Resolved |
| C-05 | "Inconclusive" band is 40–60% in one story and 45–65% in another | Story vs story | 3 vs 5 | Medium | Resolved |
| C-06 | Fast results vs. detailed explanation and accuracy | Stakeholder vs stakeholder | 8 vs 2, 3 | Medium | Resolved |
| C-07 | Reverse-image search sends images out vs. "never share with third parties" | Requirement vs requirement | 5 vs 10 | Medium | Resolved |
| C-08 | WhatsApp bot vs. consent checkbox, privacy and sandbox limits | Requirement vs constraint | 1 vs 6, 11 | Medium | Resolved |
| C-09 | Extension scans every post vs. Chrome "least permission" and consent | Requirement vs constraint | 7 vs 11, 6 | Medium | Resolved |
| C-10 | Legal pop-ups on every upload vs. deadline users who need speed | Stakeholder vs stakeholder | 6 vs 2, 3 | Low | Resolved |
| C-11 | Showing GPS/camera metadata vs. privacy | Requirement vs requirement | 3 vs 10, 4 | Medium | Resolved |
| C-12 | Video limit 100 MB in stories vs. 50 MB free-tier cap | Requirement vs constraint | 1 vs cloud limit | Medium | Resolved |
| C-13 | Accuracy target (AUC > 0.82 on compressed media) vs. honest-claims rule | Requirement vs constraint | 9 vs 11 | Low | Resolved |
| C-14 | Enterprise-level infra stories vs. academic budget and 8-week timeline | Requirement vs constraint | 8, 9, 11 vs project scope | High | Resolved |
| C-15 | Sprint order: some sprints need features built later | Sprint / dependency | Across sprints | High | Resolved |
| C-16 | Sprint point totals in the file don't match the stories | Story vs story | Sprint plan | Medium | Resolved |

---

## 5. Detailed Conflicts and Resolutions

### C-01 - Delete media immediately vs. learn from feedback / keep evidence
- **Where:** US-NFR-08 (delete right after analysis) and US-NFR-09 (never reuse media for training) in Epic 10 vs. US-FR-21 (feedback for retraining) in Epic 5 and US-FR-17 (PDF with heatmap crops) in Epic 3.
- **Who:** Priya (everyday user) and Advocate Mehta (legal) vs. Dr. Chen (ML) and Alex (moderator).
- **The clash:**
  - Privacy stories say the file must be gone as soon as the result is ready.
  - Feedback and retraining stories need examples of mistakes. The PDF report needs image crops. Both seem to need the file to stick around.
- **Options:**
  - A. Keep flagged files for retraining. *(Breaks the privacy promise and the law.)*
  - B. Delete everything and drop feedback. *(Loses a useful feature.)*
  - C. Delete the file, but keep only small non-personal data: task ID, model version, thumbs up/down, optional comment.
- **Decision:** Option C.
  - Feedback records never contain the file or any image/audio.
  - Retraining on user media is **not** allowed in this project. If we ever want it, it needs a separate opt-in checkbox (and that's out of scope now).
  - The PDF report is built **before** the file is deleted. The heatmap crops live only inside the PDF the user downloads.
- **Rule used:** R1, R2.
- **Stories changed:** US-FR-21 (store no media, only task ID, model version, rating, comment), US-FR-17 (build the PDF first, then delete the file).
- **Status:** Resolved.

### C-02 - Share links that last days vs. 24-hour deletion and "private only"
- **Where:** US-FR-18 (links with 2h / 24h / 7-day expiry) in Epic 4 vs. US-NFR-08 (24h hard delete), US-NFR-11 (results are private) in Epic 10 and US-FR-33 (erase on request) in Epic 6.
- **Who:** Sarah (journalist wants to send reports to editors) vs. Advocate Mehta and Priya (privacy).
- **The clash:**
  - A 7-day link means something has to be stored for 7 days.
  - But the rule says nothing is kept past 24 hours, and results must stay private.
  - If a user asks for erasure, the share link must die too.
- **Options:**
  - A. Keep the original file for the link's lifetime. *(Breaks privacy.)*
  - B. Remove sharing. *(Journalists lose a key feature.)*
  - C. Share only the **report** (score, explanation, heatmap image), never the original media.
- **Decision:** Option C.
  - The link opens a read-only report page. The original file is never available through it.
  - Link has a random token, optional password, and expiry (2h / 24h / 7 days).
  - The creator can revoke the link any time.
  - When the link expires, the report data is deleted too.
  - An erasure request (US-FR-33) deletes all share links for that task.
  - Pages carry `noindex` so search engines skip them.
- **Rule used:** R1, R6.
- **Stories changed:** US-FR-18 (report-only, revoke button, deleted at expiry), US-FR-33 (also kills share links).
- **Status:** Resolved.

### C-03 - Moderation queue vs. "private utility"
- **Where:** US-FR-20 and US-FR-22 (queue, dispute list) in Epic 5 vs. US-NFR-11 (no public gallery, no shared repository) in Epic 10.
- **Who:** Alex (moderator) vs. Advocate Mehta (legal).
- **The clash:**
  - A queue means a shared list of items that more than one person can see.
  - The privacy story says there must be no shared repository of uploaded content, so we don't count as a social media platform under IT Rules 2021.
- **Options:**
  - A. Build a real shared content queue. *(Makes us look like a content platform.)*
  - B. Drop the console. *(Loses the moderator persona.)*
  - C. Queue holds **only job info** (job ID, score, status, reviewer notes), never the media. Only logged-in moderators can open it. Items expire automatically.
- **Decision:** Option C.
  - We don't own a real social platform, so the action buttons (Label, Demote, Takedown, Escalate) are **simulated** in the prototype. They write a log entry and show a confirmation. No real platform is touched.
  - Access needs a moderator login. No public pages.
  - Queue entries are deleted after 24 hours with everything else.
- **Rule used:** R1, R4.
- **Stories changed:** US-FR-20 (actions simulated and logged), US-FR-22 (queue stores job info only, 24h expiry).
- **Status:** Resolved.

### C-04 - Fast takedown vs. "never a bare Real/Fake" and human oversight
- **Where:** US-FR-20 (Takedown, Demote buttons) in Epic 5 vs. US-FR-13 (never a bare label), US-FR-25 (disclaimer) in Epics 3 and 6.
- **Who:** Alex (wants quick decisions) vs. Advocate Mehta and Sarah (want no false certainty).
- **The clash:**
  - Moderators work under a 30–60 second target and like clear answers.
  - Legal and journalists say the tool must only give likelihoods, never a final verdict, and a person must stay in charge.
- **Decision (middle path):**
  - The tool **never** acts by itself. Every action needs a human click.
  - Result always shows score + plain-language reason + the disclaimer.
  - Score is shown with a colour band (green / amber / red) so moderators can read it in seconds.
  - If the result is Inconclusive, the **Takedown** button is disabled; the moderator must use Escalate, or override with a reason (see C-05).
- **Rule used:** R1, R5, R6.
- **Stories changed:** US-FR-20 (disable Takedown on Inconclusive, human click only), US-FR-13 (colour band added).
- **Status:** Resolved.

### C-05 - Two different "uncertain" ranges
- **Where:** US-FR-16 says Inconclusive is **40–60%**. US-FR-22 says "needs senior review" is **45–65%**. US-FR-31 lets an admin change thresholds.
- **Who:** Sarah and Priya (honest uncertainty) vs. Alex (review workflow).
- **The clash:** Same idea, two sets of numbers. A score of 42% would be "Inconclusive" in one story but "normal" in the other. It's a bug waiting to happen.
- **Decision:**
  - There is **one** uncertain band, stored in one config value, default **40–60%**.
  - Inside the band: result says "Inconclusive", and for moderators it also goes to the dispute/senior review list. It's the same event with two views.
  - Admin screen (US-FR-31) changes this one value later.
- **Rule used:** R4.
- **Stories changed:** US-FR-22 (use the same band as US-FR-16), US-FR-31 (edits the same band).
- **Status:** Resolved.

### C-06 - Fast results vs. detailed explanation and accuracy
- **Where:** US-NFR-01 (image < 15s, video triage < 60s) in Epic 8 vs. US-FR-12 (deep scan 2–5 min) in Epic 2 and US-FR-14 (heatmaps) in Epic 3.
- **Who:** Sarah and Alex (speed) vs. Dr. Chen (accuracy, explanation).
- **The clash:** Heatmaps and full-frame analysis take time. Deadlines don't allow it.
- **Decision:**
  - Two modes stay: **Rapid Triage** (few frames, quick) and **Deep Scan** (all sampled frames).
  - Score appears first. The heatmap and detailed explanation load **after** the score, so the user isn't kept waiting.
  - Triage result is clearly labelled "Quick check - not final".
  - We accept slower times on a normal laptop/CPU; timing targets are goals, measured and reported honestly.
- **Rule used:** R6, R4.
- **Stories changed:** US-FR-14 (heatmap loads after the score), US-NFR-01 (targets marked as goals).
- **Status:** Resolved.

### C-07 - Reverse-image search vs. "never share media with third parties"
- **Where:** US-FR-23 (send keyframes to Google Vision / TinEye) in Epic 5 vs. US-NFR-09 (no third-party sharing without opt-in) in Epic 10.
- **Who:** Sarah and Alex vs. Priya and Advocate Mehta.
- **The clash:** To search for the original source, an image has to leave our system and go to another company.
- **Options:**
  - A. Auto-send every keyframe. *(Breaks the privacy promise.)*
  - B. Remove the feature. *(Loses "cheapfake" detection help.)*
  - C. Make it a **manual, opt-in** step.
- **Decision:** Option C.
  - Nothing is sent automatically.
  - A "Check Historical Provenance" button shows a warning: "This opens an outside service. Your image will leave this app."
  - Simple version: the button opens Google Lens / TinEye in a new tab and the user uploads the frame themselves. No paid API needed.
- **Rule used:** R2, R4, R5.
- **Stories changed:** US-FR-23 (opt-in, manual links instead of API calls).
- **Status:** Resolved.

### C-08 - WhatsApp bot vs. consent, privacy and sandbox limits
- **Where:** US-FR-06 and US-NFR-16 (Epic 1, 11) vs. US-FR-24 and US-FR-34 (consent and attestation, Epic 6).
- **Who:** Priya (easy WhatsApp check) vs. Advocate Mehta (consent must come first).
- **The clash:**
  - The web consent pop-up can't be shown inside WhatsApp.
  - The bot only works inside Meta's sandbox (test numbers only), so it can't serve "everyone" anyway.
  - Rate limiting (5 per hour) needs us to remember who sent what.
- **Decision:**
  - First message from a new number gets a short consent text. Analysis starts only after the user replies **AGREE**. It includes the "I have the right to share this, no intimate or illegal content" line.
  - For rate limits we keep only a hashed phone number for one hour, then delete it.
  - Media is downloaded straight away (the link expires in ~5 min) and deleted after analysis, same as web uploads.
  - Bot is clearly labelled as a **sandbox demo** with registered test numbers.
- **Rule used:** R1, R2.
- **Stories changed:** US-FR-06 (consent reply first), US-NFR-16 (hashed number kept for 1 hour only).
- **Status:** Resolved.

### C-09 - Extension scans every post vs. Chrome rules and consent
- **Where:** US-FR-28 (find every image/video/audio on social feeds, show a badge) in Epic 7 vs. US-NFR-14 (Manifest V3, minimum permissions) in Epic 11 and consent stories in Epic 6.
- **Who:** Priya and Sarah (convenience) vs. Chrome Web Store reviewer and Advocate Mehta.
- **The clash:**
  - Watching every page needs wide permissions, which Chrome reviews strictly.
  - Reading page content and sending media to our server needs consent.
- **Decision:**
  - The extension does **nothing** until the user acts: right-click on media → "Verify with Moody Lens", or click the extension icon on the current tab.
  - Uses `activeTab` and context menu only, no "all websites" permission.
  - First use shows a one-time consent box that says media is sent to our server for analysis only.
  - The "badge on hover" idea is dropped for the prototype.
- **Rule used:** R1, R3, R4.
- **Stories changed:** US-FR-28 (right-click/click only, no auto-scan), US-NFR-14 (activeTab only).
- **Status:** Resolved.

### C-10 - Legal pop-ups on every upload vs. deadline users
- **Where:** US-FR-24 and US-FR-34 (consent + attestation) in Epic 6 vs. US-FR-12 (triage speed) in Epic 2.
- **Who:** Advocate Mehta vs. Sarah and Alex.
- **The clash:** A long pop-up every time wastes seconds when someone checks ten files in a row.
- **Decision:**
  - The full consent box (English/Hindi) appears **once per browser session**.
  - The short attestation checkbox ("I have the right to analyze this, and it isn't intimate or illegal content") stays on **every** upload. It's one click.
  - Both stay mandatory. Nothing is removed, only repeated less.
- **Rule used:** R1, R6.
- **Stories changed:** US-FR-24 (once per session), US-FR-34 (one-click, every upload).
- **Status:** Resolved.

### C-11 - Showing metadata (GPS, camera) vs. privacy
- **Where:** US-FR-30 (show EXIF/metadata) in Epic 3 vs. US-NFR-10 (minimal personal data) in Epic 10 and US-FR-18 (share links) in Epic 4.
- **Who:** Sarah (needs metadata clues) vs. Priya and Advocate Mehta.
- **The clash:** Metadata can include exact location and device details. Showing or sharing it could expose someone.
- **Decision:**
  - Metadata is shown **only** to the person who uploaded the file, in their own session.
  - GPS location is shown as a warning flag ("location data found") and is **left out** of PDF reports and share links by default. The user can tick a box to include it.
  - Metadata is deleted along with the file.
- **Rule used:** R2, R5.
- **Stories changed:** US-FR-30 (GPS hidden from outputs by default), US-FR-17 and US-FR-18 (follow the same rule).
- **Status:** Resolved.

### C-12 - File size limits don't match
- **Where:** US-FR-02 says images ≤ 10 MB and video ≤ 100 MB; US-FR-05 uses a 70 MB video example. But the cloud analysis (Task 3 report) caps uploads at **50 MB** to stay inside the free tier.
- **Who:** Priya and Sarah (bigger files) vs. the team's budget.
- **Decision:**
  - Limits for the prototype: **image ≤ 10 MB, video ≤ 50 MB, audio ≤ 20 MB**.
  - Error text tells the user the exact limit and suggests trimming or compressing.
  - If a paid plan is ever used, the limit can be raised in one config value.
- **Rule used:** R4.
- **Stories changed:** US-FR-02 (new limits and message), US-FR-05 (example changed to a 40 MB video).
- **Status:** Resolved.

### C-13 - Accuracy target vs. honest claims
- **Where:** US-NFR-04 wants AUC above 0.82 on heavily compressed media (Epic 9). US-NFR-12 bans over-claiming (Epic 11). Our own research notes say accuracy on heavily compressed video can fall to about 81%.
- **Who:** Dr. Chen vs. Advocate Mehta / UX.
- **The clash:** If we can't reach 0.82 and we promise it, we'd be making a false claim.
- **Decision:**
  - 0.82 stays as a **goal**, not a promise.
  - The app only shows numbers we **measured ourselves** on our test set, with the test method linked.
  - If the goal isn't reached, the UI says so in the limitations section and the "Inconclusive" fallback does more of the work.
- **Rule used:** R1, R4.
- **Stories changed:** US-NFR-04 (goal wording), US-NFR-12 (show measured value only).
- **Status:** Resolved.

### C-14 - Enterprise-level stories vs. academic budget and 8 weeks
- **Where:** US-NFR-02 (GPU/optimised models), US-NFR-03 (automatic scaling), US-NFR-05 (zero-downtime model swap), US-NFR-06 (fairness audit across skin-tone groups), US-NFR-15 (monitoring and alerts).
- **Who:** Marcus and Dr. Chen (ideal setup) vs. the team's time, free-tier budget and the instructor's "academic prototype" scope.
- **The clash:** These stories describe a company-sized system. We have 11 students, 4 sprints and free cloud credits.
- **Decision:** Keep the **goal** of each story, build a smaller version.

| Story | Original idea | Simple version we'll build |
|---|---|---|
| US-NFR-02 | GPU + optimised CPU fallback | Run a small model on CPU; use GPU only if the machine has one |
| US-NFR-03 | Auto-scale workers | Fixed number of workers, queue limit, polite "busy, try again" message |
| US-NFR-05 | Zero-downtime model swap | Replace the model file and restart the worker at a quiet time |
| US-NFR-06 | Full fairness audit | Basic check of results across the groups our datasets label, reported as plain numbers |
| US-NFR-15 | Full monitoring + alerts | Health-check page, log file, and an error counter |

- **Rule used:** R3, R4.
- **Stories changed:** the five above (scope reduced, goals unchanged). They stay as P1 so they can be dropped first if a sprint runs late.
- **Status:** Resolved.

### C-15 - Sprint order problems (dependencies)
- **Where:** Sprint plan in Section 5 of `User-Stories.md`.
- **Problems found:**

| # | Problem | Why it's a conflict |
|---|---|---|
| D1 | US-FR-05 (S1) starts inference after upload, but the task queue (US-FR-10) is in S2 | Nothing to trigger in S1 |
| D2 | Consent/attestation and disclaimer (US-FR-25, US-FR-34) are in S3, but uploads work from S1 | Real uploads would run with no legal gate |
| D3 | US-FR-22 (S3) needs thresholds, but the admin screen (US-FR-31) is in S4 | Feature depends on a later one |
| D4 | US-FR-15 (manipulation type) is in S2, which is the heaviest sprint, and needs trained subtype outputs | Too much at once |

- **Decision:**
  - D1: In S1 the upload calls the model directly (a simple function call). The queue replaces it in S2.
  - D2: Move **US-FR-25** and **US-FR-34** to S1. The bilingual part of US-FR-24 stays in S3, S1 uses simple English text.
  - D3: In S3 the thresholds come from a config file. The admin screen (S4) just edits that same file.
  - D4: Move **US-FR-15** from S2 to S3.
- **Rule used:** R3.
- **Status:** Resolved. See revised sprint plan in Section 6.

### C-16 - Sprint point totals don't match the stories
- **Where:** "Sprint Commitment" lines in `User-Stories.md`.
- **What we found:** Adding up the story points of the stories listed in each sprint gives different totals from the file.

| Sprint | Total in file | Real total (sum of stories) |
|---|---|---|
| S1 | 42 | 47 |
| S2 | 52 | 57 |
| S3 | 46 | 48 |
| S4 | 44 | 47 |
| **All** | **184** | **199** |

- **Decision:** Use the real totals and rebalance (Section 6). Target is about 50 points per sprint.
- **Rule used:** R4.
- **Status:** Resolved.

---

## 6. Revised Sprint Plan (After Conflict Fixes)

| Sprint | Focus | Stories | Points |
|---|---|---|---|
| **S1** | Upload, security, first models, basic legal gate | US-FR-01, 02, 03, 04, 05, 07, 08, 09, **25, 34**; US-NFR-07, 08, 09, 10, 11 | **51** |
| **S2** | Queue, progress, explanation, heatmaps | US-FR-10, 11, 12, 13, 14, 16, 29; US-NFR-01, 02, 04 | **52** |
| **S3** | Reports, sharing, moderation, full consent | US-FR-**15**, 17, 18, 20, 21, 22, 23, 24 (incl. 32), 26, 27, 30, 33; US-NFR-12, 13 | **49** |
| **S4** | Extension, WhatsApp, admin, extras | US-FR-06, 19, 28, 31; US-NFR-03, 05, 06, 14, 15, 16 | **47** |
| | | **Total** | **199** |

*Bold = moved or added compared to the original plan.*

---

## 7. Change Log - Stories Updated Because of Conflicts

| Story | What changed | Conflict |
|---|---|---|
| US-FR-02 | Limits: image 10 MB, video 50 MB, audio 20 MB | C-12 |
| US-FR-05 | Example file changed to 40 MB; direct model call in S1 | C-12, C-15 |
| US-FR-06 | Consent reply ("AGREE") before analysis | C-08 |
| US-FR-13 | Colour band (green/amber/red) added | C-04 |
| US-FR-14 | Heatmap loads after the score | C-06 |
| US-FR-15 | Moved from S2 to S3 | C-15 |
| US-FR-17 | Build PDF before deleting file; GPS left out by default | C-01, C-11 |
| US-FR-18 | Share report only, revoke button, deleted at expiry | C-02, C-11 |
| US-FR-20 | Actions simulated and logged; Takedown disabled on Inconclusive | C-03, C-04 |
| US-FR-21 | Store no media, only task ID, model version, rating, comment | C-01 |
| US-FR-22 | One shared uncertain band; job info only; 24h expiry; thresholds from config | C-03, C-05, C-15 |
| US-FR-23 | Manual, opt-in lookup links, no API calls | C-07 |
| US-FR-24 | Full consent once per session | C-10 |
| US-FR-25 | Moved from S3 to S1 | C-15 |
| US-FR-28 | Right-click/icon click only, no auto-scan | C-09 |
| US-FR-30 | GPS hidden from outputs by default | C-11 |
| US-FR-31 | Edits the same uncertain-band value | C-05 |
| US-FR-33 | Erasure also removes share links | C-02 |
| US-FR-34 | Moved from S3 to S1; one-click every upload | C-10, C-15 |
| US-NFR-01 | Timing targets are goals | C-06 |
| US-NFR-02, 03, 05, 06, 15 | Scope reduced to simple versions | C-14 |
| US-NFR-04 | 0.82 AUC is a goal | C-13 |
| US-NFR-12 | Show only measured numbers | C-13 |
| US-NFR-14 | `activeTab` only | C-09 |
| US-NFR-16 | Hashed number kept for 1 hour | C-08 |

---

## 8. Things We Checked That Did **Not** Conflict

- **Security checks (US-FR-03, 04) vs. upload speed** - the checks are fast and run on the server after upload, so they don't slow the user.
- **Direct-to-cloud upload (US-FR-05) vs. server-side checks** - the server checks the file once it lands; both can happen.
- **Watermark on PDF (US-FR-17) vs. journalists' needs** - the watermark only says "not legal proof", which journalists accept.
- **Disclaimer (US-FR-25) vs. moderator speed** - it's a small fixed badge, not a pop-up.
- **Explanations (US-FR-13) vs. simple language** - both want the same thing: plain words.

---

## 9. Open Points for the Team

- Confirm the final file limits (10 / 50 / 20 MB) with the person doing the cloud setup.
- Confirm that the moderation actions stay **simulated** (C-03). If the instructor wants a real integration, we'd need to revisit.
- Decide who owns the single "uncertain band" config value (C-05).
- Agree on a short sentence for the sandbox label on the WhatsApp bot (C-08).

---

*End of Task 6 document.*