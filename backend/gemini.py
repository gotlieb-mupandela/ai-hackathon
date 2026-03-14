"""
Newspaper page analysis for the New Era Editorial System.

Classification strategy (in order):
  1. DeepSeek (deepseek/deepseek-chat-v3-0324:free via OpenRouter)
     — Used when embedded PDF text is available.  Fast, accurate, free.
  2. Qwen VL 72B (qwen/qwen2.5-vl-72b-instruct:free via OpenRouter)
     — Used for scanned / image-only pages.  Best free document-vision model.
  3. Google Gemini
     — Final fallback when the OpenRouter key is absent or exhausted.
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


# ── Section metadata ──────────────────────────────────────────────────────────

VALID_SECTIONS = {"Sport", "Business", "Vibez!", "AgriToday", "News"}

SECTION_ALIASES = {
    "sport": "Sport", "sports": "Sport",
    "business": "Business", "economy": "Business", "finance": "Business",
    "financial": "Business", "tenders": "Business", "trade": "Business",
    "vibez": "Vibez!", "vibez!": "Vibez!", "vibe": "Vibez!",
    "entertainment": "Vibez!", "lifestyle": "Vibez!", "culture": "Vibez!",
    "agritoday": "AgriToday", "agri today": "AgriToday", "agri": "AgriToday",
    "agriculture": "AgriToday", "farming": "AgriToday", "agricultural": "AgriToday",
    "news": "News", "general": "News", "national": "News", "politics": "News",
    "community": "News", "local": "News", "government": "News",
}


# ── Prompts ───────────────────────────────────────────────────────────────────

# Used when we have extracted text from the PDF
TEXT_CLASSIFICATION_PROMPT = """You are an expert editorial classifier for the New Era newspaper in Namibia.

Your only job is to read the newspaper page text below and determine which of the five sections it belongs to:

  • News      — general news, politics, government, crime, courts, health, education, national/regional affairs
  • Sport     — football, rugby, cricket, athletics, netball, basketball, any sports content
  • Business  — economy, finance, markets, tenders, accountants, tax, companies, trade, investment, stock exchange, banking
  • Vibez!    — entertainment, celebrities, music, fashion, movies, arts, concerts, lifestyle, culture
  • AgriToday — farming, agriculture, livestock, crops, harvest, irrigation, rural development, food security

IMPORTANT RULES:
- Pages with tender notices, financial reports, company announcements, or accounting content → Business
- Pages about athletes, match results, league tables, sports fixtures → Sport
- Pages about musicians, actors, fashion, nightlife, events → Vibez!
- Pages about farming, cattle, crops, green schemes → AgriToday
- Everything else → News

Newspaper text to classify:
---
{text}
---

Respond ONLY with a valid JSON object — no explanation, no markdown:
{{"page_number": <integer or 0>, "section": "<one of: News|Sport|Business|Vibez!|AgriToday>", "headline": "<most prominent headline>", "tags": ["tag1","tag2","tag3","tag4","tag5"]}}"""


# Used when we send an image to a vision model
VISION_PROMPT = """You are an expert editorial analyst for the New Era newspaper in Namibia.

You are given an image of a single printed newspaper page. Read ALL text visible on the page carefully — headers, banners, headlines, body text, captions.

Determine the following four fields:

1. PAGE NUMBER
   - Find the page number printed on the page (corner, top or bottom). It is a small whole number like 2, 5, 12.
   - IGNORE prices (N$), years (2026), phone numbers, statistics.
   - Return 0 if you cannot find it.

2. SECTION — this is the most important field.
   STEP 1: Look for a section banner or header at the TOP of the page. It will say one of:
   Sport, Business, Vibez!, AgriToday, News
   If you see it clearly, use that exact value.

   STEP 2: If no banner is visible, classify by reading the content:
   - "Business"  → tender notices, financial reports, company news, economy, tax, accounting, markets, tenders
   - "Sport"     → match results, sports fixtures, athletes, league tables, player news
   - "Vibez!"    → entertainment, celebrities, music, fashion, movies, arts, lifestyle
   - "AgriToday" → farming, livestock, crops, agriculture, rural development, irrigation
   - "News"      → everything else: politics, government, crime, courts, health, education

   CRITICAL: Tender notices and financial pages MUST be classified as "Business" — not "News".

3. HEADLINE — copy the single largest, most prominent headline exactly.

4. TAGS — exactly 5 short keywords describing the page content.

Respond ONLY with valid JSON. No markdown, no explanation:
{"page_number": 5, "section": "Business", "headline": "New tender for road construction", "tags": ["tender","roads","construction","namibia","government"]}"""


# ── Gemini fallback client ────────────────────────────────────────────────────

_gemini_client = None


def configure_gemini(api_key: str | None = None) -> None:
    """Configure vision clients. Gemini is always prepared as a final fallback."""
    global _gemini_client
    openrouter_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    vision_model   = os.getenv("OPENROUTER_VISION_MODEL", "qwen/qwen2.5-vl-72b-instruct:free")
    deepseek_model = os.getenv("DEEPSEEK_MODEL", "deepseek/deepseek-chat-v3-0324:free")

    if openrouter_key:
        logger.info("Vision analysis: DeepSeek/%s (text) + %s (image)", deepseek_model, vision_model)

    key = api_key or os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        if not openrouter_key:
            logger.warning("Neither OPENROUTER_API_KEY nor GEMINI_API_KEY is set")
        return
    try:
        from google import genai
        _gemini_client = genai.Client(api_key=key)
        logger.info("Gemini client ready (fallback)")
    except Exception as exc:
        logger.warning("Failed to create Gemini client: %s", exc)


# ── Public entry point ────────────────────────────────────────────────────────

def analyze_page(image_path: str, retries: int = 2, extracted_text: str = "") -> dict:
    """
    Analyze a newspaper page.
    - If `extracted_text` is provided (digital PDF): use DeepSeek text classification.
    - Otherwise: send the image to Qwen VL 72B vision.
    - Final fallback: Google Gemini.
    """
    openrouter_key = os.getenv("OPENROUTER_API_KEY", "").strip()

    if openrouter_key:
        # Path A: We have real text — use DeepSeek for smart classification
        if extracted_text and len(extracted_text.strip()) > 50:
            try:
                return _classify_with_deepseek(extracted_text, image_path, openrouter_key, retries)
            except Exception as exc:
                logger.warning("DeepSeek text classification failed (%s) — falling back to vision", exc)

        # Path B: Scanned/image page — use Qwen VL 72B vision
        try:
            return _analyze_with_vision(image_path, openrouter_key, retries)
        except RuntimeError as exc:
            err_str = str(exc)
            if "401" in err_str or "403" in err_str or "Unauthorized" in err_str:
                logger.warning("OpenRouter key invalid (401/403) — falling back to Gemini for %s", image_path)
                return _analyze_with_gemini(image_path, retries)
            raise

    return _analyze_with_gemini(image_path, retries)


# ── DeepSeek text classification ─────────────────────────────────────────────

def _classify_with_deepseek(text: str, image_path: str, api_key: str, retries: int) -> dict:
    """
    Use DeepSeek (fast text model) to classify a page from its extracted text.
    This is far more accurate than keyword matching and faster than vision models.
    """
    model = os.getenv("DEEPSEEK_MODEL", "deepseek/deepseek-chat-v3-0324:free")

    # Truncate to first 2000 chars — section info is always at the top
    truncated_text = text.strip()[:2000]
    prompt = TEXT_CLASSIFICATION_PROMPT.format(text=truncated_text)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type":  "application/json",
        "HTTP-Referer":  "https://newera-editorial.app",
        "X-Title":       "NewEra Editorial Classifier",
    }
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.0,  # Deterministic — classification should not be creative
        "max_tokens": 200,
    }

    logger.info("Classifying page via DeepSeek/%s (text mode)", model)
    last_error = None

    for attempt in range(retries):
        try:
            resp = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers, json=payload, timeout=30,
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"].strip()

            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
            m   = re.search(r"\{.*\}", raw, re.DOTALL)
            if m:
                raw = m.group(0)

            data   = json.loads(raw)
            result = _validate_and_normalise(data, image_path)
            logger.info("DeepSeek classified → section=%s", result["section"])
            return result

        except json.JSONDecodeError as exc:
            last_error = exc
            logger.warning("DeepSeek non-JSON (attempt %d): %s", attempt + 1, exc)
            if attempt < retries - 1:
                time.sleep(0.5)
        except Exception as exc:
            last_error = exc
            logger.error("DeepSeek error (attempt %d): %s", attempt + 1, exc)
            if attempt < retries - 1:
                time.sleep(1)

    raise RuntimeError(f"DeepSeek classification failed after {retries} attempts: {last_error}")


# ── Qwen VL 72B vision analysis ───────────────────────────────────────────────

def _analyze_with_vision(image_path: str, api_key: str, retries: int) -> dict:
    """
    Send the page image to a vision model (default: Qwen VL 72B).
    Images are prepared at higher quality so the model can actually read the text.
    """
    model = os.getenv("OPENROUTER_VISION_MODEL", "qwen/qwen2.5-vl-72b-instruct:free")

    # Prepare image — higher quality than before so text is readable
    img = Image.open(image_path)
    if img.mode in ("P", "RGBA", "L"):
        img = img.convert("RGB")

    # Use 1400px max — enough to read newspaper text clearly
    MAX_DIM = 1400
    if max(img.size) > MAX_DIM:
        img.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=72, optimize=True)
    image_bytes = buf.getvalue()
    image_b64   = base64.b64encode(image_bytes).decode("utf-8")
    data_url    = f"data:image/jpeg;base64,{image_b64}"

    logger.info("Sending image to %s (%d KB)", model, len(image_bytes) // 1024)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type":  "application/json",
        "HTTP-Referer":  "https://newera-editorial.app",
        "X-Title":       "NewEra Editorial Vision",
    }
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_url}},
                    {"type": "text",      "text": VISION_PROMPT},
                ],
            }
        ],
        "temperature": 0.0,
        "max_tokens":  300,
    }

    last_error = None
    for attempt in range(retries):
        try:
            resp = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers, json=payload, timeout=120,
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"].strip()

            if not raw:
                raise ValueError("Empty response from vision model")

            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
            m   = re.search(r"\{.*\}", raw, re.DOTALL)
            if m:
                raw = m.group(0)

            data   = json.loads(raw)
            result = _validate_and_normalise(data, image_path)
            logger.info("Vision (%s) → section=%s (attempt %d)", model, result["section"], attempt + 1)
            return result

        except json.JSONDecodeError as exc:
            last_error = exc
            logger.warning("Non-JSON from vision model (attempt %d): %s", attempt + 1, exc)
            if attempt < retries - 1:
                time.sleep(1)
        except Exception as exc:
            last_error = exc
            logger.error("Vision model error (attempt %d): %s", attempt + 1, exc)
            if attempt < retries - 1:
                time.sleep(1)

    raise RuntimeError(f"Vision analysis failed after {retries} attempts: {last_error}")


# ── Google Gemini final fallback ──────────────────────────────────────────────

def _analyze_with_gemini(image_path: str, retries: int) -> dict:
    """Final fallback using Google Gemini when OpenRouter is unavailable."""
    if _gemini_client is None:
        raise RuntimeError("No vision model configured. Set OPENROUTER_API_KEY or GEMINI_API_KEY in .env")

    from google.genai import types

    with open(image_path, "rb") as f:
        image_bytes = f.read()

    mime_type = "image/jpeg" if image_path.lower().endswith((".jpg", ".jpeg")) else "image/png"
    if mime_type == "image/png":
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode in ("P", "RGBA"):
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=72)
        image_bytes = buf.getvalue()
        mime_type   = "image/jpeg"

    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
    config     = types.GenerateContentConfig(temperature=0.0)
    model_chain = ["gemini-2.0-flash-lite", "gemini-2.0-flash"]
    last_error  = None

    for model_name in model_chain:
        for attempt in range(retries):
            try:
                response = _gemini_client.models.generate_content(
                    model=model_name,
                    contents=[image_part, VISION_PROMPT],
                    config=config,
                )
                raw = (response.text or "").strip()
                if not raw:
                    raise ValueError("Empty Gemini response")

                raw = re.sub(r"^```(?:json)?\s*", "", raw)
                raw = re.sub(r"\s*```$", "", raw)
                m   = re.search(r"\{.*\}", raw, re.DOTALL)
                if m:
                    raw = m.group(0)

                data   = json.loads(raw)
                result = _validate_and_normalise(data, image_path)
                logger.info("Gemini fallback (%s) → section=%s", model_name, result["section"])
                return result

            except json.JSONDecodeError as exc:
                last_error = exc
                if attempt < retries - 1:
                    time.sleep(0.5)
            except Exception as exc:
                last_error = exc
                is_quota = "429" in str(exc) or "RESOURCE_EXHAUSTED" in str(exc)
                logger.error("Gemini %s attempt %d: %s", model_name, attempt + 1, exc)
                if is_quota:
                    break
                if attempt < retries - 1:
                    time.sleep(0.5)

    raise RuntimeError(f"All Gemini models exhausted. Last error: {last_error}")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve_section(raw: str) -> str:
    if raw in VALID_SECTIONS:
        return raw
    return SECTION_ALIASES.get(raw.strip().lower(), "News")


def _validate_and_normalise(data: dict, image_path: str) -> dict:
    raw_num = data.get("page_number", 0)
    if raw_num in ("unknown", None, ""):
        page_number = 0
    else:
        try:
            page_number = int(raw_num)
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
        "section":     section,
        "tags":        tags,
        "headline":    headline,
    }
