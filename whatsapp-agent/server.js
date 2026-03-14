/**
 * HTTP server for WhatsApp agent
 * Receives triggers from Python backend to send PDFs via WhatsApp Web
 */
const express = require('express');
const { sendToAllSubscribers, client } = require('./whatsapp');
const path = require('path');

const app = express();
app.use(express.json());

let isReady = false;

// Wait for WhatsApp to be ready
client.on('ready', () => {
  isReady = true;
});

app.get('/health', (req, res) => {
  res.json({ 
    status: isReady ? 'ready' : 'connecting',
    message: isReady ? 'WhatsApp connected' : 'Waiting for WhatsApp authentication'
  });
});

app.post('/send', async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ 
      error: 'WhatsApp not ready yet. Scan QR code first or wait for connection.' 
    });
  }

  const { edition_date, supabase_url } = req.body;

  if (!edition_date || !supabase_url) {
    return res.status(400).json({ error: 'edition_date and supabase_url are required' });
  }

  try {
    console.log(`\n📤 Sending WhatsApp notifications for edition ${edition_date}...`);
    const result = await sendToAllSubscribers(edition_date, supabase_url);
    res.json({ 
      status: 'success', 
      sent: result.sent, 
      failed: result.failed 
    });
  } catch (err) {
    console.error('Send error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 WhatsApp Agent running on http://localhost:${PORT}`);
  console.log('Waiting for WhatsApp Web connection...\n');
});
