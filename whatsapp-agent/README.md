# WhatsApp Agent for NewEra Editorial

**100% free, local WhatsApp automation using whatsapp-web.js**

Sends newspaper PDFs to subscribers via your real WhatsApp account — no API keys, no cost, no cloud service.

## How it works

```
Pipeline completes
        ↓
Backend calls localhost:5000/send
        ↓
WhatsApp agent downloads PDFs from Supabase
        ↓
Sends PDFs via your WhatsApp Web session
        ↓
Subscribers receive newspaper PDF in WhatsApp
```

## Setup

### 1. Install dependencies

```powershell
cd whatsapp-agent
npm install
```

### 2. Start the agent

```powershell
npm start
```

### 3. Connect your WhatsApp

On first run, a QR code appears in the terminal.

1. Open WhatsApp on your phone
2. Go to **Settings** → **Linked Devices**
3. Tap **Link a Device**
4. Scan the QR code

Once connected, the agent stays authenticated forever (even after restart).

### 4. Keep it running

The agent needs to run whenever you want to send notifications.

**Option A**: Keep the terminal open
**Option B**: Run as a background service (PM2, systemd, Windows Service, etc.)

## Usage

The Python backend automatically calls the WhatsApp agent when the pipeline completes.

If the agent is running → PDFs are sent automatically
If the agent is offline → wa.me links are generated as fallback

## Status check

Visit **http://localhost:5000/health** to check if the agent is ready:

```json
{
  "status": "ready",
  "message": "WhatsApp connected"
}
```

## Notes

- **First run**: Scan QR code once to authenticate
- **Subsequent runs**: Agent auto-connects using saved session
- **Session expires**: Scan QR code again (happens rarely, maybe once a month)
- **No internet API**: All communication is local + your real WhatsApp
- **Free forever**: No API costs, no subscription, no rate limits

## Troubleshooting

**QR code doesn't appear**: Wait 10-20 seconds, Chromium needs to launch

**"Authentication failed"**: Session expired, restart the agent and scan again

**"WhatsApp not ready"**: Backend tried to send before agent connected — wait a few seconds and retry

**Files won't send**: Check that Supabase PDFs are publicly accessible (they are by default in the `outputs` bucket)
