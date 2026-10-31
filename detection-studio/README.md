# Deepfake Detection Studio — Local Edition

A small, local-first image detection workspace. The frontend is Next.js; the API is FastAPI; research detectors are self-contained plugins discovered from folders under `models/`.

## Why this architecture is simpler

- **No master model catalogue:** each detector owns its `model.yaml`.
- **No central adapter factory:** the backend imports the adapter declared by that model's manifest.
- **File-manager workflow:** add a model folder to `models/`; disable it with `enabled: false`; remove it by moving the folder out of `models/`.
- **Lazy loading:** only the selected detector is loaded.
- **One-model memory policy:** switching models unloads the old adapter before loading the new one.
- **Automatic refresh:** the model directory is scanned for every catalogue request and before inference. A changed manifest, adapter or artifact fingerprint causes the active model to reload on its next use.
- **Shared assets:** reusable backbones live under `models/_shared/`, so CLIP is stored once.
- **No image persistence:** uploads are decoded in memory and are not written to disk by the API.

## Project layout

```text
deepfake-studio-local/
├── backend/
│   ├── app/                 # API, plugin discovery, model manager, image validation
│   ├── tests/
│   ├── requirements.txt
│   └── requirements-dev.txt
├── frontend/                # Next.js interface
├── models/
│   ├── iapl-sd14/           # One folder = one detector
│   │   ├── model.yaml
│   │   ├── adapter.py
│   │   ├── requirements.txt
│   │   └── weights/         # Put this model's checkpoint here
│   ├── _shared/clip/        # Shared CLIP weights
│   └── _template/           # Copy this to add a model
├── third_party/IAPL/        # Official upstream IAPL source (cloned separately)
└── scripts/
```

## 1. Requirements

- Windows 10/11, macOS or Linux
- Python 3.10 or 3.12 (Python 3.10 is closest to the authors' IAPL environment)
- Node.js 20.9 or newer
- Git
- For IAPL: about 1.7 GB for its checkpoint plus the CLIP ViT-L/14 weights and enough free disk/RAM

Your Intel Iris Xe laptop can run the project on CPU. It cannot use CUDA; expect official IAPL test-time adaptation to be slow. A GPU is not required for the frontend or API.

## 2. Set up Python (Windows PowerShell)

From the project root, optionally create your local environment file first:

```powershell
Copy-Item .env.example .env
py -3.10 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Install the CPU version of PyTorch + torchvision (for a laptop without an NVIDIA GPU):

```powershell
.\.venv\Scripts\python.exe -m pip install torch==2.0.1 torchvision==0.15.2 --index-url https://download.pytorch.org/whl/cpu
```

If you use an existing Python 3.12 environment with a newer PyTorch, the adapter also handles the PyTorch 2.6+ `weights_only` default change. Install the PyTorch/torchvision pair that matches your Python version from the [official selector](https://pytorch.org/get-started/locally/).

Install IAPL-specific packages:

```powershell
.\.venv\Scripts\python.exe -m pip install -r models\iapl-sd14\requirements.txt
```

`setuptools<81` is included because the upstream `pytorch-wavelets` dependency imports `pkg_resources`. `PyWavelets` is included because `pytorch_wavelets` imports `pywt`.

## 3. Download IAPL source and weights

Clone the official repository:

```powershell
git clone https://github.com/liyih/IAPL.git third_party\IAPL
```

Download the IAPL SD 1.4 checkpoint from [the official ModelScope model page](https://www.modelscope.cn/models/yihengli/IAPL_pretrain). Place the file here:

```text
models/iapl-sd14/weights/checkpoint_best_acc_sd14.pth
```

If you already downloaded the weights for the earlier project, you do not need to download them again. Move them into the new folders:

```text
Old project/checkpoints/checkpoint_best_acc_sd14.pth  ->  models/iapl-sd14/weights/checkpoint_best_acc_sd14.pth
Old project/weights/ViT-L-14.pt                       ->  models/_shared/clip/ViT-L-14.pt
Old project/IAPL or third_party/IAPL                  ->  third_party/IAPL
```

Download the OpenAI CLIP ViT-L/14 backbone (only if you do not already have it) and verify its SHA256 automatically:

```powershell
.\.venv\Scripts\python.exe scripts\download_clip.py
```

It is saved to `models/_shared/clip/ViT-L-14.pt`.

The adapter loads the IAPL checkpoint with `weights_only=False` for compatibility with the checkpoint's `argparse.Namespace` object. Only use the official checkpoint from the linked source: loading an untrusted PyTorch checkpoint this way can execute code during deserialization.

## 4. Run the backend

```powershell
.\.venv\Scripts\python.exe scripts\check_setup.py
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

Open API docs at http://127.0.0.1:8000/docs and health at http://127.0.0.1:8000/api/health.

Run only one Uvicorn worker. Each worker would hold its own copy of the model in RAM/GPU memory.

## 5. Run the frontend

Open a second terminal:

```powershell
cd frontend
Copy-Item .env.local.example .env.local
npm install
npm run dev
```

Open http://localhost:3000.

## 6. Add / switch / remove models using File Explorer

### Add a model

1. Copy `models/_template/` to `models/<new-model-id>/`. The directory name must exactly match the manifest `id`.
2. Edit `model.yaml`: change the unique `id`, name, task, paper/code links, adapter entry point and artifact paths.
3. Implement `Detector` in that folder's `adapter.py` with `load()`, `predict(image)` and `unload()`.
4. Put its checkpoint(s) in that folder's `weights/` directory (or reference a shared file under `models/_shared/`).
5. Set `implemented: true` and `enabled: true` in its manifest.
6. Install dependencies listed in that model folder's `requirements.txt` into the active environment, unless they need isolation.
7. Refresh the browser. The model appears automatically. No central Python factory or global YAML catalogue must be edited.

### Disable a model

Set `enabled: false` in its `model.yaml`, then refresh the browser.

### Remove a model

Move its folder outside `models/` (for example into `models-disabled/`) or delete it. Shared assets under `models/_shared/` are not scanned as models.

### Update weights or code

Replace the relevant file in that model's folder. The backend fingerprint detects the changed file and reloads that detector on its next prediction. For a dependency change, restart the backend after installing the new requirements.

**Trust boundary:** model adapters are Python code and run with your user permissions. Only add adapters from sources you trust.

## 7. How model switching works

The UI asks `GET /api/models`. The backend discovers folders and reports readiness from each model's manifest, adapter and required files. On `POST /api/detect`, the Model Manager:

1. Resolves the selected model ID.
2. Unloads the previous model if the selected ID or plugin fingerprint changed.
3. Imports and loads only the selected adapter.
4. Runs one prediction under a global lock.
5. Returns the model-specific score semantics, load time, inference time and metadata.

The lock intentionally serializes inference. IAPL mutates prompt parameters during test-time adaptation; parallel predictions must not share that state.

## 8. Important inference note

The IAPL adapter uses its GenImage-style test-time adaptation defaults: 31 augmented views plus the original view and 2 adaptation steps. This is computationally expensive. On a CPU-only laptop, an inference taking several minutes is possible. The reported inference time excludes initial model loading; the UI reports model-load time separately.

Do not silently reduce views or TTA steps and still report the result as the official IAPL procedure. Any faster configuration is a different inference profile and should be benchmarked separately on a held-out dataset.

## 9. Tests

Install dev tools and run backend tests:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest backend\tests -q
```

The tests exercise plugin discovery, disabled/missing-artifact states and lazy adapter loading without downloading model weights.

## References

- IAPL paper/code: https://github.com/liyih/IAPL
- IAPL checkpoint: https://www.modelscope.cn/models/yihengli/IAPL_pretrain
- CLIP ViT-L/14 weights: https://github.com/openai/CLIP
- PyTorch installation: https://pytorch.org/get-started/locally/
