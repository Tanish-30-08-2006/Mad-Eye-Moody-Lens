# Stakeholder List — Deepfake AI Detector

## 1. End Users

- **General Public User**
  - wants to check if an image/video/audio is fake before believing or forwarding it
  - influence: low (individually), but large in numbers
- **Journalist / Fact-Checker**
  - power user, needs quick + reliable results before publishing a story
  - influence: high (their trust in the tool shapes credibility of the app)
- **Social Media Moderator**
  - uses the tool to screen flagged/reported content on a platform
  - influence: medium

## 2. Admins / Internal Team

- **Platform Admin**
  - manages users, flagged content, model versions, abuse reports
  - influence: high
- **ML / Data Engineer (our team)**
  - trains and maintains the CNN + spectrogram models, decides accuracy thresholds
  - influence: high
- **Frontend/Backend Dev (our team)**
  - builds upload flow, dashboard, extension
  - influence: high

## 3. Third Parties

- **Dataset Provider / Research Community**
  - e.g. FaceForensics++, ASVspoof — source of training data, licensing terms apply
  - influence: medium
- **Browser Extension Store Reviewer**
  - approves/rejects the Chrome extension based on store policy
  - influence: medium (gatekeeper for one feature)
- **WhatsApp / Social Media Platform**
  - content shared through these platforms is what gets checked; no direct API access in most cases
  - influence: medium (limits how "share-link" feature can work)
- **Cloud / Hosting Provider**
  - infra dependency for storage + model inference
  - influence: low-medium

## 4. Indirect / Affected Stakeholders

- **Subject of the Media**
  - the person whose face/voice appears in checked content — privacy concern, can't be consulted directly
  - influence: low, but ethically important
- **Legal / Compliance Body**
  - data privacy laws (India IT Act, GDPR if used outside India), misinformation regulation
  - influence: high (can block certain features)

## 5. Academic Stakeholder

- **Course Instructor / Evaluator (IT314)**
  - grades the project, has given the base instructions we're following
  - influence: high (defines what "done" means for this project)

---

**Note for P2:** use this list as the input for the elicitation-techniques doc — every stakeholder here should map to at least one technique.
