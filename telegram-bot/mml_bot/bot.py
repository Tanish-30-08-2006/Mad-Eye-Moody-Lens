"""Mad-Eye Moody Lens Telegram bot: a thin client of the shared backend API.

Photos and image files go to /analyze/image, voice notes and audio to /analyze/audio, and
videos to /analyze/video (202 + polling /jobs/{id}). No model runs here.

Run:  python -m mml_bot.bot   (needs TELEGRAM_BOT_TOKEN and a reachable MML_API_BASE_URL)

Privacy (CLAUDE.md): files are downloaded into memory, forwarded under a generic name and
dropped; the bot stores nothing and logs no content, file names, chat ids or user names.
"""

from __future__ import annotations

import logging
import time
from html import escape
from typing import Any

from telegram import BotCommand, InlineKeyboardButton, InlineKeyboardMarkup, InputFile, Message, Update
from telegram.constants import ChatAction, ChatType, ParseMode
from telegram.error import BadRequest, TelegramError
from telegram.ext import (
    Application,
    ApplicationBuilder,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from mml_bot.client import ApiError, MoodyLensClient
from mml_bot.config import BotSettings, load_settings
from mml_bot.format import format_progress, format_result, format_status
from mml_bot.limits import UserLimiter
from mml_bot.reports import REPORT_FILENAME, REPORT_PREFIX, report_analysis_id, report_button_data, scan_report_json

log = logging.getLogger("mml.telegram")

EDIT_EVERY_S = 4.0  # progress edits: well under Telegram's per-chat flood limits

HELP = (
    "🔍 <b>Mad-Eye Moody Lens</b> estimates whether media is AI-generated or manipulated.\n\n"
    "Send me:\n"
    "• a <b>photo</b> or image file: AI-generated image check, plus a face check if a face is found\n"
    "• a <b>voice note</b> or audio file: synthetic speech check, in 4-second windows\n"
    "• a <b>video</b>: face check on 24 sampled frames, plus the soundtrack\n\n"
    "Tip: send photos <i>as a file</i> to skip Telegram's compression.\n"
    "Telegram lets bots download files up to {max_mb} MB.\n\n"
    "In a direct chat, tap <b>Download scan report</b> on a completed result to save the evidence as JSON.\n\n"
    "/status: is the detection service ready?\n"
    "/privacy: what happens to your files\n\n"
    "<i>Results are probabilistic estimates from pretrained models, not forensic proof.</i>"
)

PRIVACY = (
    "🔒 <b>Privacy</b>\n\n"
    "• This bot does not save your files. Each file is sent to the Mad-Eye Moody Lens server, "
    "analysed, and deleted there as soon as the analysis ends.\n"
    "• The server keeps the scores (never the media) for 7 days, then deletes them.\n"
    "• Your name and file names are never sent to the server or logged."
)


# --------------------------------------------------------------------- helpers
def pick_media(message: Message) -> tuple[str, Any] | None:
    """(kind, telegram media object) for the largest usable attachment, or None."""
    if message.photo:
        return "image", message.photo[-1]  # last = highest resolution
    if message.voice:
        return "audio", message.voice
    if message.audio:
        return "audio", message.audio
    if message.video:
        return "video", message.video
    if message.video_note:
        return "video", message.video_note
    if message.animation:  # GIFs arrive as silent MP4 animations (also set .document)
        return "video", message.animation
    doc = message.document
    if doc is not None:
        mime = (doc.mime_type or "").lower()
        for prefix, kind in (("image/", "image"), ("audio/", "audio"), ("video/", "video")):
            if mime.startswith(prefix):
                return kind, doc
    return None


def _settings(context: ContextTypes.DEFAULT_TYPE) -> BotSettings:
    return context.application.bot_data["settings"]


def _client(context: ContextTypes.DEFAULT_TYPE) -> MoodyLensClient:
    return context.application.bot_data["client"]


def _limiter(context: ContextTypes.DEFAULT_TYPE) -> UserLimiter:
    return context.application.bot_data["limiter"]


def _allowed(update: Update, settings: BotSettings) -> bool:
    chat = update.effective_chat
    return not settings.allowed_chat_ids or (chat is not None and chat.id in settings.allowed_chat_ids)


async def _reply(message: Message, text: str, *, reply_markup: InlineKeyboardMarkup | None = None) -> Message:
    return await message.reply_text(
        text, parse_mode=ParseMode.HTML, disable_web_page_preview=True, reply_markup=reply_markup
    )


def _api_error_text(exc: ApiError) -> str:
    text = f"⚠️ {escape(exc.message)}"  # the API's plain-language message, shown verbatim
    if exc.retry_after:
        text += f"\nTry again in <code>{exc.retry_after} s</code>."
    return text


def _report_markup(
    result: dict[str, Any], message: Message, settings: BotSettings, user_id: int
) -> InlineKeyboardMarkup | None:
    # The API uses the analysis ID to retrieve stored evidence. Keep that ID
    # out of Telegram group markup, where it would be visible to other members.
    if message.chat.type != ChatType.PRIVATE:
        return None
    data = report_button_data(result.get("analysis_id"), token=settings.token, chat_id=message.chat_id, user_id=user_id)
    return InlineKeyboardMarkup([[InlineKeyboardButton("Download scan report", callback_data=data)]]) if data else None


async def on_report_download(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if query is None:
        return
    message = query.message
    settings = _settings(context)
    try:
        if not isinstance(message, Message) or message.chat.type != ChatType.PRIVATE or not _allowed(update, settings):
            await query.answer("Open the scan in its original direct chat to download the report.", show_alert=True)
            return
        analysis_id = report_analysis_id(
            query.data, token=settings.token, chat_id=message.chat_id, user_id=query.from_user.id
        )
        if analysis_id is None:
            await query.answer("This report button belongs to the original scan and sender.", show_alert=True)
            return
        await query.answer()
    except TelegramError:
        return  # Telegram can expire an unanswered callback before it reaches the bot.

    try:
        result = await _client(context).get_analysis(analysis_id)
        await message.reply_document(InputFile(scan_report_json(result), filename=REPORT_FILENAME), do_quote=True)
    except ApiError as exc:
        if exc.status == 404:
            text = "This scan report is unavailable. Send the media again to create a new report."
        elif exc.status == 429 and exc.retry_after:
            text = f"The report service is busy. Try again in {exc.retry_after} seconds."
        else:
            text = "The report service is temporarily unavailable. Tap Download scan report to try again."
    except TelegramError:
        text = "Telegram could not send the report. Tap Download scan report to try again."
    else:
        return
    await _reply(message, text)


# -------------------------------------------------------------------- commands
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_message is None:
        return
    name = escape(update.effective_user.first_name) if update.effective_user else "there"
    await _reply(
        update.effective_message,
        f"👋 Hello {name}!\n\n" + HELP.format(max_mb=_settings(context).max_download_mb),
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_message is not None:
        await _reply(update.effective_message, HELP.format(max_mb=_settings(context).max_download_mb))


async def cmd_privacy(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_message is not None:
        await _reply(update.effective_message, PRIVACY)


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.effective_message
    if message is None:
        return
    client = _client(context)
    try:
        ready, body = await client.ready()
        models = await client.models()
    except ApiError as exc:
        await _reply(message, f"🔴 <b>Detection service unreachable</b>\n{escape(exc.message)}")
        return
    await _reply(message, format_status(ready, body, models))


# ----------------------------------------------------------------------- media
async def on_media(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message, user = update.effective_message, update.effective_user
    if message is None or user is None:
        return
    settings, limiter = _settings(context), _limiter(context)
    if not _allowed(update, settings):
        await _reply(message, "This bot is private.")
        return

    picked = pick_media(message)
    if picked is None:
        await _reply(message, "Please send a photo, an image, a voice note, an audio file or a video.")
        return
    kind, media = picked

    size = getattr(media, "file_size", None)
    if size and size > settings.max_download_mb * 1024 * 1024:
        await _reply(message, f"⚠️ Telegram only lets bots download files up to {settings.max_download_mb} MB.")
        return
    if not limiter.allow(user.id):
        await _reply(message, "⏳ You are sending files quickly. Please wait a minute and try again.")
        return
    if kind == "video" and not limiter.begin_video(user.id):
        await _reply(message, "⏳ Your previous video is still being analysed. Please wait for its result.")
        return

    log.info("analysis_requested kind=%s", kind)
    try:
        await context.bot.send_chat_action(message.chat_id, ChatAction.TYPING)
        tg_file = await media.get_file()
        data = bytes(await tg_file.download_as_bytearray())
        if kind == "video":
            await _run_video(message, context, data, user.id)
        else:
            result = await _client(context).analyze(kind, data)
            await _reply(message, format_result(result), reply_markup=_report_markup(result, message, settings, user.id))
        log.info("analysis_done kind=%s", kind)
    except ApiError as exc:
        log.info("analysis_refused kind=%s status=%s", kind, exc.status)
        await _reply(message, _api_error_text(exc))
    except BadRequest as exc:
        if "too big" in str(exc).lower():
            await _reply(message, f"⚠️ Telegram only lets bots download files up to {settings.max_download_mb} MB.")
        else:
            raise
    finally:
        if kind == "video":
            limiter.end_video(user.id)
        limiter.prune()


async def _run_video(message: Message, context: ContextTypes.DEFAULT_TYPE, data: bytes, user_id: int) -> None:
    client, settings = _client(context), _settings(context)
    status = await _reply(message, "🎞️ Uploading the video…")
    job = await client.start_video(data)
    shown_text, shown_at = "", 0.0

    async def on_progress(job: dict[str, Any]) -> None:
        nonlocal shown_text, shown_at
        text = format_progress(job)
        now = time.monotonic()
        if text != shown_text and now - shown_at >= EDIT_EVERY_S:
            shown_text, shown_at = text, now
            try:
                await status.edit_text(text, parse_mode=ParseMode.HTML)
            except TelegramError:
                pass  # a skipped progress edit is harmless

    try:
        result = await client.wait_for_video(job["job_id"], timeout_s=settings.video_timeout_s, on_progress=on_progress)
    except ApiError as exc:
        await status.edit_text(_api_error_text(exc), parse_mode=ParseMode.HTML)
        return
    await status.edit_text(
        format_result(result), parse_mode=ParseMode.HTML, reply_markup=_report_markup(result, message, settings, user_id)
    )


async def on_error(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    # Type only: exception text can carry file ids or URLs.
    log.error("handler_error type=%s", type(context.error).__name__, exc_info=context.error)
    if isinstance(update, Update) and update.effective_message is not None:
        try:
            await _reply(update.effective_message, "⚠️ Something went wrong while analysing this file.")
        except TelegramError:
            pass


# ------------------------------------------------------------------- lifecycle
async def _post_init(app: Application) -> None:
    settings: BotSettings = app.bot_data["settings"]
    app.bot_data["client"] = MoodyLensClient(settings.api_base_url, settings.api_key)
    app.bot_data["limiter"] = UserLimiter(settings.requests_per_min)
    await app.bot.set_my_commands(
        [
            BotCommand("start", "What this bot does"),
            BotCommand("help", "How to use it"),
            BotCommand("status", "Is the detection service ready?"),
            BotCommand("privacy", "What happens to your files"),
        ]
    )


async def _post_shutdown(app: Application) -> None:
    client: MoodyLensClient | None = app.bot_data.get("client")
    if client is not None:
        await client.aclose()


def build_application(settings: BotSettings) -> Application:
    app = (
        ApplicationBuilder()
        .token(settings.token)
        .concurrent_updates(8)  # a long video poll must not block other users
        .post_init(_post_init)
        .post_shutdown(_post_shutdown)
        .build()
    )
    app.bot_data["settings"] = settings
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("privacy", cmd_privacy))
    app.add_handler(CallbackQueryHandler(on_report_download, pattern=f"^{REPORT_PREFIX}"))
    media = (
        filters.PHOTO
        | filters.VOICE
        | filters.AUDIO
        | filters.VIDEO
        | filters.VIDEO_NOTE
        | filters.ANIMATION
        | filters.Document.ALL
    )
    app.add_handler(MessageHandler(media, on_media))
    app.add_error_handler(on_error)
    return app


def main() -> None:
    logging.basicConfig(format="%(asctime)s %(levelname)s %(name)s %(message)s", level=logging.INFO)
    # httpx logs every request URL at INFO, and Telegram URLs contain the bot token.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    settings = load_settings()
    log.info("bot_start api=%s", settings.api_base_url)
    build_application(settings).run_polling(allowed_updates=["message", "callback_query"])


if __name__ == "__main__":
    main()
