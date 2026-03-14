/**
 * Local WhatsApp agent using whatsapp-web.js
 * 100% free, no API keys, connects via your real WhatsApp Web
 */
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const BACKEND_URL = 'http://localhost:8000';

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

// Show QR code once on first run
client.on('qr', qr => {
  console.log('\n=== SCAN THIS QR CODE WITH YOUR WHATSAPP ===\n');
  qrcode.generate(qr, { small: true });
  console.log('\nOpen WhatsApp on your phone → Settings → Linked Devices → Link a Device → Scan QR\n');
});

client.on('authenticated', () => {
  console.log('✓ WhatsApp authenticated successfully');
});

client.on('ready', () => {
  console.log('✓ WhatsApp connected and ready to send messages!');
});

client.on('auth_failure', msg => {
  console.error('Authentication failed:', msg);
});

client.on('disconnected', reason => {
  console.log('WhatsApp disconnected:', reason);
});

/**
 * Generate a fresh 6-digit one-time PIN.
 * A new PIN is created for each subscriber on every edition send.
 */
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Fetch a one-time-PIN-protected copy of a PDF from the backend.
 * Backend downloads from Supabase and encrypts with the OTP before returning.
 *
 * @param {string} pdfUrl - Public Supabase storage URL
 * @param {string} otp    - One-time PIN for this edition send
 * @returns {Promise<Buffer>} - Encrypted PDF bytes
 */
async function fetchProtectedPdf(pdfUrl, otp) {
  const response = await fetch(`${BACKEND_URL}/protect-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: pdfUrl, password: otp }),
  });

  if (!response.ok) {
    throw new Error(`protect-pdf failed: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Send the subscriber's one-time PIN as a plain text WhatsApp message.
 * This arrives before the PDF so they have the PIN ready when they open it.
 *
 * @param {string} phone       - Clean phone number with country code
 * @param {string} otp         - One-time PIN
 * @param {string} editionDate - Edition date string
 * @param {number} sectionCount - How many PDFs are about to follow
 */
async function sendOTPMessage(phone, otp, editionDate, sectionCount) {
  const chatId = `${phone}@c.us`;
  const message =
    `*New Era Edition — ${editionDate}*\n\n` +
    `Your one-time PIN for today's edition:\n\n` +
    `*${otp}*\n\n` +
    `${sectionCount} PDF(s) follow.\n\n` +
    `*How to open:*\n` +
    `1. Tap the PDF file below\n` +
    `2. Tap the download icon or "Open in..." button\n` +
    `3. Open with *Adobe Acrobat*, *WPS Office*, or your phone's *Files* app\n` +
    `4. Enter the PIN above when asked for a password\n\n` +
    `This PIN is valid for today's edition only and cannot be reused.`;

  await client.sendMessage(chatId, message);
  console.log(`  PIN sent to ${phone}: ${otp}`);
}

/**
 * Send a single OTP-protected PDF to a subscriber.
 *
 * @param {string} phone       - Clean phone number with country code
 * @param {string} pdfUrl      - Public Supabase URL to the PDF
 * @param {string} otp         - One-time PIN (same across all sections for this subscriber/edition)
 * @param {string} sectionLabel - Human-readable section name for the caption
 * @param {string} editionDate - Edition date string
 */
async function sendProtectedPDF(phone, pdfUrl, otp, sectionLabel, editionDate) {
  const chatId = `${phone}@c.us`;

  const pdfBytes = await fetchProtectedPdf(pdfUrl, otp);
  const base64   = pdfBytes.toString('base64');
  const media    = new MessageMedia('application/pdf', base64, `NewEra_${editionDate}_${sectionLabel}.pdf`);
  const caption  = `*${sectionLabel}* — use PIN *${otp}* to open`;

  await client.sendMessage(chatId, media, { caption });
  console.log(`  Protected PDF sent to ${phone} (${sectionLabel})`);
}

/**
 * Send OTP-protected, section-specific PDFs to all subscribers.
 * Each subscriber gets a unique OTP per edition — generated fresh every send.
 *
 * @param {string} editionDate - Edition date (YYYY-MM-DD)
 * @param {string} supabaseUrl - Supabase project URL
 */
async function sendToAllSubscribers(editionDate, supabaseUrl) {
  const subscribersPath = path.join(__dirname, '..', 'backend', 'subscribers.json');
  const data = JSON.parse(fs.readFileSync(subscribersPath, 'utf-8'));

  const numbers     = data.numbers     || [];
  const preferences = data.preferences || {};

  if (numbers.length === 0) {
    console.log('No subscribers found');
    return { sent: 0, failed: 0 };
  }

  const sectionFileMap = {
    full_paper: 'full_paper.pdf',
    news:       'news.pdf',
    sport:      'sport.pdf',
    business:   'business.pdf',
    vibez:      'vibez.pdf',
    agritoday:  'agritoday.pdf',
  };

  const sectionLabelMap = {
    full_paper: 'Full Newspaper',
    news:       'NewEra News',
    sport:      'NewEra Sport',
    business:   'NewEra Business',
    vibez:      'NewEra Vibez!',
    agritoday:  'NewEra AgriToday',
  };

  let sent   = 0;
  let failed = 0;

  for (const phone of numbers) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const sections   = preferences[phone] || ['full_paper'];

    // Generate a fresh one-time PIN for this subscriber for this edition.
    // All sections for the same subscriber share the same OTP in one send.
    const otp = generateOTP();

    try {
      // Step 1: Send the PIN as a plain text message first
      await sendOTPMessage(cleanPhone, otp, editionDate, sections.length);
      await new Promise(r => setTimeout(r, 1500));

      // Step 2: Send each section PDF locked with that OTP
      for (const section of sections) {
        const filename = sectionFileMap[section];
        if (!filename) continue;

        const pdfUrl      = `${supabaseUrl}/storage/v1/object/public/outputs/${editionDate}/${filename}`;
        const sectionLabel = sectionLabelMap[section] || section;

        await sendProtectedPDF(cleanPhone, pdfUrl, otp, sectionLabel, editionDate);

        // Brief pause between sections for the same subscriber
        await new Promise(r => setTimeout(r, 2000));
      }

      sent++;
      console.log(`✓ Completed ${phone} (OTP: ${otp}, ${sections.length} section(s))`);

      // Longer pause between different subscribers
      await new Promise(r => setTimeout(r, 4000));

    } catch (err) {
      failed++;
      console.error(`✗ Failed to send to ${phone}:`, err.message);
    }
  }

  console.log('\n=== WhatsApp Send Complete ===');
  console.log(`Sent: ${sent}, Failed: ${failed}`);

  return { sent, failed };
}

// Initialize WhatsApp client
client.initialize();

module.exports = { sendToAllSubscribers, client };
