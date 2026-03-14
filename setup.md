# NewEra Editorial System — Setup & Run Guide

A complete step-by-step guide to get the NewEra Editorial Automation System up and running locally.

---

## 📋 Prerequisites

Before you start, ensure you have:

- **Python 3.9+** — [Download](https://www.python.org/downloads/)
- **Node.js 18+** — [Download](https://nodejs.org/)
- **Poppler** (for PDF processing)
  - **Windows:** Download from [poppler-windows](https://github.com/oschwartz10612/poppler-windows/releases) and add `bin/` to your PATH
  - **macOS:** `brew install poppler`
  - **Linux:** `sudo apt install poppler-utils`
- **Google Gemini API key** — Get free at [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- **Supabase account** — Create free project at [https://supabase.com](https://supabase.com)

---

## 🚀 Quick Start (5 Steps)

### Step 1: Clone the Repository

```bash
git clone https://github.com/gotlieb-mupandela/ai-hackathon.git
cd ai-hackathon/newera-system
```

### Step 2: Set Up Supabase

1. Go to [https://supabase.com](https://supabase.com) and create a new project
2. In **SQL Editor**, copy the entire contents of `backend/setup_all_tables.sql` and paste/run it
3. Create two **Storage** buckets:
   - Click **Storage** → **New bucket**
   - Create `uploads` (for designer PDFs)
   - Create `outputs` (for processed PDFs)
4. Copy your credentials from **Settings → API**:
   - Project URL (e.g., `https://xxx.supabase.co`)
   - **Anon key**
   - **Service role key**
   - **JWT Secret** (from JWT Settings)

### Step 3: Configure Backend

1. Create `backend/.env`:
   ```env
   GEMINI_API_KEY=your-api-key-here
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   SUPABASE_JWT_SECRET=your-jwt-secret
   ```

2. Install dependencies & start:
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn main:app --reload --port 8000
   ```
   
   ✅ Backend runs at **http://localhost:8000**

### Step 4: Configure Frontend

1. Create `frontend/.env`:
   ```env
   REACT_APP_SUPABASE_URL=https://your-project.supabase.co
   REACT_APP_SUPABASE_ANON_KEY=your-anon-key
   ```

2. Update `frontend/public/config.js`:
   ```javascript
   window.__SUPABASE_URL__ = 'https://your-project.supabase.co';
   window.__SUPABASE_ANON_KEY__ = 'your-anon-key';
   ```

3. Install dependencies & start:
   ```bash
   cd frontend
   npm install --legacy-peer-deps
   npm start
   ```
   
   ✅ Frontend runs at **http://localhost:3000**

### Step 5: Create Admin Account

1. In Supabase → **SQL Editor**, run:
   ```sql
   INSERT INTO public.admins (email) VALUES ('admin@gmail.com') 
   ON CONFLICT (email) DO NOTHING;
   ```

2. In the app (http://localhost:3000), click **Sign up** and create an account:
   - Email: `admin@gmail.com`
   - Password: `123456`

3. You'll now have **admin access** to the entire system.

---

## 🎯 What Each Role Can Access

### Admin
- **Dashboard** — View all uploads from all designers
- **Designers** — Add/remove designer accounts
- **Upload Portal** — Upload pages, set deadlines
- **Management** (dropdown menu):
  - **E-Papers** — Published editions
  - **Users** — Customer database
  - **Subscriptions** — Reader subscriptions
  - **Sections** — Configure sections
  - **Periods** — Subscription plans
- **Payments** — Payment records
- **Publish** — Pipeline automation
- **ePaper Viewer** — View published newspapers
- **Archive** — Historical editions

### Designer
- **Dashboard** — Today's upload count & deadline countdown
- **My Uploads** — Upload your PDF pages
- **ePaper Viewer** — View published editions (read-only)
- **Archive** — Historical editions (read-only)

---

## 📂 Project Structure

```
newera-system/
├── backend/
│   ├── main.py                    # FastAPI app + all API endpoints
│   ├── agent.py                   # Pipeline orchestrator
│   ├── gemini.py                  # AI vision analysis
│   ├── requirements.txt           # Python dependencies
│   ├── setup_all_tables.sql       # Database schema (copy to Supabase)
│   └── .env                       # Environment variables (create this)
│
├── frontend/
│   ├── src/
│   │   ├── screens/               # Upload, Dashboard, Designers, Pipeline, etc.
│   │   ├── components/            # Navbar, Sidebar
│   │   ├── context/AuthContext    # Authentication & roles
│   │   └── App.jsx                # Main router
│   ├── public/config.js           # Runtime Supabase config
│   ├── package.json               # JavaScript dependencies
│   └── .env                       # Environment variables (create this)
│
└── README.md                      # Full documentation
```

---

## ⚙️ Running Both Services (Recommended Setup)

Open **two terminal windows**:

**Terminal 1 — Backend:**
```bash
cd newera-system/backend
uvicorn main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd newera-system/frontend
npm start
```

Both will auto-reload when you make code changes.

---

## 🔧 Environment Variables Reference

### Backend `.env`
| Variable | Description | Example |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Google Gemini API key (required) | `AIzaSyD...` |
| `SUPABASE_URL` | Your Supabase project URL | `https://abc.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend service role key | `eyJhbG...` |
| `SUPABASE_JWT_SECRET` | JWT signing secret | `super-secret-key` |

### Frontend `.env`
| Variable | Description | Example |
|----------|-------------|---------|
| `REACT_APP_SUPABASE_URL` | Your Supabase project URL | `https://abc.supabase.co` |
| `REACT_APP_SUPABASE_ANON_KEY` | Frontend anon key | `eyJhbG...` |

---

## 🐛 Troubleshooting

### ❌ "Cannot find Poppler"
- **Windows:** Ensure poppler `bin/` folder is in your PATH. Restart terminal after adding.
- **macOS/Linux:** Run `which pdftoimage` to verify installation.

### ❌ "Supabase connection error"
- Verify `SUPABASE_URL` and keys are correct in `backend/.env`
- Check that Supabase project is active (not paused)

### ❌ "CORS error" in browser console
- Backend should allow `http://localhost:3000` — check CORS settings in `backend/main.py`

### ❌ "Authorization header missing"
- Ensure you're logged in (JWT token should be stored in browser)
- Check that `SUPABASE_JWT_SECRET` matches in both Supabase and backend `.env`

### ❌ "First user not becoming admin"
- Run the SQL insert manually in Supabase SQL Editor before signing up
- Or check `admins` table to ensure row was created

### ❌ "npm dependencies conflict"
- Use `npm install --legacy-peer-deps` (as specified in instructions)

---

## 📊 New Management Features (v2.0)

The latest update includes a complete **Management System** accessible from the sidebar:

### Sections
- Create and manage newspaper sections
- Configure section colours (theme)
- Mark sections active/inactive
- Search, filter, export (CSV/TXT)

### Periods
- Define subscription period plans (1, 6, 12, 24, 36 months)
- Set pricing per section per period
- Track active periods
- Full CRUD + export

### Users (Customers)
- Manage reader database
- Store: name, email, phone, gender, country, status
- Link subscriptions to users
- Quick activate/deactivate toggle

### Subscriptions
- Track individual reader subscriptions
- Link to sections and customers
- Set expiration dates
- Free access toggle

### Payments
- Record payment transactions
- Track: user, amount, method (Bank Transfer/Cash/Card)
- Reference tracking
- Export transaction history

---

## 🚢 Deployment Notes

For production deployment:

1. **Backend:** Deploy to a server/cloud (Heroku, Railway, AWS, etc.)
   - Update `SUPABASE_URL` and keys for production database
   - Set `uvicorn` to production mode (no `--reload`)

2. **Frontend:** Build and deploy to a static host (Vercel, Netlify, GitHub Pages)
   ```bash
   npm run build
   ```
   - Update `REACT_APP_SUPABASE_URL` for production

3. **Database:** Ensure Supabase RLS policies are in place (they are by default in `setup_all_tables.sql`)

---

## 📚 Learn More

- Full documentation: See `README.md`
- API Reference: Check `backend/main.py` for all endpoints
- Backend pipeline: See `backend/agent.py` for the 9-step workflow

---

## ✅ You're Ready!

Once both terminal windows show no errors, open **http://localhost:3000** and start using the system.

**Happy editing! 🚀**
