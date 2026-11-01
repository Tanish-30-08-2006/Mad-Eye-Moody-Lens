# Google Drive model-artifact layout

Create this folder in your own Google Drive:

```text
MyDrive/MadEyeMoodyLens/DetectionStudioCloud/models/
├── iapl-sd14/
│   └── checkpoint_best_acc_sd14.pth
└── shared/
    └── clip/
        └── ViT-L-14.pt
```

Copy your existing local files from the local Detection Studio project:

| Existing local file | Google Drive destination |
|---|---|
| `detection-studio/models/iapl-sd14/weights/checkpoint_best_acc_sd14.pth` | `models/iapl-sd14/checkpoint_best_acc_sd14.pth` |
| `detection-studio/models/_shared/clip/ViT-L-14.pt` | `models/shared/clip/ViT-L-14.pt` |

The notebook copies these files from Drive to `/content` in the Colab runtime before inference. This avoids repeatedly reading large model files during inference. The Colab runtime disk is temporary; Drive is the persistent copy.

Do not share your entire Drive with anyone. The notebook's `drive.mount()` requests Google authorization for your own session. Review notebook cells before granting access.
