# Local architecture

```text
Browser (Next.js)
    │ HTTP / multipart upload
    ▼
FastAPI
    ├── PluginRegistry  ── scans models/*/model.yaml
    └── InferenceManager
          ├── dynamically imports selected adapter
          ├── loads one model only
          ├── serializes predict calls
          └── unloads on model/version/artifact change
```

There is no master catalogue and no model factory to edit. Every model owns its metadata, adapter and weights. The registry's only responsibility is discovery and readiness. The manager's only responsibility is lifecycle and inference. The API validates uploads and exposes a stable result schema.

The default manager keeps one model loaded. This is appropriate for a 16 GB RAM, CPU-only developer laptop and avoids loading several multi-GB checkpoints at once. The model registry is scanned on each catalogue request and inference request, so adding a folder or changing its manifest does not require a backend restart. The selected adapter is reloaded when its manifest, code or artifact fingerprint changes.

Use one Uvicorn worker; multiple workers would create independent model managers and duplicate model memory.

For future models with incompatible dependencies or colliding top-level import names, use an isolated process/venv per model. The plugin interface and HTTP result contract can remain unchanged.
