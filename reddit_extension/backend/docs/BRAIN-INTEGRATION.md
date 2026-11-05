# Brain integration checklist

The detection model is reached through ONE seam: `moody_lens_ext/brain/`. Every endpoint in
`media.py` calls `get_brain()`; the places that hand work to the model are marked `# BRAIN-LINK:`
with the method name. Swapping the real model in touches only that directory.

```
moody_lens_ext/brain/
  interface.py       DetectionBrain protocol, BrainResult, BrainInfo, errors
  stub_brain.py      deterministic demo brain (always is_mock=True)
  host_brain.py      the existing host pipeline (RUNNERS / Celery), unchanged behaviour
  registry.py        get_brain(): MML_BRAIN = host | stub | auto
  contract_tests.py  reusable pytest suite every brain must pass
```

## Endpoint checklist

"Status" is what answers today: `stub` (demo brain), `host` (existing pipeline, used when the host
backend and its workers are present), `501` (not provided yet). Tick the last column once the real
model answers that row.

| Endpoint | Brain method | Input | Expected output | Status | Linked to real model |
|---|---|---|---|---|---|
| `POST /api/v1/detect` (image) | `analyze_image(path)` | multipart `media` (png/jpeg/webp/gif) | 202 `{job_id}`; job has `overall_score`, `label`, `models`, `signals` | stub / host | [ ] |
| `POST /api/v1/detect` (video + audio) | `analyze_video(path, audio_path)` | multipart `media` (mp4) + optional `audio`; API muxes them into `path` | job has `models.image`, `models.audio` (null if not run), `timeline[]`, `signals` | stub / host | [ ] |
| `POST /api/v1/detect/batch` | `analyze_image(path)` per image | up to 10 × `media` | one job, `items[]` per image, headline = most suspicious | stub / host | [ ] |
| `POST /api/v1/detect-url` | `analyze_video(path)` | `{url, media_type: "video"}`, reddit.com permalink, flag `FEATURE_DETECT_URL` | same as video detect | 501 unless flag, then stub / host | [ ] |
| `GET /api/v1/jobs/{id}/explain` | `explain(path)` | job id | `{summary, regions[]}` | 501 (stub and host have `capabilities.explain = false`) | [ ] |
| `GET /api/v1/brain/status` | `describe()`, `healthy()` | none | `{name, version, capabilities, is_mock, healthy}` | stub / host | [ ] |
| `GET /api/v1/health` | `describe()` (the `mock` flag) | none | `{status, version, models_available, mock}` | stub / host | [ ] |

No brain needed (already work on any brain):

| Endpoint | What it does | Status |
|---|---|---|
| `GET /api/v1/jobs/{id}` | returns the stored job | done |
| `POST /api/v1/feedback` | stores `{cache_key, verdict_label, user_label, note?}` in sqlite; no media, no user identifiers | done |
| `GET /api/v1/verdicts/lookup?sha256=` | previous verdict for identical bytes (optional `phash`) | done |

Today's summary: **every detection row runs on the stub (or the host pipeline when it is present);
`explain` is 501.**

## How to plug in the real model

1. Add `moody_lens_ext/brain/<your>_brain.py` with a class implementing `DetectionBrain`
   (`analyze_image`, `analyze_video`, `analyze_audio`, `explain`, `describe`, `healthy`).
   - Return `None` for any model entry that did not run. Never invent a score.
   - `describe().is_mock` must be `True` for anything that is not the real model; a mock brain's
     results must carry `mock=True`.
   - Raise `BrainUnsupported` for capabilities you do not offer, `BrainError(message)` for bad input.
   - Set `capabilities.explain = True` only if `explain(path)` works; the API then keeps a copy of
     each scanned file for 10 minutes (max 20) so `/jobs/{id}/explain` can run.
2. Register it in `brain/registry.py` (one more branch for `MML_BRAIN=<name>`).
3. Add a subclass to `tests/test_brain_contract.py`:
   ```python
   class TestMyBrainContract(BrainContractSuite):
       @pytest.fixture
       def brain(self):
           return MyBrain()
   ```
   and run `pytest tests/test_brain_contract.py`.
4. Start the API with `MML_BRAIN=<name>`; check `GET /api/v1/brain/status` shows `is_mock: false`.
   The extension popup then shows `Brain: <name> (REAL)`.
5. Tick the "Linked to real model" boxes above.

## Cache and namespacing

Completed verdicts are cached in `backend/data/extension.sqlite3` (override with
`MML_EXT_DATA_DIR`), keyed by the sha256 of the uploaded media plus the brain's
`name@version|mock/real`. A demo verdict is therefore never served once a real brain is linked
(and the reverse). Delete the file to reset it.
