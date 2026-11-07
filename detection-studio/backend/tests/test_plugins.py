from pathlib import Path

from app.plugins import PluginRegistry


def write_model(folder: Path, *, enabled: bool = True, model_id: str = "demo-model") -> None:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "weights").mkdir(exist_ok=True)
    (folder / "weights" / "dummy.bin").write_bytes(b"weights")
    (folder / "adapter.py").write_text(
        "class Detector:\n"
        "    def __init__(self, plugin): self.plugin, self.loaded, self.load_no = plugin, False, 0\n"
        "    def load(self):\n"
        "        p = self.plugin.folder / 'load-count.txt'\n"
        "        self.load_no = int(p.read_text()) + 1 if p.exists() else 1\n"
        "        p.write_text(str(self.load_no))\n"
        "        self.loaded = True\n"
        "    def predict(self, image): return {'score': 0.75, 'predicted_label': 'Fake', 'metadata': {'load_no': self.load_no}}\n"
        "    def unload(self): self.loaded = False\n",
        encoding="utf-8",
    )
    (folder / "model.yaml").write_text(
        f"""id: {model_id}
name: Demo Model
version: 1.0
task: ai_generated_image
enabled: {str(enabled).lower()}
adapter: adapter.py:Detector
artifacts:
  checkpoint: weights/dummy.bin
required_artifacts: [checkpoint]
""",
        encoding="utf-8",
    )


def test_discovers_plugin_from_its_folder(tmp_path):
    write_model(tmp_path / "demo-model")
    models = PluginRegistry(tmp_path).list()
    assert len(models) == 1
    assert models[0].id == "demo-model"
    assert models[0].status == "ready"


def test_disable_plugin_in_manifest(tmp_path):
    write_model(tmp_path / "demo-model", enabled=False)
    plugin = PluginRegistry(tmp_path).list()[0]
    assert plugin.status == "disabled"
    assert not plugin.selectable


def test_missing_weights_show_setup_required(tmp_path):
    folder = tmp_path / "demo-model"
    write_model(folder)
    (folder / "weights" / "dummy.bin").unlink()
    plugin = PluginRegistry(tmp_path).list()[0]
    assert plugin.status == "setup_required"
    assert "checkpoint" in plugin.message


def test_template_and_shared_folders_are_not_plugins(tmp_path):
    (tmp_path / "_template").mkdir()
    (tmp_path / "_shared").mkdir()
    assert PluginRegistry(tmp_path).list() == []
