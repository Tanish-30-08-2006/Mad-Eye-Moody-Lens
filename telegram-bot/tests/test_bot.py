"""Unit tests for Telegram bot formatting and helpers."""

import unittest
from app.bot import build_gauge


class TestBotFormatting(unittest.TestCase):
    def test_gauge_full_fake(self):
        gauge = build_gauge(1.0, 10)
        self.assertEqual(gauge, "🟥" * 10)

    def test_gauge_full_real(self):
        gauge = build_gauge(0.0, 10)
        self.assertEqual(gauge, "🟩" * 10)

    def test_gauge_half(self):
        gauge = build_gauge(0.5, 10)
        self.assertEqual(gauge, "🟥" * 5 + "🟩" * 5)

    def test_gauge_rounding(self):
        gauge = build_gauge(0.88, 10)
        self.assertEqual(gauge, "🟥" * 9 + "🟩" * 1)


if __name__ == "__main__":
    unittest.main()
