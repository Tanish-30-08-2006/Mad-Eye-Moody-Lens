"""Heatmap generation, spatial patch analysis, and whole-vs-partial AI segmentation."""

from __future__ import annotations

import base64
import io
from typing import List, Tuple
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

from app.schemas import RegionBox


def apply_turbo_colormap(val: float) -> Tuple[int, int, int]:
    """Smooth Turbo/Jet colormap mapping a scalar in [0, 1] to RGB."""
    # Approximate Turbo/Jet colormap polynomial
    # 0.0 -> Cool Blue, 0.5 -> Green/Yellow, 1.0 -> Fiery Red
    v = np.clip(val, 0.0, 1.0)
    
    # 5-knot gradient for intuitive thermal perception:
    # 0.0: [30, 60, 200]   (Blue - authentic)
    # 0.25: [30, 180, 210]  (Cyan - low artifact)
    # 0.5: [50, 210, 80]    (Green/Yellow - borderline)
    # 0.75: [240, 180, 20]  (Orange - suspicious)
    # 1.0: [230, 35, 45]    (Deep Red - high synthetic confidence)
    
    if v < 0.25:
        t = v / 0.25
        r = int(30 * (1 - t) + 30 * t)
        g = int(60 * (1 - t) + 180 * t)
        b = int(200 * (1 - t) + 210 * t)
    elif v < 0.5:
        t = (v - 0.25) / 0.25
        r = int(30 * (1 - t) + 50 * t)
        g = int(180 * (1 - t) + 210 * t)
        b = int(210 * (1 - t) + 80 * t)
    elif v < 0.75:
        t = (v - 0.5) / 0.25
        r = int(50 * (1 - t) + 240 * t)
        g = int(210 * (1 - t) + 180 * t)
        b = int(80 * (1 - t) + 20 * t)
    else:
        t = (v - 0.75) / 0.25
        r = int(240 * (1 - t) + 235 * t)
        g = int(180 * (1 - t) + 35 * t)
        b = int(20 * (1 - t) + 45 * t)
        
    return r, g, b


def generate_heatmap_overlay(
    activation_map: np.ndarray,
    target_size: Tuple[int, int],
    alpha_intensity: float = 0.75,
) -> Tuple[Image.Image, float, List[List[float]]]:
    """
    Renders an RGBA heatmap overlay from a 2D activation array.
    Authentic regions (low activation) are fully transparent.
    AI-generated regions glow with vibrant thermal hues.
    
    Returns:
        (heatmap_rgba_image, ai_area_percentage, patch_grid_4x4)
    """
    w, h = target_size
    
    # Resize activation map smoothly to target image dimensions
    act_img = Image.fromarray((activation_map * 255).astype(np.uint8))
    act_resized = act_img.resize((w, h), Image.Resampling.BILINEAR)
    act_arr = np.array(act_resized, dtype=np.float32) / 255.0
    
    # Smooth activations to remove harsh pixelation
    act_arr = gaussian_filter(act_arr, sigma=max(2.0, min(w, h) / 60.0))
    act_arr = np.clip(act_arr, 0.0, 1.0)
    
    # Compute 4x4 spatial patch grid
    patch_grid: List[List[float]] = []
    gw, gh = w // 4, h // 4
    for r in range(4):
        row_vals: List[float] = []
        for c in range(4):
            patch = act_arr[r * gh : (r + 1) * gh, c * gw : (c + 1) * gw]
            row_vals.append(float(np.mean(patch)) if patch.size > 0 else 0.0)
        patch_grid.append(row_vals)
        
    # Count pixels with activation > 0.38 as AI-manipulated
    ai_threshold = 0.38
    ai_pixels = np.sum(act_arr >= ai_threshold)
    ai_area_percentage = float((ai_pixels / (w * h)) * 100.0)
    
    # Build RGBA array
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    
    # Vectorized colormap mapping
    # Authentic (< 0.20): alpha = 0 (clean transparency)
    # Suspect (0.20 - 0.40): faint translucent cyan/yellow
    # Fake (> 0.40): rich thermal orange/red
    
    # Compute alphas
    alphas = np.zeros_like(act_arr)
    suspect_mask = (act_arr >= 0.20) & (act_arr < 0.40)
    alphas[suspect_mask] = (act_arr[suspect_mask] - 0.20) / 0.20 * 0.45 * 255.0
    
    fake_mask = act_arr >= 0.40
    alphas[fake_mask] = (0.45 + (act_arr[fake_mask] - 0.40) / 0.60 * 0.45) * 255.0 * alpha_intensity
    
    rgba[:, :, 3] = np.clip(alphas, 0, 255).astype(np.uint8)
    
    # Colors: vectorize across 4 zones
    # Zone 1 (< 0.25)
    z1 = act_arr < 0.25
    t1 = act_arr / 0.25
    rgba[z1, 0] = (30 * (1 - t1[z1]) + 30 * t1[z1]).astype(np.uint8)
    rgba[z1, 1] = (60 * (1 - t1[z1]) + 180 * t1[z1]).astype(np.uint8)
    rgba[z1, 2] = (200 * (1 - t1[z1]) + 210 * t1[z1]).astype(np.uint8)
    
    # Zone 2 (0.25 - 0.50)
    z2 = (act_arr >= 0.25) & (act_arr < 0.50)
    t2 = (act_arr - 0.25) / 0.25
    rgba[z2, 0] = (30 * (1 - t2[z2]) + 50 * t2[z2]).astype(np.uint8)
    rgba[z2, 1] = (180 * (1 - t2[z2]) + 210 * t2[z2]).astype(np.uint8)
    rgba[z2, 2] = (210 * (1 - t2[z2]) + 80 * t2[z2]).astype(np.uint8)
    
    # Zone 3 (0.50 - 0.75)
    z3 = (act_arr >= 0.50) & (act_arr < 0.75)
    t3 = (act_arr - 0.50) / 0.25
    rgba[z3, 0] = (50 * (1 - t3[z3]) + 240 * t3[z3]).astype(np.uint8)
    rgba[z3, 1] = (210 * (1 - t3[z3]) + 180 * t3[z3]).astype(np.uint8)
    rgba[z3, 2] = (80 * (1 - t3[z3]) + 20 * t3[z3]).astype(np.uint8)
    
    # Zone 4 (>= 0.75)
    z4 = act_arr >= 0.75
    t4 = (act_arr - 0.75) / 0.25
    rgba[z4, 0] = (240 * (1 - t4[z4]) + 235 * t4[z4]).astype(np.uint8)
    rgba[z4, 1] = (180 * (1 - t4[z4]) + 35 * t4[z4]).astype(np.uint8)
    rgba[z4, 2] = (20 * (1 - t4[z4]) + 45 * t4[z4]).astype(np.uint8)
    
    overlay_img = Image.fromarray(rgba)
    return overlay_img, ai_area_percentage, patch_grid


def extract_highlighted_regions(
    activation_map: np.ndarray,
    target_size: Tuple[int, int],
    face_boxes: List[Tuple[int, int, int, int, float]],
    ai_threshold: float = 0.45,
) -> List[RegionBox]:
    """
    Extracts bounding boxes around high-confidence AI regions
    (e.g., manipulated face crops or synthetic inpainting hotspots).
    """
    w, h = target_size
    regions: List[RegionBox] = []
    
    # 1. Add detected faces if provided:
    for idx, (fx, fy, fw, fh, face_prob) in enumerate(face_boxes):
        is_fake = face_prob >= 0.50
        regions.append(
            RegionBox(
                box=(int(fx), int(fy), int(fw), int(fh)),
                label=f"Face #{idx + 1}: {'AI-Manipulated' if is_fake else 'Authentic'}",
                fake_probability=round(face_prob, 3),
                is_ai=is_fake,
                description=f"Facial region analysis via EfficientNet-B0 CNN (Confidence: {face_prob * 100:.1f}%)",
            )
        )
        
    # 2. Find significant spatial patches with high synthetic activation
    act_img = Image.fromarray((activation_map * 255).astype(np.uint8))
    act_resized = np.array(act_img.resize((8, 8), Image.Resampling.BILINEAR)) / 255.0
    
    gw, gh = w / 8.0, h / 8.0
    for r in range(8):
        for c in range(8):
            prob = float(act_resized[r, c])
            if prob >= ai_threshold:
                bx = int(c * gw)
                by = int(r * gh)
                bw = int(gw)
                bh = int(gh)
                
                # Check if this patch overlaps an already recorded face box
                overlaps = False
                for rbox in regions:
                    ox, oy, ow, oh = rbox.box
                    if max(bx, ox) < min(bx + bw, ox + ow) and max(by, oy) < min(by + bh, oy + oh):
                        overlaps = True
                        break
                        
                if not overlaps and len(regions) < 8:
                    regions.append(
                        RegionBox(
                            box=(bx, by, bw, bh),
                            label=f"Synthetic Hotspot [{r+1},{c+1}]",
                            fake_probability=round(prob, 3),
                            is_ai=True,
                            description=f"Localized generative artifact cluster (Confidence: {prob * 100:.1f}%)",
                        )
                    )
                    
    return regions


def image_to_base64_png(img: Image.Image) -> str:
    """Encodes PIL image as standard data:image/png;base64 string."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"


def blend_images(base_img: Image.Image, overlay_img: Image.Image) -> Image.Image:
    """Blends the RGBA overlay over the RGB base image."""
    base_rgba = base_img.convert("RGBA")
    overlay_rgba = overlay_img.convert("RGBA")
    blended = Image.alpha_composite(base_rgba, overlay_rgba)
    return blended.convert("RGB")
