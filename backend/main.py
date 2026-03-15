"""
NewEra Editorial System — Backend
PDF analysis via Gemini + WhatsApp subscriber notifications.
"""

import asyncio
import io
import logging
import os
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from pypdf import PdfReader, PdfWriter

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

from supabase import create_client as _create_supabase_client

from gemini import analyze_page, configure_gemini
from whatsapp import (
    add_number,
    get_numbers,
    get_password,
    load_subscribers,
    remove_number,
    save_subscribers_data,
    send_pdf_to_all,
    update_preferences,
)

# PDF-to-image conversion
from pdf2image import convert_from_path
from PIL import Image

POPPLER_PATH = r"C:\poppler\poppler-24.08.0\Library\bin"

app = FastAPI(title="NewEra PDF Analyzer", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Gemini on startup
configure_gemini()

# ─── Section keyword map for PDF text extraction ──────────────────────────────
# Order matters: more specific keywords first to avoid "news" matching "business news"
_SECTION_TEXT_KEYWORDS: list[tuple[str, str]] = [
    # ── "Select X" printed headers — highest priority ────────────────────
    ("select agritoday", "AgriToday"),
    ("select agri today","AgriToday"),
    ("select vibez",     "Vibez!"),
    ("select business",  "Business"),
    ("select sport",     "Sport"),
    ("select news",      "News"),
    # ── AgriToday (most specific — must come first) ──────────────────────
    ("agritoday",        "AgriToday"),
    ("agri today",       "AgriToday"),
    ("agriculture",      "AgriToday"),
    ("agricultural",     "AgriToday"),
    ("farming",          "AgriToday"),
    ("livestock",        "AgriToday"),
    ("crop",             "AgriToday"),
    ("harvest",          "AgriToday"),
    ("irrigation",       "AgriToday"),
    ("green scheme",     "AgriToday"),
    ("farmer",           "AgriToday"),
    ("cattle",           "AgriToday"),
    ("maize",            "AgriToday"),
    ("soil",             "AgriToday"),
    ("fertilizer",       "AgriToday"),
    ("planting season",  "AgriToday"),
    ("food security",    "AgriToday"),
    ("rural",            "AgriToday"),
    # ── Vibez! (entertainment / lifestyle) ──────────────────────────────
    ("vibez",            "Vibez!"),
    ("entertainment",    "Vibez!"),
    ("lifestyle",        "Vibez!"),
    ("celebrity",        "Vibez!"),
    ("fashion",          "Vibez!"),
    ("music",            "Vibez!"),
    ("concert",          "Vibez!"),
    ("festival",         "Vibez!"),
    ("album",            "Vibez!"),
    ("artist",           "Vibez!"),
    ("drama",            "Vibez!"),
    ("comedy",           "Vibez!"),
    ("theatre",          "Vibez!"),
    ("movie",            "Vibez!"),
    ("film",             "Vibez!"),
    ("nightlife",        "Vibez!"),
    ("dance",            "Vibez!"),
    ("culture",          "Vibez!"),
    # ── Business / Finance ───────────────────────────────────────────────
    ("business",         "Business"),
    ("tenders",          "Business"),
    ("tender",           "Business"),
    ("accountant",       "Business"),
    ("accounting",       "Business"),
    ("audit",            "Business"),
    ("finance",          "Business"),
    ("financial",        "Business"),
    ("economy",          "Business"),
    ("economic",         "Business"),
    ("market",           "Business"),
    ("investment",       "Business"),
    ("commerce",         "Business"),
    ("corporate",        "Business"),
    ("stock exchange",   "Business"),
    ("nse",              "Business"),
    ("taxation",         "Business"),
    ("tax",              "Business"),
    ("revenue",          "Business"),
    ("budget",           "Business"),
    ("profit",           "Business"),
    ("loss",             "Business"),
    ("assets",           "Business"),
    ("banking",          "Business"),
    ("insurance",        "Business"),
    ("inflation",        "Business"),
    ("gdp",              "Business"),
    ("trade",            "Business"),
    ("import",           "Business"),
    ("export",           "Business"),
    ("tender notice",    "Business"),
    ("annual report",    "Business"),
    ("procurement",      "Business"),
    ("quotation",        "Business"),
    # ── Sport ────────────────────────────────────────────────────────────
    ("sport",            "Sport"),
    ("football",         "Sport"),
    ("soccer",           "Sport"),
    ("rugby",            "Sport"),
    ("cricket",          "Sport"),
    ("athletics",        "Sport"),
    ("marathon",         "Sport"),
    ("boxing",           "Sport"),
    ("swimming",         "Sport"),
    ("tennis",           "Sport"),
    ("golf",             "Sport"),
    ("basketball",       "Sport"),
    ("volleyball",       "Sport"),
    ("cycling",          "Sport"),
    ("championship",     "Sport"),
    ("league",           "Sport"),
    ("tournament",       "Sport"),
    ("fixture",          "Sport"),
    ("stadium",          "Sport"),
    ("coach",            "Sport"),
    ("match result",     "Sport"),
    ("goal",             "Sport"),
    ("kick-off",         "Sport"),
    ("handball",         "Sport"),
    ("netball",          "Sport"),
    # ── News (catch-all — must be last) ──────────────────────────────────
    ("news",             "News"),
    ("namibia",          "News"),
    ("government",       "News"),
    ("parliament",       "News"),
    ("minister",         "News"),
    ("president",        "News"),
    ("police",           "News"),
    ("court",            "News"),
    ("crime",            "News"),
    ("election",         "News"),
    ("municipality",     "News"),
    ("health",           "News"),
    ("education",        "News"),
    ("school",           "News"),
    ("hospital",         "News"),
    ("policy",           "News"),
    ("legislation",      "News"),
    ("region",           "News"),
    ("district",         "News"),
]


def _detect_select_header(text: str) -> str | None:
    """
    Detect the 'Select <Section>' header printed at the top of every
    New Era sectioned page.  This is the ONLY authoritative signal —
    it must NEVER be overridden by keyword matching or AI guessing.

    Returns the canonical section name, or None if no header is found.
    """
    lower = text.lower()
    # Order matters: most-specific first
    if "select agritoday" in lower or "select agri today" in lower:
        return "AgriToday"
    if "select vibez" in lower:
        return "Vibez!"
    if "select business" in lower:
        return "Business"
    if "select sport" in lower:
        return "Sport"
    if "select news" in lower:
        return "News"
    return None


def _detect_section_from_filename(filename: str) -> str | None:
    """
    Derive section from the PDF filename when the filename itself carries
    a section keyword (e.g. 'Select Business p3.pdf', 'NE_sport_05.pdf').
    Returns canonical section name, or None.
    """
    name = filename.replace(".pdf", "").replace(".PDF", "").lower()
    if "agritoday" in name or "agri today" in name or "agri" in name:
        return "AgriToday"
    if "vibez" in name:
        return "Vibez!"
    if "business" in name:
        return "Business"
    if "sport" in name:
        return "Sport"
    if "news" in name:
        return "News"
    return None


def _extract_section_from_pdf_bytes(pdf_bytes: bytes) -> str | None:
    """
    Try to extract a section keyword from the first page's embedded text.
    Returns the matched section name, or None if the PDF is image-based.
    This is instant (~5ms) — no AI call needed.
    """
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        if not reader.pages:
            return None
        text = (reader.pages[0].extract_text() or "").lower()
        if not text.strip():
            return None  # Image-only PDF — fall through to AI vision
        for keyword, section in _SECTION_TEXT_KEYWORDS:
            if keyword in text:
                return section
    except Exception:
        pass
    return None


def _extract_page_number_from_pdf_bytes(pdf_bytes: bytes) -> int:
    """
    Attempt to read the page number from embedded PDF text.
    Looks for patterns like 'Page 5', 'p.5', or lone small integers near edges.
    Returns 0 if not found.
    """
    import re
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        if not reader.pages:
            return 0
        text = (reader.pages[0].extract_text() or "")
        match = re.search(r'\bpage\s*(\d{1,3})\b', text, re.IGNORECASE)
        if match:
            return int(match.group(1))
    except Exception:
        pass
    return 0


def _process_one_page_sync(filename: str, pdf_bytes: bytes) -> dict:
    """
    Synchronous worker for a single page — run inside a ThreadPoolExecutor.

    Classification strategy:
      1. Extract embedded text from PDF (instant, ~5ms).
         - If meaningful text found → send to DeepSeek for AI-powered classification.
           DeepSeek reads the actual content and reasons about the section accurately.
         - If no text (scanned page) → convert to high-quality image + Qwen VL 72B vision.
      2. Google Gemini as final fallback.
    """
    page_number = _extract_page_number_from_pdf_bytes(pdf_bytes)

    # ── GUARD 1: Filename carries a section keyword ───────────────────────────
    filename_section = _detect_section_from_filename(filename)

    # Always extract the full raw text — pass it to DeepSeek even if keyword matching misses it
    extracted_text = ""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(pdf_bytes))
        if reader.pages:
            extracted_text = (reader.pages[0].extract_text() or "").strip()
    except Exception:
        pass

    # ── GUARD 2: "Select <Section>" header printed on the page ───────────────
    # This is the authoritative section marker used by New Era newspaper.
    # It must NEVER be overridden by AI — return immediately.
    header_section = _detect_select_header(extracted_text)
    if header_section:
        logger.info(
            "Select-header '%s' detected — skipping AI for %s", header_section, filename
        )
        return {
            "filename":    filename,
            "page_number": page_number,
            "section":     header_section,
            "headline":    "",
            "tags":        [],
            "method":      "select_header",
        }

    # If filename gave us a clear section and text doesn't contradict, trust it
    if filename_section and not extracted_text.strip():
        logger.info(
            "Filename section '%s' used (no embedded text) for %s", filename_section, filename
        )
        return {
            "filename":    filename,
            "page_number": page_number,
            "section":     filename_section,
            "headline":    "",
            "tags":        [],
            "method":      "filename",
        }

    has_real_text = len(extracted_text) > 50  # Scanned PDFs give <50 chars (just metadata)

    if has_real_text:
        # Path A: Digital PDF — let DeepSeek read and reason about the text
        logger.info("Text available (%d chars) — using DeepSeek for %s", len(extracted_text), filename)
        tmp_pdf_path = None
        tmp_img_path = None
        try:
            # Still need an image for page_number if not found in text
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_pdf:
                tmp_pdf.write(pdf_bytes)
                tmp_pdf_path = tmp_pdf.name

            images = convert_from_path(
                tmp_pdf_path, dpi=120, first_page=1, last_page=1,
                poppler_path=POPPLER_PATH, thread_count=2,
            )
            img = images[0] if images else None
            if img:
                with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_img:
                    img.save(tmp_img, "JPEG", quality=72, optimize=True)
                    tmp_img.flush()
                    os.fsync(tmp_img.fileno())
                    tmp_img_path = tmp_img.name

            result = analyze_page(
                tmp_img_path or "",
                retries=2,
                extracted_text=extracted_text,
            )
            if not page_number and result.get("page_number"):
                page_number = result["page_number"]
            result["filename"]    = filename
            result["page_number"] = page_number or result.get("page_number", 0)
            result["method"]      = "deepseek"
            logger.info("DeepSeek classified [%s] p%s — %s", result["section"], page_number or "?", filename)
            return result

        except Exception as exc:
            logger.warning("DeepSeek path failed for %s (%s) — falling back to vision", filename, exc)
        finally:
            for p in (tmp_pdf_path, tmp_img_path):
                if p:
                    try:
                        os.unlink(p)
                    except Exception:
                        pass

    # Path B: Scanned/image PDF — convert to high-quality image for Qwen VL 72B
    tmp_pdf_path = None
    tmp_img_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_pdf:
            tmp_pdf.write(pdf_bytes)
            tmp_pdf_path = tmp_pdf.name

        # Higher DPI so text in the image is legible for the vision model
        images = convert_from_path(
            tmp_pdf_path, dpi=150, first_page=1, last_page=1,
            poppler_path=POPPLER_PATH, thread_count=2,
        )
        if not images:
            raise ValueError("Could not convert PDF to image")

        img = images[0]
        # Keep up to 1400px — Qwen VL 72B needs to read the text clearly
        MAX_DIM = 1400
        if max(img.size) > MAX_DIM:
            img.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_img:
            img.save(tmp_img, "JPEG", quality=72, optimize=True)
            tmp_img.flush()
            os.fsync(tmp_img.fileno())
            tmp_img_path = tmp_img.name

        result = analyze_page(tmp_img_path, retries=2, extracted_text="")
        result["filename"]    = filename
        result["page_number"] = page_number or result.get("page_number", 0)
        result["method"]      = "vision"
        logger.info("Vision classified [%s] p%s — %s", result["section"], page_number or "?", filename)
        return result

    except Exception as exc:
        logger.error("_process_one_page_sync failed for %s: %s", filename, exc)
        return {
            "filename":    filename,
            "page_number": page_number,
            "section":     "News",
            "headline":    "",
            "tags":        [],
            "method":      "error",
            "error":       str(exc),
        }
    finally:
        for p in (tmp_pdf_path, tmp_img_path):
            if p:
                try:
                    os.unlink(p)
                except Exception:
                    pass


@app.get("/")
async def health_check():
    return {"status": "ok", "service": "NewEra PDF Analyzer"}


@app.post("/analyze")
async def analyze_pdf(file: UploadFile = File(...)):
    """
    Accept a PDF file, convert to image, analyze with Gemini.
    Returns: { page_number, section, headline, tags }
    No auth required — frontend handles auth via Supabase.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    try:
        content = await file.read()
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_pdf:
            tmp_pdf.write(content)
            tmp_pdf_path = tmp_pdf.name

        # Low DPI + small image = fast upload to vision API
        images = convert_from_path(
            tmp_pdf_path, dpi=100, first_page=1, last_page=1,
            poppler_path=POPPLER_PATH,
            thread_count=4,
        )
        if not images:
            raise ValueError("Could not convert PDF to image")

        img = images[0]

        # Keep images small — AI only needs to read text, not pixel-perfect detail
        MAX_DIM = 900
        if max(img.size) > MAX_DIM:
            img.thumbnail((MAX_DIM, MAX_DIM))

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_img:
            img.save(tmp_img, "JPEG", quality=45, optimize=True)
            tmp_img.flush()
            os.fsync(tmp_img.fileno())
            tmp_img_path = tmp_img.name

        result = analyze_page(tmp_img_path)

        # Cleanup temp files
        try:
            os.unlink(tmp_pdf_path)
            os.unlink(tmp_img_path)
        except Exception:
            pass

        logger.info(
            "Analyzed %s → p%s [%s] \"%s\"",
            file.filename,
            result.get("page_number"),
            result.get("section"),
            (result.get("headline") or "")[:60],
        )

        return result

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Analysis failed for %s: %s", file.filename, exc)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(exc)}")


# ─── Batch Analysis Endpoint ─────────────────────────────────────────────────


@app.post("/pipeline/analyze-all")
async def analyze_all_pages(files: list[UploadFile] = File(...)):
    """
    Analyze all uploaded PDF pages in a single request.

    Strategy per page (in parallel):
      1. PDF text extraction — instant, no API call (digital PDFs).
      2. AI vision fallback — only for image-based/scanned PDFs.

    Returns a list of results aligned with the uploaded files order:
      [{ filename, page_number, section, headline, tags, method }, ...]
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    # Read all file bytes concurrently (async I/O)
    file_data: list[tuple[str, bytes]] = []
    for f in files:
        content = await f.read()
        file_data.append((f.filename or "unknown.pdf", content))

    # Process all pages in parallel using a thread pool.
    # ThreadPoolExecutor is required because pdf2image (Poppler) and pypdf are
    # CPU/IO-bound blocking operations not suitable for asyncio directly.
    loop = asyncio.get_event_loop()
    max_workers = min(len(file_data), 12)  # Cap at 12 to avoid overwhelming the API

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        tasks = [
            loop.run_in_executor(pool, _process_one_page_sync, filename, pdf_bytes)
            for filename, pdf_bytes in file_data
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    # Replace any exceptions with a fallback error result
    output = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            filename = file_data[i][0] if i < len(file_data) else "unknown.pdf"
            logger.error("analyze-all failed for %s: %s", filename, result)
            output.append({
                "filename": filename,
                "page_number": 0,
                "section": "News",
                "headline": "",
                "tags": [],
                "method": "error",
                "error": str(result),
            })
        else:
            output.append(result)

    text_count  = sum(1 for r in output if r.get("method") == "text")
    vision_count = sum(1 for r in output if r.get("method") == "vision")
    error_count  = sum(1 for r in output if r.get("method") == "error")
    logger.info(
        "analyze-all complete: %d pages (%d text, %d vision, %d error)",
        len(output), text_count, vision_count, error_count,
    )
    return output


# ─── PDF Protection Endpoint ─────────────────────────────────────────────────


class ProtectPdfBody(BaseModel):
    url: str       # Public Supabase storage URL of the PDF
    password: str  # Subscriber's unique password


@app.post("/protect-pdf")
async def protect_pdf(body: ProtectPdfBody):
    """
    Download a PDF from a public URL and return a password-protected copy.
    The subscriber must enter their password to open the PDF.
    Prevents casual forwarding — recipient needs the password to view it.
    """
    if not body.url or not body.password:
        raise HTTPException(status_code=400, detail="url and password are required")

    try:
        import requests as _req
        resp = _req.get(body.url, timeout=30)
        resp.raise_for_status()
        pdf_bytes = resp.content
    except Exception as exc:
        logger.error("protect-pdf: download failed (%s): %s", body.url, exc)
        raise HTTPException(status_code=502, detail=f"Could not download PDF: {exc}")

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        # RC4-128 has the widest support across all PDF viewers including older mobile apps
        writer.encrypt(body.password, algorithm="RC4-128")
        buf = io.BytesIO()
        writer.write(buf)
        protected_bytes = buf.getvalue()
    except Exception as exc:
        logger.error("protect-pdf: encryption failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"PDF encryption failed: {exc}")

    logger.info("protect-pdf: encrypted %d bytes with password", len(protected_bytes))
    return Response(
        content=protected_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="edition_protected.pdf"'},
    )


# ─── WhatsApp Subscriber Endpoints ──────────────────────────


class PhoneBody(BaseModel):
    phone: str


class PreferencesBody(BaseModel):
    phone: str
    sections: list[str]


class NotifyBody(BaseModel):
    edition_date: str


@app.get("/subscribers")
async def list_subscribers():
    """Return full subscriber data: numbers, auto_send, preferences."""
    try:
        return load_subscribers()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/subscribers/add")
async def add_subscriber(body: PhoneBody):
    """Add a phone number with default preference (full_paper)."""
    if not body.phone.strip():
        raise HTTPException(status_code=400, detail="Phone number is required")
    try:
        data = add_number(body.phone)
        return data
    except RuntimeError as exc:
        logger.error("add_subscriber failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/subscribers/remove")
async def remove_subscriber(body: PhoneBody):
    """Remove a phone number and its preferences."""
    try:
        data = remove_number(body.phone)
        return data
    except RuntimeError as exc:
        logger.error("remove_subscriber failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/subscribers/preferences")
async def set_subscriber_preferences(body: PreferencesBody):
    """Update which sections a subscriber receives."""
    try:
        data = update_preferences(body.phone, body.sections)
        return data
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        logger.error("set_preferences failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/subscribers/auto-send")
async def toggle_auto_send():
    """Toggle the auto_send flag."""
    try:
        data = load_subscribers()
        data["auto_send"] = not data.get("auto_send", True)
        save_subscribers_data(data)
        return {"auto_send": data["auto_send"]}
    except RuntimeError as exc:
        logger.error("toggle_auto_send failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/notify-subscribers")
async def notify_subscribers(body: NotifyBody):
    """
    Trigger WhatsApp delivery via local whatsapp-web.js agent.
    Calls localhost:5000/send which sends PDFs using your real WhatsApp.
    Falls back to wa.me links if agent is not running.
    """
    import requests as _req
    from pathlib import Path

    if not body.edition_date.strip():
        raise HTTPException(status_code=400, detail="edition_date is required")

    logger.info("Sending WhatsApp notifications for edition %s", body.edition_date)

    # Check if local WhatsApp agent is running
    try:
        health = _req.get("http://localhost:5000/health", timeout=2)
        agent_ready = health.status_code == 200 and health.json().get("status") == "ready"
    except Exception:
        agent_ready = False

    if agent_ready:
        # Fire-and-forget: trigger the agent then return immediately so the
        # frontend is never blocked waiting for all messages to be delivered.
        def _fire_agent():
            try:
                supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
                resp = _req.post(
                    "http://localhost:5000/send",
                    json={"edition_date": body.edition_date, "supabase_url": supabase_url},
                    timeout=600,  # 10 min for large subscriber lists
                )
                resp.raise_for_status()
                data = resp.json()
                logger.info(
                    "WhatsApp agent delivery complete: %d sent, %d failed",
                    data.get("sent", 0), data.get("failed", 0),
                )
            except Exception as bg_exc:
                logger.error("WhatsApp agent background send failed: %s", bg_exc)

        import threading
        threading.Thread(target=_fire_agent, daemon=True).start()
        logger.info("WhatsApp agent triggered (background) for edition %s", body.edition_date)
        return {
            "status": "queued",
            "message": "WhatsApp delivery started in background",
            "using_api": True,
            "edition_date": body.edition_date,
        }

    # Fallback: generate wa.me links
    try:
        result = send_pdf_to_all(body.edition_date)
        result["status"] = "links"
        result["edition_date"] = body.edition_date
        return result
    except Exception as exc:
        logger.error("notify_subscribers failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ─── Designer Account Creation (Admin only) ──────────────────


class CreateDesignerBody(BaseModel):
    email: str
    password: str


@app.post("/admin/create-designer")
async def create_designer(body: CreateDesignerBody):
    """
    Create (or repair) a designer auth account using the service role key.
    Strategy:
      1. Try SDK create_user with email_confirm=True (works for new users).
      2. On any failure, fall back to HTTP generate_link (handles existing/broken accounts).
    Designer can sign in immediately after either path succeeds.
    """
    import requests as _req

    email = body.email.strip().lower()
    password = body.password.strip()

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email is required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    service_key  = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not supabase_url or not service_key:
        raise HTTPException(status_code=500, detail="Server is missing Supabase credentials")

    headers = {
        "Authorization": f"Bearer {service_key}",
        "apikey": service_key,
        "Content-Type": "application/json",
    }

    # ── Method 1: create via SDK ──────────────────────────────────────
    try:
        admin_client = _create_supabase_client(supabase_url, service_key)
        resp = admin_client.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
        })
        logger.info("Designer account created (SDK) for %s", email)
        return {"email": email, "id": str(resp.user.id)}
    except Exception as sdk_exc:
        logger.warning("SDK create_user failed for %s: %s — trying generate_link fallback", email, sdk_exc)

    # ── Method 2: generate_link — works for new AND existing accounts ─
    # Supabase's generate_link with type=signup creates/confirms the user
    # and returns the user object, even if the account previously existed
    # in a broken/unconfirmed state.
    try:
        r = _req.post(
            f"{supabase_url}/auth/v1/admin/generate_link",
            headers=headers,
            json={"type": "signup", "email": email, "password": password},
            timeout=15,
        )
        if r.status_code in (200, 201):
            data = r.json()
            user_id = (data.get("user") or {}).get("id") or data.get("id", "")
            logger.info("Designer account created/repaired (generate_link) for %s", email)
            return {"email": email, "id": str(user_id)}

        # generate_link 422 usually means user exists and is already confirmed.
        # That's fine — we still insert them into public.designers below.
        if r.status_code == 422:
            logger.info("generate_link 422 for %s — user likely already confirmed; proceeding", email)
            return {"email": email, "id": "existing"}

        err_body = r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text
        logger.error("generate_link failed for %s: %s %s", email, r.status_code, err_body)
        raise HTTPException(
            status_code=500,
            detail=f"Could not create account for {email}. Supabase error: {err_body}",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("generate_link exception for %s: %s", email, exc)
        raise HTTPException(status_code=500, detail=f"Could not create account: {exc}")


# ─── Pipeline Deduplication Endpoint ────────────────────────

class DeduplicateRequest(BaseModel):
    date: str


@app.post("/pipeline/deduplicate")
async def pipeline_deduplicate(body: DeduplicateRequest):
    """
    Server-side deduplication using the service role key (bypasses RLS).
    Fetches all pages for the given date, identifies duplicates by normalised
    filename AND resolved page number, permanently deletes duplicates from
    both the 'pages' table and the 'Upload' storage bucket, then returns
    the surviving unique pages already sorted by page number.
    """
    import re

    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    service_key  = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not supabase_url or not service_key:
        raise HTTPException(status_code=500, detail="Supabase service role key not configured")

    supabase = _create_supabase_client(supabase_url, service_key)

    # Fetch all pages for the date
    result = supabase.table("pages").select("*").eq("edition_date", body.date).execute()
    all_pages = result.data or []

    if not all_pages:
        return {"unique_pages": [], "removed": []}

    def extract_page_number(filename: str):
        """Return integer page number from filename, or None."""
        if not filename:
            return None
        name = re.sub(r"\.pdf$", "", filename, flags=re.IGNORECASE).strip()
        m = re.search(r"[_-](\d{1,3})(?:\s*\(\d+\))?$", name)
        if m:
            return int(m.group(1))
        m = re.search(r"page\s*(\d{1,3})", name, re.IGNORECASE)
        if m:
            return int(m.group(1))
        m = re.search(r"(?:^|\s)(\d{1,3})$", name)
        if m:
            return int(m.group(1))
        return None

    # ── Pass 1: deduplicate by normalised filename ──
    seen_filenames: dict = {}  # norm_name → best page
    for page in all_pages:
        norm = (page.get("filename") or "").lower().strip()
        existing = seen_filenames.get(norm)
        if existing is None:
            seen_filenames[norm] = page
        else:
            # Keep the most recently uploaded
            keep = page if (page.get("uploaded_at") or "") >= (existing.get("uploaded_at") or "") else existing
            drop = existing if keep is page else page
            seen_filenames[norm] = keep
            seen_filenames[f"__DROP__{drop['id']}"] = {"_drop": True, "page": drop}

    survivors_after_filename = [
        v for k, v in seen_filenames.items()
        if not k.startswith("__DROP__")
    ]
    dropped_by_filename = [
        v["page"] for k, v in seen_filenames.items()
        if k.startswith("__DROP__")
    ]

    # ── Pass 2: deduplicate by resolved page number ──
    seen_numbers: dict = {}    # page_num → best page
    no_num_survivors = []
    dropped_by_number = []

    for page in survivors_after_filename:
        num = extract_page_number(page.get("filename")) or page.get("page_number")
        if num is None:
            no_num_survivors.append(page)
            continue
        existing = seen_numbers.get(num)
        if existing is None:
            seen_numbers[num] = page
        else:
            keep = page if (page.get("uploaded_at") or "") >= (existing.get("uploaded_at") or "") else existing
            drop = existing if keep is page else page
            seen_numbers[num] = keep
            dropped_by_number.append(drop)

    all_duplicates = dropped_by_filename + dropped_by_number

    # ── Permanently delete each duplicate ──
    removed_records = []
    for dup in all_duplicates:
        page_id      = dup.get("id")
        storage_path = dup.get("storage_path")
        filename     = dup.get("filename", page_id)
        try:
            # Delete from storage bucket
            if storage_path:
                supabase.storage.from_("Upload").remove([storage_path])
            # Delete from pages table
            supabase.table("pages").delete().eq("id", page_id).execute()
            removed_records.append({"id": page_id, "filename": filename})
            logger.info("Duplicate removed: %s (id=%s)", filename, page_id)
        except Exception as exc:
            logger.warning("Could not delete duplicate %s: %s", filename, exc)

    # ── Build sorted unique list ──
    unique_pages = list(seen_numbers.values()) + no_num_survivors
    unique_pages.sort(key=lambda p: (
        extract_page_number(p.get("filename")) or p.get("page_number") or 9999,
        p.get("filename") or ""
    ))

    logger.info(
        "Deduplication for %s: %d total → %d unique, %d removed",
        body.date, len(all_pages), len(unique_pages), len(removed_records)
    )

    return {
        "unique_pages": unique_pages,
        "removed": removed_records,
        "total_before": len(all_pages),
        "total_after": len(unique_pages),
    }


# ─── AI Agent Endpoint ──────────────────────────────────────

class AgentQuery(BaseModel):
    query: str
    date: str
    context: str = 'editorial_operations'


@app.post("/agent/query")
async def agent_query(body: AgentQuery):
    """
    Query the AI Agent via OpenRouter (GLM-4.5-Air free model).
    Falls back to Gemini if OpenRouter key is missing.
    """
    import requests as _req

    try:
        supabase = _create_supabase_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        )

        # Fetch live company data for context
        pages_data    = supabase.table('pages').select('*').eq('edition_date', body.date).execute()
        editions_data = supabase.table('editions').select('*').eq('date', body.date).execute()

        pages_count = len(pages_data.data) if pages_data.data else 0
        sections: dict = {}
        if pages_data.data:
            for page in pages_data.data:
                sec = page.get('section', 'Unknown')
                sections[sec] = sections.get(sec, 0) + 1

        system_prompt = (
            f"You are the New Era Editorial AI — a professional, senior editorial operations assistant.\n"
            f"Today is {body.date}. Today's edition has {pages_count} pages uploaded across these sections: {sections}.\n\n"
            "Rules you must always follow:\n"
            "1. Be concise. Answer in 2-4 sentences max unless a detailed breakdown is explicitly requested.\n"
            "2. Be professional. Use clear, formal language suited to a newsroom environment.\n"
            "3. Be direct. Lead with the answer, then supporting detail if needed.\n"
            "4. Never expose raw JSON, internal data structures, or technical metadata in your reply.\n"
            "5. If you don't have enough data to answer confidently, say so in one sentence.\n"
            "6. Format multi-point answers as short bullet points, not numbered lists.\n\n"
            "You assist with: edition status, section breakdowns, designer performance, subscriber trends, and publishing workflow."
        )

        answer_text = ""
        model_used  = ""

        # ── 1. Try Ollama (local, free, private) ────────────────────────────
        try:
            import ollama as _ollama
            # Use a lightweight model by default — overridable via OLLAMA_MODEL env var
            ollama_model = os.getenv("OLLAMA_MODEL", "llama3")
            logger.info("Attempting agent query via Ollama (%s)", ollama_model)
            _resp = _ollama.chat(
                model=ollama_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": body.query},
                ],
                options={"num_predict": 256, "temperature": 0.3},
            )
            answer_text = _resp['message']['content'].strip()
            model_used  = f"Ollama/{ollama_model}"
            logger.info("Agent query handled by Ollama (%s)", ollama_model)

        except Exception as ollama_exc:
            logger.warning("Ollama unavailable (%s) — trying OpenRouter", ollama_exc)

            # ── 2. Try OpenRouter ────────────────────────────────────────────
            openrouter_key   = os.getenv("OPENROUTER_API_KEY", "")
            openrouter_model = os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free")
            if openrouter_key:
                try:
                    resp = _req.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {openrouter_key}",
                            "Content-Type": "application/json",
                            "HTTP-Referer": "https://newera-editorial.app",
                            "X-Title": "NewEra Editorial Agent",
                        },
                        json={
                            "model": openrouter_model,
                            "messages": [
                                {"role": "system", "content": system_prompt},
                                {"role": "user",   "content": body.query},
                            ],
                            "temperature": 0.3,
                            "max_tokens": 300,
                        },
                        timeout=60,
                    )
                    resp.raise_for_status()
                    answer_text = resp.json()["choices"][0]["message"]["content"].strip()
                    model_used  = openrouter_model
                    logger.info("Agent query handled by OpenRouter/%s", openrouter_model)
                except Exception as or_exc:
                    logger.warning("OpenRouter failed (%s) — falling back to Gemini", or_exc)

            # ── 3. Final fallback: Google Gemini ────────────────────────────
            if not answer_text:
                logger.info("Using Gemini as final fallback for agent query")
                from google import genai as _genai
                gemini_client = _genai.Client(api_key=os.getenv("GEMINI_API_KEY", ""))
                gr = gemini_client.models.generate_content(
                    model="gemini-2.0-flash-lite",
                    contents=[f"System context:\n{system_prompt}\n\nUser query: {body.query}"],
                    config=_genai.types.GenerateContentConfig(temperature=0.3, max_output_tokens=300),
                )
                answer_text = (gr.text or "").strip()
                model_used  = "gemini-2.0-flash-lite"
                logger.info("Agent query handled by Gemini fallback")

        logger.info("Agent query: %s", body.query[:100])

        return {
            "answer": answer_text,
            "reasoning": f"Analysis based on {pages_count} pages across {len(sections)} sections",
            "data": {
                "pages_uploaded": pages_count,
                "sections": sections,
                "query_date": body.date,
                "model": model_used,
            },
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Agent query failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Agent analysis failed: {str(exc)}")


class ConfirmEmailBody(BaseModel):
    email: str


@app.post("/admin/confirm-email")
async def confirm_designer_email(body: ConfirmEmailBody):
    """
    Confirm a designer's email via the Supabase Admin REST API (direct HTTP, service role key).
    Fixes accounts created with the old signUp() flow that have unconfirmed emails.
    """
    import requests as _requests

    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not supabase_url or not service_key:
        raise HTTPException(status_code=500, detail="Server is missing Supabase credentials")

    headers = {
        "Authorization": f"Bearer {service_key}",
        "apikey": service_key,
        "Content-Type": "application/json",
    }

    import requests as _requests

    headers = {
        "Authorization": f"Bearer {service_key}",
        "apikey": service_key,
        "Content-Type": "application/json",
    }

    try:
        # List users with a small page size to avoid Supabase 500 errors
        target = None
        page = 1
        while True:
            resp = _requests.get(
                f"{supabase_url}/auth/v1/admin/users",
                headers=headers,
                params={"page": page, "per_page": 50},
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            # Response may be a list or {"users": [...]}
            batch = data if isinstance(data, list) else data.get("users", [])
            if not batch:
                break
            target = next((u for u in batch if u.get("email") == email), None)
            if target or len(batch) < 50:
                break
            page += 1

        if not target:
            raise HTTPException(status_code=404, detail=f"No auth account found for {email}")

        user_id = target["id"]

        # Confirm the email
        patch_resp = _requests.patch(
            f"{supabase_url}/auth/v1/admin/users/{user_id}",
            headers=headers,
            json={"email_confirm": True},
            timeout=15,
        )
        patch_resp.raise_for_status()

        logger.info("Email confirmed for %s (id=%s)", email, user_id)
        return {"email": email, "confirmed": True}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to confirm email for %s: %s", email, exc)
        raise HTTPException(status_code=500, detail=f"Could not confirm email: {str(exc)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
