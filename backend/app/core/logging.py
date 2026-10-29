"""Logging configuration."""
from __future__ import annotations

import logging
import sys


def setup_logging(level: str = "info") -> None:
    log_level = getattr(logging, level.upper(), logging.INFO)
    fmt = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    logging.basicConfig(
        level=log_level,
        format=fmt,
        handlers=[logging.StreamHandler(sys.stdout)],
    )
    # Quiet noisy third-party loggers
    for noisy in ("multipart", "PIL", "imageio", "moviepy"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
