### Source / Paper 1
**Source / Paper:**  
*FaceForensics++: Learning to Detect Manipulated Facial Images* (Rössler et al., ICCV 2019)

**Model / Technique:**  
CNN (specifically XceptionNet trained on face crops)

**Key Findings:**

*   **Model Approach:** The paper evaluates several hand-crafted and deep learning-based approaches. It demonstrates that a frame-by-frame classification approach using a modified **Xception** network architecture (pre-trained on ImageNet and fine-tuned for binary classification) significantly outperforms other baselines (such as MesoNet and StegAnalysis) when detecting state-of-the-art facial manipulations (Deepfakes, Face2Face, FaceSwap, and NeuralTextures).
*   **Dataset Requirements:** The FaceForensics++ dataset consists of 1,000 original video sequences (containing 509,914 images) and 4,000 manipulated videos (containing over 1.8 million images). Training a robust Xception model requires thousands of high-quality video frames representing both pristine and manipulated classes across various compression levels.
*   **Preprocessing:** Raw video frames cannot be fed directly into the network. The pipeline requires:
    1.  **Face Detection:** Utilizing a face detector (the paper uses *dlib* or *MTCNN*) to locate facial bounding boxes.
    2.  **Tracking & Cropping:** Tracking the face across frames and cropping the facial region.
    3.  **Scale Factor:** Enlarging the bounding box by a factor of $1.3\times$ to capture the surrounding context (e.g., chin, hairline, and background transition boundaries), which contains critical artifacts.
    4.  **Resizing:** Resizing the cropped face to $299 \times 299$ pixels to match the Xception input layer.
*   **Accuracy / Evaluation:** 
    *   On **Raw (uncompressed)** videos, Xception achieves an accuracy of **99.7%**.
    *   On **High Quality (HQ - light compression, H.264 CR 23)**, accuracy drops to **95.3%**.
    *   On **Low Quality (LQ - heavy compression, H.264 CR 40)**, accuracy drops significantly to **81.0%**.
*   **Inference / Performance:** Frame-by-frame inference is computationally expensive. Processing every single frame of a 30-fps video creates a massive bottleneck. The paper implies that temporal downsampling (processing a subset of frames) is necessary for practical applications.
*   **Confidence / Prediction:** The model outputs a binary softmax probability (Real vs. Fake) per frame. To obtain a video-levelprediction, frame-level probabilities must be aggregated (e.g., via averaging or majority voting).
*   **Limitations:** The model suffers from a severe drop in accuracy when tested on unseen manipulation methods (cross-dataset evaluation). For example, a model trained on Face2Face drops in accuracy when evaluated on NeuralTextures. It is also highly sensitive to video compression (as shown by the drop to 81.0% on LQ videos).
*   **Maintenance / Updating:** Because generative models continuously improve, the detection model must be periodically retrainedor fine-tuned on newly released manipulation datasets to prevent obsolescence.

**Requirement / Constraint Derived:**  
The system must implement an automated preprocessing pipeline that performs face detection (using MTCNN or similar), applies a $1.3\times$ bounding box expansion, and resizes the crop to $299 \times 299$ pixels before inference. To handle low-quality uploads, the UI must warn users that accuracy is significantly degraded (by up to ~18%) on highly compressed or low-resolution videos.

**Requirement Type:**  
ML / Model Requirement

**Confidence:**  
High

---

### Source / Paper 2
**Source / Paper:**  
*ASVspoof 2019: A large-scale public database of synthetic, converted and replayed speech* (Todisco et al., 2019)

**Model / Technique:**  
Spectrogram / Acoustic Features (LFCC, CQCC) + ResNet / GMM / CNN

**Key Findings:**

*   **Model Approach:** The paper outlines baseline systems for detecting synthetic speech (Logical Access - LA) and replayed speech (Physical Access - PA). It utilizes acoustic feature extraction—specifically **Constant Q Cepstral Coefficients (CQCC)** and **Linear Frequency Cepstral Coefficients (LFCC)**—paired with classifiers like Gaussian Mixture Models (GMMs) or deep CNNs (e.g., ResNet architectures) trained on 2D spectrogram representations.
*   **Dataset Requirements:** The ASVspoof 2019 database contains 25,380 training trials, 24,844 development trials, and 71,748 evaluation trials for the Logical Access (LA) scenario. Audio files are provided in a standardized format.
*   **Preprocessing:** Audio inputs must be standardized before feature extraction:
    1.  **Format Standardization:** Downsampling/converting all audio to **16 kHz, single-channel (mono), 16-bit WAV format**.
    2.  **Feature Transformation:** Computing CQCC or LFCC features, or applying a Short-Time Fourier Transform (STFT) / Constant-Q Transform (CQT) to convert the 1D audio waveform into a 2D spectrogram matrix.
*   **Accuracy / Evaluation:** Performance is evaluated using the **Equal Error Rate (EER)** and the tandem Detection Cost Function (t-DCF). The baseline CQCC-GMM system achieved an EER of **1.24%** on the development set and **9.57%** on the evaluation set forsynthetic speech (LA), highlighting the gap between development and unseen evaluation conditions.
*   **Inference / Performance:** Extracting CQT/CQCC features is computationally intensive on the CPU. Real-time factor (RTF) calculations indicate that feature extraction can take longer than the actual neural network forward pass.
*   **Confidence / Prediction:** The models output log-likelihood ratios (LLRs) or softmax probabilities. A threshold must be calibrated (typically where False Positive Rate equals False Negative Rate, i.e., the EER point) to classify an audio clip as real or fake.
*   **Limitations:** Models are highly sensitive to acoustic environments, microphone characteristics, and lossy audio compression(e.g., MP3 or AAC transcoding), which destroy the high-frequency phase information used to detect synthetic artifacts.
*   **Maintenance / Updating:** As text-to-speech (TTS) and voice conversion (VC) technologies evolve (e.g., diffusion-based voicecloning), the audio model must be continuously updated with new spoofing algorithms to avoid high false-negative rates.

**Requirement / Constraint Derived:**  
The backend must include an audio transcoding service (e.g., using FFmpeg) to convert all uploaded audio files to 16 kHz, mono, 16-bit WAV format before computing spectrograms or cepstral features. The ML engineer must be provided with an admin interface to adjust the classification threshold (LLR/probability threshold) to balance the trade-off between False Alarms and Missed Detections.

**Requirement Type:**  
Technical Constraint

**Confidence:**  
High

---

### Source / Paper 3
**Source / Paper:**  
*The DeepFake Detection Challenge (DFDC) Standard Dataset* (Dolhansky et al., 2020)

**Model / Technique:**  
CNN / EfficientNet / Sequence Models (LSTM/3D CNN)

**Key Findings:**

*   **Model Approach:** The paper details the DFDC dataset and the performance of baseline and top-performing models. The most successful architectures utilize ensembles of **EfficientNet (B3 to B7)** for frame-level feature extraction, sometimes integrated with sequence models (like LSTMs or GRUs) or 3D CNNs (like SlowFast) to capture temporal inconsistencies across frames.
*   **Dataset Requirements:** The DFDC dataset is massive, containing over 100,000 total video clips from 3,426 unique actors. It incorporates diverse lighting conditions, complex backgrounds, and varied ethnicities to prevent demographic bias in detection models.
*   **Preprocessing:** 
    1.  **Face Detection:** High-precision face detection (e.g., RetinaFace or MTCNN) is required.
    2.  **Frame Sampling:** Because processing every frame of a 10-second, 30-fps video (300 frames) is computationally prohibitive, models must use **uniform frame sampling** (e.g., extracting and processing only 15 to 30 evenly spaced frames per video).
*   **Accuracy / Evaluation:** The primary evaluation metric is **Log Loss**. The winning model of the DFDC challenge achieved a log loss of **0.427** on the private, unseen test set (which translates to roughly **65% to 70% accuracy** on highly challenging, "in-the-wild" deepfakes with diverse perturbations).
*   **Inference / Performance:** Inference using heavy CNN ensembles (like EfficientNet-B7) is extremely slow and requires high-end GPU acceleration (e.g., NVIDIA V100 or A100). Running inference on a single 10-second video can take several seconds, making synchronous HTTP requests impractical for a web application.
*   **Confidence / Prediction:** The model outputs a probability score between 0.0 and 1.0. The paper notes that displaying a raw percentage (e.g., "92% confident") can be misleading to users because models can output high-confidence false positives on videos with unusual lighting, compression artifacts, or rapid head movements.
*   **Limitations:** Models struggle significantly with low-resolution faces (under $50 \times 50$ pixels), profile views (where face detectors fail to locate landmarks), fast motion blur, and novel post-processing perturbations (e.g., overlaying noise or colorfilters).
*   **Maintenance / Updating:** The rapid evolution of deepfake generation tools means that models trained on DFDC will experienceperformance degradation over time. The system architecture must support modular model swapping without requiring downtime.

**Requirement / Constraint Derived:**  
The web application must implement an **asynchronous processing queue** (e.g., Celery with Redis/RabbitMQ) to handle video uploads. Because inference on sampled frames using deep CNNs will exceed typical web server synchronous request timeouts (e.g., 30 seconds), the system must notify the user via WebSockets or polling when the analysis is complete.

**Requirement Type:**  
Technical Constraint / Non-functional

**Confidence:**  
High

---

### Summary Table

| Source | Key Finding | Requirement / Constraint | Type |
| :--- | :--- | :--- | :--- |
| **FaceForensics++** (Rössler et al., 2019) | XceptionNet requires face detection, tracking, and cropping with a $1.3\times$ scale factor. Accuracy drops from 99.7% (raw) to 81.0% (low quality). | The system must implement an automated face detection and cropping pipeline ($1.3\times$ scale) and warn users of reduced accuracy on compressed videos. | ML / Model Requirement |
| **ASVspoof 2019** (Todisco et al., 2019) | Audio deepfake detection requires standardized 16 kHz mono WAV inputs and CQCC/LFCC feature extraction. EER degrades on unseen synthetic speech. | The backend must transcode all uploaded audio to 16 kHz mono WAV and provide an admin interface for threshold calibration. | Technical Constraint |
| **DFDC Standard Dataset** (Dolhansky et al., 2020) | Top models use heavy CNNs (EfficientNet) and frame sampling. Inference is computationally expensive, and log loss on unseen "in-the-wild" data is high. | The web application must process video uploads asynchronously using a task queue (e.g., Celery) to avoid HTTP request timeouts. | Technical Constraint / Non-functional |
