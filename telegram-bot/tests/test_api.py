"""Unit tests for FastAPI detection API service configuration."""

import unittest
from fastapi import FastAPI
import app.api as api
from app.detector import StubDetector


class TestDetectionAPI(unittest.TestCase):
    def setUp(self):
        api.detector = StubDetector(device="cpu")

    def test_app_instance(self):
        self.assertIsInstance(api.app, FastAPI)
        self.assertEqual(api.app.title, "Mad-Eye Moody Lens Deepfake Detector API")

    def test_routes_registered(self):
        routes = [route.path for route in api.app.routes]
        self.assertIn("/health", routes)
        self.assertIn("/predict", routes)

    def test_health_endpoint(self):
        result = api.health()
        self.assertEqual(result.get("status"), "ok")
        self.assertIn("backend", result)
        self.assertIn("device", result)


if __name__ == "__main__":
    unittest.main()
