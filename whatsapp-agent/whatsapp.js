/**
 * Local WhatsApp agent using whatsapp-web.js
 * 100% free, no API keys, connects via your real WhatsApp Web
 *
 * Downloads each subscriber's section PDFs from Supabase, password-protects
 * them via the backend, and sends them as file attachments on WhatsApp.
 */
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const express = require('express');

const BACKEND_URL = 'http://localhost:8001';
const AGENT_PORT  = 5000;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-features=site-per-process',
      '--mute-audio',
    ],
    timeout: 120000,
  },
  webVersionCache: {
    type: 'local',
    path: './.wwebjs_cache',
  },
});

client.on('qr', qr => {
  console.log('\n=== SCAN THIS QR CODE WITH YOUR WHATSAPP ===\n');
  qrcode.generate(qr, { small: true });
  console.log('\nOpen WhatsApp on your phone > Settings > Linked Devices > Link a Device > Scan QR\n');
});

client.on('authenticated', () => {
  console.log('WhatsApp authenticated successfully');
});

client.on('auth_failure', msg => {
  console.error('Authentication failed:', msg);
});

const sectionLabelMap = {
  full_paper: 'Full Newspaper',
  news:       'NewEra News',
  sport:      'NewEra Sport',
  business:   'NewEra Business',
  vibez:      'NewEra Vibez!',
  agritoday:  'NewEra AgriToday',
};

const sectionFileMap = {
  full_paper: 'full_paper.pdf',
  news:       'news.pdf',
  sport:      'sport.pdf',
  business:   'business.pdf',
  vibez:      'vibez.pdf',
  agritoday:  'agritoday.pdf',
};

/**
 * Fetch a password-protected PDF from the backend.
 * The backend downloads the original from Supabase, encrypts it, and returns bytes.
 */
async function fetchProtectedPdf(supabaseUrl, editionDate, sectionKey, password) {
  const filename = sectionFileMap[sectionKey] || 'full_paper.pdf';
  const pdfUrl = `${supabaseUrl}/storage/v1/object/public/outputs/${editionDate}/${filename}`;

  const resp = await fetch(`${BACKEND_URL}/protect-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: pdfUrl, password }),
  });

  if (!resp.ok) {
    throw new Error(`protect-pdf failed (${resp.status}): ${await resp.text()}`);
  }

  const arrayBuf = await resp.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/**
 * Send password-protected PDF files to all subscribers.
 * Each subscriber gets their preferred sections as PDF attachments
 * along with a text message containing their password.
 */
async function sendToAllSubscribers(editionDate, supabaseUrl) {
  const subscribersPath = path.join(__dirname, '..', 'backend', 'subscribers.json');
  const data = JSON.parse(fs.readFileSync(subscribersPath, 'utf-8'));

  const numbers     = data.numbers     || [];
  const preferences = data.preferences || {};
  const passwords   = data.passwords   || {};

  if (numbers.length === 0) {
    console.log('No subscribers found');
    return { sent: 0, failed: 0 };
  }

  let sent   = 0;
  let failed = 0;

  for (const phone of numbers) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const chatId = `${cleanPhone}@c.us`;
    const sections = preferences[phone] || ['full_paper'];
    const password = passwords[phone] || '000000';

    try {
      const sectionLabels = sections.map(s => sectionLabelMap[s] || s).join(', ');

      const introMessage =
        `*New Era Edition — ${editionDate}*\n\n` +
        `Your edition is ready!\n\n` +
        `Sections: ${sectionLabels}\n` +
        `Password to open: *${password}*\n\n` +
        `The PDF(s) below are password-protected. Use the password above to open them.`;

      await client.sendMessage(chatId, introMessage);
      console.log(`  Intro sent to ${phone} (password: ${password})`);

      for (const sectionKey of sections) {
        try {
          const pdfBuffer = await fetchProtectedPdf(supabaseUrl, editionDate, sectionKey, password);
          const label = sectionLabelMap[sectionKey] || sectionKey;
          const filename = `NewEra_${editionDate}_${sectionKey}.pdf`;

          const media = new MessageMedia('application/pdf', pdfBuffer.toString('base64'), filename);
          await client.sendMessage(chatId, media, { caption: `${label}` });
          console.log(`  PDF sent to ${phone}: ${label}`);
        } catch (pdfErr) {
          console.error(`  Failed to send ${sectionKey} to ${phone}:`, pdfErr.message);
        }
      }

      sent++;
      console.log(`Completed ${phone} (${sections.length} section(s))`);

      await new Promise(r => setTimeout(r, 3000));
    } catch (err) {
      failed++;
      console.error(`Failed to send to ${phone}:`, err.message);
    }
  }

  console.log('\n=== WhatsApp Send Complete ===');
  console.log(`Sent: ${sent}, Failed: ${failed}`);

  return { sent, failed };
}

// ── HTTP server so the backend can check status and trigger sends ──
let isReady = false;

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: isReady ? 'ready' : 'not_ready' });
});

app.post('/send', async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ error: 'WhatsApp not connected yet' });
  }
  const { edition_date, supabase_url } = req.body;
  if (!edition_date || !supabase_url) {
    return res.status(400).json({ error: 'edition_date and supabase_url are required' });
  }
  try {
    const result = await sendToAllSubscribers(edition_date, supabase_url);
    res.json(result);
  } catch (err) {
    console.error('Send error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(AGENT_PORT, () => {
  console.log(`WhatsApp agent HTTP server running on http://localhost:${AGENT_PORT}`);
});

client.on('ready', () => {
  isReady = true;
});

client.on('disconnected', () => {
  isReady = false;
});

client.initialize();

module.exports = { sendToAllSubscribers, client };
