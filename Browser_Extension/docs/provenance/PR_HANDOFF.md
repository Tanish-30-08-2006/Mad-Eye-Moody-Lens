# PR handoff (user performs these steps)

## Open one PR

After the manual checks in TESTING.md pass, open the repository on GitHub, choose
New pull request, set base **main** and compare **feature/image-provenance-check**.
Use title **feat(extension): add local Image Provenance Check**. Keep it draft
while any manual acceptance or CI gate is incomplete. The agent did not open a PR.

The repository template is .github/pull_request_template.md. Start with this
filled-in body, preserving unchecked items until you have their evidence:

```markdown
## Description of Changes
Adds a local Image Provenance Check below the extension detector. It preserves
file bytes, uses pinned packaged C2PA WASM and offline official trust anchors,
distinguishes valid/unknown/invalid/missing credentials, and shows active-manifest
origin/edit declarations and explicitly unsigned generator hints.

Detector scores and providers are unchanged. No backend call, new permission,
provenance persistence, remote manifest fetch, or runtime trust-list download.
Existing-file changes are three additive sidepanel.html lines and the minimum
three-line wasm-unsafe-eval manifest CSP. SDK worker URL patch and pristine copy,
licences, hashes, fixtures, and security/testing docs are included.

## Component Affected
- [ ] Backend API (functional-ui-models-backend/backend)
- [ ] Frontend UI (functional-ui-models-backend/frontend)
- [x] Chrome Browser Extension (Browser_Extension)
- [ ] Reddit Extension (reddit_extension)
- [ ] Telegram Bot (telegram-bot)
- [ ] Deployment / CI/CD configuration

## Pre-Merge Quality Checklist
- [x] No Breaking Schema Changes: parity script passed; backend schemas unchanged.
- [ ] Stub Compatibility: confirm the required deployed/stub behavior; local full pytest was interrupted without a result.
- [ ] Tests Pass: wait for all PR CI jobs to pass.
- [x] No Secret Leaks: reviewed feature changes; only public trust/test certificates included; no private keys.

## Additional verification
- Extension backend: 80 tests, 75 pass, 5 MML_E2E_URL skips, 0 fail.
- Provenance subset: 49 pass, including real vendored WASM and eight CLI cross-check cases.
- Existing CJS provider suite: 13 pass.
- Contract parity passed. Ruff/Mypy unavailable locally; website build blocked by missing vite/client types.
- Chrome manual checklist: PENDING — replace with browser version and actual outcomes.
- CI currently runs only background.test.mjs in both extension directories;
  the provenance and CJS suites were run locally. No CI change is included.

## Linked issues
Add five separate Closes #N lines only after each acceptance checklist passes.
```

Supply these five issue numbers (do not copy placeholders literally):

| Placeholder | Issue / who raises it |
| --- | --- |
| N1 | Verify credential signatures and integrity — team leader |
| N2 | Extract image origin and editing declarations — teammate |
| N3 | Verify the bytes we read are the original file — user |
| N4 | No test fixtures — user |
| N5 | Invalid or untrusted signatures need their own state — user |

Once ready, append actual lines such as Closes #123, one for each actual number.
GitHub does not verify acceptance criteria: use Related #N while checks remain
incomplete. Confirm all five issue checklists before enabling automatic closure.

## CI and review

The main CI workflow runs for a PR targeting main; its branch-push trigger is
limited to main and tanish-dev. It runs backend pytest, Ruff, Mypy, contract
parity, website TypeScript/Vite build, the two selected extension background
files, Telegram unit tests and Docker build. It does not run provenance tests,
the extension CJS provider suite, a live MML_E2E_URL flow, or manual Chrome checks.

Optional separate team-approved one-line CI follow-up: replace the uppercase
background-test command with `npm --prefix Browser_Extension/backend test`.
No .github changes belong to this PR.

Use the GitHub Reviewers picker to request the team leader's review for trust,
signature and privacy behavior and the teammate's review for declarations, panel
integration and conflicts. Attach Node results, the Chrome checklist and relevant
issue acceptance evidence. Do not mark CI/deployed checks complete merely because
the extension unit tests passed.

## If the teammate lands first

Merge main into this already shared feature branch, preserving its commit IDs:

```powershell
git checkout feature/image-provenance-check
git fetch origin
git merge origin/main
```

Most likely conflicts are frontend/sidepanel.html and manifest.json. Keep the
teammate's changes and retain the provenance container, stylesheet and module tag.
Keep their classic sidepanel.js loading and add the required WASM allowance to
the final extension-page CSP without broadening remote-code permissions. Do not
resolve conflicts by replacing whole files. New provenance modules should be
isolated; do not overwrite the teammate's sidepanel.js/provider/audio work.

After resolving, git add the specific files, git commit the merge, rerun both
extension suites and the manual checklist, then push the feature branch normally.
Avoid rebasing the already pushed branch: it rewrites IDs and would require a
force-push, which is prohibited here. If conflicts are uncertain, abort the merge
and coordinate with the teammate instead of discarding either feature.

## Merge and confirm issue closure

Choose GitHub **Create a merge commit**. Do not squash; this preserves the feature
commits and their original IDs for the viva. GitHub rebase-and-merge
preserves separate commits but changes their IDs, so a merge commit is preferable.

Only merge after acceptance evidence, manual Chrome checks, reviews and CI pass.
After merging into main, confirm all five linked issues show Closed with this
PR as the closing reference, and check main's commit graph includes each feature
commit. The issue-by-issue viva summary is in ISSUES_MAP.md.

Manual-test follow-up: an eighth fix commit preserves the original seven commits
and corrects null-reader handling for unsigned JPEGs, adds safe failure diagnostics,
and avoids presenting uninspected fields as absent. User reported the signed
fixture succeeds in Chrome; the unsigned-JPEG fix still needs the listed manual
retest. Use a merge commit to preserve this follow-up in the viva history too.
