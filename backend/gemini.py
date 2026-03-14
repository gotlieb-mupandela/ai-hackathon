"""
Vision analysis for newspaper page images via OpenRouter.
Uses meta-llama/llama-3.2-11b-vision-instruct through the OpenRouter API.
Falls back to Google Gemini if OPENROUTER_API_KEY is not set.
"""

import base64
import io
import json
import logging
import os
import re
import time

import requests
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
   FIRST: Look at the TOP of the page for a section keyword banner or header label. It will say one of:
   Sport, Business, Vibez!, AgriToday, or News.
   Use that label directly if you see it.

   If no section keyword is visible at the top, classify by content:
   - "News"      — general news, politics, national affairs, government, current events
   - "Sport"     — football, athletics, rugby, netball, cricket, any sports news
   - "Business"  — economy, finance, companies, NAD/N$, markets, trade, investment
   - "Vibez!"    — entertainment, celebrities, music, fashion, lifestyle, arts, culture
   - "AgriToday" — farming, agriculture, livestock, crops, irrigation, rural development

   IMPORTANT: These are the ONLY five valid sections. Return exactly one of the values above.

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

VALID_SECTIONS = {"Sport", "Business", "Vibez!", "AgriToday", "News"}

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
    "news": "News",
    "general news": "News",
    "politics": "News",
    "national": "News",
    "general": "News",
}

# Gemini fallback client (only used when OpenRouter key is absent)
_gemini_client = None


def configure_gemini(api_key: str | None = None) -> None:
    """
    Configure vision analysis clients.
    Primary: OpenRouter (if key is set). Fallback: Google Gemini.
    Gemini is always initialised so automatic fallback works when
    the OpenRouter key expires or returns 401/403.
    """
    global _gemini_client
    openrouter_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if openrouter_key:
        logger.info(
            "Vision analysis will use OpenRouter/%s",
            os.getenv("OPENROUTER_VISION_MODEL", "meta-llama/llama-3.2-11b-vision-instruct"),
        )

    # Always set up Gemini so it's ready as a fallback
    key = api_key or os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        if not openrouter_key:
            logger.warning("Neither OPENROUTER_API_KEY nor GEMINI_API_KEY is set — vision analysis will fail")
        return
    try:
        from google import genai
        _gemini_client = genai.Client(api_key=key)
        logger.info("Gemini client ready (%s)", "primary" if not openrouter_key else "fallback")
    except Exception as exc:
        logger.warning("Failed to create Gemini client: %s", exc)


def analyze_page(image_path: str, retries: int = 2) -> dict:
    """
    Analyze a newspaper page image.
    Primary: OpenRouter vision model.
    Fallback: Google Gemini — used automatically if:
      - No OpenRouter key is configured, OR
      - OpenRouter returns a 401/403 (invalid/expired key)
    """
    openrouter_key = os.getenv("OPENROUTER_API_KEY", "").strip()

    if openrouter_key:
        try:
            return _analyze_with_openrouter(image_path, openrouter_key, retries)
        except RuntimeError as exc:
            err_str = str(exc)
            # Auto-fallback to Gemini when the OpenRouter key is invalid/expired
            if "401" in err_str or "403" in err_str or "Unauthorized" in err_str:
                logger.warning(
                    "OpenRouter key invalid/expired (401/403) — falling back to Gemini for %s",
                    image_path,
                )
                return _analyze_with_gemini(image_path, retries)
            raise

    return _analyze_with_gemini(image_path, retries)


# ── OpenRouter vision analysis ──────────────────────────────────────────────

def _analyze_with_openrouter(image_path: str, api_key: str, retries: int) -> dict:
    """Send the page image to OpenRouter vision model and parse the JSON response."""
    model = os.getenv("OPENROUTER_VISION_MODEL", "meta-llama/llama-3.2-11b-vision-instruct")

    # Load image, compress aggressively — AI only needs to read headlines/keywords
    img = Image.open(image_path)
    if img.mode in ("P", "RGBA"):
        img = img.convert("RGB")

    # Shrink large images to max 800px — keeps base64 payload small and API fast
    MAX_DIM = 800
    if max(img.size) > MAX_DIM:
        img.thumbnail((MAX_DIM, MAX_DIM))

    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=40, optimize=True)
    image_bytes = buf.getvalue()

    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    data_url  = f"data:image/jpeg;base64,{image_b64}"

    logger.info("Sending page to OpenRouter/%s (%d KB)", model, len(image_bytes) // 1024)

    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_url}},
                    {"type": "text", "text": ANALYSIS_PROMPT},
                ],
            }
        ],
        "temperature": 0.1,
        "max_tokens": 300,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://newera-editorial.app",
        "X-Title": "NewEra Editorial Vision",
    }

    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            resp = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=120,
            )
            resp.raise_for_status()
            raw_text = resp.json()["choices"][0]["message"]["content"].strip()

            if not raw_text:
                raise ValueError("Empty response from OpenRouter")

            # Strip markdown fences if present
            raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
            raw_text = re.sub(r"\s*```$", "", raw_text)
            json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
            if json_match:
                raw_text = json_match.group(0)

            data   = json.loads(raw_text)
            result = _validate_and_normalise(data, image_path)
            logger.info("Vision analysis succeeded with OpenRouter/%s (attempt %d)", model, attempt + 1)
            return result

        except json.JSONDecodeError as exc:
            last_error = exc
            logger.warning("Non-JSON from OpenRouter attempt %d: %s", attempt + 1, exc)
            if attempt < retries - 1:
                time.sleep(1)
        except Exception as exc:
            last_error = exc
            logger.error("OpenRouter vision error attempt %d: %s", attempt + 1, exc)
            if attempt < retries - 1:
                time.sleep(1)

    raise RuntimeError(f"OpenRouter vision analysis failed after {retries} attempts. Last error: {last_error}")


# ── Gemini fallback ─────────────────────────────────────────────────────────

def _analyze_with_gemini(image_path: str, retries: int) -> dict:
    """Fallback: analyze using Google Gemini when OpenRouter key is not set."""
    if _gemini_client is None:
        raise RuntimeError(
            "No vision model configured. Set OPENROUTER_API_KEY or GEMINI_API_KEY in .env"
        )

    from google.genai import types

    with open(image_path, "rb") as f:
        image_bytes = f.read()

    mime_type = "image/jpeg" if image_path.lower().endswith((".jpg", ".jpeg")) else "image/png"
    if mime_type == "image/png":
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode == "P":
            img = img.convert("RGB")
            buf = io.BytesIO()
            img.save(buf, "JPEG", quality=70, optimize=True)
            image_bytes = buf.getvalue()
            mime_type = "image/jpeg"

    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
    config      = types.GenerateContentConfig(temperature=0.1)

    model_chain = ["gemini-2.0-flash-lite", "gemini-2.0-flash", "gemini-2.5-flash"]
    last_error: Exception | None = None

    for model_name in model_chain:
        for attempt in range(retries):
            try:
                response = _gemini_client.models.generate_content(
                    model=model_name,
                    contents=[image_part, ANALYSIS_PROMPT],
                    config=config,
                )
                raw_text = (response.text or "").strip()
                if not raw_text:
                    raise ValueError("Empty response from Gemini")

                raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
                raw_text = re.sub(r"\s*```$", "", raw_text)
                json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
                if json_match:
                    raw_text = json_match.group(0)

                data   = json.loads(raw_text)
                result = _validate_and_normalise(data, image_path)
                logger.info("Gemini fallback succeeded with %s (attempt %d)", model_name, attempt + 1)
                return result

            except json.JSONDecodeError as exc:
                last_error = exc
                if attempt < retries - 1:
                    time.sleep(0.5)
            except Exception as exc:
                last_error = exc
                err_str = str(exc)
                is_quota = "429" in err_str or "RESOURCE_EXHAUSTED" in err_str
                logger.error("Gemini %s attempt %d: %s", model_name, attempt + 1, exc)
                if is_quota:
                    break
                if attempt < retries - 1:
                    time.sleep(0.5)

    raise RuntimeError(f"All Gemini models exhausted. Last error: {last_error}")


# ── Shared helpers ───────────────────────────────────────────────────────────

def _resolve_section(raw: str) -> str:
    if raw in VALID_SECTIONS:
        return raw
    return SECTION_ALIASES.get(raw.strip().lower(), "Sport")


def _validate_and_normalise(data: dict, image_path: str) -> dict:
    page_number_raw = data.get("page_number", 0)
    if page_number_raw in ("unknown", None):
        page_number = 0
    else:
        try:
            page_number = int(page_number_raw)
        except (TypeError, ValueError):
            page_number = 0

    section  = _resolve_section(str(data.get("section", "")))
    tags     = data.get("tags", [])
    if not isinstance(tags, list):
        tags = []
    tags     = [str(t) for t in tags[:5]]
    headline = str(data.get("headline", ""))

    return {
        "page_number": page_number,
        "section": section,
        "tags": tags,
        "headline": headline,
    }
