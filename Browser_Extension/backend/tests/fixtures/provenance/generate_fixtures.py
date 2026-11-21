"""Generate original CC0 test artwork and sign it with disposable test-only keys.

Requires Pillow, cryptography, and c2patool 0.29.0. Run:
python generate_fixtures.py /absolute/path/to/c2patool
Private keys exist only inside a temporary directory; never copy them into Git.
Signatures and certificates are regenerated (not byte-for-byte reproducible).
"""
from pathlib import Path
from datetime import datetime, timezone
import json
import struct
import subprocess
import sys
import tempfile
import zlib

from PIL import Image
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

ROOT = Path(__file__).resolve().parent


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))


def png(*text_chunks):
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2, 2, 8, 2, 0, 0, 0))
            + b''.join(text_chunks) + chunk(b'IDAT', zlib.compress(b'\0\xff\0\0\0\xff\0' * 2)) + chunk(b'IEND', b''))


def large_stripped_jpeg():
    # Original deterministic artwork, large enough that the cheap marker walk defers to SDK.
    pixels = bytes((x * 17 + y * 31 + x * y + channel * 53) % 256
                   for y in range(128) for x in range(128) for channel in range(3))
    Image.frombytes('RGB', (128, 128), pixels).save(ROOT / 'large-stripped.jpg', 'JPEG', quality=90, exif=b'')


def certificate(name, key, issuer_name=None, issuer_key=None, ca=False):
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, name)])
    builder = (x509.CertificateBuilder().subject_name(subject).issuer_name(issuer_name or subject)
               .public_key(key.public_key()).serial_number(x509.random_serial_number())
               .not_valid_before(datetime(2026, 1, 1, tzinfo=timezone.utc))
               .not_valid_after(datetime(2036, 1, 1, tzinfo=timezone.utc))
               .add_extension(x509.BasicConstraints(ca=ca, path_length=1 if ca else None), critical=True)
               .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False,
                                           key_encipherment=False, data_encipherment=False,
                                           key_agreement=False, key_cert_sign=ca, crl_sign=ca,
                                           encipher_only=False, decipher_only=False), critical=True)
               .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
               .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key((issuer_key or key).public_key()), critical=False))
    if not ca:
        builder = builder.add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.EMAIL_PROTECTION]), critical=True)
    return builder.sign(issuer_key or key, hashes.SHA256())


def main(tool):
    base = png()
    (ROOT / 'plain.png').write_bytes(base)
    (ROOT / 'stable-diffusion.png').write_bytes(png(chunk(b'tEXt', b'parameters\0A tiny red and green square\nSteps: 20, Sampler: Euler, Seed: 42')))
    (ROOT / 'compressed-metadata.png').write_bytes(png(
        chunk(b'zTXt', b'Software\0\0' + zlib.compress(b'ComfyUI')),
        chunk(b'iTXt', b'prompt\0\x01\0\0\0' + zlib.compress(b'{"text":"a small test square"}'))))
    Image.new('RGB', (2, 2), (180, 50, 80)).save(ROOT / 'stripped.jpg', 'JPEG', exif=b'')
    large_stripped_jpeg()
    (ROOT / 'truncated.png').write_bytes(b'\x89PNG\r\n\x1a\n\xff\xff\xff\xffcaBX\0')
    with tempfile.TemporaryDirectory(prefix='mml-provenance-fixtures-') as tmp:
        temp = Path(tmp)
        for tag, output in [('A', 'signed.png'), ('B', 'untrusted.png')]:
            root_key = ec.generate_private_key(ec.SECP256R1())
            root_cert = certificate(f'MML TEST ONLY Root {tag}', root_key, ca=True)
            leaf_key = ec.generate_private_key(ec.SECP256R1())
            leaf_cert = certificate(f'MML TEST ONLY Signer {tag}', leaf_key, root_cert.subject, root_key)
            cert_path, key_path = temp / f'cert-{tag}.pem', temp / f'private-{tag}.key'
            cert_path.write_bytes(leaf_cert.public_bytes(serialization.Encoding.PEM) + root_cert.public_bytes(serialization.Encoding.PEM))
            key_path.write_bytes(leaf_key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
            if tag == 'A':
                (ROOT / 'test-root-A.crt').write_bytes(root_cert.public_bytes(serialization.Encoding.PEM))
            manifest = {
                'claim_generator_info': [{'name': 'ProvenanceFixture', 'version': '1.0'}],
                'title': 'Original test squares, CC0', 'alg': 'es256',
                'sign_cert': str(cert_path), 'private_key': str(key_path),
                'assertions': [{'label': 'c2pa.actions', 'data': {'actions': [
                    {'action': 'c2pa.created', 'digitalSourceType': 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'},
                    {'action': 'c2pa.edited'}, {'action': 'c2pa.cropped'}, {'action': 'c2pa.filtered'}]}}]}
            manifest_path = temp / 'manifest.json'
            manifest_path.write_text(json.dumps(manifest), encoding='utf-8')
            subprocess.run([tool, str(ROOT / 'plain.png'), '-m', str(manifest_path), '--create', 'trainedAlgorithmicMedia', '-o', str(ROOT / output), '-f'], check=True, capture_output=True)
        # Change one byte of the signed claim's generator name, not any image pixels.
        corrupted = bytearray((ROOT / 'signed.png').read_bytes())
        offset = corrupted.index(b'ProvenanceFixture')
        corrupted[offset] = ord('Q')
        pos = 8
        while pos + 12 <= len(corrupted):
            size = struct.unpack_from('>I', corrupted, pos)[0]
            if pos + 8 <= offset < pos + 8 + size:
                struct.pack_into('>I', corrupted, pos + 8 + size, zlib.crc32(corrupted[pos + 4:pos + 8 + size]))
                break
            pos += size + 12
        (ROOT / 'corrupted-signature.png').write_bytes(corrupted)
        # Add an otherwise legal PNG text chunk outside the manifest exclusions.
        signed = (ROOT / 'signed.png').read_bytes()
        (ROOT / 'binding-mismatch.png').write_bytes(signed[:-12] + chunk(b'tEXt', b'Comment\0added after signing') + signed[-12:])
        (ROOT / 'mutation.json').write_text(json.dumps({'file': 'corrupted-signature.png', 'offset': offset, 'from': '0x50 (P)', 'to': '0x51 (Q)', 'also': 'Recomputed containing PNG caBX CRC32; pixels unchanged.'}, indent=2) + '\n')
    # CLI records use offline anchors and no remote/OCSP downloads.
    for label, anchors in [('untrusted', ''), ('test-trusted', (ROOT / 'test-root-A.crt').read_text())]:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as handle:
            settings = Path(handle.name)
            json.dump({'verify': {'verify_trust': True, 'remote_manifest_fetch': False, 'ocsp_fetch': False}, 'trust': {'trust_anchors': anchors} if anchors else {}}, handle)
        try:
            for name in ['signed', 'untrusted', 'corrupted-signature', 'binding-mismatch']:
                run = subprocess.run([tool, str(ROOT / f'{name}.png'), '--settings', str(settings)], capture_output=True, text=True)
                if run.returncode:
                    raise RuntimeError(run.stderr or run.stdout)
                (ROOT / f'{name}.c2patool-{label}.json').write_text(run.stdout, encoding='utf-8')
        finally:
            settings.unlink()


if __name__ == '__main__':
    main(sys.argv[1])
