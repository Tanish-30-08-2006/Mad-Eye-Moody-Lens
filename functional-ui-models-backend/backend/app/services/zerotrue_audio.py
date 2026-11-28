"""Forward a validated audio upload to ZeroTrue's fixed file endpoint."""

import requests

from app.core.errors import AnalysisError
from app.core.uploads import SavedUpload

ENDPOINT = "https://api.zerotrue.app/api/v1/analyze/file"
EXTENSIONS = {
    "audio/x-wav": "wav", "audio/wav": "wav", "audio/mpeg": "mp3", "audio/x-flac": "flac",
    "audio/flac": "flac", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "video/mp4": "m4a",
}


def analyze(saved: SavedUpload, api_key: str) -> dict:
    try:
        with open(saved.path, "rb") as audio:
            response = requests.post(
                ENDPOINT,
                headers={"Authorization": f"Bearer {api_key}"},
                data={"api_key": api_key, "is_private_scan": "false", "is_deep_scan": "false"},
                files={"file": (f"audio-upload.{EXTENSIONS.get(saved.mime, 'bin')}", audio, saved.mime)},
                timeout=(10, 60),
                allow_redirects=False,
            )
    except requests.Timeout as exc:
        raise AnalysisError("ZeroTrue timed out. Please try again.", 504) from exc
    except requests.RequestException as exc:
        raise AnalysisError("Could not reach ZeroTrue. Check the server's internet connection.", 502) from exc

    if response.status_code in (401, 403):
        raise AnalysisError("ZeroTrue rejected the API key. Check the key and try again.", 401)
    if response.status_code == 429:
        raise AnalysisError("ZeroTrue rate limit reached. Please try again later.", 429)
    if not 200 <= response.status_code < 300:
        raise AnalysisError(f"ZeroTrue returned HTTP {response.status_code}.", 502)
    try:
        payload = response.json()
    except ValueError as exc:
        raise AnalysisError("ZeroTrue returned an invalid response.", 502) from exc
    if not isinstance(payload, dict):
        raise AnalysisError("ZeroTrue returned an invalid response.", 502)
    return payload
