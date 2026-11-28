import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

from app.api import routes
from app.core.errors import AnalysisError
from app.core.uploads import SavedUpload
from app.services import zerotrue_audio


class ZeroTrueAudioTests(unittest.TestCase):
    def test_sends_audio_to_fixed_endpoint_without_following_redirects(self):
        with tempfile.TemporaryDirectory() as directory:
            audio = Path(directory) / "clip"
            audio.write_bytes(b"audio")
            saved = SavedUpload(str(audio), "audio", "audio/wav", 5)
            response = Mock(status_code=200)
            response.json.return_value = {"result": {"ai_probability": 0.2}}

            def post(url, **kwargs):
                self.assertEqual(url, zerotrue_audio.ENDPOINT)
                self.assertFalse(kwargs["allow_redirects"])
                self.assertEqual(kwargs["files"]["file"][0], "audio-upload.wav")
                self.assertEqual(kwargs["files"]["file"][1].read(), b"audio")
                return response

            with patch.object(zerotrue_audio.requests, "post", side_effect=post):
                self.assertEqual(zerotrue_audio.analyze(saved, "secret")["result"]["ai_probability"], 0.2)

    def test_provider_errors_do_not_expose_key(self):
        with tempfile.TemporaryDirectory() as directory:
            audio = Path(directory) / "clip"
            audio.write_bytes(b"audio")
            saved = SavedUpload(str(audio), "audio", "audio/wav", 5)
            with patch.object(zerotrue_audio.requests, "post", return_value=Mock(status_code=401)):
                with self.assertRaisesRegex(AnalysisError, "rejected the API key") as error:
                    zerotrue_audio.analyze(saved, "secret")
            self.assertNotIn("secret", str(error.exception))


class ZeroTrueRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_temporary_audio_is_removed_even_when_provider_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            audio = Path(directory) / "clip"
            audio.write_bytes(b"audio")
            saved = SavedUpload(str(audio), "audio", "audio/wav", 5)

            async def run_inline(function, *args):
                if function is zerotrue_audio.analyze:
                    raise AnalysisError("Provider unavailable", 502)
                return None

            with patch.object(routes, "run_in_threadpool", side_effect=run_inline), \
                 patch.object(routes, "save_upload", new=AsyncMock(return_value=saved)):
                with self.assertRaises(AnalysisError):
                    await routes.analyze_audio_zerotrue(Mock(), Mock(), "secret")
            self.assertFalse(audio.exists())
