# 🏛️ Mad-Eye Moody Lens — Telegram Bot & Detection Microservice Architecture

## 1. Executive Summary
The **Mad-Eye Moody Lens Telegram Bot** provides an accessible, mobile-first screening interface for detecting AI-generated synthetic imagery and deepfakes. It operates as a decoupled microservice architecture consisting of:
1. An **Asynchronous Telegram Bot Client** (`app/bot.py`) handling conversational interactions, user media ingestion, and visual risk reporting.
2. A **High-Performance FastAPI REST API** (`app/api.py`) exposing standardized `/health` and `/predict` endpoints.
3. A **Pluggable Detection Engine** (`app/detector.py`) supporting Hugging Face Vision Transformers (`Organika/sdxl-detector`), custom PyTorch ResNet-18 checkpoints (`cifake_resnet18.pt`), and simulated test harnesses.

---

## 2. System Architecture

```
                    +------------------------------------+
                    |        End User (Telegram)         |
                    +-----------------+------------------+
                                      |
                         Photos &     |  Risk Verdicts &
                         Documents    |  Visual Gauges
                                      v
                    +-----------------+------------------+
                    |       Telegram Bot Client          |
                    |           (app/bot.py)             |
                    +-----------------+------------------+
                                      |
                                      | HTTP POST /predict
                                      v
                    +-----------------+------------------+
                    |      FastAPI Microservice          |
                    |           (app/api.py)             |
                    +-----------------+------------------+
                                      |
                                      | Image Tensor
                                      v
                    +-----------------+------------------+
                    |        Detection Engine            |
                    |        (app/detector.py)           |
                    +-----------------+------------------+
                                      |
              +-----------------------+-----------------------+
              |                       |                       |
              v                       v                       v
     [Hugging Face SDXL]      [Custom ResNet-18]        [Mock Stub]
    (Organika/sdxl-detector)  (CIFAKE Checkpoint)     (Testing Harness)
```

---

## 3. Sequence Flow

```
User               Telegram Client          FastAPI Backend       Detection Engine
 |                        |                        |                     |
 |--- Send Photo -------->|                        |                     |
 |                        |--- Download File ----->|                     |
 |<-- Typing Action ------|                        |                     |
 |                        |--- POST /predict ----->|                     |
 |                        |    (multipart/form)    |--- Ingest Pillow -->|
 |                        |                        |    Image & Transform|
 |                        |                        |<-- Verdict & Prob---|
 |                        |<-- JSON Response ------|                     |
 |                             (verdict, score, latency)                 |
 |<-- Formatted Report ---|                                              |
      with Emoji Gauge    |                                              |
```

---

## 4. Key Architectural Decisions

### 4.1 Decoupled Microservice Design
* **Why**: Separating the Telegram polling client from the ML inference worker ensures that Telegram API updates, network drops, or rate limits do not disrupt model serving.
* **Extensibility**: The FastAPI service (`/predict`) can simultaneously serve browser extensions, Discord bots, and web frontends.

### 4.2 Document & Uncompressed Photo Handling
* Telegram applies aggressive compression to standard photos (typically resizing to max 1280px and applying JPEG compression).
* The bot explicitly detects and handles both compressed **Photos** and uncompressed **Documents/Files**, allowing users to upload lossless camera originals for maximum deepfake detection fidelity.

### 4.3 Pluggable Model Factory
* Allows seamless runtime switching between `MODEL_BACKEND="hf"` (pre-trained state-of-the-art vision models) and `MODEL_BACKEND="custom_pt"` (domain-specific CIFAKE ResNet-18 models) without rewriting endpoint logic.

---

## 5. Automated Verification & Testing
The service includes an automated unit test suite (`tests/`):
* `tests/test_detector.py`: Tests label heuristics, confidence bounds, and stub generation.
* `tests/test_api.py`: Validates FastAPI route bindings, response schemas, and health metrics.
* `tests/test_bot.py`: Tests dynamic UI gauge formatting and emoji rendering.

Run test suite:
```bash
python run_tests.py
```
