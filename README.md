# OpenSDI Dataset Analysis

This folder contains the preliminary analysis of the OpenSDI dataset for the image modality of the project.

## Dataset

The analysis uses the OpenSDI test dataset and covers the following image generators:

- SD1.5
- SD2.1
- SDXL
- SD3
- Flux.1

For the preliminary analysis, a balanced sample of 100 real and 100 fake images was collected from each generator, giving a total of 1,000 samples.

## What Was Done

The dataset was analyzed to understand:

- Real and fake image distribution
- Number of samples from each generator
- Real/fake distribution for each generator
- Generator family distribution
- Availability of masks in the dataset
- Basic dataset metadata and duplicate keys

The generators were also grouped into two families for project-level analysis:

- **UNet diffusion:** SD1.5, SD2.1, SDXL
- **DiT / Flow Matching:** SD3, Flux.1

## Files

### `data/`

Contains the cleaned dataset metadata and summary:

- `opensdi_cleaned.csv`
- `opensdi_summary.json`

### `figures/`

Contains the graphs generated during the analysis:

- Class balance
- Generator coverage
- Generator-wise class balance
- Generator family distribution
- Mask availability

### `notebook/`

Contains the Google Colab/Jupyter notebook used to load and analyze the OpenSDI dataset.

## Purpose

This analysis provides an initial understanding of the dataset and its generator coverage. It can be used as a reference for future experiments involving model training and evaluation, particularly for testing generalization across different image-generation architectures.

## Note

This is a preliminary analysis based on a 1,000-sample balanced subset of the OpenSDI test dataset. It is not an analysis of the complete OpenSDI dataset.
