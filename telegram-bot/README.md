# 👁️ Mad-Eye Moody Lens: Deepfake Detection Telegram Bot & API

A standalone, production-ready Telegram Chatbot and FastAPI microservice to detect AI-generated and deepfake images.

---

## 🌟 Features

* **Telegram Interface**:
  * Seamless image analysis by sending or forwarding photos.
  * Supports high-resolution uncompressed image files (documents).
  * Real-time typing indicators.
  * Formatted verdict, confidence percentage, latency, and visual emoji risk gauge (`[🟥🟥🟩🟩...]`).
* **Modular FastAPI Service**:
  * **Hugging Face Mode (`hf`)**: Uses pretrained state-of-the-art vision models (`Organika/sdxl-detector`).
  * **Custom Checkpoint Mode (`custom_pt`)**: Loads your custom CIFAKE PyTorch model (`cifake_resnet18.pt`).
  * **Stub Mode (`stub`)**: Lightweight simulation mode for testing bot flows without downloading weights.

---

## 🚀 Quick Start Guide

### 1. Prerequisites & Virtual Environment

From the `telegram-bot` directory:

```bash
cd telegram-bot
python -m venv .venv

# On Windows (PowerShell):
.venv\Scripts\Activate.ps1

# On Linux / macOS:
source .venv/bin/activate

pip install -r requirements.txt
```

---

### 2. Configure Environment (`.env`)

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env`:
1. **Telegram Token**: Talk to [@BotFather](https://t.me/BotFather) on Telegram, create a new bot using `/newbot`, and paste the token into `TELEGRAM_BOT_TOKEN`.
2. **Model Backend**:
   * Set `MODEL_BACKEND="hf"` to use Hugging Face (`Organika/sdxl-detector`).
   * Set `MODEL_BACKEND="custom_pt"` if you have a `cifake_resnet18.pt` file in the folder.
   * Set `MODEL_BACKEND="stub"` to test immediately without loading models.

---

### 3. Start the API Service

In your first terminal:

```bash
# From telegram-bot directory:
uvicorn app.api:app --host 0.0.0.0 --port 8000 --reload
```

* API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)
* Health Check: [http://localhost:8000/health](http://localhost:8000/health)

---

### 4. Start the Telegram Bot

In your second terminal:

```bash
# From telegram-bot directory:
python -m app.bot
```

Open Telegram, go to your bot, and send `/start`! Send any picture to see the instant detection result.

---

## 📡 API Endpoint Reference

### `POST /predict`
* **Content-Type**: `multipart/form-data`
* **Form Field**: `file` (Image upload)

**Response:**
```json
{
  "verdict": "FAKE",
  "fake_probability": 0.9421,
  "confidence": 94.21,
  "model": "Organika/sdxl-detector",
  "latency_ms": 112,
  "details": {
    "fake": 0.9421,
    "real": 0.0579
  }
}
```

---

## 📤 Pushing to Your Branch (`bhavya-dev`)

To stage, commit, and push these changes to GitHub:

```bash
git status
git add telegram-bot
git commit -m "Add deepfake detection FastAPI service and Telegram bot"
git push origin bhavya-dev
```

