// Đảm bảo dotenv được gọi ĐẦU TIÊN
require('dotenv').config(); 

// --- Import các thư viện ---
const ethers = require('ethers');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const crypto = require('crypto');
const { t_, normalizeLanguageCode } = require('./i18n.js');
const db = require('./database.js');
const { SCIENCE_TEMPLATES, SCIENCE_ENTRIES } = require('./scienceQuestions.js');

// --- CẤU HÌNH ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const BOT_USERNAME = (process.env.BOT_USERNAME || '').replace(/^@+/, '') || null;
const API_PORT = 3000;
const defaultLang = 'en';
const OKX_BASE_URL = process.env.OKX_BASE_URL || 'https://web3.okx.com';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const OKX_CHAIN_SHORT_NAME = process.env.OKX_CHAIN_SHORT_NAME || 'xlayer';
const OKX_BANMAO_TOKEN_ADDRESS =
    normalizeOkxConfigAddress(process.env.OKX_BANMAO_TOKEN_ADDRESS) ||
    '0x16d91d1615FC55B76d5f92365Bd60C069B46ef78';
const OKX_QUOTE_TOKEN_ADDRESS =
    normalizeOkxConfigAddress(process.env.OKX_QUOTE_TOKEN_ADDRESS) ||
    '0x779Ded0c9e1022225f8E0630b35a9b54bE713736';
const BANMAO_ADDRESS_LOWER = OKX_BANMAO_TOKEN_ADDRESS ? OKX_BANMAO_TOKEN_ADDRESS.toLowerCase() : null;
const OKX_QUOTE_ADDRESS_LOWER = OKX_QUOTE_TOKEN_ADDRESS ? OKX_QUOTE_TOKEN_ADDRESS.toLowerCase() : null;
const OKX_MARKET_INSTRUMENT = process.env.OKX_MARKET_INSTRUMENT || 'BANMAO-USDT';
const OKX_FETCH_TIMEOUT = Number(process.env.OKX_FETCH_TIMEOUT || 10000);
const OKX_API_KEY = process.env.OKX_API_KEY || null;
const OKX_SECRET_KEY = process.env.OKX_SECRET_KEY || null;
const OKX_API_PASSPHRASE = process.env.OKX_API_PASSPHRASE || null;
const OKX_API_PROJECT = process.env.OKX_API_PROJECT || null;
const OKX_API_SIMULATED = String(process.env.OKX_API_SIMULATED || '').toLowerCase() === 'true';
const XLAYER_RPC_URL = process.env.XLAYER_RPC_URL || 'https://rpc.xlayer.tech';
const XLAYER_WS_URLS = (process.env.XLAYER_WS_URLS || 'wss://xlayerws.okx.com|wss://ws.xlayer.tech')
    .split(/[|,\s]+/)
    .map((url) => url.trim())
    .filter(Boolean);
const TOKEN_PRICE_CACHE_TTL = Number(process.env.TOKEN_PRICE_CACHE_TTL || 60 * 1000);
const DEFAULT_COMMUNITY_WALLET = '0x92809f2837f708163d375960063c8a3156fceacb';
const COMMUNITY_WALLET_ADDRESS = normalizeAddress(process.env.COMMUNITY_WALLET_ADDRESS) || DEFAULT_COMMUNITY_WALLET;
const DEFAULT_DEAD_WALLET_ADDRESS = '0x000000000000000000000000000000000000dEaD';
const DEAD_WALLET_ADDRESS = normalizeAddress(process.env.DEAD_WALLET_ADDRESS) || DEFAULT_DEAD_WALLET_ADDRESS;
const OKX_OKB_TOKEN_ADDRESSES = (() => {
    const raw = process.env.OKX_OKB_TOKEN_ADDRESSES
        || '0xe538905cf8410324e03a5a23c1c177a474d59b2b';

    const seen = new Set();
    const result = [];

    for (const value of raw.split(/[|,\s]+/)) {
        if (!value) {
            continue;
        }

        const normalized = normalizeOkxConfigAddress(value);
        if (!normalized) {
            continue;
        }

        const lowered = normalized.toLowerCase();
        if (seen.has(lowered)) {
            continue;
        }

        seen.add(lowered);
        result.push(lowered);
    }

    return result;
})();
const OKX_OKB_SYMBOL_KEYS = ['okb', 'wokb'];
const OKX_CHAIN_INDEX = (() => {
    const value = process.env.OKX_CHAIN_INDEX;
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
})();
const OKX_CHAIN_CONTEXT_TTL = Number(process.env.OKX_CHAIN_CONTEXT_TTL || 10 * 60 * 1000);
const OKX_CHAIN_INDEX_FALLBACK = Number.isFinite(Number(process.env.OKX_CHAIN_INDEX_FALLBACK))
    ? Number(process.env.OKX_CHAIN_INDEX_FALLBACK)
    : 196;
const OKX_TOKEN_DIRECTORY_TTL = Number(process.env.OKX_TOKEN_DIRECTORY_TTL || 10 * 60 * 1000);
const OKX_WALLET_DIRECTORY_SCAN_LIMIT = Number(process.env.OKX_WALLET_DIRECTORY_SCAN_LIMIT || 200);
const OKX_WALLET_LOG_LOOKBACK_BLOCKS = Number(process.env.OKX_WALLET_LOG_LOOKBACK_BLOCKS || 50000);
const WALLET_BALANCE_CONCURRENCY = Number(process.env.WALLET_BALANCE_CONCURRENCY || 8);
const WALLET_BALANCE_TIMEOUT = Number(process.env.WALLET_BALANCE_TIMEOUT || 8000);
const WALLET_RPC_HEALTH_TIMEOUT = Number(process.env.WALLET_RPC_HEALTH_TIMEOUT || 4000);
const WALLET_CHAIN_CALLBACK_TTL = Number(process.env.WALLET_CHAIN_CALLBACK_TTL || 10 * 60 * 1000);
const WALLET_TOKEN_CALLBACK_TTL = Number(process.env.WALLET_TOKEN_CALLBACK_TTL || 5 * 60 * 1000);
const WALLET_TOKEN_BUTTON_LIMIT = Number(process.env.WALLET_TOKEN_BUTTON_LIMIT || 6);
const COPY_BUTTON_LIMIT = Number(process.env.COPY_BUTTON_LIMIT || 24);
const COPY_PAYLOAD_TTL = Number(process.env.COPY_PAYLOAD_TTL || 10 * 60 * 1000);
const COPY_PAYLOAD_MAX_LENGTH = Number(process.env.COPY_PAYLOAD_MAX_LENGTH || 512);
const hasOkxCredentials = Boolean(OKX_API_KEY && OKX_SECRET_KEY && OKX_API_PASSPHRASE);
const OKX_BANMAO_TOKEN_URL =
    process.env.OKX_BANMAO_TOKEN_URL ||
    'https://web3.okx.com/token/x-layer/0x16d91d1615fc55b76d5f92365bd60c069b46ef78';

let okxChainDirectoryCache = null;
let okxChainDirectoryExpiresAt = 0;
let okxChainDirectoryPromise = null;
const okxResolvedChainCache = new Map();
const BANMAO_DECIMALS_DEFAULT = 18;
const BANMAO_DECIMALS_CACHE_TTL = 30 * 60 * 1000;
let banmaoDecimalsCache = null;
let banmaoDecimalsFetchedAt = 0;
const tokenDecimalsCache = new Map();
const okxTokenDirectoryCache = new Map();
const tokenPriceCache = new Map();
const walletChainCallbackStore = new Map();
const walletTokenCallbackStore = new Map();
const WALLET_TOKEN_ACTION_DEFAULT_CACHE_TTL_MS = (() => {
    const value = Number(process.env.WALLET_TOKEN_ACTION_DEFAULT_CACHE_TTL_MS || 15000);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 15000;
})();
const WALLET_TOKEN_ACTION_HISTORY_CACHE_TTL_MS = (() => {
    const value = Number(process.env.WALLET_TOKEN_ACTION_HISTORY_CACHE_TTL_MS || 120000);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 120000;
})();
const WALLET_TOKEN_ACTION_CACHE_STALE_GRACE_MS = (() => {
    const value = Number(process.env.WALLET_TOKEN_ACTION_CACHE_STALE_GRACE_MS || 60000);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 60000;
})();
const WALLET_TOKEN_ACTION_CACHE_MAX_ENTRIES = (() => {
    const value = Number(process.env.WALLET_TOKEN_ACTION_CACHE_MAX_ENTRIES || 256);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 256;
})();
const OKX_DEX_DEFAULT_MAX_RETRIES = (() => {
    const value = Number(process.env.OKX_DEX_DEFAULT_MAX_RETRIES || 2);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 2;
})();
const OKX_DEX_DEFAULT_RETRY_DELAY_MS = (() => {
    const value = Number(process.env.OKX_DEX_DEFAULT_RETRY_DELAY_MS || 400);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 400;
})();
const walletTokenActionCache = new Map();
const copyPayloadStore = new Map();
const WALLET_TOKEN_HISTORY_MAX_PAGES = (() => {
    const value = Number(process.env.WALLET_TOKEN_HISTORY_MAX_PAGES || 4);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 4;
})();
const WALLET_TOKEN_HISTORY_MIN_UNIQUE_PRICES = (() => {
    const value = Number(process.env.WALLET_TOKEN_HISTORY_MIN_UNIQUE_PRICES || 2);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 2;
})();
const WALLET_TOKEN_HISTORY_FALLBACK_BAR = process.env.WALLET_TOKEN_HISTORY_FALLBACK_BAR || '1d';
const WALLET_TOKEN_HISTORY_FALLBACK_LIMIT = (() => {
    const value = Number(process.env.WALLET_TOKEN_HISTORY_FALLBACK_LIMIT || 10);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
})();
const WALLET_TOKEN_HISTORY_DEFAULT_LIMIT = (() => {
    const value = Number(process.env.WALLET_TOKEN_HISTORY_DEFAULT_LIMIT || 30);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 30;
})();
const WALLET_TOKEN_HISTORY_DEFAULT_PERIOD = process.env.WALLET_TOKEN_HISTORY_DEFAULT_PERIOD || '1d';
const WALLET_TOKEN_HISTORY_MAX_LIMIT = (() => {
    const value = Number(process.env.WALLET_TOKEN_HISTORY_MAX_LIMIT || 200);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 200;
})();
const WALLET_TOKEN_HISTORY_PERIOD_MS = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '60d': 60 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000
};
const WALLET_TOKEN_HISTORY_PERIOD_REQUEST_MAP = {
    '30m': '30m',
    '1h': '1h',
    '12h': '1h',
    '1d': '1d',
    '7d': '1d',
    '30d': '1d',
    '60d': '1d',
    '90d': '1d'
};
const WALLET_TOKEN_HISTORY_REQUEST_PERIOD_MS = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000
};
const OKX_CANDLE_BAR_MAP = {
    '1m': '1m',
    '3m': '3m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1H',
    '1hour': '1H',
    '2h': '2H',
    '4h': '4H',
    '6h': '6H',
    '12h': '12H',
    '1d': '1D',
    '1day': '1D',
    '24h': '1D',
    '2d': '2D',
    '2day': '2D',
    '3d': '3D',
    '7d': '7D',
    '14d': '14D',
    '30d': '30D',
    '30day': '30D',
    '60d': '60D',
    '60day': '60D',
    '90d': '90D',
    '90day': '90D',
    '1w': '1W',
    '1mo': '1M',
    '1mth': '1M',
    '1month': '1M',
    '1mutc': '1Mutc',
    '3mutc': '3Mutc',
    '6hutc': '6Hutc',
    '12hutc': '12Hutc',
    '1dutc': '1Dutc',
    '1wutc': '1Wutc'
};
const TELEGRAM_MESSAGE_SAFE_LENGTH = (() => {
    const value = Number(process.env.TELEGRAM_MESSAGE_SAFE_LENGTH || 3900);
    return Number.isFinite(value) && value > 100 ? Math.min(Math.floor(value), 4050) : 3900;
})();
const WALLET_TOKEN_HOLDER_LIMIT = 20;
const WALLET_TOKEN_TRADE_LIMIT = 100;
const WALLET_TOKEN_CANDLE_DAY_SPAN = 7;
const WALLET_TOKEN_CANDLE_RECENT_LIMIT = 24;
const WALLET_TOKEN_CANDLE_RECENT_BAR = '1H';
const WALLET_TOKEN_PRICE_INFO_HISTORY_DAYS = 7;
const WALLET_TOKEN_ACTIONS = [
    {
        key: 'current_price',
        labelKey: 'wallet_token_action_current_price',
        path: '/api/v6/dex/index/current-price',
        method: 'POST',
        bodyType: 'array'
    },
    {
        key: 'historical_price',
        labelKey: 'wallet_token_action_historical_price',
        path: '/api/v6/dex/index/historical-price',
        method: 'GET'
    },
    { key: 'candles', labelKey: 'wallet_token_action_candles', path: '/api/v6/dex/market/candles', method: 'GET' },
    {
        key: 'historical_candles',
        labelKey: 'wallet_token_action_historical_candles',
        path: '/api/v6/dex/market/historical-candles',
        method: 'GET'
    },
    { key: 'latest_price', labelKey: 'wallet_token_action_latest_price', path: '/api/v6/dex/market/trades', method: 'GET' },
    {
        key: 'price_info',
        labelKey: 'wallet_token_action_price_info',
        path: '/api/v6/dex/market/price-info',
        method: 'POST',
        bodyType: 'array'
    },
    { key: 'token_info', labelKey: 'wallet_token_action_token_info', path: '/api/v6/dex/market/token/basic-info', method: 'POST', bodyType: 'array' },
    { key: 'holder', labelKey: 'wallet_token_action_holder', path: '/api/v6/dex/market/token/holder', method: 'GET' }
];
const WALLET_TOKEN_ACTION_LOOKUP = WALLET_TOKEN_ACTIONS.reduce((map, action) => {
    map[action.key] = action;
    return map;
}, {});
const ERC20_MIN_ABI = [
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)'
];
const ERC20_TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
let xlayerProvider = null;
let xlayerWebsocketProvider = null;
try {
    if (XLAYER_RPC_URL) {
        xlayerProvider = new ethers.JsonRpcProvider(XLAYER_RPC_URL);
    }
} catch (error) {
    console.error(`[RPC] Không thể khởi tạo RPC Xlayer: ${error.message}`);
    xlayerProvider = null;
}
const walletWatchers = new Map();

function mapWithConcurrency(items, limit, mapper) {
    const tasks = Math.max(1, Math.min(limit || 1, items.length || 0));
    const results = new Array(items.length);
    let cursor = 0;

    const runWorker = async () => {
        while (true) {
            const index = cursor;
            cursor += 1;
            if (index >= items.length) {
                return;
            }

            try {
                results[index] = await mapper(items[index], index);
            } catch (error) {
                results[index] = undefined;
            }
        }
    };

    const pool = [];
    for (let i = 0; i < tasks; i += 1) {
        pool.push(runWorker());
    }

    return Promise.all(pool).then(() => results);
}

async function isProviderHealthy(provider, timeoutMs = WALLET_RPC_HEALTH_TIMEOUT) {
    if (!provider || typeof provider.getBlockNumber !== 'function') {
        return false;
    }

    try {
        await Promise.race([
            provider.getBlockNumber(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('rpc_health_timeout')), timeoutMs))
        ]);
        return true;
    } catch (error) {
        console.warn(`[RPC] Provider health check failed: ${error.message}`);
        return false;
    }
}

const CHECKIN_MAX_ATTEMPTS = 3;
const CHECKIN_SCIENCE_PROBABILITY = Math.min(
    Math.max(Number(process.env.CHECKIN_SCIENCE_PROBABILITY ?? 0.5), 0),
    1
);
const CHECKIN_SCHEDULER_INTERVAL = 45 * 1000;
const CHECKIN_DEFAULT_TIME = '08:00';
const CHECKIN_DEFAULT_TIMEZONE = 'UTC';
const CHECKIN_EMOTIONS = ['🤩', '👍', '💪', '😴', '😊', '🔥'];
const ADMIN_DETAIL_BULLET = '• ';
const CHECKIN_GOAL_PRESETS = [
    'checkin_goal_preset_learn',
    'checkin_goal_preset_task',
    'checkin_goal_preset_workout',
    'checkin_goal_preset_rest',
    'checkin_goal_preset_help'
];

const QUESTION_TYPE_KEYS = ['math', 'physics', 'chemistry'];

const DEFAULT_QUESTION_WEIGHTS = (() => {
    if (Object.prototype.hasOwnProperty.call(process.env, 'CHECKIN_SCIENCE_PROBABILITY')) {
        const mathShare = Math.max(1 - CHECKIN_SCIENCE_PROBABILITY, 0);
        const scienceShare = Math.max(CHECKIN_SCIENCE_PROBABILITY, 0);
        if (mathShare + scienceShare > 0) {
            const halfScience = scienceShare / 2;
            return { math: mathShare, physics: halfScience, chemistry: halfScience };
        }
    }
    return { math: 2, physics: 1, chemistry: 1 };
})();

const QUESTION_WEIGHT_PRESETS = [
    { math: 40, physics: 30, chemistry: 30 },
    { math: 34, physics: 33, chemistry: 33 },
    { math: 25, physics: 50, chemistry: 25 },
    { math: 25, physics: 25, chemistry: 50 },
    { math: 50, physics: 25, chemistry: 25 }
];

const CHECKIN_SCHEDULE_MAX_SLOTS = 6;
const CHECKIN_ADMIN_SUMMARY_MAX_ROWS = 30;
const CHECKIN_SCHEDULE_PRESETS = [
    { labelKey: 'checkin_admin_button_schedule_once', slots: ['08:00'] },
    { labelKey: 'checkin_admin_button_schedule_twice', slots: ['08:00', '20:00'] },
    { labelKey: 'checkin_admin_button_schedule_thrice', slots: ['07:00', '12:00', '21:00'] }
];
const CHECKIN_ADMIN_LEADERBOARD_HISTORY_LIMIT = 15;
const LEADERBOARD_MODE_CONFIG = [
    { key: 'streak', labelKey: 'checkin_admin_leaderboard_mode_streak' },
    { key: 'points', labelKey: 'checkin_admin_leaderboard_mode_points' },
    { key: 'total', labelKey: 'checkin_admin_leaderboard_mode_total' },
    { key: 'longest', labelKey: 'checkin_admin_leaderboard_mode_longest' }
];
const SUMMARY_DEFAULT_TIME = '21:00';
const SUMMARY_SCHEDULE_PRESETS = [
    { labelKey: 'checkin_admin_button_summary_schedule_once', slots: ['21:00'] },
    { labelKey: 'checkin_admin_button_summary_schedule_twice', slots: ['12:00', '21:00'] },
    { labelKey: 'checkin_admin_button_summary_schedule_thrice', slots: ['09:00', '15:00', '21:30'] }
];
const SUMMARY_BROADCAST_MAX_ROWS = 5;
const CHECKIN_ADMIN_DM_MAX_RECIPIENTS = 50;

function sanitizeWeightValue(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
        return Math.max(fallback, 0);
    }
    return numeric;
}

function getQuestionWeights(settings = null) {
    const fallback = DEFAULT_QUESTION_WEIGHTS;
    const weights = {
        math: sanitizeWeightValue(settings?.mathWeight, fallback.math),
        physics: sanitizeWeightValue(settings?.physicsWeight, fallback.physics),
        chemistry: sanitizeWeightValue(settings?.chemistryWeight, fallback.chemistry)
    };
    if (weights.math + weights.physics + weights.chemistry <= 0) {
        return { ...DEFAULT_QUESTION_WEIGHTS };
    }
    return weights;
}

function pickQuestionType(settings = null) {
    const weights = getQuestionWeights(settings);
    const total = weights.math + weights.physics + weights.chemistry;
    if (total <= 0) {
        return 'math';
    }
    const roll = Math.random() * total;
    if (roll < weights.math) {
        return 'math';
    }
    if (roll < weights.math + weights.physics) {
        return 'physics';
    }
    return 'chemistry';
}

function formatQuestionWeightPercentages(weights) {
    const total = weights.math + weights.physics + weights.chemistry;
    if (total <= 0) {
        return { math: '0%', physics: '0%', chemistry: '0%' };
    }
    const toPercent = (value) => `${Math.round((value / total) * 1000) / 10}%`;
    return {
        math: toPercent(weights.math),
        physics: toPercent(weights.physics),
        chemistry: toPercent(weights.chemistry)
    };
}

function normalizeTimeSlot(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
        return null;
    }

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
        return null;
    }

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return null;
    }

    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function sanitizeScheduleSlots(values = []) {
    const seen = new Set();
    const sanitized = [];
    for (const value of values) {
        const slot = normalizeTimeSlot(value);
        if (!slot || seen.has(slot)) {
            continue;
        }
        seen.add(slot);
        sanitized.push(slot);
        if (sanitized.length >= CHECKIN_SCHEDULE_MAX_SLOTS) {
            break;
        }
    }
    return sanitized.sort();
}

function parseScheduleTextInput(text) {
    if (typeof text !== 'string') {
        return null;
    }

    const tokens = text.split(/[,;\s]+/).map((token) => token.trim()).filter(Boolean);
    if (tokens.length === 0) {
        return null;
    }

    const sanitized = sanitizeScheduleSlots(tokens);
    return sanitized.length > 0 ? sanitized : null;
}

function getScheduleSlots(settings = null) {
    const raw = Array.isArray(settings?.autoMessageTimes) ? settings.autoMessageTimes : [];
    const fallback = settings?.checkinTime || CHECKIN_DEFAULT_TIME;
    const base = raw.length > 0 ? raw : [fallback];
    const sanitized = sanitizeScheduleSlots(base);
    return sanitized.length > 0 ? sanitized : [CHECKIN_DEFAULT_TIME];
}

function getSummaryScheduleSlots(settings = null) {
    const raw = Array.isArray(settings?.summaryMessageTimes) ? settings.summaryMessageTimes : [];
    const sanitized = sanitizeScheduleSlots(raw);
    if (sanitized.length > 0) {
        return sanitized;
    }
    if (Number(settings?.summaryMessageEnabled) === 1) {
        return getScheduleSlots(settings);
    }
    return [];
}

const pendingCheckinChallenges = new Map();
const pendingEmotionPrompts = new Map();
const pendingGoalInputs = new Map();
const pendingSecretMessages = new Map();
const checkinAdminStates = new Map();
const checkinAdminMenus = new Map();
const helpMenuStates = new Map();
const adminHubSessions = new Map();
const registerWizardStates = new Map();
let checkinSchedulerTimer = null;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildBotStartLink(payload = '') {
    if (!BOT_USERNAME) {
        return null;
    }

    const trimmedPayload = typeof payload === 'string' && payload.trim() ? payload.trim() : '';
    const suffix = trimmedPayload ? `?start=${encodeURIComponent(trimmedPayload)}` : '';
    return `https://t.me/${BOT_USERNAME}${suffix}`;
}

function scheduleMessageDeletion(chatId, messageId, delayMs = 15000) {
    if (!chatId || !messageId) {
        return;
    }

    const timer = setTimeout(() => {
        bot.deleteMessage(chatId, messageId).catch(() => { /* ignore */ });
    }, Math.max(delayMs, 1000));

    if (typeof timer.unref === 'function') {
        timer.unref();
    }
}

async function sendEphemeralMessage(chatId, text, options = {}, delayMs = 15000) {
    const message = await bot.sendMessage(chatId, text, options);
    scheduleMessageDeletion(chatId, message.message_id, delayMs);
    return message;
}

function normalizeAddress(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    try {
        return ethers.getAddress(trimmed);
    } catch (error) {
        const basicHexPattern = /^0x[0-9a-fA-F]{40}$/;
        if (basicHexPattern.test(trimmed)) {
            return trimmed;
        }
    }

    return null;
}

function normalizeOkxConfigAddress(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    try {
        return ethers.getAddress(trimmed);
    } catch (error) {
        const basicHexPattern = /^0x[0-9a-fA-F]{40}$/;
        if (basicHexPattern.test(trimmed)) {
            return trimmed;
        }
    }

    return null;
}

// --- Kiểm tra Cấu hình ---
if (!TELEGRAM_TOKEN) {
    console.error("LỖI NGHIÊM TRỌNG: Thiếu TELEGRAM_TOKEN trong file .env!");
    process.exit(1);
}

// --- KHỞI TẠO CÁC DỊCH VỤ ---
// db.init() sẽ được gọi trong hàm main()
const app = express();
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Hàm 't' (translate) nội bộ
function t(lang_code, key, variables = {}) {
    return t_(lang_code, key, variables);
}

function resolveLangCode(lang_code) {
    return normalizeLanguageCode(lang_code || defaultLang);
}

function escapeHtml(text) {
    if (typeof text !== 'string') {
        return '';
    }
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeAddressSafe(address) {
    if (!address) {
        return null;
    }
    try {
        return ethers.getAddress(address);
    } catch (error) {
        return null;
    }
}

function shortenAddress(address) {
    if (!address || address.length < 10) {
        return address || '';
    }
    const normalized = normalizeAddressSafe(address) || address;
    return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function formatCopyableValueHtml(value) {
    if (value === undefined || value === null) {
        return null;
    }
    const text = String(value).trim();
    if (!text) {
        return null;
    }
    const encoded = encodeURIComponent(text);
    const code = `<code>${escapeHtml(text)}</code>`;
    return `<a href="https://t.me/share/url?url=${encoded}&text=${encoded}">${code}</a>`;
}

function getXlayerProvider() {
    return xlayerProvider;
}

function createXlayerWebsocketProvider() {
    if (!XLAYER_WS_URLS.length) {
        return null;
    }

    for (const url of XLAYER_WS_URLS) {
        try {
            const provider = new ethers.WebSocketProvider(url);
            provider.on('error', (error) => {
                console.warn(`[WSS] Lỗi kết nối WebSocket ${url}: ${error.message}`);
            });
            console.log(`[WSS] Đã kết nối tới ${url}`);
            return provider;
        } catch (error) {
            console.warn(`[WSS] Không thể kết nối ${url}: ${error.message}`);
        }
    }

    return null;
}

function getXlayerWebsocketProvider() {
    if (xlayerWebsocketProvider) {
        return xlayerWebsocketProvider;
    }

    xlayerWebsocketProvider = createXlayerWebsocketProvider();
    return xlayerWebsocketProvider;
}

function teardownWalletWatcher(walletAddress) {
    const normalized = normalizeAddressSafe(walletAddress);
    const watcher = normalized ? walletWatchers.get(normalized) : null;
    if (!watcher) {
        return;
    }

    if (watcher.provider && watcher.subscriptions) {
        for (const { filter, handler } of watcher.subscriptions) {
            try {
                watcher.provider.off(filter, handler);
            } catch (error) {
                // ignore detach errors
            }
        }
    }

    walletWatchers.delete(normalized);
}

function seedWalletWatcher(walletAddress, tokenAddresses = []) {
    const normalizedWallet = normalizeAddressSafe(walletAddress);
    if (!normalizedWallet) {
        return null;
    }

    let watcher = walletWatchers.get(normalizedWallet);
    if (!watcher) {
        watcher = ensureWalletWatcher(normalizedWallet, tokenAddresses);
    } else {
        for (const tokenAddress of tokenAddresses) {
            const normalizedToken = normalizeAddressSafe(tokenAddress);
            if (normalizedToken) {
                watcher.tokens.add(normalizedToken.toLowerCase());
            }
        }
    }

    return watcher;
}

function ensureWalletWatcher(walletAddress, seedTokenAddresses = []) {
    const normalizedWallet = normalizeAddressSafe(walletAddress);
    if (!normalizedWallet) {
        return null;
    }

    let watcher = walletWatchers.get(normalizedWallet);
    if (watcher) {
        for (const token of seedTokenAddresses) {
            const normalized = normalizeAddressSafe(token);
            if (normalized) {
                watcher.tokens.add(normalized.toLowerCase());
            }
        }
        return watcher;
    }

    const provider = getXlayerWebsocketProvider() || getXlayerProvider();
    const tokens = new Set();
    for (const token of seedTokenAddresses) {
        const normalized = normalizeAddressSafe(token);
        if (normalized) {
            tokens.add(normalized.toLowerCase());
        }
    }

    const subscriptions = [];
    const topicWallet = (() => {
        try {
            return ethers.zeroPadValue(normalizedWallet, 32);
        } catch (error) {
            return null;
        }
    })();

    const handler = (log) => {
        if (!log || !log.address) {
            return;
        }
        tokens.add(log.address.toLowerCase());
    };

    if (provider && topicWallet) {
        const incomingFilter = { topics: [ERC20_TRANSFER_TOPIC, null, topicWallet] };
        const outgoingFilter = { topics: [ERC20_TRANSFER_TOPIC, topicWallet] };
        try {
            provider.on(incomingFilter, handler);
            subscriptions.push({ filter: incomingFilter, handler });
        } catch (error) {
            console.warn(`[WSS] Không thể đăng ký incoming logs cho ${normalizedWallet}: ${error.message}`);
        }
        try {
            provider.on(outgoingFilter, handler);
            subscriptions.push({ filter: outgoingFilter, handler });
        } catch (error) {
            console.warn(`[WSS] Không thể đăng ký outgoing logs cho ${normalizedWallet}: ${error.message}`);
        }
    }

    watcher = { wallet: normalizedWallet, tokens, provider, subscriptions };
    walletWatchers.set(normalizedWallet, watcher);
    return watcher;
}

function buildCloseKeyboard(lang, { backCallbackData = null, closeCallbackData = 'ui_close' } = {}) {
    const closeRow = [];
    if (backCallbackData) {
        closeRow.push({ text: t(lang, 'action_back'), callback_data: backCallbackData });
    }
    closeRow.push({ text: t(lang, 'action_close'), callback_data: closeCallbackData });

    return { inline_keyboard: [closeRow] };
}

function appendCloseButton(replyMarkup, lang, options = {}) {
    const keyboard = replyMarkup?.inline_keyboard ? replyMarkup.inline_keyboard.map((row) => [...row]) : [];
    const closeRow = [];
    if (options.backCallbackData) {
        closeRow.push({ text: t(lang, 'action_back'), callback_data: options.backCallbackData });
    }
    closeRow.push({ text: t(lang, 'action_close'), callback_data: options.closeCallbackData || 'ui_close' });

    keyboard.push(closeRow);
    return { inline_keyboard: keyboard };
}

function buildWalletActionKeyboard(lang, portfolioLinks = [], options = {}) {
    const extraRows = [];
    for (const link of portfolioLinks) {
        if (!link?.url || !link.address) {
            continue;
        }
        extraRows.push([
            {
                text: t(lang, 'wallet_action_portfolio', { wallet: shortenAddress(link.address) }),
                url: link.url
            }
        ]);
    }

    const inline_keyboard = [
        [{ text: t(lang, 'wallet_action_view'), callback_data: 'wallet_overview' }],
        [{ text: t(lang, 'wallet_action_manage'), callback_data: 'wallet_manage' }],
        ...extraRows
    ];

    if (options.includeClose !== false) {
        inline_keyboard.push([{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]);
    }

    return { inline_keyboard };
}

function sortChainsForMenu(chains) {
    if (!Array.isArray(chains)) {
        return [];
    }
    const isXlayer = (entry) => {
        if (!entry) return false;
        if (Number(entry.chainId) === 196 || Number(entry.chainIndex) === 196) {
            return true;
        }
        const aliases = entry.aliases || [];
        return aliases.some((alias) => typeof alias === 'string' && alias.toLowerCase().includes('xlayer'));
    };

    return [...chains].sort((a, b) => {
        const aX = isXlayer(a);
        const bX = isXlayer(b);
        if (aX !== bX) {
            return aX ? -1 : 1;
        }
        const aId = Number.isFinite(a?.chainId) ? a.chainId : Number.isFinite(a?.chainIndex) ? a.chainIndex : Infinity;
        const bId = Number.isFinite(b?.chainId) ? b.chainId : Number.isFinite(b?.chainIndex) ? b.chainIndex : Infinity;
        return aId - bId;
    });
}

function pruneWalletChainCallbacks() {
    const now = Date.now();
    for (const [key, value] of walletChainCallbackStore.entries()) {
        if (!value || !Number.isFinite(value.expiresAt) || value.expiresAt <= now) {
            walletChainCallbackStore.delete(key);
        }
    }
}

function createWalletChainCallback(entry, walletAddress) {
    pruneWalletChainCallbacks();
    const token = crypto.randomBytes(4).toString('hex');
    const normalizedWallet = normalizeAddressSafe(walletAddress) || walletAddress;

    const chainId = Number.isFinite(entry?.chainId)
        ? Number(entry.chainId)
        : Number.isFinite(entry?.chainIndex)
            ? Number(entry.chainIndex)
            : OKX_CHAIN_INDEX_FALLBACK;

    const chainContext = {
        chainId,
        chainIndex: Number.isFinite(entry?.chainIndex) ? Number(entry.chainIndex) : chainId,
        chainShortName: entry?.chainShortName || null,
        chainName: entry?.chainName || null,
        aliases: Array.isArray(entry?.aliases) ? entry.aliases : null
    };

    walletChainCallbackStore.set(token, {
        wallet: normalizedWallet,
        chainContext,
        expiresAt: Date.now() + WALLET_CHAIN_CALLBACK_TTL
    });

    return token;
}

function resolveWalletChainCallback(token) {
    pruneWalletChainCallbacks();
    const value = walletChainCallbackStore.get(token);
    if (!value) {
        return null;
    }
    if (!Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) {
        walletChainCallbackStore.delete(token);
        return null;
    }
    walletChainCallbackStore.delete(token);
    return value;
}

function pruneWalletTokenCallbacks() {
    const now = Date.now();
    for (const [key, entry] of walletTokenCallbackStore.entries()) {
        if (!entry || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now) {
            walletTokenCallbackStore.delete(key);
        }
    }
}

function registerWalletTokenContext(context) {
    if (!context) {
        return null;
    }

    pruneWalletTokenCallbacks();
    const token = crypto.randomBytes(4).toString('hex');
    const now = Date.now();
    const storedContext = {
        ...context,
        tokenCallbackId: token
    };
    walletTokenCallbackStore.set(token, {
        context: storedContext,
        expiresAt: now + WALLET_TOKEN_CALLBACK_TTL
    });
    return token;
}

function resolveWalletTokenContext(token, { extend = false } = {}) {
    if (!token) {
        return null;
    }

    pruneWalletTokenCallbacks();
    const entry = walletTokenCallbackStore.get(token);
    if (!entry) {
        return null;
    }

    if (!Number.isFinite(entry.expiresAt) || entry.expiresAt <= Date.now()) {
        walletTokenCallbackStore.delete(token);
        return null;
    }

    if (extend) {
        entry.expiresAt = Date.now() + WALLET_TOKEN_CALLBACK_TTL;
    }

    if (entry.context && !entry.context.tokenCallbackId) {
        entry.context.tokenCallbackId = token;
    }

    return entry.context;
}

function pruneCopyPayloads() {
    const now = Date.now();
    for (const [key, entry] of copyPayloadStore.entries()) {
        if (!entry || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now) {
            copyPayloadStore.delete(key);
        }
    }
}

function registerCopyPayload(value) {
    if (value === undefined || value === null) {
        return null;
    }

    const text = String(value).trim();
    if (!text) {
        return null;
    }
    const limited = text.slice(0, COPY_PAYLOAD_MAX_LENGTH);

    pruneCopyPayloads();
    const token = crypto.randomBytes(4).toString('hex');
    copyPayloadStore.set(token, {
        value: limited,
        expiresAt: Date.now() + COPY_PAYLOAD_TTL
    });
    return token;
}

function resolveCopyPayload(token) {
    pruneCopyPayloads();
    const entry = copyPayloadStore.get(token);
    if (!entry) {
        return null;
    }
    if (!Number.isFinite(entry.expiresAt) || entry.expiresAt <= Date.now()) {
        copyPayloadStore.delete(token);
        return null;
    }
    copyPayloadStore.delete(token);
    return entry.value;
}

async function buildWalletChainMenu(lang, walletAddress) {
    let chains = [];
    try {
        chains = await fetchOkxBalanceSupportedChains();
    } catch (error) {
        console.warn(`[WalletChains] Failed to load supported chains: ${error.message}`);
    }

    const xlayerEntry = { chainId: 196, chainIndex: 196, chainShortName: 'xlayer', chainName: 'X Layer', aliases: ['xlayer'] };
    const hasXlayer = Array.isArray(chains)
        && chains.some((entry) => {
            if (!entry) return false;
            if (Number(entry.chainId) === 196 || Number(entry.chainIndex) === 196) return true;
            const aliases = entry.aliases || [];
            return aliases.some((alias) => typeof alias === 'string' && alias.toLowerCase().includes('xlayer'));
        });

    if (!hasXlayer) {
        chains = Array.isArray(chains) && chains.length > 0 ? [xlayerEntry, ...chains] : [xlayerEntry];
    }

    if (!Array.isArray(chains) || chains.length === 0) {
        chains = [xlayerEntry];
    }

    const sorted = sortChainsForMenu(chains);
    const buttons = sorted.map((entry) => {
        const label = formatChainLabel(entry) || 'Chain';
        const callbackToken = createWalletChainCallback(entry, walletAddress);
        return { text: label, callback_data: `wallet_chain|${callbackToken}` };
    });

    const inline_keyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
        inline_keyboard.push(buttons.slice(i, i + 2));
    }
    inline_keyboard.push([{ text: t(lang, 'action_back'), callback_data: 'wallet_overview' }, { text: t(lang, 'action_close'), callback_data: 'ui_close' }]);

    const contextLine = walletAddress ? t(lang, 'wallet_balance_wallet', { index: '1', wallet: escapeHtml(shortenAddress(walletAddress)) }) : null;
    const lines = [t(lang, 'wallet_chain_prompt')];
    if (contextLine) {
        lines.push(contextLine);
    }

    return {
        text: lines.join('\n'),
        replyMarkup: { inline_keyboard },
        chains: sorted
    };
}

async function buildWalletSelectMenu(lang, chatId) {
    const wallets = await db.getWalletsForUser(chatId);
    if (!Array.isArray(wallets) || wallets.length === 0) {
        return {
            text: t(lang, 'mywallet_not_linked'),
            replyMarkup: appendCloseButton(null, lang)
        };
    }

    const lines = [
        t(lang, 'mywallet_list_header', { count: wallets.length.toString() }),
        t(lang, 'mywallet_list_footer')
    ];

    const inline_keyboard = [];
    for (const wallet of wallets) {
        const normalized = normalizeAddressSafe(wallet) || wallet;
        const shortAddr = shortenAddress(normalized);
        inline_keyboard.push([{ text: `💼 ${shortAddr}`, callback_data: `wallet_pick|${normalized}` }]);
    }
    inline_keyboard.push([{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]);

    return {
        text: lines.join('\n'),
        replyMarkup: { inline_keyboard }
    };
}

function buildPortfolioEmbedUrl(walletAddress) {
    const normalized = normalizeAddressSafe(walletAddress) || walletAddress;
    const base = PUBLIC_BASE_URL.replace(/\/$/, '');
    if (!base || base.includes('localhost') || base.startsWith('http://127.')) {
        return null;
    }
    if (!/^https?:\/\//i.test(base)) {
        return null;
    }
    return `${base}/webview/portfolio/${encodeURIComponent(normalized)}`;
}

function buildOkxPortfolioAnalysisUrl(walletAddress) {
    const normalized = normalizeAddressSafe(walletAddress);
    if (!normalized) {
        return null;
    }
    return `https://web3.okx.com/portfolio/${encodeURIComponent(normalized)}/analysis`;
}

function formatChainLabel(entry) {
    if (!entry) {
        return null;
    }
    const pieces = [];
    if (entry.chainName) {
        pieces.push(entry.chainName);
    }
    if (entry.chainShortName && entry.chainShortName !== entry.chainName) {
        pieces.push(entry.chainShortName);
    }
    const label = pieces.length > 0 ? pieces.join(' / ') : (entry.chainShortName || entry.chainName || null);
    const id = entry.chainId || entry.chainIndex;
    if (label && Number.isFinite(id)) {
        return `${label} (#${id})`;
    }
    return label || (Number.isFinite(id) ? `#${id}` : null);
}

async function loadWalletOverviewEntries(chatId, options = {}) {
    let wallets = await db.getWalletsForUser(chatId);
    if (options.targetWallet) {
        const target = normalizeAddressSafe(options.targetWallet) || options.targetWallet;
        wallets = wallets.filter((wallet) => (normalizeAddressSafe(wallet) || wallet).toLowerCase() === (target || '').toLowerCase());
        if (wallets.length === 0 && target) {
            wallets = [target];
        }
    }

    const results = [];
    for (const wallet of wallets) {
        const normalized = normalizeAddressSafe(wallet) || wallet;
        let tokens = [];
        let warning = null;
        let cached = false;
        let totalUsd = null;

        try {
            const live = await fetchLiveWalletTokens(normalized, {
                chatId,
                chainContext: options.chainContext,
                forceDex: true
            });
            tokens = live?.tokens || [];
            warning = live?.warning || null;
            totalUsd = Number.isFinite(live?.totalUsd) ? live.totalUsd : null;

            if (tokens.length > 0) {
                await db.saveWalletHoldingsCache(chatId, normalized, tokens);
            } else if (!options.forceLive) {
                const cachedSnapshot = await db.getWalletHoldingsCache(chatId, normalized);
                if (Array.isArray(cachedSnapshot.tokens) && cachedSnapshot.tokens.length > 0) {
                    tokens = cachedSnapshot.tokens;
                    cached = true;
                    warning = warning || 'wallet_cached';
                } else if (!warning) {
                    warning = 'wallet_overview_wallet_no_token';
                }
            }
        } catch (error) {
            warning = error?.code || 'wallet_error';
            console.warn(`[WalletOverview] Failed to load ${normalized}: ${error.message}`);
        }

        results.push({ address: normalized, tokens, warning, cached, totalUsd });
    }

    return results;
}

async function fetchLiveWalletTokens(walletAddress, options = {}) {
    const { chainContext = null } = options;
    const normalizedWallet = normalizeAddressSafe(walletAddress);
    if (!normalizedWallet) {
        return { tokens: [], warning: 'wallet_invalid' };
    }

    let dexSnapshot;
    try {
        dexSnapshot = await fetchOkxDexWalletHoldings(normalizedWallet, { chainContext });
    } catch (error) {
        console.warn(`[DexHoldings] Failed to load live balances for ${shortenAddress(normalizedWallet)}: ${error.message}`);
        return { tokens: [], warning: 'wallet_error' };
    }

    let mappedTokens = await mapWithConcurrency(dexSnapshot.tokens || [], WALLET_BALANCE_CONCURRENCY, async (holding) => {
        const decimals = Number.isFinite(holding.decimals) ? holding.decimals : 18;
        let amountText = null;
        let numericAmount = null;
        let amountExactText = null;

        const rawCandidate = holding.amountRaw ?? holding.rawBalance ?? null;
        if (rawCandidate !== null && rawCandidate !== undefined) {
            try {
                const bigIntValue = typeof rawCandidate === 'bigint' ? rawCandidate : BigInt(rawCandidate);
                amountText = formatBigIntValue(bigIntValue, decimals, {
                    maximumFractionDigits: Math.min(6, Math.max(2, decimals))
                });
                numericAmount = Number(ethers.formatUnits(bigIntValue, decimals));
                amountExactText = ethers.formatUnits(bigIntValue, decimals);
            } catch (error) {
                // ignore raw formatting errors
            }
        }

        if (!amountText && (holding.balance !== undefined || holding.coinAmount !== undefined || holding.amount !== undefined)) {
            const fallbackAmount = holding.balance ?? holding.coinAmount ?? holding.amount;
            if (fallbackAmount !== undefined && fallbackAmount !== null) {
                amountText = String(fallbackAmount);
            }
            const numericFallback = Number(fallbackAmount);
            if (!Number.isFinite(numericAmount) && Number.isFinite(numericFallback)) {
                numericAmount = numericFallback;
            }
            if (!numericAmount && Number.isFinite(decimals)) {
                const raw = decimalToRawBigInt(fallbackAmount, decimals);
                if (raw !== null) {
                    try {
                        numericAmount = Number(ethers.formatUnits(raw, decimals));
                    } catch (error) {
                        // ignore
                    }
                }
            }
        }

        if (!amountText) {
            amountText = String(rawCandidate ?? holding.balance ?? holding.coinAmount ?? '0');
        }

        if (!amountExactText && amountText) {
            amountExactText = String(rawCandidate ?? holding.balance ?? holding.coinAmount ?? amountText);
        }

        const unitPriceText = holding.tokenPrice !== undefined && holding.tokenPrice !== null
            ? String(holding.tokenPrice)
            : null;
        const unitPriceUsd = Number.isFinite(Number(unitPriceText)) ? Number(unitPriceText) : null;

        let totalValueUsd = Number.isFinite(Number(holding.currencyAmount)) ? Number(holding.currencyAmount) : null;
        if ((!Number.isFinite(totalValueUsd) || totalValueUsd === null) && Number.isFinite(numericAmount) && Number.isFinite(unitPriceUsd)) {
            totalValueUsd = numericAmount * unitPriceUsd;
        }

        const totalValueExactText = amountExactText && unitPriceText
            ? multiplyDecimalStrings(amountExactText, unitPriceText)
            : null;

        return {
            tokenAddress: holding.tokenAddress,
            tokenLabel: holding.symbol || holding.name || 'Token',
            symbol: holding.symbol || holding.tokenSymbol || holding.tokenLabel || holding.name || null,
            amountText,
            valueText: null,
            chainIndex: holding.chainIndex,
            walletAddress: holding.walletAddress || normalizedWallet,
            isRiskToken: holding.isRiskToken === true,
            unitPriceUsd: Number.isFinite(unitPriceUsd) ? unitPriceUsd : null,
            unitPriceText,
            totalValueUsd: Number.isFinite(totalValueUsd) ? totalValueUsd : null,
            currencyAmount: Number.isFinite(Number(holding.currencyAmount)) ? Number(holding.currencyAmount) : null,
            totalValueExactText: totalValueExactText || null
        };
    });

    const filtered = mappedTokens.filter(Boolean);

    const fallbackTokens = [];
    if (filtered.length === 0 && Array.isArray(dexSnapshot.tokens) && dexSnapshot.tokens.length > 0) {
        for (const raw of dexSnapshot.tokens) {
            if (!raw) continue;
            const amountText = raw.balance ?? raw.coinAmount ?? raw.amount ?? raw.rawBalance ?? '0';
            const amountExactText = raw.amountRaw !== undefined && raw.amountRaw !== null && Number.isFinite(raw.decimals)
                ? ethers.formatUnits(raw.amountRaw, raw.decimals)
                : String(amountText);
            const tokenLabel = raw.symbol || raw.tokenSymbol || raw.tokenName || raw.name || 'Token';
            const chainIndex = raw.chainIndex || raw.chainId || raw.chain || raw.chain_id;
            const walletAddr = raw.address || raw.walletAddress || normalizedWallet;
            const numericAmount = Number(raw.balance ?? raw.coinAmount ?? raw.amount ?? raw.rawBalance ?? raw.amountRaw ?? 0);
            const unitPriceText = raw.tokenPrice !== undefined && raw.tokenPrice !== null ? String(raw.tokenPrice) : null;
            const unitPriceUsd = Number.isFinite(Number(unitPriceText)) ? Number(unitPriceText) : null;
            const totalValueUsd = Number.isFinite(numericAmount) && Number.isFinite(unitPriceUsd)
                ? numericAmount * unitPriceUsd
                : null;
            const totalValueExactText = amountExactText && unitPriceText
                ? multiplyDecimalStrings(amountExactText, unitPriceText)
                : null;
            fallbackTokens.push({
                tokenAddress: raw.tokenAddress || raw.tokenContractAddress || null,
                tokenLabel,
                symbol: raw.symbol || raw.tokenSymbol || raw.tokenName || raw.name || null,
                amountText: String(amountText),
                valueText: null,
                chainIndex,
                walletAddress: walletAddr,
                isRiskToken: Boolean(raw.isRiskToken),
                unitPriceUsd: Number.isFinite(unitPriceUsd) ? unitPriceUsd : null,
                unitPriceText,
                totalValueUsd: Number.isFinite(totalValueUsd) ? totalValueUsd : null,
                currencyAmount: Number.isFinite(Number(raw.currencyAmount)) ? Number(raw.currencyAmount) : null,
                totalValueExactText: totalValueExactText || null
            });
        }
    }

    const tokens = filtered.length > 0 ? filtered : fallbackTokens;

    return {
        tokens,
        warning: tokens.length === 0 ? 'wallet_overview_wallet_no_token' : null,
        totalUsd: Number.isFinite(dexSnapshot.totalUsd) ? dexSnapshot.totalUsd : null
    };
}

async function discoverWalletTokenContracts(walletAddress, options = {}) {
    const provider = options.provider || getXlayerProvider() || getXlayerWebsocketProvider();
    const normalized = normalizeAddressSafe(walletAddress);
    if (!provider || !normalized || typeof provider.getBlockNumber !== 'function' || typeof provider.getLogs !== 'function') {
        return [];
    }

    let latestBlock;
    try {
        latestBlock = await provider.getBlockNumber();
    } catch (error) {
        console.warn(`[WalletLogs] Không lấy được block hiện tại: ${error.message}`);
        return [];
    }

    const lookback = Math.max(Number(options.lookbackBlocks) || 0, 0);
    const fromBlock = latestBlock > lookback ? latestBlock - lookback : 0;
    let topicWallet;
    try {
        topicWallet = ethers.zeroPadValue(normalized, 32);
    } catch (error) {
        return [];
    }

    const filters = [
        { fromBlock, toBlock: 'latest', topics: [ERC20_TRANSFER_TOPIC, null, topicWallet] },
        { fromBlock, toBlock: 'latest', topics: [ERC20_TRANSFER_TOPIC, topicWallet] }
    ];

    const seen = new Set();

    for (const filter of filters) {
        try {
            const logs = await provider.getLogs(filter);
            for (const log of logs || []) {
                if (!log.address) {
                    continue;
                }
                const addr = log.address.toLowerCase();
                if (!seen.has(addr)) {
                    seen.add(addr);
                }
            }
        } catch (error) {
            console.warn(`[WalletLogs] Không thể quét log cho ${shortenAddress(normalized)}: ${error.message}`);
        }
    }

    return Array.from(seen);
}

async function buildWalletBalanceText(lang, entries, options = {}) {
    if (!entries || entries.length === 0) {
        return t(lang, 'wallet_overview_empty');
    }

    const entry = entries[0] || {};
    const warnings = [];
    if (entry.warning === 'rpc_offline') {
        warnings.push(t(lang, 'wallet_balance_rpc_warning'));
    }
    if (entry.warning === 'wallet_cached' || entry.cached) {
        warnings.push(t(lang, 'wallet_balance_cache_warning'));
    }

    const overview = {
        tokens: Array.isArray(entry.tokens) ? entry.tokens : [],
        totalUsd: Number.isFinite(entry.totalUsd) ? entry.totalUsd : null
    };

    const body = buildWalletDexOverviewText(lang, entry.address, overview, {
        chainLabel: options.chainLabel
    });

    if (warnings.length === 0) {
        return body;
    }

    return `${warnings.join('\n')}\n\n${body}`;
}

async function fetchDexOverviewForWallet(walletAddress, options = {}) {
    const normalized = normalizeAddressSafe(walletAddress);
    if (!normalized) {
        return { tokens: [], totalUsd: null };
    }

    try {
        const snapshot = await fetchOkxDexBalanceSnapshot(normalized, options);
        return { tokens: snapshot.tokens || [], totalUsd: snapshot.totalUsd ?? null };
    } catch (error) {
        console.warn(`[WalletDex] Failed to fetch snapshot for ${shortenAddress(normalized)}: ${error.message}`);
        return { tokens: [], totalUsd: null };
    }
}

function formatDexChainLabel(entry, lang) {
    if (!entry) {
        return lang ? t(lang, 'wallet_balance_chain_unknown') : 'Unknown chain';
    }

    const chainShort = entry.chainShortName || entry.chainName || entry.chain;
    const chainIndex = Number.isFinite(entry.chainIndex)
        ? Number(entry.chainIndex)
        : Number.isFinite(entry.chainId)
            ? Number(entry.chainId)
            : Number.isFinite(entry.chain)
                ? Number(entry.chain)
                : null;

    if (chainShort && chainIndex) {
        return `${chainShort} (#${chainIndex})`;
    }
    if (chainShort) {
        return chainShort;
    }
    if (chainIndex) {
        return `#${chainIndex}`;
    }
    return lang ? t(lang, 'wallet_balance_chain_unknown') : 'Unknown chain';
}

function describeDexTokenValue(token, lang) {
    const symbol = token.symbol || token.tokenSymbol || token.tokenLabel || token.name || 'Token';
    const symbolLabel = String(symbol);
    const balanceValue = token.amountText
        || token.balance
        || token.amount
        || token.rawBalance
        || token.available
        || token.currencyAmount
        || '0';
    const balanceHtml = `${escapeHtml(String(balanceValue))} ${escapeHtml(symbolLabel)}`;

    const totalUsd = Number.isFinite(token.totalValueUsd)
        ? Number(token.totalValueUsd)
        : (Number.isFinite(Number(token.currencyAmount)) ? Number(token.currencyAmount) : null);
    const formattedTotalUsd = Number.isFinite(totalUsd) && totalUsd > 0
        ? formatFiatValue(totalUsd, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : null;
    const unitPriceRaw = token.unitPriceText
        || (token.tokenPrice !== undefined && token.tokenPrice !== null ? String(token.tokenPrice) : null)
        || (Number.isFinite(token.unitPriceUsd) ? String(token.unitPriceUsd) : null);
    const priceLabel = unitPriceRaw
        ? escapeHtml(`${unitPriceRaw} USD/${symbolLabel}`)
        : escapeHtml(t(lang, 'wallet_dex_token_value_unknown'));

    const totalParts = [];
    if (token.totalValueExactText) {
        totalParts.push(`${token.totalValueExactText} USD`);
    } else if (formattedTotalUsd) {
        totalParts.push(`${formattedTotalUsd} USD`);
    }
    if (token.valueText) {
        totalParts.push(token.valueText);
    }

    const totalLabel = totalParts.length > 0
        ? totalParts.map((part) => escapeHtml(part)).join(' / ')
        : escapeHtml(t(lang, 'wallet_dex_token_value_unknown'));

    return {
        symbolLabel,
        balanceHtml,
        priceLabel,
        totalLabel,
        unitPriceRaw,
        formattedTotalUsd
    };
}

function resolveTokenContractAddress(token) {
    if (!token || typeof token !== 'object') {
        return null;
    }

    const candidates = [
        token.tokenContractAddress,
        token.tokenAddress,
        token.contractAddress,
        token.token,
        token.address
    ];

    for (const candidate of candidates) {
        if (!candidate) {
            continue;
        }
        const normalized = normalizeAddressSafe(candidate);
        if (normalized) {
            return normalized;
        }
        if (typeof candidate === 'string' && candidate.startsWith('native:')) {
            return candidate;
        }
    }

    return null;
}

function buildWalletDexOverviewText(lang, walletAddress, overview, options = {}) {
    const normalizedWallet = normalizeAddressSafe(walletAddress) || walletAddress;
    const walletHtml = normalizedWallet
        ? formatCopyableValueHtml(normalizedWallet)
        : t(lang, 'wallet_balance_contract_unknown');
    const lines = [t(lang, 'wallet_dex_overview_title', { wallet: walletHtml })];
    lines.push(t(lang, 'wallet_dex_wallet_line', { wallet: walletHtml }));

    if (options.chainLabel) {
        lines.push(t(lang, 'wallet_balance_chain_line', { chain: escapeHtml(options.chainLabel) }));
    }

    if (Number.isFinite(overview.totalUsd)) {
        const formattedTotal = formatFiatValue(overview.totalUsd, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (formattedTotal) {
            lines.push(t(lang, 'wallet_dex_total_value', { value: escapeHtml(formattedTotal) }));
        }
    }

    const tokens = Array.isArray(overview.tokens) ? overview.tokens : [];
    if (tokens.length === 0) {
        lines.push(t(lang, 'wallet_dex_no_tokens'));
        appendPortfolioLinkAndHint(lines, lang, normalizedWallet, options.analysisUrl);
        return lines.join('\n');
    }

    tokens.forEach((token, idx) => {
        const meta = describeDexTokenValue(token, lang);
        const symbolLabel = meta.symbolLabel;
        const riskLabel = token.isRiskToken || token.riskToken || token.tokenRisk
            ? t(lang, 'wallet_dex_risk_yes')
            : t(lang, 'wallet_dex_risk_no');

        const contractRaw = token.tokenContractAddress
            || token.tokenAddress
            || token.contractAddress
            || token.token
            || null;
        const contractHtml = formatCopyableValueHtml(String(contractRaw || '').replace(/^native:/, ''))
            || t(lang, 'wallet_balance_contract_unknown');

        lines.push('');
        lines.push(t(lang, 'wallet_dex_token_header', {
            index: (idx + 1).toString(),
            symbol: escapeHtml(String(symbolLabel)),
            chain: escapeHtml(formatDexChainLabel(token, lang))
        }));
        lines.push(t(lang, 'wallet_dex_token_balance', { balance: meta.balanceHtml }));
        lines.push(t(lang, 'wallet_dex_token_value', { value: meta.priceLabel }));
        lines.push(t(lang, 'wallet_dex_token_total_value', { total: meta.totalLabel }));
        lines.push(t(lang, 'wallet_dex_token_contract', { contract: contractHtml }));
        lines.push(t(lang, 'wallet_dex_token_risk', { risk: escapeHtml(riskLabel) }));
    });

    appendPortfolioLinkAndHint(lines, lang, normalizedWallet, options.analysisUrl);
    return lines.join('\n');
}

function appendPortfolioLinkAndHint(lines, lang, walletAddress, customUrl) {
    const analysisUrl = customUrl || buildOkxPortfolioAnalysisUrl(walletAddress);
    lines.push('');
    if (analysisUrl) {
        lines.push(t(lang, 'wallet_dex_analysis_link', { url: escapeHtml(analysisUrl) }));
    }
    lines.push(t(lang, 'wallet_dex_copy_hint'));
}

function buildWalletTokenButtonRows(lang, tokens, options = {}) {
    if (!Array.isArray(tokens) || tokens.length === 0) {
        return [];
    }

    const normalizedWallet = normalizeAddressSafe(options.wallet) || options.wallet || null;
    const chainContext = options.chainContext || null;
    const chainLabel = options.chainLabel || (chainContext ? formatDexChainLabel(chainContext, lang) : null);
    const limit = Number.isFinite(options.maxButtons) ? Math.max(1, options.maxButtons) : WALLET_TOKEN_BUTTON_LIMIT;
    const rows = [];
    let currentRow = [];

    for (const token of tokens.slice(0, limit)) {
        if (!token) {
            continue;
        }
        const callbackId = registerWalletTokenContext({
            wallet: normalizedWallet,
            chainContext,
            chainLabel,
            chainCallbackData: options.chainCallbackData || null,
            token
        });
        if (!callbackId) {
            continue;
        }

        const meta = describeDexTokenValue(token, lang);
        const symbol = meta.symbolLabel || 'Token';
        const truncatedSymbol = symbol.length > 16 ? `${symbol.slice(0, 13)}…` : symbol;
        currentRow.push({
            text: `🪙 ${truncatedSymbol}`,
            callback_data: `wallet_token_view|${callbackId}`
        });

        if (currentRow.length === 2) {
            rows.push(currentRow);
            currentRow = [];
        }
    }

    if (currentRow.length > 0) {
        rows.push(currentRow);
    }

    return rows;
}

function buildWalletTokenMenu(context, lang, options = {}) {
    const token = context?.token || {};
    const meta = describeDexTokenValue(token, lang);
    const walletHtml = context?.wallet
        ? formatCopyableValueHtml(context.wallet)
        : t(lang, 'wallet_balance_contract_unknown');
    const chainLabel = context?.chainLabel || formatDexChainLabel(context?.chainContext || token, lang);
    const contractAddress = resolveTokenContractAddress(token);
    const contractHtml = contractAddress
        ? formatCopyableValueHtml(contractAddress)
        : t(lang, 'wallet_balance_contract_unknown');
    const lines = [
        t(lang, 'wallet_token_menu_title', { symbol: escapeHtml(meta.symbolLabel || 'Token') }),
        t(lang, 'wallet_dex_wallet_line', { wallet: walletHtml }),
        t(lang, 'wallet_balance_chain_line', { chain: escapeHtml(chainLabel) }),
        t(lang, 'wallet_dex_token_balance', { balance: meta.balanceHtml }),
        t(lang, 'wallet_dex_token_value', { value: meta.priceLabel }),
        t(lang, 'wallet_dex_token_total_value', { total: meta.totalLabel }),
        t(lang, 'wallet_dex_token_contract', { contract: contractHtml }),
        '',
        t(lang, 'wallet_token_menu_hint')
    ];

    if (options.actionResult) {
        const actionResult = options.actionResult;
        lines.push('');
        lines.push(t(lang, 'wallet_token_action_result_title', {
            symbol: escapeHtml(meta.symbolLabel || 'Token'),
            action: escapeHtml(actionResult.actionLabel || '')
        }));

        const metrics = Array.isArray(actionResult.metrics) ? actionResult.metrics : [];
        metrics.forEach((metric) => {
            if (!metric || !metric.label || metric.value === undefined || metric.value === null) {
                return;
            }
            lines.push(t(lang, 'wallet_token_action_metric_line', {
                label: escapeHtml(String(metric.label)),
                value: escapeHtml(String(metric.value))
            }));
        });

        const entries = Array.isArray(actionResult.listEntries) ? actionResult.listEntries : [];
        if (entries.length > 0) {
            lines.push('');
            const listLabel = actionResult.listLabel || actionResult.actionLabel || '';
            if (listLabel) {
                lines.push(t(lang, 'wallet_token_action_list_header', { label: escapeHtml(listLabel) }));
            }
            entries.forEach((entry) => {
                lines.push(`• ${String(entry)}`);
            });
        } else if (metrics.length === 0) {
            lines.push(t(lang, 'wallet_token_action_result_empty'));
        }
    }

    const text = lines.join('\n');
    const chunks = splitTelegramMessageText(text);
    const primaryText = chunks.shift() || '';

    const copyTargets = buildWalletTokenCopyTargets(context, options.actionResult);

    return {
        text: primaryText,
        replyMarkup: buildWalletTokenActionKeyboard(context, lang, { copyTargets }),
        extraTexts: chunks
    };
}

function buildWalletTokenCopyTargets(context, actionResult) {
    const targets = [];
    const seen = new Set();

    const pushTarget = (value, type = 'address', hint = null) => {
        if (value === undefined || value === null) return;
        const normalized = normalizeAddressSafe(value) || String(value).trim();
        if (!normalized) return;
        const key = `${type}:${normalized}`;
        if (seen.has(key)) return;
        seen.add(key);
        targets.push({ value: normalized, type, hint });
    };

    pushTarget(context?.wallet, 'wallet');
    const contract = resolveTokenContractAddress(context?.token);
    pushTarget(contract, 'contract');

    if (actionResult && Array.isArray(actionResult.copyTargets)) {
        for (const target of actionResult.copyTargets) {
            pushTarget(target?.value, target?.type || 'address', target?.hint || null);
        }
    }

    return targets;
}

function splitTelegramMessageText(text, limit = TELEGRAM_MESSAGE_SAFE_LENGTH) {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : TELEGRAM_MESSAGE_SAFE_LENGTH;
    if (!text) {
        return [''];
    }

    const lines = String(text).split('\n');
    const chunks = [];
    let current = '';

    const pushCurrent = () => {
        if (current) {
            chunks.push(current);
            current = '';
        }
    };

    for (const line of lines) {
        const candidate = current ? `${current}\n${line}` : line;
        if (candidate.length > safeLimit) {
            pushCurrent();
            if (line.length > safeLimit) {
                for (let offset = 0; offset < line.length; offset += safeLimit) {
                    chunks.push(line.slice(offset, offset + safeLimit));
                }
            } else {
                current = line;
            }
            continue;
        }
        current = candidate;
    }

    pushCurrent();

    return chunks.length > 0 ? chunks : [''];
}

async function sendWalletTokenExtraTexts(botInstance, chatId, extraTexts) {
    if (!botInstance || !chatId || !Array.isArray(extraTexts) || extraTexts.length === 0) {
        return;
    }

    for (const chunk of extraTexts) {
        const text = typeof chunk === 'string' ? chunk : '';
        if (!text || !text.trim()) {
            continue;
        }
        try {
            await botInstance.sendMessage(chatId, text, { parse_mode: 'HTML' });
        } catch (error) {
            console.warn(`[WalletToken] Failed to send extra chunk: ${error.message}`);
            break;
        }
    }
}

function buildWalletTokenActionKeyboard(context, lang, options = {}) {
    const rows = [];
    const tokenId = context?.tokenCallbackId;
    const copyTargets = limitCopyTargets(Array.isArray(options.copyTargets) ? options.copyTargets : []);

    if (copyTargets.length > 0) {
        let copyRow = [];
        for (const target of copyTargets) {
            const label = formatCopyButtonLabel(target, lang);
            const token = registerCopyPayload(target.value);
            if (!label || !token) {
                continue;
            }
            copyRow.push({ text: label, callback_data: `copy_text|${token}` });
            if (copyRow.length === 2) {
                rows.push(copyRow);
                copyRow = [];
            }
        }
        if (copyRow.length > 0) {
            rows.push(copyRow);
        }
    }

    if (tokenId) {
        let currentRow = [];
        for (const action of WALLET_TOKEN_ACTIONS) {
            currentRow.push({
                text: t(lang, action.labelKey),
                callback_data: `wallet_token_action|${tokenId}|${action.key}`
            });
            if (currentRow.length === 2) {
                rows.push(currentRow);
                currentRow = [];
            }
        }
        if (currentRow.length > 0) {
            rows.push(currentRow);
        }

    }

    if (context?.chainCallbackData) {
        rows.push([{ text: t(lang, 'wallet_token_back_to_assets'), callback_data: context.chainCallbackData }]);
    }

    rows.push([{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]);
    return { inline_keyboard: rows };
}

function limitCopyTargets(targets) {
    if (!Array.isArray(targets) || targets.length === 0) {
        return [];
    }
    const max = Number.isFinite(COPY_BUTTON_LIMIT) && COPY_BUTTON_LIMIT > 0 ? COPY_BUTTON_LIMIT : 24;
    return targets.slice(0, max);
}

function formatCopyButtonLabel(target, lang) {
    if (!target || !target.value) {
        return null;
    }
    const hint = target.hint || null;
    const baseLabel = hint || shortenAddress(target.value);
    return t(lang, 'copy_button_label', { label: baseLabel || t(lang, 'copy_button_fallback_label') });
}

async function buildWalletTokenActionResult(actionKey, context, lang) {
    const config = WALLET_TOKEN_ACTION_LOOKUP[actionKey];
    if (!config) {
        throw new Error('wallet_token_action_unknown');
    }

    const payload = await fetchWalletTokenActionPayload(actionKey, context);
    return normalizeWalletTokenActionResult(actionKey, payload, lang);
}

async function fetchWalletTokenActionPayload(actionKey, context) {
    const config = WALLET_TOKEN_ACTION_LOOKUP[actionKey];
    if (!config) {
        throw new Error('wallet_token_action_unknown');
    }

    const tokenAddress = resolveTokenContractAddress(context?.token);
    if (!tokenAddress) {
        throw new Error('wallet_token_missing_contract');
    }

    const baseQuery = buildOkxTokenQueryFromContext(context);
    const query = { ...baseQuery };

    let handler = null;
    switch (actionKey) {
        case 'historical_price': {
            applyWalletTokenHistoricalPriceWindow(query);
            handler = () => fetchWalletTokenHistoricalPricePayload(query, config);
            break;
        }
        case 'price_info': {
            const historyQuery = buildOkxTokenQueryFromContext(context);
            applyWalletTokenPriceInfoHistoryWindow(historyQuery);
            handler = async () => {
                const [priceInfoPayload, historyPayload] = await Promise.all([
                    callOkxDexEndpoint(config.path, query, {
                        method: config.method || 'GET',
                        auth: hasOkxCredentials,
                        allowFallback: true,
                        bodyType: config.bodyType
                    }),
                    fetchWalletTokenHistoricalPricePayload(historyQuery, {
                        path: '/api/v6/dex/index/historical-price',
                        method: 'GET'
                    })
                ]);

                return { priceInfo: priceInfoPayload, history: historyPayload };
            };
            break;
        }
        case 'candles':
            query.bar = normalizeOkxCandleBar(query.bar, WALLET_TOKEN_CANDLE_RECENT_BAR) || WALLET_TOKEN_CANDLE_RECENT_BAR;
            query.limit = Math.min(WALLET_TOKEN_CANDLE_RECENT_LIMIT, query.limit || WALLET_TOKEN_CANDLE_RECENT_LIMIT);
            break;
        case 'historical_candles':
            query.bar = normalizeOkxCandleBar(query.bar, '1Dutc') || '1Dutc';
            query.limit = Math.min(WALLET_TOKEN_CANDLE_DAY_SPAN, query.limit || WALLET_TOKEN_CANDLE_DAY_SPAN);
            break;
        case 'latest_price':
            query.limit = Math.min(WALLET_TOKEN_TRADE_LIMIT, query.limit || WALLET_TOKEN_TRADE_LIMIT);
            break;
        case 'price_info':
            if (query.limit === undefined || query.limit === null) {
                delete query.limit;
            }
            break;
        case 'holder':
            query.limit = Math.min(WALLET_TOKEN_HOLDER_LIMIT, query.limit || WALLET_TOKEN_HOLDER_LIMIT);
            break;
        default:
            break;
    }

    if (!handler) {
        handler = () => callOkxDexEndpoint(config.path, query, {
            method: config.method || 'GET',
            auth: hasOkxCredentials,
            allowFallback: true,
            bodyType: config.bodyType
        });
    }

    const cacheKey = buildWalletTokenActionCacheKey(actionKey, context, query);
    const cacheTtl = resolveWalletTokenActionCacheTtl(actionKey);
    const cacheEntry = cacheKey ? getWalletTokenActionCacheEntry(cacheKey) : null;
    const cachedValue = cacheEntry && !cacheEntry.expired ? cacheEntry.value : null;
    const staleCacheValue = cacheEntry && cacheEntry.expired ? cacheEntry.value : null;

    if (cachedValue) {
        return cachedValue;
    }

    try {
        const payload = await handler();
        if (cacheKey && cacheTtl > 0 && payload) {
            setWalletTokenActionCacheEntry(cacheKey, payload, cacheTtl);
        }
        return payload;
    } catch (error) {
        if (staleCacheValue) {
            return staleCacheValue;
        }
        throw error;
    }
}

async function fetchWalletTokenHistoricalPricePayload(query, config) {
    const combinedEntries = [];
    let cursor = query.cursor !== undefined ? query.cursor : null;
    let lastPayload = null;
    let lastFlattenedEntries = null;
    let lastUniquePriceCount = 0;
    const normalizedTargetPeriod = normalizeWalletTokenHistoryPeriod('1d');

    for (let page = 0; page < WALLET_TOKEN_HISTORY_MAX_PAGES; page += 1) {
        const requestQuery = { ...query };
        if (cursor !== undefined && cursor !== null && String(cursor).trim()) {
            requestQuery.cursor = cursor;
        } else {
            delete requestQuery.cursor;
        }

        const payload = await callOkxDexEndpoint(config.path, requestQuery, {
            method: config.method || 'GET',
            auth: hasOkxCredentials,
            allowFallback: true,
            bodyType: config.bodyType
        });

        lastPayload = payload;
        const pageEntries = unwrapOkxData(payload) || [];
        if (pageEntries.length === 0) {
            break;
        }

        combinedEntries.push(...pageEntries);

        const flattenedEntries = expandWalletTokenHistoryEntries(combinedEntries);
        const resampledEntries = resampleWalletTokenHistoryEntries(flattenedEntries, normalizedTargetPeriod);
        const uniquePriceCount = countDistinctWalletTokenHistoryPrices(resampledEntries);
        lastFlattenedEntries = resampledEntries;
        lastUniquePriceCount = uniquePriceCount;
        const nextCursor = extractOkxPayloadCursor(payload);

        if (uniquePriceCount >= WALLET_TOKEN_HISTORY_MIN_UNIQUE_PRICES || !nextCursor || nextCursor === cursor) {
            break;
        }

        cursor = nextCursor;
    }

    const flattenedEntries = lastFlattenedEntries
        || resampleWalletTokenHistoryEntries(expandWalletTokenHistoryEntries(combinedEntries), normalizedTargetPeriod);
    const uniquePriceCount = lastUniquePriceCount || countDistinctWalletTokenHistoryPrices(flattenedEntries);

    if (flattenedEntries.length === 0 || uniquePriceCount < WALLET_TOKEN_HISTORY_MIN_UNIQUE_PRICES) {
        const fallbackPayload = await fetchWalletTokenHistoricalPriceFallback(query, normalizedTargetPeriod);
        if (fallbackPayload) {
            return fallbackPayload;
        }
    }

    if (flattenedEntries.length > 0) {
        return { data: flattenedEntries };
    }

    return lastPayload || { data: [] };
}

function getWalletTokenHistoryWindowDays() {
    return Math.max(1, normalizeWalletTokenHistoryLimit(WALLET_TOKEN_HISTORY_DEFAULT_LIMIT));
}

function applyWalletTokenHistoricalPriceWindow(query) {
    if (!query) {
        return;
    }

    const dailyMs = WALLET_TOKEN_HISTORY_PERIOD_MS['1d'] || 24 * 60 * 60 * 1000;
    const limit = getWalletTokenHistoryWindowDays();
    const now = Date.now();
    const alignedEnd = Math.floor(now / dailyMs) * dailyMs;
    const begin = Math.max(0, alignedEnd - limit * dailyMs);

    query.period = '1d';
    query.limit = limit;
    query.begin = String(begin);
    query.end = String(alignedEnd);
    if ('cursor' in query) {
        delete query.cursor;
    }
}

function applyWalletTokenPriceInfoHistoryWindow(query) {
    if (!query) {
        return;
    }

    const dailyMs = WALLET_TOKEN_HISTORY_PERIOD_MS['1d'] || 24 * 60 * 60 * 1000;
    const limit = Math.max(1, WALLET_TOKEN_PRICE_INFO_HISTORY_DAYS);
    const now = Date.now();
    const alignedEnd = Math.floor(now / dailyMs) * dailyMs;
    const begin = Math.max(0, alignedEnd - limit * dailyMs);

    query.period = '1d';
    query.limit = limit;
    query.begin = String(begin);
    query.end = String(alignedEnd);
    if ('cursor' in query) {
        delete query.cursor;
    }
}

async function fetchWalletTokenHistoricalPriceFallback(query, targetPeriod) {
    const fallbackQuery = buildWalletTokenHistoricalPriceFallbackQuery(query);
    const barVariants = buildOkxCandleBarFallbackVariants(fallbackQuery.bar);

    for (const barVariant of barVariants) {
        const attemptQuery = { ...fallbackQuery };
        if (barVariant) {
            attemptQuery.bar = barVariant;
        } else {
            delete attemptQuery.bar;
        }

        try {
            const payload = await callOkxDexEndpoint('/api/v6/dex/market/historical-candles', attemptQuery, {
                method: 'POST',
                auth: hasOkxCredentials,
                allowFallback: true
            });

            const entries = unwrapOkxData(payload) || [];
            const normalizedEntries = convertWalletTokenCandlesToHistoryEntries(entries);
            const resampledEntries = resampleWalletTokenHistoryEntries(normalizedEntries, targetPeriod);
            if (resampledEntries.length === 0) {
                continue;
            }

            return { data: resampledEntries };
        } catch (error) {
            if (!isOkxBarParameterError(error)) {
                console.warn(`[WalletToken] Failed to fetch historical price fallback: ${error.message}`);
                return null;
            }

            console.warn(`[WalletToken] Candle fallback rejected bar "${attemptQuery.bar}": ${error.message}`);
        }
    }

    console.warn('[WalletToken] Candle fallback exhausted all bar variants without data');
    return null;
}

function buildWalletTokenHistoricalPriceFallbackQuery(query) {
    const fallback = { ...query };
    delete fallback.cursor;
    delete fallback.begin;
    delete fallback.end;
    delete fallback.period;
    if (!fallback.bar) {
        fallback.bar = WALLET_TOKEN_HISTORY_FALLBACK_BAR;
    }
    const normalizedBar = normalizeOkxCandleBar(fallback.bar, WALLET_TOKEN_HISTORY_FALLBACK_BAR);
    if (normalizedBar) {
        fallback.bar = normalizedBar;
    }
    if (!fallback.limit) {
        fallback.limit = WALLET_TOKEN_HISTORY_FALLBACK_LIMIT;
    }
    return fallback;
}

function buildOkxCandleBarFallbackVariants(bar) {
    const variants = [];
    const addVariant = (value) => {
        if (!value) {
            return;
        }
        const normalized = String(value).trim();
        if (!normalized) {
            return;
        }
        if (!variants.includes(normalized)) {
            variants.push(normalized);
        }
    };

    const preferred = normalizeOkxCandleBar(bar, WALLET_TOKEN_HISTORY_FALLBACK_BAR)
        || WALLET_TOKEN_HISTORY_FALLBACK_BAR
        || null;
    if (preferred) {
        addVariant(preferred);
        addVariant(preferred.toUpperCase());
        addVariant(preferred.toLowerCase());

        const match = preferred.match(/^(\d+)([A-Za-z]+)/);
        if (match) {
            const [, amount, unit] = match;
            const lowerUnit = unit.toLowerCase();
            if (lowerUnit === 'd') {
                addVariant(`${amount}day`);
                addVariant(`${amount}Day`);
                addVariant(`${amount}DAY`);
            }
            if (lowerUnit === 'h') {
                addVariant(`${amount}hour`);
                addVariant(`${amount}Hour`);
            }
        }
    }

    if (!variants.includes(null)) {
        variants.push(null);
    }

    return variants;
}

function isOkxBarParameterError(error) {
    if (!error || !error.message) {
        return false;
    }

    const message = String(error.message).toLowerCase();
    return message.includes('parameter bar error');
}

function normalizeWalletTokenHistoryLimit(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return Math.min(WALLET_TOKEN_HISTORY_DEFAULT_LIMIT, WALLET_TOKEN_HISTORY_MAX_LIMIT);
    }
    return Math.min(Math.floor(numeric), WALLET_TOKEN_HISTORY_MAX_LIMIT);
}

function normalizeWalletTokenHistoryPeriod(value) {
    const fallback = WALLET_TOKEN_HISTORY_PERIOD_MS[WALLET_TOKEN_HISTORY_DEFAULT_PERIOD]
        ? WALLET_TOKEN_HISTORY_DEFAULT_PERIOD
        : '1d';
    if (value === undefined || value === null) {
        return fallback;
    }
    const text = String(value).trim();
    if (!text) {
        return fallback;
    }
    if (WALLET_TOKEN_HISTORY_PERIOD_MS[text]) {
        return text;
    }
    return fallback;
}

function resolveWalletTokenHistoryRequestPeriod(period) {
    const normalized = normalizeWalletTokenHistoryPeriod(period);
    if (WALLET_TOKEN_HISTORY_PERIOD_REQUEST_MAP[normalized]) {
        return WALLET_TOKEN_HISTORY_PERIOD_REQUEST_MAP[normalized];
    }
    if (WALLET_TOKEN_HISTORY_REQUEST_PERIOD_MS[normalized]) {
        return normalized;
    }
    return WALLET_TOKEN_HISTORY_PERIOD_REQUEST_MAP[WALLET_TOKEN_HISTORY_DEFAULT_PERIOD]
        || WALLET_TOKEN_HISTORY_DEFAULT_PERIOD
        || '1d';
}

function getWalletTokenHistoryBucketMs(period) {
    if (period && WALLET_TOKEN_HISTORY_PERIOD_MS[period]) {
        return WALLET_TOKEN_HISTORY_PERIOD_MS[period];
    }
    if (WALLET_TOKEN_HISTORY_PERIOD_MS[WALLET_TOKEN_HISTORY_DEFAULT_PERIOD]) {
        return WALLET_TOKEN_HISTORY_PERIOD_MS[WALLET_TOKEN_HISTORY_DEFAULT_PERIOD];
    }
    return null;
}

function getWalletTokenHistoryRequestPeriodMs(period) {
    if (period && WALLET_TOKEN_HISTORY_REQUEST_PERIOD_MS[period]) {
        return WALLET_TOKEN_HISTORY_REQUEST_PERIOD_MS[period];
    }
    return null;
}

function normalizeOkxCandleBar(value, fallback = null) {
    const normalizeValue = (input) => {
        if (input === undefined || input === null) {
            return null;
        }
        const key = String(input).trim().toLowerCase();
        if (!key) {
            return null;
        }
        return OKX_CANDLE_BAR_MAP[key] || null;
    };

    return normalizeValue(value) || normalizeValue(fallback);
}

function convertWalletTokenCandlesToHistoryEntries(entries) {
    if (!Array.isArray(entries)) {
        return [];
    }

    return entries
        .map((row) => normalizeWalletTokenCandleHistoryEntry(row))
        .filter(Boolean);
}

function normalizeWalletTokenCandleHistoryEntry(row) {
    if (!row) {
        return null;
    }

    let timestamp = null;
    let price = null;

    if (Array.isArray(row)) {
        timestamp = row.length > 0 ? row[0] : null;
        const closeValue = row.length > 4 ? row[4] : row[1];
        if (closeValue !== undefined && closeValue !== null) {
            price = String(closeValue).trim();
        }
    } else if (typeof row === 'object') {
        timestamp = row.ts ?? row.timestamp ?? row.time ?? row.date ?? null;
        const closeValue = row.close ?? row.c ?? row.price ?? row.avgPrice;
        if (closeValue !== undefined && closeValue !== null) {
            price = String(closeValue).trim();
        }
    }

    if ((timestamp === undefined || timestamp === null) || !price) {
        return null;
    }

    return { time: timestamp, price, close: price };
}

function buildOkxTokenQueryFromContext(context, overrides = {}) {
    const query = { ...overrides };
    const chainContext = context?.chainContext || {};
    const token = context?.token || {};
    const tokenAddress = resolveTokenContractAddress(token);

    if (tokenAddress) {
        query.tokenAddress = query.tokenAddress || tokenAddress;
        query.tokenContractAddress = query.tokenContractAddress || tokenAddress;
        query.contractAddress = query.contractAddress || tokenAddress;
        query.baseTokenAddress = query.baseTokenAddress || tokenAddress;
        query.fromTokenAddress = query.fromTokenAddress || tokenAddress;
    }

    const chainIndex = Number.isFinite(token?.chainIndex)
        ? Number(token.chainIndex)
        : Number.isFinite(chainContext?.chainIndex)
            ? Number(chainContext.chainIndex)
            : null;
    const chainId = Number.isFinite(token?.chainId)
        ? Number(token.chainId)
        : Number.isFinite(chainContext?.chainId)
            ? Number(chainContext.chainId)
            : chainIndex;

    if (Number.isFinite(chainIndex) && !Number.isFinite(query.chainIndex)) {
        query.chainIndex = chainIndex;
    }
    if (Number.isFinite(chainId) && !Number.isFinite(query.chainId)) {
        query.chainId = chainId;
    }

    const chainShortName = resolveChainContextShortName(chainContext) || chainContext.chainShortName;
    if (chainShortName && !query.chainShortName) {
        query.chainShortName = chainShortName;
    }

    if (context?.wallet && !query.walletAddress) {
        query.walletAddress = context.wallet;
    }

    if (OKX_QUOTE_TOKEN_ADDRESS) {
        query.quoteTokenAddress = query.quoteTokenAddress || OKX_QUOTE_TOKEN_ADDRESS;
        query.toTokenAddress = query.toTokenAddress || OKX_QUOTE_TOKEN_ADDRESS;
    }

    return query;
}

function resolveWalletTokenActionCacheTtl(actionKey) {
    switch (actionKey) {
        case 'historical_price':
        case 'historical_candles':
            return WALLET_TOKEN_ACTION_HISTORY_CACHE_TTL_MS;
        default:
            return WALLET_TOKEN_ACTION_DEFAULT_CACHE_TTL_MS;
    }
}

function buildWalletTokenActionCacheKey(actionKey, context, query = null) {
    if (!actionKey) {
        return null;
    }

    const chainContext = context?.chainContext || {};
    const tokenAddress = resolveTokenContractAddress(context?.token) || context?.token?.address;
    const normalizedToken = typeof tokenAddress === 'string' ? tokenAddress.toLowerCase() : '';
    const normalizedQuery = normalizeWalletTokenCacheQuery(query);

    try {
        return JSON.stringify({
            actionKey,
            token: normalizedToken,
            chain: chainContext.chainIndex ?? chainContext.chainId ?? chainContext.chainShortName ?? '',
            wallet: context?.wallet || '',
            query: normalizedQuery
        });
    } catch (error) {
        return null;
    }
}

function normalizeWalletTokenCacheQuery(query) {
    if (!query || typeof query !== 'object') {
        return null;
    }

    const entries = Object.entries(query)
        .filter(([_, value]) => value !== undefined && value !== null)
        .sort(([a], [b]) => a.localeCompare(b));

    return entries.reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
    }, {});
}

function getWalletTokenActionCacheEntry(cacheKey) {
    if (!cacheKey || !walletTokenActionCache.has(cacheKey)) {
        return null;
    }

    const entry = walletTokenActionCache.get(cacheKey);
    if (!entry) {
        walletTokenActionCache.delete(cacheKey);
        return null;
    }

    const now = Date.now();
    const expired = typeof entry.expiresAt === 'number' && entry.expiresAt <= now;

    return {
        value: cloneJsonValue(entry.value),
        expired
    };
}

function setWalletTokenActionCacheEntry(cacheKey, payload, ttlMs) {
    if (!cacheKey || !payload || !Number.isFinite(ttlMs) || ttlMs <= 0) {
        return;
    }

    pruneWalletTokenActionCache();

    walletTokenActionCache.set(cacheKey, {
        value: cloneJsonValue(payload),
        expiresAt: Date.now() + ttlMs
    });
}

function pruneWalletTokenActionCache() {
    const now = Date.now();

    for (const [cacheKey, entry] of walletTokenActionCache.entries()) {
        if (!entry) {
            walletTokenActionCache.delete(cacheKey);
            continue;
        }

        const expiresAt = typeof entry.expiresAt === 'number' ? entry.expiresAt : 0;
        if (expiresAt && expiresAt + WALLET_TOKEN_ACTION_CACHE_STALE_GRACE_MS < now) {
            walletTokenActionCache.delete(cacheKey);
        }
    }

    while (walletTokenActionCache.size > WALLET_TOKEN_ACTION_CACHE_MAX_ENTRIES) {
        const oldestKey = walletTokenActionCache.keys().next().value;
        if (oldestKey === undefined) {
            break;
        }
        walletTokenActionCache.delete(oldestKey);
    }
}

function cloneJsonValue(value) {
    if (value === undefined || value === null) {
        return value;
    }
    if (typeof value !== 'object') {
        return value;
    }

    try {
        return JSON.parse(JSON.stringify(value));
    } catch (error) {
        return value;
    }
}

function isOkxMethodNotAllowedError(error) {
    if (!error || !error.message) {
        return false;
    }

    const message = String(error.message).toLowerCase();
    if (message.includes('http 405')) {
        return true;
    }
    if (message.includes("request method 'get' not supported") || message.includes("request method 'post' not supported")) {
        return true;
    }
    if (message.includes('method not allowed')) {
        return true;
    }

    return false;
}

function isOkxRateLimitError(error) {
    if (!error || !error.message) {
        return false;
    }

    const message = String(error.message).toLowerCase();
    return message.includes('http 429') || message.includes('too many requests') || message.includes('rate limit');
}

function isOkxTransientResponseError(error) {
    if (!error || !error.message) {
        return false;
    }

    const message = String(error.message).toLowerCase();
    if (message.includes('okx response code -1')) {
        return true;
    }
    if (message.includes('timed out') || message.includes('etimedout')) {
        return true;
    }
    if (message.includes('http 5')) {
        return true;
    }
    return false;
}

function isOkxRetryableError(error) {
    return isOkxRateLimitError(error) || isOkxTransientResponseError(error);
}

function isTelegramMessageNotModifiedError(error) {
    if (!error) {
        return false;
    }

    const description = error?.response?.body?.description || error?.message || '';
    return typeof description === 'string'
        ? description.toLowerCase().includes('message is not modified')
        : false;
}

async function callOkxDexEndpoint(path, query, options = {}) {
    const {
        method = 'GET',
        auth = hasOkxCredentials,
        allowFallback = true,
        bodyType = null,
        maxRetries = OKX_DEX_DEFAULT_MAX_RETRIES,
        retryDelayMs = OKX_DEX_DEFAULT_RETRY_DELAY_MS
    } = options;

    const resolvedMaxRetries = Number.isFinite(Number(maxRetries))
        ? Math.max(0, Math.floor(Number(maxRetries)))
        : OKX_DEX_DEFAULT_MAX_RETRIES;
    const resolvedRetryDelayMs = Number.isFinite(Number(retryDelayMs))
        ? Math.max(0, Math.floor(Number(retryDelayMs)))
        : OKX_DEX_DEFAULT_RETRY_DELAY_MS;

    const preferredMethod = (method || 'GET').toUpperCase();
    const fallbackMethod = preferredMethod === 'POST' ? 'GET' : 'POST';
    const methods = allowFallback && fallbackMethod !== preferredMethod
        ? [preferredMethod, fallbackMethod]
        : [preferredMethod];

    let lastError = null;

    for (const currentMethod of methods) {
        for (let attempt = 0; attempt <= resolvedMaxRetries; attempt += 1) {
            try {
                const requestBody = bodyType === 'array' && currentMethod !== 'GET'
                    ? Array.isArray(query)
                        ? query
                        : query
                            ? [query]
                            : []
                    : query;

                const requestOptions = currentMethod === 'GET'
                    ? { query, auth }
                    : { body: requestBody, auth };

                return await okxJsonRequest(currentMethod, path, requestOptions);
            } catch (error) {
                const methodNotAllowed = isOkxMethodNotAllowedError(error);
                const canRetry = !methodNotAllowed && attempt < resolvedMaxRetries && isOkxRetryableError(error);

                if (canRetry) {
                    const backoff = resolvedRetryDelayMs * Math.max(1, attempt + 1);
                    if (backoff > 0) {
                        await delay(backoff);
                    }
                    continue;
                }

                lastError = error;
                if (!allowFallback || !methodNotAllowed) {
                    throw error;
                }

                break;
            }
        }
    }

    if (lastError) {
        throw lastError;
    }

    return null;
}

function extractOkxPayloadCursor(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const candidates = [];
    if (payload.cursor !== undefined && payload.cursor !== null) {
        candidates.push(payload.cursor);
    }
    if (payload.nextCursor !== undefined && payload.nextCursor !== null) {
        candidates.push(payload.nextCursor);
    }

    const directData = payload.data;
    if (Array.isArray(directData)) {
        for (const entry of directData) {
            if (entry && entry.cursor !== undefined && entry.cursor !== null) {
                candidates.push(entry.cursor);
                break;
            }
        }
    } else if (directData && typeof directData === 'object') {
        if (directData.cursor !== undefined && directData.cursor !== null) {
            candidates.push(directData.cursor);
        }
        if (Array.isArray(directData.data)) {
            for (const entry of directData.data) {
                if (entry && entry.cursor !== undefined && entry.cursor !== null) {
                    candidates.push(entry.cursor);
                    break;
                }
            }
        }
    }

    for (const candidate of candidates) {
        if (candidate === undefined || candidate === null) {
            continue;
        }
        const normalized = String(candidate).trim();
        if (normalized) {
            return normalized;
        }
    }

    return null;
}

function normalizeWalletTokenActionResult(actionKey, payload, lang) {
    const config = WALLET_TOKEN_ACTION_LOOKUP[actionKey];
    const actionLabel = config ? t(lang, config.labelKey) : actionKey;
    const result = {
        actionLabel,
        metrics: [],
        listEntries: [],
        listLabel: null,
        copyTargets: []
    };

    const entries = unwrapOkxData(payload) || [];
    const primaryEntry = unwrapOkxFirst(payload) || (entries.length > 0 ? entries[0] : null);
    const copySeen = new Set();
    const pushCopyTarget = (value, type = 'address', hint = null) => {
        if (value === undefined || value === null) {
            return;
        }
        const normalized = normalizeAddressSafe(value) || String(value).trim();
        if (!normalized) {
            return;
        }
        const key = `${type}:${normalized}`;
        if (copySeen.has(key)) {
            return;
        }
        copySeen.add(key);
        result.copyTargets.push({ value: normalized, type, hint });
    };

    switch (actionKey) {
        case 'current_price': {
            result.metrics.push(...buildWalletTokenPriceMetrics(primaryEntry, actionKey));
            break;
        }
        case 'price_info': {
            const priceInfoEntry = unwrapOkxFirst(payload?.priceInfo) || primaryEntry;
            result.metrics.push(...buildWalletTokenPriceInfoMetrics(priceInfoEntry));

            const historyEntries = expandWalletTokenHistoryEntries(unwrapOkxData(payload?.history) || entries);
            const sortedHistory = sortWalletTokenHistoryEntries(historyEntries);
            const dailyLimit = Math.max(1, WALLET_TOKEN_PRICE_INFO_HISTORY_DAYS);
            const formattedHistory = [];

            for (let i = 0; i < sortedHistory.length && formattedHistory.length < dailyLimit; i += 1) {
                const row = sortedHistory[i];
                const prev = i + 1 < sortedHistory.length ? sortedHistory[i + 1] : null;
                const formatted = formatWalletTokenHistoryEntry(row, prev, lang);
                if (formatted) {
                    formattedHistory.push(formatted);
                }
            }

            result.listEntries = formattedHistory;
            if (result.listEntries.length > 0) {
                result.listLabel = t(lang, 'wallet_token_action_price_info_history_label', {
                    days: WALLET_TOKEN_PRICE_INFO_HISTORY_DAYS
                }) || actionLabel;
            }
            break;
        }
        case 'historical_price': {
            const historyEntries = expandWalletTokenHistoryEntries(entries);
            const sortedHistoryEntries = sortWalletTokenHistoryEntries(historyEntries);
            const formattedEntries = [];
            const historyDays = getWalletTokenHistoryWindowDays();
            const maxHistoryEntries = Math.max(1, Math.min(historyDays, sortedHistoryEntries.length));

            for (let i = 0; i < sortedHistoryEntries.length && formattedEntries.length < maxHistoryEntries; i += 1) {
                const row = sortedHistoryEntries[i];
                const previousRow = i + 1 < sortedHistoryEntries.length ? sortedHistoryEntries[i + 1] : null;
                const formatted = formatWalletTokenHistoryEntry(row, previousRow, lang);
                if (formatted) {
                    formattedEntries.push(formatted);
                }
            }

            result.listEntries = formattedEntries;
            const historyLabel = t(lang, 'wallet_token_action_history_last_days', { days: historyDays }) || actionLabel;
            result.listLabel = historyLabel;
            break;
        }
        case 'candles': {
            result.listEntries = entries
                .slice(0, WALLET_TOKEN_CANDLE_RECENT_LIMIT)
                .map(formatWalletTokenCandleEntry)
                .filter(Boolean);
            result.listLabel = t(lang, 'wallet_token_action_candles_label_recent', { hours: 24 }) || actionLabel;
            break;
        }
        case 'historical_candles': {
            result.listEntries = entries
                .slice(0, WALLET_TOKEN_CANDLE_DAY_SPAN)
                .map(formatWalletTokenCandleEntry)
                .filter(Boolean);
            result.listLabel = t(lang, 'wallet_token_action_historical_candles_label', {
                days: WALLET_TOKEN_CANDLE_DAY_SPAN
            }) || actionLabel;
            break;
        }
        case 'token_info': {
            if (primaryEntry) {
                const name = primaryEntry.name || primaryEntry.tokenName;
                const symbol = primaryEntry.symbol || primaryEntry.tokenSymbol;
                if (name || symbol) {
                    result.metrics.push({ label: '🧬 Token', value: [name, symbol].filter(Boolean).join(' / ') });
                }
                const decimals = pickOkxNumeric(primaryEntry, ['decimals', 'decimal', 'tokenDecimal']);
                if (Number.isFinite(decimals)) {
                    result.metrics.push({ label: '🔢 Decimals', value: decimals });
                }
                const supply = pickOkxNumeric(primaryEntry, ['supply', 'totalSupply', 'circulatingSupply']);
                if (Number.isFinite(supply)) {
                    result.metrics.push({ label: '📦 Supply', value: supply });
                }
                const holders = pickOkxNumeric(primaryEntry, ['holderCount', 'holders']);
                if (Number.isFinite(holders)) {
                    result.metrics.push({ label: '👥 Holders', value: holders });
                }
                const website = primaryEntry.website || primaryEntry.site;
                if (website) {
                    result.metrics.push({ label: '🌐 Website', value: website });
                }
            }
            result.listEntries = buildWalletTokenTokenInfoEntries(primaryEntry);
            if (result.listEntries.length > 0) {
                result.listLabel = t(lang, 'wallet_token_action_token_info_list_label') || actionLabel;
            }
            break;
        }
        case 'latest_price': {
            const formattedTrades = [];
            const maxTrades = Math.min(WALLET_TOKEN_TRADE_LIMIT, entries.length);
            for (let i = 0; i < maxTrades; i += 1) {
                const entry = entries[i];
                const formatted = formatWalletTokenTradeEntry(entry, i);
                if (formatted) {
                    formattedTrades.push(formatted);
                }
                const maker = entry?.maker
                    || entry?.makerAddress
                    || entry?.buyerAddress
                    || entry?.buyer
                    || entry?.from
                    || entry?.fromAddress
                    || entry?.addressFrom
                    || entry?.traderAddress
                    || entry?.userAddress;
                const taker = entry?.taker
                    || entry?.takerAddress
                    || entry?.sellerAddress
                    || entry?.seller
                    || entry?.to
                    || entry?.toAddress
                    || entry?.addressTo
                    || entry?.counterpartyAddress;
                const txHash = entry?.txHash || entry?.transactionHash || entry?.hash || entry?.txid;
                pushCopyTarget(maker, 'wallet', `#${i + 1} from`);
                pushCopyTarget(taker, 'wallet', `#${i + 1} to`);
                pushCopyTarget(txHash, 'tx', `Tx #${i + 1}`);
            }
            result.listEntries = formattedTrades;
            result.listLabel = t(lang, 'wallet_token_action_latest_price_list_label', {
                count: WALLET_TOKEN_TRADE_LIMIT
            }) || actionLabel;
            if (result.listEntries.length === 0) {
                const fallbackEntry = formatWalletTokenTradeEntry(primaryEntry, 0);
                if (fallbackEntry) {
                    result.listEntries.push(fallbackEntry);
                }
            }
            break;
        }
        case 'holder': {
            const total = pickOkxNumeric(primaryEntry || payload?.data || {}, ['holderCount', 'holders', 'total']);
            if (Number.isFinite(total)) {
                result.metrics.push({ label: '👥 Total holders', value: total });
            }
            const formattedHolders = [];
            const holderLimit = Math.min(WALLET_TOKEN_HOLDER_LIMIT, entries.length);
            for (let i = 0; i < holderLimit; i += 1) {
                const entry = entries[i];
                const formatted = formatWalletTokenHolderEntry(entry, i);
                if (formatted) {
                    formattedHolders.push(formatted);
                }
                const address = entry?.address
                    || entry?.walletAddress
                    || entry?.holderAddress
                    || entry?.holderWalletAddress;
                pushCopyTarget(address, 'wallet', `#${i + 1}`);
            }
            result.listEntries = formattedHolders;
            result.listLabel = t(lang, 'wallet_token_action_holder_list_label', {
                count: WALLET_TOKEN_HOLDER_LIMIT
            }) || actionLabel;
            break;
        }
        default:
            break;
    }

    return result;
}

function buildWalletTokenPriceMetrics(entry, actionKey) {
    const metrics = [];
    if (!entry) {
        return metrics;
    }

    const price = extractOkxPriceValue(entry);
    if (price !== null && price !== undefined) {
        metrics.push({ label: '💰 Price', value: `${price} USD` });
    }

    const changeAbs = pickOkxNumeric(entry, ['usdChange24h', 'change24h', 'change', 'priceChange']);
    if (Number.isFinite(changeAbs)) {
        metrics.push({ label: '📈 Change (24h)', value: changeAbs });
    }

    const changePercent = pickOkxNumeric(entry, ['changeRate', 'changePercent', 'change24hPercent', 'percentChange', 'changePct']);
    if (Number.isFinite(changePercent)) {
        metrics.push({ label: '📉 Change %', value: `${changePercent}%` });
    }

    const volume = pickOkxNumeric(entry, ['volume24h', 'usdVolume24h', 'turnover24h', 'volume']);
    if (Number.isFinite(volume)) {
        metrics.push({ label: '📊 Volume 24h', value: volume });
    }

    if (actionKey === 'price_info') {
        const high24h = pickOkxNumeric(entry, ['high24h', 'priceHigh24h', 'highestPrice24h', 'high']);
        if (Number.isFinite(high24h)) {
            metrics.push({ label: '🚀 24h High', value: high24h });
        }
        const low24h = pickOkxNumeric(entry, ['low24h', 'priceLow24h', 'lowestPrice24h', 'low']);
        if (Number.isFinite(low24h)) {
            metrics.push({ label: '📉 24h Low', value: low24h });
        }
        const volume30d = pickOkxNumeric(entry, ['volume30d', 'usdVolume30d', 'thirtyDayVolume', 'volume30Days', 'turnover30d']);
        if (Number.isFinite(volume30d)) {
            metrics.push({ label: '📦 Volume (30d)', value: volume30d });
        }
    }

    const liquidity = pickOkxNumeric(entry, ['liquidity', 'liquidityUsd', 'usdLiquidity']);
    if (Number.isFinite(liquidity)) {
        metrics.push({ label: '💦 Liquidity', value: liquidity });
    }

    const marketCap = pickOkxNumeric(entry, ['marketCap', 'marketCapUsd', 'fdvUsd', 'fullyDilutedMarketCap']);
    if (Number.isFinite(marketCap)) {
        metrics.push({ label: '🏦 Market cap', value: marketCap });
    }

    const timestamp = entry.ts || entry.timestamp || entry.time;
    const timestampLabel = formatWalletTokenTimestamp(timestamp);
    if (timestampLabel) {
        metrics.push({ label: '🕒 Timestamp', value: timestampLabel });
    }

    const source = entry.source || entry.market || entry.venue;
    if (source) {
        metrics.push({ label: '🔗 Source', value: source });
    }

    return metrics;
}

function buildWalletTokenPriceInfoMetrics(entry) {
    const metrics = [];
    if (!entry) {
        return metrics;
    }

    const timestamp = entry.time || entry.ts || entry.timestamp;
    const label = formatWalletTokenTimestamp(timestamp);
    if (label) {
        metrics.push({ label: '⏰ Time', value: label });
    }

    const price = entry.price || entry.latestPrice;
    if (price !== undefined && price !== null) {
        metrics.push({ label: '💰 Price', value: `${price} USD` });
    }

    const marketCap = pickOkxNumeric(entry, ['marketCap']);
    if (Number.isFinite(marketCap)) {
        metrics.push({ label: '🪙 Market cap', value: marketCap });
    }

    if (entry.minPrice !== undefined && entry.minPrice !== null) {
        metrics.push({ label: '📉 24h Low', value: entry.minPrice });
    }

    if (entry.maxPrice !== undefined && entry.maxPrice !== null) {
        metrics.push({ label: '🚀 24h High', value: entry.maxPrice });
    }

    const tradeNum = pickOkxNumeric(entry, ['tradeNum']);
    if (Number.isFinite(tradeNum)) {
        metrics.push({ label: '🔁 Trades (24h)', value: tradeNum });
    }

    const changeKeys = [
        ['priceChange5M', 'priceChange5m'],
        ['priceChange1H', 'priceChange1h'],
        ['priceChange4H', 'priceChange4h'],
        ['priceChange24H', 'priceChange24h']
    ];
    for (const pair of changeKeys) {
        for (const key of pair) {
            if (entry[key] !== undefined && entry[key] !== null) {
                metrics.push({ label: `📈 ${key.replace('priceChange', '')}`, value: `${entry[key]}%` });
                break;
            }
        }
    }

    const volumeKeys = [
        ['volume5M', 'volume5m'],
        ['volume1H', 'volume1h'],
        ['volume4H', 'volume4h'],
        ['volume24H', 'volume24h']
    ];
    for (const pair of volumeKeys) {
        for (const key of pair) {
            const volume = pickOkxNumeric(entry, [key]);
            if (Number.isFinite(volume)) {
                metrics.push({ label: `📊 ${key.replace('volume', 'Vol ')}`, value: volume });
                break;
            }
        }
    }

    const txKeys = [
        ['txs5M', 'txs5m'],
        ['txs1H', 'txs1h'],
        ['txs4H', 'txs4h'],
        ['txs24H', 'txs24h']
    ];
    for (const pair of txKeys) {
        for (const key of pair) {
            const txs = pickOkxNumeric(entry, [key]);
            if (Number.isFinite(txs)) {
                metrics.push({ label: `🧾 ${key.replace('txs', 'Txs ')}`, value: txs });
                break;
            }
        }
    }

    const circSupply = pickOkxNumeric(entry, ['circSupply', 'circulatingSupply']);
    if (Number.isFinite(circSupply)) {
        metrics.push({ label: '🔄 Circulating supply', value: circSupply });
    }

    const liquidity = pickOkxNumeric(entry, ['liquidity']);
    if (Number.isFinite(liquidity)) {
        metrics.push({ label: '💦 Liquidity', value: liquidity });
    }

    const holders = pickOkxNumeric(entry, ['holders', 'holderCount']);
    if (Number.isFinite(holders)) {
        metrics.push({ label: '👥 Holders', value: holders });
    }

    return metrics;
}

function formatWalletTokenTimestamp(value) {
    if (value === undefined || value === null) {
        return null;
    }

    let numeric = null;
    if (typeof value === 'number') {
        numeric = value;
    } else if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^-?\d+$/.test(trimmed)) {
            numeric = Number(trimmed);
        } else {
            return trimmed;
        }
    } else {
        return null;
    }

    const ms = numeric > 1e12 ? numeric : numeric * 1000;
    if (!Number.isFinite(ms)) {
        return null;
    }
    return new Date(ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

function expandWalletTokenHistoryEntries(entries) {
    if (!Array.isArray(entries)) {
        return [];
    }

    const result = [];
    for (const entry of entries) {
        if (!entry) {
            continue;
        }

        if (Array.isArray(entry.prices)) {
            for (const priceRow of entry.prices) {
                if (priceRow) {
                    result.push(priceRow);
                }
            }
            continue;
        }

        result.push(entry);
    }

    return result;
}

function resampleWalletTokenHistoryEntries(entries, targetPeriod) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return [];
    }

    const normalizedTarget = normalizeWalletTokenHistoryPeriod(targetPeriod);
    const bucketMs = getWalletTokenHistoryBucketMs(normalizedTarget);
    const requestPeriod = resolveWalletTokenHistoryRequestPeriod(normalizedTarget);
    const requestPeriodMs = getWalletTokenHistoryRequestPeriodMs(requestPeriod);

    if (!bucketMs || !requestPeriodMs || bucketMs <= requestPeriodMs) {
        return entries.slice();
    }

    const buckets = new Map();
    for (const entry of entries) {
        const timestamp = getWalletTokenHistoryTimestampValue(entry);
        if (!Number.isFinite(timestamp)) {
            continue;
        }
        const bucketKey = Math.floor(timestamp / bucketMs);
        const existing = buckets.get(bucketKey);
        if (!existing || timestamp > existing.timestamp) {
            buckets.set(bucketKey, { entry, timestamp });
        }
    }

    const aggregated = [];
    for (const value of buckets.values()) {
        if (value?.entry) {
            aggregated.push(value.entry);
        }
    }

    return aggregated;
}

function sortWalletTokenHistoryEntries(entries) {
    if (!Array.isArray(entries)) {
        return [];
    }

    return entries
        .slice()
        .sort((a, b) => {
            const timestampA = getWalletTokenHistoryTimestampValue(a);
            const timestampB = getWalletTokenHistoryTimestampValue(b);

            if (timestampA === null && timestampB === null) {
                return 0;
            }
            if (timestampA === null) {
                return 1;
            }
            if (timestampB === null) {
                return -1;
            }

            return timestampB - timestampA;
        });
}

function getWalletTokenHistoryTimestampRaw(row) {
    if (!row) {
        return null;
    }

    if (Array.isArray(row)) {
        return row.length > 0 ? row[0] : null;
    }

    return row.ts ?? row.timestamp ?? row.time ?? row.date ?? null;
}

function getWalletTokenHistoryTimestampValue(row) {
    const raw = getWalletTokenHistoryTimestampRaw(row);
    if (raw === undefined || raw === null) {
        return null;
    }

    if (typeof raw === 'number') {
        return Number.isFinite(raw) ? raw : null;
    }

    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) {
            return null;
        }

        const numeric = Number(trimmed);
        if (Number.isFinite(numeric)) {
            return numeric;
        }

        const parsed = Date.parse(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function getWalletTokenHistoryPriceText(row) {
    if (!row) {
        return null;
    }

    if (Array.isArray(row)) {
        const candidate = row[1] ?? row[2];
        if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
            return String(candidate).trim();
        }
    }

    const fields = ['price', 'value', 'indexPrice', 'close', 'avgPrice'];
    for (const field of fields) {
        if (row[field] !== undefined && row[field] !== null) {
            const text = String(row[field]).trim();
            if (text) {
                return text;
            }
        }
    }

    return null;
}

function countDistinctWalletTokenHistoryPrices(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return 0;
    }

    const seen = new Set();
    for (const entry of entries) {
        const priceText = getWalletTokenHistoryPriceText(entry);
        if (priceText !== null) {
            seen.add(priceText);
        }
    }

    return seen.size;
}

function formatWalletTokenHistoryEntry(row, previousRow, lang) {
    if (!row) {
        return null;
    }

    const timestampRaw = getWalletTokenHistoryTimestampRaw(row);
    const label = formatWalletTokenTimestamp(timestampRaw) || timestampRaw;
    const priceText = getWalletTokenHistoryPriceText(row);

    if (!label && priceText === null) {
        return null;
    }

    let deltaSuffix = '';
    if (previousRow) {
        const previousPriceText = getWalletTokenHistoryPriceText(previousRow);
        if (priceText !== null && previousPriceText !== null) {
            const deltaValue = subtractDecimalStrings(priceText, previousPriceText);
            if (deltaValue !== null) {
                let normalizedDelta = deltaValue;
                if (!normalizedDelta.startsWith('-') && normalizedDelta !== '0') {
                    normalizedDelta = `+${normalizedDelta}`;
                }
                const deltaLabel = t(lang || defaultLang, 'wallet_token_action_history_delta', { delta: normalizedDelta });
                if (deltaLabel) {
                    deltaSuffix = ` (${deltaLabel})`;
                }
            }
        }
    }

    const priceDisplay = priceText !== null ? priceText : '—';
    return label ? `${label}: ${priceDisplay}${deltaSuffix}` : `${priceDisplay}${deltaSuffix}`;
}

function formatWalletTokenPriceInfoEntry(row, index = 0) {
    if (!row) {
        return null;
    }

    const timestamp = row.time || row.ts || row.timestamp;
    const label = formatWalletTokenTimestamp(timestamp) || 'Snapshot';
    const price = row.price || row.latestPrice;
    const marketCap = pickOkxNumeric(row, ['marketCap']);
    const volume24h = pickOkxNumeric(row, ['volume24H', 'volume24h']);
    const liquidity = pickOkxNumeric(row, ['liquidity']);
    const holders = pickOkxNumeric(row, ['holders', 'holderCount']);

    const parts = [];
    if (price !== undefined && price !== null) {
        parts.push(`Price ${price} USD`);
    }
    if (Number.isFinite(marketCap)) {
        parts.push(`MC ${marketCap}`);
    }
    if (Number.isFinite(volume24h)) {
        parts.push(`Vol24h ${volume24h}`);
    }
    if (Number.isFinite(liquidity)) {
        parts.push(`Liq ${liquidity}`);
    }
    if (Number.isFinite(holders)) {
        parts.push(`Holders ${holders}`);
    }

    return `${index + 1}. ${label}${parts.length > 0 ? ` — ${parts.join(' | ')}` : ''}`;
}

function formatWalletTokenCandleEntry(row) {
    if (!row) {
        return null;
    }

    let timestamp;
    let open;
    let high;
    let low;
    let close;
    let volume;

    if (Array.isArray(row)) {
        [timestamp, open, high, low, close, volume] = row;
    } else {
        timestamp = row.ts || row.timestamp || row.time;
        open = row.open || row.o;
        high = row.high || row.h;
        low = row.low || row.l;
        close = row.close || row.c;
        volume = row.volume || row.v;
    }

    const label = formatWalletTokenTimestamp(timestamp) || timestamp;
    const parts = [
        `O ${open ?? '—'}`,
        `H ${high ?? '—'}`,
        `L ${low ?? '—'}`,
        `C ${close ?? '—'}`
    ];
    if (volume !== undefined && volume !== null) {
        parts.push(`V ${volume}`);
    }

    return label ? `${label}: ${parts.join(' / ')}` : parts.join(' / ');
}

function buildWalletTokenTokenInfoEntries(entry) {
    if (!entry || typeof entry !== 'object') {
        return [];
    }

    return Object.keys(entry)
        .sort()
        .map((key) => {
            const value = formatWalletTokenTokenInfoValue(entry[key]);
            if (value === null) {
                return null;
            }
            return `${key}: ${value}`;
        })
        .filter(Boolean);
}

function formatWalletTokenTokenInfoValue(value) {
    if (value === undefined) {
        return null;
    }
    if (value === null) {
        return '—';
    }
    if (typeof value === 'object') {
        try {
            const serialized = JSON.stringify(value);
            if (serialized.length > 300) {
                return `${serialized.slice(0, 297)}…`;
            }
            return serialized;
        } catch (error) {
            return String(value);
        }
    }
    return String(value);
}

function formatWalletTokenHolderEntry(row, index = 0) {
    if (!row) {
        return null;
    }
    const address =
        row.address || row.walletAddress || row.holderAddress || row.holderWalletAddress;
    const normalizedAddress = normalizeAddressSafe(address) || address;
    const addressHtml = normalizedAddress ? formatCopyableValueHtml(normalizedAddress) : null;
    const amount = row.amount || row.balance || row.quantity || row.holdAmount || row.holding;
    const percent = pickOkxNumeric(row, ['percentage', 'percent', 'ratio', 'share']);
    const usdValue = pickOkxNumeric(row, ['usdValue', 'valueUsd', 'holdingValueUsd', 'usd']);
    const lines = [];
    const rank = index + 1;
    lines.push('—'.repeat(28));
    if (addressHtml) {
        lines.push(`🏦 #${rank} — ${addressHtml}`);
    } else {
        lines.push(`🏦 #${rank} — Wallet`);
    }

    if (amount !== undefined && amount !== null) {
        lines.push(`💰 Hold: ${amount}`);
    }
    if (Number.isFinite(percent)) {
        lines.push(`📊 Tỷ lệ: ${percent}%`);
    }
    if (Number.isFinite(usdValue)) {
        lines.push(`💵 USD: ${usdValue}`);
    }

    return lines.join('\n');
}

function formatWalletTokenTradeEntry(row, index = 0) {
    if (!row) {
        return null;
    }

    let timestamp;
    let price;
    let amount;
    let side;
    let maker;
    let taker;
    let volume;
    let dexName;
    let txHashUrl;

    if (Array.isArray(row)) {
        [timestamp, price, amount, side] = row;
    } else {
        timestamp = row.ts || row.timestamp || row.time;
        price = row.price || row.fillPrice || row.tradePrice;
        amount = row.amount || row.size || row.qty || row.quantity;
        side = row.side || row.direction || row.type;
        volume = row.volume;
        dexName = row.dexName || row.dex;
        txHashUrl = row.txHashUrl || row.txUrl;
        maker = row.maker
            || row.makerAddress
            || row.buyerAddress
            || row.buyer
            || row.from
            || row.fromAddress
            || row.addressFrom
            || row.traderAddress
            || row.userAddress;
        taker = row.taker
            || row.takerAddress
            || row.sellerAddress
            || row.seller
            || row.to
            || row.toAddress
            || row.addressTo
            || row.counterpartyAddress;
    }

    const label = formatWalletTokenTimestamp(timestamp) || timestamp || 'Trade';
    const sideLabel = side ? String(side).toUpperCase() : null;
    const detailParts = [];
    if (sideLabel) {
        detailParts.push(sideLabel);
    }
    if (dexName) {
        detailParts.push(`DEX ${dexName}`);
    }
    if (amount !== undefined && amount !== null) {
        detailParts.push(`Amount ${amount}`);
    }
    if (price !== undefined && price !== null) {
        detailParts.push(`Price ${price}`);
    }
    if (volume !== undefined && volume !== null) {
        detailParts.push(`USD ${volume}`);
    }

    const normalizedMaker = normalizeAddressSafe(maker) || maker;
    const normalizedTaker = normalizeAddressSafe(taker) || taker;
    const makerHtml = normalizedMaker ? formatCopyableValueHtml(normalizedMaker) : null;
    const takerHtml = normalizedTaker ? formatCopyableValueHtml(normalizedTaker) : null;
    const addressParts = [];
    if (makerHtml) {
        addressParts.push(`👤 From: ${makerHtml}`);
    }
    if (takerHtml) {
        addressParts.push(`🎯 To: ${takerHtml}`);
    }

    const txHash = row.txHash || row.transactionHash || row.hash || row.txid;

    const changed = row.changedTokenInfo || row.changedTokenInfos;
    const changeLines = [];
    if (Array.isArray(changed)) {
        for (const info of changed) {
            if (!info) continue;
            const symbol = info.tokenSymbol || info.symbol;
            const infoAmount = info.amount;
            const infoAddress = info.tokenContractAddress;
            const parts = [];
            if (symbol) parts.push(symbol);
            if (infoAmount !== undefined && infoAmount !== null) {
                parts.push(`Amt ${infoAmount}`);
            }
            if (infoAddress) {
                const contractHtml = formatCopyableValueHtml(infoAddress) || infoAddress;
                parts.push(`Contract ${contractHtml}`);
            }
            if (parts.length > 0) {
                changeLines.push(`   • ${parts.join(' | ')}`);
            }
        }
    }

    const lines = [];
    lines.push('—'.repeat(28));
    const header = detailParts.length > 0 ? ` — ${detailParts.join(' | ')}` : '';
    lines.push(`💱 Trade #${index + 1}: ${label}${header}`);
    if (addressParts.length > 0) {
        lines.push(addressParts.join(' / '));
    }
    if (txHashUrl) {
        lines.push(`🔗 Tx: ${formatCopyableValueHtml(txHashUrl) || txHashUrl}`);
    } else if (txHash) {
        lines.push(`🔗 Tx: ${formatCopyableValueHtml(txHash) || txHash}`);
    }
    if (changeLines.length > 0) {
        lines.push(...changeLines.map((line) => line.replace('•', '📦')));
    }

    return lines.join('\n');
}

function resolveKnownTokenAddress(tokenKey) {
    if (!tokenKey) {
        return null;
    }
    const key = tokenKey.toLowerCase();
    if (key === 'banmao' && OKX_BANMAO_TOKEN_ADDRESS) {
        return OKX_BANMAO_TOKEN_ADDRESS;
    }
    if (OKX_OKB_SYMBOL_KEYS.includes(key) && OKX_OKB_TOKEN_ADDRESSES.length > 0) {
        return normalizeOkxConfigAddress(OKX_OKB_TOKEN_ADDRESSES[0]);
    }
    return null;
}

function resolveRegisteredTokenAddress(tokenRecord) {
    if (!tokenRecord || typeof tokenRecord !== 'object') {
        return null;
    }
    if (tokenRecord.tokenAddress) {
        return normalizeOkxConfigAddress(tokenRecord.tokenAddress) || tokenRecord.tokenAddress;
    }
    return resolveKnownTokenAddress(tokenRecord.tokenKey);
}

function formatFiatValue(value, options = {}) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return null;
    }
    const minimumFractionDigits = Number.isFinite(options.minimumFractionDigits)
        ? options.minimumFractionDigits
        : 2;
    const maximumFractionDigits = Number.isFinite(options.maximumFractionDigits)
        ? options.maximumFractionDigits
        : Math.max(minimumFractionDigits, 2);
    return numeric.toLocaleString('en-US', { minimumFractionDigits, maximumFractionDigits });
}

async function getTokenPriceInfo(tokenAddress, tokenKey) {
    const normalized = normalizeOkxConfigAddress(tokenAddress) || tokenAddress;
    if (!normalized) {
        return null;
    }

    const cacheKey = normalized.toLowerCase();
    const now = Date.now();
    const cached = tokenPriceCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        return cached.value;
    }

    try {
        const snapshot = await fetchTokenMarketSnapshot({ tokenAddress: normalized });
        const value = snapshot
            ? {
                priceUsd: Number.isFinite(snapshot.price) ? Number(snapshot.price) : null,
                priceOkb: Number.isFinite(snapshot.priceOkb) ? Number(snapshot.priceOkb) : null,
                okbUsd: Number.isFinite(snapshot.okbUsd) ? Number(snapshot.okbUsd) : null,
                source: snapshot.source || 'OKX'
            }
            : null;
        tokenPriceCache.set(cacheKey, { value, expiresAt: now + TOKEN_PRICE_CACHE_TTL });
        return value;
    } catch (error) {
        console.warn(`[WalletPrice] Failed to load price for ${tokenKey || tokenAddress}: ${error.message}`);
        tokenPriceCache.set(cacheKey, { value: null, expiresAt: now + 30 * 1000 });
        return null;
    }
}

async function buildUnregisterMenu(lang, chatId) {
    const entries = await loadWalletOverviewEntries(chatId);
    if (!entries || entries.length === 0) {
        return {
            text: t(lang, 'unregister_empty'),
            replyMarkup: null
        };
    }

    const lines = [t(lang, 'unregister_header')];
    const inline_keyboard = [];
    for (const entry of entries) {
        const walletAddr = entry.address;
        const shortAddr = shortenAddress(walletAddr);
        inline_keyboard.push([{ text: `🧹 ${shortAddr}`, callback_data: `wallet_remove|wallet|${walletAddr}` }]);
    }
    inline_keyboard.push([{ text: `🔥🔥 ${t(lang, 'unregister_all')} 🔥🔥`, callback_data: 'wallet_remove|all' }]);

    const replyMarkup = appendCloseButton({ inline_keyboard }, lang, { backCallbackData: 'wallet_overview' });

    return {
        text: lines.join('\n'),
        replyMarkup
    };
}

function parseRegisterPayload(rawText) {
    if (!rawText || typeof rawText !== 'string') {
        return null;
    }

    const trimmed = rawText.trim();
    if (!trimmed) {
        return null;
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length < 1) {
        return null;
    }

    const wallet = normalizeAddressSafe(parts[0]);
    if (!wallet) {
        return null;
    }

    return { wallet, tokens: [] };
}

const HELP_COMMAND_DETAILS = {
    start: { command: '/start', icon: '🚀', descKey: 'help_command_start' },
    register: { command: '/register', icon: '📝', descKey: 'help_command_register' },
    mywallet: { command: '/mywallet', icon: '💼', descKey: 'help_command_mywallet' },
    rules: { command: '/rules', icon: '📜', descKey: 'help_command_rules' },
    donate: { command: '/donate', icon: '🎁', descKey: 'help_command_donate' },
    okxchains: { command: '/okxchains', icon: '🧭', descKey: 'help_command_okxchains' },
    okx402status: { command: '/okx402status', icon: '🔐', descKey: 'help_command_okx402status' },
    unregister: { command: '/unregister', icon: '🗑️', descKey: 'help_command_unregister' },
    language: { command: '/language', icon: '🌐', descKey: 'help_command_language' },
    help: { command: '/help', icon: '❓', descKey: 'help_command_help' },
    checkin: { command: '/checkin', icon: '✅', descKey: 'help_command_checkin' },
    topcheckin: { command: '/topcheckin', icon: '🏆', descKey: 'help_command_topcheckin' },
    admin: { command: '/admin', icon: '🛠️', descKey: 'help_command_admin' },
    checkinadmin: { command: '/checkinadmin', icon: '🛡️', descKey: 'help_command_checkin_admin' }
};

const HELP_GROUP_DETAILS = {
    onboarding: {
        icon: '🚀',
        titleKey: 'help_group_onboarding_title',
        descKey: 'help_group_onboarding_desc',
        commands: ['start', 'help']
    },
    account: {
        icon: '🆔',
        titleKey: 'help_group_account_title',
        descKey: 'help_group_account_desc',
        commands: ['register', 'mywallet', 'unregister']
    },
    language: {
        icon: '🌐',
        titleKey: 'help_group_language_title',
        descKey: 'help_group_language_desc',
        commands: ['language']
    },
    insights: {
        icon: '📈',
        titleKey: 'help_group_insights_title',
        descKey: 'help_group_insights_desc',
        commands: ['rules', 'okxchains', 'okx402status']
    },
    support: {
        icon: '🎁',
        titleKey: 'help_group_support_title',
        descKey: 'help_group_support_desc',
        commands: ['donate']
    },
    checkin: {
        icon: '✅',
        titleKey: 'help_group_checkin_title',
        descKey: 'help_group_checkin_desc',
        commands: ['checkin', 'topcheckin']
    },
    admin_root: {
        icon: '🛠️',
        titleKey: 'help_group_admin_root_title',
        descKey: 'help_group_admin_root_desc',
        commands: ['admin']
    },
    admin_checkin: {
        icon: '🧭',
        titleKey: 'help_group_admin_checkin_title',
        descKey: 'help_group_admin_checkin_desc',
        commands: ['checkinadmin']
    }
};

const ADMIN_SUBCOMMANDS = [
    { command: '/admin mute [user] [time] [reason]', descKey: 'admin_cmd_desc_mute' },
    { command: '/admin warn [user] [reason]', descKey: 'admin_cmd_desc_warn' },
    { command: '/admin warnings [user]', descKey: 'admin_cmd_desc_warnings' },
    { command: '/admin purge [count]', descKey: 'admin_cmd_desc_purge' },
    { command: '/admin set_captcha (on/off)', descKey: 'admin_cmd_desc_set_captcha' },
    { command: '/admin set_rules [message]', descKey: 'admin_cmd_desc_set_rules' },
    { command: '/admin add_blacklist [word]', descKey: 'admin_cmd_desc_add_blacklist' },
    { command: '/admin remove_blacklist [word]', descKey: 'admin_cmd_desc_remove_blacklist' },
    { command: '/admin set_xp [user] [amount]', descKey: 'admin_cmd_desc_set_xp' },
    { command: '/admin update_info', descKey: 'admin_cmd_desc_update_info' },
    { command: '/admin status', descKey: 'admin_cmd_desc_status' },
    { command: '/admin toggle_predict', descKey: 'admin_cmd_desc_toggle_predict' },
    { command: '/admin set_xp_react (on/off)', descKey: 'admin_cmd_desc_set_xp_react' },
    { command: '/admin whale', descKey: 'admin_cmd_desc_whale' },
    { command: '/admin draw [prize] [rules]', descKey: 'admin_cmd_desc_draw' },
    { command: '/admin review_memes', descKey: 'admin_cmd_desc_review_memes' },
    { command: '/admin approve [id]', descKey: 'admin_cmd_desc_approve' },
    { command: '/admin reject [id]', descKey: 'admin_cmd_desc_reject' },
    { command: '/admin announce [message]', descKey: 'admin_cmd_desc_announce' },
    { command: '/admin track [address] [name]', descKey: 'admin_cmd_desc_track' }
];

const HELP_USER_SECTIONS = [
    {
        titleKey: 'help_section_general_title',
        groups: ['onboarding', 'account', 'language', 'insights', 'support']
    },
    {
        titleKey: 'help_section_checkin_title',
        groups: ['checkin']
    }
];

const HELP_ADMIN_SECTIONS = [
    {
        titleKey: 'help_section_admin_title',
        groups: ['admin_root', 'admin_checkin']
    }
];

function wrapText(input, width) {
    const raw = typeof input === 'string' ? input.trim() : '';
    if (!raw) {
        return [''];
    }

    if (raw.length <= width) {
        return [raw];
    }

    const words = raw.split(/\s+/);
    const lines = [];
    let current = '';

    for (const word of words) {
        const proposed = current ? `${current} ${word}` : word;
        if (proposed.length <= width) {
            current = proposed;
        } else {
            if (current) {
                lines.push(current);
            }
            if (word.length > width) {
                lines.push(word);
                current = '';
            } else {
                current = word;
            }
        }
    }

    if (current) {
        lines.push(current);
    }

    return lines;
}

function buildHelpRows(lang, groupKeys) {
    const entries = [];
    let commandWidth = 0;
    const maxDescWidth = 54;

    for (const key of groupKeys) {
        const detail = HELP_GROUP_DETAILS[key];
        if (!detail) {
            continue;
        }
        const title = t(lang, detail.titleKey);
        const commandLabel = `${detail.icon} ${title}`;
        commandWidth = Math.max(commandWidth, commandLabel.length);
        const descriptionParts = [t(lang, detail.descKey)];
        const commandList = (detail.commands || [])
            .map((cmdKey) => HELP_COMMAND_DETAILS[cmdKey]?.command)
            .filter(Boolean)
            .join(', ');
        if (commandList) {
            descriptionParts.push(t(lang, 'help_group_command_hint', { commands: commandList }));
        }
        const description = descriptionParts.filter(Boolean).join(' ');
        const wrappedDescription = wrapText(description, maxDescWidth);
        entries.push({ commandLabel, descriptionLines: wrappedDescription });
    }

    if (entries.length === 0) {
        return '';
    }

    const descWidth = Math.min(maxDescWidth, Math.max(...entries.map((entry) => entry.descriptionLines.reduce((max, line) => Math.max(max, line.length), 0)), 10));
    const commandColWidth = Math.min(28, Math.max(commandWidth, 12));
    const top = `┌─${'─'.repeat(commandColWidth)}┬─${'─'.repeat(descWidth)}┐`;
    const bottom = `└─${'─'.repeat(commandColWidth)}┴─${'─'.repeat(descWidth)}┘`;
    const separator = `├─${'─'.repeat(commandColWidth)}┼─${'─'.repeat(descWidth)}┤`;

    const lines = [top];

    entries.forEach((entry, index) => {
        entry.descriptionLines.forEach((line, lineIndex) => {
            const commandCell = lineIndex === 0 ? entry.commandLabel : '';
            const paddedCommand = commandCell.padEnd(commandColWidth, ' ');
            const paddedDesc = line.padEnd(descWidth, ' ');
            lines.push(`│ ${paddedCommand} │ ${paddedDesc} │`);
        });

        if (index < entries.length - 1) {
            lines.push(separator);
        }
    });

    lines.push(bottom);
    return `<pre>${escapeHtml(lines.join('\n'))}</pre>`;
}

function buildHelpText(lang, view = 'user') {
    const sections = view === 'admin' ? HELP_ADMIN_SECTIONS : HELP_USER_SECTIONS;
    const lines = [];

    lines.push(t(lang, 'help_header'));
    const hintKey = view === 'admin' ? 'help_admin_hint' : 'help_menu_hint';
    lines.push(`<i>${escapeHtml(t(lang, hintKey))}</i>`);

    for (const section of sections) {
        const table = buildHelpRows(lang, section.groups || []);
        if (!table) {
            continue;
        }

        lines.push('', `<b>${escapeHtml(t(lang, section.titleKey))}</b>`, table);
    }

    if (view === 'admin') {
        lines.push('', `<i>${escapeHtml(t(lang, 'help_admin_features'))}</i>`);
    }

    return lines.filter(Boolean).join('\n');
}

function buildDonateMessage(lang) {
    const lines = [];
    lines.push(`❤️ <b>${escapeHtml(t(lang, 'donate_title'))}</b>`);
    lines.push(`<i>${escapeHtml(t(lang, 'donate_description'))}</i>`);

    const sections = [
        {
            labelKey: 'donate_community_wallet_label',
            descKey: 'donate_community_wallet_desc',
            warningKey: 'donate_community_wallet_warning',
            address: COMMUNITY_WALLET_ADDRESS
        },
        {
            labelKey: 'donate_dead_wallet_label',
            descKey: 'donate_dead_wallet_desc',
            warningKey: 'donate_dead_wallet_warning',
            address: DEAD_WALLET_ADDRESS
        }
    ];

    for (const section of sections) {
        lines.push('');
        const label = t(lang, section.labelKey);
        lines.push(`<b>${escapeHtml(label)}</b>`);

        if (section.address) {
            lines.push(`<code>${escapeHtml(section.address)}</code>`);
        } else {
            lines.push(`<i>${escapeHtml(t(lang, 'donate_wallet_missing', { label }))}</i>`);
        }

        if (section.descKey) {
            lines.push(`<i>${escapeHtml(t(lang, section.descKey))}</i>`);
        }
        if (section.warningKey) {
            lines.push(`<i>${escapeHtml(t(lang, section.warningKey))}</i>`);
        }
    }

    lines.push('', `<i>${escapeHtml(t(lang, 'donate_footer'))}</i>`);
    return lines.filter(Boolean).join('\n');
}

function resolveHelpGroups(view = 'user') {
    const sections = view === 'admin' ? HELP_ADMIN_SECTIONS : HELP_USER_SECTIONS;
    return sections.flatMap((section) => (section.groups || []).filter((key) => Boolean(HELP_GROUP_DETAILS[key])));
}

function getDefaultHelpGroup(view = 'user') {
    const groups = resolveHelpGroups(view);
    return groups.length > 0 ? groups[0] : null;
}

function buildHelpKeyboard(lang, view = 'user', selectedGroup = null) {
    const sections = view === 'admin' ? HELP_ADMIN_SECTIONS : HELP_USER_SECTIONS;
    const validGroups = resolveHelpGroups(view);
    const activeGroup = validGroups.includes(selectedGroup) ? selectedGroup : (validGroups[0] || null);
    const inline_keyboard = [];

    for (const section of sections) {
        const row = [];
        for (const groupKey of section.groups || []) {
            const detail = HELP_GROUP_DETAILS[groupKey];
            if (!detail) {
                continue;
            }
            const title = t(lang, detail.titleKey);
            const isActive = groupKey === activeGroup;
            const prefix = isActive ? '🔽' : '•';
            row.push({ text: `${prefix} ${detail.icon} ${title}`, callback_data: `help_group|${view}|${groupKey}` });
        }
        if (row.length > 0) {
            inline_keyboard.push(row);
        }
    }

    const activeDetail = activeGroup ? HELP_GROUP_DETAILS[activeGroup] : null;
    const commands = activeDetail ? (activeDetail.commands || []).filter((key) => HELP_COMMAND_DETAILS[key]) : [];
    if (commands.length > 0) {
        inline_keyboard.push([{ text: `⬇️ ${t(lang, 'help_child_command_hint')}`, callback_data: 'help_separator' }]);
        for (let i = 0; i < commands.length; i += 2) {
            const row = [];
            for (let j = i; j < Math.min(i + 2, commands.length); j += 1) {
                const key = commands[j];
                const detail = HELP_COMMAND_DETAILS[key];
                if (!detail) {
                    continue;
                }
                row.push({ text: `${detail.icon} ${detail.command}`, callback_data: `help_cmd|${key}` });
            }
            if (row.length > 0) {
                inline_keyboard.push(row);
            }
        }
    }

    if (view === 'admin') {
        inline_keyboard.push([{ text: t(lang, 'help_button_user'), callback_data: 'help_view|user' }]);
    } else {
        inline_keyboard.push([{ text: t(lang, 'help_button_admin'), callback_data: 'help_view|admin' }]);
    }

    inline_keyboard.push([{ text: t(lang, 'help_button_close'), callback_data: 'help_close' }]);
    return { inline_keyboard };
}

function buildAdminCommandCheatsheet(lang) {
    const lines = [t(lang, 'admin_command_list_title')];
    const hint = t(lang, 'admin_command_list_hint');
    if (hint) {
        lines.push(hint);
    }

    lines.push('', t(lang, 'admin_command_admin_header'));
    for (const action of ADMIN_SUBCOMMANDS) {
        lines.push(`${ADMIN_DETAIL_BULLET}${action.command} — ${t(lang, action.descKey)}`);
    }

    lines.push('', t(lang, 'admin_command_checkin_header'));
    lines.push(`${ADMIN_DETAIL_BULLET}/checkinadmin — ${t(lang, 'admin_cmd_desc_checkinadmin')}`);

    const inline_keyboard = [];
    inline_keyboard.push([{ text: t(lang, 'admin_command_button_admin'), callback_data: 'admin_cmd|about_admin' }]);
    inline_keyboard.push([{ text: t(lang, 'admin_command_button_checkin'), callback_data: 'admin_cmd|checkinadmin' }]);

    for (let i = 0; i < ADMIN_SUBCOMMANDS.length; i += 2) {
        const row = [];
        for (let j = i; j < Math.min(i + 2, ADMIN_SUBCOMMANDS.length); j += 1) {
            const cmd = ADMIN_SUBCOMMANDS[j];
            row.push({ text: cmd.command, callback_data: `admin_cmd|${j}` });
        }
        if (row.length > 0) {
            inline_keyboard.push(row);
        }
    }

    inline_keyboard.push([{ text: t(lang, 'help_button_close'), callback_data: 'admin_cmd_close' }]);

    return { text: lines.join('\n'), replyMarkup: { inline_keyboard } };
}

function buildSyntheticCommandMessage(query) {
    const baseMessage = query.message || {};
    const synthetic = {
        chat: baseMessage.chat ? { ...baseMessage.chat } : null,
        from: query.from ? { ...query.from } : null,
        message_id: baseMessage.message_id,
        message_thread_id: baseMessage.message_thread_id,
        reply_to_message: baseMessage.reply_to_message || null,
        date: Math.floor(Date.now() / 1000)
    };

    if (synthetic.chat && typeof synthetic.chat.id === 'number') {
        synthetic.chat.id = synthetic.chat.id.toString();
    }

    return synthetic;
}

function getHelpMessageStateKey(chatId, messageId) {
    if (!chatId || !messageId) {
        return null;
    }
    return `${chatId}:${messageId}`;
}

function saveHelpMessageState(chatId, messageId, state) {
    const key = getHelpMessageStateKey(chatId, messageId);
    if (!key) {
        return;
    }
    helpMenuStates.set(key, state);
}

function getHelpMessageState(chatId, messageId) {
    const key = getHelpMessageStateKey(chatId, messageId);
    return key ? helpMenuStates.get(key) : null;
}

function clearHelpMessageState(chatId, messageId) {
    const key = getHelpMessageStateKey(chatId, messageId);
    if (!key) {
        return;
    }
    helpMenuStates.delete(key);
}

function extractThreadId(source) {
    if (!source) {
        return null;
    }

    if (Object.prototype.hasOwnProperty.call(source, 'message_thread_id') && source.message_thread_id !== undefined && source.message_thread_id !== null) {
        return source.message_thread_id;
    }

    if (source.message && Object.prototype.hasOwnProperty.call(source.message, 'message_thread_id') && source.message.message_thread_id !== undefined && source.message.message_thread_id !== null) {
        return source.message.message_thread_id;
    }

    return null;
}

function buildThreadedOptions(source, options = {}) {
    const threadId = extractThreadId(source);
    if (threadId === undefined || threadId === null) {
        return { ...options };
    }

    return { ...options, message_thread_id: threadId };
}

async function sendMessageRespectingThread(chatId, source, text, options = {}) {
    const threadedOptions = buildThreadedOptions(source, options);

    try {
        return await bot.sendMessage(chatId, text, threadedOptions);
    } catch (error) {
        const errorCode = error?.response?.body?.error_code;
        const description = error?.response?.body?.description || '';
        const hasThread = Object.prototype.hasOwnProperty.call(threadedOptions, 'message_thread_id');

        if (hasThread && errorCode === 400) {
            const lowered = description.toLowerCase();
            const shouldFallback =
                lowered.includes('message thread not found') ||
                lowered.includes('topic is closed') ||
                lowered.includes('forum topic is closed') ||
                lowered.includes('forum topics are disabled') ||
                lowered.includes('forum is disabled') ||
                lowered.includes('wrong message thread id specified') ||
                lowered.includes("can't send messages to the topic") ||
                lowered.includes('not enough rights to send in the topic') ||
                lowered.includes('not enough rights to send messages in the topic');

            if (shouldFallback) {
                console.warn(`[ThreadFallback] Gửi tin nhắn tới thread ${threadedOptions.message_thread_id} thất bại (${description}). Thử gửi không chỉ định thread.`);
                const fallbackOptions = { ...options };
                return bot.sendMessage(chatId, text, fallbackOptions);
            }
        }

        throw error;
    }
}

function sendReply(sourceMessage, text, options = {}) {
    if (!sourceMessage || !sourceMessage.chat) {
        throw new Error('sendReply requires a message with chat information');
    }

    return sendMessageRespectingThread(sourceMessage.chat.id, sourceMessage, text, options);
}

function buildUserMention(user) {
    if (!user) {
        return { text: 'user', parseMode: null };
    }

    if (user.username) {
        return { text: `@${user.username}`, parseMode: null };
    }

    const displayName = escapeHtml(user.first_name || user.last_name || 'user');
    return {
        text: `<a href="tg://user?id=${user.id}">${displayName}</a>`,
        parseMode: 'HTML'
    };
}

function buildAdminProfileLink(userId, displayName) {
    const safeName = escapeHtml(displayName || userId?.toString() || 'user');
    const safeId = encodeURIComponent(userId?.toString() || '');
    return `<a href="tg://user?id=${safeId}">${safeName}</a>`;
}

function buildAdminUserIdLink(userId) {
    const safeIdText = escapeHtml(userId?.toString() || '0');
    const safeId = encodeURIComponent(userId?.toString() || '');
    return `<a href="tg://user?id=${safeId}"><code>${safeIdText}</code></a>`;
}

function formatDateForTimezone(timezone = CHECKIN_DEFAULT_TIMEZONE, date = new Date()) {
    try {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });

        return formatter.format(date);
    } catch (error) {
        console.warn(`[Checkin] Không thể format ngày cho timezone ${timezone}: ${error.message}`);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}

function formatTimeForTimezone(timezone = CHECKIN_DEFAULT_TIMEZONE, date = new Date()) {
    try {
        const formatter = new Intl.DateTimeFormat('en-GB', {
            timeZone: timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        return formatter.format(date);
    } catch (error) {
        console.warn(`[Checkin] Không thể format giờ cho timezone ${timezone}: ${error.message}`);
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }
}

function formatDateTimeForTimezone(timezone = CHECKIN_DEFAULT_TIMEZONE, timestampSeconds = null) {
    const date = timestampSeconds ? new Date(timestampSeconds * 1000) : new Date();
    const dateStr = formatDateForTimezone(timezone, date);
    const timeStr = formatTimeForTimezone(timezone, date);
    return `${dateStr} ${timeStr}`;
}

function subtractDaysFromDate(dateStr, days) {
    if (typeof dateStr !== 'string') {
        return null;
    }

    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const delta = Math.max(0, Number(days) || 0);
    const date = new Date(Date.UTC(year, month, day));
    date.setUTCDate(date.getUTCDate() - delta);
    const nextYear = date.getUTCFullYear();
    const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
    const nextDay = String(date.getUTCDate()).padStart(2, '0');
    return `${nextYear}-${nextMonth}-${nextDay}`;
}

function normalizeDateInput(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return null;
    }

    return trimmed;
}

function pickLaterDateString(valueA, valueB) {
    if (!valueA) {
        return valueB || null;
    }
    if (!valueB) {
        return valueA;
    }
    return valueA >= valueB ? valueA : valueB;
}

function calculateInclusiveDayDiff(start, end) {
    if (!start || !end) {
        return 0;
    }

    const startDate = new Date(`${start}T00:00:00Z`);
    const endDate = new Date(`${end}T00:00:00Z`);
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    return diffDays >= 0 ? diffDays + 1 : 0;
}

function getSummaryPeriodStart(settings) {
    const normalized = normalizeDateInput(settings?.summaryPeriodStart);
    return normalized || null;
}

function getSummaryWindowBounds(settings) {
    const timezone = settings?.timezone || CHECKIN_DEFAULT_TIMEZONE;
    const configuredDays = Math.max(Number(settings?.summaryWindow) || 1, 1);
    const endDate = formatDateForTimezone(timezone);
    const rollingStart = subtractDaysFromDate(endDate, configuredDays - 1) || endDate;
    const periodStart = getSummaryPeriodStart(settings);
    const startDate = pickLaterDateString(rollingStart, periodStart) || rollingStart;
    return {
        startDate,
        endDate,
        periodStart,
        configuredDays,
        rangeDays: calculateInclusiveDayDiff(startDate, endDate)
    };
}

const SCIENCE_LANGUAGE_SET = new Set([
    ...Object.keys(SCIENCE_TEMPLATES.physics || {}),
    ...Object.keys(SCIENCE_TEMPLATES.chemistry || {})
]);


function resolveScienceLang(lang = 'en') {
    if (!lang) {
        return 'en';
    }
    const normalized = lang.toLowerCase();
    if (SCIENCE_LANGUAGE_SET.has(normalized)) {
        return normalized;
    }
    const short = normalized.split('-')[0];
    if (SCIENCE_LANGUAGE_SET.has(short)) {
        return short;
    }
    return 'en';
}

function getScienceEntriesByType(category) {
    const pool = SCIENCE_ENTRIES[category];
    return Array.isArray(pool) ? pool : [];
}

function getScienceTemplate(category, lang) {
    const templates = SCIENCE_TEMPLATES[category] || {};
    return templates[lang] || templates.en || 'Which formula applies to {concept}?';
}

function renderScienceQuestion(category, entry, lang) {
    const template = getScienceTemplate(category, lang);
    const conceptText = entry?.concept?.[lang] || entry?.concept?.en || '';
    return template.replace('{concept}', conceptText);
}

function buildScienceOptionTexts(entries, correctFormula) {
    const options = new Set([correctFormula]);
    let guard = 0;
    while (options.size < 4 && guard < entries.length * 4) {
        const candidate = entries[Math.floor(Math.random() * entries.length)]?.formula;
        if (candidate) {
            options.add(candidate);
        }
        guard += 1;
    }
    while (options.size < 4) {
        options.add(`${(Math.random() * 10).toFixed(2)}`);
    }
    return shuffleArray(Array.from(options));
}

function shuffleArray(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function generateMathChallenge(lang = 'en') {
    const resolvedLang = lang || 'en';
    const operations = ['+', '-', '×', '÷'];
    const op = operations[Math.floor(Math.random() * operations.length)];
    let a = Math.floor(Math.random() * 12) + 1;
    let b = Math.floor(Math.random() * 12) + 1;
    let expression = '';
    let answer = 0;

    switch (op) {
        case '+':
            answer = a + b;
            expression = `${a} + ${b}`;
            break;
        case '-':
            if (b > a) {
                [a, b] = [b, a];
            }
            answer = a - b;
            expression = `${a} - ${b}`;
            break;
        case '×':
            answer = a * b;
            expression = `${a} × ${b}`;
            break;
        case '÷':
            answer = a;
            expression = `${a * b} ÷ ${b}`;
            break;
        default:
            answer = a + b;
            expression = `${a} + ${b}`;
            break;
    }

    const options = new Set([answer]);
    while (options.size < 4) {
        const delta = Math.floor(Math.random() * 10) + 1;
        const sign = Math.random() > 0.5 ? 1 : -1;
        const candidate = answer + sign * delta;
        if (candidate >= 0) {
            options.add(candidate);
        }
    }

    const optionArray = shuffleArray(Array.from(options));
    const correctIndex = optionArray.findIndex((value) => value === answer);
    const questionText = t(resolvedLang, 'checkin_math_question', { expression });

    return {
        type: 'math',
        question: questionText,
        options: optionArray.map((value, index) => ({
            text: value.toString(),
            isCorrect: index === correctIndex,
            index
        })),
        correctIndex
    };
}

function generateScienceChallenge(category = 'physics', lang = 'en') {
    const entries = getScienceEntriesByType(category);
    if (!entries.length) {
        return generateMathChallenge(lang);
    }
    const resolvedLang = resolveScienceLang(lang);
    const entry = entries[Math.floor(Math.random() * entries.length)];
    const questionText = renderScienceQuestion(category, entry, resolvedLang);
    const optionTexts = buildScienceOptionTexts(entries, entry.formula);
    const options = optionTexts.map((text, index) => ({
        text,
        isCorrect: text === entry.formula,
        index
    }));
    const correctIndex = options.findIndex((option) => option.isCorrect);

    return {
        type: category,
        question: questionText,
        options,
        correctIndex: correctIndex >= 0 ? correctIndex : 0
    };
}

function generateCheckinChallenge(lang = 'en', questionType = null, settings = null) {
    const resolvedType = questionType || pickQuestionType(settings);
    if (resolvedType === 'physics' || resolvedType === 'chemistry') {
        return generateScienceChallenge(resolvedType, lang);
    }
    return generateMathChallenge(lang);
}

function buildEmotionKeyboard(lang, token) {
    const rows = [];
    for (let i = 0; i < CHECKIN_EMOTIONS.length; i += 3) {
        const row = [];
        for (let j = i; j < i + 3 && j < CHECKIN_EMOTIONS.length; j++) {
            const emoji = CHECKIN_EMOTIONS[j];
            row.push({ text: emoji, callback_data: `checkin_emotion|${token}|${encodeURIComponent(emoji)}` });
        }
        rows.push(row);
    }
    rows.push([{ text: t(lang, 'checkin_button_skip'), callback_data: `checkin_emotion_skip|${token}` }]);
    return { inline_keyboard: rows };
}

function buildGoalKeyboard(lang, token) {
    const rows = [];
    for (const preset of CHECKIN_GOAL_PRESETS) {
        const text = t(lang, preset);
        rows.push([{ text, callback_data: `checkin_goal_choose|${token}|${encodeURIComponent(text)}` }]);
    }
    rows.push([
        { text: t(lang, 'checkin_goal_button_custom'), callback_data: `checkin_goal_custom|${token}` },
        { text: t(lang, 'checkin_goal_button_later'), callback_data: `checkin_goal_skip|${token}` }
    ]);
    return { inline_keyboard: rows };
}

function sanitizeGoalInput(text) {
    if (typeof text !== 'string') {
        return null;
    }

    const trimmed = text.trim();
    if (!trimmed) {
        return null;
    }

    if (trimmed.length > 200) {
        return trimmed.slice(0, 200);
    }

    return trimmed;
}

function createShortToken(prefix = 'chk') {
    const raw = uuidv4().replace(/-/g, '');
    const short = raw.slice(0, 16);
    return `${prefix}_${short}`;
}

async function getGroupCheckinSettings(chatId) {
    const chatKey = chatId.toString();
    try {
        return await db.getCheckinGroup(chatKey);
    } catch (error) {
        console.warn(`[Checkin] Không thể đọc cấu hình nhóm ${chatKey}: ${error.message}`);
        return {
            chatId: chatKey,
            checkinTime: CHECKIN_DEFAULT_TIME,
            timezone: CHECKIN_DEFAULT_TIMEZONE,
            autoMessageEnabled: 1,
            dailyPoints: 10,
            summaryWindow: 7,
            lastAutoMessageDate: null,
            autoMessageTimes: [CHECKIN_DEFAULT_TIME],
            summaryMessageEnabled: 0,
            summaryMessageTimes: []
        };
    }
}

function getLeaderboardPeriodStart(settings) {
    const normalized = normalizeDateInput(settings?.leaderboardPeriodStart);
    if (normalized) {
        return normalized;
    }

    const timezone = settings?.timezone || CHECKIN_DEFAULT_TIMEZONE;
    const today = formatDateForTimezone(timezone);
    const days = Math.max(Number(settings?.summaryWindow) || 1, 1);
    return subtractDaysFromDate(today, days - 1) || today;
}

function buildCheckinKeyboard(chatId, lang) {
    const chatKey = chatId.toString();
    return {
        inline_keyboard: [
            [{ text: t(lang, 'checkin_button_start'), callback_data: `checkin_start|${chatKey}` }],
            [{ text: t(lang, 'checkin_button_leaderboard'), callback_data: `checkin_leaderboard|${chatKey}` }],
            [{ text: t(lang, 'checkin_button_admin_menu'), callback_data: `checkin_admin|${chatKey}` }]
        ]
    };
}

function buildStartBotButton(lang, startLink) {
    if (!startLink) {
        return null;
    }

    return {
        inline_keyboard: [[{ text: t(lang, 'checkin_button_open_bot'), url: startLink }]]
    };
}

async function sendCheckinStartPrompt(sourceMessage, lang, startLink, user) {
    if (!sourceMessage?.chat?.id || !startLink) {
        return;
    }

    const isGroupChat = ['group', 'supergroup'].includes(sourceMessage.chat.type);
    const options = {
        reply_markup: buildStartBotButton(lang, startLink),
        disable_notification: true
    };

    let text = '⁣';

    if (!isGroupChat) {
        const mention = buildUserMention(user);
        text = t(lang, 'checkin_dm_failure_start', { user: mention.text });
        if (mention.parseMode) {
            options.parse_mode = mention.parseMode;
        }
    }

    const sent = await sendMessageRespectingThread(sourceMessage.chat.id, sourceMessage, text, options);
    scheduleMessageDeletion(sourceMessage.chat.id, sent.message_id, isGroupChat ? 10000 : 20000);
}

async function answerCheckinStartPrompt(query, lang, startLink) {
    const response = {
        text: t(lang, 'checkin_dm_failure_start_alert'),
        show_alert: true
    };

    if (startLink) {
        response.url = startLink;
    }

    await bot.answerCallbackQuery(query.id, response);
}

async function sendCheckinDmFailureNotice(sourceMessage, lang, user) {
    if (!sourceMessage) {
        return;
    }

    const mention = buildUserMention(user);
    const baseText = t(lang, 'checkin_error_dm_failed');
    const messageText = mention.parseMode === 'HTML'
        ? `${mention.text}\n${escapeHtml(baseText)}`
        : `${mention.text}\n${baseText}`;
    const options = mention.parseMode === 'HTML' ? { parse_mode: 'HTML' } : {};
    const sent = await sendMessageRespectingThread(sourceMessage.chat.id, sourceMessage, messageText, options);
    scheduleMessageDeletion(sourceMessage.chat.id, sent.message_id, 20000);
}

async function sendCheckinAnnouncement(chatId, { sourceMessage = null, triggeredBy = 'auto' } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const timezone = settings.timezone || CHECKIN_DEFAULT_TIMEZONE;
    const today = formatDateForTimezone(timezone);
    const lang = await resolveGroupLanguage(chatId);
    const promptText = t(lang, 'checkin_prompt_text');
    const options = { reply_markup: buildCheckinKeyboard(chatId, lang) };

    try {
        if (sourceMessage) {
            await sendMessageRespectingThread(chatId, sourceMessage, promptText, options);
        } else {
            await bot.sendMessage(chatId, promptText, options);
        }
        await db.updateAutoMessageDate(chatId, today);
        console.log(`[Checkin] Sent check-in announcement to ${chatId} (${triggeredBy}).`);
    } catch (error) {
        console.error(`[Checkin] Failed to send announcement to ${chatId}: ${error.message}`);
    }
}

async function buildSummaryAnnouncementText(chatId, settings, lang, limit = SUMMARY_BROADCAST_MAX_ROWS) {
    const { startDate, endDate, rangeDays } = getSummaryWindowBounds(settings);
    if (!startDate || !endDate || startDate > endDate) {
        return null;
    }

    const records = await db.getCheckinsInRange(chatId, startDate, endDate);
    if (!records || records.length === 0) {
        return null;
    }

    const summaryMap = new Map();
    for (const record of records) {
        const userKey = record.userId.toString();
        const stats = summaryMap.get(userKey) || { days: 0, points: 0 };
        stats.days += 1;
        stats.points += Number(record.pointsAwarded || 0);
        summaryMap.set(userKey, stats);
    }

    if (summaryMap.size === 0) {
        return null;
    }

    const sortedEntries = Array.from(summaryMap.entries())
        .sort((a, b) => {
            if (b[1].days !== a[1].days) {
                return b[1].days - a[1].days;
            }
            if (b[1].points !== a[1].points) {
                return b[1].points - a[1].points;
            }
            return Number(a[0]) - Number(b[0]);
        })
        .slice(0, limit);

    const profileCache = new Map();
    const lines = [
        `<b>${t(lang, 'checkin_summary_broadcast_header', { days: Math.max(rangeDays, 1), start: startDate, end: endDate, members: summaryMap.size })}</b>`
    ];

    for (let index = 0; index < sortedEntries.length; index += 1) {
        const [userId, stats] = sortedEntries[index];
        const profile = await resolveMemberProfile(chatId, userId, lang, profileCache);
        const safeName = `<b>${profile.link || escapeHtml(profile.displayName)}</b>`;
        const safeId = buildAdminUserIdLink(userId);
        lines.push(t(lang, 'checkin_summary_broadcast_line', {
            rank: index + 1,
            name: safeName,
            id: safeId,
            days: stats.days,
            points: stats.points
        }));
    }

    lines.push('', escapeHtml(t(lang, 'checkin_summary_broadcast_footer')));
    return lines.join('\n').trim();
}

async function sendSummaryAnnouncement(chatId, { sourceMessage = null, triggeredBy = 'auto' } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const lang = await resolveGroupLanguage(chatId);
    const summaryText = await buildSummaryAnnouncementText(chatId, settings, lang);
    if (!summaryText) {
        return false;
    }

    const options = { parse_mode: 'HTML' };

    try {
        if (sourceMessage) {
            await sendMessageRespectingThread(chatId, sourceMessage, summaryText, options);
        } else {
            await bot.sendMessage(chatId, summaryText, options);
        }
        console.log(`[Checkin] Sent summary announcement to ${chatId} (${triggeredBy}).`);
        return true;
    } catch (error) {
        console.error(`[Checkin] Failed to send summary announcement to ${chatId}: ${error.message}`);
        return false;
    }
}

async function ensureUserCanCheckin(chatId, userId, settings) {
    const timezone = settings?.timezone || CHECKIN_DEFAULT_TIMEZONE;
    const today = formatDateForTimezone(timezone);
    const attempt = await db.getCheckinAttempt(chatId, userId, today);
    if (attempt && Number(attempt.locked) === 1) {
        return { allowed: false, reason: 'locked', attempts: attempt.attempts, date: today };
    }

    const record = await db.getCheckinRecord(chatId, userId, today);
    if (record) {
        return { allowed: false, reason: 'checked', record, date: today };
    }

    return { allowed: true, date: today, attempts: attempt?.attempts || 0 };
}

async function initiateCheckinChallenge(chatId, user, { replyMessage = null } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const userId = user.id.toString();
    const userLang = await resolveNotificationLanguage(userId, user.language_code);
    const check = await ensureUserCanCheckin(chatId, userId, settings);

    if (!check.allowed) {
        if (check.reason === 'locked') {
            return { status: 'locked', userLang };
        }

        if (check.reason === 'checked') {
            return { status: 'checked', userLang };
        }
    }

    const questionType = pickQuestionType(settings);
    const challenge = generateCheckinChallenge(userLang, questionType, settings);
    const token = createShortToken('chk');
    pendingCheckinChallenges.set(token, {
        chatId: chatId.toString(),
        userId,
        timezone: settings.timezone || CHECKIN_DEFAULT_TIMEZONE,
        date: check.date,
        attempts: check.attempts || 0,
        correctIndex: challenge.correctIndex,
        questionType: challenge.type || questionType || 'math',
        settings,
        sourceMessage: replyMessage ? { chatId: replyMessage.chat?.id, messageId: replyMessage.message_id } : null
    });

    const inline_keyboard = challenge.options.map((option) => ([{
        text: option.text,
        callback_data: `checkin_answer|${token}|${option.index}`
    }]));

    const dmText = [
        t(userLang, 'checkin_dm_intro'),
        '',
        challenge.question,
        '',
        t(userLang, 'checkin_dm_choose_option')
    ].join('\n');

    try {
        await bot.sendMessage(userId, dmText, { reply_markup: { inline_keyboard } });
        return { status: 'sent', userLang };
    } catch (error) {
        pendingCheckinChallenges.delete(token);
        console.warn(`[Checkin] Unable to send DM to ${userId}: ${error.message}`);

        return {
            status: 'failed',
            userLang,
            failureReason: 'dm_unreachable',
            startLink: buildBotStartLink('checkin')
        };
    }
}

async function concludeCheckinSuccess(token, challenge) {
    const userId = challenge.userId;
    const chatId = challenge.chatId;
    const settings = challenge.settings || await getGroupCheckinSettings(chatId);
    const timezone = challenge.timezone || settings.timezone || CHECKIN_DEFAULT_TIMEZONE;
    const today = challenge.date || formatDateForTimezone(timezone);
    const userLang = await resolveNotificationLanguage(userId);

    let walletAddress = null;
    try {
        const wallets = await db.getWalletsForUser(userId);
        if (Array.isArray(wallets) && wallets.length > 0) {
            walletAddress = wallets[0];
        }
    } catch (error) {
        console.warn(`[Checkin] Không thể lấy ví cho ${userId}: ${error.message}`);
    }

    const points = Number(settings.dailyPoints || 0) || 0;
    const result = await db.completeCheckin({
        chatId,
        userId,
        checkinDate: today,
        walletAddress,
        pointsAwarded: points
    });

    const streak = result?.streak || 1;
    const totalPoints = result?.totalPoints || points;
    const walletNote = walletAddress
        ? t(userLang, 'checkin_success_wallet_note', { wallet: walletAddress })
        : t(userLang, 'checkin_success_wallet_missing');

    const emotionToken = createShortToken('emo');
    pendingEmotionPrompts.set(emotionToken, {
        chatId,
        userId,
        date: today,
        stage: 'emotion'
    });

    const successMessage = [
        t(userLang, 'checkin_success_title'),
        t(userLang, 'checkin_success_streak', { streak }),
        t(userLang, 'checkin_success_total_points', { totalPoints }),
        walletNote,
        '',
        t(userLang, 'checkin_emotion_prompt')
    ].join('\n');

    await bot.sendMessage(userId, successMessage, {
        reply_markup: buildEmotionKeyboard(userLang, emotionToken),
        parse_mode: 'Markdown'
    });

    pendingCheckinChallenges.delete(token);
}

async function handleCheckinAnswerCallback(query, token, answerIndexRaw) {
    const userId = query.from.id.toString();
    const lang = await resolveNotificationLanguage(userId, query.from.language_code);
    const challenge = pendingCheckinChallenges.get(token);
    if (!challenge) {
        bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_question_expired'), show_alert: true });
        return;
    }

    if (userId !== challenge.userId) {
        bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_wrong_user'), show_alert: true });
        return;
    }

    const answerIndex = Number(answerIndexRaw);
    if (!Number.isInteger(answerIndex)) {
        bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_invalid_choice'), show_alert: true });
        return;
    }

    if (answerIndex === challenge.correctIndex) {
        await bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_alert_correct') });
        try {
            await concludeCheckinSuccess(token, challenge);
        } catch (error) {
            console.error(`[Checkin] Failed to record check-in: ${error.message}`);
            await bot.sendMessage(userId, t(lang, 'checkin_error_record_failed'));
            pendingCheckinChallenges.delete(token);
        }
        return;
    }

    const attempts = await db.incrementCheckinAttempt(challenge.chatId, userId, challenge.date, CHECKIN_MAX_ATTEMPTS);
    challenge.attempts = attempts.attempts;
    const remaining = Math.max(CHECKIN_MAX_ATTEMPTS - attempts.attempts, 0);

    if (attempts.locked) {
        await db.markMemberLocked(challenge.chatId, userId, challenge.date);
        pendingCheckinChallenges.delete(token);
        await bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_alert_attempts_locked'), show_alert: true });
        await bot.sendMessage(userId, t(lang, 'checkin_dm_locked'));
        return;
    }

    await bot.answerCallbackQuery(query.id, {
        text: t(lang, 'checkin_alert_attempts_remaining', { remaining }),
        show_alert: true
    });

    try {
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id
        });
    } catch (error) {
        // ignore edit errors
    }

    const nextType = challenge.questionType || pickQuestionType(challenge.settings);
    const newChallenge = generateCheckinChallenge(lang, nextType, challenge.settings);
    challenge.correctIndex = newChallenge.correctIndex;
    challenge.questionType = newChallenge.type || nextType || 'math';
    const inline_keyboard = newChallenge.options.map((option) => ([{
        text: option.text,
        callback_data: `checkin_answer|${token}|${option.index}`
    }]));

    const retryText = [
        t(lang, 'checkin_dm_retry_intro'),
        '',
        newChallenge.question,
        '',
        t(lang, 'checkin_dm_choose_option')
    ].join('\n');

    await bot.sendMessage(userId, retryText, { reply_markup: { inline_keyboard } });
}

async function handleEmotionCallback(query, token, emoji, { skip = false } = {}) {
    const prompt = pendingEmotionPrompts.get(token);
    const userId = query.from.id.toString();
    const lang = await resolveNotificationLanguage(userId, query.from.language_code);

    if (!prompt) {
        bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_session_expired'), show_alert: true });
        return;
    }

    if (userId !== prompt.userId) {
        bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_wrong_user_button'), show_alert: true });
        return;
    }

    if (!skip) {
        const decoded = decodeURIComponent(emoji || '');
        if (!decoded) {
            bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_invalid_emotion'), show_alert: true });
            return;
        }

        try {
            await db.updateCheckinFeedback(prompt.chatId, prompt.userId, prompt.date, { emotion: decoded });
        } catch (error) {
            console.error(`[Checkin] Unable to save emotion: ${error.message}`);
            bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_save_emotion'), show_alert: true });
            return;
        }
        bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_alert_emotion_saved') });
    } else {
        bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_alert_emotion_skipped') });
    }

    pendingEmotionPrompts.set(token, { ...prompt, stage: 'goal' });
    await bot.sendMessage(prompt.userId, t(lang, 'checkin_dm_goal_prompt'), {
        reply_markup: buildGoalKeyboard(lang, token)
    });
}

async function handleGoalCallback(query, token, action, value = null) {
    const prompt = pendingEmotionPrompts.get(token);
    const userId = query.from.id.toString();
    const lang = await resolveNotificationLanguage(userId, query.from.language_code);

    if (!prompt) {
        bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_session_expired'), show_alert: true });
        return;
    }

    if (userId !== prompt.userId) {
        bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_wrong_user_button'), show_alert: true });
        return;
    }

    if (prompt.stage !== 'goal') {
        bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_goal_stage'), show_alert: true });
        return;
    }

    if (action === 'choose') {
        const decoded = decodeURIComponent(value || '');
        try {
            await db.updateCheckinFeedback(prompt.chatId, prompt.userId, prompt.date, { goal: decoded });
            bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_alert_goal_saved') });
            await bot.sendMessage(prompt.userId, t(lang, 'checkin_dm_goal_success'));
            pendingEmotionPrompts.delete(token);
        } catch (error) {
            console.error(`[Checkin] Unable to save preset goal: ${error.message}`);
            bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_goal_save'), show_alert: true });
        }
        return;
    }

    if (action === 'skip') {
        bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_alert_goal_skipped') });
        await bot.sendMessage(prompt.userId, t(lang, 'checkin_dm_goal_skip'));
        pendingEmotionPrompts.delete(token);
        return;
    }

    if (action === 'custom') {
        pendingGoalInputs.set(prompt.userId, { chatId: prompt.chatId, date: prompt.date, token });
        bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_goal_custom_prompt') });
        await bot.sendMessage(prompt.userId, t(lang, 'checkin_goal_custom_dm'));
        return;
    }

    bot.answerCallbackQuery(query.id, { text: t(lang, 'checkin_error_invalid_choice'), show_alert: true });
}

async function handleGoalTextInput(msg) {
    const userId = msg.from?.id?.toString();
    if (!userId) {
        return false;
    }

    const pending = pendingGoalInputs.get(userId);
    if (!pending) {
        return false;
    }

    const lang = await resolveNotificationLanguage(userId, msg.from?.language_code);
    const goalText = sanitizeGoalInput(msg.text || '');
    if (!goalText) {
        await bot.sendMessage(userId, t(lang, 'checkin_error_goal_invalid'));
        return true;
    }

    try {
        await db.updateCheckinFeedback(pending.chatId, userId, pending.date, { goal: goalText });
        await bot.sendMessage(userId, t(lang, 'checkin_alert_goal_saved'));
        pendingEmotionPrompts.delete(pending.token);
    } catch (error) {
        console.error(`[Checkin] Unable to save custom goal: ${error.message}`);
        await bot.sendMessage(userId, t(lang, 'checkin_error_goal_save'));
    } finally {
        pendingGoalInputs.delete(userId);
    }

    return true;
}

async function buildLeaderboardText(chatId, mode = 'streak', limit = 10, langOverride = null) {
    const settings = await getGroupCheckinSettings(chatId);
    const periodStart = getLeaderboardPeriodStart(settings);
    const rows = await db.getTopCheckins(chatId, limit, mode, periodStart);
    const lang = langOverride ? resolveLangCode(langOverride) : await resolveGroupLanguage(chatId);

    if (!rows || rows.length === 0) {
        return t(lang, 'checkin_leaderboard_empty');
    }

    let headerKey = 'checkin_leaderboard_header_current';
    if (mode === 'points') {
        headerKey = 'checkin_leaderboard_header_points';
    } else if (mode === 'total') {
        headerKey = 'checkin_leaderboard_header_total';
    } else if (mode === 'longest') {
        headerKey = 'checkin_leaderboard_header_longest';
    }

    const lines = [t(lang, headerKey), ''];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rank = i + 1;
        let displayName = t(lang, 'checkin_leaderboard_fallback_name', { userId: row.userId });
        try {
            const member = await bot.getChatMember(chatId, row.userId);
            if (member?.user) {
                if (member.user.username) {
                    displayName = `@${member.user.username}`;
                } else if (member.user.first_name || member.user.last_name) {
                    displayName = `${member.user.first_name || ''} ${member.user.last_name || ''}`.trim();
                }
            }
        } catch (error) {
            // ignore fetch errors
        }

        let statText = '';
        if (mode === 'points') {
            statText = t(lang, 'checkin_leaderboard_stat_points', { value: row.totalPoints });
        } else if (mode === 'total') {
            statText = t(lang, 'checkin_leaderboard_stat_total', { value: row.totalCheckins });
        } else if (mode === 'longest') {
            statText = t(lang, 'checkin_leaderboard_stat_longest', { value: row.longestStreak });
        } else {
            statText = t(lang, 'checkin_leaderboard_stat_current', { value: row.streak });
        }

        lines.push(`${rank}. ${displayName} • ${statText}`);
    }

    lines.push('', t(lang, 'checkin_leaderboard_footer_time', { time: settings.checkinTime || CHECKIN_DEFAULT_TIME }));
    lines.push(t(lang, 'checkin_leaderboard_footer_period', { start: periodStart }));
    return lines.join('\n');
}

async function runCheckinSchedulerTick() {
    let groups = [];
    try {
        groups = await db.listCheckinGroups();
    } catch (error) {
        console.error(`[Checkin] Không thể tải danh sách nhóm: ${error.message}`);
        return;
    }

    if (!groups || groups.length === 0) {
        return;
    }

    const now = new Date();
    for (const group of groups) {
        if (!group || Number(group.autoMessageEnabled) !== 1) {
            continue;
        }

        const timezone = group.timezone || CHECKIN_DEFAULT_TIMEZONE;
        const currentTime = formatTimeForTimezone(timezone, now);
        const today = formatDateForTimezone(timezone, now);
        const slots = getScheduleSlots(group);

        for (const slot of slots) {
            if (currentTime !== slot) {
                continue;
            }

            const alreadySent = await db.hasAutoMessageLog(group.chatId, today, slot);
            if (alreadySent) {
                continue;
            }

            await sendCheckinAnnouncement(group.chatId, { triggeredBy: 'auto' });
            await db.recordAutoMessageLog(group.chatId, today, slot);
        }

        if (Number(group.summaryMessageEnabled) === 1) {
            const summarySlots = getSummaryScheduleSlots(group);
            if (summarySlots.length > 0) {
                for (const slot of summarySlots) {
                    if (currentTime !== slot) {
                        continue;
                    }

                    const alreadySentSummary = await db.hasSummaryMessageLog(group.chatId, today, slot);
                    if (alreadySentSummary) {
                        continue;
                    }

                    const sent = await sendSummaryAnnouncement(group.chatId, { triggeredBy: 'auto' });
                    if (sent) {
                        await db.recordSummaryMessageLog(group.chatId, today, slot);
                    }
                }
            }
        }
    }
}

function startCheckinScheduler() {
    if (checkinSchedulerTimer) {
        clearInterval(checkinSchedulerTimer);
        checkinSchedulerTimer = null;
    }

    const tick = () => {
        runCheckinSchedulerTick().catch((error) => {
            console.error(`[Checkin] Tick lỗi: ${error.message}`);
        });
    };

    tick();
    checkinSchedulerTimer = setInterval(tick, CHECKIN_SCHEDULER_INTERVAL);
    if (typeof checkinSchedulerTimer.unref === 'function') {
        checkinSchedulerTimer.unref();
    }
}

async function getAdminHubGroups(adminId) {
    let groups = [];
    try {
        groups = await db.listCheckinGroups();
    } catch (error) {
        console.error(`[AdminHub] Failed to load group list: ${error.message}`);
        return [];
    }

    if (!groups || groups.length === 0) {
        return [];
    }

    const results = [];
    for (const entry of groups) {
        if (!entry || !entry.chatId) {
            continue;
        }

        const chatId = entry.chatId;
        const isAdmin = await isGroupAdmin(chatId, adminId);
        if (!isAdmin) {
            continue;
        }

        let title = chatId.toString();
        try {
            const chat = await bot.getChat(chatId);
            if (chat?.title) {
                title = chat.title;
            } else if (chat?.username) {
                title = `@${chat.username}`;
            }
        } catch (error) {
            // ignore title lookup errors
        }

        results.push({ chatId, title });
    }

    results.sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
    return results;
}

function buildAdminHubText(lang, groups) {
    const lines = [t(lang, 'admin_hub_title'), `<i>${escapeHtml(t(lang, 'admin_hub_hint'))}</i>`];

    if (!groups || groups.length === 0) {
        lines.push('', escapeHtml(t(lang, 'admin_hub_empty')));
    } else {
        lines.push('');
        for (let i = 0; i < groups.length; i += 1) {
            const group = groups[i];
            const safeTitle = escapeHtml(group.title || group.chatId.toString());
            lines.push(t(lang, 'admin_hub_group_line', { index: String(i + 1), title: safeTitle }));
        }
    }

    return lines.filter(Boolean).join('\n');
}

function truncateLabel(text, max = 32) {
    if (typeof text !== 'string') {
        return '';
    }
    if (text.length <= max) {
        return text;
    }
    return `${text.slice(0, max - 1)}…`;
}

function buildAdminHubKeyboard(lang, groups) {
    const inline_keyboard = [];

    if (groups && groups.length > 0) {
        for (const group of groups) {
            const label = truncateLabel(group.title || group.chatId.toString());
            inline_keyboard.push([
                {
                    text: t(lang, 'admin_hub_button_manage', { title: label }),
                    callback_data: `admin_hub_open|${group.chatId}`
                }
            ]);
        }
    }

    inline_keyboard.push([
        { text: t(lang, 'admin_hub_refresh'), callback_data: 'admin_hub_refresh' },
        { text: t(lang, 'admin_hub_close'), callback_data: 'admin_hub_close' }
    ]);

    return { inline_keyboard };
}

async function openAdminHub(adminId, { forceRefresh = false, fallbackLang } = {}) {
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const groups = await getAdminHubGroups(adminId);
    const text = buildAdminHubText(lang, groups);
    const replyMarkup = buildAdminHubKeyboard(lang, groups);

    const existing = adminHubSessions.get(adminId);
    if (existing && !forceRefresh) {
        try {
            await bot.editMessageText(text, {
                chat_id: adminId,
                message_id: existing.messageId,
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            });
            return { messageId: existing.messageId, groups };
        } catch (error) {
            try {
                await bot.deleteMessage(adminId, existing.messageId);
            } catch (deleteError) {
                // ignore cleanup errors
            }
        }
    }

    const message = await bot.sendMessage(adminId, text, {
        parse_mode: 'HTML',
        reply_markup: replyMarkup
    });
    adminHubSessions.set(adminId, { messageId: message.message_id });
    return { messageId: message.message_id, groups };
}

const ADMIN_MENU_SECTION_CONFIG = {
    shortcuts: {
        labelKey: 'checkin_admin_section_shortcuts_button',
        hintKey: 'checkin_admin_section_shortcuts_hint',
        actions: [
            { labelKey: 'checkin_admin_button_user_checkin', callback: (chatKey) => `checkin_admin_user_prompt|${chatKey}` },
            { labelKey: 'checkin_admin_button_user_leaderboard', callback: (chatKey) => `checkin_admin_user_leaderboard|${chatKey}` }
        ]
    },
    members: {
        labelKey: 'checkin_admin_section_members_button',
        hintKey: 'checkin_admin_section_members_hint',
        actions: [
            { labelKey: 'checkin_admin_button_today_list', callback: (chatKey) => `checkin_admin_list|${chatKey}` },
            { labelKey: 'checkin_admin_button_summary_window', callback: (chatKey) => `checkin_admin_summary_window|${chatKey}` },
            { labelKey: 'checkin_admin_button_summary_reset', callback: (chatKey) => `checkin_admin_summary_reset|${chatKey}` },
            { labelKey: 'checkin_admin_button_remove', callback: (chatKey) => `checkin_admin_remove|${chatKey}` },
            { labelKey: 'checkin_admin_button_unlock', callback: (chatKey) => `checkin_admin_unlock|${chatKey}` }
        ]
    },
    leaderboard: {
        labelKey: 'checkin_admin_section_leaderboard_button',
        hintKey: 'checkin_admin_section_leaderboard_hint',
        actions: [
            { labelKey: 'checkin_admin_button_leaderboard_view', callback: (chatKey) => `checkin_admin_leaderboard_view|${chatKey}` },
            { labelKey: 'checkin_admin_button_leaderboard_manage', callback: (chatKey) => `checkin_admin_leaderboard_members|${chatKey}` },
            { labelKey: 'checkin_admin_button_leaderboard_reset', callback: (chatKey) => `checkin_admin_leaderboard_reset|${chatKey}` }
        ]
    },
    messaging: {
        labelKey: 'checkin_admin_section_messaging_button',
        hintKey: 'checkin_admin_section_messaging_hint',
        actions: [
            { labelKey: 'checkin_admin_button_broadcast', callback: (chatKey) => `checkin_admin_broadcast|${chatKey}` },
            { labelKey: 'checkin_admin_button_secret_message', callback: (chatKey) => `checkin_admin_dm|${chatKey}` },
            { labelKey: 'checkin_admin_button_summary_broadcast', callback: (chatKey) => `checkin_admin_summary_broadcast|${chatKey}` }
        ]
    },
    settings: {
        labelKey: 'checkin_admin_section_settings_button',
        hintKey: 'checkin_admin_section_settings_hint',
        actions: [
            { labelKey: 'checkin_admin_button_points', callback: (chatKey) => `checkin_admin_points|${chatKey}` },
            { labelKey: 'checkin_admin_button_summary', callback: (chatKey) => `checkin_admin_summary|${chatKey}` },
            { labelKey: 'checkin_admin_button_question_mix', callback: (chatKey) => `checkin_admin_weights|${chatKey}` },
            { labelKey: 'checkin_admin_button_schedule', callback: (chatKey) => `checkin_admin_schedule|${chatKey}` }
        ]
    }
};

function resolveAdminMenuView(view) {
    if (!view || view === 'home') {
        return 'home';
    }
    return ADMIN_MENU_SECTION_CONFIG[view] ? view : 'home';
}

function buildAdminMenuKeyboard(chatId, lang, view = 'home') {
    const chatKey = chatId.toString();
    const resolvedView = resolveAdminMenuView(view);

    if (resolvedView === 'home') {
        const inline_keyboard = Object.entries(ADMIN_MENU_SECTION_CONFIG).map(([sectionKey, config]) => ([{
            text: t(lang, config.labelKey),
            callback_data: `checkin_admin_menu|${chatKey}|${sectionKey}`
        }]));
        inline_keyboard.push([{ text: t(lang, 'admin_hub_button_home'), callback_data: 'admin_hub_from_menu' }]);
        inline_keyboard.push([
            { text: t(lang, 'checkin_admin_button_refresh'), callback_data: `checkin_admin_refresh|${chatKey}` },
            { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatKey}` }
        ]);
        return { inline_keyboard };
    }

    const section = ADMIN_MENU_SECTION_CONFIG[resolvedView];
    const inline_keyboard = [];
    for (let i = 0; i < section.actions.length; i += 2) {
        const row = [];
        for (let j = i; j < i + 2 && j < section.actions.length; j++) {
            const action = section.actions[j];
            row.push({ text: t(lang, action.labelKey), callback_data: action.callback(chatKey) });
        }
        inline_keyboard.push(row);
    }

    inline_keyboard.push([{ text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_menu|${chatKey}|home` }]);
    inline_keyboard.push([
        { text: t(lang, 'checkin_admin_button_refresh'), callback_data: `checkin_admin_refresh|${chatKey}` },
        { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatKey}` }
    ]);

    return { inline_keyboard };
}

function formatWalletPreview(wallet) {
    if (!wallet || typeof wallet !== 'string') {
        return null;
    }

    const trimmed = wallet.trim();
    if (!trimmed) {
        return null;
    }

    if (trimmed.length <= 12) {
        return trimmed;
    }

    return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

async function resolveMemberProfile(chatId, userId, lang, cache = null) {
    const cacheKey = userId.toString();
    if (cache && cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    let displayName = t(lang, 'checkin_leaderboard_fallback_name', { userId });
    let username = null;
    let fullName = null;

    try {
        const member = await bot.getChatMember(chatId, userId);
        if (member?.user) {
            if (member.user.username) {
                username = `@${member.user.username}`;
            }

            if (member.user.first_name || member.user.last_name) {
                fullName = `${member.user.first_name || ''} ${member.user.last_name || ''}`.trim();
            }

            if (fullName) {
                displayName = fullName;
            } else if (username) {
                displayName = username;
            }
        }
    } catch (error) {
        // ignore member lookup failures
    }

    const profile = {
        displayName,
        username,
        fullName,
        link: buildAdminProfileLink(userId, displayName)
    };
    if (cache) {
        cache.set(cacheKey, profile);
    }
    return profile;
}

async function isGroupAdmin(chatId, userId) {
    try {
        const member = await bot.getChatMember(chatId, userId);
        if (!member) {
            return false;
        }
        return ['creator', 'administrator'].includes(member.status);
    } catch (error) {
        console.warn(`[Checkin] Không thể kiểm tra quyền admin của ${userId} trong ${chatId}: ${error.message}`);
        return false;
    }
}

async function closeAdminMenu(adminId) {
    const current = checkinAdminMenus.get(adminId);
    if (!current) {
        return;
    }

    try {
        await bot.deleteMessage(adminId, current.messageId);
    } catch (error) {
        // ignore deletion errors
    }

    checkinAdminMenus.delete(adminId);
}

async function sendAdminMenu(adminId, chatId, { fallbackLang, view } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const currentSession = checkinAdminMenus.get(adminId);
    const resolvedView = resolveAdminMenuView(view || currentSession?.view);
    const weightPercents = formatQuestionWeightPercentages(getQuestionWeights(settings));
    const scheduleSlots = getScheduleSlots(settings);
    const scheduleText = scheduleSlots.join(', ');
    const summarySlots = getSummaryScheduleSlots(settings);
    const textLines = [
        t(lang, 'checkin_admin_menu_header'),
        t(lang, 'checkin_admin_menu_line_time', { time: settings.checkinTime || CHECKIN_DEFAULT_TIME }),
        t(lang, 'checkin_admin_menu_line_schedule', {
            count: scheduleSlots.length,
            times: scheduleText,
            timezone: settings.timezone || CHECKIN_DEFAULT_TIMEZONE
        }),
        summarySlots.length > 0
            ? t(lang, 'checkin_admin_menu_line_summary_schedule', {
                count: summarySlots.length,
                times: summarySlots.join(', '),
                timezone: settings.timezone || CHECKIN_DEFAULT_TIMEZONE
            })
            : t(lang, 'checkin_admin_menu_line_summary_schedule_disabled', {
                timezone: settings.timezone || CHECKIN_DEFAULT_TIMEZONE
            }),
        t(lang, 'checkin_admin_menu_line_points', { points: settings.dailyPoints || 0 }),
        t(lang, 'checkin_admin_menu_line_summary', { days: settings.summaryWindow || 7 }),
        t(lang, 'checkin_admin_menu_line_question_mix', weightPercents),
        t(lang, 'checkin_admin_menu_line_leaderboard', { start: getLeaderboardPeriodStart(settings) }),
        '',
        t(lang, 'checkin_admin_menu_user_section'),
        t(lang, 'checkin_admin_menu_admin_section'),
        ''
    ];

    if (resolvedView === 'home') {
        textLines.push(t(lang, 'checkin_admin_menu_choose_action'));
    } else {
        const section = ADMIN_MENU_SECTION_CONFIG[resolvedView];
        const hintKey = section?.hintKey;
        if (hintKey) {
            textLines.push(t(lang, hintKey));
        }
    }

    const payload = {
        parse_mode: 'Markdown',
        reply_markup: buildAdminMenuKeyboard(chatId, lang, resolvedView)
    };

    const session = currentSession;
    if (session) {
        try {
            await bot.editMessageText(textLines.join('\n'), {
                chat_id: adminId,
                message_id: session.messageId,
                parse_mode: payload.parse_mode,
                reply_markup: payload.reply_markup
            });
            checkinAdminMenus.set(adminId, { chatId, messageId: session.messageId, view: resolvedView });
            return session.messageId;
        } catch (error) {
            try {
                await bot.deleteMessage(adminId, session.messageId);
            } catch (deleteError) {
                // ignore
            }
        }
    }

    const message = await bot.sendMessage(adminId, textLines.join('\n'), payload);
    checkinAdminMenus.set(adminId, { chatId, messageId: message.message_id, view: resolvedView });
    return message.message_id;
}

function buildLeaderboardModeKeyboard(chatId, lang, activeMode = 'streak') {
    const chatKey = chatId.toString();
    const inline_keyboard = [];
    const modeButtons = LEADERBOARD_MODE_CONFIG.map((entry) => ({
        text: entry.key === activeMode ? `• ${t(lang, entry.labelKey)}` : t(lang, entry.labelKey),
        callback_data: `checkin_admin_leaderboard_mode|${chatKey}|${entry.key}`
    }));

    for (let i = 0; i < modeButtons.length; i += 2) {
        inline_keyboard.push(modeButtons.slice(i, i + 2));
    }

    inline_keyboard.push([
        { text: t(lang, 'checkin_admin_button_leaderboard_manage'), callback_data: `checkin_admin_leaderboard_members|${chatKey}` }
    ]);
    inline_keyboard.push([
        { text: t(lang, 'checkin_admin_button_leaderboard_reset'), callback_data: `checkin_admin_leaderboard_reset|${chatKey}` }
    ]);
    inline_keyboard.push([
        { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatKey}` },
        { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatKey}` }
    ]);

    return { inline_keyboard };
}

async function presentAdminLeaderboardView(adminId, chatId, { fallbackLang, mode = 'streak' } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const periodStart = getLeaderboardPeriodStart(settings);
    const leaderboardText = await buildLeaderboardText(chatId, mode, 10, lang);
    const lines = [
        `<b>${escapeHtml(t(lang, 'checkin_admin_leaderboard_title'))}</b>`,
        escapeHtml(t(lang, 'checkin_admin_leaderboard_period', { start: periodStart })),
        '',
        `<pre>${escapeHtml(leaderboardText)}</pre>`
    ];

    await bot.sendMessage(adminId, lines.join('\n'), {
        parse_mode: 'HTML',
        reply_markup: buildLeaderboardModeKeyboard(chatId, lang, mode)
    });
}

async function presentAdminLeaderboardManageList(adminId, chatId, { fallbackLang } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const periodStart = getLeaderboardPeriodStart(settings);
    const rows = await db.getTopCheckins(chatId, CHECKIN_ADMIN_SUMMARY_MAX_ROWS, 'points', periodStart);

    if (!rows || rows.length === 0) {
        await bot.sendMessage(adminId, t(lang, 'checkin_admin_leaderboard_manage_empty'), {
            reply_markup: {
                inline_keyboard: [[
                    { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                    { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
                ]]
            }
        });
        return;
    }

    const profileCache = new Map();
    const lines = [
        `<b>${escapeHtml(t(lang, 'checkin_admin_leaderboard_manage_title'))}</b>`,
        escapeHtml(t(lang, 'checkin_admin_leaderboard_period', { start: periodStart })),
        '',
        escapeHtml(t(lang, 'checkin_admin_leaderboard_manage_hint'))
    ];

    const buttons = [];
    for (let i = 0; i < rows.length; i++) {
        const entry = rows[i];
        const rank = i + 1;
        const profile = await resolveMemberProfile(chatId, entry.userId, lang, profileCache);
        const profileLink = profile.link || escapeHtml(profile.displayName);
        lines.push('', `${rank}. <b>${profileLink}</b>`);
        lines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_leaderboard_member_stats_points', { points: entry.totalPoints || 0 }))}`);
        lines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_leaderboard_member_stats_days', { count: entry.totalCheckins || 0 }))}`);
        lines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_leaderboard_member_stats_streak', { streak: entry.streak || 0 }))}`);
        lines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_leaderboard_member_stats_longest', { streak: entry.longestStreak || 0 }))}`);
        buttons.push({
            text: truncateLabel(`${rank}. ${profile.displayName}`, 48),
            callback_data: `checkin_admin_leaderboard_member|${chatId}|${entry.userId}`
        });
    }

    const inline_keyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
        inline_keyboard.push(buttons.slice(i, i + 2));
    }
    inline_keyboard.push([
        { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
        { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
    ]);

    await bot.sendMessage(adminId, lines.join('\n'), {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard }
    });
}

function buildLeaderboardHistoryLines(records, lang, timezone) {
    if (!Array.isArray(records) || records.length === 0) {
        return [t(lang, 'checkin_admin_leaderboard_member_history_empty')];
    }

    return [...records]
        .slice(-CHECKIN_ADMIN_LEADERBOARD_HISTORY_LIMIT)
        .reverse()
        .map((record) => {
            const timestamp = Number(record.updatedAt || record.createdAt || 0);
            return t(lang, 'checkin_admin_leaderboard_member_history_line', {
                date: record.checkinDate,
                time: formatDateTimeForTimezone(timezone, timestamp),
                points: Number(record.pointsAwarded || 0)
            });
        });
}

async function presentAdminLeaderboardMemberDetail(adminId, chatId, targetUserId, { fallbackLang } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const periodStart = getLeaderboardPeriodStart(settings);
    const stats = await db.getMemberLeaderboardStats(chatId, targetUserId, periodStart);

    if (!stats || !stats.entries || stats.entries.length === 0) {
        await bot.sendMessage(adminId, t(lang, 'checkin_admin_leaderboard_member_history_empty'), {
            reply_markup: {
                inline_keyboard: [[
                    { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                    { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
                ]]
            }
        });
        return;
    }

    const profile = await resolveMemberProfile(chatId, targetUserId, lang);
    const profileLink = profile.link || escapeHtml(profile.displayName);
    const idLink = buildAdminUserIdLink(targetUserId);
    const timezone = settings.timezone || CHECKIN_DEFAULT_TIMEZONE;
    const lines = [
        `<b>${t(lang, 'checkin_admin_leaderboard_member_title', { name: profileLink, id: idLink })}</b>`,
        escapeHtml(t(lang, 'checkin_admin_leaderboard_period', { start: periodStart })),
        `${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_leaderboard_member_stats_points', { points: stats.totalPoints || 0 }))}`,
        `${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_leaderboard_member_stats_days', { count: stats.totalCheckins || 0 }))}`,
        `${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_leaderboard_member_stats_streak', { streak: stats.streak || 0 }))}`,
        `${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_leaderboard_member_stats_longest', { streak: stats.longestStreak || 0 }))}`,
        `${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_leaderboard_member_answers_line', { count: stats.totalCheckins || 0 }))}`,
        '',
        `<b>${escapeHtml(t(lang, 'checkin_admin_leaderboard_member_history_header'))}</b>`
    ];

    const historyLines = buildLeaderboardHistoryLines(stats.entries, lang, timezone);
    lines.push(...historyLines.map((line) => escapeHtml(line)));

    const inline_keyboard = [
        [{ text: t(lang, 'checkin_admin_leaderboard_remove_button'), callback_data: `checkin_admin_leaderboard_remove|${chatId}|${targetUserId}` }],
        [
            { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
            { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
        ]
    ];

    await bot.sendMessage(adminId, lines.join('\n'), {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard }
    });
}

async function promptLeaderboardReset(adminId, chatId, { fallbackLang } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const periodStart = getLeaderboardPeriodStart(settings);
    const timezone = settings.timezone || CHECKIN_DEFAULT_TIMEZONE;
    const chatKey = chatId.toString();
    const lines = [
        `<b>${escapeHtml(t(lang, 'checkin_admin_leaderboard_reset_title'))}</b>`,
        escapeHtml(t(lang, 'checkin_admin_leaderboard_period', { start: periodStart })),
        '',
        escapeHtml(t(lang, 'checkin_admin_leaderboard_reset_hint', { timezone }))
    ];

    const inline_keyboard = [
        [{ text: t(lang, 'checkin_admin_leaderboard_reset_confirm'), callback_data: `checkin_admin_leaderboard_reset_confirm|${chatKey}` }],
        [
            { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatKey}` },
            { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatKey}` }
        ]
    ];

    await bot.sendMessage(adminId, lines.join('\n'), {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard }
    });
}

async function confirmLeaderboardReset(adminId, chatId, { fallbackLang } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const timezone = settings.timezone || CHECKIN_DEFAULT_TIMEZONE;
    const today = formatDateForTimezone(timezone);
    await db.setLeaderboardPeriodStart(chatId, today, timezone);
    await bot.sendMessage(adminId, t(lang, 'checkin_admin_leaderboard_reset_done', { start: today }), {
        reply_markup: {
            inline_keyboard: [[
                { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
            ]]
        }
    });
}

async function confirmLeaderboardRemoval(adminId, chatId, targetUserId, { fallbackLang } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const periodStart = getLeaderboardPeriodStart(settings);
    await db.clearMemberLeaderboardEntries(chatId, targetUserId, periodStart);
    await bot.sendMessage(adminId, t(lang, 'checkin_admin_leaderboard_remove_done', { id: targetUserId, start: periodStart }), {
        reply_markup: {
            inline_keyboard: [[
                { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
            ]]
        }
    });
}

async function sendTodayCheckinList(chatId, adminId, { fallbackLang } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const today = formatDateForTimezone(settings.timezone || CHECKIN_DEFAULT_TIMEZONE);
    const records = await db.getCheckinsForDate(chatId, today);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const profileCache = new Map();
    if (!records || records.length === 0) {
        const message = await bot.sendMessage(adminId, t(lang, 'checkin_admin_today_empty'), {
            reply_markup: {
                inline_keyboard: [[
                    { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                    { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
                ]]
            }
        });
        scheduleMessageDeletion(adminId, message.message_id, 15000);
        return;
    }

    const lines = [t(lang, 'checkin_admin_today_header'), ''];
    for (const record of records) {
        const profile = await resolveMemberProfile(chatId, record.userId, lang, profileCache);
        const memberSummary = await db.getCheckinMemberSummary(chatId, record.userId);
        const safeId = buildAdminUserIdLink(record.userId);
        const safeName = `<b>${profile.link || escapeHtml(profile.displayName)}</b>`;
        const entryLines = [
            t(lang, 'checkin_admin_today_member_line', {
                name: safeName,
                id: safeId
            })
        ];

        if (profile.username && profile.username !== profile.displayName) {
            entryLines.push(`${ADMIN_DETAIL_BULLET}${t(lang, 'checkin_admin_today_username_line', {
                username: `<code>${escapeHtml(profile.username)}</code>`
            })}`);
        }

        if (profile.fullName && profile.fullName !== profile.displayName) {
            entryLines.push(`${ADMIN_DETAIL_BULLET}${t(lang, 'checkin_admin_today_fullname_line', {
                fullName: `<i>${escapeHtml(profile.fullName)}</i>`
            })}`);
        }

        const walletText = record.walletAddress
            ? t(lang, 'checkin_admin_today_wallet', { wallet: `<code>${escapeHtml(record.walletAddress)}</code>` })
            : t(lang, 'checkin_admin_today_wallet', { wallet: `<i>${escapeHtml(t(lang, 'checkin_admin_wallet_unknown'))}</i>` });
        entryLines.push(`${ADMIN_DETAIL_BULLET}${walletText}`);

        const pointsValue = Number.isFinite(Number(record.pointsAwarded))
            ? Number(record.pointsAwarded)
            : 0;
        entryLines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_today_points', { points: pointsValue }))}`);

        const totalPointsValue = Number.isFinite(Number(memberSummary?.totalPoints))
            ? Number(memberSummary.totalPoints)
            : pointsValue;
        entryLines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_today_total_points', { points: totalPointsValue }))}`);

        if (record.emotion) {
            entryLines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_today_emotion', { emotion: record.emotion }))}`);
        }

        if (record.goal) {
            entryLines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_today_goal', { goal: record.goal }))}`);
        }

        lines.push(entryLines.join('\n'));
        lines.push('');
    }

    const message = await bot.sendMessage(adminId, lines.join('\n').trim(), {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [[
                { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
            ]]
        }
    });
    scheduleMessageDeletion(adminId, message.message_id, 60000);
}

async function promptAdminSummaryReset(chatId, adminId, { fallbackLang } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const { startDate, endDate, rangeDays } = getSummaryWindowBounds(settings);
    const timezone = settings.timezone || CHECKIN_DEFAULT_TIMEZONE;
    const periodStart = getSummaryPeriodStart(settings);
    const lines = [
        `<b>${escapeHtml(t(lang, 'checkin_admin_summary_reset_title'))}</b>`,
        escapeHtml(t(lang, 'checkin_admin_summary_reset_hint', {
            days: Math.max(rangeDays, 1),
            start: startDate || '—',
            end: endDate || '—',
            timezone
        }))
    ];
    if (periodStart) {
        lines.push('', escapeHtml(t(lang, 'checkin_admin_summary_reset_period_note', { reset: periodStart })));
    }

    const inline_keyboard = [
        [
            { text: t(lang, 'checkin_admin_button_summary_reset_confirm'), callback_data: `checkin_admin_summary_reset_confirm|${chatId}` },
            { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` }
        ],
        [{ text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }]
    ];

    await bot.sendMessage(adminId, lines.join('\n'), {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard }
    });
}

async function executeAdminSummaryReset(chatId, adminId, { fallbackLang } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const timezone = settings.timezone || CHECKIN_DEFAULT_TIMEZONE;
    const today = formatDateForTimezone(timezone);
    await db.setSummaryPeriodStart(chatId, today, timezone);
    await db.resetSummaryMessageLogs(chatId);
    await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_summary_reset_success', { start: today }));
    await sendAdminMenu(adminId, chatId, { fallbackLang: lang, view: 'members' });
}

async function sendSummaryWindowCheckinList(chatId, adminId, { fallbackLang } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const { startDate, endDate, rangeDays } = getSummaryWindowBounds(settings);
    if (!startDate || !endDate || startDate > endDate) {
        await bot.sendMessage(adminId, t(lang, 'checkin_admin_summary_window_empty', { days: settings.summaryWindow || 7 }), {
            reply_markup: {
                inline_keyboard: [[
                    { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                    { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
                ]]
            }
        });
        return;
    }

    const records = await db.getCheckinsInRange(chatId, startDate, endDate);
    const profileCache = new Map();

    if (!records || records.length === 0) {
        const message = await bot.sendMessage(adminId, t(lang, 'checkin_admin_summary_window_empty', { days: Math.max(rangeDays, 1) }), {
            reply_markup: {
                inline_keyboard: [[
                    { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                    { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
                ]]
            }
        });
        scheduleMessageDeletion(adminId, message.message_id, 15000);
        return;
    }

    const summaryMap = new Map();
    for (const record of records) {
        const userKey = record.userId.toString();
        const stats = summaryMap.get(userKey) || { days: 0, points: 0 };
        stats.days += 1;
        stats.points += Number(record.pointsAwarded || 0);
        summaryMap.set(userKey, stats);
    }

    const sortedEntries = Array.from(summaryMap.entries())
        .sort((a, b) => {
            if (b[1].days !== a[1].days) {
                return b[1].days - a[1].days;
            }
            if (b[1].points !== a[1].points) {
                return b[1].points - a[1].points;
            }
            return Number(a[0]) - Number(b[0]);
        })
        .slice(0, CHECKIN_ADMIN_SUMMARY_MAX_ROWS);

    const lines = [
        t(lang, 'checkin_admin_summary_window_header', {
            days: Math.max(rangeDays, 1),
            start: startDate,
            end: endDate,
            members: summaryMap.size
        }),
        ''
    ];

    for (let index = 0; index < sortedEntries.length; index += 1) {
        const [userId, stats] = sortedEntries[index];
        const profile = await resolveMemberProfile(chatId, userId, lang, profileCache);
        const safeName = `<b>${profile.link || escapeHtml(profile.displayName)}</b>`;
        const safeId = buildAdminUserIdLink(userId);
        lines.push(t(lang, 'checkin_admin_summary_window_line', {
            rank: index + 1,
            name: safeName,
            id: safeId,
            days: stats.days
        }));
        lines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_summary_window_points', { points: stats.points }))}`);
        lines.push('');
    }

    const message = await bot.sendMessage(adminId, lines.join('\n').trim(), {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [[
                { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
            ]]
        }
    });
    scheduleMessageDeletion(adminId, message.message_id, 60000);
}

async function promptAdminSummaryReset(chatId, adminId, { fallbackLang } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const { startDate, endDate, rangeDays } = getSummaryWindowBounds(settings);
    const timezone = settings.timezone || CHECKIN_DEFAULT_TIMEZONE;
    const periodStart = getSummaryPeriodStart(settings);
    const lines = [
        `<b>${escapeHtml(t(lang, 'checkin_admin_summary_reset_title'))}</b>`,
        escapeHtml(t(lang, 'checkin_admin_summary_reset_hint', {
            days: Math.max(rangeDays, 1),
            start: startDate || '—',
            end: endDate || '—',
            timezone
        }))
    ];
    if (periodStart) {
        lines.push('', escapeHtml(t(lang, 'checkin_admin_summary_reset_period_note', { reset: periodStart })));
    }

    const inline_keyboard = [
        [
            { text: t(lang, 'checkin_admin_button_summary_reset_confirm'), callback_data: `checkin_admin_summary_reset_confirm|${chatId}` },
            { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` }
        ],
        [{ text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }]
    ];

    await bot.sendMessage(adminId, lines.join('\n'), {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard }
    });
}

async function executeAdminSummaryReset(chatId, adminId, { fallbackLang } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const timezone = settings.timezone || CHECKIN_DEFAULT_TIMEZONE;
    const today = formatDateForTimezone(timezone);
    await db.setSummaryPeriodStart(chatId, today, timezone);
    await db.resetSummaryMessageLogs(chatId);
    await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_summary_reset_success', { start: today }));
    await sendAdminMenu(adminId, chatId, { fallbackLang: lang, view: 'members' });
}

async function promptAdminForRemoval(chatId, adminId, { fallbackLang } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const today = formatDateForTimezone(settings.timezone || CHECKIN_DEFAULT_TIMEZONE);
    const records = await db.getCheckinsForDate(chatId, today);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const profileCache = new Map();
    if (!records || records.length === 0) {
        const message = await bot.sendMessage(adminId, t(lang, 'checkin_admin_remove_empty'), {
            reply_markup: {
                inline_keyboard: [[
                    { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                    { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
                ]]
            }
        });
        scheduleMessageDeletion(adminId, message.message_id, 15000);
        return;
    }

    const inline_keyboard = [];
    const lines = [t(lang, 'checkin_admin_remove_prompt'), ''];
    for (const record of records.slice(0, 20)) {
        const profile = await resolveMemberProfile(chatId, record.userId, lang, profileCache);
        const walletPreview = formatWalletPreview(record.walletAddress)
            || t(lang, 'checkin_admin_wallet_unknown');
        const safeId = buildAdminUserIdLink(record.userId);
        const safeName = `<b>${profile.link || escapeHtml(profile.displayName)}</b>`;
        const walletDisplay = record.walletAddress
            ? t(lang, 'checkin_admin_today_wallet', { wallet: `<code>${escapeHtml(record.walletAddress)}</code>` })
            : t(lang, 'checkin_admin_today_wallet', { wallet: `<i>${escapeHtml(t(lang, 'checkin_admin_wallet_unknown'))}</i>` });
        const pointsValue = Number.isFinite(Number(record.pointsAwarded))
            ? Number(record.pointsAwarded)
            : 0;
        const memberSummary = await db.getCheckinMemberSummary(chatId, record.userId);
        const totalPointsValue = Number.isFinite(Number(memberSummary?.totalPoints))
            ? Number(memberSummary.totalPoints)
            : pointsValue;

        const entryLines = [
            t(lang, 'checkin_admin_today_member_line', {
                name: safeName,
                id: safeId
            })
        ];

        if (profile.username && profile.username !== profile.displayName) {
            entryLines.push(`${ADMIN_DETAIL_BULLET}${t(lang, 'checkin_admin_today_username_line', {
                username: `<code>${escapeHtml(profile.username)}</code>`
            })}`);
        }

        if (profile.fullName && profile.fullName !== profile.displayName) {
            entryLines.push(`${ADMIN_DETAIL_BULLET}${t(lang, 'checkin_admin_today_fullname_line', {
                fullName: `<i>${escapeHtml(profile.fullName)}</i>`
            })}`);
        }

        entryLines.push(`${ADMIN_DETAIL_BULLET}${walletDisplay}`);
        entryLines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_today_points', { points: pointsValue }))}`);
        entryLines.push(`${ADMIN_DETAIL_BULLET}${escapeHtml(t(lang, 'checkin_admin_today_total_points', { points: totalPointsValue }))}`);

        lines.push(entryLines.join('\n'));
        lines.push('');

        const buttonLabelRaw = t(lang, 'checkin_admin_remove_option_detail', {
            user: profile.displayName,
            wallet: walletPreview,
            id: record.userId
        });
        inline_keyboard.push([{
            text: truncateLabel(buttonLabelRaw, 64),
            callback_data: `checkin_admin_remove_confirm|${chatId}|${record.userId}`
        }]);
    }

    inline_keyboard.push([
        { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
        { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
    ]);

    await bot.sendMessage(adminId, lines.join('\n').trim(), {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard }
    });
}

async function promptAdminUnlock(chatId, adminId, { fallbackLang } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const today = formatDateForTimezone(settings.timezone || CHECKIN_DEFAULT_TIMEZONE);
    const locked = await db.getLockedMembers(chatId, today);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const profileCache = new Map();
    if (!locked || locked.length === 0) {
        const message = await bot.sendMessage(adminId, t(lang, 'checkin_admin_unlock_empty'), {
            reply_markup: {
                inline_keyboard: [[
                    { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                    { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
                ]]
            }
        });
        scheduleMessageDeletion(adminId, message.message_id, 15000);
        return;
    }

    const inline_keyboard = [];
    const lines = [escapeHtml(t(lang, 'checkin_admin_unlock_prompt')), ''];
    const limitedEntries = locked.slice(0, 20);
    for (let index = 0; index < limitedEntries.length; index += 1) {
        const entry = limitedEntries[index];
        const profile = await resolveMemberProfile(chatId, entry.userId, lang, profileCache);
        const safeName = `<b>${profile.link || escapeHtml(profile.displayName)}</b>`;
        const safeId = buildAdminUserIdLink(entry.userId);
        lines.push(t(lang, 'checkin_admin_unlock_list_line', {
            index: index + 1,
            name: safeName,
            id: safeId
        }));
        inline_keyboard.push([{
            text: t(lang, 'checkin_admin_unlock_option', { name: profile.displayName, id: entry.userId }),
            callback_data: `checkin_admin_unlock_confirm|${chatId}|${entry.userId}`
        }]);
    }

    inline_keyboard.push([
        { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
        { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
    ]);

    await bot.sendMessage(adminId, lines.join('\n').trim(), {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard }
    });
}

async function promptAdminSecretMessage(chatId, adminId, { fallbackLang } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const today = formatDateForTimezone(settings.timezone || CHECKIN_DEFAULT_TIMEZONE);
    const records = await db.getCheckinsForDate(chatId, today);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const profileCache = new Map();
    if (!records || records.length === 0) {
        const message = await bot.sendMessage(adminId, t(lang, 'checkin_admin_dm_empty'), {
            reply_markup: {
                inline_keyboard: [[
                    { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
                    { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
                ]]
            }
        });
        scheduleMessageDeletion(adminId, message.message_id, 15000);
        return;
    }

    const inline_keyboard = [];
    const uniqueRecipients = Array.from(new Set(records.map((record) => record.userId.toString())));
    const broadcastCount = Math.min(uniqueRecipients.length, CHECKIN_ADMIN_DM_MAX_RECIPIENTS);
    if (broadcastCount > 0) {
        inline_keyboard.push([
            {
                text: t(lang, 'checkin_admin_dm_option_all', { count: broadcastCount }),
                callback_data: `checkin_admin_dm_all|${chatId}`
            }
        ]);
    }
    for (const record of records.slice(0, 20)) {
        const profile = await resolveMemberProfile(chatId, record.userId, lang, profileCache);
        inline_keyboard.push([{
            text: t(lang, 'checkin_admin_dm_option', { name: profile.displayName, id: record.userId }),
            callback_data: `checkin_admin_dm_target|${chatId}|${record.userId}`
        }]);
    }

    inline_keyboard.push([
        { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
        { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
    ]);

    const messageLines = [t(lang, 'checkin_admin_dm_prompt')];
    if (uniqueRecipients.length > CHECKIN_ADMIN_DM_MAX_RECIPIENTS) {
        messageLines.push('', t(lang, 'checkin_admin_dm_all_limit_note', { count: CHECKIN_ADMIN_DM_MAX_RECIPIENTS }));
    }

    await bot.sendMessage(adminId, messageLines.join('\n'), {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard }
    });
}

async function promptAdminPoints(chatId, adminId, { fallbackLang } = {}) {
    const options = [5, 10, 20, 30];
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const inline_keyboard = options.map((value) => ([{
        text: t(lang, 'checkin_admin_points_option', { value }),
        callback_data: `checkin_admin_points_set|${chatId}|${value}`
    }]));
    inline_keyboard.push([{ text: t(lang, 'checkin_admin_button_custom'), callback_data: `checkin_admin_points_custom|${chatId}` }]);

    inline_keyboard.push([
        { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
        { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
    ]);

    await bot.sendMessage(adminId, t(lang, 'checkin_admin_points_title'), {
        reply_markup: { inline_keyboard }
    });
}

async function promptAdminSummaryWindow(chatId, adminId, { fallbackLang } = {}) {
    const options = [7, 14, 30];
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const inline_keyboard = options.map((value) => ([{
        text: t(lang, 'checkin_admin_summary_option', { value }),
        callback_data: `checkin_admin_summary_set|${chatId}|${value}`
    }]));
    inline_keyboard.push([{ text: t(lang, 'checkin_admin_button_custom'), callback_data: `checkin_admin_summary_custom|${chatId}` }]);

    inline_keyboard.push([
        { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
        { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
    ]);

    await bot.sendMessage(adminId, t(lang, 'checkin_admin_summary_title'), {
        reply_markup: { inline_keyboard }
    });
}

async function promptAdminSchedule(chatId, adminId, { fallbackLang } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const slots = getScheduleSlots(settings);
    const timezone = settings.timezone || CHECKIN_DEFAULT_TIMEZONE;
    const lines = [
        t(lang, 'checkin_admin_schedule_title'),
        '',
        t(lang, 'checkin_admin_schedule_timezone', { timezone }),
        slots.length > 0
            ? `${t(lang, 'checkin_admin_schedule_current', { count: slots.length })}\n${slots.map((slot, idx) => `${idx + 1}. ${slot}`).join('\n')}`
            : t(lang, 'checkin_admin_schedule_none'),
        '',
        t(lang, 'checkin_admin_schedule_hint')
    ];

    const inline_keyboard = CHECKIN_SCHEDULE_PRESETS.map((preset) => ([{
        text: t(lang, preset.labelKey),
        callback_data: `checkin_admin_schedule_preset|${chatId}|${preset.slots.join(',')}`
    }]));

    inline_keyboard.push([
        { text: t(lang, 'checkin_admin_button_schedule_custom'), callback_data: `checkin_admin_schedule_custom|${chatId}` },
        { text: t(lang, 'checkin_admin_button_schedule_clear'), callback_data: `checkin_admin_schedule_clear|${chatId}` }
    ]);

    inline_keyboard.push([
        { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
        { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
    ]);

    await bot.sendMessage(adminId, lines.join('\n'), { reply_markup: { inline_keyboard } });
}

async function setAdminScheduleSlots(chatId, adminId, slots, { fallbackLang } = {}) {
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const sanitized = sanitizeScheduleSlots(slots);
    if (sanitized.length === 0) {
        await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_schedule_invalid'));
        return;
    }

    await db.updateCheckinGroup(chatId, {
        autoMessageTimes: sanitized,
        checkinTime: sanitized[0]
    });

    await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_schedule_updated', {
        count: sanitized.length,
        times: sanitized.join(', ')
    }));
    await sendAdminMenu(adminId, chatId, { fallbackLang: lang, view: 'settings' });
}

async function resetAdminScheduleSlots(chatId, adminId, { fallbackLang } = {}) {
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const settings = await getGroupCheckinSettings(chatId);
    const fallbackSlot = normalizeTimeSlot(settings.checkinTime) || CHECKIN_DEFAULT_TIME;
    await db.updateCheckinGroup(chatId, {
        autoMessageTimes: [fallbackSlot],
        checkinTime: fallbackSlot
    });
    await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_schedule_cleared', { time: fallbackSlot }));
    await sendAdminMenu(adminId, chatId, { fallbackLang: lang, view: 'settings' });
}

async function promptAdminSummarySchedule(chatId, adminId, { fallbackLang } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const timezone = settings.timezone || CHECKIN_DEFAULT_TIMEZONE;
    const enabled = Number(settings.summaryMessageEnabled) === 1;
    const slots = enabled ? getSummaryScheduleSlots(settings) : [];
    const timesList = slots.map((slot, index) => `${index + 1}. ${slot}`).join('\n');
    const statusLine = enabled && slots.length > 0
        ? t(lang, 'checkin_admin_summary_schedule_current', { count: slots.length, times: timesList })
        : t(lang, 'checkin_admin_summary_schedule_none');
    const usingAutoFallback = enabled && (!Array.isArray(settings.summaryMessageTimes) || settings.summaryMessageTimes.length === 0);
    const lines = [
        t(lang, 'checkin_admin_summary_schedule_title'),
        t(lang, 'checkin_admin_summary_schedule_hint', { timezone }),
        '',
        statusLine
    ];
    if (usingAutoFallback && slots.length > 0) {
        lines.push('', t(lang, 'checkin_admin_summary_schedule_auto_note', { count: slots.length }));
    }
    const inline_keyboard = SUMMARY_SCHEDULE_PRESETS.map((preset) => ([{
        text: t(lang, preset.labelKey),
        callback_data: `checkin_admin_summary_schedule_preset|${chatId}|${preset.slots.join(',')}`
    }]));
    inline_keyboard.push([
        { text: t(lang, 'checkin_admin_button_summary_schedule_reset'), callback_data: `checkin_admin_summary_schedule_reset|${chatId}` }
    ]);
    inline_keyboard.push([
        { text: t(lang, 'checkin_admin_button_summary_schedule_sync'), callback_data: `checkin_admin_summary_schedule_sync|${chatId}` }
    ]);
    inline_keyboard.push([
        { text: t(lang, 'checkin_admin_button_summary_schedule_custom'), callback_data: `checkin_admin_summary_schedule_custom|${chatId}` },
        { text: t(lang, 'checkin_admin_button_summary_schedule_disable'), callback_data: `checkin_admin_summary_schedule_disable|${chatId}` }
    ]);
    inline_keyboard.push([
        { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatId}` },
        { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatId}` }
    ]);

    await bot.sendMessage(adminId, lines.join('\n'), {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard }
    });
}

async function setAdminSummaryScheduleSlots(chatId, adminId, slots, { fallbackLang } = {}) {
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const sanitized = sanitizeScheduleSlots(slots);
    if (sanitized.length === 0) {
        await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_summary_schedule_invalid'));
        return;
    }

    await db.updateCheckinGroup(chatId, {
        summaryMessageTimes: sanitized,
        summaryMessageEnabled: 1
    });
    await db.resetSummaryMessageLogs(chatId);

    await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_summary_schedule_updated', {
        count: sanitized.length,
        times: sanitized.join(', ')
    }));
    await sendAdminMenu(adminId, chatId, { fallbackLang: lang, view: 'settings' });
}

async function disableAdminSummarySchedule(chatId, adminId, { fallbackLang } = {}) {
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    await db.updateCheckinGroup(chatId, {
        summaryMessageTimes: [],
        summaryMessageEnabled: 0
    });
    await db.resetSummaryMessageLogs(chatId);
    await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_summary_schedule_disabled_alert'));
    await sendAdminMenu(adminId, chatId, { fallbackLang: lang, view: 'settings' });
}

async function resetAdminSummarySchedule(chatId, adminId, { fallbackLang } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const slots = getScheduleSlots(settings);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    await db.updateCheckinGroup(chatId, {
        summaryMessageTimes: slots,
        summaryMessageEnabled: 1
    });
    await db.resetSummaryMessageLogs(chatId);
    await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_summary_schedule_reset_success', {
        count: slots.length,
        times: slots.join(', ')
    }));
    await sendAdminMenu(adminId, chatId, { fallbackLang: lang, view: 'settings' });
}

async function syncAdminSummaryScheduleWithAuto(chatId, adminId, { fallbackLang } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const slots = getScheduleSlots(settings);
    await db.updateCheckinGroup(chatId, {
        summaryMessageTimes: [],
        summaryMessageEnabled: 1
    });
    await db.resetSummaryMessageLogs(chatId);
    await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_summary_schedule_sync_success', {
        count: slots.length,
        times: slots.join(', ')
    }));
    await sendAdminMenu(adminId, chatId, { fallbackLang: lang, view: 'settings' });
}

async function executeAdminRemoval(chatId, adminId, targetUserId, { fallbackLang } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const today = formatDateForTimezone(settings.timezone || CHECKIN_DEFAULT_TIMEZONE);
    const adminLang = await resolveNotificationLanguage(adminId, fallbackLang);
    const record = await db.getCheckinRecord(chatId, targetUserId, today);
    if (!record) {
        await sendEphemeralMessage(adminId, t(adminLang, 'checkin_admin_remove_missing'));
        return;
    }

    const success = await db.removeCheckinRecord(chatId, targetUserId, today);
    if (!success) {
        await sendEphemeralMessage(adminId, t(adminLang, 'checkin_admin_remove_missing'));
        return;
    }

    const profile = await resolveMemberProfile(chatId, targetUserId, adminLang);
    const walletLabel = record.walletAddress
        ? `<code>${escapeHtml(record.walletAddress)}</code>`
        : `<i>${escapeHtml(t(adminLang, 'checkin_admin_wallet_unknown'))}</i>`;
    const userLabel = `<b>${profile.link || escapeHtml(profile.displayName)}</b>`;
    const idLabel = buildAdminUserIdLink(targetUserId);

    await sendEphemeralMessage(
        adminId,
        t(adminLang, 'checkin_admin_remove_success', {
            user: userLabel,
            id: idLabel,
            wallet: walletLabel
        }),
        { parse_mode: 'HTML' }
    );
    try {
        const userLang = await resolveNotificationLanguage(targetUserId);
        await bot.sendMessage(targetUserId, t(userLang, 'checkin_dm_removed'));
    } catch (error) {
        // ignore DM failures
    }

    await sendAdminMenu(adminId, chatId, { fallbackLang: adminLang });
}

async function executeAdminUnlock(chatId, adminId, targetUserId, { fallbackLang } = {}) {
    const settings = await getGroupCheckinSettings(chatId);
    const today = formatDateForTimezone(settings.timezone || CHECKIN_DEFAULT_TIMEZONE);
    await db.unlockMemberCheckin(chatId, targetUserId);
    await db.clearDailyAttempts(chatId, targetUserId, today);
    const adminLang = await resolveNotificationLanguage(adminId, fallbackLang);
    const profile = await resolveMemberProfile(chatId, targetUserId, adminLang);
    const userLabel = `<b>${profile.link || escapeHtml(profile.displayName)}</b>`;
    const idLabel = buildAdminUserIdLink(targetUserId);
    await sendEphemeralMessage(adminId, t(adminLang, 'checkin_admin_unlock_success', {
        user: userLabel,
        id: idLabel
    }), { parse_mode: 'HTML' });
    try {
        const userLang = await resolveNotificationLanguage(targetUserId);
        await bot.sendMessage(targetUserId, t(userLang, 'checkin_dm_unlocked'));
    } catch (error) {
        // ignore DM failures
    }

    await sendAdminMenu(adminId, chatId, { fallbackLang: adminLang });
}

async function setAdminDailyPoints(chatId, adminId, value, { fallbackLang } = {}) {
    const numeric = Number(value);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    if (!Number.isFinite(numeric) || numeric < 0) {
        await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_points_invalid'));
        return;
    }

    await db.updateCheckinGroup(chatId, { dailyPoints: numeric });
    await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_points_updated', { value: numeric }));
    await sendAdminMenu(adminId, chatId, { fallbackLang: lang });
}

async function setAdminSummaryWindow(chatId, adminId, value, { fallbackLang } = {}) {
    const numeric = Number(value);
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_summary_invalid'));
        return;
    }

    await db.updateCheckinGroup(chatId, { summaryWindow: Math.round(numeric) });
    await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_summary_updated', { value: Math.round(numeric) }));
    await sendAdminMenu(adminId, chatId, { fallbackLang: lang });
}

async function setAdminQuestionWeights(chatId, adminId, weights, { fallbackLang } = {}) {
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const sanitized = {
        mathWeight: sanitizeWeightValue(weights.math, 0),
        physicsWeight: sanitizeWeightValue(weights.physics, 0),
        chemistryWeight: sanitizeWeightValue(weights.chemistry, 0)
    };
    if (sanitized.mathWeight + sanitized.physicsWeight + sanitized.chemistryWeight <= 0) {
        await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_weights_invalid'));
        return;
    }

    await db.updateCheckinGroup(chatId, sanitized);
    await sendEphemeralMessage(adminId, t(lang, 'checkin_admin_weights_updated'));
    await showQuestionWeightMenu(adminId, chatId, { fallbackLang: lang });
}

function parseQuestionWeightsInput(rawText) {
    if (typeof rawText !== 'string') {
        return null;
    }
    const cleaned = rawText.replace(/%/g, '').toLowerCase();
    const values = {};
    for (const key of QUESTION_TYPE_KEYS) {
        const regex = new RegExp(`${key}\s*=?\s*(-?\\d+(?:\\.\\d+)?)`);
        const match = cleaned.match(regex);
        if (match) {
            values[key] = Number(match[1]);
        }
    }
    if (Object.keys(values).length < QUESTION_TYPE_KEYS.length) {
        const numericParts = cleaned.split(/[\s,;\/|]+/)
            .map((part) => Number(part))
            .filter((value) => Number.isFinite(value));
        if (numericParts.length >= QUESTION_TYPE_KEYS.length) {
            values.math = numericParts[0];
            values.physics = numericParts[1];
            values.chemistry = numericParts[2];
        }
    }
    const weights = {};
    for (const key of QUESTION_TYPE_KEYS) {
        const value = values[key];
        if (!Number.isFinite(value) || value < 0) {
            return null;
        }
        weights[key] = value;
    }
    if (QUESTION_TYPE_KEYS.every((key) => weights[key] === 0)) {
        return null;
    }
    return weights;
}

function buildQuestionWeightKeyboard(chatId, lang) {
    const chatKey = chatId.toString();
    const inline_keyboard = QUESTION_WEIGHT_PRESETS.map((preset) => ([{
        text: t(lang, 'checkin_admin_weights_option', {
            math: `${preset.math}%`,
            physics: `${preset.physics}%`,
            chemistry: `${preset.chemistry}%`
        }),
        callback_data: `checkin_admin_weights_set|${chatKey}|${preset.math}|${preset.physics}|${preset.chemistry}`
    }]));
    inline_keyboard.push([{ text: t(lang, 'checkin_admin_button_custom'), callback_data: `checkin_admin_weights_custom|${chatKey}` }]);
    inline_keyboard.push([
        { text: t(lang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${chatKey}` },
        { text: t(lang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${chatKey}` }
    ]);
    return { inline_keyboard };
}

async function showQuestionWeightMenu(adminId, chatId, { fallbackLang } = {}) {
    const lang = await resolveNotificationLanguage(adminId, fallbackLang);
    const settings = await getGroupCheckinSettings(chatId);
    const weights = getQuestionWeights(settings);
    const percents = formatQuestionWeightPercentages(weights);
    const lines = [
        t(lang, 'checkin_admin_weights_title'),
        t(lang, 'checkin_admin_weights_current', percents),
        '',
        t(lang, 'checkin_admin_weights_hint')
    ];
    await bot.sendMessage(adminId, lines.join('\n'), {
        reply_markup: buildQuestionWeightKeyboard(chatId, lang)
    });
}

async function resolveNotificationLanguage(chatId, fallbackLang) {
    try {
        if (chatId) {
            const info = await db.getUserLanguageInfo(chatId);
            if (info && info.lang) {
                return resolveLangCode(info.lang);
            }
        }
    } catch (error) {
        console.warn(`[Notify] Không thể đọc ngôn ngữ đã lưu cho ${chatId}: ${error.message}`);
    }

    return resolveLangCode(fallbackLang || defaultLang);
}

async function resolveGroupLanguage(chatId, fallbackLang) {
    if (!chatId) {
        return resolveLangCode(fallbackLang || defaultLang);
    }

    try {
        const subscription = await db.getGroupSubscription(chatId.toString());
        if (subscription && subscription.lang) {
            return resolveLangCode(subscription.lang);
        }
    } catch (error) {
        console.warn(`[Notify] Không thể đọc ngôn ngữ nhóm cho ${chatId}: ${error.message}`);
    }

    return resolveLangCode(fallbackLang || defaultLang);
}


function formatUsdPrice(amount) {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) {
        return '0.0000';
    }

    let minimumFractionDigits = 2;
    let maximumFractionDigits = 2;

    if (numeric < 1 && numeric >= 0.01) {
        minimumFractionDigits = 4;
        maximumFractionDigits = 4;
    } else if (numeric < 0.01 && numeric >= 0.0001) {
        minimumFractionDigits = 6;
        maximumFractionDigits = 6;
    } else if (numeric < 0.0001) {
        minimumFractionDigits = 8;
        maximumFractionDigits = 8;
    }

    return numeric.toLocaleString('en-US', {
        minimumFractionDigits,
        maximumFractionDigits
    });
}

function formatUsdCompact(amount) {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric === 0) {
        return '—';
    }

    try {
        return numeric.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            notation: 'compact',
            maximumFractionDigits: 2
        });
    } catch (error) {
        const abs = Math.abs(numeric);
        if (abs >= 1e9) {
            return `$${(numeric / 1e9).toFixed(2)}B`;
        }
        if (abs >= 1e6) {
            return `$${(numeric / 1e6).toFixed(2)}M`;
        }
        if (abs >= 1e3) {
            return `$${(numeric / 1e3).toFixed(2)}K`;
        }
        return `$${numeric.toFixed(2)}`;
    }
}

function formatPercentage(value, options = {}) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return '0.00%';
    }

    const { minimumFractionDigits = 2, maximumFractionDigits = 2, includeSign = true } = options;
    const formatter = new Intl.NumberFormat('en-US', {
        minimumFractionDigits,
        maximumFractionDigits
    });

    const formatted = formatter.format(Math.abs(numeric));
    const sign = includeSign ? (numeric >= 0 ? '+' : '-') : '';
    return `${sign}${formatted}%`;
}

function normalizePercentageValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return null;
    }

    if (Math.abs(numeric) <= 1) {
        return numeric * 100;
    }

    return numeric;
}

function formatTokenQuantity(amount, options = {}) {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) {
        return '—';
    }

    const { minimumFractionDigits = 2, maximumFractionDigits = 4 } = options;
    return numeric.toLocaleString('en-US', {
        minimumFractionDigits,
        maximumFractionDigits
    });
}

function formatTokenAmountFromUnits(amount, decimals, options = {}) {
    const bigIntValue = parseBigIntValue(amount);
    if (bigIntValue === null) {
        return null;
    }

    const digits = Number.isFinite(decimals) ? Math.max(0, Math.trunc(decimals)) : 0;

    try {
        const formatted = ethers.formatUnits(bigIntValue, digits);
        const numeric = Number(formatted);
        if (Number.isFinite(numeric)) {
            const minimumFractionDigits = Number.isFinite(options.minimumFractionDigits)
                ? options.minimumFractionDigits
                : (Math.abs(numeric) < 1 ? 6 : 2);
            const maximumFractionDigits = Number.isFinite(options.maximumFractionDigits)
                ? options.maximumFractionDigits
                : Math.max(minimumFractionDigits, Math.abs(numeric) < 1 ? 8 : 6);

            return numeric.toLocaleString('en-US', {
                minimumFractionDigits,
                maximumFractionDigits
            });
        }

        return formatted;
    } catch (error) {
        return null;
    }
}

function formatTimestampRange(startMs, endMs) {
    const start = startMs ? new Date(startMs) : null;
    const end = endMs ? new Date(endMs) : null;

    const format = (date) => {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return '—';
        }
        return date.toISOString().replace('T', ' ').slice(0, 16);
    };

    return { start: format(start), end: format(end) };
}

function formatRelativeTime(timestampMs) {
    if (!Number.isFinite(Number(timestampMs))) {
        return null;
    }

    const now = Date.now();
    const diffMs = now - Number(timestampMs);
    if (!Number.isFinite(diffMs)) {
        return null;
    }

    const diffSeconds = Math.max(Math.round(diffMs / 1000), 0);
    if (diffSeconds < 60) {
        return `${diffSeconds}s`;
    }

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
        return `${diffMinutes}m`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 48) {
        return `${diffHours}h`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) {
        return `${diffDays}d`;
    }

    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) {
        return `${diffMonths}mo`;
    }

    const diffYears = Math.floor(diffMonths / 12);
    return `${diffYears}y`;
}

function renderSparkline(values) {
    if (!Array.isArray(values) || values.length === 0) {
        return null;
    }

    const numericValues = values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));

    if (numericValues.length === 0) {
        return null;
    }

    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);

    if (min === max) {
        return '▅'.repeat(numericValues.length);
    }

    const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const scale = (value) => {
        const normalized = (value - min) / (max - min);
        const index = Math.min(blocks.length - 1, Math.max(0, Math.round(normalized * (blocks.length - 1))));
        return blocks[index];
    };

    return numericValues.map((value) => scale(value)).join('');
}

async function fetchBanmaoQuoteSnapshot(options = {}) {
    if (!OKX_BANMAO_TOKEN_ADDRESS || !OKX_QUOTE_TOKEN_ADDRESS) {
        throw new Error('Missing OKX token addresses');
    }

    const { chainName, slippagePercent = '0.5', amount: amountOverride } = options;
    const query = await buildOkxDexQuery(chainName, { includeToken: false, includeQuote: false });
    const context = await resolveOkxChainContext(chainName);

    const chainIndex = Number.isFinite(query.chainIndex)
        ? Number(query.chainIndex)
        : (Number.isFinite(context?.chainIndex) ? Number(context.chainIndex) : null);

    if (!Number.isFinite(chainIndex)) {
        throw new Error('Unable to resolve OKX chain index');
    }

    const amount = amountOverride || await resolveBanmaoQuoteAmount(chainName);
    const requestQuery = {
        chainIndex,
        fromTokenAddress: OKX_BANMAO_TOKEN_ADDRESS,
        toTokenAddress: OKX_QUOTE_TOKEN_ADDRESS,
        amount,
        swapMode: 'exactIn',
        slippagePercent
    };

    const payload = await okxJsonRequest('GET', '/api/v6/dex/aggregator/quote', {
        query: requestQuery
    });

    const quoteEntries = unwrapOkxData(payload);
    const quoteEntry = selectOkxQuoteByLiquidity(quoteEntries) || unwrapOkxFirst(payload);
    if (!quoteEntry) {
        return null;
    }

    const priceInfo = extractOkxQuotePrice(quoteEntry, { requestAmount: amount });
    if (!Number.isFinite(priceInfo.price) || priceInfo.price <= 0) {
        return null;
    }

    const chainLabel = context?.chainName || context?.chainShortName || query.chainShortName || chainName || '(default)';
    const okbUsd = resolveOkbUsdPrice(priceInfo.tokenUnitPrices);
    const priceOkb = Number.isFinite(priceInfo.price) && Number.isFinite(okbUsd) && okbUsd > 0
        ? priceInfo.price / okbUsd
        : null;

    const extractSymbol = (token, fallback) => {
        if (!token || typeof token !== 'object') {
            return fallback;
        }

        const candidate = typeof token.tokenSymbol === 'string'
            ? token.tokenSymbol
            : (typeof token.symbol === 'string' ? token.symbol : null);

        if (candidate && candidate.trim()) {
            return candidate.trim().toUpperCase();
        }

        return fallback;
    };

    const routerList = Array.isArray(quoteEntry.dexRouterList) ? quoteEntry.dexRouterList : [];
    const firstRoute = routerList[0] || null;
    const lastRoute = routerList.length > 0 ? routerList[routerList.length - 1] : null;

    const fromSymbol = extractSymbol(quoteEntry.fromToken, extractSymbol(firstRoute?.fromToken, 'BANMAO'));
    const toSymbol = extractSymbol(quoteEntry.toToken, extractSymbol(lastRoute?.toToken, 'USDT'));

    const tradeFeeUsd = normalizeNumeric(quoteEntry.tradeFee);
    const priceImpactPercent = normalizeNumeric(quoteEntry.priceImpactPercent);
    const routeLabel = summarizeOkxQuoteRoute(quoteEntry);

    return {
        price: priceInfo.price,
        priceOkb: Number.isFinite(priceOkb) ? priceOkb : null,
        okbUsd: Number.isFinite(okbUsd) ? okbUsd : null,
        chain: chainLabel,
        chainIndex,
        source: 'OKX DEX quote',
        amount,
        decimals: priceInfo.fromDecimals,
        quoteDecimals: priceInfo.toDecimals,
        fromAmount: priceInfo.fromAmount,
        toAmount: priceInfo.toAmount,
        fromSymbol,
        toSymbol,
        tradeFeeUsd: Number.isFinite(tradeFeeUsd) ? tradeFeeUsd : null,
        priceImpactPercent: Number.isFinite(priceImpactPercent) ? priceImpactPercent : null,
        routeLabel,
        tokenPrices: priceInfo.tokenUnitPrices,
        derivedPrice: priceInfo.amountPrice,
        raw: quoteEntry
    };
}

async function resolveBanmaoQuoteAmount(chainName) {
    const decimals = await getBanmaoTokenDecimals(chainName);
    const safeDecimals = Number.isFinite(decimals) ? Math.max(0, Math.min(36, Math.trunc(decimals))) : BANMAO_DECIMALS_DEFAULT;

    try {
        return (BigInt(10) ** BigInt(safeDecimals)).toString();
    } catch (error) {
        // Fallback to 1 * 10^18 if exponentiation fails for any reason
        return '1000000000000000000';
    }
}

async function getBanmaoTokenDecimals(chainName) {
    const now = Date.now();
    if (banmaoDecimalsCache !== null && banmaoDecimalsFetchedAt > 0 && now - banmaoDecimalsFetchedAt < BANMAO_DECIMALS_CACHE_TTL) {
        return banmaoDecimalsCache;
    }

    try {
        const profile = await fetchBanmaoTokenProfile({ chainName });
        const decimals = pickOkxNumeric(profile || {}, ['decimals', 'tokenDecimals', 'tokenDecimal', 'decimal']);
        if (Number.isFinite(decimals)) {
            banmaoDecimalsCache = Math.max(0, Math.trunc(decimals));
            banmaoDecimalsFetchedAt = now;
            return banmaoDecimalsCache;
        }
    } catch (error) {
        console.warn(`[BanmaoDecimals] Failed to load token profile: ${error.message}`);
    }

    return banmaoDecimalsCache !== null ? banmaoDecimalsCache : BANMAO_DECIMALS_DEFAULT;
}

async function resolveTokenDecimals(tokenAddress, options = {}) {
    const { chainName, chainIndex, fallback = null } = options;

    if (!tokenAddress || typeof tokenAddress !== 'string') {
        return fallback;
    }

    const normalized = normalizeOkxConfigAddress(tokenAddress);
    const addressText = normalized || tokenAddress;
    const lower = addressText.toLowerCase();

    if (BANMAO_ADDRESS_LOWER && lower === BANMAO_ADDRESS_LOWER) {
        return getBanmaoTokenDecimals(chainName);
    }

    if (OKX_QUOTE_ADDRESS_LOWER && lower === OKX_QUOTE_ADDRESS_LOWER) {
        return 6;
    }

    if (OKX_OKB_TOKEN_ADDRESSES.includes(lower)) {
        return 18;
    }

    const cached = tokenDecimalsCache.get(lower);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
        return cached.value;
    }

    try {
        const profile = await fetchBanmaoTokenProfile({ chainName, tokenAddress: addressText });
        const decimals = pickOkxNumeric(profile || {}, ['decimals', 'tokenDecimals', 'tokenDecimal', 'decimal']);
        if (Number.isFinite(decimals)) {
            tokenDecimalsCache.set(lower, { value: Math.max(0, Math.trunc(decimals)), expiresAt: now + BANMAO_DECIMALS_CACHE_TTL });
            return Math.max(0, Math.trunc(decimals));
        }
    } catch (error) {
        console.warn(`[TokenDecimals] Failed to resolve decimals for ${tokenAddress}: ${error.message}`);
    }

    tokenDecimalsCache.set(lower, { value: fallback, expiresAt: now + (BANMAO_DECIMALS_CACHE_TTL / 2) });
    return fallback;
}

function parseBigIntValue(value) {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === 'bigint') {
        return value;
    }

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            return null;
        }
        return BigInt(Math.trunc(value));
    }

    if (typeof value === 'string') {
        const cleaned = value.replace(/[,_\s]/g, '');
        if (!cleaned) {
            return null;
        }

        if (/^-?\d+$/.test(cleaned)) {
            try {
                return BigInt(cleaned);
            } catch (error) {
                return null;
            }
        }
    }

    return null;
}

function formatBigIntValue(value, decimals = 18, options = {}) {
    if (value === null || value === undefined) {
        return null;
    }

    let bigIntValue;
    try {
        bigIntValue = BigInt(value);
    } catch (error) {
        return null;
    }

    let safeDecimals = Number(decimals);
    if (!Number.isFinite(safeDecimals) || safeDecimals < 0) {
        safeDecimals = 18;
    }

    try {
        return ethers.formatUnits(bigIntValue, safeDecimals, options);
    } catch (error) {
        return null;
    }
}

function extractOkxTokenUnitPrice(token) {
    if (!token || typeof token !== 'object') {
        return null;
    }

    const keys = ['tokenUnitPrice', 'unitPrice', 'priceUsd', 'usdPrice', 'price'];
    for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(token, key)) {
            continue;
        }

        const numeric = normalizeNumeric(token[key]);
        if (Number.isFinite(numeric)) {
            return numeric;
        }
    }

    return null;
}

function normalizeOkxTokenAddress(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const normalized = normalizeOkxConfigAddress(value);
    if (normalized) {
        return normalized.toLowerCase();
    }

    const trimmed = value.trim();
    return trimmed ? trimmed.toLowerCase() : null;
}

function collectOkxTokenUnitPrices(entry, routerList = []) {
    const tokens = [];
    const byAddress = new Map();
    const bySymbol = new Map();

    const register = (token, meta = {}) => {
        if (!token || typeof token !== 'object') {
            return;
        }

        const unitPrice = extractOkxTokenUnitPrice(token);
        if (!Number.isFinite(unitPrice)) {
            return;
        }

        const symbolRaw = typeof token.tokenSymbol === 'string'
            ? token.tokenSymbol
            : (typeof token.symbol === 'string' ? token.symbol : null);
        const symbol = symbolRaw ? symbolRaw.trim() : null;

        const addressCandidates = [
            token.tokenContractAddress,
            token.tokenAddress,
            token.contractAddress,
            token.address,
            token.contract,
            token.mintAddress
        ];

        let normalizedAddress = null;
        for (const candidate of addressCandidates) {
            const normalized = normalizeOkxTokenAddress(candidate);
            if (normalized) {
                normalizedAddress = normalized;
                break;
            }
        }

        const record = {
            unitPrice,
            symbol,
            address: normalizedAddress,
            meta,
            raw: token
        };

        tokens.push(record);

        if (normalizedAddress && !byAddress.has(normalizedAddress)) {
            byAddress.set(normalizedAddress, record);
        }

        if (symbol) {
            const symbolKey = symbol.toLowerCase();
            if (!bySymbol.has(symbolKey)) {
                bySymbol.set(symbolKey, record);
            }
        }
    };

    register(entry?.fromToken, { source: 'fromToken' });
    register(entry?.toToken, { source: 'toToken' });
    register(entry?.sellToken, { source: 'sellToken' });
    register(entry?.buyToken, { source: 'buyToken' });

    routerList.forEach((route, index) => {
        register(route?.fromToken, { source: 'router', hop: index, side: 'from' });
        register(route?.toToken, { source: 'router', hop: index, side: 'to' });
    });

    const fromTokenEntry = BANMAO_ADDRESS_LOWER && byAddress.has(BANMAO_ADDRESS_LOWER)
        ? byAddress.get(BANMAO_ADDRESS_LOWER)
        : null;
    const quoteTokenEntry = OKX_QUOTE_ADDRESS_LOWER && byAddress.has(OKX_QUOTE_ADDRESS_LOWER)
        ? byAddress.get(OKX_QUOTE_ADDRESS_LOWER)
        : null;

    return {
        list: tokens,
        byAddress,
        bySymbol,
        fromTokenUsd: fromTokenEntry && Number.isFinite(fromTokenEntry.unitPrice)
            ? fromTokenEntry.unitPrice
            : null,
        quoteTokenUsd: quoteTokenEntry && Number.isFinite(quoteTokenEntry.unitPrice)
            ? quoteTokenEntry.unitPrice
            : null
    };
}

function summarizeOkxQuoteRoute(entry) {
    const list = Array.isArray(entry?.dexRouterList) ? entry.dexRouterList : [];
    if (list.length === 0) {
        return null;
    }

    const seen = new Set();
    const names = [];

    const normalizeName = (value) => {
        if (!value || typeof value !== 'string') {
            return null;
        }

        const trimmed = value.trim();
        return trimmed ? trimmed : null;
    };

    const extractDexName = (hop) => {
        const nameCandidates = [
            hop?.dexProtocol?.dexName,
            hop?.dexProtocol?.name,
            hop?.dexName
        ];

        for (const candidate of nameCandidates) {
            const normalized = normalizeName(candidate);
            if (normalized) {
                return normalized;
            }
        }

        return null;
    };

    const extractTokenAddress = (token) => {
        if (!token || typeof token !== 'object') {
            return null;
        }

        const candidates = [
            token.tokenContractAddress,
            token.tokenAddress,
            token.contractAddress,
            token.address
        ];

        for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate) {
                return candidate.trim().toLowerCase();
            }
        }

        return null;
    };

    const pushName = (name) => {
        if (!name) {
            return;
        }

        const key = name.toLowerCase();
        if (seen.has(key)) {
            return;
        }

        seen.add(key);
        names.push(name);
    };

    // Prioritize the hop that handles BANMAO so the main route highlights DYOR Swap.
    if (BANMAO_ADDRESS_LOWER) {
        for (const hop of list) {
            const fromAddress = extractTokenAddress(hop?.fromToken);
            if (fromAddress && fromAddress === BANMAO_ADDRESS_LOWER) {
                pushName(extractDexName(hop));
                break;
            }
        }
    }

    for (const hop of list) {
        pushName(extractDexName(hop));
    }

    if (names.length === 0) {
        return null;
    }

    return names.join(' → ');
}

function resolveOkbUsdPrice(tokenPrices) {
    if (!tokenPrices) {
        return null;
    }

    const { byAddress, bySymbol, list } = tokenPrices;

    if (byAddress instanceof Map) {
        for (const address of OKX_OKB_TOKEN_ADDRESSES) {
            if (!address) {
                continue;
            }

            const entry = byAddress.get(address);
            if (entry && Number.isFinite(entry.unitPrice)) {
                return entry.unitPrice;
            }
        }
    }

    if (bySymbol instanceof Map) {
        for (const key of OKX_OKB_SYMBOL_KEYS) {
            if (!key) {
                continue;
            }

            const entry = bySymbol.get(key);
            if (entry && Number.isFinite(entry.unitPrice)) {
                return entry.unitPrice;
            }
        }
    }

    if (Array.isArray(list)) {
        for (const entry of list) {
            if (!entry || !Number.isFinite(entry.unitPrice)) {
                continue;
            }

            const symbol = typeof entry.symbol === 'string' ? entry.symbol.toUpperCase() : '';
            if (symbol.includes('OKB')) {
                return entry.unitPrice;
            }
        }
    }

    return null;
}

function selectOkxQuoteByLiquidity(quotes) {
    if (!Array.isArray(quotes) || quotes.length === 0) {
        return null;
    }

    let bestEntry = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const entry of quotes) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }

        const score = computeOkxQuoteLiquidityScore(entry);
        if (Number.isFinite(score)) {
            if (!Number.isFinite(bestScore) || score > bestScore) {
                bestScore = score;
                bestEntry = entry;
            }
        } else if (bestEntry === null) {
            bestEntry = entry;
        }
    }

    return bestEntry;
}

function computeOkxQuoteLiquidityScore(entry) {
    const routerList = Array.isArray(entry?.dexRouterList) ? entry.dexRouterList : [];
    let bestLiquidity = null;

    for (const hop of routerList) {
        const hopLiquidity = pickOkxNumeric(hop, [
            'liquidityUsd',
            'usdLiquidity',
            'poolLiquidity',
            'liquidity',
            'reserveUsd',
            'valueUsd'
        ]);

        if (Number.isFinite(hopLiquidity)) {
            bestLiquidity = Number.isFinite(bestLiquidity)
                ? Math.max(bestLiquidity, hopLiquidity)
                : hopLiquidity;
        }
    }

    if (Number.isFinite(bestLiquidity)) {
        return bestLiquidity;
    }

    const decimalsCandidates = [
        pickOkxNumeric(entry, ['toTokenDecimals', 'buyTokenDecimals', 'toDecimals', 'toTokenDecimal']),
        pickOkxNumeric(entry?.toToken, ['decimal', 'decimals', 'tokenDecimals', 'tokenDecimal']),
        pickOkxNumeric(entry?.buyToken, ['decimal', 'decimals', 'tokenDecimals', 'tokenDecimal']),
        pickOkxNumeric(routerList.length > 0 ? routerList[routerList.length - 1]?.toToken : null, ['decimal', 'decimals', 'tokenDecimals', 'tokenDecimal'])
    ];

    const toDecimals = normalizeDecimalsCandidate(decimalsCandidates);
    const toAmount = parseBigIntValue(
        entry?.toTokenAmount
        ?? entry?.buyTokenAmount
        ?? entry?.toAmount
        ?? entry?.outputAmount
    );

    if (toAmount === null) {
        return null;
    }

    const decimals = Number.isFinite(toDecimals) ? Math.max(0, Math.trunc(toDecimals)) : 0;
    let quantity = null;

    try {
        quantity = Number(ethers.formatUnits(toAmount, decimals));
    } catch (error) {
        quantity = null;
    }

    if (!Number.isFinite(quantity)) {
        const numeric = Number(toAmount);
        if (Number.isFinite(numeric)) {
            quantity = numeric / Math.pow(10, decimals);
        }
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
        return null;
    }

    const tokenPrices = collectOkxTokenUnitPrices(entry, routerList);
    const quoteUsd = Number.isFinite(tokenPrices?.quoteTokenUsd) && tokenPrices.quoteTokenUsd > 0
        ? tokenPrices.quoteTokenUsd
        : 1;

    return quantity * quoteUsd;
}

function extractOkxQuotePrice(entry, options = {}) {
    if (!entry || typeof entry !== 'object') {
        return {
            price: null,
            fromDecimals: null,
            toDecimals: null,
            fromAmount: null,
            toAmount: null,
            tokenUnitPrices: null,
            quotePrice: null,
            amountPrice: null
        };
    }

    const directPrice = extractOkxPriceValue(entry);
    const routerList = Array.isArray(entry.dexRouterList) ? entry.dexRouterList : [];
    const firstRoute = routerList[0] || null;
    const lastRoute = routerList.length > 0 ? routerList[routerList.length - 1] : null;

    const fromDecimalsCandidates = [
        pickOkxNumeric(entry, ['fromTokenDecimals', 'sellTokenDecimals', 'fromDecimals', 'fromTokenDecimal']),
        pickOkxNumeric(entry.fromToken, ['decimal', 'decimals', 'tokenDecimals', 'tokenDecimal']),
        pickOkxNumeric(entry.sellToken, ['decimal', 'decimals', 'tokenDecimals', 'tokenDecimal']),
        pickOkxNumeric(firstRoute?.fromToken, ['decimal', 'decimals', 'tokenDecimals', 'tokenDecimal'])
    ];

    const toDecimalsCandidates = [
        pickOkxNumeric(entry, ['toTokenDecimals', 'buyTokenDecimals', 'toDecimals', 'toTokenDecimal']),
        pickOkxNumeric(entry.toToken, ['decimal', 'decimals', 'tokenDecimals', 'tokenDecimal']),
        pickOkxNumeric(entry.buyToken, ['decimal', 'decimals', 'tokenDecimals', 'tokenDecimal']),
        pickOkxNumeric(lastRoute?.toToken, ['decimal', 'decimals', 'tokenDecimals', 'tokenDecimal'])
    ];

    const fromDecimals = normalizeDecimalsCandidate(fromDecimalsCandidates);
    const toDecimals = normalizeDecimalsCandidate(toDecimalsCandidates);

    const tokenPrices = collectOkxTokenUnitPrices(entry, routerList);

    const fromAmount = parseBigIntValue(
        entry.fromTokenAmount
        ?? entry.sellTokenAmount
        ?? entry.fromAmount
        ?? entry.inputAmount
        ?? options.requestAmount
    );

    const toAmount = parseBigIntValue(
        entry.toTokenAmount
        ?? entry.buyTokenAmount
        ?? entry.toAmount
        ?? entry.outputAmount
    );

    const priceFromAmounts = (fromAmount !== null && toAmount !== null)
        ? computePriceFromTokenAmounts(fromAmount, toAmount, fromDecimals, toDecimals)
        : null;

    let price = tokenPrices && Number.isFinite(tokenPrices.fromTokenUsd)
        ? tokenPrices.fromTokenUsd
        : null;

    if (!Number.isFinite(price) && Number.isFinite(directPrice)) {
        price = Number(directPrice);
    }

    if (!Number.isFinite(price) && Number.isFinite(priceFromAmounts)) {
        price = priceFromAmounts;
    }

    const toAmountUsd = pickOkxNumeric(entry, ['toAmountUsd', 'toUsdAmount', 'toAmountInUsd', 'usdAmount']);
    if (!Number.isFinite(price) && Number.isFinite(toAmountUsd) && fromAmount !== null) {
        const decimals = Number.isFinite(fromDecimals) ? fromDecimals : 0;
        const fromNumeric = Number(fromAmount);
        if (Number.isFinite(fromNumeric) && fromNumeric > 0) {
            const scale = Math.pow(10, decimals);
            price = (toAmountUsd / fromNumeric) * scale;
        }
    }

    if (!Number.isFinite(price)) {
        price = null;
    }

    return {
        price,
        fromDecimals,
        toDecimals,
        fromAmount,
        toAmount,
        tokenUnitPrices: tokenPrices,
        quotePrice: Number.isFinite(directPrice) ? Number(directPrice) : null,
        amountPrice: Number.isFinite(priceFromAmounts) ? priceFromAmounts : null
    };
}

function normalizeDecimalsCandidate(candidates) {
    if (!Array.isArray(candidates)) {
        return null;
    }

    for (const candidate of candidates) {
        const numeric = normalizeNumeric(candidate);
        if (Number.isFinite(numeric)) {
            return Math.max(0, Math.trunc(numeric));
        }
    }

    return null;
}

function computePriceFromTokenAmounts(fromAmount, toAmount, fromDecimals, toDecimals) {
    if (fromAmount === null || toAmount === null) {
        return null;
    }

    const hasFromDecimals = Number.isFinite(fromDecimals);
    const hasToDecimals = Number.isFinite(toDecimals);
    const fromDigits = hasFromDecimals ? Math.max(0, Math.trunc(fromDecimals)) : 0;
    const toDigits = hasToDecimals ? Math.max(0, Math.trunc(toDecimals)) : 0;

    try {
        const numerator = toAmount * (BigInt(10) ** BigInt(fromDigits));
        const denominator = fromAmount * (BigInt(10) ** BigInt(toDigits));
        if (denominator === 0n) {
            return null;
        }

        const ratio = Number(numerator) / Number(denominator);
        if (Number.isFinite(ratio)) {
            return ratio;
        }
    } catch (error) {
        // Fallback to floating point math below
    }

    const fromNumeric = Number(fromAmount);
    const toNumeric = Number(toAmount);
    if (Number.isFinite(fromNumeric) && fromNumeric > 0 && Number.isFinite(toNumeric)) {
        let ratio = toNumeric / fromNumeric;
        if (hasFromDecimals || hasToDecimals) {
            const decimalsDiff = fromDigits - toDigits;
            if (decimalsDiff !== 0) {
                ratio *= Math.pow(10, decimalsDiff);
            }
        }
        return Number.isFinite(ratio) ? ratio : null;
    }

    return null;
}

async function fetchBanmaoPrice() {
    const errors = [];

    try {
        const quoteSnapshot = await fetchBanmaoQuoteSnapshot();
        if (quoteSnapshot && Number.isFinite(quoteSnapshot.price)) {
            return quoteSnapshot;
        }
    } catch (error) {
        console.warn(`[BanmaoPrice] Quote snapshot failed: ${error.message}`);
        errors.push(error);
    }

    try {
        const snapshot = await fetchBanmaoMarketSnapshot();
        if (snapshot && Number.isFinite(snapshot.price)) {
            return snapshot;
        }
    } catch (error) {
        console.warn(`[BanmaoPrice] Market snapshot failed: ${error.message}`);
        errors.push(error);
    }

    try {
        const fallbackTicker = await tryFetchOkxMarketTicker();
        if (fallbackTicker) {
            return fallbackTicker;
        }
    } catch (error) {
        console.warn(`[BanmaoPrice] Market ticker fallback failed: ${error.message}`);
        errors.push(error);
    }

    if (errors.length > 0) {
        throw errors[errors.length - 1];
    }

    throw new Error('No price data available');
}

async function fetchBanmaoMarketSnapshot() {
    const chainNames = getOkxChainShortNameCandidates();
    const errors = [];

    for (const chainName of chainNames) {
        try {
            const snapshot = await fetchBanmaoMarketSnapshotForChain(chainName);
            if (snapshot) {
                return snapshot;
            }
        } catch (error) {
            errors.push(error);
        }
    }

    try {
        const fallbackSnapshot = await fetchBanmaoMarketSnapshotForChain();
        if (fallbackSnapshot) {
            return fallbackSnapshot;
        }
    } catch (error) {
        errors.push(error);
    }

    if (errors.length > 0) {
        throw errors[errors.length - 1];
    }

    return null;
}

async function fetchBanmaoMarketSnapshotForChain(chainName) {
    if (!OKX_BANMAO_TOKEN_ADDRESS) {
        throw new Error('Missing OKX_BANMAO_TOKEN_ADDRESS');
    }
    return fetchTokenMarketSnapshotForChain({ chainName, tokenAddress: OKX_BANMAO_TOKEN_ADDRESS });
}

async function fetchTokenMarketSnapshot(options = {}) {
    const { tokenAddress, chainName } = options;
    if (!tokenAddress) {
        return null;
    }

    const normalized = normalizeOkxConfigAddress(tokenAddress) || tokenAddress;
    if (!normalized) {
        return null;
    }

    const errors = [];
    const chainCandidates = chainName ? [chainName] : getOkxChainShortNameCandidates();

    for (const candidate of chainCandidates) {
        try {
            const snapshot = await fetchTokenMarketSnapshotForChain({ chainName: candidate, tokenAddress: normalized });
            if (snapshot) {
                return snapshot;
            }
        } catch (error) {
            errors.push(error);
        }
    }

    try {
        const fallbackSnapshot = await fetchTokenMarketSnapshotForChain({ tokenAddress: normalized });
        if (fallbackSnapshot) {
            return fallbackSnapshot;
        }
    } catch (error) {
        errors.push(error);
    }

    if (errors.length > 0) {
        throw errors[errors.length - 1];
    }

    return null;
}

async function fetchTokenMarketSnapshotForChain({ chainName, tokenAddress }) {
    if (!tokenAddress) {
        return null;
    }
    const query = await buildOkxDexQuery(chainName, { tokenAddress });
    const chainLabel = query.chainShortName || chainName || '(default)';
    const errors = [];

    let priceInfoEntry = null;
    try {
        const payload = await callOkxDexEndpoint('/api/v6/dex/market/price-info', query, { method: 'POST' });
        priceInfoEntry = unwrapOkxFirst(payload);
    } catch (error) {
        errors.push(new Error(`[price-info:${chainLabel}] ${error.message}`));
    }

    let priceEntry = priceInfoEntry;
    let source = 'OKX DEX price-info';

    if (!Number.isFinite(extractOkxPriceValue(priceEntry))) {
        try {
            const payload = await callOkxDexEndpoint('/api/v6/dex/market/price', query, { method: 'POST' });
            priceEntry = unwrapOkxFirst(payload);
            source = 'OKX DEX price';
        } catch (error) {
            errors.push(new Error(`[price:${chainLabel}] ${error.message}`));
        }
    }

    if (!Number.isFinite(extractOkxPriceValue(priceEntry))) {
        // fallback handled below
    }

    const tokenPrices = collectOkxTokenUnitPrices(priceEntry || priceInfoEntry);

    let price = extractOkxPriceValue(priceEntry);
    if (!Number.isFinite(price) && tokenPrices && Number.isFinite(tokenPrices.fromTokenUsd)) {
        price = tokenPrices.fromTokenUsd;
    }

    if (!Number.isFinite(price)) {
        if (errors.length > 0) {
            throw errors[errors.length - 1];
        }
        return null;
    }

    const metricsSource = priceInfoEntry || priceEntry || {};
    const changeAbs = pickOkxNumeric(metricsSource, ['usdChange24h', 'change24h', 'priceChangeUsd', 'priceChange', 'usdChange']);
    const changePercent = pickOkxNumeric(metricsSource, ['changeRate', 'changePercent', 'priceChangePercent', 'percentChange24h', 'change24hPercent']);
    const volume = pickOkxNumeric(metricsSource, ['usdVolume24h', 'volumeUsd24h', 'volume24h', 'turnover24h', 'usdTurnover24h']);
    const liquidity = pickOkxNumeric(metricsSource, ['usdLiquidity', 'liquidityUsd', 'poolLiquidity', 'liquidity']);
    const marketCap = pickOkxNumeric(metricsSource, ['usdMarketCap', 'marketCap', 'fdvUsd', 'fullyDilutedMarketCap', 'marketCapUsd']);
    const supply = pickOkxNumeric(metricsSource, ['totalSupply', 'supply', 'circulatingSupply']);
    const okbUsd = resolveOkbUsdPrice(tokenPrices);
    const priceOkb = Number.isFinite(price) && Number.isFinite(okbUsd) && okbUsd > 0
        ? price / okbUsd
        : null;

    return {
        price,
        priceOkb: Number.isFinite(priceOkb) ? priceOkb : null,
        okbUsd: Number.isFinite(okbUsd) ? okbUsd : null,
        changeAbs,
        changePercent,
        volume,
        liquidity,
        marketCap,
        supply,
        chain: chainLabel,
        source,
        tokenPrices,
        raw: { priceEntry, priceInfoEntry }
    };
}

async function fetchBanmaoTokenProfile(options = {}) {
    const { chainName, tokenAddress } = options;
    const query = await buildOkxDexQuery(chainName, { includeToken: false });
    const normalizedAddress = tokenAddress
        ? normalizeOkxConfigAddress(tokenAddress) || tokenAddress
        : OKX_BANMAO_TOKEN_ADDRESS;

    if (normalizedAddress) {
        query.tokenAddress = normalizedAddress;
        query.tokenContractAddress = normalizedAddress;
    }

    const payload = await callOkxDexEndpoint('/api/v6/dex/market/token/basic-info', query, { method: 'POST' });
    return unwrapOkxFirst(payload);
}
function decimalToRawBigInt(amount, decimals) {
    if (!Number.isFinite(Number(decimals))) {
        return null;
    }

    if (amount === undefined || amount === null) {
        return null;
    }

    const amountStr = String(amount).trim();
    if (!amountStr) {
        return null;
    }

    const decimalsInt = Number(decimals);
    const [intPart, fracPartRaw = ''] = amountStr.split('.');
    const fracPart = fracPartRaw.slice(0, Math.max(0, decimalsInt));
    const paddedFrac = fracPart.padEnd(Math.max(0, decimalsInt), '0');
    const combined = `${intPart || '0'}${paddedFrac}`.replace(/^0+(?=\d)/, '');

    try {
        return BigInt(combined || '0');
    } catch (error) {
        return null;
    }
}

function parseDecimalStringParts(value) {
    if (value === undefined || value === null) {
        return null;
    }

    const trimmed = String(value).trim();
    if (!trimmed) {
        return null;
    }

    const sanitized = trimmed.replace(/[, ]/g, '');
    const match = sanitized.match(/^([+-]?)(\d*(?:\.\d*)?)(?:[eE]([+-]?\d+))?$/);
    if (!match) {
        return null;
    }

    const signChar = match[1] || '+';
    let base = match[2];
    let exponent = match[3] ? Number(match[3]) : 0;

    if (!base || base === '.') {
        base = '0';
    }

    if (!Number.isFinite(exponent)) {
        exponent = 0;
    }

    if (!base.includes('.')) {
        base = `${base}.`;
    }

    let [intPartRaw, fracPartRaw = ''] = base.split('.');
    if (!intPartRaw) {
        intPartRaw = '0';
    }

    let intPart = intPartRaw;
    let fracPart = fracPartRaw;

    if (exponent > 0) {
        if (fracPart.length <= exponent) {
            intPart = `${intPart}${fracPart}${'0'.repeat(exponent - fracPart.length)}`;
            fracPart = '';
        } else {
            intPart = `${intPart}${fracPart.slice(0, exponent)}`;
            fracPart = fracPart.slice(exponent);
        }
    } else if (exponent < 0) {
        const shift = Math.abs(exponent);
        if (intPart.length <= shift) {
            const zerosNeeded = shift - intPart.length;
            fracPart = `${'0'.repeat(zerosNeeded)}${intPart}${fracPart}`;
            intPart = '0';
        } else {
            const splitIndex = intPart.length - shift;
            fracPart = `${intPart.slice(splitIndex)}${fracPart}`;
            intPart = intPart.slice(0, splitIndex);
        }
    }

    const digits = `${intPart}${fracPart}`.replace(/^0+/, '') || '0';
    const scale = fracPart.length;
    const sign = signChar === '-' ? -1 : 1;
    return { sign, digits, scale };
}

function multiplyDecimalStrings(valueA, valueB) {
    const partsA = parseDecimalStringParts(valueA);
    const partsB = parseDecimalStringParts(valueB);
    if (!partsA || !partsB) {
        return null;
    }

    if (partsA.digits === '0' || partsB.digits === '0') {
        return '0';
    }

    const resultSign = partsA.sign * partsB.sign;
    let productDigits;
    try {
        productDigits = (BigInt(partsA.digits) * BigInt(partsB.digits)).toString();
    } catch (error) {
        return null;
    }

    const scale = partsA.scale + partsB.scale;
    if (scale > 0) {
        if (productDigits.length <= scale) {
            productDigits = productDigits.padStart(scale + 1, '0');
        }
        const intPart = productDigits.slice(0, productDigits.length - scale) || '0';
        const fracPart = productDigits.slice(productDigits.length - scale);
        const normalizedInt = intPart.replace(/^0+(?=\d)/, '') || '0';
        const normalizedFrac = fracPart.replace(/0+$/, '');
        const combined = normalizedFrac ? `${normalizedInt}.${normalizedFrac}` : normalizedInt;
        if (resultSign < 0 && combined !== '0') {
            return `-${combined}`;
        }
        return combined;
    }

    const normalizedInt = productDigits.replace(/^0+(?=\d)/, '') || '0';
    if (resultSign < 0 && normalizedInt !== '0') {
        return `-${normalizedInt}`;
    }
    return normalizedInt;
}

function subtractDecimalStrings(valueA, valueB) {
    const partsA = parseDecimalStringParts(valueA);
    const partsB = parseDecimalStringParts(valueB);
    if (!partsA || !partsB) {
        return null;
    }

    const targetScale = Math.max(partsA.scale, partsB.scale);
    const scaleDiffA = targetScale - partsA.scale;
    const scaleDiffB = targetScale - partsB.scale;

    let digitsA;
    let digitsB;
    try {
        const multiplierA = 10n ** BigInt(Math.max(0, scaleDiffA));
        const multiplierB = 10n ** BigInt(Math.max(0, scaleDiffB));
        digitsA = BigInt(partsA.digits) * multiplierA;
        digitsB = BigInt(partsB.digits) * multiplierB;
    } catch (error) {
        return null;
    }

    const signedA = partsA.sign < 0 ? -digitsA : digitsA;
    const signedB = partsB.sign < 0 ? -digitsB : digitsB;

    const diff = signedA - signedB;
    if (diff === 0n) {
        return '0';
    }

    const isNegative = diff < 0n;
    const absolute = isNegative ? -diff : diff;
    let digits = absolute.toString();

    if (targetScale > 0) {
        if (digits.length <= targetScale) {
            digits = digits.padStart(targetScale + 1, '0');
        }
        const intPart = digits.slice(0, digits.length - targetScale) || '0';
        const fracPart = digits.slice(digits.length - targetScale);
        const normalizedInt = intPart.replace(/^0+(?=\d)/, '') || '0';
        const normalizedFrac = fracPart.replace(/0+$/, '');
        const combined = normalizedFrac ? `${normalizedInt}.${normalizedFrac}` : normalizedInt;
        if (combined === '0') {
            return '0';
        }
        return isNegative ? `-${combined}` : combined;
    }

    const normalizedInt = digits.replace(/^0+(?=\d)/, '') || '0';
    if (normalizedInt === '0') {
        return '0';
    }
    return isNegative ? `-${normalizedInt}` : normalizedInt;
}

function normalizeDexHolding(row) {
    if (!row) {
        return null;
    }

    const firstBalance = row.rawBalance
        ?? row.balance
        ?? row.tokenBalance
        ?? row.amount
        ?? row.holdingAmount
        ?? row.holding
        ?? row.tokenAmount;
    const rawBalance = firstBalance;
    const tokenAddressRaw = row.tokenContractAddress || row.tokenAddress || row.contractAddress || row.tokenAddr;
    let tokenAddress = normalizeOkxConfigAddress(tokenAddressRaw);

    const decimals = Number(row.decimals || row.decimal || row.tokenDecimal || row.tokenDecimals || row.tokenPrecision);
    const symbol = row.tokenSymbol || row.symbol;
    const name = row.tokenName || row.name;

    let amountRaw = null;
    if (rawBalance !== undefined && rawBalance !== null) {
        try {
            amountRaw = BigInt(rawBalance);
        } catch (error) {
            amountRaw = null;
        }
    }

    if (amountRaw === null && row.coinAmount !== undefined && row.coinAmount !== null) {
        const decimalsForDecimal = Number.isFinite(decimals) ? decimals : 18;
        amountRaw = decimalToRawBigInt(row.coinAmount, decimalsForDecimal);
    }

    if (amountRaw === null && firstBalance !== undefined && firstBalance !== null) {
        const decimalsForDecimal = Number.isFinite(decimals) ? decimals : 18;
        amountRaw = decimalToRawBigInt(firstBalance, decimalsForDecimal);
    }

    if (amountRaw === null && row.balance) {
        const decimalsForDecimal = Number.isFinite(decimals) ? decimals : 18;
        amountRaw = decimalToRawBigInt(row.balance, decimalsForDecimal);
    }

    if (!tokenAddress) {
        const chainId = row.chainIndex || row.chainId || row.chain || 'unknown';
        const symbolKey = (symbol || name || 'token').toString().toLowerCase().replace(/[^a-z0-9]+/gi, '-');
        tokenAddress = `native:${chainId}:${symbolKey || 'token'}`;
    }

    const currencyAmount = Number(row.currencyAmount);
    const tokenPriceRaw = row.tokenPrice !== undefined && row.tokenPrice !== null
        ? String(row.tokenPrice)
        : null;
    let priceUsd = Number.isFinite(Number(row.tokenUnitPrice || row.priceUsd || row.usdPrice || tokenPriceRaw))
        ? Number(row.tokenUnitPrice || row.priceUsd || row.usdPrice || tokenPriceRaw)
        : null;

    if ((!Number.isFinite(priceUsd) || priceUsd === null) && amountRaw !== null && Number.isFinite(decimals) && Number.isFinite(currencyAmount) && currencyAmount > 0) {
        try {
            const amountNumeric = Number(ethers.formatUnits(amountRaw, decimals));
            if (Number.isFinite(amountNumeric) && amountNumeric > 0) {
                priceUsd = currencyAmount / amountNumeric;
            }
        } catch (error) {
            // ignore price derivation errors
        }
    }

    const balanceText = row.balance ?? row.coinAmount ?? null;

    return {
        tokenAddress,
        decimals: Number.isFinite(decimals) ? decimals : undefined,
        symbol,
        name,
        rawBalance,
        balance: balanceText,
        amountRaw,
        currencyAmount: Number.isFinite(currencyAmount) ? currencyAmount : null,
        priceUsd: Number.isFinite(priceUsd) ? priceUsd : null,
        tokenPrice: tokenPriceRaw,
        chainIndex: row.chainIndex || row.chainId || row.chain || row.chain_id,
        walletAddress: row.address || row.walletAddress,
        isRiskToken: Boolean(row.isRiskToken)
    };
}

function extractDexHoldingRows(payload) {
    const rows = [];
    if (!payload || typeof payload !== 'object') {
        return rows;
    }

    const direct = unwrapOkxData(payload);
    if (Array.isArray(direct)) {
        for (const item of direct) {
            if (!item) {
                continue;
            }
            if (Array.isArray(item.tokenBalance)) {
                rows.push(...item.tokenBalance);
            }
            if (Array.isArray(item.tokenBalances)) {
                rows.push(...item.tokenBalances);
            }
            if (Array.isArray(item.tokenAssets)) {
                rows.push(...item.tokenAssets);
            }
            if (Array.isArray(item.balanceList)) {
                rows.push(...item.balanceList);
            }
            if (Array.isArray(item.balances)) {
                rows.push(...item.balances);
            }
            if (Array.isArray(item.list)) {
                rows.push(...item.list);
            }
            rows.push(item);
        }
    }

    const nested = payload.data && typeof payload.data === 'object' ? payload.data : null;
    if (nested) {
        const candidates = [
            nested.tokenBalance,
            nested.tokenBalances,
            nested.tokenAssets,
            nested.balanceList,
            nested.balances,
            nested.list
        ];
        for (const candidate of candidates) {
            if (Array.isArray(candidate)) {
                rows.push(...candidate);
            }
        }
    }

    return rows;
}

function resolveChainContextShortName(context) {
    if (context && typeof context === 'object') {
        const aliasCandidates = [context.chainShortName, context.chainName, ...(context.aliases || [])]
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter(Boolean);
        if (aliasCandidates.length > 0) {
            return aliasCandidates[0];
        }
    }

    const candidates = getOkxChainShortNameCandidates();
    return candidates.length > 0 ? candidates[0] : 'xlayer';
}

async function fetchOkxDexBalanceSnapshot(walletAddress, options = {}) {
    const normalized = normalizeAddressSafe(walletAddress);
    if (!normalized) {
        return { tokens: [], totalUsd: null };
    }

    const chainShortName = resolveChainContextShortName(options.chainContext);
    const contextChains = Array.from(new Set([
        Number(options.chainContext?.chainId),
        Number(options.chainContext?.chainIndex),
        ...(Array.isArray(options.chainContext?.chains) ? options.chainContext.chains : [])
    ].filter((value) => Number.isFinite(value))));
    const fallbackChains = Array.from(new Set([
        Number(OKX_CHAIN_INDEX_FALLBACK),
        196
    ].filter((value) => Number.isFinite(value))));
    const chainIdList = contextChains.length > 0 ? contextChains : (fallbackChains.length > 0 ? fallbackChains : [196]);

    const query = {
        address: normalized,
        walletAddress: normalized,
        chains: chainIdList,
        chainId: chainIdList[0],
        chainIndex: chainIdList[0],
        chainShortName
    };

    const logBalanceRequest = (endpoint) => {
        try {
            const params = new URLSearchParams();
            params.set('address', query.address);
            params.set('walletAddress', query.walletAddress);
            chainIdList.forEach((id) => params.append('chains', String(id)));
            params.set('chainId', String(query.chainId));
            params.set('chainIndex', String(query.chainIndex));
            params.set('chainShortName', query.chainShortName);
            console.log(`[DexHoldings] ${endpoint} -> ${params.toString()}`);
        } catch (error) {
            // ignore log errors
        }
    };

    let holdings = [];
    let totalUsd = null;

    try {
        logBalanceRequest('/api/v6/dex/balance/all-token-balances-by-address');
        const response = await okxJsonRequest('GET', '/api/v6/dex/balance/all-token-balances-by-address', {
            query,
            auth: hasOkxCredentials,
            expectOkCode: false
        });

        const rows = extractDexHoldingRows(response);
        // Preserve every normalized holding row that the OKX response returns so the
        // downstream formatter can render balances even when some numeric fields are
        // missing or cannot be parsed (e.g., native tokens without decimals). The
        // formatter already tolerates missing amounts by falling back to the balance
        // strings, so keep all rows instead of filtering them out here.
        holdings = rows
            .map((row) => normalizeDexHolding(row))
            .filter(Boolean);

        const responseTotal = extractDexTotalValue(response);
        totalUsd = Number.isFinite(responseTotal) ? responseTotal : null;
    } catch (error) {
        console.warn(`[DexHoldings] Balance API failed via GET all-token-balances-by-address: ${error.message}`);
    }

    if (!Number.isFinite(totalUsd)) {
        try {
            logBalanceRequest('/api/v6/dex/balance/total-value-by-address');
            const totalResponse = await okxJsonRequest('GET', '/api/v6/dex/balance/total-value-by-address', {
                query,
                auth: hasOkxCredentials,
                expectOkCode: false
            });
            const derivedTotal = extractDexTotalValue(totalResponse);
            if (Number.isFinite(derivedTotal)) {
                totalUsd = derivedTotal;
            }
        } catch (error) {
            console.warn(`[DexHoldings] Total value API failed via GET total-value-by-address: ${error.message}`);
        }
    }

    if (!Number.isFinite(totalUsd) && Array.isArray(holdings) && holdings.length > 0) {
        const derived = holdings.reduce((sum, item) => {
            if (Number.isFinite(item?.currencyAmount) && item.currencyAmount > 0) {
                return sum + item.currencyAmount;
            }
            if (item?.amountRaw !== null && item?.decimals !== undefined && Number.isFinite(item?.priceUsd)) {
                try {
                    const amount = Number(ethers.formatUnits(item.amountRaw, item.decimals));
                    if (Number.isFinite(amount) && amount > 0) {
                        return sum + amount * item.priceUsd;
                    }
                } catch (error) {
                    // ignore formatting errors
                }
            }
            return sum;
        }, 0);

        if (Number.isFinite(derived) && derived > 0) {
            totalUsd = derived;
        }
    }

    if (Array.isArray(holdings) && holdings.length > 0) {
        return { tokens: holdings, totalUsd: Number.isFinite(totalUsd) ? totalUsd : null };
    }

    return { tokens: [], totalUsd: Number.isFinite(totalUsd) ? totalUsd : null };
}

function extractDexTotalValue(payload) {
    const candidates = [];
    const data = unwrapOkxFirst(payload) || (payload && typeof payload === 'object' ? payload.data : null);

    const pushCandidate = (value) => {
        if (value === undefined || value === null) {
            return;
        }
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
            candidates.push(numeric);
        }
    };

    if (data && typeof data === 'object') {
        pushCandidate(data.totalValue);
        pushCandidate(data.totalValueByAddress);
        pushCandidate(data.totalValueByToken);
        pushCandidate(data.totalBalance);
        pushCandidate(data.totalUsdBalance);
        pushCandidate(data.totalUsdValue);
        pushCandidate(data.totalFiatValue);
    }

    pushCandidate(payload?.totalValue);
    pushCandidate(payload?.totalValueByAddress);
    pushCandidate(payload?.totalValueByToken);
    pushCandidate(payload?.totalBalance);
    pushCandidate(payload?.totalUsdBalance);
    pushCandidate(payload?.totalUsdValue);
    pushCandidate(payload?.totalFiatValue);

    return candidates.find((value) => Number.isFinite(value) && value > 0) || null;
}

async function fetchOkxDexWalletHoldings(walletAddress, options = {}) {
    const normalized = normalizeAddressSafe(walletAddress);
    if (!normalized) {
        return { tokens: [], totalUsd: null };
    }

    const balanceSnapshot = await fetchOkxDexBalanceSnapshot(normalized, options);
    if (Array.isArray(balanceSnapshot.tokens) && balanceSnapshot.tokens.length > 0) {
        return { tokens: balanceSnapshot.tokens, totalUsd: balanceSnapshot.totalUsd };
    }
    return { tokens: [], totalUsd: balanceSnapshot.totalUsd || null };
}

async function fetchOkxSupportedChains() {
    const directory = await ensureOkxChainDirectory();

    const formatList = (list) => {
        if (!Array.isArray(list) || list.length === 0) {
            return [];
        }

        const seen = new Set();
        const result = [];

        for (const entry of list) {
            if (!entry) {
                continue;
            }

            const key = entry.primaryKey
                || (Number.isFinite(entry.chainIndex) ? `idx:${entry.chainIndex}` : null)
                || (entry.chainShortName ? normalizeChainKey(entry.chainShortName) : null);

            if (key && seen.has(key)) {
                continue;
            }

            if (key) {
                seen.add(key);
            }

            const names = [];
            if (entry.chainName) {
                names.push(entry.chainName);
            }
            if (entry.chainShortName && entry.chainShortName !== entry.chainName) {
                names.push(entry.chainShortName);
            }

            const baseLabel = names.length > 1
                ? `${names[0]} (${names[1]})`
                : (names[0] || entry.aliases?.[0] || 'Unknown');

            const meta = [];
            if (Number.isFinite(entry.chainIndex)) {
                meta.push(`#${entry.chainIndex}`);
            }
            if (Number.isFinite(entry.chainId) && entry.chainId !== entry.chainIndex) {
                meta.push(`id ${entry.chainId}`);
            }

            const metaText = meta.length > 0 ? ` [${meta.join(' · ')}]` : '';
            result.push(`${baseLabel}${metaText}`);
        }

        return result;
    };

    return {
        aggregator: formatList(directory?.aggregator || []),
        market: formatList(directory?.market || [])
    };
}

async function fetchOkxBalanceSupportedChains() {
    const payload = await okxJsonRequest('GET', '/api/v6/dex/balance/supported/chain', { query: {}, expectOkCode: false });
    const raw = unwrapOkxData(payload) || [];
    const normalized = raw
        .map((entry) => normalizeOkxChainDirectoryEntry(entry))
        .filter(Boolean);
    return dedupeOkxChainEntries(normalized);
}

async function fetchOkx402Supported() {
    const payload = await okxJsonRequest('GET', '/api/v6/x402/supported', { query: {} });
    const data = unwrapOkxData(payload);
    if (!data || data.length === 0) {
        return [];
    }

    return data
        .map((entry) => {
            if (!entry) {
                return null;
            }
            if (typeof entry === 'string') {
                return entry;
            }
            if (typeof entry === 'object') {
                return entry.chainShortName || entry.chainName || entry.name || null;
            }
            return null;
        })
        .filter(Boolean);
}

async function tryFetchOkxMarketTicker() {
    if (!OKX_MARKET_INSTRUMENT) {
        return null;
    }

    const payload = await okxJsonRequest('GET', '/api/v5/market/ticker', {
        query: { instId: OKX_MARKET_INSTRUMENT },
        expectOkCode: true,
        auth: hasOkxCredentials
    });

    const tickerEntry = unwrapOkxFirst(payload);
    const price = extractOkxPriceValue(tickerEntry);
    const tokenPrices = collectOkxTokenUnitPrices(tickerEntry || {});
    const okbUsd = resolveOkbUsdPrice(tokenPrices);
    const priceOkb = Number.isFinite(price) && Number.isFinite(okbUsd) && okbUsd > 0
        ? price / okbUsd
        : null;

    if (Number.isFinite(price)) {
        return {
            price,
            priceOkb: Number.isFinite(priceOkb) ? priceOkb : null,
            okbUsd: Number.isFinite(okbUsd) ? okbUsd : null,
            source: 'OKX market ticker',
            chain: null
        };
    }

    return null;
}

function getOkxChainShortNameCandidates() {
    const configured = typeof OKX_CHAIN_SHORT_NAME === 'string'
        ? OKX_CHAIN_SHORT_NAME.split(/[|,]+/)
        : [];

    const defaults = [
        'x-layer',
        'xlayer',
        'X Layer',
        'X-Layer',
        'X_LAYER',
        'Xlayer'
    ];

    const seen = new Set();
    const result = [];

    for (const value of [...configured, ...defaults]) {
        if (!value) {
            continue;
        }

        const trimmed = value.trim();
        if (!trimmed) {
            continue;
        }

        const dedupeKey = trimmed.toLowerCase();
        if (seen.has(dedupeKey)) {
            continue;
        }

        seen.add(dedupeKey);
        result.push(trimmed);
    }

    if (result.length === 0) {
        result.push('x-layer');
    }

    return result;
}

function normalizeChainKey(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    return trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Backward-compatible alias for earlier helper name references.
function normalizeOkxChainEntry(entry) {
    return normalizeOkxChainDirectoryEntry(entry);
}

function normalizeOkxChainDirectoryEntry(entry) {
    if (!entry) {
        return null;
    }

    if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (!trimmed) {
            return null;
        }

        const key = normalizeChainKey(trimmed);
        return {
            chainShortName: trimmed,
            chainName: trimmed,
            chainIndex: null,
            chainId: null,
            aliases: [trimmed],
            keys: key ? [key] : [],
            primaryKey: key,
            raw: entry
        };
    }

    if (typeof entry !== 'object') {
        return null;
    }

    const aliasFields = [
        entry.chainShortName,
        entry.chainName,
        entry.chain,
        entry.name,
        entry.shortName,
        entry.short_name,
        entry.short,
        entry.symbol,
        entry.chainSymbol,
        entry.chainAlias,
        entry.alias,
        entry.displayName,
        entry.label,
        entry.networkName
    ];

    const aliases = Array.from(new Set(aliasFields
        .map((value) => (typeof value === 'string' ? value.trim() : null))
        .filter(Boolean)));

    const chainShortName = aliases[0] || null;
    const chainName = (typeof entry.chainName === 'string' && entry.chainName.trim())
        ? entry.chainName.trim()
        : (aliases[1] || chainShortName || null);

    const chainIndexCandidate = entry.chainIndex ?? entry.index ?? entry.chain_id ?? entry.chainId ?? entry.id;
    const chainIdCandidate = entry.chainId ?? entry.chain_id ?? entry.chainID ?? entry.id ?? entry.networkId;

    const chainIndexNumeric = normalizeNumeric(chainIndexCandidate);
    const chainIdNumeric = normalizeNumeric(chainIdCandidate);

    const chainIndex = Number.isFinite(chainIndexNumeric) ? Math.trunc(chainIndexNumeric) : null;
    const chainId = Number.isFinite(chainIdNumeric) ? Math.trunc(chainIdNumeric) : null;

    const keys = Array.from(new Set(aliases
        .map((alias) => normalizeChainKey(alias))
        .filter(Boolean)));

    const primaryKey = keys[0] || (Number.isFinite(chainIndex) ? `idx:${chainIndex}` : null);

    return {
        chainShortName: chainShortName || chainName || null,
        chainName: chainName || chainShortName || null,
        chainIndex,
        chainId,
        aliases,
        keys,
        primaryKey,
        raw: entry
    };
}

function dedupeOkxChainEntries(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return [];
    }

    const seen = new Set();
    const result = [];

    for (const entry of entries) {
        if (!entry) {
            continue;
        }

        const key = entry.primaryKey
            || (Number.isFinite(entry.chainIndex) ? `idx:${entry.chainIndex}` : null)
            || (entry.chainShortName ? normalizeChainKey(entry.chainShortName) : null);

        if (key && seen.has(key)) {
            continue;
        }

        if (key) {
            seen.add(key);
        }

        result.push(entry);
    }

    return result;
}

async function ensureOkxChainDirectory() {
    const now = Date.now();
    if (okxChainDirectoryCache && okxChainDirectoryExpiresAt > now) {
        return okxChainDirectoryCache;
    }

    if (!okxChainDirectoryPromise) {
        okxChainDirectoryPromise = loadOkxChainDirectory()
            .then((directory) => {
                okxChainDirectoryCache = directory;
                okxChainDirectoryExpiresAt = Date.now() + OKX_CHAIN_CONTEXT_TTL;
                return directory;
            })
            .catch((error) => {
                okxChainDirectoryCache = null;
                okxChainDirectoryExpiresAt = 0;
                throw error;
            })
            .finally(() => {
                okxChainDirectoryPromise = null;
            });
    }

    return okxChainDirectoryPromise;
}

async function loadOkxChainDirectory() {
    const [aggregator, market] = await Promise.allSettled([
        okxJsonRequest('GET', '/api/v6/dex/aggregator/supported/chain', { query: {}, expectOkCode: false }),
        okxJsonRequest('GET', '/api/v6/dex/market/supported/chain', { query: {}, expectOkCode: false })
    ]);

    const normalizeList = (payload) => {
        const rawList = payload.status === 'fulfilled' ? unwrapOkxData(payload.value) : [];
        const normalized = [];
        for (const item of rawList || []) {
            const entry = normalizeOkxChainDirectoryEntry(item);
            if (entry) {
                normalized.push(entry);
            }
        }
        return dedupeOkxChainEntries(normalized);
    };

    return {
        aggregator: normalizeList(aggregator),
        market: normalizeList(market)
    };
}

function findChainEntryByIndex(list, index) {
    if (!Array.isArray(list) || !Number.isFinite(index)) {
        return null;
    }

    const numericIndex = Number(index);
    for (const entry of list) {
        if (!entry) {
            continue;
        }

        if (Number.isFinite(entry.chainIndex) && Number(entry.chainIndex) === numericIndex) {
            return entry;
        }
    }

    return null;
}

function findChainEntryByKeys(list, keys) {
    if (!Array.isArray(list) || !Array.isArray(keys) || keys.length === 0) {
        return null;
    }

    for (const entry of list) {
        if (!entry || !Array.isArray(entry.keys)) {
            continue;
        }

        for (const key of entry.keys) {
            if (keys.includes(key)) {
                return entry;
            }
        }
    }

    return null;
}

function collectChainSearchKeys(chainName) {
    const names = [];

    if (chainName) {
        names.push(chainName);
    }

    if (OKX_CHAIN_SHORT_NAME) {
        names.push(OKX_CHAIN_SHORT_NAME);
    }

    const configured = typeof OKX_CHAIN_SHORT_NAME === 'string'
        ? OKX_CHAIN_SHORT_NAME.split(/[|,]+/)
        : [];

    for (const value of configured) {
        names.push(value);
    }

    names.push('x-layer', 'xlayer', 'X Layer', 'okx xlayer', 'okbchain', 'okxchain');

    const normalized = [];
    const seen = new Set();

    for (const name of names) {
        if (!name || typeof name !== 'string') {
            continue;
        }

        const variants = [
            name,
            name.replace(/[_\s-]+/g, ''),
            name.replace(/[_\s]+/g, '-'),
            name.replace(/[-]+/g, ' ')
        ];

        for (const variant of variants) {
            const key = normalizeChainKey(variant);
            if (key && !seen.has(key)) {
                seen.add(key);
                normalized.push(key);
            }
        }
    }

    return normalized;
}

async function resolveOkxChainContext(chainName) {
    const cacheKey = chainName ? chainName.toLowerCase().trim() : '(default)';
    const cached = okxResolvedChainCache.get(cacheKey);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
        return cached.value;
    }

    let directory = null;
    try {
        directory = await ensureOkxChainDirectory();
    } catch (error) {
        console.warn(`[OKX] Failed to load chain directory: ${error.message}`);
    }

    const aggregator = directory?.aggregator || [];
    const market = directory?.market || [];

    const searchKeys = collectChainSearchKeys(chainName);

    let match = null;

    if (Number.isFinite(OKX_CHAIN_INDEX)) {
        match = findChainEntryByIndex(aggregator, OKX_CHAIN_INDEX)
            || findChainEntryByIndex(market, OKX_CHAIN_INDEX);
    }

    if (!match && searchKeys.length > 0) {
        match = findChainEntryByKeys(aggregator, searchKeys)
            || findChainEntryByKeys(market, searchKeys);
    }

    if (!match) {
        const xlayerKey = 'xlayer';
        match = findChainEntryByKeys(aggregator, [xlayerKey])
            || findChainEntryByKeys(market, [xlayerKey]);
    }

    if (!match) {
        match = aggregator[0] || market[0] || null;
    }

    if (!match) {
        const fallbackShortName = OKX_CHAIN_SHORT_NAME || 'xlayer';
        const fallbackKeys = collectChainSearchKeys(fallbackShortName);
        match = {
            chainShortName: fallbackShortName,
            chainName: fallbackShortName,
            chainIndex: Number.isFinite(OKX_CHAIN_INDEX)
                ? Number(OKX_CHAIN_INDEX)
                : OKX_CHAIN_INDEX_FALLBACK,
            chainId: null,
            aliases: [fallbackShortName],
            keys: fallbackKeys,
            primaryKey: fallbackKeys[0] || null,
            raw: null
        };
    }

    if (okxResolvedChainCache.size > 50) {
        okxResolvedChainCache.clear();
    }

    okxResolvedChainCache.set(cacheKey, {
        value: match,
        expiresAt: now + OKX_CHAIN_CONTEXT_TTL
    });

    return match;
}

async function buildOkxDexQuery(chainName, options = {}) {
    const query = {};
    const context = await resolveOkxChainContext(chainName);
    const explicitChainIndex = options.explicitChainIndex;
    const explicitChainShortName = options.explicitChainShortName;

    if (explicitChainShortName) {
        query.chainShortName = explicitChainShortName;
    }

    if (Number.isFinite(explicitChainIndex)) {
        query.chainIndex = Number(explicitChainIndex);
    }

    if (context) {
        if (!query.chainShortName) {
            if (context.chainShortName) {
                query.chainShortName = context.chainShortName;
            } else if (chainName) {
                query.chainShortName = chainName;
            }
        }

        if (!Number.isFinite(query.chainIndex)) {
            if (Number.isFinite(context.chainIndex)) {
                query.chainIndex = Number(context.chainIndex);
            } else if (Number.isFinite(OKX_CHAIN_INDEX)) {
                query.chainIndex = Number(OKX_CHAIN_INDEX);
            }
        }

        if (Number.isFinite(context.chainId)) {
            query.chainId = context.chainId;
        }
    } else if (chainName && !query.chainShortName) {
        query.chainShortName = chainName;
    }

    if (!query.chainShortName) {
        query.chainShortName = OKX_CHAIN_SHORT_NAME || 'xlayer';
    }

    if (!Number.isFinite(query.chainIndex)) {
        if (Number.isFinite(OKX_CHAIN_INDEX)) {
            query.chainIndex = Number(OKX_CHAIN_INDEX);
        } else if (Number.isFinite(OKX_CHAIN_INDEX_FALLBACK)) {
            query.chainIndex = OKX_CHAIN_INDEX_FALLBACK;
        }
    }

    if (!Number.isFinite(query.chainId)) {
        if (Number.isFinite(query.chainIndex)) {
            query.chainId = Number(query.chainIndex);
        } else if (Number.isFinite(OKX_CHAIN_INDEX_FALLBACK)) {
            query.chainId = Number(OKX_CHAIN_INDEX_FALLBACK);
        }
    }

    const includeToken = options.includeToken !== false;
    const includeQuote = options.includeQuote !== false;

    if (includeToken && OKX_BANMAO_TOKEN_ADDRESS) {
        query.tokenAddress = OKX_BANMAO_TOKEN_ADDRESS;
        query.baseTokenAddress = query.baseTokenAddress || OKX_BANMAO_TOKEN_ADDRESS;
        query.baseCurrency = query.baseCurrency || OKX_BANMAO_TOKEN_ADDRESS;
        query.baseToken = query.baseToken || OKX_BANMAO_TOKEN_ADDRESS;
        query.tokenContractAddress = query.tokenContractAddress || OKX_BANMAO_TOKEN_ADDRESS;
    }

    if (includeQuote && OKX_QUOTE_TOKEN_ADDRESS) {
        query.quoteTokenAddress = OKX_QUOTE_TOKEN_ADDRESS;
        query.quoteCurrency = query.quoteCurrency || OKX_QUOTE_TOKEN_ADDRESS;
        query.quoteToken = query.quoteToken || OKX_QUOTE_TOKEN_ADDRESS;
        if (!query.toTokenAddress) {
            query.toTokenAddress = OKX_QUOTE_TOKEN_ADDRESS;
        }
    }

    return query;
}

async function okxJsonRequest(method, path, options = {}) {
    const { query, body, auth = hasOkxCredentials, expectOkCode = true } = options;
    const url = new URL(path, OKX_BASE_URL);

    if (query && typeof query === 'object') {
        for (const [key, value] of Object.entries(query)) {
            if (value === undefined || value === null || value === '') {
                continue;
            }
            if (Array.isArray(value)) {
                const filtered = value.filter((item) => item !== undefined && item !== null && item !== '');
                if (filtered.length === 0) {
                    continue;
                }
                filtered.forEach((item) => url.searchParams.append(key, String(item)));
                continue;
            }
            url.searchParams.set(key, String(value));
        }
    }

    const methodUpper = method.toUpperCase();
    const requestPath = url.pathname + url.search;
    const bodyString = body ? JSON.stringify(body) : '';

    const headers = {
        'Accept': 'application/json',
        'User-Agent': 'banmao-bot/2.0 (+https://www.banmao.fun)'
    };

    if (bodyString) {
        headers['Content-Type'] = 'application/json';
    }

    if (auth && hasOkxCredentials) {
        const timestamp = new Date().toISOString();
        const signPayload = `${timestamp}${methodUpper}${requestPath}${bodyString}`;
        const signature = crypto
            .createHmac('sha256', OKX_SECRET_KEY)
            .update(signPayload)
            .digest('base64');

        headers['OK-ACCESS-KEY'] = OKX_API_KEY;
        headers['OK-ACCESS-SIGN'] = signature;
        headers['OK-ACCESS-TIMESTAMP'] = timestamp;
        headers['OK-ACCESS-PASSPHRASE'] = OKX_API_PASSPHRASE;
        if (OKX_API_PROJECT) {
            headers['OK-ACCESS-PROJECT'] = OKX_API_PROJECT;
        }
        if (OKX_API_SIMULATED) {
            headers['x-simulated-trading'] = '1';
        }
    }

    const response = await fetchJsonWithTimeout(url.toString(), {
        method: methodUpper,
        headers,
        body: bodyString || undefined
    }, OKX_FETCH_TIMEOUT);

    if (!response) {
        return null;
    }

    if (expectOkCode && response.code && response.code !== '0') {
        const msg = typeof response.msg === 'string' ? response.msg : 'Unknown error';
        throw new Error(`OKX response code ${response.code}: ${msg}`);
    }

    return response;
}

async function fetchJsonWithTimeout(urlString, requestOptions, timeoutMs) {
    const options = requestOptions || {};

    if (typeof fetch === 'function') {
        const supportsAbort = typeof AbortController === 'function';
        const controller = supportsAbort ? new AbortController() : null;
        let timeoutId = null;
        let timedOut = false;

        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                timedOut = true;
                if (controller) {
                    controller.abort();
                }
                reject(new Error('Request timed out'));
            }, timeoutMs);
        });

        try {
            const response = await Promise.race([
                fetch(urlString, {
                    ...options,
                    ...(controller ? { signal: controller.signal } : {})
                }),
                timeoutPromise
            ]);

            if (!response) {
                throw new Error('Invalid response from fetch');
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const text = await response.text();
            if (!text) {
                return null;
            }

            try {
                return JSON.parse(text);
            } catch (error) {
                throw new Error('Failed to parse OKX response');
            }
        } catch (error) {
            if (timedOut || (controller && error && error.name === 'AbortError')) {
                throw new Error('Request timed out');
            }
            throw error;
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }
    }

    return await fetchJsonWithHttps(urlString, options, timeoutMs);
}

function fetchJsonWithHttps(urlString, options, timeoutMs) {
    return new Promise((resolve, reject) => {
        const requestOptions = {
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = https.request(urlString, requestOptions, (response) => {
            const { statusCode } = response;
            const chunks = [];

            response.setEncoding('utf8');
            response.on('error', reject);

            if (!statusCode || statusCode < 200 || statusCode >= 300) {
                if (typeof response.resume === 'function') {
                    response.resume();
                }
                reject(new Error(`HTTP ${statusCode || 'ERR'}`));
                return;
            }

            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                const body = chunks.join('');

                if (!body) {
                    resolve(null);
                    return;
                }

                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(new Error('Failed to parse OKX response'));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error('Request timed out'));
        });

        if (options.body) {
            req.write(options.body);
        }

        req.end();
    });
}

function extractOkxPriceValue(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const priceKeys = [
        'usdPrice',
        'price',
        'priceUsd',
        'lastPrice',
        'last',
        'close',
        'markPrice',
        'quotePrice',
        'tokenPrice',
        'tokenUnitPrice',
        'usdValue',
        'value',
        'bestAskPrice',
        'bestBidPrice',
        'bestAsk',
        'bestBid',
        'askPx',
        'bidPx'
    ];

    for (const key of priceKeys) {
        if (Object.prototype.hasOwnProperty.call(entry, key)) {
            const numeric = normalizeNumeric(entry[key]);
            if (Number.isFinite(numeric)) {
                return numeric;
            }
        }
    }

    const nestedKeys = ['prices', 'priceInfo', 'tokenPrices', 'ticker', 'bestAsk', 'bestBid'];
    for (const nestedKey of nestedKeys) {
        const nested = entry[nestedKey];
        const numeric = extractFromNested(nested);
        if (Number.isFinite(numeric)) {
            return numeric;
        }
    }

    if (Array.isArray(entry.data)) {
        const numeric = extractFromNested(entry.data);
        if (Number.isFinite(numeric)) {
            return numeric;
        }
    }

    return null;
}

function extractFromNested(value) {
    if (!value) {
        return null;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            const numeric = extractOkxPriceValue(item);
            if (Number.isFinite(numeric)) {
                return numeric;
            }
        }
        return null;
    }

    if (typeof value === 'object') {
        const nestedValues = Object.values(value);
        for (const nested of nestedValues) {
            const numeric = extractOkxPriceValue(nested);
            if (Number.isFinite(numeric)) {
                return numeric;
            }
        }
    }

    return normalizeNumeric(value);
}

function pickOkxNumeric(entry, keys) {
    if (!entry || typeof entry !== 'object' || !Array.isArray(keys)) {
        return null;
    }

    for (const key of keys) {
        if (!key || typeof key !== 'string') {
            continue;
        }

        if (Object.prototype.hasOwnProperty.call(entry, key)) {
            const numeric = normalizeNumeric(entry[key]);
            if (Number.isFinite(numeric)) {
                return numeric;
            }
        }
    }

    return null;
}

function unwrapOkxData(payload) {
    if (!payload || typeof payload !== 'object') {
        return [];
    }

    const directData = payload.data !== undefined ? payload.data : payload.result;

    if (Array.isArray(directData)) {
        return directData;
    }

    if (directData && typeof directData === 'object') {
        const candidates = [
            directData.data,
            directData.items,
            directData.list,
            directData.rows,
            directData.result,
            directData.candles,
            directData.records,
            directData.trades,
            directData.pools,
            directData.liquidityList,
            directData.tokens,
            directData.tokenList
        ];
        for (const candidate of candidates) {
            if (Array.isArray(candidate)) {
                return candidate;
            }
        }
    }

    return [];
}

function unwrapOkxFirst(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const data = unwrapOkxData(payload);
    if (data.length > 0) {
        return data[0] || null;
    }

    if (payload.data && typeof payload.data === 'object') {
        return payload.data;
    }

    return null;
}

function normalizeNumeric(value) {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
        const cleaned = value.replace(/[,\s]/g, '');
        if (!cleaned) {
            return null;
        }
        const numeric = Number(cleaned);
        return Number.isFinite(numeric) ? numeric : null;
    }

    return null;
}

function normalizeOkxTokenDirectoryToken(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const addressCandidate = entry.tokenContractAddress
        || entry.tokenAddress
        || entry.contractAddress
        || entry.address
        || entry.baseTokenAddress
        || entry.token;

    if (!addressCandidate || typeof addressCandidate !== 'string') {
        return null;
    }

    const normalizedAddress = normalizeOkxConfigAddress(addressCandidate) || addressCandidate.trim();
    if (!normalizedAddress) {
        return null;
    }

    const decimals = pickOkxNumeric(entry, ['decimals', 'decimal', 'tokenDecimal']);
    const symbolCandidate = typeof entry.tokenSymbol === 'string'
        ? entry.tokenSymbol
        : (typeof entry.symbol === 'string' ? entry.symbol : null);
    const nameCandidate = typeof entry.tokenName === 'string'
        ? entry.tokenName
        : (typeof entry.name === 'string' ? entry.name : null);
    const logoCandidate = typeof entry.tokenLogoUrl === 'string'
        ? entry.tokenLogoUrl
        : (typeof entry.logoUrl === 'string' ? entry.logoUrl : (typeof entry.logo === 'string' ? entry.logo : null));

    return {
        address: normalizedAddress,
        addressLower: normalizedAddress.toLowerCase(),
        decimals: Number.isFinite(decimals) ? Math.max(0, Math.trunc(decimals)) : null,
        symbol: symbolCandidate ? symbolCandidate.trim() : null,
        name: nameCandidate ? nameCandidate.trim() : null,
        logo: logoCandidate ? logoCandidate.trim() : null,
        raw: entry
    };
}



// ==========================================================
// 🚀 PHẦN 1: API SERVER
// ==========================================================
function startApiServer() {
    app.use(cors());
    app.use(express.json());

    app.get('/webview/portfolio/:wallet', (req, res) => {
        const normalized = normalizeAddressSafe(req.params.wallet);
        if (!normalized) {
            res.status(400).send('Invalid wallet');
            return;
        }

        const portfolioUrl = `${OKX_BASE_URL.replace(/\/$/, '')}/portfolio/${normalized}`;
        const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Xlayer Portfolio Preview</title>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #0b1021; color: #e5e8f0; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    header { padding: 12px 16px; background: #0f162d; border-bottom: 1px solid #1f2a44; display: flex; align-items: center; gap: 12px; }
    header .title { font-weight: 700; font-size: 14px; letter-spacing: 0.4px; text-transform: uppercase; color: #8ab4ff; }
    header .addr { font-weight: 600; color: #e5e8f0; font-size: 13px; }
    iframe { width: 100%; height: calc(100% - 54px); border: none; background: #0b1021; }
    .fallback { padding: 16px; text-align: center; }
    .fallback a { color: #8ab4ff; }
  </style>
</head>
<body>
  <header>
    <div class="title">Xlayer - BOT</div>
    <div class="addr">${normalized}</div>
  </header>
  <iframe src="${portfolioUrl}" title="OKX Portfolio"></iframe>
  <noscript>
    <div class="fallback">JavaScript is required. <a href="${portfolioUrl}" target="_blank" rel="noopener noreferrer">Open in browser</a>.</div>
  </noscript>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    });

    // API cho DApp (Deep Link) - Cần async
    app.post('/api/generate-token', async (req, res) => {
        try {
            const { walletAddress } = req.body;
            if (!walletAddress) return res.status(400).json({ error: 'walletAddress là bắt buộc' });
            const token = uuidv4();
            await db.addPendingToken(token, walletAddress); // <-- AWAIT
            console.log(`[API] Đã tạo token cho ví: ${walletAddress}`);
            res.json({ token: token });
        } catch (error) {
            console.error("[API] Lỗi generate-token:", error.message);
            res.status(500).json({ error: 'Địa chỉ ví không hợp lệ' });
        }
    });

    // API cho DApp kiểm tra trạng thái - Cần async
    app.get('/api/check-status', async (req, res) => {
        try {
            const { walletAddress } = req.query;
            if (!walletAddress) return res.status(400).json({ error: 'walletAddress là bắt buộc' });
            const users = await db.getUsersForWallet(walletAddress); // <-- AWAIT
            res.json({ isConnected: users.length > 0, count: users.length });
        } catch (error) {
            res.status(500).json({ error: 'Địa chỉ ví không hợp lệ' });
        }
    });

    app.listen(API_PORT, '0.0.0.0', () => {
        console.log(`✅ [API Server] Đang chạy tại http://0.0.0.0:${API_PORT}`);
    });
}


// ==========================================================
// 🤖 PHẦN 2: LOGIC BOT TELEGRAM (ĐÃ SỬA LỖI LOGIC NGÔN NGỮ)
// ==========================================================

// ===== HÀM HELPER MỚI (SỬA LỖI) =====
// Lấy ngôn ngữ ĐÃ LƯU của user, nếu không có thì set ngôn ngữ mặc định
async function getLang(msg) {
    if (!msg || !msg.chat) {
        return defaultLang;
    }

    const chatId = msg.chat.id.toString();
    const detectedLang = resolveLangCode(msg?.from?.language_code);

    const info = await db.getUserLanguageInfo(chatId);
    if (info) {
        const savedLang = resolveLangCode(info.lang);
        const source = info.source || 'auto';

        if (source === 'manual') {
            if (savedLang !== info.lang) {
                await db.setLanguage(chatId, savedLang);
            }
            return savedLang;
        }

        if (savedLang !== detectedLang) {
            await db.setLanguage(chatId, savedLang);
            return savedLang;
        }

        if (savedLang !== info.lang || source !== info.source) {
            await db.setLanguageAuto(chatId, savedLang);
        }

        return detectedLang;
    }

    await db.setLanguageAuto(chatId, detectedLang);
    return detectedLang;
}
// ======================================

function startTelegramBot() {

    async function handleStartNoToken(msg) {
        const lang = await getLang(msg);
        const message = t(lang, 'welcome_generic');
        sendReply(msg, message, { parse_mode: 'Markdown' });
    }

    async function handleRegisterCommand(msg, payload) {
        const chatId = msg.chat.id.toString();
        const lang = await getLang(msg);
        if (!payload || !payload.trim()) {
            await sendReply(msg, t(lang, 'register_usage'), { parse_mode: 'Markdown', reply_markup: buildWalletActionKeyboard(lang) });
            return;
        }

        const parsed = parseRegisterPayload(payload);
        if (!parsed) {
            await sendReply(msg, t(lang, 'register_usage'), { parse_mode: 'Markdown', reply_markup: buildCloseKeyboard(lang) });
            return;
        }

        try {
            const result = await db.addWalletToUser(chatId, lang, parsed.wallet);

            const messageKey = result?.added ? 'register_wallet_saved' : 'register_wallet_exists';
            const message = t(lang, messageKey, { wallet: shortenAddress(parsed.wallet) });
            const portfolioLinks = [{ address: parsed.wallet, url: buildPortfolioEmbedUrl(parsed.wallet) }];
            await sendReply(msg, message, { parse_mode: 'Markdown', reply_markup: buildWalletActionKeyboard(lang, portfolioLinks) });
            console.log(`[BOT] Đăng ký ${shortenAddress(parsed.wallet)} -> ${chatId} (tokens: auto-detect)`);
        } catch (error) {
            console.error(`[Register] Failed to save token for ${chatId}: ${error.message}`);
            await sendReply(msg, t(lang, 'register_help_error'), { parse_mode: 'Markdown', reply_markup: buildCloseKeyboard(lang) });
        }
    }

    async function handleMyWalletCommand(msg) {
        const chatId = msg.chat.id.toString();
        const lang = await getLang(msg);
        try {
            const menu = await buildWalletSelectMenu(lang, chatId);
            await sendReply(msg, menu.text, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });
        } catch (error) {
            console.error(`[MyWallet] Failed to render wallet for ${chatId}: ${error.message}`);
            const fallback = t(lang, 'wallet_overview_error');
            await sendReply(msg, fallback, { parse_mode: 'Markdown', reply_markup: buildWalletActionKeyboard(lang) });
        }
    }

    async function handleDonateCommand(msg) {
        const lang = await getLang(msg);
        const text = buildDonateMessage(lang);
        await sendReply(msg, text, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: buildCloseKeyboard(lang) });
    }

    async function handleOkxChainsCommand(msg) {
        const lang = await getLang(msg);
        try {
            const directory = await fetchOkxSupportedChains();
            if (!directory) {
                sendReply(msg, t(lang, 'okxchains_error'), { parse_mode: 'Markdown' });
                return;
            }

            const aggregatorLines = (directory.aggregator || []).slice(0, 20);
            const marketLines = (directory.market || []).slice(0, 20);

            const lines = [
                t(lang, 'okxchains_title'),
                t(lang, 'okxchains_aggregator_heading'),
                aggregatorLines.length > 0 ? aggregatorLines.map((line) => `• ${line}`).join('\n') : t(lang, 'okxchains_no_data'),
                '',
                t(lang, 'okxchains_market_heading'),
                marketLines.length > 0 ? marketLines.map((line) => `• ${line}`).join('\n') : t(lang, 'okxchains_no_data')
            ];

            sendReply(msg, lines.join('\n'), { parse_mode: 'Markdown', reply_markup: buildCloseKeyboard(lang) });
        } catch (error) {
            console.error(`[OkxChains] Failed to load supported chains: ${error.message}`);
            sendReply(msg, t(lang, 'okxchains_error'), { parse_mode: 'Markdown', reply_markup: buildCloseKeyboard(lang) });
        }
    }

    async function handleOkx402StatusCommand(msg) {
        const lang = await getLang(msg);
        try {
            const supported = await fetchOkx402Supported();
            const lines = [
                t(lang, 'okx402_title'),
                supported && supported.length > 0
                    ? t(lang, 'okx402_supported', { chains: supported.join(', ') })
                    : t(lang, 'okx402_not_supported')
            ];
            sendReply(msg, lines.join('\n'), { parse_mode: 'Markdown', reply_markup: buildCloseKeyboard(lang) });
        } catch (error) {
            console.error(`[Okx402] Failed to check x402 support: ${error.message}`);
            sendReply(msg, t(lang, 'okx402_error'), { parse_mode: 'Markdown', reply_markup: buildCloseKeyboard(lang) });
        }
    }

    async function handleRulesCommand(msg) {
        const chatId = msg.chat.id.toString();
        const lang = await getLang(msg);
        const isGroupChat = ['group', 'supergroup'].includes(msg.chat.type);
        if (!isGroupChat) {
            await sendReply(msg, t(lang, 'rules_private_hint'));
            return;
        }

        const rules = await db.getGroupRules(chatId);
        if (!rules) {
            await sendReply(msg, t(lang, 'rules_not_configured'));
            return;
        }

        const text = [t(lang, 'rules_title'), '', rules].join('\n');
        await sendReply(msg, text, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: t(lang, 'rules_button_close'), callback_data: 'rules_close' }]] }
        });
    }

    async function handleBanmaoPriceCommand(msg) {
        const chatId = msg.chat.id.toString();
        const lang = await getLang(msg);

        try {
            const snapshot = await fetchBanmaoPrice();
            if (!snapshot || !Number.isFinite(snapshot.price)) {
                throw new Error('No price returned');
            }

            const priceUsdText = formatUsdPrice(snapshot.price);
            const priceOkbNumeric = Number(snapshot.priceOkb);
            const priceOkbText = Number.isFinite(priceOkbNumeric)
                ? formatTokenQuantity(priceOkbNumeric, { minimumFractionDigits: 8, maximumFractionDigits: 8 })
                : null;

            let fromAmountText = formatTokenAmountFromUnits(
                snapshot.fromAmount ?? snapshot.amount,
                snapshot.decimals,
                { minimumFractionDigits: 0, maximumFractionDigits: 6 }
            );
            if (!fromAmountText) {
                fromAmountText = '1';
            }

            let toAmountText = formatTokenAmountFromUnits(
                snapshot.toAmount,
                snapshot.quoteDecimals,
                { minimumFractionDigits: 6, maximumFractionDigits: 8 }
            );
            const priceNumeric = Number(snapshot.price);
            if (!toAmountText && Number.isFinite(priceNumeric)) {
                toAmountText = formatTokenQuantity(priceNumeric, {
                    minimumFractionDigits: 6,
                    maximumFractionDigits: 8
                });
            }

            const priceImpactText = Number.isFinite(snapshot.priceImpactPercent)
                ? formatPercentage(snapshot.priceImpactPercent, {
                    includeSign: true,
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                })
                : null;

            const feeText = Number.isFinite(Number(snapshot.tradeFeeUsd))
                ? formatUsdPrice(snapshot.tradeFeeUsd)
                : null;

            const routeText = typeof snapshot.routeLabel === 'string' && snapshot.routeLabel.trim()
                ? snapshot.routeLabel.trim()
                : null;

            const sourceLabelParts = [];
            if (typeof snapshot.source === 'string' && snapshot.source.trim()) {
                sourceLabelParts.push(snapshot.source.trim());
            } else {
                sourceLabelParts.push('OKX DEX');
            }
            if (snapshot.chain && snapshot.chain !== '(default)') {
                sourceLabelParts.push(`chain: ${snapshot.chain}`);
            }
            const sourceLabel = sourceLabelParts.join(' · ');

            const timestamp = snapshot.timestamp ? new Date(snapshot.timestamp) : new Date();
            const timestampIso = Number.isNaN(timestamp.getTime()) ? new Date().toISOString() : timestamp.toISOString();

            const lines = [
                t(lang, 'banmaoprice_title'),
                '',
                t(lang, 'banmaoprice_quote_line', {
                    fromAmount: fromAmountText,
                    fromSymbol: snapshot.fromSymbol || snapshot.baseSymbol || 'BANMAO',
                    toAmount: toAmountText || '—',
                    toSymbol: snapshot.toSymbol || snapshot.quoteSymbol || 'USDT'
                }),
                t(lang, 'banmaoprice_price_usd', { priceUsd: priceUsdText }),
                priceOkbText && priceOkbText !== '—' ? t(lang, 'banmaoprice_price_okb', { priceOkb: priceOkbText }) : null,
                feeText ? t(lang, 'banmaoprice_fee_line', { feeUsd: feeText }) : null,
                priceImpactText ? t(lang, 'banmaoprice_price_impact_line', { impact: priceImpactText }) : null,
                routeText ? t(lang, 'banmaoprice_route_line', { route: routeText }) : null,
                t(lang, 'banmaoprice_timestamp_line', { timestamp: timestampIso }),
                t(lang, 'banmaoprice_source_line', { source: sourceLabel })
            ].filter(Boolean);

            await sendMessageRespectingThread(chatId, msg, lines.join('\n'), { parse_mode: 'Markdown' });
        } catch (error) {
            console.error(`[Price] Failed to fetch price: ${error.message}`);
            sendReply(msg, t(lang, 'banmaoprice_error'), { parse_mode: 'Markdown' });
        }
    }

    async function handleUnregisterCommand(msg) {
        const chatId = msg.chat.id.toString();
        const lang = await getLang(msg);
        const menu = await buildUnregisterMenu(lang, chatId);
        await sendReply(msg, menu.text, {
            parse_mode: 'HTML',
            reply_markup: menu.replyMarkup || undefined
        });
    }

    async function handleLanguageCommand(msg) {
        const chatId = msg.chat.id.toString();
        const chatType = msg.chat.type;
        const lang = await getLang(msg);
        const isGroupChat = chatType === 'group' || chatType === 'supergroup';

        if (isGroupChat) {
            let memberInfo = null;
            try {
                memberInfo = await bot.getChatMember(chatId, msg.from.id);
            } catch (error) {
                console.warn(`[GroupLanguage] Không thể kiểm tra quyền admin cho ${chatId}: ${error.message}`);
            }

            const isAdmin = memberInfo && ['administrator', 'creator'].includes(memberInfo.status);
            if (!isAdmin) {
                const feedbackLang = resolveLangCode(msg.from.language_code || lang);
                sendReply(msg, t(feedbackLang, 'group_language_admin_only'), { parse_mode: 'Markdown' });
                return;
            }
        }

        const textKey = isGroupChat ? 'select_group_language' : 'select_language';
        const text = t(lang, textKey);
        const options = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🇻🇳 Tiếng Việt', callback_data: 'lang_vi' }, { text: '🇺🇸 English', callback_data: 'lang_en' }],
                    [{ text: '🇨🇳 中文', callback_data: 'lang_zh' }, { text: '🇷🇺 Русский', callback_data: 'lang_ru' }],
                    [{ text: '🇰🇷 한국어', callback_data: 'lang_ko' }, { text: '🇮🇩 Indonesia', callback_data: 'lang_id' }]
                ]
            }
        };
        sendReply(msg, text, options);
    }


    async function startRegisterWizard(userId, lang) {
        const userKey = userId.toString();
        const dmLang = await resolveNotificationLanguage(userKey, lang);

        const existing = registerWizardStates.get(userKey);
        if (existing?.promptMessageId) {
            try {
                await bot.deleteMessage(userId, existing.promptMessageId);
            } catch (error) {
                // ignore cleanup errors
            }
        }

        const promptText = t(dmLang, 'register_help_prompt');
        const placeholder = t(dmLang, 'register_help_placeholder');
        const message = await bot.sendMessage(userId, promptText, {
            reply_markup: {
                force_reply: true,
                input_field_placeholder: placeholder
            }
        });
        registerWizardStates.set(userKey, { promptMessageId: message.message_id });
        return message;
    }
    
    // Xử lý /start CÓ token (Từ DApp) - Cần async
    bot.onText(/\/start (.+)/, async (msg, match) => {
        const chatId = msg.chat.id.toString();
        const token = match[1];
        // Khi /start, luôn ưu tiên ngôn ngữ của thiết bị
        const lang = resolveLangCode(msg.from.language_code);
        const walletAddress = await db.getPendingWallet(token);
        if (walletAddress) {
            const result = await db.addWalletToUser(chatId, lang, walletAddress);
            await db.deletePendingToken(token);
            const messageKey = result?.added ? 'connect_success' : 'register_wallet_exists';
            const message = t(lang, messageKey, { walletAddress: walletAddress, wallet: shortenAddress(walletAddress) });
            sendReply(msg, message, { parse_mode: "Markdown" });
            console.log(`[BOT] Liên kết (DApp): ${walletAddress} -> ${chatId} (lang: ${lang})`);
        } else {
            const message = t(lang, 'connect_fail_token');
            sendReply(msg, message, { parse_mode: "Markdown" });
            console.log(`[BOT] Token không hợp lệ: ${token}`);
        }
    });

    // Xử lý /start KHÔNG CÓ token (Gõ tay) - Cần async
    bot.onText(/\/start$/, async (msg) => {
        await handleStartNoToken(msg);
    });

    // COMMAND: /register - Cần async
    bot.onText(/^\/register(?:@[\w_]+)?(?:\s+(.+))?$/, async (msg, match) => {
        const payload = match[1];
        await handleRegisterCommand(msg, payload);
    });

    // COMMAND: /mywallet - Cần async
    bot.onText(/\/mywallet/, async (msg) => {
        await handleMyWalletCommand(msg);
    });

    // COMMAND: /donate - Cần async
    bot.onText(/^\/donate(?:@[\w_]+)?$/, async (msg) => {
        await handleDonateCommand(msg);
    });

    bot.onText(/^\/checkin(?:@[\w_]+)?$/, async (msg) => {
        const chatType = msg.chat?.type;
        const chatId = msg.chat.id.toString();
        const userLang = await resolveNotificationLanguage(msg.from.id.toString(), msg.from.language_code);
        if (chatType === 'private') {
            await bot.sendMessage(chatId, t(userLang, 'checkin_dm_use_button'));
            return;
        }

        const result = await initiateCheckinChallenge(chatId, msg.from, { replyMessage: msg });
        const responseLang = result.userLang || userLang;
        if (result.status === 'locked') {
            await bot.sendMessage(msg.from.id, t(responseLang, 'checkin_error_locked'));
        } else if (result.status === 'checked') {
            await bot.sendMessage(msg.from.id, t(responseLang, 'checkin_error_already_checked'));
        } else if (result.status === 'failed') {
            if (result.failureReason === 'dm_unreachable') {
                if (result.startLink) {
                    await sendCheckinStartPrompt(msg, responseLang, result.startLink, msg.from);
                } else {
                    await sendCheckinDmFailureNotice(msg, responseLang, msg.from);
                }
            } else {
                await bot.sendMessage(msg.from.id, t(responseLang, 'checkin_error_dm_failed'));
            }
        } else {
            await bot.sendMessage(msg.from.id, t(responseLang, 'checkin_answer_sent_dm'));
        }
    });

    bot.onText(/^\/topcheckin(?:@[\w_]+)?(?:\s+(streak|total|points|longest))?$/, async (msg, match) => {
        const chatId = msg.chat.id.toString();
        const chatType = msg.chat?.type;
        const mode = (match && match[1]) ? match[1] : 'streak';
        const userLang = await resolveNotificationLanguage(msg.from.id.toString(), msg.from.language_code);
        if (chatType === 'private') {
            await bot.sendMessage(chatId, t(userLang, 'checkin_error_group_only'));
            return;
        }

        const boardLang = await resolveGroupLanguage(chatId);
        const text = await buildLeaderboardText(chatId, mode, 10, boardLang);
        await sendMessageRespectingThread(chatId, msg, text);
    });

    bot.onText(/\/okxchains/, async (msg) => {
        await handleOkxChainsCommand(msg);
    });

    function parseDurationText(value) {
        if (!value) {
            return null;
        }
        const match = String(value).trim().match(/^(\d+)([smhd])$/i);
        if (!match) {
            return null;
        }
        const amount = Number(match[1]);
        const unit = match[2].toLowerCase();
        const map = { s: 1, m: 60, h: 3600, d: 86400 };
        const multiplier = map[unit];
        if (!multiplier) {
            return null;
        }
        return amount * multiplier;
    }

    function resolveCommandTarget(msg, explicitArg) {
        if (msg.reply_to_message?.from?.id) {
            const targetUser = msg.reply_to_message.from;
            return {
                id: targetUser.id,
                name: targetUser.first_name || targetUser.username || String(targetUser.id)
            };
        }

        if (explicitArg && /^\d+$/.test(explicitArg)) {
            return { id: Number(explicitArg), name: explicitArg };
        }

        return null;
    }

    async function sendAdminCommandList(targetChatId, lang, replyToMessageId = null) {
        try {
            const cheatsheet = buildAdminCommandCheatsheet(lang);
            await bot.sendMessage(targetChatId, cheatsheet.text, {
                reply_to_message_id: replyToMessageId,
                allow_sending_without_reply: true,
                reply_markup: cheatsheet.replyMarkup
            });
        } catch (error) {
            console.error(`[AdminCommand] Failed to send cheatsheet to ${targetChatId}: ${error.message}`);
        }
    }

    async function handleAdminActionCommand(msg, rawArgs) {
        const lang = await getLang(msg);
        const chatType = msg.chat.type;
        if (!['group', 'supergroup'].includes(chatType)) {
            await sendReply(msg, t(lang, 'admin_action_group_only'));
            return;
        }

        const chatId = msg.chat.id.toString();
        const adminId = msg.from?.id;
        if (!adminId) {
            return;
        }

        const isAdmin = await isGroupAdmin(chatId, adminId);
        if (!isAdmin) {
            await sendReply(msg, t(lang, 'admin_action_no_permission'));
            return;
        }

        const args = (rawArgs || '').trim();
        if (!args) {
            await sendReply(msg, t(lang, 'admin_action_missing_args'));
            return;
        }

        const [action, ...restParts] = args.split(/\s+/);
        const command = action.toLowerCase();
        const rest = [...restParts];
        const defaultReplyOptions = { reply_to_message_id: msg.message_id, allow_sending_without_reply: true };

        const sendFeedback = async (text) => {
            if (text) {
                await bot.sendMessage(chatId, text, { ...defaultReplyOptions, parse_mode: 'Markdown' });
            }
        };

        try {
            switch (command) {
                case 'mute': {
                    const targetArg = msg.reply_to_message ? null : rest.shift();
                    const target = resolveCommandTarget(msg, targetArg);
                    if (!target) {
                        await sendFeedback(t(lang, 'admin_mute_invalid'));
                        break;
                    }
                    const durationArg = rest.shift();
                    const seconds = parseDurationText(durationArg) || 600;
                    const untilDate = Math.floor(Date.now() / 1000) + seconds;
                    const permissions = {
                        can_send_messages: false,
                        can_send_media_messages: false,
                        can_send_polls: false,
                        can_send_other_messages: false,
                        can_add_web_page_previews: false,
                        can_change_info: false,
                        can_invite_users: false,
                        can_pin_messages: false
                    };
                    await bot.restrictChatMember(chatId, target.id, { permissions, until_date: untilDate });
                    await sendFeedback(t(lang, 'admin_mute_success', {
                        user: target.name,
                        minutes: Math.ceil(seconds / 60).toString()
                    }));
                    break;
                }
                case 'warn': {
                    const targetArg = msg.reply_to_message ? null : rest.shift();
                    const target = resolveCommandTarget(msg, targetArg);
                    if (!target) {
                        await sendFeedback(t(lang, 'admin_warn_invalid'));
                        break;
                    }
                    const reason = rest.join(' ') || t(lang, 'admin_warn_default_reason');
                    await db.addWarning({
                        chatId,
                        targetUserId: target.id,
                        targetUsername: msg.reply_to_message?.from?.username || null,
                        reason,
                        createdBy: adminId
                    });
                    const warnings = await db.getWarnings(chatId, target.id);
                    await sendFeedback(t(lang, 'admin_warn_success', {
                        user: target.name,
                        count: warnings.length.toString(),
                        reason
                    }));
                    break;
                }
                case 'warnings': {
                    const targetArg = msg.reply_to_message ? null : rest.shift();
                    const target = resolveCommandTarget(msg, targetArg);
                    if (!target) {
                        await sendFeedback(t(lang, 'admin_warn_invalid'));
                        break;
                    }
                    const warnings = await db.getWarnings(chatId, target.id);
                    if (!warnings.length) {
                        await sendFeedback(t(lang, 'admin_warnings_none', { user: target.name }));
                        break;
                    }
                    const lines = warnings.map((warning, index) => {
                        const time = new Date(Number(warning.createdAt || 0)).toLocaleString();
                        return `${index + 1}. ${warning.reason || '—'} (${time})`;
                    });
                    await sendFeedback([t(lang, 'admin_warnings_header', { user: target.name }), ...lines].join('\n'));
                    break;
                }
                case 'purge': {
                    let count = parseInt(rest.shift(), 10);
                    if (!Number.isFinite(count) || count <= 0) {
                        count = 10;
                    }
                    count = Math.min(count, 100);
                    let deleted = 0;
                    const baseId = msg.reply_to_message?.message_id ?? msg.message_id;
                    for (let i = 0; i < count; i += 1) {
                        const targetMessageId = baseId - i - (msg.reply_to_message ? 0 : 1);
                        if (targetMessageId <= 0) {
                            break;
                        }
                        try {
                            await bot.deleteMessage(chatId, targetMessageId);
                            deleted += 1;
                        } catch (error) {
                            break;
                        }
                    }
                    try {
                        await bot.deleteMessage(chatId, msg.message_id);
                    } catch (error) {
                        // ignore
                    }
                    await sendFeedback(t(lang, 'admin_purge_done', { count: deleted.toString() }));
                    break;
                }
                case 'set_captcha': {
                    const nextState = (rest.shift() || '').toLowerCase() === 'on';
                    await db.updateGroupBotSettings(chatId, { captchaEnabled: nextState });
                    await sendFeedback(t(lang, 'admin_captcha_status', { status: nextState ? 'ON' : 'OFF' }));
                    break;
                }
                case 'set_rules': {
                    const text = rest.join(' ') || msg.reply_to_message?.text;
                    if (!text) {
                        await sendFeedback(t(lang, 'admin_rules_missing'));
                        break;
                    }
                    await db.setGroupRules(chatId, text, adminId);
                    await sendFeedback(t(lang, 'admin_rules_updated'));
                    break;
                }
                case 'add_blacklist': {
                    const word = rest.join(' ');
                    if (!word) {
                        await sendFeedback(t(lang, 'admin_blacklist_missing'));
                        break;
                    }
                    await db.addBlacklistWord(chatId, word);
                    await sendFeedback(t(lang, 'admin_blacklist_added', { word }));
                    break;
                }
                case 'remove_blacklist': {
                    const word = rest.join(' ');
                    if (!word) {
                        await sendFeedback(t(lang, 'admin_blacklist_missing'));
                        break;
                    }
                    await db.removeBlacklistWord(chatId, word);
                    await sendFeedback(t(lang, 'admin_blacklist_removed', { word }));
                    break;
                }
                case 'set_xp': {
                    const targetArg = msg.reply_to_message ? null : rest.shift();
                    const target = resolveCommandTarget(msg, targetArg);
                    const amountArg = rest.shift();
                    if (!target || !amountArg) {
                        await sendFeedback(t(lang, 'admin_set_xp_invalid'));
                        break;
                    }
                    const amount = Number(amountArg);
                    if (!Number.isFinite(amount)) {
                        await sendFeedback(t(lang, 'admin_set_xp_invalid'));
                        break;
                    }
                    await db.setMemberXp(chatId, target.id, amount);
                    await sendFeedback(t(lang, 'admin_set_xp_success', {
                        user: target.name,
                        amount: amount.toString()
                    }));
                    break;
                }
                case 'update_info': {
                    await db.updateGroupBotSettings(chatId, { infoRefreshedAt: Date.now() });
                    await sendFeedback(t(lang, 'admin_update_info_done'));
                    break;
                }
                case 'status': {
                    const settings = await db.getGroupBotSettings(chatId);
                    const lines = [
                        t(lang, 'admin_status_header', { chat: msg.chat.title || chatId }),
                        t(lang, 'admin_status_line', { label: 'Captcha', value: settings.captchaEnabled ? 'ON' : 'OFF' }),
                        t(lang, 'admin_status_line', { label: 'Predict', value: settings.predictEnabled ? 'ON' : 'OFF' }),
                        t(lang, 'admin_status_line', { label: 'XP React', value: settings.xpReactEnabled ? 'ON' : 'OFF' }),
                        t(lang, 'admin_status_line', { label: 'Whale Alerts', value: settings.whaleWatchEnabled ? 'ON' : 'OFF' }),
                        t(lang, 'admin_status_line', { label: 'Tracked Wallets', value: (settings.trackedWallets?.length || 0).toString() })
                    ];
                    await sendFeedback(lines.join('\n'));
                    break;
                }
                case 'toggle_predict': {
                    const desired = (rest.shift() || '').toLowerCase();
                    const settings = await db.getGroupBotSettings(chatId);
                    let nextState = !settings.predictEnabled;
                    if (desired === 'on') {
                        nextState = true;
                    } else if (desired === 'off') {
                        nextState = false;
                    }
                    await db.updateGroupBotSettings(chatId, { predictEnabled: nextState });
                    await sendFeedback(t(lang, 'admin_predict_status', { status: nextState ? 'ON' : 'OFF' }));
                    break;
                }
                case 'set_xp_react': {
                    const nextState = (rest.shift() || '').toLowerCase() === 'on';
                    await db.updateGroupBotSettings(chatId, { xpReactEnabled: nextState });
                    await sendFeedback(t(lang, 'admin_xp_react_status', { status: nextState ? 'ON' : 'OFF' }));
                    break;
                }
                case 'whale': {
                    const desired = (rest.shift() || '').toLowerCase();
                    const settings = await db.getGroupBotSettings(chatId);
                    let nextState = !settings.whaleWatchEnabled;
                    if (desired === 'on') {
                        nextState = true;
                    } else if (desired === 'off') {
                        nextState = false;
                    }
                    await db.updateGroupBotSettings(chatId, { whaleWatchEnabled: nextState });
                    await sendFeedback(t(lang, 'admin_whale_status', { status: nextState ? 'ON' : 'OFF' }));
                    break;
                }
                case 'draw': {
                    const prize = rest.shift();
                    const rules = rest.join(' ');
                    if (!prize) {
                        await sendFeedback(t(lang, 'admin_draw_invalid'));
                        break;
                    }
                    const candidates = await db.getTopCheckins(chatId, 50, 'points');
                    if (!candidates.length) {
                        await sendFeedback(t(lang, 'admin_draw_no_candidates'));
                        break;
                    }
                    const winner = candidates[Math.floor(Math.random() * candidates.length)];
                    await sendFeedback(t(lang, 'admin_draw_result', { prize, winner: winner.userId, rules: rules || '—' }));
                    break;
                }
                case 'review_memes': {
                    const memes = await db.getPendingMemes(chatId);
                    if (!memes.length) {
                        await sendFeedback(t(lang, 'admin_review_memes_empty'));
                        break;
                    }
                    const lines = memes.map((meme) => `#${meme.id} - ${meme.content.slice(0, 80)}`);
                    await sendFeedback([t(lang, 'admin_review_memes_header'), ...lines].join('\n'));
                    break;
                }
                case 'approve':
                case 'reject': {
                    const memeId = rest.shift();
                    if (!memeId) {
                        await sendFeedback(t(lang, 'admin_meme_invalid'));
                        break;
                    }
                    const status = command === 'approve' ? 'approved' : 'rejected';
                    await db.updateMemeStatus(memeId, status);
                    await sendFeedback(t(lang, 'admin_review_memes_updated', { id: memeId, status }));
                    break;
                }
                case 'announce': {
                    const announcement = rest.join(' ') || msg.reply_to_message?.text;
                    if (!announcement) {
                        await sendFeedback(t(lang, 'admin_announce_missing'));
                        break;
                    }
                    await bot.sendMessage(chatId, t(lang, 'admin_announce_prefix', { message: announcement }), { allow_sending_without_reply: true });
                    await sendFeedback(t(lang, 'admin_announce_sent'));
                    break;
                }
                case 'track': {
                    const address = rest.shift();
                    const label = rest.join(' ') || 'Tracked Wallet';
                    const normalized = normalizeAddressSafe(address);
                    if (!normalized) {
                        await sendFeedback(t(lang, 'admin_track_invalid'));
                        break;
                    }
                    const settings = await db.getGroupBotSettings(chatId);
                    const list = Array.isArray(settings.trackedWallets) ? settings.trackedWallets : [];
                    const nextList = list.filter((entry) => entry.address?.toLowerCase() !== normalized.toLowerCase());
                    nextList.push({ address: normalized, name: label });
                    await db.updateGroupBotSettings(chatId, { trackedWallets: nextList });
                    await sendFeedback(t(lang, 'admin_track_added', { wallet: shortenAddress(normalized), name: label }));
                    break;
                }
                default:
                    await sendFeedback(t(lang, 'admin_action_unknown'));
                    break;
            }
        } catch (error) {
            console.error(`[AdminCommand] Failed to execute ${command}: ${error.message}`);
            await sendFeedback(t(lang, 'admin_action_error'));
        }
    }

    async function handleAdminCommand(msg, options = {}) {
        const { mode = 'admin' } = options;
        const chatId = msg.chat.id;
        const userId = msg.from?.id;
        const chatType = msg.chat.type;

        if (!userId) {
            return;
        }

        const fallbackLang = msg.from?.language_code;

        if (chatType === 'private') {
            const lang = await getLang(msg);
            if (mode === 'checkinadmin') {
                try {
                    await openAdminHub(userId, { fallbackLang });
                    await sendAdminMenu(userId, chatId, { fallbackLang });
                } catch (error) {
                    console.error(`[AdminHub] Failed to open hub for ${userId}: ${error.message}`);
                    await sendReply(msg, t(lang, 'checkin_admin_command_error'));
                }
            } else {
                const cheatsheet = buildAdminCommandCheatsheet(lang);
                await sendReply(msg, cheatsheet.text, { reply_markup: cheatsheet.replyMarkup });
            }
            return;
        }

        const isGroupChat = ['group', 'supergroup'].includes(chatType);
        const replyLang = isGroupChat
            ? await resolveGroupLanguage(chatId, defaultLang)
            : await getLang(msg);

        if (!isGroupChat) {
            await sendReply(msg, t(replyLang, 'checkin_admin_command_group_only'));
            return;
        }

        const isAdmin = await isGroupAdmin(chatId, userId);
        if (!isAdmin) {
            await bot.sendMessage(chatId, t(replyLang, 'checkin_admin_menu_no_permission'), {
                reply_to_message_id: msg.message_id,
                allow_sending_without_reply: true
            });
            return;
        }

        if (mode === 'checkinadmin') {
            try {
                await db.ensureCheckinGroup(chatId.toString());
            } catch (error) {
                console.error(`[AdminHub] Failed to register group ${chatId}: ${error.message}`);
            }

            try {
                await sendAdminCommandList(chatId, replyLang, msg.message_id);
                await openAdminHub(userId, { fallbackLang });
                await sendAdminMenu(userId, chatId, { fallbackLang });
                await bot.sendMessage(chatId, t(replyLang, 'checkin_admin_command_dm_notice'), {
                    reply_to_message_id: msg.message_id,
                    allow_sending_without_reply: true
                });
            } catch (error) {
                console.error(`[AdminHub] Failed to send admin hub for ${userId} in ${chatId}: ${error.message}`);
                const statusCode = error?.response?.statusCode;
                const errorKey = statusCode === 403
                    ? 'checkin_admin_command_dm_error'
                    : 'checkin_admin_command_error';

                await bot.sendMessage(chatId, t(replyLang, errorKey), {
                    reply_to_message_id: msg.message_id,
                    allow_sending_without_reply: true
                });
            }
            return;
        }

        await sendAdminCommandList(chatId, replyLang, msg.message_id);
    }

    bot.onText(/^\/checkinadmin(?:@[\w_]+)?$/, async (msg) => {
        await handleAdminCommand(msg, { mode: 'checkinadmin' });
    });

    bot.onText(/^\/admin(?:@[\w_]+)?\s+(.+)/, async (msg, match) => {
        await handleAdminActionCommand(msg, match[1]);
    });

    bot.onText(/^\/admin(?:@[\w_]+)?$/, async (msg) => {
        await handleAdminCommand(msg, { mode: 'admin' });
    });

    bot.onText(/\/okx402status/, async (msg) => {
        await handleOkx402StatusCommand(msg);
    });

    bot.onText(/\/rules/, async (msg) => {
        await handleRulesCommand(msg);
    });

    bot.onText(/\/unregister/, async (msg) => {
        await handleUnregisterCommand(msg);
    });

    // LỆNH: /language - Cần async
    bot.onText(/\/language/, async (msg) => {
        await handleLanguageCommand(msg);
    });

    // LỆNH: /help - Cần async
    bot.onText(/\/help/, async (msg) => {
        const lang = await getLang(msg);
        const defaultGroup = getDefaultHelpGroup('user');
        const helpText = buildHelpText(lang, 'user');
        const replyMarkup = buildHelpKeyboard(lang, 'user', defaultGroup);
        const sent = await sendReply(msg, helpText, { parse_mode: 'HTML', reply_markup: replyMarkup });
        if (sent?.chat?.id && sent?.message_id) {
            saveHelpMessageState(sent.chat.id.toString(), sent.message_id, { view: 'user', group: defaultGroup });
        }
    });

    // Xử lý tất cả CALLBACK QUERY (Nút bấm) - Cần async
    const helpCommandExecutors = {
        start: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            await handleStartNoToken(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        register: async (query, lang) => {
            try {
                await startRegisterWizard(query.from.id, lang);
                return { message: t(lang, 'help_action_dm_sent') };
            } catch (error) {
                const statusCode = error?.response?.statusCode;
                if (statusCode === 403) {
                    return { message: t(lang, 'help_action_dm_blocked'), showAlert: true };
                }
                console.error(`[Help] Failed to start register wizard for ${query.from.id}: ${error.message}`);
                return { message: t(lang, 'help_action_failed'), showAlert: true };
            }
        },
        mywallet: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            await handleMyWalletCommand(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        rules: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            await handleRulesCommand(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        donate: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            await handleDonateCommand(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        okxchains: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            await handleOkxChainsCommand(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        okx402status: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            await handleOkx402StatusCommand(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        unregister: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            await handleUnregisterCommand(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        language: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            await handleLanguageCommand(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        help: async (query, lang) => ({ message: t(lang, 'help_action_executed') }),
        checkin: async (query, lang) => {
            const chatId = query.message?.chat?.id;
            const chatType = query.message?.chat?.type;
            if (!chatId || chatType === 'private') {
                return { message: t(lang, 'help_action_not_available'), showAlert: true };
            }

            const result = await initiateCheckinChallenge(chatId, query.from, { replyMessage: query.message });
            const responseLang = result.userLang || lang;
            if (result.status === 'locked') {
                return { message: t(responseLang, 'checkin_error_locked'), showAlert: true };
            }
            if (result.status === 'checked') {
                return { message: t(responseLang, 'checkin_error_already_checked'), showAlert: true };
            }
            if (result.status === 'failed') {
                if (result.failureReason === 'dm_unreachable') {
                    return { message: t(responseLang, 'checkin_dm_failure_start_alert'), showAlert: true };
                }
                return { message: t(responseLang, 'checkin_error_dm_failed'), showAlert: true };
            }
            return { message: t(responseLang, 'checkin_answer_sent_alert') };
        },
        topcheckin: async (query, lang) => {
            const chatId = query.message?.chat?.id;
            const chatType = query.message?.chat?.type;
            if (!chatId || chatType === 'private') {
                return { message: t(lang, 'help_action_not_available'), showAlert: true };
            }

            const boardLang = await resolveGroupLanguage(chatId);
            const text = await buildLeaderboardText(chatId, 'streak', 10, boardLang);
            await sendMessageRespectingThread(chatId, query.message, text);
            return { message: t(lang, 'help_action_executed') };
        },
        admin: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            await handleAdminCommand(synthetic);
            return { message: t(lang, 'help_action_executed') };
        },
        checkinadmin: async (query, lang) => {
            const synthetic = buildSyntheticCommandMessage(query);
            synthetic.text = '/checkinadmin';
            await handleAdminCommand(synthetic);
            return { message: t(lang, 'help_action_executed') };
        }
    };

    bot.on('callback_query', async (query) => {
        const queryId = query.id;
        const messageChatId = query.message?.chat?.id;
        const chatId = messageChatId ? messageChatId.toString() : null;
        const fallbackLang = resolveLangCode(query.from?.language_code || defaultLang);
        const lang = query.message ? await getLang(query.message) : fallbackLang; // <-- SỬA LỖI
        const callbackLang = await resolveNotificationLanguage(query.from.id, lang || fallbackLang);

        try {
            if (query.data === 'ui_close') {
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore cleanup errors
                    }
                }
                await bot.answerCallbackQuery(queryId);
                return;
            }

            if (query.data.startsWith('copy_text|')) {
                const token = query.data.split('|')[1];
                const value = resolveCopyPayload(token);
                if (!value) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'copy_action_missing'), show_alert: true });
                    return;
                }
                if (chatId) {
                    await bot.sendMessage(chatId, `<code>${escapeHtml(value)}</code>`, { parse_mode: 'HTML' });
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'copy_action_ready') });
                return;
            }

            if (query.data === 'rules_close') {
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore cleanup errors
                    }
                }
                await bot.answerCallbackQuery(queryId);
                return;
            }

            if (query.data === 'wallet_overview' || query.data.startsWith('wallet_chain_menu')) {
                if (!chatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const walletParam = query.data.startsWith('wallet_chain_menu')
                    ? decodeURIComponent(query.data.split('|')[1] || '')
                    : null;

                try {
                    if (walletParam) {
                        const menu = await buildWalletChainMenu(callbackLang, walletParam);
                        const options = {
                            chat_id: chatId,
                            message_id: query.message?.message_id,
                            parse_mode: 'HTML',
                            reply_markup: menu.replyMarkup
                        };

                        if (options.message_id) {
                            await bot.editMessageText(menu.text, options);
                        } else {
                            await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });
                        }
                    } else {
                        const menu = await buildWalletSelectMenu(callbackLang, chatId);
                        const options = {
                            chat_id: chatId,
                            message_id: query.message?.message_id,
                            parse_mode: 'HTML',
                            reply_markup: menu.replyMarkup
                        };

                        if (options.message_id) {
                            await bot.editMessageText(menu.text, options);
                        } else {
                            await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });
                        }
                    }
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_action_done') });
                } catch (error) {
                    console.error(`[WalletChains] Failed to render wallet menu: ${error.message}`);
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_overview_error'), show_alert: true });
                }
                return;
            }

            if (query.data.startsWith('wallet_pick|')) {
                if (!chatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const wallet = decodeURIComponent(query.data.split('|')[1] || '');
                try {
                    const menu = await buildWalletChainMenu(callbackLang, wallet);
                    const options = {
                        chat_id: chatId,
                        message_id: query.message?.message_id,
                        parse_mode: 'HTML',
                        reply_markup: menu.replyMarkup
                    };

                    if (options.message_id) {
                        await bot.editMessageText(menu.text, options);
                    } else {
                        await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });
                    }

                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_action_done') });
                } catch (error) {
                    console.error(`[WalletPick] Failed to render chains for ${wallet}: ${error.message}`);
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_overview_error'), show_alert: true });
                }
                return;
            }

            if (query.data.startsWith('wallet_chain|')) {
                if (!chatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const parts = query.data.split('|');
                const chainToken = parts[1] ? parts[1].trim() : null;
                const third = parts[2] ? decodeURIComponent(parts[2]) : null;
                const fourth = parts[3] ? decodeURIComponent(parts[3]) : null;

                let chainShort = null;
                let targetWallet = null;
                let chainId = Number.isFinite(Number(chainToken)) ? Number(chainToken) : null;
                let chainEntry = null;

                if (chainToken && !Number.isFinite(chainId)) {
                    const resolved = resolveWalletChainCallback(chainToken);
                    if (resolved?.chainContext) {
                        chainEntry = resolved.chainContext;
                        chainId = Number.isFinite(chainEntry.chainId)
                            ? chainEntry.chainId
                            : Number.isFinite(chainEntry.chainIndex)
                                ? chainEntry.chainIndex
                                : chainId;
                        chainShort = chainEntry.chainShortName || chainShort;
                        targetWallet = targetWallet || resolved.wallet || null;
                    }
                }

                if (fourth) {
                    chainShort = third;
                    targetWallet = normalizeAddressSafe(fourth) || fourth;
                } else if (third) {
                    const maybeWallet = normalizeAddressSafe(third);
                    if (maybeWallet) {
                        targetWallet = maybeWallet;
                    } else {
                        chainShort = third;
                    }
                }

                try {
                    const chains = await fetchOkxBalanceSupportedChains();
                    chainEntry = chainEntry || chains.find((entry) => Number(entry.chainId) === chainId
                        || Number(entry.chainIndex) === chainId
                        || (chainShort && entry.chainShortName === chainShort));
                } catch (error) {
                    console.warn(`[WalletChains] Failed to load chains for selection: ${error.message}`);
                }

                const chainContext = chainEntry || {
                    chainId: Number.isFinite(chainId) ? chainId : 196,
                    chainIndex: Number.isFinite(chainId) ? chainId : 196,
                    chainShortName: chainEntry?.chainShortName || chainShort || 'xlayer',
                    aliases: chainEntry?.aliases || (chainShort ? [chainShort] : ['xlayer'])
                };
                const chainLabel = formatChainLabel(chainContext) || 'X Layer (#196)';

                try {
                    const normalizedWallet = normalizeAddressSafe(targetWallet) || targetWallet;
                    const liveSnapshot = await fetchLiveWalletTokens(normalizedWallet, {
                        chainContext,
                        forceDex: true
                    });

                    const entries = [{
                        address: normalizedWallet,
                        tokens: Array.isArray(liveSnapshot.tokens) ? liveSnapshot.tokens : [],
                        warning: liveSnapshot.warning,
                        cached: false,
                        totalUsd: Number.isFinite(liveSnapshot.totalUsd) ? liveSnapshot.totalUsd : null
                    }];

                    const text = await buildWalletBalanceText(callbackLang, entries, { chainLabel });
                    const chainRefreshToken = createWalletChainCallback(chainContext, normalizedWallet);
                    const chainCallbackData = chainRefreshToken ? `wallet_chain|${chainRefreshToken}` : null;
                    const tokenButtonRows = buildWalletTokenButtonRows(callbackLang, entries[0]?.tokens || [], {
                        wallet: normalizedWallet,
                        chainContext,
                        chainLabel,
                        chainCallbackData
                    });
                    const portfolioRows = entries
                        .map((entry) => ({ address: entry.address, url: buildPortfolioEmbedUrl(entry.address) }))
                        .filter((row) => row.address && row.url)
                        .map((row) => [{ text: t(callbackLang, 'wallet_action_portfolio', { wallet: shortenAddress(row.address) }), url: row.url }]);
                    const backTarget = targetWallet || normalizedWallet;
                    const backCallback = backTarget ? `wallet_chain_menu|${encodeURIComponent(backTarget)}` : 'wallet_overview';
                    const combinedRows = [];
                    if (tokenButtonRows.length > 0) {
                        combinedRows.push(...tokenButtonRows);
                    }
                    if (portfolioRows.length > 0) {
                        combinedRows.push(...portfolioRows);
                    }
                    const replyMarkup = appendCloseButton(
                        combinedRows.length ? { inline_keyboard: combinedRows } : null,
                        callbackLang,
                        { backCallbackData: backCallback }
                    );

                    let rendered = false;
                    if (query.message?.message_id) {
                        try {
                            await bot.editMessageText(text, {
                                chat_id: chatId,
                                message_id: query.message.message_id,
                                parse_mode: 'HTML',
                                reply_markup: replyMarkup
                            });
                            rendered = true;
                        } catch (editError) {
                            console.warn(`[WalletChains] editMessageText failed, retrying with sendMessage: ${editError.message}`);
                        }
                    }

                    if (!rendered) {
                        await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: replyMarkup });
                    }

                    try {
                        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_action_done') });
                    } catch (ackError) {
                        console.warn(`[WalletChains] Callback ack failed: ${ackError.message}`);
                    }
                } catch (error) {
                    console.error(`[WalletChains] Failed to render holdings for chain ${chainId}: ${error.message}`);
                    const fallback = t(callbackLang, 'wallet_overview_wallet_no_token');
                    const backTarget = targetWallet || null;
                    const backCallback = backTarget ? `wallet_chain_menu|${encodeURIComponent(backTarget)}` : 'wallet_overview';
                    try {
                        await bot.sendMessage(chatId, fallback, { parse_mode: 'HTML', reply_markup: appendCloseButton(null, callbackLang, { backCallbackData: backCallback }) });
                    } catch (sendError) {
                        console.warn(`[WalletChains] Fallback send failed: ${sendError.message}`);
                    }
                    try {
                        await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_chain_error'), show_alert: true });
                    } catch (ackError) {
                        console.warn(`[WalletChains] Callback ack error after failure: ${ackError.message}`);
                    }
                }
                return;
            }

            if (query.data.startsWith('wallet_token_action|')) {
                if (!chatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }

                const parts = query.data.split('|');
                const tokenId = parts[1];
                const actionKey = parts[2];
                const context = resolveWalletTokenContext(tokenId, { extend: true });
                if (!context || !actionKey) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_token_action_error'), show_alert: true });
                    return;
                }

                try {
                    const actionResult = await buildWalletTokenActionResult(actionKey, context, callbackLang);
                    const menu = buildWalletTokenMenu(context, callbackLang, { actionResult });
                    let rendered = false;
                    if (query.message?.message_id) {
                        try {
                            await bot.editMessageText(menu.text, {
                                chat_id: chatId,
                                message_id: query.message.message_id,
                                parse_mode: 'HTML',
                                reply_markup: menu.replyMarkup
                            });
                            rendered = true;
                        } catch (editError) {
                            if (!isTelegramMessageNotModifiedError(editError)) {
                                throw editError;
                            }
                            rendered = true;
                        }
                    }

                    if (!rendered) {
                        await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });
                        rendered = true;
                    }

                    await sendWalletTokenExtraTexts(bot, chatId, menu.extraTexts);
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_action_done') });
                } catch (error) {
                    console.error(`[WalletToken] Failed to run ${actionKey}: ${error.message}`);
                    const alertText = error.message === 'wallet_token_missing_contract'
                        ? t(callbackLang, 'wallet_token_action_no_contract')
                        : t(callbackLang, 'wallet_token_action_error');
                    await bot.answerCallbackQuery(queryId, { text: alertText, show_alert: true });
                }
                return;
            }

            if (query.data.startsWith('wallet_token_view|')) {
                if (!chatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }

                const tokenId = query.data.split('|')[1];
                const context = resolveWalletTokenContext(tokenId, { extend: true });
                if (!context) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_token_action_error'), show_alert: true });
                    return;
                }

                const menu = buildWalletTokenMenu(context, callbackLang);
                await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: menu.replyMarkup });
                await sendWalletTokenExtraTexts(bot, chatId, menu.extraTexts);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_action_done') });
                return;
            }

            if (query.data === 'wallet_manage') {
                if (!chatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const menu = await buildUnregisterMenu(callbackLang, chatId);
                const options = {
                    chat_id: chatId,
                    message_id: query.message?.message_id,
                    parse_mode: 'HTML',
                    reply_markup: menu.replyMarkup || appendCloseButton(null, callbackLang, { backCallbackData: 'wallet_overview' })
                };

                try {
                    if (options.message_id) {
                        await bot.editMessageText(menu.text, options);
                    } else {
                        await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: options.reply_markup });
                    }
                } catch (error) {
                    await bot.sendMessage(chatId, menu.text, { parse_mode: 'HTML', reply_markup: options.reply_markup });
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'wallet_manage_opened') });
                return;
            }

            if (query.data.startsWith('wallet_remove|')) {
                if (!chatId || !query.message?.message_id) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }

                const [, scope, wallet, tokenKey] = query.data.split('|');
                let feedback = null;
                if (scope === 'all') {
                    const existingWallets = await db.getWalletsForUser(chatId);
                    await db.removeAllWalletsFromUser(chatId);
                    for (const w of existingWallets) {
                        teardownWalletWatcher(w);
                    }
                    feedback = t(callbackLang, 'unregister_all_success');
                } else if (scope === 'wallet' && wallet) {
                    await db.removeWalletFromUser(chatId, wallet);
                    teardownWalletWatcher(wallet);
                    feedback = t(callbackLang, 'unregister_wallet_removed', { wallet: shortenAddress(wallet) });
                } else if (scope === 'token' && wallet && tokenKey) {
                    await db.removeWalletTokenRecord(chatId, wallet, tokenKey);
                    feedback = t(callbackLang, 'unregister_token_removed', {
                        wallet: shortenAddress(wallet),
                        token: tokenKey.toUpperCase()
                    });
                }

                const menu = await buildUnregisterMenu(callbackLang, chatId);
                try {
                    await bot.editMessageText(menu.text, {
                        chat_id: query.message.chat.id,
                        message_id: query.message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: menu.replyMarkup || undefined
                    });
                } catch (error) {
                    // ignore edit errors
                }

                await bot.answerCallbackQuery(queryId, { text: feedback || t(callbackLang, 'unregister_action_done') });
                return;
            }

            if (query.data.startsWith('admin_cmd|')) {
                const [, payload] = query.data.split('|');
                if (payload === 'about_admin') {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'admin_command_admin_hint') });
                    return;
                }
                if (payload === 'checkinadmin') {
                    const synthetic = buildSyntheticCommandMessage(query);
                    await handleAdminCommand(synthetic, { mode: 'checkinadmin' });
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_opened') });
                    return;
                }

                if (payload === 'close' || payload === 'admin_cmd_close') {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore cleanup errors
                    }
                    await bot.answerCallbackQuery(queryId);
                    return;
                }

                const index = Number(payload);
                const detail = Number.isInteger(index) && index >= 0 && index < ADMIN_SUBCOMMANDS.length
                    ? ADMIN_SUBCOMMANDS[index]
                    : null;
                const description = detail ? t(callbackLang, detail.descKey) : null;
                const label = detail ? detail.command : 'admin';
                await bot.answerCallbackQuery(queryId, {
                    text: description ? `${label}: ${description}` : t(callbackLang, 'admin_action_unknown'),
                    show_alert: Boolean(description && description.length > 45)
                });
                return;
            }

            if (query.data === 'help_close') {
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore deletion errors
                    }
                    clearHelpMessageState(query.message.chat.id.toString(), query.message.message_id);
                }
                await bot.answerCallbackQuery(queryId);
                return;
            }

            if (query.data === 'help_separator') {
                await bot.answerCallbackQuery(queryId);
                return;
            }

            if (query.data.startsWith('help_view|')) {
                const [, requestedView] = query.data.split('|');
                const view = requestedView === 'admin' ? 'admin' : 'user';
                const helpText = buildHelpText(callbackLang, view);
                const defaultGroup = getDefaultHelpGroup(view);
                const replyMarkup = buildHelpKeyboard(callbackLang, view, defaultGroup);

                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.editMessageText(helpText, {
                            chat_id: query.message.chat.id,
                            message_id: query.message.message_id,
                            parse_mode: 'HTML',
                            reply_markup: replyMarkup
                        });
                        saveHelpMessageState(query.message.chat.id.toString(), query.message.message_id, { view, group: defaultGroup });
                    } catch (error) {
                        // ignore edit errors
                    }
                }

                await bot.answerCallbackQuery(queryId);
                return;
            }

            if (query.data.startsWith('help_group|')) {
                const [, requestedView, requestedGroup] = query.data.split('|');
                const view = requestedView === 'admin' ? 'admin' : 'user';
                const groups = resolveHelpGroups(view);
                const selectedGroup = groups.includes(requestedGroup) ? requestedGroup : (groups[0] || null);
                const replyMarkup = buildHelpKeyboard(callbackLang, view, selectedGroup);

                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.editMessageReplyMarkup(replyMarkup, {
                            chat_id: query.message.chat.id,
                            message_id: query.message.message_id
                        });
                        saveHelpMessageState(query.message.chat.id.toString(), query.message.message_id, { view, group: selectedGroup });
                    } catch (error) {
                        // ignore edit errors
                    }
                }

                await bot.answerCallbackQuery(queryId);
                return;
            }

            if (query.data.startsWith('help_cmd|')) {
                const [, commandKey] = query.data.split('|');
                const executor = helpCommandExecutors[commandKey];
                if (!executor) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'help_action_not_available'), show_alert: true });
                    return;
                }

                try {
                    const result = await executor(query, callbackLang);
                    if (!result || !result.message) {
                        await bot.answerCallbackQuery(queryId);
                    } else {
                        await bot.answerCallbackQuery(queryId, {
                            text: result.message,
                            show_alert: Boolean(result.showAlert)
                        });
                    }
                } catch (error) {
                    console.error(`[Help] Failed to execute ${commandKey} from help: ${error.message}`);
                    await bot.answerCallbackQuery(queryId, {
                        text: t(callbackLang, 'help_action_failed'),
                        show_alert: true
                    });
                }
                return;
            }

            if (query.data === 'admin_hub_refresh') {
                try {
                    await openAdminHub(query.from.id, { fallbackLang: callbackLang });
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'admin_hub_refreshed') });
                } catch (error) {
                    console.error(`[AdminHub] Failed to refresh hub for ${query.from.id}: ${error.message}`);
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_command_error'), show_alert: true });
                }
                return;
            }

            if (query.data === 'admin_hub_from_menu') {
                try {
                    await openAdminHub(query.from.id, { fallbackLang: callbackLang });
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'admin_hub_refreshed') });
                } catch (error) {
                    console.error(`[AdminHub] Failed to open hub from menu for ${query.from.id}: ${error.message}`);
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_command_error'), show_alert: true });
                }
                return;
            }

            if (query.data === 'admin_hub_close') {
                const session = adminHubSessions.get(query.from.id);
                if (session?.messageId) {
                    try {
                        await bot.deleteMessage(query.from.id, session.messageId);
                    } catch (error) {
                        // ignore errors
                    }
                }
                adminHubSessions.delete(query.from.id);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'admin_hub_closed') });
                return;
            }

            if (query.data.startsWith('admin_hub_open|')) {
                const [, targetChatId] = query.data.split('|');
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }

                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }

                try {
                    await sendAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang });
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_opening') });
                } catch (error) {
                    console.error(`[AdminHub] Failed to open menu for ${query.from.id} in ${targetChatId}: ${error.message}`);
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_command_error'), show_alert: true });
                }
                return;
            }

            if (query.data.startsWith('checkin_start|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const result = await initiateCheckinChallenge(targetChatId, query.from, { replyMessage: query.message });
                const responseLang = result.userLang || callbackLang;

                if (result.status === 'locked') {
                    await bot.answerCallbackQuery(queryId, { text: t(responseLang, 'checkin_error_locked'), show_alert: true });
                } else if (result.status === 'checked') {
                    await bot.answerCallbackQuery(queryId, { text: t(responseLang, 'checkin_error_already_checked'), show_alert: true });
                } else if (result.status === 'failed') {
                    if (result.failureReason === 'dm_unreachable' && result.startLink) {
                        await answerCheckinStartPrompt(query, responseLang, result.startLink);
                    } else {
                        await bot.answerCallbackQuery(queryId, { text: t(responseLang, 'checkin_error_dm_failed'), show_alert: true });
                    }
                } else {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_answer_sent_alert') });
                }
                return;
            }

            if (query.data.startsWith('checkin_answer|')) {
                const parts = query.data.split('|');
                const token = parts[1];
                const answerIndex = parts[2];
                await handleCheckinAnswerCallback(query, token, answerIndex);
                return;
            }

            if (query.data.startsWith('checkin_emotion_skip|')) {
                const parts = query.data.split('|');
                const token = parts[1];
                await handleEmotionCallback(query, token, null, { skip: true });
                return;
            }

            if (query.data.startsWith('checkin_emotion|')) {
                const parts = query.data.split('|');
                const token = parts[1];
                const emoji = parts[2] || '';
                await handleEmotionCallback(query, token, emoji);
                return;
            }

            if (query.data.startsWith('checkin_goal_choose|')) {
                const parts = query.data.split('|');
                await handleGoalCallback(query, parts[1], 'choose', parts[2] || '');
                return;
            }

            if (query.data.startsWith('checkin_goal_skip|')) {
                const parts = query.data.split('|');
                await handleGoalCallback(query, parts[1], 'skip');
                return;
            }

            if (query.data.startsWith('checkin_goal_custom|')) {
                const parts = query.data.split('|');
                await handleGoalCallback(query, parts[1], 'custom');
                return;
            }

            if (query.data.startsWith('checkin_leaderboard|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const mode = parts[2] || 'streak';
                const boardLang = await resolveGroupLanguage(targetChatId);
                const boardText = await buildLeaderboardText(targetChatId, mode, 10, boardLang);
                await sendMessageRespectingThread(targetChatId, query.message, boardText);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_leaderboard_sent_alert') });
                return;
            }

            if (query.data === 'checkin_admin_noop') {
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_board_hint') });
                return;
            }

            if (query.data.startsWith('checkin_admin_menu|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                const requestedView = parts[2] || 'home';
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }

                try {
                    await sendAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang, view: requestedView });
                    const viewKey = resolveAdminMenuView(requestedView);
                    const sectionConfig = ADMIN_MENU_SECTION_CONFIG[viewKey];
                    const sectionLabel = viewKey === 'home'
                        ? t(callbackLang, 'checkin_admin_menu_choose_action')
                        : t(callbackLang, sectionConfig?.labelKey || 'checkin_admin_menu_board_hint');
                    await bot.answerCallbackQuery(queryId, {
                        text: t(callbackLang, 'checkin_admin_section_opened', { section: sectionLabel })
                    });
                } catch (error) {
                    console.error(`[AdminMenu] Failed to switch view for ${query.from.id}: ${error.message}`);
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_command_error'), show_alert: true });
                }
                return;
            }

            if (query.data.startsWith('checkin_admin_close|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const userKey = query.from.id.toString();
                checkinAdminStates.delete(userKey);
                pendingSecretMessages.delete(userKey);
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_closed') });
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }
                await closeAdminMenu(query.from.id);
                return;
            }

            if (query.data.startsWith('checkin_admin_back|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }

                const userKey = query.from.id.toString();
                checkinAdminStates.delete(userKey);
                pendingSecretMessages.delete(userKey);

                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }

                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_backing') });
                await sendAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang, view: 'home' });
                return;
            }

            if (query.data.startsWith('checkin_admin_refresh|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }

                await sendAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_refreshed') });
                return;
            }

            if (query.data.startsWith('checkin_admin_cancel_input|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                const userKey = query.from.id.toString();
                const adminState = checkinAdminStates.get(userKey);
                const secretState = pendingSecretMessages.get(userKey);
                if (adminState?.promptMessageId) {
                    try {
                        await bot.deleteMessage(query.from.id, adminState.promptMessageId);
                    } catch (error) {
                        // ignore
                    }
                }
                if (secretState?.promptMessageId) {
                    try {
                        await bot.deleteMessage(query.from.id, secretState.promptMessageId);
                    } catch (error) {
                        // ignore
                    }
                }
                checkinAdminStates.delete(userKey);
                pendingSecretMessages.delete(userKey);

                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }

                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_cancelled') });
                await sendAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_user_prompt|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }

                try {
                    const groupLang = await resolveGroupLanguage(targetChatId);
                    await bot.sendMessage(targetChatId, t(groupLang, 'checkin_admin_user_prompt_text'), {
                        disable_web_page_preview: true
                    });

                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_user_prompt_alert') });
                } catch (error) {
                    console.error(`[Checkin] Failed to broadcast member guide for ${targetChatId}: ${error.message}`);
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_command_error'), show_alert: true });
                }
                return;
            }

            if (query.data.startsWith('checkin_admin_user_leaderboard|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }

                try {
                    const groupLang = await resolveGroupLanguage(targetChatId);
                    await bot.sendMessage(targetChatId, t(groupLang, 'checkin_admin_user_leaderboard_text'), {
                        disable_web_page_preview: true
                    });

                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_user_leaderboard_alert') });
                } catch (error) {
                    console.error(`[Checkin] Failed to broadcast leaderboard guide for ${targetChatId}: ${error.message}`);
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_command_error'), show_alert: true });
                }
                return;
            }

            if (query.data.startsWith('checkin_admin_leaderboard_reset_confirm|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_processing') });
                await confirmLeaderboardReset(query.from.id, targetChatId, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_leaderboard_reset|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_opening') });
                await promptLeaderboardReset(query.from.id, targetChatId, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_leaderboard_remove|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                const targetUserId = parts[2];
                if (!targetChatId || !targetUserId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_processing') });
                await confirmLeaderboardRemoval(query.from.id, targetChatId, targetUserId, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_leaderboard_member|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                const targetUserId = parts[2];
                if (!targetChatId || !targetUserId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_opening') });
                await presentAdminLeaderboardMemberDetail(query.from.id, targetChatId, targetUserId, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_leaderboard_members|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_opening') });
                await presentAdminLeaderboardManageList(query.from.id, targetChatId, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_leaderboard_mode|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                const mode = parts[2] || 'streak';
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_opening') });
                await presentAdminLeaderboardView(query.from.id, targetChatId, { fallbackLang: callbackLang, mode });
                return;
            }

            if (query.data.startsWith('checkin_admin_leaderboard_view|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_leaderboard_opening') });
                await presentAdminLeaderboardView(query.from.id, targetChatId, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_list|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
                    return;
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_list_progress_alert') });
                await sendTodayCheckinList(targetChatId, query.from.id, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_summary_window|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
                    return;
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_window_progress_alert') });
                await sendSummaryWindowCheckinList(targetChatId, query.from.id, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_summary_reset_confirm|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
                    return;
                }
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_reset_success_alert') });
                await executeAdminSummaryReset(targetChatId, query.from.id, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_summary_reset|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission_action'), show_alert: true });
                    return;
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_reset_prompt_alert') });
                await promptAdminSummaryReset(targetChatId, query.from.id, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_broadcast|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_broadcast_progress_alert') });
                await sendCheckinAnnouncement(targetChatId, { triggeredBy: 'manual' });
                return;
            }

            if (query.data.startsWith('checkin_admin_summary_broadcast|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                const sent = await sendSummaryAnnouncement(targetChatId, { sourceMessage: query.message, triggeredBy: 'manual' });
                await bot.answerCallbackQuery(queryId, {
                    text: sent
                        ? t(callbackLang, 'checkin_admin_summary_broadcast_success_alert')
                        : t(callbackLang, 'checkin_admin_summary_broadcast_empty'),
                    show_alert: !sent
                });
                return;
            }

            if (query.data.startsWith('checkin_admin_remove_confirm|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const targetUserId = parts[2];
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_remove_progress_alert') });
                await executeAdminRemoval(targetChatId, query.from.id, targetUserId, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_remove|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_remove_choose_prompt') });
                await promptAdminForRemoval(targetChatId, query.from.id, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_unlock_confirm|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const targetUserId = parts[2];
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_unlock_progress_alert') });
                await executeAdminUnlock(targetChatId, query.from.id, targetUserId, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_unlock|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_unlock_choose_prompt') });
                await promptAdminUnlock(targetChatId, query.from.id, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_dm_all|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                const settings = await getGroupCheckinSettings(targetChatId);
                const today = formatDateForTimezone(settings.timezone || CHECKIN_DEFAULT_TIMEZONE);
                const records = await db.getCheckinsForDate(targetChatId, today);
                const uniqueRecipients = Array.from(new Set((records || []).map((record) => record.userId.toString())));
                const filtered = uniqueRecipients
                    .filter((recipient) => recipient && recipient !== query.from.id.toString())
                    .slice(0, CHECKIN_ADMIN_DM_MAX_RECIPIENTS);
                if (filtered.length === 0) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_dm_empty'), show_alert: true });
                    return;
                }
                const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_dm_all_prompt', { count: filtered.length }), {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                                { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                            ],
                            [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                        ]
                    }
                });
                pendingSecretMessages.set(query.from.id.toString(), {
                    chatId: targetChatId,
                    targetUserId: 'all',
                    recipients: filtered,
                    promptMessageId: promptMessage.message_id,
                    mode: 'all'
                });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_dm_all_progress_alert') });
                return;
            }

            if (query.data.startsWith('checkin_admin_dm_target|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const targetUserId = parts[2];
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }
                const profile = await resolveMemberProfile(targetChatId, targetUserId, callbackLang);
                const userLabel = `<b>${profile.link || escapeHtml(profile.displayName)}</b>`;
                const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_dm_enter_message', { user: userLabel }), {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                                { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                            ],
                            [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                        ]
                    }
                });
                pendingSecretMessages.set(query.from.id.toString(), {
                    chatId: targetChatId,
                    targetUserId,
                    promptMessageId: promptMessage.message_id,
                    mode: 'single'
                });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_dm_enter_prompt_alert') });
                return;
            }

            if (query.data.startsWith('checkin_admin_dm|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_dm_choose_prompt_alert') });
                await promptAdminSecretMessage(targetChatId, query.from.id, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_points_set|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const value = parts[2];
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_points_updated_alert') });
                await setAdminDailyPoints(targetChatId, query.from.id, value, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_points_custom|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }
                const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_points_prompt'), {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                                { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                            ],
                            [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                        ]
                    }
                });
                checkinAdminStates.set(query.from.id.toString(), {
                    type: 'points_custom',
                    chatId: targetChatId,
                    promptMessageId: promptMessage.message_id
                });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_points_prompt_alert') });
                return;
            }

            if (query.data.startsWith('checkin_admin_points|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_points_choose_prompt') });
                await promptAdminPoints(targetChatId, query.from.id, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_summary_set|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const value = parts[2];
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_updated_alert') });
                await setAdminSummaryWindow(targetChatId, query.from.id, value, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_summary_custom|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }
                const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_summary_prompt'), {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                                { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                            ],
                            [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                        ]
                    }
                });
                checkinAdminStates.set(query.from.id.toString(), {
                    type: 'summary_custom',
                    chatId: targetChatId,
                    promptMessageId: promptMessage.message_id
                });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_prompt_alert') });
                return;
            }

            if (query.data.startsWith('checkin_admin_summary|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_choose_prompt') });
                await promptAdminSummaryWindow(targetChatId, query.from.id, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_schedule_preset|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const presetValue = parts[2] || '';
                const presetSlots = presetValue.split(',').map((slot) => slot.trim()).filter(Boolean);
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_schedule_updated_alert') });
                await setAdminScheduleSlots(targetChatId, query.from.id, presetSlots, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_summary_schedule_preset|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const presetValue = parts[2] || '';
                const presetSlots = presetValue.split(',').map((slot) => slot.trim()).filter(Boolean);
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }
                await setAdminSummaryScheduleSlots(targetChatId, query.from.id, presetSlots, { fallbackLang: callbackLang });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_schedule_updated_alert') });
                return;
            }

            if (query.data.startsWith('checkin_admin_schedule_custom|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }
                const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_schedule_prompt'), {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                                { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                            ],
                            [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                        ]
                    }
                });
                checkinAdminStates.set(query.from.id.toString(), {
                    type: 'schedule_custom',
                    chatId: targetChatId,
                    promptMessageId: promptMessage.message_id
                });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_schedule_prompt_alert') });
                return;
            }

            if (query.data.startsWith('checkin_admin_summary_schedule_custom|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }
                const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_summary_schedule_prompt'), {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                                { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                            ],
                            [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                        ]
                    }
                });
                checkinAdminStates.set(query.from.id.toString(), {
                    type: 'summary_schedule_custom',
                    chatId: targetChatId,
                    promptMessageId: promptMessage.message_id
                });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_schedule_prompt_alert') });
                return;
            }

            if (query.data.startsWith('checkin_admin_schedule_clear|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_schedule_cleared_alert') });
                await resetAdminScheduleSlots(targetChatId, query.from.id, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_summary_schedule_disable|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }
                await disableAdminSummarySchedule(targetChatId, query.from.id, { fallbackLang: callbackLang });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_schedule_disabled_alert') });
                return;
            }

            if (query.data.startsWith('checkin_admin_summary_schedule_reset|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }
                await resetAdminSummarySchedule(targetChatId, query.from.id, { fallbackLang: callbackLang });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_schedule_reset_alert') });
                return;
            }

            if (query.data.startsWith('checkin_admin_summary_schedule_sync|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }
                await syncAdminSummaryScheduleWithAuto(targetChatId, query.from.id, { fallbackLang: callbackLang });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_schedule_sync_alert') });
                return;
            }

            if (query.data.startsWith('checkin_admin_schedule|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_schedule_choose_prompt') });
                await promptAdminSchedule(targetChatId, query.from.id, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_summary_schedule|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                await promptAdminSummarySchedule(targetChatId, query.from.id, { fallbackLang: callbackLang });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_summary_schedule_choose_prompt') });
                return;
            }

            if (query.data.startsWith('checkin_admin_weights_set|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }
                const presetWeights = {
                    math: Number(parts[2]),
                    physics: Number(parts[3]),
                    chemistry: Number(parts[4])
                };
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_weights_updated_alert') });
                await setAdminQuestionWeights(targetChatId, query.from.id, presetWeights, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin_weights_custom|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                if (query.message?.chat?.id && query.message?.message_id) {
                    try {
                        await bot.deleteMessage(query.message.chat.id, query.message.message_id);
                    } catch (error) {
                        // ignore
                    }
                }
                const promptMessage = await bot.sendMessage(query.from.id, t(callbackLang, 'checkin_admin_weights_prompt'), {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: t(callbackLang, 'checkin_admin_button_back'), callback_data: `checkin_admin_back|${targetChatId}` },
                                { text: t(callbackLang, 'checkin_admin_button_close'), callback_data: `checkin_admin_close|${targetChatId}` }
                            ],
                            [{ text: t(callbackLang, 'checkin_admin_button_cancel'), callback_data: `checkin_admin_cancel_input|${targetChatId}` }]
                        ]
                    }
                });
                checkinAdminStates.set(query.from.id.toString(), {
                    type: 'weights_custom',
                    chatId: targetChatId,
                    promptMessageId: promptMessage.message_id
                });
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_weights_prompt_alert') });
                return;
            }

            if (query.data.startsWith('checkin_admin_weights|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_error_no_permission'), show_alert: true });
                    return;
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_weights_choose_prompt') });
                await showQuestionWeightMenu(query.from.id, targetChatId, { fallbackLang: callbackLang });
                return;
            }

            if (query.data.startsWith('checkin_admin|')) {
                const parts = query.data.split('|');
                const targetChatId = (parts[1] || chatId || '').toString();
                if (!targetChatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const isAdminUser = await isGroupAdmin(targetChatId, query.from.id);
                if (!isAdminUser) {
                    await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_no_permission'), show_alert: true });
                    return;
                }
                await bot.answerCallbackQuery(queryId, { text: t(callbackLang, 'checkin_admin_menu_opening') });
                try {
                    await sendAdminMenu(query.from.id, targetChatId, { fallbackLang: callbackLang });
                } catch (error) {
                    console.error(`[Checkin] Không thể gửi menu quản lý: ${error.message}`);
                }
                return;
            }

            if (query.data.startsWith('lang_')) {
                const newLang = resolveLangCode(query.data.split('_')[1]);
                if (!chatId) {
                    await bot.answerCallbackQuery(queryId);
                    return;
                }
                const chatType = query.message.chat?.type;
                const isGroupChat = chatType === 'group' || chatType === 'supergroup';

                if (isGroupChat) {
                    let memberInfo = null;
                    try {
                        memberInfo = await bot.getChatMember(chatId, query.from.id);
                    } catch (error) {
                        console.warn(`[GroupLanguage] Không thể kiểm tra quyền admin cho ${chatId}: ${error.message}`);
                    }

                    const isAdmin = memberInfo && ['administrator', 'creator'].includes(memberInfo.status);
                    if (!isAdmin) {
                        const feedbackLang = resolveLangCode(query.from.language_code || newLang);
                        bot.answerCallbackQuery(queryId, { text: t(feedbackLang, 'group_language_admin_only'), show_alert: true });
                        return;
                    }
                }

                await db.setLanguage(chatId, newLang);

                if (isGroupChat) {
                    try {
                        const subscription = await db.getGroupSubscription(chatId);
                        if (subscription) {
                            await db.updateGroupSubscriptionLanguage(chatId, newLang);
                        }
                    } catch (error) {
                        console.warn(`[GroupLanguage] Không thể cập nhật ngôn ngữ broadcast cho nhóm ${chatId}: ${error.message}`);
                    }
                }

                const messageKey = isGroupChat ? 'group_language_changed_success' : 'language_changed_success';
                const message = t(newLang, messageKey); // Dùng newLang
                sendReply(query.message, message);
                console.log(`[BOT] ChatID ${chatId} đã đổi ngôn ngữ sang: ${newLang}`);
                bot.answerCallbackQuery(queryId, { text: message });
            }

        } catch (error) {
            console.error("Lỗi khi xử lý callback_query:", error);
            bot.answerCallbackQuery(queryId, { text: "Error!" });
        }
    });

    bot.on('message', async (msg) => {
        if (await handleGoalTextInput(msg)) {
            return;
        }

        const userId = msg.from?.id?.toString();
        if (!userId) {
            return;
        }

        const chatType = msg.chat?.type || '';

        if (chatType === 'private') {
            const lang = await resolveNotificationLanguage(userId, msg.from?.language_code);
            const registerState = registerWizardStates.get(userId);
            if (registerState && msg.chat?.id?.toString() === userId && msg.reply_to_message?.message_id === registerState.promptMessageId) {
                const rawText = (msg.text || '').trim();
                if (!rawText) {
                    await sendEphemeralMessage(userId, t(lang, 'register_help_invalid'));
                    return;
                }

                try {
                    const parsed = parseRegisterPayload(rawText);
                    if (!parsed) {
                        await sendEphemeralMessage(userId, t(lang, 'register_help_invalid'));
                        return;
                    }

                    const result = await db.addWalletToUser(userId, lang, parsed.wallet);

                    if (registerState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, registerState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }

                    scheduleMessageDeletion(msg.chat.id, msg.message_id, 15000);
                    const successKey = result?.added ? 'register_help_success_wallet' : 'register_wallet_exists';
                    await sendEphemeralMessage(userId, t(lang, successKey, {
                        wallet: shortenAddress(parsed.wallet)
                    }), {}, 20000);
                    registerWizardStates.delete(userId);
                } catch (error) {
                    console.error(`[RegisterWizard] Failed to save wallet for ${userId}: ${error.message}`);
                    await sendEphemeralMessage(userId, t(lang, 'register_help_error'));
                }
                return;
            }

            const secretState = pendingSecretMessages.get(userId);
            if (secretState) {
                const rawText = (msg.text || '').trim();
                if (!rawText) {
                    await sendEphemeralMessage(userId, t(lang, 'checkin_dm_secret_invalid'));
                    return;
                }

                const clipped = rawText.length > 500 ? rawText.slice(0, 500) : rawText;

                try {
                    if (secretState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, secretState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }
                    const mode = secretState.mode || 'single';
                    if (mode === 'all') {
                        const uniqueRecipients = Array.from(new Set(Array.isArray(secretState.recipients) ? secretState.recipients : []));
                        let successCount = 0;
                        let failureCount = 0;
                        for (const recipientId of uniqueRecipients) {
                            if (!recipientId || recipientId === userId) {
                                continue;
                            }
                            try {
                                const targetLang = await resolveNotificationLanguage(recipientId);
                                await bot.sendMessage(recipientId, t(targetLang, 'checkin_dm_secret_forward', { message: clipped }));
                                successCount += 1;
                            } catch (error) {
                                failureCount += 1;
                            }
                        }
                        await sendEphemeralMessage(userId, t(lang, 'checkin_admin_dm_all_result', {
                            success: successCount,
                            failed: failureCount
                        }));
                    } else {
                        const targetLang = await resolveNotificationLanguage(secretState.targetUserId);
                        await bot.sendMessage(secretState.targetUserId, t(targetLang, 'checkin_dm_secret_forward', { message: clipped }));
                        await sendEphemeralMessage(userId, t(lang, 'checkin_dm_secret_confirm'));
                    }
                } catch (error) {
                    console.error(`[Checkin] Không thể chuyển tiếp tin nhắn bí mật: ${error.message}`);
                    await sendEphemeralMessage(userId, t(lang, 'checkin_dm_secret_error'));
                } finally {
                    pendingSecretMessages.delete(userId);
                }

                if (secretState.chatId) {
                    await sendAdminMenu(msg.from.id, secretState.chatId, { fallbackLang: lang });
                }
                return;
            }

            const adminState = checkinAdminStates.get(userId);
            if (adminState) {
                const rawText = (msg.text || '').trim();
                if (!rawText) {
                    await sendEphemeralMessage(userId, t(lang, 'checkin_error_input_invalid'));
                    return;
                }

                if (adminState.type === 'points_custom') {
                    const normalized = Number(rawText.replace(',', '.'));
                    if (!Number.isFinite(normalized) || normalized < 0) {
                        await sendEphemeralMessage(userId, t(lang, 'checkin_admin_points_invalid'));
                        return;
                    }
                    if (adminState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, adminState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }
                    await setAdminDailyPoints(adminState.chatId, msg.from.id, normalized, { fallbackLang: lang });
                    checkinAdminStates.delete(userId);
                    return;
                }

                if (adminState.type === 'summary_custom') {
                    const normalized = Number(rawText.replace(',', '.'));
                    if (!Number.isFinite(normalized) || normalized <= 0) {
                        await sendEphemeralMessage(userId, t(lang, 'checkin_admin_summary_invalid'));
                        return;
                    }
                    if (adminState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, adminState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }
                    await setAdminSummaryWindow(adminState.chatId, msg.from.id, normalized, { fallbackLang: lang });
                    checkinAdminStates.delete(userId);
                    return;
                }

                if (adminState.type === 'weights_custom') {
                    const parsed = parseQuestionWeightsInput(rawText);
                    if (!parsed) {
                        await sendEphemeralMessage(userId, t(lang, 'checkin_admin_weights_invalid'));
                        return;
                    }
                    if (adminState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, adminState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }
                    await setAdminQuestionWeights(adminState.chatId, msg.from.id, parsed, { fallbackLang: lang });
                    checkinAdminStates.delete(userId);
                    return;
                }

                if (adminState.type === 'schedule_custom') {
                    const parsed = parseScheduleTextInput(rawText);
                    if (!parsed) {
                        await sendEphemeralMessage(userId, t(lang, 'checkin_admin_schedule_invalid'));
                        return;
                    }
                    if (adminState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, adminState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }
                    await setAdminScheduleSlots(adminState.chatId, msg.from.id, parsed, { fallbackLang: lang });
                    checkinAdminStates.delete(userId);
                    return;
                }

                if (adminState.type === 'summary_schedule_custom') {
                    const parsed = parseScheduleTextInput(rawText);
                    if (!parsed) {
                        await sendEphemeralMessage(userId, t(lang, 'checkin_admin_summary_schedule_invalid'));
                        return;
                    }
                    if (adminState.promptMessageId) {
                        try {
                            await bot.deleteMessage(msg.chat.id, adminState.promptMessageId);
                        } catch (error) {
                            // ignore
                        }
                    }
                    await setAdminSummaryScheduleSlots(adminState.chatId, msg.from.id, parsed, { fallbackLang: lang });
                    checkinAdminStates.delete(userId);
                    return;
                }
            }
        }
    });

    bot.on('polling_error', (error) => {
        console.error(`[LỖI BOT POLLING]: ${error.message}`);
    });

    console.log('✅ [Telegram Bot] Đang chạy...');
}


// ==========================================================
// 🚀 KHỞI ĐỘNG TẤT CẢ DỊCH VỤ (CÁCH MỚI, AN TOÀN)
// ==========================================================
async function main() {
    try {
        console.log("Đang khởi động...");
        
        // Bước 1: Khởi tạo DB
        await db.init(); 

        // Bước 2: Bật API
        startApiServer();

        // Bước 3: Bật Bot (bộ 'miệng')
        startTelegramBot();
        startCheckinScheduler();

        console.log("🚀 TẤT CẢ DỊCH VỤ ĐÃ SẴN SÀNG!");

    } catch (error) {
        console.error("LỖI KHỞI ĐỘNG NGHIÊM TRỌNG:", error);
        process.exit(1);
    }
}

main(); // Chạy hàm khởi động chính