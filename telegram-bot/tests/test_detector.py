"""Unit tests for detection engine and utilities."""

import unittest
from PIL import Image
from app.detector import StubDetector, label_is_fake, get_detector


class TestDetectorLabels(unittest.TestCase):
    def test_label_is_fake_positive(self):
        self.assertTrue(label_is_fake("fake"))
        self.assertTrue(label_is_fake("deepfake"))
        self.assertTrue(label_is_fake("synthetic"))
        self.assertTrue(label_is_fake("ai_generated"))
        self.assertTrue(label_is_fake("manipulated"))

    def test_label_is_fake_negative(self):
        self.assertFalse(label_is_fake("real"))
        self.assertFalse(label_is_fake("authentic"))
        self.assertFalse(label_is_fake("human"))
        self.assertFalse(label_is_fake("genuine"))
        self.assertFalse(label_is_fake("original"))


class TestStubDetector(unittest.TestCase):
    def setUp(self):
        self.detector = StubDetector(device="cpu")
        self.detector.ensure_loaded()

    def test_predict_returns_valid_structure(self):
        img = Image.new("RGB", (64, 64), color="red")
        result = self.detector.predict(img)

        self.assertIn("verdict", result)
        self.assertIn(result["verdict"], ["REAL", "FAKE"])
        self.assertIn("confidence", result)
        self.assertGreaterEqual(result["confidence"], 50.0)
        self.assertLessEqual(result["confidence"], 100.0)
        self.assertIn("fake_probability", result)
        self.assertGreaterEqual(result["fake_probability"], 0.0)
        self.assertLessEqual(result["fake_probability"], 1.0)
        self.assertIn("latency_ms", result)
        self.assertGreaterEqual(result["latency_ms"], 0)


class TestDetectorFactory(unittest.TestCase):
    def test_factory_stub(self):
        det = get_detector(backend="stub")
        self.assertIsInstance(det, StubDetector)

    def test_factory_invalid_raises(self):
        with self.assertRaises(ValueError):
            get_detector(backend="unknown_backend_xyz")


if __name__ == "__main__":
    unittest.main()
