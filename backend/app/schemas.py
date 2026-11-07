"""Pydantic schemas for live deepfake detection and advanced heatmap analysis."""

from __future__ import annotations

from typing import List, Literal, Optional, Tuple
from pydantic import BaseModel, Field

ManipulationScope = Literal["entire_image", "partial", "authentic"]
Verdict = Literal["AI-GENERATED", "PARTIALLY MANIPULATED", "LIKELY REAL", "UNCERTAIN"]


class AnalyzeRequest(BaseModel):
    """Optional JSON payload when not using multipart form upload."""
    image_url: Optional[str] = Field(None, description="Publicly accessible HTTP/HTTPS URL of image to analyze")
    image_base64: Optional[str] = Field(None, description="Data URL or base64-encoded image string")


class RegionBox(BaseModel):
    """Bounding box of an analyzed face or spatial patch."""
    box: Tuple[int, int, int, int] = Field(description="[x, y, width, height] relative to original image dimensions")
    label: str = Field(description="Region label (e.g., 'Manipulated Face #1', 'Synthetic Patch [2,3]')")
    fake_probability: float = Field(description="Probability in [0.0, 1.0] that this region is AI generated")
    is_ai: bool = Field(description="True if probability exceeds threshold")
    description: str = Field(description="Explanatory text for this region")


class LiveScanResponse(BaseModel):
    """Fast, lightweight response designed for real-time web extension long-press tracking."""
    is_ai_generated: bool = Field(description="True if the image contains AI synthesis or manipulation")
    fake_probability: float = Field(description="Overall fake probability between 0.0 and 1.0")
    confidence_score: str = Field(description="Formatted percentage string (e.g., '89.4%')")
    verdict: Verdict = Field(description="Top-level verdict classification")
    label: str = Field(description="Human-friendly label")
    manipulation_type: Literal["fully_synthetic", "partially_manipulated", "authentic"] = Field(
        description="Whether the whole image is synthetic, partially manipulated, or authentic"
    )
    processing_time_ms: int = Field(description="Inference time in milliseconds")
    model_used: str = Field(description="Name or ID of the model used")


class AdvancedScanResponse(BaseModel):
    """In-depth analysis response with spatial Grad-CAM heatmap, whole vs partial breakdown, and highlighted regions."""
    # Base live response fields
    is_ai_generated: bool
    fake_probability: float
    confidence_score: str
    verdict: Verdict
    label: str
    manipulation_type: Literal["fully_synthetic", "partially_manipulated", "authentic"]
    processing_time_ms: int
    model_used: str

    # Advanced heatmap & spatial segmentation fields
    manipulation_scope: ManipulationScope = Field(
        description="Scope: 'entire_image' (all synthetic), 'partial' (only some regions modified), or 'authentic'"
    )
    scope_verdict: str = Field(
        description="Readable verdict on scope (e.g., 'Entire Image is AI-Generated' vs 'Partially AI-Generated')"
    )
    ai_area_percentage: float = Field(
        description="Percentage of total image area identified as AI-generated or manipulated (0.0 to 100.0%)"
    )
    heatmap_overlay_base64: str = Field(
        description="Base64 data URL (PNG) of the spatial heatmap overlay with transparent authentic background"
    )
    blended_image_base64: str = Field(
        description="Base64 data URL (PNG) of the original image blended with the heatmap overlay"
    )
    highlighted_regions: List[RegionBox] = Field(
        default_factory=list,
        description="List of bounding boxes pinpointing AI-generated regions (faces or localized synthetic patches)"
    )
    patch_grid: List[List[float]] = Field(
        default_factory=list,
        description="Normalized 4x4 spatial grid showing synthetic artifact intensity per quadrant"
    )
    detailed_explanation: str = Field(
        description="Detailed technical breakdown of why this image was flagged or deemed authentic"
    )
    disclaimer: str = Field(
        default="Probabilistic estimate from pre-trained CNNs (EfficientNet-B0 / FaceForensics++ / CIFAKE). Not forensic proof."
    )
