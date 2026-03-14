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
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
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

        # Fast conversion: 150 DPI is enough for Gemini to read text
        images = convert_from_path(
            tmp_pdf_path, dpi=150, first_page=1, last_page=1,
            poppler_path=POPPLER_PATH,
            thread_count=4,
        )
        if not images:
            raise ValueError("Could not convert PDF to image")

        img = images[0]

        # Downscale large images — Gemini only needs ~1200px wide to read text
        MAX_DIM = 1400
        if max(img.size) > MAX_DIM:
            img.thumbnail((MAX_DIM, MAX_DIM))

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_img:
            img.save(tmp_img, "JPEG", quality=70, optimize=True)
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


class NotifyBody(BaseModel):
    edition_date: str


@app.get("/subscribers")
async def list_subscribers():
    """Return the full subscriber data (numbers list + auto_send flag)."""
    try:
        return load_subscribers()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/subscribers/add")
async def add_subscriber(body: PhoneBody):
    """Add a phone number to the subscriber list."""
    if not body.phone.strip():
        raise HTTPException(status_code=400, detail="Phone number is required")
    try:
        numbers = add_number(body.phone)
        return {"numbers": numbers}
    except RuntimeError as exc:
        logger.error("add_subscriber failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/subscribers/remove")
async def remove_subscriber(body: PhoneBody):
    """Remove a phone number from the subscriber list."""
    try:
        numbers = remove_number(body.phone)
        return {"numbers": numbers}
    except RuntimeError as exc:
        logger.error("remove_subscriber failed: %s", exc)
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
async def notify_subscribers(body: NotifyBody, background_tasks: BackgroundTasks):
    """
    Trigger WhatsApp PDF delivery to all subscribers.
    Runs in a background thread so the API responds immediately.
    """
    if not body.edition_date.strip():
        raise HTTPException(status_code=400, detail="edition_date is required")

    logger.info("Queued WhatsApp notifications for edition %s", body.edition_date)

    background_tasks.add_task(send_pdf_to_all, body.edition_date)

    return {"status": "queued", "edition_date": body.edition_date}


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
