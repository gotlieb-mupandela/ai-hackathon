"""
WhatsApp auto-send via desktop automation.
Downloads the published PDF from Supabase Storage, saves it to ~/Downloads,
then uses pywhatkit + pyautogui to send it to each subscriber via WhatsApp Web.

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

# Disable pyautogui fail-safe pause (we handle our own timing)
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.5


# ─── Subscriber persistence ─────────────────────────────────

def load_subscribers() -> dict:
    """Load subscribers data from JSON file. Returns safe default on any error."""
    default = {"numbers": [], "auto_send": True}

    if not SUBSCRIBERS_FILE.exists():
        try:
            save_subscribers_data(default)
        except Exception as exc:
            logger.warning("Could not create subscribers.json: %s", exc)
        return default

    try:
        with open(SUBSCRIBERS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Ensure required keys exist
        if "numbers" not in data:
            data["numbers"] = []
        if "auto_send" not in data:
            data["auto_send"] = True
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
        # Ensure the parent directory exists
        SUBSCRIBERS_FILE.parent.mkdir(parents=True, exist_ok=True)
        # Write to a temp file first to avoid data loss on crash
        tmp_path = SUBSCRIBERS_FILE.with_suffix(".json.tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        tmp_path.replace(SUBSCRIBERS_FILE)
    except (PermissionError, OSError) as exc:
        logger.error("Cannot write subscribers.json: %s", exc)
        raise RuntimeError(f"Cannot save subscribers file: {exc}") from exc


def get_numbers() -> list[str]:
    return load_subscribers().get("numbers", [])


def add_number(number: str) -> list[str]:
    """Add a number and return updated list."""
    data = load_subscribers()
    cleaned = number.strip()
    if cleaned and cleaned not in data["numbers"]:
        data["numbers"].append(cleaned)
        save_subscribers_data(data)
    return data["numbers"]


def remove_number(number: str) -> list[str]:
    """Remove a number and return updated list."""
    data = load_subscribers()
    cleaned = number.strip()
    if cleaned in data["numbers"]:
        data["numbers"].remove(cleaned)
        save_subscribers_data(data)
    return data["numbers"]


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

    # Save to a temp file
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

def _build_supabase_pdf_url(edition_date: str) -> str:
    """Construct the public Supabase Storage URL for the edition's full_paper.pdf."""
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    # Public URL format: {SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}
    return f"{supabase_url}/storage/v1/object/public/outputs/{edition_date}/full_paper.pdf"


def send_whatsapp_pdf(phone: str, pdf_path: str, edition_date: str) -> None:
    """
    Open WhatsApp Web and send the edition PDF download link to the phone number.
    The Supabase public URL is sent as the message — no file attachment automation needed.
    The subscriber taps the link to download/view the PDF instantly.
    """
    pdf_url = _build_supabase_pdf_url(edition_date)

    message = (
        f"New Era Edition — {edition_date} is ready!\n\n"
        f"Download your copy here:\n{pdf_url}"
    )
    logger.info("Sending WhatsApp PDF link to %s ...", phone)

    pywhatkit.sendwhatmsg_instantly(
        phone_no=phone,
        message=message,
        wait_time=15,
        tab_close=True,   # Close the tab after sending so next number opens cleanly
    )

    # Wait for message to fully send before moving to next recipient
    time.sleep(8)
    logger.info("PDF link sent to %s", phone)


def send_pdf_to_all(edition_date: str) -> dict:
    """
    Full flow: download PDF from Supabase, save to Downloads,
    then send to every subscriber via WhatsApp Web.
    Returns a summary dict.
    """
    data = load_subscribers()
    numbers = data.get("numbers", [])
    auto_send = data.get("auto_send", True)

    if not auto_send:
        logger.info("Auto-send is disabled, skipping WhatsApp notifications")
        return {"sent": 0, "failed": 0, "skipped": True}

    if not numbers:
        logger.info("No subscribers to notify")
        return {"sent": 0, "failed": 0, "skipped": False}

    logger.info("Sending PDF link to %d subscribers...", len(numbers))

    sent = 0
    failed = 0

    for phone in numbers:
        try:
            # Pass empty string for pdf_path — link-based sending doesn't need local file
            send_whatsapp_pdf(phone, "", edition_date)
            sent += 1
            logger.info("Sent link to %s (%d/%d)", phone, sent, len(numbers))
            # Brief pause between sends so browser can close cleanly
            time.sleep(5)
        except Exception as exc:
            failed += 1
            logger.error("Failed to send to %s: %s", phone, exc)

    logger.info("WhatsApp send complete: %d sent, %d failed", sent, failed)
    return {"sent": sent, "failed": failed}
