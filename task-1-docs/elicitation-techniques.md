# Elicitation Techniques — Deepfake AI Detector

For each stakeholder: technique picked, why it fits, and 1-2 sample questions to get started (P2 can expand these into the full survey/interview script).

## General Public User → Survey
- why: large group, need quick spread-out data, don't need deep 1-on-1 detail
- sample Qs:
  - "How often do you see suspicious images/videos on WhatsApp or social media?"
  - "Would you trust an app that gives a % confidence score on whether content is fake?"

## Journalist / Fact-Checker → Interview
- why: small group, but their workflow is detailed — needs a real conversation, not a form
- sample Qs:
  - "Walk me through how you currently verify a video before publishing."
  - "What would make you trust an automated tool's result?"

## Social Media Moderator → Interview / Observation
- why: need to see their actual flagging workflow, forms won't capture that
- sample Qs:
  - "What tools do you use today to catch manipulated media?"
  - "How fast do you need a result to make it useful in your workflow?"

## Platform Admin (internal) → Brainstorming
- why: this role doesn't exist yet — team has to design it, not survey it
- starting points:
  - what should the admin dashboard show (flagged content, model version, abuse reports)?
  - what actions can an admin take (ban user, retrain model, override a result)?

## ML / Data Engineer (internal) → Document Analysis
- why: technical decisions come from research, not opinions
- what to review:
  - existing deepfake detection papers/benchmarks (CNN-based, spectrogram-based)
  - accuracy numbers from similar tools (Deepware, Sensity, Hive)

## Dataset Provider / Research Community → Document Analysis
- why: licensing and usage terms are fixed documents, not something to interview about
- what to review:
  - FaceForensics++, ASVspoof dataset docs — licensing, allowed use, format

## Browser Extension Store Reviewer → Document Analysis
- why: approval rules are published policy, not negotiable per-stakeholder
- what to review:
  - Chrome Web Store developer policy (permissions, privacy disclosure rules)

## WhatsApp / Social Media Platform → Document Analysis
- why: no direct access to this stakeholder, only their public API/sharing docs
- what to review:
  - what sharing/API limits affect the "share-link" feature (e.g. WhatsApp doesn't allow bots to pull chat content directly)

## Cloud / Hosting Provider → Document Analysis
- why: pricing and infra limits are documented, not opinion-based
- what to review:
  - hosting cost/limits for storing + processing media (AWS/GCP free tier limits)

## Legal / Compliance Body → Document Analysis
- why: laws are fixed text, need to read them not ask them
- what to review:
  - India IT Act rules on data storage, GDPR basics if relevant

## Subject of the Media → Brainstorming (can't be reached directly)
- why: this stakeholder can't be surveyed or interviewed in practice
- starting points:
  - team brainstorms privacy safeguards (e.g. auto-delete uploaded media after result is shown)

## Course Instructor / Evaluator → Document Analysis
- why: requirements are already given in the IT314 instructions doc
- what to review:
  - the official project instructions doc (already have it) — re-check before every deliverable

---

**Note for P2:** each "sample Qs" or "starting points" section is a seed — expand into the full survey form / interview script / brainstorm session notes as the next step.
