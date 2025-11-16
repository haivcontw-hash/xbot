require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const https = require('https');
const db = require('./database');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '8598146921:AAEo9YKCgxWydOG5J_oeDOn-DzKXCZ2USpY';
const DEFAULT_SYMBOL = (process.env.DEFAULT_SYMBOL || 'XMEME').toUpperCase();
const DEFAULT_MARKET_PAIR = process.env.DEFAULT_MARKET_PAIR || `${DEFAULT_SYMBOL}-USDT`;
const OKX_BASE_URL = process.env.OKX_BASE_URL || 'https://www.okx.com';
const ALERT_POLL_INTERVAL = Number(process.env.ALERT_POLL_INTERVAL || 60_000);
const WHALE_POLL_INTERVAL = Number(process.env.WHALE_POLL_INTERVAL || 45_000);
const PREDICTION_WINDOW_MS = Number(process.env.PREDICTION_WINDOW_MS || 60 * 60 * 1000);
const PORT = Number(process.env.PORT || 3000);
const CHECKIN_POINTS = Number(process.env.CHECKIN_POINTS || 5);

if (!TELEGRAM_TOKEN) {
    console.error('Missing TELEGRAM_TOKEN. Set it in your environment variables.');
    process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const app = express();
app.use(cors());
app.use(express.json());

const adminCache = new Map();
const settingsCache = new Map();
const pendingCaptchas = new Map();
const processedTrades = new Map();

function withTimeout(promise, timeoutMs, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${label || 'Request'} timed out`)), timeoutMs)
        )
    ]);
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                reject(new Error(`HTTP ${res.statusCode}`));
                res.resume();
                return;
            }
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(error);
                }
            });
        });
        req.on('error', reject);
    });
}

async function fetchTicker(instId = DEFAULT_MARKET_PAIR) {
    const url = `${OKX_BASE_URL}/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`;
    const data = await withTimeout(fetchJson(url), 10_000, 'Ticker request');
    const ticker = data.data?.[0];
    if (!ticker) {
        throw new Error('Ticker unavailable');
    }
    return {
        instId,
        last: Number(ticker.last),
        open24h: Number(ticker.open24h),
        high24h: Number(ticker.high24h),
        low24h: Number(ticker.low24h),
        vol24h: Number(ticker.volCcy24h || ticker.vol24h || 0),
        ts: Number(ticker.ts)
    };
}

async function fetchRecentTrades(instId, limit = 40) {
    const url = `${OKX_BASE_URL}/api/v5/market/trades?instId=${encodeURIComponent(instId)}&limit=${limit}`;
    const data = await withTimeout(fetchJson(url), 10_000, 'Trades request');
    return Array.isArray(data.data) ? data.data : [];
}

function formatNumber(value, options = {}) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return '—';
    }
    const fractionDigits = options.fractionDigits ?? 4;
    return Number(value).toLocaleString('en-US', {
        maximumFractionDigits: fractionDigits,
        minimumFractionDigits: options.minFractionDigits ?? 2
    });
}

function escapeHtml(text = '') {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

async function isAdmin(chatId, userId) {
    const cacheKey = `${chatId}:${userId}`;
    const cached = adminCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }
    try {
        const member = await bot.getChatMember(chatId, userId);
        const status = member.status;
        const value = status === 'administrator' || status === 'creator';
        adminCache.set(cacheKey, { value, expiresAt: Date.now() + 5 * 60 * 1000 });
        return value;
    } catch (error) {
        console.error('Failed to resolve admin state', error.message);
        return false;
    }
}

async function getSettings(chatId) {
    const cached = settingsCache.get(chatId);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }
    const settings = await db.getGroupSettings(chatId);
    settingsCache.set(chatId, { value: settings, expiresAt: Date.now() + 60 * 1000 });
    return settings;
}

function cacheSettings(chatId, settings) {
    settingsCache.set(chatId, { value: settings, expiresAt: Date.now() + 60 * 1000 });
}

function formatUser(user) {
    if (!user) return 'Ẩn danh';
    if (user.username) return `@${user.username}`;
    return [user.first_name, user.last_name].filter(Boolean).join(' ') || String(user.id);
}

function containsSpamLink(text) {
    if (!text) return false;
    const lowered = text.toLowerCase();
    if (lowered.includes('http://') || lowered.includes('https://')) {
        if (lowered.includes('airdrop') || lowered.includes('bonus') || lowered.includes('claim')) {
            return true;
        }
    }
    return false;
}

function normalizeBlacklist(value) {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
            return parsed.filter((word) => typeof word === 'string' && word.trim()).map((word) => word.trim().toLowerCase());
        }
    } catch (_) {
        // ignore
    }
    return String(value)
        .split(',')
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean);
}

function hasBlacklistedWord(text, blacklistValue) {
    if (!text) return false;
    const blacklist = normalizeBlacklist(blacklistValue);
    if (blacklist.length === 0) return false;
    const lowered = text.toLowerCase();
    return blacklist.some((word) => lowered.includes(word));
}

const POSITIVE_WORDS = ['bull', 'tăng', 'pump', 'win', 'moon', 'wow', 'great', 'love'];
const NEGATIVE_WORDS = ['bear', 'giảm', 'dump', 'lose', 'hate', 'bad', 'sad'];

function scoreSentiment(text) {
    if (!text) return 0;
    const lowered = text.toLowerCase();
    let score = 0;
    for (const word of POSITIVE_WORDS) {
        if (lowered.includes(word)) score += 1;
    }
    for (const word of NEGATIVE_WORDS) {
        if (lowered.includes(word)) score -= 1;
    }
    if (score > 0) return 1;
    if (score < 0) return -1;
    return 0;
}

async function ensureWelcome(chatId, user) {
    const settings = await getSettings(chatId);
    if (!settings.welcome_text) {
        return;
    }
    const text = settings.welcome_text.replace('{name}', formatUser(user));
    const requiresCaptcha = Number(settings.captcha_required) === 1;
    if (!requiresCaptcha) {
        await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
        return;
    }
    const token = `${chatId}:${user.id}:${Date.now()}`;
    const timeoutAt = Date.now() + 60 * 1000;
    pendingCaptchas.set(token, { chatId, userId: user.id, timeoutAt });
    const html = `${escapeHtml(text)}\n\nNhấn nút bên dưới để xác minh bạn là người thật trong 60s.`;
    await bot.sendMessage(chatId, html, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: '✅ Tôi là người thật',
                        callback_data: `verify|${token}`
                    }
                ]
            ]
        }
    });
    setTimeout(async () => {
        const pending = pendingCaptchas.get(token);
        if (pending && pending.timeoutAt <= Date.now()) {
            pendingCaptchas.delete(token);
            try {
                await bot.banChatMember(chatId, user.id);
                await bot.unbanChatMember(chatId, user.id);
                await bot.sendMessage(chatId, `${formatUser(user)} đã bị xoá vì không vượt qua xác minh.`);
            } catch (error) {
                console.warn('Không thể xoá người dùng sau khi hết hạn captcha:', error.message);
            }
        }
    }, 60 * 1000);
}

async function handleCheckinCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userLabel = formatUser(msg.from);
    const result = await db.recordCheckin(String(chatId), String(userId), userLabel, CHECKIN_POINTS);
    if (result.alreadyChecked) {
        return bot.sendMessage(chatId, `${userLabel} đã điểm danh hôm nay rồi. 🔁`);
    }
    const lines = [
        `✅ ${userLabel} đã điểm danh thành công!`,
        `• Chuỗi ngày: ${result.streak} ngày`,
        `• Thành tích tốt nhất: ${result.longest_streak || result.streak} ngày`,
        `• Tổng điểm cộng đồng: ${result.total_points}`
    ];
    await bot.sendMessage(chatId, lines.join('\n'));
}

async function handleLeaderboardCommand(msg) {
    const chatId = msg.chat.id;
    const rows = await db.getLeaderboard(String(chatId), 10);
    if (!rows || rows.length === 0) {
        return bot.sendMessage(chatId, 'Chưa có dữ liệu điểm danh nào. Hãy dùng /checkin để bắt đầu!');
    }
    const lines = rows.map((row, index) => {
        const name = row.username || row.user_id;
        return `${index + 1}. ${name} — ${row.total_points} điểm (${row.total_checkins} ngày)`;
    });
    await bot.sendMessage(chatId, `🏆 TOP 10 Điểm danh\n\n${lines.join('\n')}`);
}

async function handlePriceCommand(msg, symbolArg) {
    const symbol = symbolArg ? symbolArg.toUpperCase() : DEFAULT_MARKET_PAIR;
    const pair = symbol.includes('-') ? symbol : `${symbol}-USDT`;
    try {
        const ticker = await fetchTicker(pair);
        const change = ((ticker.last - ticker.open24h) / ticker.open24h) * 100;
        const text = [
            `💱 Giá ${pair}`,
            `• Giá hiện tại: <b>${formatNumber(ticker.last)}</b>`,
            `• Thay đổi 24h: <b>${formatNumber(change, { fractionDigits: 2 })}%</b>`,
            `• Khối lượng 24h: ${formatNumber(ticker.vol24h, { fractionDigits: 2 })}`,
            `• Cao nhất: ${formatNumber(ticker.high24h)}`,
            `• Thấp nhất: ${formatNumber(ticker.low24h)}`,
            `Cập nhật: ${new Date(ticker.ts).toLocaleString('vi-VN')}`
        ].join('\n');
        await bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML' });
    } catch (error) {
        console.error('Price command failed', error.message);
        await bot.sendMessage(msg.chat.id, 'Không thể lấy giá lúc này.');
    }
}

async function handleInfoCommand(msg, symbolArg) {
    const symbol = (symbolArg || DEFAULT_SYMBOL).toUpperCase();
    const info = await db.getTokenInfo(symbol);
    if (!info) {
        await bot.sendMessage(msg.chat.id, `Chưa có thông tin cho ${symbol}. Admin hãy dùng /settoken để cập nhật.`);
        return;
    }
    const lines = [
        `ℹ️ Thông tin ${symbol}`,
        info.name && info.name !== symbol ? `• Tên: ${info.name}` : null,
        info.contract_address ? `• Contract: <code>${info.contract_address}</code>` : null,
        info.dex_url ? `• Mua/Bán: ${info.dex_url}` : null,
        info.website ? `• Website: ${info.website}` : null,
        info.twitter ? `• Twitter: ${info.twitter}` : null,
        info.telegram ? `• Telegram: ${info.telegram}` : null,
        info.description ? `• Ghi chú: ${info.description}` : null
    ].filter(Boolean);
    await bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'HTML' });
}

async function handleSetToken(msg, args) {
    if (!(await isAdmin(msg.chat.id, msg.from.id))) {
        return bot.sendMessage(msg.chat.id, 'Lệnh này chỉ dành cho admin.');
    }
    const parts = args.split('|').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) {
        return bot.sendMessage(msg.chat.id, 'Cú pháp: /settoken SYMBOL | contract | dexUrl | website | twitter | telegram | mô tả');
    }
    const [symbol, contract, dexUrl, website, twitter, telegram, description] = parts;
    await db.saveTokenInfo({
        symbol: symbol.toUpperCase(),
        name: symbol.toUpperCase(),
        contract_address: contract || '',
        dex_url: dexUrl || '',
        website: website || '',
        twitter: twitter || '',
        telegram: telegram || '',
        description: description || '',
        network: 'Xlayer'
    });
    await bot.sendMessage(msg.chat.id, `Đã cập nhật thông tin ${symbol.toUpperCase()}.`);
}

async function handleAlertCommand(msg, textArg) {
    const [percentText, directionText] = (textArg || '').split(/\s+/);
    const percent = Number((percentText || '').replace('%', ''));
    if (!Number.isFinite(percent) || percent <= 0) {
        return bot.sendMessage(msg.chat.id, 'Vui lòng nhập tỷ lệ % hợp lệ. Ví dụ: /alert 15 hoặc /alert 10 down');
    }
    const direction = directionText && ['up', 'down'].includes(directionText.toLowerCase())
        ? directionText.toLowerCase()
        : 'both';
    try {
        const ticker = await fetchTicker(DEFAULT_MARKET_PAIR);
        const alertId = await db.createPriceAlert({
            chatId: String(msg.chat.id),
            userId: String(msg.from.id),
            symbol: DEFAULT_MARKET_PAIR,
            baselinePrice: ticker.last,
            targetPercent: percent,
            direction
        });
        await bot.sendMessage(msg.chat.id, `✅ Đã tạo cảnh báo ${percent}% (ID: ${alertId}). Tôi sẽ nhắc bạn khi biến động đạt ngưỡng.`);
    } catch (error) {
        console.error('Alert command failed', error.message);
        await bot.sendMessage(msg.chat.id, 'Không thể tạo cảnh báo lúc này.');
    }
}

async function handleWhaleCommand(msg, thresholdText) {
    if (!(await isAdmin(msg.chat.id, msg.from.id))) {
        return bot.sendMessage(msg.chat.id, 'Chỉ admin mới chỉnh được whale alert.');
    }
    const value = Number((thresholdText || '').replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(value) || value <= 0) {
        return bot.sendMessage(msg.chat.id, 'Hãy nhập số USD tối thiểu, ví dụ /whale 50000');
    }
    await db.saveWhaleWatch(String(msg.chat.id), DEFAULT_MARKET_PAIR, value);
    cacheSettings(msg.chat.id, await db.getGroupSettings(String(msg.chat.id)));
    await bot.sendMessage(msg.chat.id, `🐋 Đã bật cảnh báo whale cho ${DEFAULT_MARKET_PAIR} ≥ ${formatNumber(value, { fractionDigits: 0 })} USD.`);
}

async function handleWelcomeCommand(msg, text) {
    if (!(await isAdmin(msg.chat.id, msg.from.id))) {
        return bot.sendMessage(msg.chat.id, 'Bạn cần quyền admin để chỉnh lời chào.');
    }
    const requiresCaptcha = /\s--captcha/.test(text || '');
    const sanitized = text.replace(/\s--captcha/, '').trim();
    const settings = await db.saveGroupSettings(String(msg.chat.id), {
        welcome_text: sanitized || null,
        captcha_required: requiresCaptcha ? 1 : 0
    });
    cacheSettings(msg.chat.id, settings);
    if (!sanitized) {
        await bot.sendMessage(msg.chat.id, 'Đã tắt lời chào tự động.');
        return;
    }
    const suffix = requiresCaptcha ? ' (kèm xác minh 60s)' : '';
    await bot.sendMessage(msg.chat.id, `Đã cập nhật lời chào${suffix}.`);
}

async function handleBlacklistCommand(msg, text) {
    if (!(await isAdmin(msg.chat.id, msg.from.id))) {
        return bot.sendMessage(msg.chat.id, 'Chỉ admin mới sửa blacklist.');
    }
    const keywords = text
        .split(',')
        .map((word) => word.trim())
        .filter(Boolean);
    const payload = JSON.stringify(keywords);
    const settings = await db.saveGroupSettings(String(msg.chat.id), { blacklist: payload });
    cacheSettings(msg.chat.id, settings);
    await bot.sendMessage(msg.chat.id, `Đã cập nhật blacklist: ${keywords.join(', ') || 'không có'}`);
}

async function handleStatsCommand(msg) {
    const chatId = msg.chat.id;
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const activeMembers = await db.getActiveMembers(String(chatId), since, 5);
    let memberCount = '—';
    try {
        memberCount = await bot.getChatMemberCount(chatId);
    } catch (error) {
        console.warn('Không lấy được số thành viên:', error.message);
    }
    const lines = [`👥 Tổng thành viên: ${memberCount}`, `🔥 Hoạt động 24h: ${activeMembers.length}`];
    if (activeMembers.length > 0) {
        lines.push('\nTop tương tác 24h:');
        activeMembers.forEach((member, index) => {
            const name = member.username || member.user_id;
            lines.push(`${index + 1}. ${name} — ${member.messages} tin nhắn`);
        });
    }
    await bot.sendMessage(chatId, lines.join('\n'));
}

async function handlePredictCommand(msg, priceText) {
    const price = Number(priceText);
    if (!Number.isFinite(price) || price <= 0) {
        return bot.sendMessage(msg.chat.id, 'Hãy nhập giá dự đoán hợp lệ. Ví dụ /predict 0.0123');
    }
    const chatId = String(msg.chat.id);
    let game = await db.getActivePrediction(chatId);
    const now = Date.now();
    if (!game || game.expires_at <= now) {
        const expiresAt = now + PREDICTION_WINDOW_MS;
        const gameId = await db.createPredictionGame(chatId, DEFAULT_MARKET_PAIR, expiresAt);
        game = { id: gameId, chat_id: chatId, symbol: DEFAULT_MARKET_PAIR, expires_at: expiresAt };
        await bot.sendMessage(msg.chat.id, `🎯 Bắt đầu vòng dự đoán mới cho ${DEFAULT_MARKET_PAIR}. Kết thúc lúc ${new Date(expiresAt).toLocaleTimeString('vi-VN')}`);
    }
    await db.addPredictionEntry(game.id, String(msg.from.id), formatUser(msg.from), price);
    await bot.sendMessage(msg.chat.id, `${formatUser(msg.from)} đã ghi nhận dự đoán ${price}.`);
}

async function handleDrawCommand(msg, args) {
    if (!(await isAdmin(msg.chat.id, msg.from.id))) {
        return bot.sendMessage(msg.chat.id, 'Chỉ admin mới dùng được /draw');
    }
    const [prize, rules] = args.split('|').map((part) => part.trim());
    const since = Date.now() - 48 * 60 * 60 * 1000;
    const candidates = await db.getActiveMembers(String(msg.chat.id), since, 100);
    if (candidates.length === 0) {
        return bot.sendMessage(msg.chat.id, 'Không có ai đủ điều kiện để quay thưởng.');
    }
    const winner = candidates[Math.floor(Math.random() * candidates.length)];
    const winnerName = winner.username || winner.user_id;
    const lines = [
        '🎁 Giveaway hoàn tất!',
        prize ? `• Phần thưởng: ${prize}` : null,
        rules ? `• Điều kiện: ${rules}` : null,
        `• Người thắng: ${winnerName}`
    ].filter(Boolean);
    await bot.sendMessage(msg.chat.id, lines.join('\n'));
}

async function handleMemeCommand(msg) {
    const meme = await db.getRandomMeme();
    if (!meme) {
        return bot.sendMessage(msg.chat.id, 'Kho meme đang trống. Hãy dùng /addmeme để đóng góp!');
    }
    await bot.sendPhoto(msg.chat.id, meme.file_id, { caption: meme.caption || '' });
}

async function handleAddMeme(msg) {
    if (!msg.reply_to_message || !msg.reply_to_message.photo) {
        return bot.sendMessage(msg.chat.id, 'Hãy reply vào ảnh để thêm meme.');
    }
    const photo = msg.reply_to_message.photo.pop();
    const fileId = photo.file_id;
    const caption = msg.reply_to_message.caption || '';
    const id = await db.addMeme(String(msg.chat.id), fileId, formatUser(msg.from), caption);
    await bot.sendMessage(msg.chat.id, `Đã lưu meme #${id}. Admin duyệt bằng /approvememe ${id}`);
}

async function handleApproveMeme(msg, idText) {
    if (!(await isAdmin(msg.chat.id, msg.from.id))) {
        return bot.sendMessage(msg.chat.id, 'Chỉ admin mới duyệt meme được.');
    }
    const id = Number(idText);
    if (!Number.isFinite(id)) {
        return bot.sendMessage(msg.chat.id, 'ID không hợp lệ.');
    }
    await db.approveMeme(id);
    await bot.sendMessage(msg.chat.id, `Đã duyệt meme #${id}.`);
}

async function handleCreateMeme(msg, args) {
    const match = args.match(/"(.+?)"\s+"(.+?)"/);
    if (!match) {
        return bot.sendMessage(msg.chat.id, 'Cú pháp: /create "Chữ trên" "Chữ dưới"');
    }
    const [, top, bottom] = match;
    const url = `https://api.memegen.link/images/custom/${encodeURIComponent(top)}/${encodeURIComponent(bottom)}.png?background=transparent`;
    await bot.sendPhoto(msg.chat.id, url);
}

async function handleSentimentCommand(msg) {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const stats = await db.getSentimentStats(String(msg.chat.id), since);
    const total = stats.positive + stats.negative + stats.neutral;
    if (total === 0) {
        return bot.sendMessage(msg.chat.id, 'Chưa đủ dữ liệu để phân tích cảm xúc.');
    }
    const pct = (value) => ((value / total) * 100).toFixed(1);
    const lines = [
        '🧠 Phân tích cảm xúc 24h:',
        `• Tích cực: ${pct(stats.positive)}%`,
        `• Trung lập: ${pct(stats.neutral)}%`,
        `• Tiêu cực: ${pct(stats.negative)}%`
    ];
    await bot.sendMessage(msg.chat.id, lines.join('\n'));
}

function handleHelp(msg) {
    const text = [
        '🤖 <b>Xlayer Meme Navigator</b>',
        'Các lệnh chính:',
        '• /price hoặc /p [SYMBOL] — Giá & biểu đồ',
        '• /info [SYMBOL] — Thông tin token',
        '• /alert [x]% — Tạo cảnh báo giá',
        '• /whale [usd] — Bật cảnh báo cá voi (admin)',
        '• /welcome [text --captcha] — Lời chào + captcha (admin)',
        '• /stats — Thống kê nhóm',
        '• /checkin — Điểm danh hàng ngày',
        '• /leaderboard — Xếp hạng điểm danh',
        '• /predict [price] — Mini game dự đoán',
        '• /draw prize | rules — Quay thưởng (admin)',
        '• /meme, /addmeme, /create, /sentiment'
    ].join('\n');
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML' });
}

function startHttpServer() {
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: Date.now() });
    });

    app.get('/tokens', async (req, res) => {
        const tokens = await db.listTokens();
        res.json(tokens);
    });

    app.listen(PORT, () => {
        console.log(`HTTP server listening on ${PORT}`);
    });
}

async function pollPriceAlerts() {
    try {
        const alerts = await db.listPriceAlerts();
        if (alerts.length === 0) {
            return;
        }
        const grouped = alerts.reduce((acc, alert) => {
            acc[alert.symbol] = acc[alert.symbol] || [];
            acc[alert.symbol].push(alert);
            return acc;
        }, {});
        for (const [symbol, symbolAlerts] of Object.entries(grouped)) {
            const ticker = await fetchTicker(symbol);
            const current = ticker.last;
            for (const alert of symbolAlerts) {
                const diffPercent = ((current - alert.baseline_price) / alert.baseline_price) * 100;
                const reached = Math.abs(diffPercent) >= alert.target_percent;
                const direction = diffPercent >= 0 ? 'up' : 'down';
                if (reached && (alert.direction === 'both' || alert.direction === direction)) {
                    await bot.sendMessage(Number(alert.chat_id), `🚨 Giá ${symbol} đã thay đổi ${formatNumber(diffPercent, { fractionDigits: 2 })}% (ngưỡng ${alert.target_percent}%).`);
                    await db.deletePriceAlert(alert.id);
                }
            }
        }
    } catch (error) {
        console.error('pollPriceAlerts error', error.message);
    }
}

async function pollWhaleAlerts() {
    try {
        const watchers = await db.listWhaleWatchers();
        if (!watchers || watchers.length === 0) {
            return;
        }
        for (const watcher of watchers) {
            const trades = await fetchRecentTrades(watcher.whale_symbol || DEFAULT_MARKET_PAIR, 40);
            const key = watcher.chat_id;
            const seen = processedTrades.get(key) || new Set();
            for (const trade of trades) {
                if (seen.has(trade.tradeId)) {
                    continue;
                }
                const sizeUsd = Number(trade.sz) * Number(trade.px);
                if (sizeUsd >= watcher.whale_threshold) {
                    await bot.sendMessage(Number(watcher.chat_id), `🐋 Giao dịch lớn: ${formatNumber(sizeUsd, { fractionDigits: 0 })} USD (${trade.side}) trên ${watcher.whale_symbol}`);
                }
                seen.add(trade.tradeId);
                if (seen.size > 200) {
                    const first = Array.from(seen)[0];
                    seen.delete(first);
                }
            }
            processedTrades.set(key, seen);
        }
    } catch (error) {
        console.error('pollWhaleAlerts error', error.message);
    }
}

async function settlePredictions() {
    try {
        const dueGames = await db.listPredictionsToSettle(Date.now());
        for (const game of dueGames) {
            const ticker = await fetchTicker(game.symbol || DEFAULT_MARKET_PAIR);
            const price = ticker.last;
            const entries = await db.listPredictionEntries(game.id);
            if (!entries || entries.length === 0) {
                await db.resolvePredictionGame(game.id, price);
                await bot.sendMessage(Number(game.chat_id), `🎯 Vòng dự đoán kết thúc, không có người tham gia.`);
                continue;
            }
            let bestDiff = Infinity;
            let winner = null;
            entries.forEach((entry) => {
                const diff = Math.abs(entry.prediction - price);
                if (diff < bestDiff) {
                    bestDiff = diff;
                    winner = entry;
                }
            });
            await db.resolvePredictionGame(game.id, price);
            await bot.sendMessage(Number(game.chat_id), `🎯 Giá thực tế: ${price}. Người thắng: ${winner.username || winner.user_id} với dự đoán ${winner.prediction}.`);
        }
    } catch (error) {
        console.error('settlePredictions error', error.message);
    }
}

bot.onText(/^\/start/, (msg) => {
    const text = 'Chào mừng đến với Xlayer Meme Navigator! Dùng /help để xem các lệnh.';
    bot.sendMessage(msg.chat.id, text);
});

bot.onText(/^\/help/, handleHelp);
bot.onText(/^\/(price|p)(?:@\w+)?(?:\s+(\S+))?/, (msg, match) => handlePriceCommand(msg, match[2]));
bot.onText(/^\/info(?:@\w+)?(?:\s+(\S+))?/, (msg, match) => handleInfoCommand(msg, match[1]));
bot.onText(/^\/settoken(?:@\w+)?\s+(.+)/, (msg, match) => handleSetToken(msg, match[1]));
bot.onText(/^\/alert(?:@\w+)?\s+(.+)/, (msg, match) => handleAlertCommand(msg, match[1]));
bot.onText(/^\/whale(?:@\w+)?\s+(.+)/, (msg, match) => handleWhaleCommand(msg, match[1]));
bot.onText(/^\/welcome(?:@\w+)?\s*(.*)/, (msg, match) => handleWelcomeCommand(msg, match[1] || ''));
bot.onText(/^\/blacklist(?:@\w+)?\s*(.*)/, (msg, match) => handleBlacklistCommand(msg, match[1] || ''));
bot.onText(/^\/stats/, handleStatsCommand);
bot.onText(/^\/checkin/, handleCheckinCommand);
bot.onText(/^\/(leaderboard|topcheckin)/, handleLeaderboardCommand);
bot.onText(/^\/predict(?:@\w+)?\s+(.+)/, (msg, match) => handlePredictCommand(msg, match[1]));
bot.onText(/^\/draw(?:@\w+)?\s+(.+)/, (msg, match) => handleDrawCommand(msg, match[1]));
bot.onText(/^\/meme/, handleMemeCommand);
bot.onText(/^\/addmeme/, handleAddMeme);
bot.onText(/^\/approvememe\s+(\d+)/, (msg, match) => handleApproveMeme(msg, match[1]));
bot.onText(/^\/create\s+(.+)/, (msg, match) => handleCreateMeme(msg, match[1]));
bot.onText(/^\/sentiment/, handleSentimentCommand);

bot.on('new_chat_members', async (msg) => {
    for (const member of msg.new_chat_members) {
        await ensureWelcome(msg.chat.id, member);
    }
});

bot.on('callback_query', async (query) => {
    if (!query.data) return;
    if (query.data.startsWith('verify|')) {
        const token = query.data.split('|')[1];
        const pending = pendingCaptchas.get(token);
        if (!pending) {
            return bot.answerCallbackQuery(query.id, { text: 'Liên kết hết hạn', show_alert: true });
        }
        if (pending.userId !== query.from.id) {
            return bot.answerCallbackQuery(query.id, { text: 'Bạn không phải người cần xác minh.', show_alert: true });
        }
        pendingCaptchas.delete(token);
        await bot.answerCallbackQuery(query.id, { text: 'Đã xác minh!' });
        await bot.sendMessage(pending.chatId, `${formatUser(query.from)} đã vượt qua captcha.`);
    }
});

bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) {
        return;
    }
    const chatId = msg.chat.id;
    if (msg.chat.type !== 'private') {
        const settings = await getSettings(chatId);
        if (containsSpamLink(msg.text) || hasBlacklistedWord(msg.text, settings.blacklist)) {
            try {
                await bot.deleteMessage(chatId, msg.message_id);
                await bot.sendMessage(chatId, `${formatUser(msg.from)}: Tin nhắn bị xoá do vi phạm quy tắc.`);
            } catch (error) {
                console.warn('Không thể xoá tin nhắn:', error.message);
            }
            return;
        }
    }
    const score = scoreSentiment(msg.text);
    await db.recordMessage(String(chatId), String(msg.from.id), formatUser(msg.from), score);
});

async function bootstrap() {
    await db.init();
    startHttpServer();
    setInterval(pollPriceAlerts, ALERT_POLL_INTERVAL);
    setInterval(pollWhaleAlerts, WHALE_POLL_INTERVAL);
    setInterval(settlePredictions, 30 * 1000);
    console.log('✅ Xlayer Meme Navigator đã sẵn sàng.');
}

bootstrap().catch((error) => {
    console.error('Không thể khởi động bot:', error);
    process.exit(1);
});
