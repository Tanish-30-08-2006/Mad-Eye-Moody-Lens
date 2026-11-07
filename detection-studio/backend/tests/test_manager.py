from PIL import Image

from app.manager import InferenceManager
from app.plugins import PluginRegistry
from test_plugins import write_model


def test_manager_reuses_loaded_model_and_reloads_changed_weights(tmp_path):
    folder = tmp_path / "demo-model"
    write_model(folder)
    manager = InferenceManager(PluginRegistry(tmp_path))
    image = Image.new("RGB", (64, 64))

    first = manager.predict("demo-model", image)
    second = manager.predict("demo-model", image)
    assert first["metadata"]["load_no"] == 1
    assert second["metadata"]["load_no"] == 1
    assert second["model_load_time_ms"] == 0

    # Replacing a weight file changes the plugin fingerprint; the next request reloads it.
    (folder / "weights" / "dummy.bin").write_bytes(b"new weights with a different size")
    third = manager.predict("demo-model", image)
    assert third["metadata"]["load_no"] == 2
    manager.unload()
