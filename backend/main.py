"""
NewEra Editorial System — Backend
PDF analysis via Gemini + WhatsApp subscriber notifications.
"""

import io
import logging
import os
import tempfile
import threading
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

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
    load_subscribers,
    remove_number,
    save_subscribers_data,
    send_pdf_to_all,
    update_preferences,
)

# PDF-to-image conversion
from pdf2image import convert_from_path

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
        # Send via local WhatsApp agent (downloads PDFs from Supabase and sends)
        try:
            supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
            resp = _req.post(
                "http://localhost:5000/send",
                json={"edition_date": body.edition_date, "supabase_url": supabase_url},
                timeout=300
            )
            resp.raise_for_status()
            data = resp.json()
            logger.info("WhatsApp agent sent: %d, failed: %d", data.get("sent", 0), data.get("failed", 0))
            return {
                "status": "sent",
                "sent": data.get("sent", 0),
                "failed": data.get("failed", 0),
                "using_api": True,
                "edition_date": body.edition_date
            }
        except Exception as exc:
            logger.error("WhatsApp agent failed: %s", exc)
            # Fall through to wa.me links

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
            f"You are an AI Agent trained on NewEra's editorial operations data.\n"
            f"Today's date: {body.date}\n"
            f"Pages uploaded today: {pages_count} across sections: {sections}\n\n"
            "You have access to:\n"
            "- Page upload data (filenames, sections, status)\n"
            "- Edition information (deadline, expected pages, status)\n"
            "- Designer performance (upload counts)\n"
            "- Subscriber and subscription data\n\n"
            "Your role:\n"
            "1. Analyse patterns in editorial operations\n"
            "2. Provide data-driven recommendations\n"
            "3. Answer questions about performance, trends, and optimisation\n"
            "4. Help the admin team run operations more efficiently\n\n"
            "Keep responses concise, actionable, and data-focused."
        )

        openrouter_key   = os.getenv("OPENROUTER_API_KEY", "")
        openrouter_model = os.getenv("OPENROUTER_MODEL", "z-ai/glm-4.5-air:free")
        answer_text      = ""
        model_used       = ""

        if openrouter_key:
            # ── OpenRouter ─────────────────────────────────────────────
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
                    "temperature": 0.7,
                },
                timeout=60,
            )
            resp.raise_for_status()
            answer_text = resp.json()["choices"][0]["message"]["content"].strip()
            model_used  = openrouter_model
            logger.info("Agent query handled by OpenRouter/%s", openrouter_model)

        else:
            # ── Fallback to Gemini if no OpenRouter key ─────────────────
            logger.warning("OPENROUTER_API_KEY not set — falling back to Gemini")
            from google import genai as _genai
            gemini_client = _genai.Client(api_key=os.getenv("GEMINI_API_KEY", ""))
            gr = gemini_client.models.generate_content(
                model="gemini-2.0-flash",
                contents=[f"System context:\n{system_prompt}\n\nUser query: {body.query}"],
                config=_genai.types.GenerateContentConfig(temperature=0.7),
            )
            answer_text = (gr.text or "").strip()
            model_used  = "gemini-2.0-flash"
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
