"""
One-time PIN management for secure PDF viewing.

Each PIN is valid for exactly ONE use. After the subscriber opens
the PDF through the web reader, the PIN is burned and can never
be used again — even if someone else has the link + PIN.
"""

import json
import logging
import random
import string
import time
from pathlib import Path
from threading import Lock

logger = logging.getLogger(__name__)

PINS_FILE = Path(__file__).parent / "pins.json"
_lock = Lock()


def _load() -> dict:
    if not PINS_FILE.exists():
        return {}
    try:
        with open(PINS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _save(data: dict) -> None:
    PINS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = PINS_FILE.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    tmp.replace(PINS_FILE)


def generate_pin(
    phone: str,
    edition_date: str,
    sections: list[str],
) -> str:
    """
    Create a unique 6-digit PIN for a subscriber/edition/sections combo.
    Returns the PIN string.
    """
    with _lock:
        store = _load()
        pin = "".join(random.choices(string.digits, k=6))
        while pin in store:
            pin = "".join(random.choices(string.digits, k=6))

        store[pin] = {
            "phone": phone,
            "edition_date": edition_date,
            "sections": sections,
            "used": False,
            "created_at": time.time(),
            "used_at": None,
        }
        _save(store)

    logger.info("PIN %s generated for %s (edition %s, %s)", pin, phone, edition_date, sections)
    return pin


def validate_pin(pin: str) -> dict | None:
    """
    Validate and consume a PIN.

    Returns the PIN record (phone, edition_date, sections) if valid.
    Returns None if the PIN does not exist or was already used.
    Marks the PIN as used atomically so it cannot be reused.
    """
    pin = pin.strip()
    with _lock:
        store = _load()
        record = store.get(pin)
        if not record:
            return None
        if record["used"]:
            return None

        record["used"] = True
        record["used_at"] = time.time()
        _save(store)

    logger.info("PIN %s consumed by reader (phone=%s)", pin, record["phone"])
    return record


def check_pin(pin: str) -> dict | None:
    """
    Check a PIN's status without consuming it.
    Returns the record if it exists and is unused, else None.
    """
    pin = pin.strip()
    store = _load()
    record = store.get(pin)
    if not record or record["used"]:
        return None
    return record


def cleanup_old_pins(max_age_hours: int = 48) -> int:
    """Remove PINs older than max_age_hours. Returns count removed."""
    cutoff = time.time() - (max_age_hours * 3600)
    with _lock:
        store = _load()
        old_keys = [k for k, v in store.items() if v.get("created_at", 0) < cutoff]
        for k in old_keys:
            del store[k]
        if old_keys:
            _save(store)
    return len(old_keys)
