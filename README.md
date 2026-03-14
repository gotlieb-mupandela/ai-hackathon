# NewEra Editorial Automation System
**Built by Apnium Technology — Windhoek, Namibia**

An AI-powered editorial pipeline that takes individual newspaper page uploads from designers and automatically produces a published ePaper edition — with zero manual intervention beyond uploading.

**New in v2.0:** Admin and Designer roles with individual upload tracking and centralized dashboard.

---

## Prerequisites

- Python 3.9+
- Node.js 18+
- Poppler (required for pdf2image)
  - Windows: Download from https://github.com/oschwartz10612/poppler-windows/releases and add `bin/` to PATH
  - macOS: `brew install poppler`
  - Linux: `sudo apt install poppler-utils`
- Google Gemini API key (for AI vision analysis; get one at https://aistudio.google.com/apikey)
- Supabase project (for authentication, user management, and cloud sync)

---

## Setup

### 1. Supabase Configuration

1. Create a free Supabase project at https://supabase.com
2. In Supabase Dashboard → SQL Editor, run the SQL schema from `backend/supabase_schema.sql`
3. In Supabase Dashboard → **Storage**, create these two buckets (if they don't exist):
   - **uploads** — for designer PDF page uploads (can be public or private; RLS applies)
   - **outputs** — for pipeline output PDFs (merged paper, segments)
   Use "New bucket", set the name exactly as above. For "uploads" you can allow public read if you want direct links, or keep private and use signed URLs later.
4. Copy your credentials:
   - Project URL (e.g., `https://xxx.supabase.co`)
   - **Anon key** (for frontend) from Settings → API
   - **Service role key** (for backend) from Settings → API
   - **JWT Secret** from Settings → API → JWT Settings

### 2. Backend Configuration

Edit `backend/.env` with your credentials:

```env
# Required for pipeline vision analysis
GEMINI_API_KEY=your-gemini-api-key

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret
```

Install dependencies and start:

```powershell
cd newera-system\backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend runs at: http://localhost:8000

### 3. Frontend Configuration

Edit `frontend/.env` with your Supabase credentials:

```env
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
```

Also update `frontend/public/config.js` with the same values (runtime fallback).

Install dependencies and start:

```powershell
cd newera-system\frontend
npm install --legacy-peer-deps
npm start
```

Frontend runs at: http://localhost:3000

### 4. First Admin User

The **first user** to sign up will automatically become an admin. This user can then:
- Add designer emails in the **Designers** page
- View all uploads in the **Dashboard**
- Manage pipeline settings

**Make admin@gmail.com the admin (password 123456):**

1. In Supabase Dashboard → SQL Editor, run `backend/supabase_schema.sql` (creates `admins` and `designers` tables if needed).
2. Then run `backend/seed_admin.sql`, or this one line:
   ```sql
   INSERT INTO public.admins (email) VALUES ('admin@gmail.com') ON CONFLICT (email) DO NOTHING;
   ```
3. In the app, open **Sign up** and create an account with email `admin@gmail.com` and password `123456`. That user will have admin access.

Alternatively, from the backend folder run `python seed_admin.py` after putting the **Service role** key (not the anon key) in `backend/.env` as `SUPABASE_SERVICE_ROLE_KEY`; the script can create the Auth user and add them to `admins`.

**Important:** Do not create users by inserting into `auth.users` (or any auth table) via SQL. That causes "Database error querying schema" when they sign in, because GoTrue expects internal fields. Create auth users only via the app (**Sign up**) or Supabase Auth Admin API.

---

## User Roles

### Admin
- **Dashboard**: View all uploads grouped by designer in real-time
- **Designers**: Add/remove designer emails
- **Upload Portal**: Access to settings (expected pages, deadline) and manual trigger
- **Pipeline, Viewer, Archive**: Full access

### Designer
- **My Uploads**: Personal upload area (filtered to show only their pages)
- **Pipeline, Viewer, Archive**: Read-only access to published editions
- Cannot see other designers' uploads or admin controls

---

## Usage

### For Admins

1. **Add designers** — Go to Designers page, add designer emails
2. **Set edition settings** — Upload Portal → set expected pages and deadline
3. **Monitor uploads** — Dashboard shows uploads from all designers, grouped by email
4. **Trigger pipeline** — Auto-triggers when page count or deadline is met, or use "Trigger Now"
5. **Review output** — View published editions in ePaper Viewer

### For Designers

1. **Log in** — Sign in with your email (must be added by admin first)
2. **Upload pages** — My Uploads → drag and drop your PDF pages
3. **Track your work** — See your uploaded pages, their analysis status, and pipeline progress
4. **View editions** — Check ePaper Viewer and Archive for published newspapers

---

## File Structure

```
newera-system/
  backend/
    main.py               - FastAPI application + all API endpoints
    agent.py              - Pipeline orchestrator (9-step workflow)
    auth.py               - JWT validation helper
    merger.py             - PDF processing (convert, merge, segment)
    publisher.py          - Output writing, edition.json, archiving
    gemini.py             - Gemini vision analysis for page metadata
    supabase_sync.py      - Sync published editions to Supabase
    supabase_schema.sql   - Database schema for Supabase
    requirements.txt
    .env                  - Environment variables (API keys, secrets)
  frontend/
    src/
      screens/            - Upload, Dashboard, Designers, Pipeline, EPaperViewer, Archive, Login, SignUp
      components/         - Navbar, Sidebar
      context/            - AuthContext (authentication + role detection)
      lib/                - Supabase client
      api.js              - All backend API calls with auth
      App.jsx             - Router + role-based layout
    public/
      config.js           - Runtime Supabase config fallback
  uploads/                - Designer uploads by date
  output/                 - Processed PDFs + edition.json by date
  archive/                - Archived editions by date
```

---

## API Reference

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | /upload | Upload a PDF page (tagged with uploader email) | Yes (JWT) |
| GET | /status | Current edition status | No |
| GET | /pipeline | Live pipeline steps + logs | No |
| GET | /editions | All published editions | No |
| GET | /edition/{date} | Specific edition by date | No |
| POST | /settings | Set expected pages + deadline | No |
| GET | /output/{date}/{file} | Serve a PDF file | No |
| POST | /pipeline/trigger | Manual pipeline trigger | No |
| POST | /pipeline/reset | Reset pipeline (dev use) | No |

**Note:** The `/upload` endpoint now requires a Supabase JWT in the `Authorization: Bearer <token>` header. The frontend automatically attaches this via an axios interceptor.

---

## Troubleshooting

### "Authorization header missing"
- Ensure you're logged in and the frontend is sending the JWT token
- Check that `SUPABASE_JWT_SECRET` is set in `backend/.env`

### "Access Denied" after login
- Admin must add your email to the `designers` table in Supabase
- First user becomes admin automatically; subsequent users need to be added

### Pipeline not triggering
- Ensure `GEMINI_API_KEY` is set in `backend/.env`
- Check backend logs for vision analysis or API errors

### Supabase sync failures
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`
- Ensure `output-pdfs` storage bucket exists in Supabase
- Check RLS policies allow service_role access

---

## License

Proprietary — Apnium Technology, Windhoek, Namibia
