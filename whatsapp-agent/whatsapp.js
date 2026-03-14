/**
 * Local WhatsApp agent using whatsapp-web.js
 * 100% free, no API keys, connects via your real WhatsApp Web
 */
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

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
 * Send a message with a PDF attachment to a single number
 * @param {string} phone - Phone number with country code (e.g. "264813401526")
 * @param {string} pdfUrl - Public URL to PDF file
 * @param {string} caption - Message caption
 */
async function sendPDF(phone, pdfUrl, caption) {
  const chatId = `${phone}@c.us`;
  const media = await MessageMedia.fromUrl(pdfUrl);
  await client.sendMessage(chatId, media, { caption });
  console.log(`✓ Sent PDF to ${phone}`);
}

/**
 * Send section-specific PDFs to all subscribers based on their preferences
 * @param {string} editionDate - Edition date (YYYY-MM-DD)
 * @param {string} supabaseUrl - Supabase project URL
 */
async function sendToAllSubscribers(editionDate, supabaseUrl) {
  const subscribersPath = path.join(__dirname, '..', 'backend', 'subscribers.json');
  const data = JSON.parse(fs.readFileSync(subscribersPath, 'utf-8'));
  
  const numbers = data.numbers || [];
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
    solzi:      'solzi.pdf',
  };

  let sent = 0;
  let failed = 0;

  for (const phone of numbers) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const sections = preferences[phone] || ['full_paper'];

    try {
      for (const section of sections) {
        const filename = sectionFileMap[section];
        if (!filename) continue;

        const pdfUrl = `${supabaseUrl}/storage/v1/object/public/outputs/${editionDate}/${filename}`;
        const sectionLabel = section === 'full_paper' ? 'Full Newspaper' : `NewEra ${section}`;
        const caption = `📰 *New Era Edition — ${editionDate}*\n\n${sectionLabel}`;
        
        await sendPDF(cleanPhone, pdfUrl, caption);
        
        // Brief pause between sections for same subscriber
        await new Promise(r => setTimeout(r, 2000));
      }
      
      sent++;
      console.log(`✓ Completed ${phone} (${sections.length} section(s))`);
      
      // Longer pause between different subscribers
      await new Promise(r => setTimeout(r, 4000));
      
    } catch (err) {
      failed++;
      console.error(`✗ Failed to send to ${phone}:`, err.message);
    }
  }

  console.log(`\n=== WhatsApp Send Complete ===`);
  console.log(`Sent: ${sent}, Failed: ${failed}`);
  
  return { sent, failed };
}

// Initialize WhatsApp client
client.initialize();

module.exports = { sendToAllSubscribers, client };
