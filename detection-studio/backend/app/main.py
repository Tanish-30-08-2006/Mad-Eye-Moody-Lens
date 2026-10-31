from contextlib import asynccontextmanager
import logging
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from app.config import CORS_ORIGINS, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, MODELS_DIR
from app.images import decode_image
from app.manager import InferenceManager
from app.plugins import ModelNotFound, ModelPlugin, ModelUnavailable, PluginRegistry

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s")
registry = PluginRegistry(MODELS_DIR)
manager = InferenceManager(registry)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    manager.unload()


app = FastAPI(title="Deepfake Detection Studio", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "deepfake-detection-studio"}


@app.get("/api/models")
def list_models() -> list[dict[str, Any]]:
    return [plugin.public() for plugin in registry.list()]


@app.post("/api/detect")
async def detect(model_id: str = Form(...), image: UploadFile = File(...)) -> dict[str, Any]:
    content = await image.read(MAX_UPLOAD_BYTES + 1)
    if not content:
        raise HTTPException(400, "The uploaded file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Image exceeds the {MAX_UPLOAD_MB} MB upload limit.")
    try:
        decoded = decode_image(content)
        return await run_in_threadpool(manager.predict, model_id, decoded)
    except ModelNotFound as exc:
        raise HTTPException(404, str(exc)) from exc
    except ModelUnavailable as exc:
        raise HTTPException(409, str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(424, str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logging.getLogger(__name__).exception("Detection failed for model %s", model_id)
        raise HTTPException(500, "Model inference failed. Check the backend terminal for details.") from exc
    finally:
        await image.close()
