const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'xlayer_navigator.db');
const db = new sqlite3.Database(DB_PATH);

const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
        if (err) {
            reject(err);
        } else {
            resolve(this);
        }
    });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) {
            reject(err);
        } else {
            resolve(row);
        }
    });
});

const all = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) {
            reject(err);
        } else {
            resolve(rows);
        }
    });
});

const DEFAULT_GROUP_SETTINGS = {
    welcome_text: null,
    captcha_required: 0,
    blacklist: '[]',
    whale_symbol: null,
    whale_threshold: 25000,
    sentiment_opt_in: 1
};

async function init() {
    await run(`CREATE TABLE IF NOT EXISTS group_settings (
        chat_id TEXT PRIMARY KEY,
        welcome_text TEXT,
        captcha_required INTEGER DEFAULT 0,
        blacklist TEXT DEFAULT '[]',
        whale_symbol TEXT,
        whale_threshold REAL DEFAULT 25000,
        last_trade_id TEXT,
        sentiment_opt_in INTEGER DEFAULT 1,
        updated_at INTEGER
    )`);

    await run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT,
        user_id TEXT,
        username TEXT,
        score INTEGER,
        created_at INTEGER
    )`);

    await run(`CREATE TABLE IF NOT EXISTS message_activity (
        chat_id TEXT,
        user_id TEXT,
        username TEXT,
        messages INTEGER DEFAULT 0,
        last_message_at INTEGER,
        PRIMARY KEY (chat_id, user_id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS checkins (
        chat_id TEXT,
        user_id TEXT,
        username TEXT,
        last_checkin TEXT,
        streak INTEGER DEFAULT 0,
        longest_streak INTEGER DEFAULT 0,
        total_points INTEGER DEFAULT 0,
        total_checkins INTEGER DEFAULT 0,
        PRIMARY KEY (chat_id, user_id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS price_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT,
        user_id TEXT,
        symbol TEXT,
        baseline_price REAL,
        target_percent REAL,
        direction TEXT,
        created_at INTEGER
    )`);

    await run(`CREATE TABLE IF NOT EXISTS token_registry (
        symbol TEXT PRIMARY KEY,
        name TEXT,
        contract_address TEXT,
        network TEXT,
        decimals INTEGER,
        dex_url TEXT,
        website TEXT,
        twitter TEXT,
        telegram TEXT,
        description TEXT,
        updated_at INTEGER
    )`);

    await run(`CREATE TABLE IF NOT EXISTS prediction_games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT,
        symbol TEXT,
        expires_at INTEGER,
        resolved INTEGER DEFAULT 0,
        result_price REAL,
        created_at INTEGER
    )`);

    await run(`CREATE TABLE IF NOT EXISTS prediction_entries (
        game_id INTEGER,
        user_id TEXT,
        username TEXT,
        prediction REAL,
        created_at INTEGER,
        PRIMARY KEY (game_id, user_id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS memes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT,
        file_id TEXT,
        added_by TEXT,
        approved INTEGER DEFAULT 0,
        caption TEXT,
        created_at INTEGER
    )`);
}

async function getGroupSettings(chatId) {
    const row = await get('SELECT * FROM group_settings WHERE chat_id = ?', [chatId]);
    if (!row) {
        return { chat_id: chatId, ...DEFAULT_GROUP_SETTINGS };
    }
    return {
        chat_id: chatId,
        ...DEFAULT_GROUP_SETTINGS,
        ...row,
        blacklist: row.blacklist || DEFAULT_GROUP_SETTINGS.blacklist
    };
}

async function saveGroupSettings(chatId, patch = {}) {
    const now = Date.now();
    const keys = Object.keys(patch).filter((key) => patch[key] !== undefined);
    if (keys.length === 0) {
        return getGroupSettings(chatId);
    }

    const columns = keys.join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map((key) => patch[key]);

    await run(
        `INSERT INTO group_settings (chat_id, ${columns}, updated_at)
         VALUES (?, ${placeholders}, ?)
         ON CONFLICT(chat_id) DO UPDATE SET ${keys
             .map((key) => `${key} = excluded.${key}`)
             .join(', ')}, updated_at = excluded.updated_at`,
        [chatId, ...values, now]
    );

    return getGroupSettings(chatId);
}

async function recordMessage(chatId, userId, username, score) {
    const now = Date.now();
    await run(
        `INSERT INTO messages (chat_id, user_id, username, score, created_at)
         VALUES (?, ?, ?, ?, ?)` ,
        [chatId, userId, username || '', score, now]
    );

    await run(
        `INSERT INTO message_activity (chat_id, user_id, username, messages, last_message_at)
         VALUES (?, ?, ?, 1, ?)
         ON CONFLICT(chat_id, user_id) DO UPDATE SET
            messages = message_activity.messages + 1,
            username = excluded.username,
            last_message_at = excluded.last_message_at`,
        [chatId, userId, username || '', now]
    );

    const cutoff = now - 3 * 24 * 60 * 60 * 1000;
    await run('DELETE FROM messages WHERE created_at < ?', [cutoff]);
}

async function getSentimentStats(chatId, sinceTimestamp) {
    const row = await get(
        `SELECT
            SUM(CASE WHEN score > 0 THEN 1 ELSE 0 END) AS positive,
            SUM(CASE WHEN score < 0 THEN 1 ELSE 0 END) AS negative,
            SUM(CASE WHEN score = 0 THEN 1 ELSE 0 END) AS neutral
         FROM messages
         WHERE chat_id = ? AND created_at >= ?`,
        [chatId, sinceTimestamp]
    );

    return {
        positive: row?.positive || 0,
        negative: row?.negative || 0,
        neutral: row?.neutral || 0
    };
}

function dateString(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function isYesterday(previousDateStr, todayStr) {
    if (!previousDateStr) {
        return false;
    }
    const prev = new Date(previousDateStr + 'T00:00:00Z');
    const today = new Date(todayStr + 'T00:00:00Z');
    const diff = today - prev;
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.abs(diff - oneDay) < oneDay / 2;
}

async function recordCheckin(chatId, userId, username, points = 5) {
    const today = dateString();
    const row = await get(
        'SELECT * FROM checkins WHERE chat_id = ? AND user_id = ?',
        [chatId, userId]
    );

    if (row && row.last_checkin === today) {
        return { alreadyChecked: true, ...row };
    }

    let streak = 1;
    if (row && isYesterday(row.last_checkin, today)) {
        streak = (row.streak || 0) + 1;
    }

    const longestStreak = Math.max(streak, row?.longest_streak || 0);
    const totalPoints = (row?.total_points || 0) + points;
    const totalCheckins = (row?.total_checkins || 0) + 1;

    await run(
        `INSERT INTO checkins (chat_id, user_id, username, last_checkin, streak, longest_streak, total_points, total_checkins)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(chat_id, user_id) DO UPDATE SET
            username = excluded.username,
            last_checkin = excluded.last_checkin,
            streak = excluded.streak,
            longest_streak = CASE WHEN checkins.longest_streak > excluded.longest_streak
                THEN checkins.longest_streak ELSE excluded.longest_streak END,
            total_points = excluded.total_points,
            total_checkins = excluded.total_checkins`,
        [chatId, userId, username || '', today, streak, longestStreak, totalPoints, totalCheckins]
    );

    return {
        alreadyChecked: false,
        streak,
        longest_streak: longestStreak,
        total_points: totalPoints,
        total_checkins: totalCheckins,
        username
    };
}

async function getLeaderboard(chatId, limit = 10) {
    return all(
        `SELECT user_id, username, total_points, total_checkins, streak, longest_streak
         FROM checkins
         WHERE chat_id = ?
         ORDER BY total_points DESC, total_checkins DESC
         LIMIT ?`,
        [chatId, limit]
    );
}

async function createPriceAlert({ chatId, userId, symbol, baselinePrice, targetPercent, direction }) {
    const now = Date.now();
    const result = await run(
        `INSERT INTO price_alerts (chat_id, user_id, symbol, baseline_price, target_percent, direction, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [chatId, userId, symbol, baselinePrice, targetPercent, direction || 'both', now]
    );
    return result.lastID;
}

async function listPriceAlerts() {
    return all('SELECT * FROM price_alerts', []);
}

async function deletePriceAlert(id) {
    await run('DELETE FROM price_alerts WHERE id = ?', [id]);
}

async function saveTokenInfo(token) {
    const now = Date.now();
    await run(
        `INSERT INTO token_registry (symbol, name, contract_address, network, decimals, dex_url, website, twitter, telegram, description, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(symbol) DO UPDATE SET
            name = excluded.name,
            contract_address = excluded.contract_address,
            network = excluded.network,
            decimals = excluded.decimals,
            dex_url = excluded.dex_url,
            website = excluded.website,
            twitter = excluded.twitter,
            telegram = excluded.telegram,
            description = excluded.description,
            updated_at = excluded.updated_at`,
        [
            token.symbol,
            token.name || token.symbol,
            token.contract_address || '',
            token.network || 'Xlayer',
            token.decimals || 18,
            token.dex_url || '',
            token.website || '',
            token.twitter || '',
            token.telegram || '',
            token.description || '',
            now
        ]
    );
}

async function getTokenInfo(symbol) {
    if (!symbol) {
        return null;
    }
    const row = await get('SELECT * FROM token_registry WHERE symbol = ?', [symbol.toUpperCase()]);
    return row || null;
}

async function listTokens() {
    return all('SELECT * FROM token_registry ORDER BY symbol ASC', []);
}

async function saveWhaleWatch(chatId, symbol, threshold) {
    const now = Date.now();
    await run(
        `INSERT INTO group_settings (chat_id, whale_symbol, whale_threshold, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET
            whale_symbol = excluded.whale_symbol,
            whale_threshold = excluded.whale_threshold,
            updated_at = excluded.updated_at`,
        [chatId, symbol, threshold, now]
    );
}

async function updateWhaleLastTrade(chatId, tradeId) {
    await run(
        `UPDATE group_settings SET last_trade_id = ? WHERE chat_id = ?`,
        [tradeId, chatId]
    );
}

async function listWhaleWatchers() {
    return all(
        `SELECT chat_id, whale_symbol, whale_threshold, last_trade_id
         FROM group_settings
         WHERE whale_symbol IS NOT NULL AND whale_threshold IS NOT NULL`,
        []
    );
}

async function getActivePrediction(chatId) {
    return get(
        `SELECT * FROM prediction_games
         WHERE chat_id = ? AND resolved = 0
         ORDER BY expires_at DESC
         LIMIT 1`,
        [chatId]
    );
}

async function createPredictionGame(chatId, symbol, expiresAt) {
    const now = Date.now();
    const result = await run(
        `INSERT INTO prediction_games (chat_id, symbol, expires_at, created_at)
         VALUES (?, ?, ?, ?)`,
        [chatId, symbol, expiresAt, now]
    );
    return result.lastID;
}

async function addPredictionEntry(gameId, userId, username, prediction) {
    const now = Date.now();
    await run(
        `INSERT INTO prediction_entries (game_id, user_id, username, prediction, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(game_id, user_id) DO UPDATE SET
            username = excluded.username,
            prediction = excluded.prediction,
            created_at = excluded.created_at`,
        [gameId, userId, username || '', prediction, now]
    );
}

async function listPredictionsToSettle(now = Date.now()) {
    return all(
        `SELECT * FROM prediction_games
         WHERE resolved = 0 AND expires_at <= ?`,
        [now]
    );
}

async function listPredictionEntries(gameId) {
    return all(
        `SELECT * FROM prediction_entries WHERE game_id = ?`,
        [gameId]
    );
}

async function resolvePredictionGame(gameId, resultPrice) {
    await run(
        `UPDATE prediction_games SET resolved = 1, result_price = ? WHERE id = ?`,
        [resultPrice, gameId]
    );
}

async function addMeme(chatId, fileId, addedBy, caption = '') {
    const now = Date.now();
    const result = await run(
        `INSERT INTO memes (chat_id, file_id, added_by, caption, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [chatId, fileId, addedBy || '', caption, now]
    );
    return result.lastID;
}

async function approveMeme(memeId) {
    await run('UPDATE memes SET approved = 1 WHERE id = ?', [memeId]);
}

async function getRandomMeme() {
    return get('SELECT * FROM memes WHERE approved = 1 ORDER BY RANDOM() LIMIT 1', []);
}

async function listPendingMemes() {
    return all('SELECT * FROM memes WHERE approved = 0 ORDER BY created_at ASC', []);
}

async function getActiveMembers(chatId, sinceTimestamp, limit = 10) {
    return all(
        `SELECT user_id, username, messages
         FROM message_activity
         WHERE chat_id = ? AND last_message_at >= ?
         ORDER BY messages DESC
         LIMIT ?`,
        [chatId, sinceTimestamp, limit]
    );
}

module.exports = {
    init,
    getGroupSettings,
    saveGroupSettings,
    recordMessage,
    getSentimentStats,
    recordCheckin,
    getLeaderboard,
    createPriceAlert,
    listPriceAlerts,
    deletePriceAlert,
    saveTokenInfo,
    getTokenInfo,
    listTokens,
    saveWhaleWatch,
    updateWhaleLastTrade,
    listWhaleWatchers,
    getActivePrediction,
    createPredictionGame,
    addPredictionEntry,
    listPredictionsToSettle,
    listPredictionEntries,
    resolvePredictionGame,
    addMeme,
    approveMeme,
    getRandomMeme,
    listPendingMemes,
    getActiveMembers
};
