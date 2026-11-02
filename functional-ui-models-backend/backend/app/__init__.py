"""Mad-Eye Moody Lens backend.

Package layout (see docs/backend-design.md, Section 2):

    app.core          settings, errors, logging, metrics, storage, upload validation, rate limits
    app.db            SQLAlchemy models and session handling (PostgreSQL in production)
    app.detectors     pretrained-model wrappers behind one Detector interface (workers only)
    app.preprocessing face cropping and ffmpeg/ffprobe helpers
    app.services      verdicts, pipelines, jobs, results, heartbeats
    app.worker        Celery application and tasks (the only place PyTorch is imported)
    app.api           FastAPI routes (never imports PyTorch)
"""

__version__ = "1.1.0"
