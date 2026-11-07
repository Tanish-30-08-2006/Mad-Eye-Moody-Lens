from io import BytesIO
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError
from fastapi import HTTPException

Image.MAX_IMAGE_PIXELS = 40_000_000
warnings.simplefilter("error", Image.DecompressionBombWarning)
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "BMP", "TIFF"}


def decode_image(data: bytes) -> Image.Image:
    try:
        with Image.open(BytesIO(data)) as probe:
            if probe.format not in ALLOWED_FORMATS:
                raise HTTPException(415, "Upload a JPEG, PNG, WEBP, BMP or TIFF image.")
            probe.verify()
        with Image.open(BytesIO(data)) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
            if min(image.size) < 32:
                raise HTTPException(400, "Image must be at least 32 × 32 pixels.")
            if image.width * image.height > 40_000_000:
                raise HTTPException(413, "Image exceeds the 40-megapixel limit.")
            return image.copy()
    except HTTPException:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombWarning, Image.DecompressionBombError, OSError, ValueError) as exc:
        raise HTTPException(400, "The uploaded file is not a valid image.") from exc
