# New detector template

Copy this folder to `models/<id>/`, where `<id>` matches the `id` in `model.yaml`.

1. Edit `model.yaml` with its research metadata, task, artifact paths and score semantics.
2. Implement the `Detector` class in `adapter.py`.
3. Add checkpoint files under `weights/` and declare them in `artifacts` plus `required_artifacts`.
4. Add model-specific packages to `requirements.txt`.
5. Set `implemented: true` and `enabled: true` after inference has been tested.

The backend discovers the new folder automatically. No shared registry or adapter factory needs editing.
