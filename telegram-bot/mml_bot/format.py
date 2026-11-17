"""Turn API results into Telegram messages (HTML parse mode).

HTML, not Markdown: every dynamic value is escaped, so a model id or an API message can never
break the formatting (Telegram rejects the whole message on a Markdown parse error).
Verdicts are shown with colour + shape + text, like the web app.
"""

from __future__ import annotations

from html import escape
from typing import Any

VERDICTS = {
    "likely_real": ("🟢", "Likely real"),
    "uncertain": ("🟡", "Uncertain"),
    "likely_fake": ("🔴", "Likely AI-generated or manipulated"),
}

TASKS = {
    "ai_generated_image": "AI-generated image",
    "face_manipulation": "Face manipulation",
    "synthetic_speech": "Synthetic speech",
}

STAGES = {
    "queued": "Waiting for a free worker…",
    "frames": "Checking faces in the video frames…",
    "audio": "Checking the soundtrack for synthetic speech…",
    "finalising": "Finishing up…",
}


def pct(p: float) -> str:
    return f"{round(p * 100)}%"


def gauge(p: float, blocks: int = 10) -> str:
    """Ten squares: red share = fake probability."""
    red = max(0, min(blocks, round(p * blocks)))
    return "🟥" * red + "⬜" * (blocks - red)


def _detail_lines(result: dict[str, Any]) -> list[str]:
    d = result.get("details") or {}
    kind = result.get("media_type")
    lines: list[str] = []
    if kind == "image" and "faces_found" in d:
        lines.append(f"Faces found: <code>{int(d['faces_found'])}</code>")
    if kind == "audio" and "duration_s" in d:
        lines.append(f"Duration: <code>{float(d['duration_s']):.1f} s</code>")
    if kind == "video":
        if "frames_sampled" in d:
            lines.append(
                f"Frames with a face: <code>{int(d.get('frames_with_face', 0))}/{int(d['frames_sampled'])}</code>"
            )
        if "fraction_flagged" in d:
            lines.append(f"Frames flagged: <code>{pct(float(d['fraction_flagged']))}</code>")
        # Contract: key absent = no usable audio track; False = the audio check failed.
        if "audio_checked" not in d:
            lines.append("Soundtrack: <i>none (or silent), not checked</i>")
        elif d["audio_checked"] is False:
            lines.append("Soundtrack: <i>could not be checked</i>")
    segments = result.get("segments") or []
    if kind == "audio" and segments:
        top = max(segments, key=lambda s: s["fake_probability"])
        lines.append(
            f"Most suspicious window: <code>{top['start']:.1f}–{top['end']:.1f} s</code> "
            f"(<code>{pct(top['fake_probability'])}</code>)"
        )
    return lines


def format_result(result: dict[str, Any]) -> str:
    icon, label = VERDICTS.get(result.get("verdict", ""), ("⚪", "No verdict"))
    p = float(result.get("fake_probability", 0.0))
    out = [
        f"{icon} <b>{escape(label)}</b>",
        f"Fake probability: <code>{pct(p)}</code>",
        gauge(p),
        "",
        "<b>Checks</b>",
    ]
    for score in result.get("scores") or []:
        task = TASKS.get(score.get("task", ""), escape(str(score.get("task", ""))))
        out.append(
            f"• {task}: <code>{pct(float(score['fake_probability']))}</code> "
            f"<i>({escape(str(score.get('model', '')))})</i>"
        )
    details = _detail_lines(result)
    if details:
        out += ["", *details]
    if result.get("explanation_available"):
        out.append("Face heatmaps are available in the web app for this analysis.")
    out += ["", f"<i>{escape(str(result.get('disclaimer', '')))}</i>"]
    return "\n".join(out)


def format_progress(job: dict[str, Any]) -> str:
    stage = job.get("stage") or job.get("status") or "queued"
    text = STAGES.get(stage, "Analysing the video…")
    if stage == "frames":
        text += f" <code>{pct(float(job.get('progress', 0.0)))}</code>"
    return f"🎞️ {text}"


def format_status(ready: bool, body: dict[str, Any], models: list[dict[str, Any]]) -> str:
    head = "🟢 <b>Detection service ready</b>" if ready else "🟡 <b>Detection service not ready yet</b>"
    lines = [head]
    queues = (body.get("checks") or {}).get("workers") or {}
    if queues:
        lines.append("Workers: " + ", ".join(f"<code>{escape(q)}</code> × {int(n)}" for q, n in sorted(queues.items())))
    for m in models:
        mark = "✅" if m.get("loaded") else "⏳"
        lines.append(f"{mark} {escape(str(m.get('key', '')))}: <code>{escape(str(m.get('name', '')))}</code>")
    return "\n".join(lines)
