const WebSocket = require('ws');
const config = require('../config.json');
const dataCache = require('./dataCache');

// Multiple endpoints to bypass potential IP blocking/limits
const WS_ENDPOINTS = [
  'wss://stream.binance.com:9443/stream',
  'wss://stream.binance.com:443/stream',
  'wss://stream.binance.com/stream',
  'wss://stream.binance.us:9443/stream' // Fallback for US-based clouds
];

const API_ENDPOINTS = [
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
  'https://api.binance.us' // Ensure US-based servers can fetch data
];

let ws = null;
let currentWsIndex = 0;
let currentApiIndex = 0;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 50;
const BASE_RECONNECT_DELAY = 1000;
let isConnected = false;
let onDataCallback = null;
let reconnectTimer = null;
let pingInterval = null;
let lastError = null;
let connectionStartTime = 0;

/**
 * Build combined stream list
 */
function buildStreamList() {
  const streams = [];
  config.coins.forEach((coin) => {
    const symbol = coin.toLowerCase();
    config.timeframes.forEach((tf) => {
      streams.push(`${symbol}@kline_${tf}`);
    });
    streams.push(`${symbol}@miniTicker`);
  });
  return streams;
}

/**
 * Connect to Binance WebSocket with fallback
 */
function connect(callback) {
  if (callback) onDataCallback = callback;

  const endpoint = WS_ENDPOINTS[currentWsIndex];
  const streams = buildStreamList();
  const url = `${endpoint}?streams=${streams.join('/')}`;

  console.log(`[Binance] Connecting to ${endpoint} (${streams.length} streams)...`);
  lastError = null;

  try {
    ws = new WebSocket(url);

    ws.on('open', () => {
      isConnected = true;
      reconnectAttempts = 0;
      connectionStartTime = Date.now();
      console.log(`[Binance] ✅ Connected to ${endpoint}`);

      // Fetch historical klines
      fetchHistoricalKlines();

      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.ping();
      }, 180000);
    });

    ws.on('message', (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString());
        if (!msg.data) return;
        const data = msg.data;

        if (data.e === 'kline') {
          dataCache.updateCandle(data.s, data.k.i, data.k);
          if (onDataCallback) {
            onDataCallback(data.s, data.k.i, {
              type: 'kline',
              isClosed: data.k.x,
              price: parseFloat(data.k.c),
            });
          }
        }

        if (data.e === '24hrMiniTicker') {
          if (onDataCallback) {
            onDataCallback(data.s, null, {
              type: 'ticker',
              price: parseFloat(data.c),
              open24h: parseFloat(data.o),
              high24h: parseFloat(data.h),
              low24h: parseFloat(data.l),
              volume24h: parseFloat(data.v),
              quoteVolume24h: parseFloat(data.q),
            });
          }
        }
      } catch (err) {
        // Silent catch for parse errors
      }
    });

    ws.on('error', (err) => {
      lastError = `WS Error: ${err.message}`;
      console.error(`[Binance] WebSocket error on ${endpoint}:`, err.message);
    });

    ws.on('close', (code, reason) => {
      isConnected = false;
      console.log(`[Binance] ❌ Disconnected from ${endpoint} (code: ${code})`);
      scheduleReconnect();
    });

  } catch (err) {
    lastError = `Setup Error: ${err.message}`;
    console.error('[Binance] Failed to initialize WebSocket:', err.message);
    scheduleReconnect();
  }
}

/**
 * Reconnect logic with endpoint cycling
 */
function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (pingInterval) clearInterval(pingInterval);

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[Binance] Max reconnect attempts reached.');
    return;
  }

  // Cycle endpoints on every second failure
  if (reconnectAttempts % 2 === 1) {
    currentWsIndex = (currentWsIndex + 1) % WS_ENDPOINTS.length;
    console.log(`[Binance] Switching to endpoint: ${WS_ENDPOINTS[currentWsIndex]}`);
  }

  const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(1.5, reconnectAttempts), 15000);
  reconnectAttempts++;

  reconnectTimer = setTimeout(() => connect(), delay);
}

/**
 * Fetch historical data using REST API fallbacks
 */
async function fetchHistoricalKlines() {
  const fetch = require('node-fetch');

  for (const coin of config.coins) {
    for (const tf of config.timeframes) {
      let success = false;
      let attempt = 0;

      while (!success && attempt < API_ENDPOINTS.length) {
        const baseUrl = API_ENDPOINTS[(currentApiIndex + attempt) % API_ENDPOINTS.length];
        try {
          const url = `${baseUrl}/api/v3/klines?symbol=${coin}&interval=${tf}&limit=${config.cache.maxCandles}`;
          const response = await fetch(url, { timeout: 5000 });
          
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          
          const klines = await response.json();
          if (Array.isArray(klines)) {
            klines.forEach((k) => {
              dataCache.updateCandle(coin, tf, {
                t: k[0], o: k[1], h: k[2], l: k[3], c: k[4], v: k[5], T: k[6], x: true
              });
            });
            success = true;
          }
        } catch (err) {
          console.warn(`[Binance] REST failed for ${coin} ${tf} on ${baseUrl}: ${err.message}`);
          attempt++;
          lastError = `REST Error: ${err.message} on ${baseUrl}`;
        }
      }

      if (success) {
        // Update current valid API index
        currentApiIndex = (currentApiIndex + attempt) % API_ENDPOINTS.length;
      }

      await new Promise(r => setTimeout(r, 200));
    }
  }
  console.log('[Binance] ✅ Historical data loading cycle complete');
}

function disconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (pingInterval) clearInterval(pingInterval);
  if (ws) {
    ws.removeAllListeners();
    ws.close();
    ws = null;
  }
  isConnected = false;
}

function getStatus() {
  return {
    connected: isConnected,
    endpoint: WS_ENDPOINTS[currentWsIndex],
    apiEndpoint: API_ENDPOINTS[currentApiIndex],
    reconnectAttempts,
    lastError,
    uptimeSeconds: isConnected ? Math.floor((Date.now() - connectionStartTime) / 1000) : 0,
    cacheStats: dataCache.getCacheStats(),
  };
}

module.exports = { connect, disconnect, getStatus };
