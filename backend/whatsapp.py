"""
WhatsApp auto-send via desktop automation.
Downloads the published PDF from Supabase Storage, saves it to ~/Downloads,
then uses pywhatkit + pyautogui to send it to each subscriber via WhatsApp Web.

Each subscriber can have section preferences — they only receive the sections
they subscribed to (full_paper, news, sport, business, vibez, agritoday, solzi).
Default when no preference is set: full_paper only.

Requirements:
  - Backend must run on the same machine where WhatsApp Web is logged in.
  - User should not touch mouse/keyboard while sending is in progress.
"""

import json
import logging
import os
import shutil
import time
from pathlib import Path

import pyautogui
import pywhatkit
from supabase import create_client

logger = logging.getLogger(__name__)

SUBSCRIBERS_FILE = Path(__file__).parent / "subscribers.json"

# All available sections subscribers can opt into
ALL_SECTIONS = ["full_paper", "news", "sport", "business", "vibez", "agritoday", "solzi"]

# Disable pyautogui fail-safe pause (we handle our own timing)
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.5


# ─── Subscriber persistence ─────────────────────────────────

def load_subscribers() -> dict:
    """Load subscribers data from JSON file. Returns safe default on any error."""
    default = {
        "numbers": [],
        "auto_send": True,
        # Maps phone → list of section keys they want to receive
        "preferences": {}
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
    """Add a number (default: full_paper only) and return updated subscriber data."""
    data = load_subscribers()
    cleaned = number.strip()
    if cleaned and cleaned not in data["numbers"]:
        data["numbers"].append(cleaned)
        # Default preference: full newspaper
        if cleaned not in data["preferences"]:
            data["preferences"][cleaned] = ["full_paper"]
        save_subscribers_data(data)
    return data


def remove_number(number: str) -> dict:
    """Remove a number and its preferences, return updated data."""
    data = load_subscribers()
    cleaned = number.strip()
    if cleaned in data["numbers"]:
        data["numbers"].remove(cleaned)
        data["preferences"].pop(cleaned, None)
        save_subscribers_data(data)
    return data


def update_preferences(number: str, sections: list[str]) -> dict:
    """Set which sections a subscriber receives. Returns updated data."""
    data = load_subscribers()
    cleaned = number.strip()
    if cleaned not in data["numbers"]:
        raise ValueError(f"Number {cleaned} is not a subscriber")
    # Validate section keys
    valid = [s for s in sections if s in ALL_SECTIONS]
    if not valid:
        valid = ["full_paper"]
    data["preferences"][cleaned] = valid
    save_subscribers_data(data)
    return data


# ─── PDF download from Supabase ──────────────────────────────

def _get_supabase_client():
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
    return create_client(url, key)


def download_pdf_from_supabase(edition_date: str) -> str:
    """
    Download full_paper.pdf from the 'outputs' bucket in Supabase Storage.
    Returns local temp file path.
    """
    supabase = _get_supabase_client()
    storage_path = f"{edition_date}/full_paper.pdf"

    logger.info("Downloading %s from Supabase Storage...", storage_path)
    response = supabase.storage.from_("outputs").download(storage_path)

    if not response:
        raise RuntimeError(f"Empty response downloading {storage_path}")

    import tempfile
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp.write(response)
    tmp.flush()
    tmp.close()
    logger.info("Downloaded PDF to temp: %s (%d bytes)", tmp.name, len(response))
    return tmp.name


def save_pdf_to_downloads(local_pdf_path: str, edition_date: str) -> str:
    """Copy the PDF to the user's Downloads folder with a nice filename."""
    downloads_dir = Path(os.path.expanduser("~")) / "Downloads"
    downloads_dir.mkdir(exist_ok=True)
    filename = f"NewEra_{edition_date}_FullPaper.pdf"
    destination = downloads_dir / filename
    shutil.copy2(local_pdf_path, destination)
    logger.info("PDF saved to Downloads: %s", destination)
    return str(destination)


# ─── WhatsApp sending via desktop automation ─────────────────

# Maps section key → storage filename
SECTION_FILE_MAP = {
    "full_paper": "full_paper.pdf",
    "news":       "news.pdf",
    "sport":      "sport.pdf",
    "business":   "business.pdf",
    "vibez":      "vibez.pdf",
    "agritoday":  "agritoday.pdf",
    "solzi":      "solzi.pdf",
}

SECTION_LABEL_MAP = {
    "full_paper": "Full Newspaper",
    "news":       "NewEra News",
    "sport":      "NewEra Sport",
    "business":   "NewEra Business",
    "vibez":      "NewEra Vibez!",
    "agritoday":  "NewEra AgriToday",
    "solzi":      "NewEra Solzi",
}


def _build_section_url(edition_date: str, section_key: str) -> str:
    """Construct the public Supabase Storage URL for a specific section PDF."""
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    filename = SECTION_FILE_MAP.get(section_key, "full_paper.pdf")
    return f"{supabase_url}/storage/v1/object/public/outputs/{edition_date}/{filename}"


def send_whatsapp_pdf(phone: str, pdf_path: str, edition_date: str, sections: list[str] = None) -> None:
    """
    Send the subscriber their chosen section PDFs via WhatsApp Web link.
    If sections is None or empty, defaults to full_paper.
    """
    if not sections:
        sections = ["full_paper"]

    # Build one URL per subscribed section
    lines = [f"New Era Edition — {edition_date} is ready!\n"]
    for section_key in sections:
        label = SECTION_LABEL_MAP.get(section_key, section_key)
        url = _build_section_url(edition_date, section_key)
        lines.append(f"{label}:\n{url}")

    message = "\n\n".join(lines)
    logger.info("Sending WhatsApp message to %s for sections: %s", phone, sections)

    pywhatkit.sendwhatmsg_instantly(
        phone_no=phone,
        message=message,
        wait_time=15,
        tab_close=True,
    )
    time.sleep(8)
    logger.info("Message sent to %s", phone)


def send_pdf_to_all(edition_date: str) -> dict:
    """
    Send each subscriber the section PDFs they subscribed to.
    Returns a summary dict.
    """
    data = load_subscribers()
    numbers = data.get("numbers", [])
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

    for phone in numbers:
        try:
            sections = preferences.get(phone, ["full_paper"])
            send_whatsapp_pdf(phone, "", edition_date, sections)
            sent += 1
            logger.info("Sent to %s (%d/%d) — sections: %s", phone, sent, len(numbers), sections)
            time.sleep(5)
        except Exception as exc:
            failed += 1
            logger.error("Failed to send to %s: %s", phone, exc)

    logger.info("WhatsApp send complete: %d sent, %d failed", sent, failed)
    return {"sent": sent, "failed": failed}
