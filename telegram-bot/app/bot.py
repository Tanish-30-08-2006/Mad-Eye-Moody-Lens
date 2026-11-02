"""Telegram Chatbot for Deepfake Image Detection.

Connects to the FastAPI backend service to classify uploaded images.
"""

from __future__ import annotations

import io
import os
import sys
from dotenv import load_dotenv
import httpx
from telegram import Update
from telegram.constants import ChatAction, ParseMode
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

load_dotenv()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
API_URL = os.getenv("DETECTOR_API_URL", "http://localhost:8000/predict")
HEALTH_URL = os.getenv("DETECTOR_HEALTH_URL", "http://localhost:8000/health")


def build_gauge(fake_prob: float, total_blocks: int = 10) -> str:
    """Build an emoji-based visual gauge for fake likelihood."""
    red_count = int(round(fake_prob * total_blocks))
    green_count = total_blocks - red_count
    return ("🟥" * red_count) + ("🟩" * green_count)


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_first_name = update.effective_user.first_name if update.effective_user else "there"
    text = (
        f"👋 *Hello {user_first_name}! Welcome to the Deepfake Lens Bot.*\n\n"
        "I can help you determine whether an image is an *authentic photograph* or an *AI-generated / manipulated deepfake*.\n\n"
        "📸 *How to use:*\n"
        "• Send me any picture (as a normal photo or uncompressed file)\n"
        "• I will analyze the pixels and return a confidence score\n\n"
        "Commands:\n"
        "/status - Check detection service connectivity\n"
        "/help - Get instructions and usage details"
    )
    await update.message.reply_text(text, parse_mode=ParseMode.MARKDOWN)


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = (
        "🔍 *Mad-Eye Moody Lens Bot Help*\n\n"
        "1. **Sending Photos:** You can drag & drop, attach, or forward any image to this chat.\n"
        "2. **Compressed vs. Original:** Sending images as 'File/Document' preserves original resolution and avoids Telegram compression.\n"
        "3. **What is checked:** The neural network inspects synthetic generation signatures, diffusion patterns, and structural anomalies.\n\n"
        "⚠️ *Disclaimer:* Probabilistic predictions should be used as assistive screening, not absolute legal proof."
    )
    await update.message.reply_text(text, parse_mode=ParseMode.MARKDOWN)


async def status_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action=ChatAction.TYPING)
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(HEALTH_URL)
        if resp.status_code == 200:
            data = resp.json()
            msg = (
                "🟢 *Detection Service Online*\n\n"
                f"• Model: `{data.get('model', 'unknown')}`\n"
                f"• Backend: `{data.get('backend', 'unknown')}`\n"
                f"• Device: `{data.get('device', 'cpu')}`"
            )
        else:
            msg = f"🟡 *Detection Service returned HTTP {resp.status_code}*"
    except Exception as exc:
        msg = f"🔴 *Detection Service Unreachable*\n`{str(exc)}`\nPlease ensure the FastAPI server is running."
    
    await update.message.reply_text(msg, parse_mode=ParseMode.MARKDOWN)


async def handle_image(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = update.message
    if not msg:
        return

    # Extract file object
    if msg.photo:
        # Highest resolution photo is last in the list
        photo_item = msg.photo[-1]
        file_obj = await photo_item.get_file()
        file_name = "photo.jpg"
        mime_type = "image/jpeg"
    elif msg.document and msg.document.mime_type and msg.document.mime_type.startswith("image/"):
        file_obj = await msg.document.get_file()
        file_name = msg.document.file_name or "document.jpg"
        mime_type = msg.document.mime_type
    else:
        await msg.reply_text("Please upload an image (JPG, PNG, WEBP).")
        return

    # Notify user that processing has started
    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action=ChatAction.TYPING)
    status_msg = await msg.reply_text("🔎 *Analyzing image...*", parse_mode=ParseMode.MARKDOWN)

    # Download image into memory buffer
    buffer = io.BytesIO()
    await file_obj.download_to_memory(out=buffer)
    buffer.seek(0)

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            files = {"file": (file_name, buffer.getvalue(), mime_type)}
            response = await client.post(API_URL, files=files)

        if response.status_code != 200:
            err_detail = response.json().get("detail", response.text) if response.text else "Unknown error"
            await status_msg.edit_text(f"❌ *Analysis failed:* {err_detail}", parse_mode=ParseMode.MARKDOWN)
            return

        result = response.json()
        verdict = result.get("verdict", "UNKNOWN")
        fake_prob = float(result.get("fake_probability", 0.0))
        confidence = float(result.get("confidence", 0.0))
        model_name = result.get("model", "Detector")
        latency = result.get("latency_ms", 0)

        gauge = build_gauge(fake_prob)

        if verdict == "FAKE":
            reply_body = (
                "🚨 *VERDICT: AI-GENERATED / DEEPFAKE*\n\n"
                f"• *Confidence:* `{confidence:.1f}%`\n"
                f"• *P(Fake):* `{fake_prob:.4f}`\n\n"
                f"**Risk Gauge:**\n`[{gauge}]`\n"
                f"_(0.0 = Authentic 🟩 ... 1.0 = Synthetic 🟥)_\n\n"
                f"⚙️ Model: `{model_name}` | ⏱️ `{latency} ms`\n\n"
                "⚠️ *High probability of synthetic manipulation or diffusion generation.*"
            )
        else:
            reply_body = (
                "✅ *VERDICT: REAL / AUTHENTIC PHOTOGRAPH*\n\n"
                f"• *Confidence:* `{confidence:.1f}%`\n"
                f"• *P(Fake):* `{fake_prob:.4f}`\n\n"
                f"**Risk Gauge:**\n`[{gauge}]`\n"
                f"_(0.0 = Authentic 🟩 ... 1.0 = Synthetic 🟥)_\n\n"
                f"⚙️ Model: `{model_name}` | ⏱️ `{latency} ms`\n\n"
                "✨ *No strong synthetic generation artifacts detected.*"
            )

        await status_msg.edit_text(reply_body, parse_mode=ParseMode.MARKDOWN)

    except httpx.ConnectError:
        await status_msg.edit_text(
            "🔴 *Cannot reach API backend!*\n"
            f"Failed to connect to `{API_URL}`.\n"
            "Please ensure the API service is running on your server or local machine.",
            parse_mode=ParseMode.MARKDOWN,
        )
    except httpx.TimeoutException:
        await status_msg.edit_text("⏳ *Request timed out.* The model took too long to process.", parse_mode=ParseMode.MARKDOWN)
    except Exception as exc:
        await status_msg.edit_text(f"❌ *An unexpected error occurred:* `{str(exc)}`", parse_mode=ParseMode.MARKDOWN)


def main() -> None:
    if not BOT_TOKEN or BOT_TOKEN.startswith("YOUR_"):
        print("ERROR: TELEGRAM_BOT_TOKEN is not set.")
        print("Please set TELEGRAM_BOT_TOKEN in telegram-bot/.env or your environment variables.")
        sys.exit(1)

    app = ApplicationBuilder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("status", status_command))
    app.add_handler(MessageHandler(filters.PHOTO | filters.Document.IMAGE, handle_image))

    print(f"Mad-Eye Moody Lens Telegram Bot is running!")
    print(f"Connected API: {API_URL}")
    app.run_polling()


if __name__ == "__main__":
    main()

