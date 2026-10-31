from PIL import Image


class Detector:
    """Copy this folder, rename it, then implement this small adapter contract."""

    def __init__(self, plugin):
        self.plugin = plugin
        self.loaded = False
        self.model = None

    def load(self):
        # Load only this model's architecture and checkpoint.
        # Resolve paths with self.plugin.artifacts["checkpoint"].
        raise NotImplementedError("Implement model loading before enabling this plugin.")

    def predict(self, image: Image.Image) -> dict:
        # Run the model's official preprocessing and inference here.
        # Return a score in [0, 1], a label and score semantics.
        raise NotImplementedError

    def unload(self):
        self.model = None
        self.loaded = False
