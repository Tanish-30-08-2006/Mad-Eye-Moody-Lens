# Detection Studio Cloud (Colab + InfinityFree add-on)

This is a **separate, additive deployment folder** for the existing Mad Eye Moody Lens repository.

It creates a sibling folder named `detection-studio-cloud/`. It does **not** modify or replace the existing `detection-studio/` local application, its frontend, FastAPI backend, model adapters, local inference workflow, or local model files.

## What it does

- `notebooks/DetectionStudio_Colab.ipynb`: runs the existing Detection Studio plugin system inside the current user's own Google Colab notebook session.
- `drive-template/`: documents the persistent Google Drive layout for the IAPL checkpoint and shared CLIP weights.
- `website/`: a static launch/catalogue site that can be uploaded to InfinityFree `htdocs/`.
- `deployment/`: step-by-step instructions.

The Colab notebook clones the existing `Mad-Eye-Moody-Lens` repository at `ruturaj-dev`, reuses `detection-studio/backend/app/plugins.py`, `manager.py`, and the IAPL adapter, then copies the weights from the current user's Google Drive to Colab's temporary local disk.

## Important operating model

This is **not** an always-on public inference API. Visitors open the notebook and run inference in their own Google Colab account/session. The InfinityFree website only provides information and opens the notebook. It does not proxy images to Colab or keep a Colab process running as a web server.

Google says Colab resource availability and limits vary dynamically; GPU access is not guaranteed. The free tier prioritizes interactive notebook use. Do not expose a free Colab runtime through a tunnel or use it as a persistent website backend.

## Repository placement

Extract this ZIP at the root of the existing repository:

```text
Mad-Eye-Moody-Lens/
├── detection-studio/             # Existing local application — leave untouched
└── detection-studio-cloud/       # This new folder
    ├── notebooks/
    ├── website/
    ├── drive-template/
    ├── deployment/
    ├── .gitignore
    └── README.md
```

## Before opening Colab

1. Push the existing `detection-studio/` source code to the public `ruturaj-dev` branch so Colab can clone it.
2. Upload your own pretrained files into Google Drive exactly as documented in `drive-template/README.md`.
3. Commit and push this new `detection-studio-cloud/` folder to `ruturaj-dev`.
4. Open the notebook using the link in `notebooks/README.md` or the website's **Open in Colab** link.
5. In Colab select **Runtime → Change runtime type → T4 GPU** (or another GPU if offered), connect Drive, and run all cells in order.
6. Upload `website/` contents (not the parent folder) to InfinityFree `htdocs/`.

## Existing model files are reused

The notebook expects the following model implementation to already exist in the existing local app repository:

- `detection-studio/models/iapl-sd14/model.yaml`
- `detection-studio/models/iapl-sd14/adapter.py`
- `detection-studio/backend/app/plugins.py`
- `detection-studio/backend/app/manager.py`

It clones the official IAPL research repository into the temporary Colab runtime at `detection-studio/third_party/IAPL/`, because upstream research source is intentionally excluded from Git.

## Model artifact paths in Google Drive

```text
MyDrive/MadEyeMoodyLens/DetectionStudioCloud/models/
├── iapl-sd14/
│   └── checkpoint_best_acc_sd14.pth
└── shared/
    └── clip/
        └── ViT-L-14.pt
```

Keep the `.pth` and `.pt` files out of Git. Do not commit Google credentials or access tokens.

## Test status

The notebook cells are syntax-checked and the notebook JSON is validated. This package has not been run inside a live Google Colab GPU session; verify the first real inference there. Local inference remains unchanged and should continue to be run from `detection-studio/` as before.
