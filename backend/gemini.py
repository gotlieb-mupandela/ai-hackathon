"""
Gemini Vision integration for newspaper page analysis.
Sends page images to Google Gemini 2.0 Flash and extracts structured metadata.
Requires GEMINI_API_KEY in the environment.
"""

import io
import json
import logging
import os
import re
import time
from pathlib import Path

from google import genai
from google.genai import types
from PIL import Image

logger = logging.getLogger(__name__)



ANALYSIS_PROMPT = """You are an AI assistant helping a Namibian newspaper called New Era automate their editorial workflow.

You will be given an image of a single printed newspaper page. Read it carefully.

Extract the following four pieces of information:

1. PAGE NUMBER
   - Find the page number printed on the page — usually in a corner at the top or bottom.
   - It is a small whole number like 2, 5, 12, 24.
   - IGNORE all other numbers: prices (N$), dates (2026), phone numbers, statistics, percentages.
   - Return only the single integer page number.
   - If you genuinely cannot find it, return 0.

2. SECTION
   New Era has EXACTLY these four sections. Pick the ONE that best fits the content:
   - "Sport"     — football, athletics, rugby, netball, cricket, any sports news
   - "Business"  — economy, finance, companies, NAD/N$, markets, trade, investment
   - "Vibez!"    — entertainment, celebrities, music, fashion, lifestyle, arts, culture
   - "AgriToday" — farming, agriculture, livestock, crops, irrigation, rural development
   
   IMPORTANT: These are the ONLY four valid sections. There is NO "News", "Politics" or any other section.
   If the content does not clearly fit one section, choose the closest match from the four above.

3. HEADLINE
   - Copy the single largest, most prominent headline exactly as it appears on the page.

4. TAGS
   - Give exactly 5 short keywords describing the main content of this page.

Respond with ONLY a valid JSON object. No markdown, no explanation, no extra text:

{
  "page_number": 5,
  "section": "Sport",
  "headline": "Namibia wins COSAFA Cup",
  "tags": ["football", "COSAFA", "NFA", "Namibia", "victory"]
}"""

VALID_SECTIONS = {"Sport", "Business", "Vibez!", "AgriToday"}

# Map common Gemini mis-spellings / variations back to the canonical section name
SECTION_ALIASES = {
    "sport": "Sport",
    "sports": "Sport",
    "business": "Business",
    "economy": "Business",
    "finance": "Business",
    "vibez": "Vibez!",
    "vibez!": "Vibez!",
    "vibe": "Vibez!",
    "entertainment": "Vibez!",
    "lifestyle": "Vibez!",
    "agritoday": "AgriToday",
    "agri today": "AgriToday",
    "agri": "AgriToday",
    "agriculture": "AgriToday",
    "farming": "AgriToday",
    # Catch "News" being returned despite instructions
    "news": "Sport",
    "general": "Sport",
    "politics": "Sport",
    "national": "Sport",
}

_client: genai.Client | None = None


def configure_gemini(api_key: str | None = None) -> None:
    """Configure the Gemini API client. Uses api_key or GEMINI_API_KEY from env."""
    global _client
    key = api_key or os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        logger.warning("GEMINI_API_KEY not set — vision analysis will fail until configured")
        _client = None
        return
    try:
        _client = genai.Client(api_key=key)
        logger.info("Gemini client configured for vision analysis")
    except Exception as exc:
        logger.warning("Failed to create Gemini client: %s", exc)
        _client = None


def analyze_page(image_path: str, retries: int = 3) -> dict:
    """
    Analyze a newspaper page image using Gemini 2.0 Flash.

    Args:
        image_path: Path to the PNG image of the page.
        retries: Number of retry attempts on API failure.

    Returns:
        Dict with page_number, section, tags, headline.
    """
    if _client is None:
        raise RuntimeError("Gemini client not configured — set GEMINI_API_KEY in .env")

    # Load image and send as bytes so Gemini reliably receives it
    with open(image_path, "rb") as f:
        image_bytes = f.read()
    
    # Detect format from file extension (backend now sends JPG)
    mime_type = "image/jpeg" if image_path.lower().endswith(('.jpg', '.jpeg')) else "image/png"
    
    # If palette mode, convert to RGB for JPEG compatibility
    if mime_type == "image/png":
        image = Image.open(io.BytesIO(image_bytes))
        if image.mode == "P":
            image = image.convert("RGB")
            buf = io.BytesIO()
            image.save(buf, "JPEG", quality=95)
            image_bytes = buf.getvalue()
            mime_type = "image/jpeg"

    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
    logger.info("Sending page image to Gemini (%d bytes, %s)", len(image_bytes), mime_type)

    config = types.GenerateContentConfig(temperature=0.2)

    # Try models in order; each model has its own quota bucket
    model_chain = [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-2.5-flash-lite",
    ]
    last_error: Exception | None = None

    for model_name in model_chain:
        for attempt in range(retries):
            try:
                response = _client.models.generate_content(
                    model=model_name,
                    contents=[image_part, ANALYSIS_PROMPT],
                    config=config,
                )
                raw_text = (response.text or "").strip()
                if not raw_text:
                    raise ValueError("Empty response from Gemini")

                # Strip markdown code fences if present
                raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
                raw_text = re.sub(r"\s*```$", "", raw_text)
                # Extract first {...} in case model adds extra text
                json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
                if json_match:
                    raw_text = json_match.group(0)

                data = json.loads(raw_text)
                result = _validate_and_normalise(data, image_path)
                logger.info("Analysis succeeded with model %s", model_name)
                return result

            except json.JSONDecodeError as exc:
                last_error = exc
                logger.warning("Non-JSON from %s attempt %d: %s", model_name, attempt + 1, exc)
                if attempt < retries - 1:
                    time.sleep(2 ** attempt)
            except Exception as exc:
                last_error = exc
                err_str = str(exc)
                is_quota = "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "quota" in err_str.lower()
                logger.error("Error from %s attempt %d: %s", model_name, attempt + 1, exc)
                if is_quota:
                    break  # Skip remaining retries for this model, try next
                if attempt < retries - 1:
                    time.sleep(2 ** attempt)

    err_msg = f"All Gemini models exhausted. Last error: {last_error}"
    logger.error(err_msg)
    raise RuntimeError(err_msg)


def _resolve_section(raw: str) -> str:
    """Map any section string Gemini might return to a canonical valid section."""
    if raw in VALID_SECTIONS:
        return raw
    normalised = raw.strip().lower()
    return SECTION_ALIASES.get(normalised, "Sport")  # default to Sport if truly unrecognised


def _validate_and_normalise(data: dict, image_path: str) -> dict:
    """Ensure all required fields are present and of the correct type."""
    page_number_raw = data.get("page_number", 0)

    if page_number_raw == "unknown" or page_number_raw is None:
        page_number = 0
    else:
        try:
            page_number = int(page_number_raw)
        except (TypeError, ValueError):
            page_number = 0

    section = _resolve_section(str(data.get("section", "")))

    tags = data.get("tags", [])
    if not isinstance(tags, list):
        tags = []
    tags = [str(t) for t in tags[:5]]

    headline = str(data.get("headline", ""))

    return {
        "page_number": page_number,
        "section": section,
        "tags": tags,
        "headline": headline,
    }


def _fallback_metadata(image_path: str) -> dict:
    """Return safe fallback metadata when Gemini analysis fails."""
    return {
        "page_number": 0,
        "section": "Sport",
        "tags": [],
        "headline": "",
    }
