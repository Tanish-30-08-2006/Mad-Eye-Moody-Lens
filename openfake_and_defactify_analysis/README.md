# OpenFake & Defactify: Preliminary Dataset Analysis

This folder contains two exploratory data analysis (EDA) notebooks, **[`openfake_preliminary_eda.ipynb`](notebook/openfake_preliminary_eda.ipynb)** and **[`defactify_preliminary_eda.ipynb`](notebook/defactify_preliminary_eda.ipynb)**, that characterise two datasets for the **Mad-Eye-Moody-Lens** AI-generated-image detection project.

The goal is to understand dataset structure, source diversity, integrity and shortcut risk **before** any compute-intensive detector training begins, so that preprocessing and evaluation can be designed around known weaknesses.

| Dataset | Role | Images analysed | Real / AI | Synthetic generators | Metadata-only diagnostic (balanced accuracy) |
|---|---|---|---|---|---|
| **OpenFake** (`core/test`) | OOD-oriented supplementary dataset | 3,000 (2,998 after de-duplication) | 1,500 / 1,500 | 20 | **0.944** hold-out, **0.523** source-grouped CV |
| **Defactify** (MS COCOAI) | Controlled, caption-matched dataset | 3,000 | 500 / 2,500 | 5 | **≈ 0.997** real-vs-AI, **0.710** six-way generator ID |

*The metrics above are dataset-shortcut diagnostics, **not detector performance**. No detector was trained in this contribution.*

---

## Table of contents

1. [Project relevance](#1-project-relevance)
2. [Datasets](#2-datasets)
3. [How to run](#3-how-to-run)
4. [Analysis workflow](#4-analysis-workflow)
5. [Key findings](#5-key-findings)
6. [Computational considerations](#6-computational-considerations)
7. [Repository structure and output files](#7-repository-structure-and-output-files)
8. [Limitations and next steps](#8-limitations-and-next-steps)

---

## 1. Project relevance

Detector performance depends as much on dataset structure as on model architecture. This analysis surfaces the risks that matter downstream:

- **Shortcut learning:** metadata or file-level cues that let a model succeed without learning genuine forensic signal.
- **Source dependence:** cues that vanish when generators or real-image sources change.
- **Data integrity:** duplicates, unreadable files and outliers that silently distort results.
- **Generalisation:** how far conclusions transfer across generators and real-image sources.

Finding these issues early lets later experiments be designed around them instead of discovering them after expensive training runs.

---

## 2. Datasets

### OpenFake (`core/test`): OOD-oriented supplementary dataset

Provides held-out generator and source variation together with rich per-image metadata.

| Property | Value |
|---|---|
| Records in `core/test` | 91,398 |
| Images analysed (bounded, reproducible streaming) | 3,000 |
| Class balance | 1,500 real / 1,500 AI-generated |
| Retained after exact-duplicate removal | 2,998 |
| Synthetic generators | 20 |
| Real-image sources | 2 (`DOCCI`, `ImageNet`) |
| Generator release window | 2024-10 to 2026-04 |

The generator set spans a wide and recent range of synthesis models, which makes it a demanding test of cross-generator generalisation.

### Defactify: MS COCOAI

A structured real-vs-AI dataset with **five synthetic generators** and caption-matched real and generated groups.

| Property | Value |
|---|---|
| Images analysed | 3,000 |
| Real images | 500 |
| Images per generator (5 generators) | 500 each |
| Complete caption groups | 500 |
| Unreadable files | 0 |
| Exact duplicate files | 0 |
| File-size outliers flagged | 25 |

Caption-matched groups allow controlled comparison of real and generated content under identical semantics.

---

## 3. How to run

1. Open the notebook you want in **Google Colab** (or a local Jupyter environment).
2. **OpenFake:** a **CPU-only runtime is sufficient**. No GPU and no Hugging Face token or login are required. The notebook streams a bounded, reproducible 3,000-image sample rather than downloading the full split.
3. **Defactify:** run the notebook on a CPU runtime as well; it analyses a 3,000-image sample.
4. Run all cells from top to bottom. Each notebook writes its raw and cleaned tables to CSV (see [section 7](#7-repository-structure-and-output-files)).

**Dependencies:** the standard Python data-analysis stack (for example `numpy`, `pandas`, `matplotlib`, `scikit-learn`, `Pillow`), plus the Hugging Face `datasets` library for streaming OpenFake. All are available or installable on Colab.

---

## 4. Analysis workflow

Both notebooks follow the same reproducible workflow:

| Stage | What it does |
|---|---|
| **Dataset and class structure** | Label balance and generator/source composition. |
| **Integrity checks** | Unreadable-file detection, exact-duplicate removal and file-size outlier flagging. |
| **Image properties** | Resolution and aspect-ratio variation across classes and generators. |
| **Metadata shortcut diagnostics** | Metadata-only classifiers that quantify how much label information leaks through non-visual cues. |
| **Visual inspection** | Qualitative review of real and generated samples. |
| **Frequency-domain profiling** | Exploratory FFT analysis of spectral differences between real and generated images. |
| **Preprocessing implications** | Findings translated into guidance for the detector pipeline. |

---

## 5. Key findings

- **Strong, source-dependent metadata shortcuts in OpenFake.** Metadata alone reached **0.944 hold-out balanced accuracy** but fell to **0.523 under source-grouped cross-validation**. The cues are real but tied to specific sources, which makes grouped and OOD evaluation essential.
- **Defactify is almost fully separable from metadata alone.** Metadata-only diagnostics reached approximately **0.997 balanced accuracy for real-vs-AI** and **0.710 for six-way generator identification**. Preprocessing must neutralise file-level cues before training.
- **Data quality is high.** Defactify had no unreadable or duplicate files. OpenFake lost only 2 of 3,000 images to exact-duplicate removal.
- **The datasets are complementary.** Defactify offers controlled, caption-matched comparison, while OpenFake offers broad and recent generator diversity for OOD stress testing.

> These are dataset-characterisation diagnostics, **not detector accuracy or benchmark performance**.

---

## 6. Computational considerations

### Preliminary EDA

Both analyses were designed as **resource-conscious preliminary studies**.

- **OpenFake:** a bounded 3,000-image analysis of the 91,398-record `core/test` split, using reproducible streaming rather than downloading the full split.
- **Hardware:** CPU-only Google Colab is sufficient for the OpenFake EDA.
- No GPU or Hugging Face authentication was required for the stored analysis.

### Future model training

The datasets are intended to support subsequent image-detector experiments. Actual training cost will depend on the selected architecture, input resolution, batch size, number of epochs and dataset size.

GPU-based training is therefore expected to be used for the **model-development stage**, while the current contribution deliberately limits compute to dataset characterisation and feasibility analysis.

> Training time and GPU cost for Defactify/OpenFake are not reported here because no model-training benchmark was performed as part of this contribution.

---

## 7. Repository structure and output files

```text
openfake_and_defactify_analysis/
├── README.md
├── data/
│   ├── openfake_raw.csv
│   ├── openfake_cleaned.csv
│   ├── openfake_removed_rows.csv
│   ├── defactify_raw.csv
│   └── defactify_cleaned.csv
└── notebook/
    ├── openfake_preliminary_eda.ipynb
    └── defactify_preliminary_eda.ipynb
```

| File | Contents |
|---|---|
| `openfake_raw.csv` | Per-image metadata for the 3,000 sampled OpenFake images, before cleaning. |
| `openfake_cleaned.csv` | OpenFake table after exact-duplicate removal (2,998 rows). |
| `openfake_removed_rows.csv` | The rows removed during de-duplication, kept for auditability. |
| `defactify_raw.csv` | Per-image metadata for the 3,000 sampled Defactify images. |
| `defactify_cleaned.csv` | Defactify table after integrity checks. |

The notebooks' saved outputs (plots, tables and sample grids) render directly on GitHub when you open the `.ipynb` files.

---

## 8. Limitations and next steps

- **Bounded samples.** Each analysis uses 3,000 images, not the full datasets, so findings are indicative rather than exhaustive.
- **Exploratory methods.** Metadata and FFT results are diagnostics, not validated detection methods.
- **No detector evaluated.** Nothing here measures detection accuracy.

**Next steps:**

1. Build preprocessing that removes metadata and file-level shortcuts (for example re-encoding and metadata stripping).
2. Evaluate with source-grouped and cross-generator splits, using OpenFake as the OOD test bed.
3. Benchmark candidate architectures on the cleaned data, recording measured training time and GPU cost.
