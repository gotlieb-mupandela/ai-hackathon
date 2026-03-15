"""
WhatsApp notification system for NewEra Editorial.

Sends edition PDFs to subscribers when a new edition is published.
Uses the local whatsapp-web.js agent (free, no API key needed) running
on http://localhost:5000.  Falls back to wa.me link logging when the
agent is not running so the system never hard-fails.

Each subscriber can have section preferences — they only receive the
sections they subscribed to.
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

# Local whatsapp-web.js agent — free, no API key required
WHATSAPP_AGENT_URL = "http://localhost:5000"


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


# ─── Local whatsapp-web.js agent ─────────────────────────────

def _is_agent_ready() -> bool:
    """Check if the local WhatsApp agent is running and authenticated."""
    try:
        resp = requests.get(f"{WHATSAPP_AGENT_URL}/health", timeout=3)
        return resp.ok and resp.json().get("status") == "ready"
    except Exception:
        return False


def _send_via_agent(edition_date: str) -> dict:
    """
    Trigger the local whatsapp-web.js agent to send to all subscribers.
    The agent handles OTP generation, PDF protection, and WhatsApp delivery.
    Returns {'sent': int, 'failed': int}.
    """
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    payload = {
        "edition_date": edition_date,
        "supabase_url": supabase_url,
    }
    resp = requests.post(
        f"{WHATSAPP_AGENT_URL}/send",
        json=payload,
        timeout=300,  # sending can take a few minutes for many subscribers
    )
    resp.raise_for_status()
    result = resp.json()
    logger.info("WhatsApp agent sent: %s", result)
    return result


def _send_via_link_fallback(edition_date: str) -> dict:
    """
    When the local agent is not running, generate one-time PINs and
    log wa.me links so the admin can click them manually to send.
    """
    import urllib.parse
    from pins import generate_pin

    reader_url = os.getenv("READER_URL", "http://localhost:3001/reader")

    data = load_subscribers()
    numbers = data.get("numbers", [])
    if not numbers:
        return {"sent": 0, "failed": 0}

    links = []
    for phone in numbers:
        sections = data.get("preferences", {}).get(phone, ["full_paper"])
        pin = generate_pin(phone, edition_date, sections)
        section_labels = [SECTION_LABEL_MAP.get(s, s) for s in sections]

        message = (
            f"*New Era Edition — {edition_date}*\n\n"
            f"Your one-time reading PIN: *{pin}*\n\n"
            f"Sections: {', '.join(section_labels)}\n\n"
            f"Open this link to read:\n{reader_url}?pin={pin}\n\n"
            f"This PIN can only be used once."
        )

        clean = phone.lstrip("+").replace(" ", "").replace("-", "")
        link = f"https://wa.me/{clean}?text={urllib.parse.quote(message)}"
        links.append({"phone": phone, "link": link, "pin": pin, "sections": section_labels})
        logger.info("WhatsApp manual link for %s (PIN: %s): %s", phone, pin, link)

    logger.warning(
        "WhatsApp agent not running — links logged above. "
        "Start the agent with: cd whatsapp-agent && node server.js"
    )
    return {"sent": 0, "failed": 0, "links": links, "mode": "links_only"}


def send_whatsapp_message(phone: str, edition_date: str, sections: list[str] = None) -> bool:
    """Send a WhatsApp message to a single subscriber (agent must be running)."""
    if not _is_agent_ready():
        logger.warning("WhatsApp agent not ready — cannot send to %s", phone)
        return False
    try:
        _send_via_agent(edition_date)
        return True
    except Exception as exc:
        logger.error("Agent send failed for %s: %s", phone, exc)
        return False


def send_pdf_to_all(edition_date: str) -> dict:
    """
    Send each subscriber the section PDFs they subscribed to.
    Uses the local free whatsapp-web.js agent.
    Falls back to wa.me links if the agent is not running.
    Returns a summary dict.
    """
    data = load_subscribers()
    numbers   = data.get("numbers", [])
    auto_send = data.get("auto_send", True)

    if not auto_send:
        logger.info("Auto-send is disabled, skipping WhatsApp notifications")
        return {"sent": 0, "failed": 0, "skipped": True}

    if not numbers:
        logger.info("No subscribers to notify")
        return {"sent": 0, "failed": 0, "skipped": False}

    logger.info("Sending to %d subscribers...", len(numbers))

    # Try the local free agent first
    if _is_agent_ready():
        try:
            result = _send_via_agent(edition_date)
            sent   = result.get("sent", 0)
            failed = result.get("failed", 0)
            logger.info(
                "WhatsApp send complete: %d sent, %d failed, api=True (local agent)",
                sent, failed,
            )
            return {"sent": sent, "failed": failed, "using_api": True}
        except Exception as exc:
            logger.error("Agent send failed: %s — falling back to links", exc)

    # Agent not available — log wa.me links
    return _send_via_link_fallback(edition_date)
