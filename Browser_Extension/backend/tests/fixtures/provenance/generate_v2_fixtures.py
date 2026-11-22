"""Generate only v2 CC0 derivatives and a self-signed test leaf; never rewrite v1 roots.

Requires the official c2patool 0.29.0 executable, Pillow and cryptography.
Run: python generate_v2_fixtures.py /absolute/path/to/c2patool
Private keys are temporary, never printed or copied into the repository.
"""
from pathlib import Path
import json
import subprocess
import sys
import tempfile

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from PIL import Image

from generate_fixtures import certificate

ROOT = Path(__file__).resolve().parent


def main(tool):
    assert '0.29.0' in subprocess.check_output([tool, '--version'], text=True)
    with Image.open(ROOT / 'signed.png') as image:
        pixels = image.convert('RGB')
        pixels.save(ROOT / 'reencoded.webp', 'WEBP', quality=80, exif=b'', xmp=b'')
        pixels.save(ROOT / 'reencoded.jpg', 'JPEG', quality=80, exif=b'')
    scratch_root = Path(tempfile.gettempdir()).resolve()
    with tempfile.TemporaryDirectory(prefix='mml-v2-self-signed-', dir=scratch_root) as directory:
        scratch = Path(directory).resolve()
        assert scratch.is_relative_to(scratch_root) and scratch != scratch_root
        key = ec.generate_private_key(ec.SECP256R1())
        cert = certificate('MML SELF-SIGNED TEST ONLY', key)
        (scratch / 'leaf.pem').write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        (scratch / 'key.pem').write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        (ROOT / 'self-signed-test.crt').write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        manifest = {'claim_generator_info': [{'name': 'SelfSignedFixture', 'version': '1.0'}], 'title': 'CC0 self-signed test squares', 'alg': 'es256', 'sign_cert': str(scratch / 'leaf.pem'), 'private_key': str(scratch / 'key.pem'), 'assertions': []}
        (scratch / 'manifest.json').write_text(json.dumps(manifest), encoding='utf8')
        result = subprocess.run([tool, str(ROOT / 'plain.png'), '-m', str(scratch / 'manifest.json'), '--create', 'trainedAlgorithmicMedia', '-o', str(ROOT / 'self-signed.png'), '-f'], capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(result.stderr or result.stdout)
    print('Generated self-signed test leaf/image and re-encoded derivatives; temporary key removed.')


if __name__ == '__main__':
    main(sys.argv[1])
