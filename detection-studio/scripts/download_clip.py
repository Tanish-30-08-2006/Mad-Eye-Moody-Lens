from __future__ import annotations

import hashlib
import urllib.request
from pathlib import Path

URL = "https://openaipublic.azureedge.net/clip/models/b8cca3fd41ae0c99ba7e8951adf17d267cdb84cd88be6f7c2e0eca1737a03836/ViT-L-14.pt"
EXPECTED_SHA256 = "b8cca3fd41ae0c99ba7e8951adf17d267cdb84cd88be6f7c2e0eca1737a03836"
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "models" / "_shared" / "clip" / "ViT-L-14.pt"


def main() -> None:
    DEST.parent.mkdir(parents=True, exist_ok=True)
    if DEST.exists():
        digest = hashlib.sha256(DEST.read_bytes()).hexdigest()
        if digest == EXPECTED_SHA256:
            print(f"Already downloaded and verified: {DEST}")
            return
        raise SystemExit(f"Existing file failed SHA256 verification: {DEST}. Remove it and rerun.")
    print(f"Downloading CLIP weights to {DEST}")
    urllib.request.urlretrieve(URL, DEST)
    digest = hashlib.sha256(DEST.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        DEST.unlink(missing_ok=True)
        raise SystemExit("SHA256 verification failed; the downloaded file was removed.")
    print("Download complete and SHA256 verified.")


if __name__ == "__main__":
    main()
