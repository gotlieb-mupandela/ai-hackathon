"""
WhatsApp notification system for NewEra Editorial.

Sends edition links to subscribers when a new edition is published.
Uses direct HTTP requests via the Green API (free tier) or falls back
to URL-only logging when no API is configured.

Each subscriber can have section preferences — they only receive the
sections they subscribed to.

Environment variables (add to .env):
  WHATSAPP_API_URL      - Green API instance URL (e.g. https://7103.api.greenapi.com)
  WHATSAPP_ID_INSTANCE  - Green API instance ID
  WHATSAPP_API_TOKEN    - Green API token
"""

import json
import logging
import os
import random
import string
import time
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

SUBSCRIBERS_FILE = Path(__file__).parent / "subscribers.json"

ALL_SECTIONS = ["full_paper", "news", "sport", "business", "vibez", "agritoday"]


# ─── Password helpers ────────────────────────────────────────

def generate_password(length: int = 6) -> str:
    """Generate a random numeric password for a subscriber's PDF protection."""
    return "".join(random.choices(string.digits, k=length))


def get_password(number: str) -> str | None:
    """Return the PDF password for a subscriber, or None if not found."""
    data = load_subscribers()
    return data.get("passwords", {}).get(number.strip())


# ─── Subscriber persistence ─────────────────────────────────

def load_subscribers() -> dict:
    """Load subscribers data from JSON file."""
    default = {
        "numbers": [],
        "auto_send": True,
        "preferences": {},
        "passwords": {},
    }

    if not SUBSCRIBERS_FILE.exists():
        try:
            save_subscribers_data(default)
        except Exception as exc:
            logger.warning("Could not create subscribers.json: %s", exc)
        return default

    try:
        with open(SUBSCRIBERS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if "numbers" not in data:
            data["numbers"] = []
        if "auto_send" not in data:
            data["auto_send"] = True
        if "preferences" not in data:
            data["preferences"] = {}
        if "passwords" not in data:
            data["passwords"] = {}
        return data
    except (json.JSONDecodeError, ValueError) as exc:
        logger.error("subscribers.json is corrupt (%s) — resetting to defaults", exc)
        return default
    except (PermissionError, OSError) as exc:
        logger.error("Cannot read subscribers.json: %s", exc)
        raise RuntimeError(f"Cannot read subscribers file: {exc}") from exc


def save_subscribers_data(data: dict) -> None:
    """Write full subscriber data to JSON file."""
    try:
        SUBSCRIBERS_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = SUBSCRIBERS_FILE.with_suffix(".json.tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        tmp_path.replace(SUBSCRIBERS_FILE)
    except (PermissionError, OSError) as exc:
        logger.error("Cannot write subscribers.json: %s", exc)
        raise RuntimeError(f"Cannot save subscribers file: {exc}") from exc


def get_numbers() -> list[str]:
    return load_subscribers().get("numbers", [])


def add_number(number: str) -> dict:
    """Add a number (default: full_paper only), auto-generate a PDF password, and return updated data."""
    data = load_subscribers()
    cleaned = number.strip()
    if cleaned and cleaned not in data["numbers"]:
        data["numbers"].append(cleaned)
        if cleaned not in data["preferences"]:
            data["preferences"][cleaned] = ["full_paper"]
        # Auto-generate a unique PDF password for this subscriber
        if cleaned not in data.get("passwords", {}):
            if "passwords" not in data:
                data["passwords"] = {}
            data["passwords"][cleaned] = generate_password()
        save_subscribers_data(data)
    return data


def remove_number(number: str) -> dict:
    """Remove a number, its preferences, and its password. Returns updated data."""
    data = load_subscribers()
    cleaned = number.strip()
    if cleaned in data["numbers"]:
        data["numbers"].remove(cleaned)
        data["preferences"].pop(cleaned, None)
        data.get("passwords", {}).pop(cleaned, None)
        save_subscribers_data(data)
    return data


def update_preferences(number: str, sections: list[str]) -> dict:
    """Set which sections a subscriber receives."""
    data = load_subscribers()
    cleaned = number.strip()
    if cleaned not in data["numbers"]:
        raise ValueError(f"Number {cleaned} is not a subscriber")
    valid = [s for s in sections if s in ALL_SECTIONS]
    if not valid:
        valid = ["full_paper"]
    data["preferences"][cleaned] = valid
    save_subscribers_data(data)
    return data


# ─── Section URL helpers ─────────────────────────────────────

SECTION_FILE_MAP = {
    "full_paper": "full_paper.pdf",
    "news":       "news.pdf",
    "sport":      "sport.pdf",
    "business":   "business.pdf",
    "vibez":      "vibez.pdf",
    "agritoday":  "agritoday.pdf",
}

SECTION_LABEL_MAP = {
    "full_paper": "Full Newspaper",
    "news":       "NewEra News",
    "sport":      "NewEra Sport",
    "business":   "NewEra Business",
    "vibez":      "NewEra Vibez!",
    "agritoday":  "NewEra AgriToday",
}


def _build_section_url(edition_date: str, section_key: str) -> str:
    """Construct the public Supabase Storage URL for a specific section PDF."""
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    filename = SECTION_FILE_MAP.get(section_key, "full_paper.pdf")
    return f"{supabase_url}/storage/v1/object/public/outputs/{edition_date}/{filename}"


def _build_message(edition_date: str, sections: list[str]) -> str:
    """Build the WhatsApp message text with download links for chosen sections."""
    if not sections:
        sections = ["full_paper"]

    lines = [f"*New Era Edition — {edition_date}*\nYour edition is ready!\n"]
    for section_key in sections:
        label = SECTION_LABEL_MAP.get(section_key, section_key)
        url = _build_section_url(edition_date, section_key)
        lines.append(f"*{label}:*\n{url}")

    return "\n\n".join(lines)


# ─── WhatsApp sending via Green API ──────────────────────────

def _get_api_config() -> dict | None:
    """Return Green API config or None if not configured."""
    api_url    = os.getenv("WHATSAPP_API_URL", "").strip().rstrip("/")
    instance   = os.getenv("WHATSAPP_ID_INSTANCE", "").strip()
    api_token  = os.getenv("WHATSAPP_API_TOKEN", "").strip()

    if api_url and instance and api_token:
        return {"url": api_url, "instance": instance, "token": api_token}
    return None


def _normalize_phone(phone: str) -> str:
    """Convert +264812345678 to 264812345678 (strip leading +)."""
    return phone.lstrip("+").replace(" ", "").replace("-", "")


def _send_via_green_api(phone: str, message: str, config: dict) -> bool:
    """Send a WhatsApp message using Green API. Returns True on success."""
    chat_id = f"{_normalize_phone(phone)}@c.us"
    endpoint = f"{config['url']}/waInstance{config['instance']}/sendMessage/{config['token']}"

    payload = {
        "chatId": chat_id,
        "message": message,
    }

    try:
        resp = requests.post(endpoint, json=payload, timeout=30)
        resp.raise_for_status()
        result = resp.json()
        logger.info("Green API response for %s: %s", phone, result)
        return True
    except requests.RequestException as exc:
        logger.error("Green API failed for %s: %s", phone, exc)
        return False


def _send_via_direct_link(phone: str, message: str) -> bool:
    """
    Fallback: use wa.me link generation (logs the link for manual sending).
    Returns True — we log the link so the admin can click it.
    """
    import urllib.parse
    encoded = urllib.parse.quote(message)
    clean_phone = _normalize_phone(phone)
    link = f"https://wa.me/{clean_phone}?text={encoded}"
    logger.info("WhatsApp link for %s: %s", phone, link)
    return True


def send_whatsapp_message(phone: str, edition_date: str, sections: list[str] = None) -> bool:
    """Send a WhatsApp message to a single subscriber with their section links."""
    message = _build_message(edition_date, sections)
    config = _get_api_config()

    if config:
        return _send_via_green_api(phone, message, config)
    else:
        logger.warning(
            "No WhatsApp API configured (WHATSAPP_API_URL / WHATSAPP_ID_INSTANCE / WHATSAPP_API_TOKEN). "
            "Using wa.me link fallback."
        )
        return _send_via_direct_link(phone, message)


def send_pdf_to_all(edition_date: str) -> dict:
    """
    Send each subscriber the section PDFs they subscribed to.
    Returns a summary dict.
    """
    data = load_subscribers()
    numbers   = data.get("numbers", [])
    auto_send = data.get("auto_send", True)
    preferences = data.get("preferences", {})

    if not auto_send:
        logger.info("Auto-send is disabled, skipping WhatsApp notifications")
        return {"sent": 0, "failed": 0, "skipped": True}

    if not numbers:
        logger.info("No subscribers to notify")
        return {"sent": 0, "failed": 0, "skipped": False}

    logger.info("Sending to %d subscribers...", len(numbers))
    sent = 0
    failed = 0
    links = []

    config = _get_api_config()
    using_api = config is not None

    for phone in numbers:
        sections = preferences.get(phone, ["full_paper"])
        message = _build_message(edition_date, sections)

        if using_api:
            success = _send_via_green_api(phone, message, config)
            if success:
                sent += 1
            else:
                failed += 1
            time.sleep(2)
        else:
            import urllib.parse
            clean_phone = _normalize_phone(phone)
            encoded = urllib.parse.quote(message)
            link = f"https://wa.me/{clean_phone}?text={encoded}"
            links.append({"phone": phone, "link": link, "sections": sections})
            sent += 1

    logger.info("WhatsApp send complete: %d sent, %d failed, api=%s", sent, failed, using_api)

    result = {"sent": sent, "failed": failed, "using_api": using_api}
    if links:
        result["links"] = links
    return result
