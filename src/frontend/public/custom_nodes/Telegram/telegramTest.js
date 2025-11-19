// File: telegramTest.js

const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;

if (!telegramBotToken || !telegramChatId) {
    console.error('❌ TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set in the .env file.');
    process.exit(1);
}

const bot = new TelegramBot(telegramBotToken, { polling: false });

bot.sendMessage(telegramChatId, '📟 Telegram Bot Test: Server is up and running!')
    .then(() => {
        console.log('✅ Test message sent successfully.');
        process.exit(0);
    })
    .catch((error) => {
        console.error(`❌ Failed to send test message: ${error.message}`);
        process.exit(1);
    });
