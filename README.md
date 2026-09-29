# CIFAKE: Real vs AI-Generated Image Classifier (CNN Training)

This branch (`vishwam-dev`) adds **[`CIFAKE_CNN_Training.ipynb`](CIFAKE_CNN_Training.ipynb)**, a Google Colab notebook that trains and evaluates deep-learning models that tell **real photographs** apart from **AI-generated (synthetic) images**. It is the first image-model baseline for the Mad-Eye-Moody-Lens deepfake / AI-content detection project.

The notebook compares two approaches on the CIFAKE dataset:

| Model | Input size | Trainable params | Test accuracy | Test macro-F1 | Training time (T4) |
|---|---|---|---|---|---|
| **SimpleCNN** (trained from scratch) | 32 × 32 | 1,206,370 | **97.56 %** | **0.9755** | ≈ 32 min (30 epochs) |
| **ResNet-18** (ImageNet-pretrained, fine-tuned) | 128 × 128 | 11,177,538 | **98.69 %** | **0.9869** | ≈ 26 min (3 + 9 epochs) |

*Chance accuracy is 50 % (two balanced classes). All scores are on the 20,000-image held-out test set, which was never used for training or model selection.*

---

## Table of contents

1. [Dataset](#1-dataset)
2. [How to run](#2-how-to-run)
3. [Notebook walkthrough (step by step)](#3-notebook-walkthrough-step-by-step)
4. [Model architectures](#4-model-architectures)
5. [Training setup](#5-training-setup)
6. [Results](#6-results)
7. [Output files](#7-output-files)
8. [Limitations and next steps](#8-limitations-and-next-steps)

---

## 1. Dataset

**CIFAKE: Real and AI-Generated Synthetic Images** (Bird & Lotfi, 2023)

- **REAL**: 60,000 real photographs taken from CIFAR-10.
- **FAKE**: 60,000 synthetic images generated with Stable Diffusion v1.4 to mirror the ten CIFAR-10 classes.
- All images are **32 × 32 RGB**.
- The download is already split into `train/` and `test/` folders, each containing `REAL/` and `FAKE/` sub-folders.

Split used in the notebook (created automatically, stratified, seed = 42):

| Split | Images | Source |
|---|---|---|
| Train | 85,000 | 85 % of `train/` (42,500 per class) |
| Validation | 15,000 | 15 % of `train/` (used to choose the best epoch and for early stopping) |
| Test | 20,000 | the provided `test/` folder (10,000 per class) |

The classes are perfectly balanced, so class weighting is switched off.

---

## 2. How to run

1. Open the notebook in **Google Colab** and choose **Runtime → Change runtime type → GPU** (it was run on a Tesla T4).
2. Get the dataset in one of two ways:
   - **Upload the zip** (the method used in the saved run): run the upload cell after Step 2 and pick `CIFAKE-Real-and-AI-Generated-Synthetic-Images-main.zip`. If the zip is already in `/content`, the cell reuses it.
   - **Google Drive link**: paste a share link into `DATASET_LINK` in Step 2 and skip the upload cell. A single `.zip` link is much faster than a folder link, because Google rate-limits folders with ~120k files.
3. Run all cells from top to bottom. Step 8 trains the model selected in `CONFIG`; Step 10 trains **both** models and compares them.
4. (Optional) Step 11 lets you upload any image and get a REAL / FAKE prediction with confidence.

**Dependencies** (all pre-installed on Colab, except `gdown` which Step 0 upgrades): `torch`, `torchvision`, `scikit-learn`, `numpy`, `pandas`, `matplotlib`, `seaborn`, `Pillow`, `gdown`.

The notebook also runs outside Colab (it detects this and uses the current folder instead of `/content`), but the upload cells use `google.colab.files`, so outside Colab you should point `DATASETS` at a local path instead.

---

## 3. Notebook walkthrough (step by step)

Almost every line of code has an inline comment, so the notebook also works as a learning resource.

| Step | Cell | What it does |
|---|---|---|
| **0** | GPU check | Runs `nvidia-smi` to confirm a GPU is attached and upgrades `gdown`. |
| **1** | Imports & reproducibility | Imports PyTorch, torchvision, scikit-learn and plotting libraries; selects `cuda` if available; detects whether it's running in Colab; defines `set_seed()`, which seeds Python, NumPy and PyTorch so splits and weight initialisation are reproducible. |
| **2** | Drive link + settings | `DATASET_LINK`, the `DATASETS` list (more datasets can be added for comparison), and a single `CONFIG` dictionary that holds **every hyper-parameter** (see [Training setup](#5-training-setup)). |
| *(extra)* | Upload zip | Colab file-upload helper. It reuses an already-uploaded zip and points `DATASETS` at it, overriding the Drive link. |
| **3** | Download & locate data | Helpers that parse any Google-Drive link format, download it with `gdown`, auto-extract `.zip`/`.tar*` archives, skip wrapper folders (`find_image_root`), detect pre-made `train/val/test` folders (`detect_splits`), and optionally find corrupt images with Pillow. A `.ready` marker file prevents re-downloading. |
| **4** | Transforms, splits & DataLoaders | Builds the pre-processing pipelines, carves out the validation split, and creates the PyTorch `DataLoader`s. It supports both *pre-split* datasets and *one-folder-per-class* datasets (auto 70/15/15 split). `show_samples()` shows a batch of augmented training images. |
| **5** | CNN architecture | Defines `SimpleCNN` and `build_model()` (which returns either `simple_cnn` or a pretrained `resnet18` with a new head), plus helpers to freeze or unfreeze the backbone and count parameters. A quick shape test confirms that a `[2, 3, 32, 32]` input gives a `[2, 2]` output. |
| **6** | Training loop | `train_one_epoch()` (with mixed precision and gradient scaling), `evaluate()` (no-grad inference), and `fit()`: AdamW, cosine LR schedule, label-smoothed cross-entropy, per-epoch logging, **best-checkpoint tracking on validation macro-F1**, and **early stopping**. |
| **7** | Metrics & plots | `compute_metrics()` (accuracy plus macro and weighted precision/recall/F1), `plot_history()` (loss and accuracy/F1 learning curves), and `plot_confusion()` (row-normalised confusion-matrix heatmap). |
| **8** | Train on the dataset(s) | `run_experiment()` ties everything together: fetch data → build loaders → train (one phase for SimpleCNN, two phases for ResNet-18) → evaluate on the **test set** → print a classification report → plot → save the checkpoint. |
| **9** | Compare results | Collects the results into a pandas table, draws a grouped bar chart of test metrics against the chance level, overlays validation-F1 curves, and saves `comparison_<model>.csv`. |
| **10** | Experiments | Runs a list of `CONFIG` overrides: **SimpleCNN from scratch vs fine-tuned ResNet-18**. It prints pivot tables of test macro-F1 and accuracy and saves `experiments.csv`. New experiments (e.g. stronger regularisation) can be added as extra dictionaries. |
| **11** | Predict on a new image | Loads a saved checkpoint (weights + class names + config), applies the matching test-time transform, and prints the top class probabilities for an uploaded image. |

---

## 4. Model architectures

### SimpleCNN (from scratch, about 1.2 M parameters)

Four convolutional blocks. Each block is `Conv3×3 → BN → ReLU → Conv3×3 → BN → ReLU → MaxPool2×2`:

```
Input  3 × 32 × 32
Block1 → 32  × 16 × 16
Block2 → 64  × 8  × 8
Block3 → 128 × 4  × 4
Block4 → 256 × 2  × 2
AdaptiveAvgPool → 256
Dropout(0.3) → Linear(256→128) → ReLU → Dropout(0.3) → Linear(128→2)   # logits for FAKE / REAL
```

Using two stacked 3×3 convolutions per block gives a 5×5 receptive field at low cost. Global average pooling keeps the classifier head small.

### ResNet-18 (transfer learning, about 11.2 M parameters)

- Loads **ImageNet-pretrained** `torchvision` ResNet-18 weights and replaces the 1000-class head with `Dropout(0.3) → Linear(512→2)`.
- Images are resized to **128 × 128**, because at 32 × 32 ResNet's down-sampling would shrink the feature map to 1 × 1.
- **Two-phase fine-tuning:**
  1. **Head only** for 3 epochs (backbone frozen, 1,026 trainable parameters), at LR = 1e-3.
  2. **Full fine-tune** for 9 epochs (everything unfrozen), at LR = 1e-4 (`lr × finetune_lr_factor`). Phase 2 has to *beat* phase 1's best validation F1 before it replaces the saved weights.

---

## 5. Training setup

| Setting | Value | Why |
|---|---|---|
| Optimizer | AdamW, lr `1e-3`, weight decay `1e-4` | Adam with decoupled weight decay |
| LR schedule | Cosine annealing over the run | Smooth decay to ~0 by the last epoch |
| Loss | Cross-entropy, label smoothing `0.1` | Reduces over-confidence |
| Batch size | 128 | Small images, so large batches fit easily |
| Epochs | 30 (SimpleCNN) / 3 + 9 (ResNet-18) | Upper bound; early stopping can end a run sooner |
| Early stopping | patience 6 on **validation macro-F1** | Stops a stalled run; the best epoch's weights are restored |
| Dropout | 0.3 | Regularisation in the classifier head |
| Mixed precision (AMP) | On (GPU only) | Faster and uses less memory |
| Seed | 42 | Reproducible splits and initialisation |

**Augmentation (training only):** a random crop with 4 px reflect padding, plus a random horizontal flip. **Colour jitter, rotation and blur are deliberately left out**, because colour and texture artefacts are exactly the signals that reveal AI-generated images, and destroying them would hurt the detector. Validation and test images are only resized and normalised (with ImageNet mean/std).

---

## 6. Results

All numbers come from the saved run on a Colab **Tesla T4** (PyTorch 2.11).

### SimpleCNN (32 × 32, trained from scratch)

- Trained all 30 epochs without early stopping. The best validation macro-F1 was **0.979**, at epoch 27.
- Validation accuracy climbed steadily from 91.7 % (epoch 1) to 97.9 %, with one dip at epoch 5 (89.4 %).
- **Test:** accuracy **0.9756**, macro precision 0.9756, recall 0.9755, F1 **0.9755**.

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| FAKE | 0.971 | 0.980 | 0.976 | 10,000 |
| REAL | 0.980 | 0.971 | 0.975 | 10,000 |

### ResNet-18 (128 × 128, pretrained and fine-tuned)

- Head-only phase: about 85.9 % validation accuracy. Frozen ImageNet features on their own are only moderately useful for this task.
- After unfreezing, validation accuracy jumped to 97.2 % in the first fine-tune epoch and reached **98.7 %** by the final epoch.
- **Test:** accuracy **0.9869**, macro precision 0.9869, recall 0.9869, F1 **0.9869**.

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| FAKE | 0.984 | 0.989 | 0.987 | 10,000 |
| REAL | 0.989 | 0.984 | 0.987 | 10,000 |

### Takeaways

- Both models are far above chance (50 %). Fine-tuning a pretrained ResNet-18 cuts the test error roughly in half, from 2.44 % to 1.31 %.
- Both models make slightly more mistakes on **REAL** images (real photos flagged as fake) than on FAKE ones. This is worth tracking, because false alarms on genuine content matter for a detection tool.
- The gap between training and validation accuracy stays small (≤ ~1 %), so the regularisation (dropout, weight decay, label smoothing, augmentation) is keeping overfitting under control.

The notebook's saved outputs include the sample-image grid, learning curves, confusion matrix and comparison bar charts. GitHub renders all of them when you open the `.ipynb` file.

---

## 7. Output files

These files are written to `/content/results/` in Colab (or `./results/` locally). Set `CONFIG["save_to_drive"] = True` to also copy them to `MyDrive/cnn_results`.

| File | Contents |
|---|---|
| `cifake_simple_cnn.pt` | SimpleCNN checkpoint: `state_dict`, class names, full config |
| `cifake_resnet18.pt` | ResNet-18 checkpoint, same format |
| `comparison_simple_cnn.csv` | Step 9 metrics table |
| `experiments.csv` | Step 10 results for every experiment |

The checkpoints are **not** committed to this repository because of their size. Re-run the notebook to regenerate them.

---

## 8. Limitations and next steps

- **Low resolution / single generator.** CIFAKE images are 32 × 32, and every fake comes from Stable Diffusion v1.4. High accuracy here does not guarantee the model generalises to high-resolution images or to other generators (Midjourney, DALL·E, newer SD versions, GAN face-swaps). Cross-dataset evaluation is the natural next step. The notebook already supports it: add more entries to `DATASETS`.
- **Step 11 was not executed** in the saved run (it printed "Set CHECKPOINT and IMAGE_PATH to existing files first."), so there is no single-image demo output yet.
- Possible follow-ups: evaluate on the team's other datasets (e.g. Defactify), try larger or more modern backbones, add robustness tests (JPEG compression, resizing), and export the best model for use in the detection pipeline.
