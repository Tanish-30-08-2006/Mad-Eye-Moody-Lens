### Dataset 1: FaceForensics++ (FF++)

**Dataset Name:**
FaceForensics++

**Source/Document:**
*   **Research Paper:** "FaceForensics++: Learning to Detect Manipulated Facial Images" (Rössler et al., ICCV 2019).
*   **Official Repository & Terms of Use:** [github.com/ondyari/FaceForensics](https://github.com/ondyari/FaceForensics) and the official FaceForensics Terms of Use agreement form.

**Key Findings:**

*   **Purpose:** 
    *   *Fact:* It is a forensics dataset consisting of 1,000 original YouTube videos containing faces, manipulated by four state-of-the-art facial manipulation methods: Deepfakes, Face2Face, FaceSwap, and NeuralTextures. 
    *   *Fact:* It is intended strictly for non-commercial research and educational purposes.
*   **License:** 
    *   *Fact:* Custom restrictive license. The dataset is provided under a specific "Terms of Use" agreement.
    *   *Fact:* Redistribution of the dataset, or any modified version of it, is strictly prohibited.
*   **Permitted Use:** 
    *   *Fact:* Permitted only for non-commercial research purposes. 
    *   *Reasonable Inference:* Models trained on this dataset cannot be integrated into a commercialized web application or sold as a service. The web app itself must remain a non-commercial academic prototype.
*   **Formats/Data:** 
    *   *Fact:* Contains video files (MP4 format).
    *   *Fact:* Provided in three different compression levels: Raw (c0 - uncompressed), High Quality (c23 - light H.264 compression), and Low Quality (c40 - heavy H.264 compression).
    *   *Fact:* Ground truth binary masks for manipulated regions are provided.
*   **Access Requirements:** 
    *   *Fact:* Access is not public. Users must fill out a Google Form/application to sign the Terms of Use. Once approved, the organizers provide a password-protected download script.
*   **Privacy/Ethical Restrictions:** 
    *   *Fact:* The source videos are downloaded from YouTube. The individuals in the videos did not explicitly consent to their biometric data being used for deepfake training.
    *   *Fact:* The Terms of Use explicitly forbid using the dataset to target, identify, or profile individuals.
*   **Limitations:** 
    *   *Fact:* The dataset focuses almost exclusively on frontal or near-frontal facial views with relatively high-quality lighting.
    *   *Fact:* The paper notes that detection accuracy drops significantly when models trained on high-quality (c0 or c23) data are tested on heavily compressed (c40) videos, which are common on social media.

---

**Requirement / Constraint Derived:**
1.  **Legal/Ethical Constraint:** The Deepfake Detection Web App must be deployed strictly as a non-commercial, open-source, or academic prototype. No monetization, paywalls, or commercial licensing can be applied to the application or the models trained on FaceForensics++.
2.  **Technical Constraint (Preprocessing):** The web app's backend video processing pipeline must include a face-detection and cropping step (e.g., using MTCNN or RetinaFace) to isolate the facial bounding box before feeding the frame to the CNN, as the FF++ models are trained on cropped facial regions, not full-frame videos.
3.  **Non-functional Requirement (Robustness):** To handle real-world user uploads (which are often compressed by web browsers or messaging apps), the CNN model must be trained on the compressed versions of the dataset (c23 and c40) rather than just the raw (c0) version to prevent severe performance degradation.

**Requirement Type:**
*   Constraint 1: Domain / Legal / Ethical
*   Constraint 2: Technical Constraint
*   Requirement 3: Non-functional (Reliability/Robustness)

**Confidence:**
High

---

### Dataset 2: ASVspoof 2019

**Dataset Name:**
ASVspoof 2019 (Automatic Speaker Verification Spoofing and Countermeasures Challenge)

**Source/Document:**
*   **Research Paper:** "ASVspoof 2019: A large-scale public database of synthetic, converted and replayed speech" (Todisco et al., Interspeech 2019).
*   **Official Repository/Host:** Hosted on Zenodo (under the ASVspoof consortium).
*   **License Document:** Zenodo metadata and ASVspoof 2019 database guidelines.

**Key Findings:**

*   **Purpose:** 
    *   *Fact:* Designed to evaluate synthetic speech detection (Logical Access - LA, which includes Text-to-Speech and Voice Conversion) and physical acoustic replay detection (Physical Access - PA).
    *   *Fact:* Intended to foster research in automatic speaker verification and spoofing countermeasures.
*   **License:** 
    *   *Fact:* Distributed under the Creative Commons Attribution 4.0 International (CC BY 4.0) license.
*   **Permitted Use:** 
    *   *Fact:* CC BY 4.0 allows copying, redistributing, remixing, transforming, and building upon the material for any purpose, including commercial use, provided that appropriate credit/attribution is given to the creators.
    *   *Reasonable Inference:* Models trained on ASVspoof 2019 can be deployed in a commercial web application, provided the application includes a clear attribution notice.
*   **Formats/Data:** 
    *   *Fact:* Audio files are provided in WAV format (linear PCM, 16-bit, 16 kHz sampling rate, single-channel/mono).
*   **Access Requirements:** 
    *   *Fact:* Publicly available. No registration, approval, or signing of restrictive agreements is required to download the dataset from Zenodo.
*   **Privacy/Ethical Restrictions:** 
    *   *Fact:* The dataset is derived from the VCTK (Voice Cloning Toolkit) corpus, which consists of speech data from cooperative, anonymous speakers who consented to their voice being recorded for research. No explicit biometric privacy restrictions prevent its use in public detection systems.
*   **Limitations:** 
    *   *Fact:* The Logical Access (LA) partition contains clean, studio-quality recordings. 
    *   *Reasonable Inference:* Models trained on this clean data may struggle to generalize to real-world user uploads that contain background noise, reverberation, or lossy audio compression (e.g., MP3, AAC).

---

**Requirement / Constraint Derived:**
1.  **Technical Constraint (Audio Preprocessing):** The web app's audio ingestion pipeline must automatically convert user-uploaded audio files (regardless of original format like MP3 or M4A) to 16 kHz, 16-bit, mono WAV format to match the exact input characteristics of the ASVspoof-trained model.
2.  **Functional Requirement (Feature Extraction):** The backend must implement a spectrogram extraction module (specifically generating Linear Frequency Cepstral Coefficients [LFCC] or Constant Q Cepstral Coefficients [CQCC], as recommended by the ASVspoof 2019 baseline) to convert the raw audio into 2D representations before passing them to the CNN.
3.  **Domain / Legal / Ethical Requirement:** The web app's "About" or "Credits" page must display a visible attribution notice citing the ASVspoof 2019 database and its creators to comply with the CC BY 4.0 license.

**Requirement Type:**
*   Constraint 1: Technical Constraint
*   Requirement 2: Functional
*   Requirement 3: Domain / Legal / Ethical

**Confidence:**
High

---

### Summary Table

| Dataset | Important Finding | Requirement / Constraint | Type |
| :--- | :--- | :--- | :--- |
| **FaceForensics++** | Custom non-commercial research license; redistribution prohibited. | The web app and its models must remain strictly non-commercial. | Domain / Legal / Ethical |
| **FaceForensics++** | Detection accuracy drops significantly on compressed videos. | The CNN model must be trained on compressedsubsets (c23/c40) to handle real-world web uploads. | Non-functional (Robustness) |
| **FaceForensics++** | Dataset consists of cropped facial regions. | The backend must perform face detection and cropping before feeding frames to the CNN. | Technical Constraint |
| **ASVspoof 2019** | Distributed under CC BY 4.0 license. | The web app must display a visible attribution notice citing the ASVspoof 2019 creators. | Domain / Legal / Ethical |
| **ASVspoof 2019** | Audio is standardized to 16 kHz, 16-bit, mono WAV. | The audio pipeline must automatically resample and convert user uploads to 16 kHz, 16-bit, mono WAV. | Technical Constraint |
| **ASVspoof 2019** | Baseline models rely on specific acoustic features. | The backend must extract LFCC or CQCC spectrograms from the audio files for CNN processing. | Functional |
