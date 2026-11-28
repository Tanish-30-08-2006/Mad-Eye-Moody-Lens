# Telegram bot: lightweight forensic scorer + API client; no PyTorch/GPU, minimal memory footprint.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /bot
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY mml_bot ./mml_bot

RUN useradd --create-home --uid 10002 bot
USER bot
CMD ["python", "-m", "mml_bot.bot"]
