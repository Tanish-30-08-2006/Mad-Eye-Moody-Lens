"""Per-user throttling inside the bot.

All Telegram users reach the API from the bot's single address (or its one API key), so the
API's own per-client limit would let one busy user starve everyone else. This sliding window
keeps it fair. State is in memory and holds only the numeric Telegram user id plus
timestamps for at most ``window_s`` seconds; nothing is persisted.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque


class UserLimiter:
    def __init__(self, per_window: int, window_s: float = 60.0) -> None:
        self.per_window = per_window
        self.window_s = window_s
        self._hits: dict[int, deque[float]] = defaultdict(deque)
        self._videos: set[int] = set()

    def allow(self, user_id: int, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        hits = self._hits[user_id]
        while hits and now - hits[0] >= self.window_s:
            hits.popleft()
        if len(hits) >= self.per_window:
            return False
        hits.append(now)
        return True

    def begin_video(self, user_id: int) -> bool:
        """One video job per user at a time (each holds a CPU worker for up to minutes)."""
        if user_id in self._videos:
            return False
        self._videos.add(user_id)
        return True

    def end_video(self, user_id: int) -> None:
        self._videos.discard(user_id)

    def prune(self, now: float | None = None) -> None:
        """Drop idle users so memory does not grow with every user ever seen."""
        now = time.monotonic() if now is None else now
        for uid in [u for u, h in self._hits.items() if not h or now - h[-1] >= self.window_s]:
            del self._hits[uid]
