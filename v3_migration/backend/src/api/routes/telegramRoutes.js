/**
 * telegramRoutes.js - Telegram Bot API endpoints
 * 
 * Handles sending Telegram notifications.
 * Extracted from server.js for better separation of concerns.
 */

const express = require('express');
const router = express.Router();
const logger = require('../../logging/logger');

// POST /api/telegram/send - Send a Telegram notification
router.post('/send', express.json(), async (req, res) => {
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({ success: false, error: 'Message is required' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    logger.log('[Telegram] Not configured (missing token or chat_id)', 'warn', false, 'telegram');
    return res.json({ success: false, error: 'Telegram not configured' });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    if (response.ok) {
      logger.log(`[Telegram] Sent: ${message}`, 'info', false, 'telegram');
      res.json({ success: true });
    } else {
      const data = await response.json();
      logger.log(`[Telegram] Failed: ${data.description}`, 'error', false, 'telegram');
      res.json({ success: false, error: data.description });
    }
  } catch (err) {
    logger.log(`[Telegram] Error: ${err.message}`, 'error', false, 'telegram');
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
