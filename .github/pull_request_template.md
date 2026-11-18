## Description of Changes
<!-- Provide a concise summary of the changes introduced by this PR. -->

## Component Affected
- [ ] Backend API (`functional-ui-models-backend/backend`)
- [ ] Frontend UI (`functional-ui-models-backend/frontend`)
- [ ] Chrome Browser Extension (`Browser_Extension`)
- [ ] Reddit Extension (`reddit_extension`)
- [ ] Telegram Bot (`telegram-bot`)
- [ ] Deployment / CI/CD configuration

## Pre-Merge Quality Checklist
- [ ] **No Breaking Schema Changes**: Tested contract parity with `python -m scripts.check_parity ../frontend`.
- [ ] **Stub Compatibility**: Verified backend still operates with `MML_DETECTOR_BACKEND=stub` on Render free tier.
- [ ] **Tests Pass**: Automated CI pipeline runs green across all jobs.
- [ ] **No Secret Leaks**: Verified no database passwords, Redis URIs, or bot tokens are checked in.
