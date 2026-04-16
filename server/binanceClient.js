/**
 * Binance WebSocket Client
 * Connects to Binance combined stream for multi-symbol, multi-timeframe kline data
 * Includes auto-reconnect with exponential backoff
 */

const WebSocket = require('ws');
const config = require('../config.json');
const dataCache = require('./dataCache');

const BINANCE_WS = 'wss://stream.binance.com:9443/stream';

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 50;
const BASE_RECONNECT_DELAY = 1000;
let isConnected = false;
let onDataCallback = null;
let reconnectTimer = null;
let pingInterval = null;

/**
 * Build the combined stream subscription message
 * Format: symbol@kline_interval
 */
function buildStreamList() {
  const streams = [];
  config.coins.forEach((coin) => {
    const symbol = coin.toLowerCase();
    config.timeframes.forEach((tf) => {
      streams.push(`${symbol}@kline_${tf}`);
    });
    // Also subscribe to mini ticker for 24h stats
    streams.push(`${symbol}@miniTicker`);
  });
  return streams;
}

/**
 * Connect to Binance WebSocket
 * @param {Function} callback - Called on each data update with (symbol, timeframe, data)
 */
function connect(callback) {
  onDataCallback = callback;

  const streams = buildStreamList();
  const url = `${BINANCE_WS}?streams=${streams.join('/')}`;

  console.log(`[Binance] Connecting to ${streams.length} streams...`);

  ws = new WebSocket(url);

  ws.on('open', () => {
    isConnected = true;
    reconnectAttempts = 0;
    console.log('[Binance] ✅ Connected successfully');

    // Fetch historical klines to fill cache
    fetchHistoricalKlines();

    // Keep alive ping every 3 minutes
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 180000);
  });

  ws.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData.toString());
      if (!msg.data) return;

      const data = msg.data;

      // Handle kline data
      if (data.e === 'kline') {
        const symbol = data.s; // e.g. BTCUSDT
        const kline = data.k;
        const timeframe = kline.i; // e.g. 1m

        // Update cache
        dataCache.updateCandle(symbol, timeframe, kline);

        // Notify signal engine
        if (onDataCallback) {
          onDataCallback(symbol, timeframe, {
            type: 'kline',
            isClosed: kline.x,
            price: parseFloat(kline.c),
          });
        }
      }

      // Handle mini ticker (24h stats)
      if (data.e === '24hrMiniTicker') {
        const symbol = data.s;
        if (onDataCallback) {
          onDataCallback(symbol, null, {
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
      console.error('[Binance] Parse error:', err.message);
    }
  });

  ws.on('error', (err) => {
    console.error('[Binance] WebSocket error:', err.message);
  });

  ws.on('close', (code, reason) => {
    isConnected = false;
    console.log(`[Binance] ❌ Disconnected (code: ${code})`);
    if (pingInterval) clearInterval(pingInterval);
    scheduleReconnect();
  });

  ws.on('pong', () => {
    // Connection alive
  });
}

/**
 * Reconnect with exponential backoff
 */
function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[Binance] Max reconnect attempts reached. Giving up.');
    return;
  }

  const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), 30000);
  reconnectAttempts++;

  console.log(`[Binance] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connect(onDataCallback);
  }, delay);
}

/**
 * Fetch historical klines via REST API to pre-fill cache
 */
async function fetchHistoricalKlines() {
  const fetch = require('node-fetch');

  for (const coin of config.coins) {
    for (const tf of config.timeframes) {
      try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${coin}&interval=${tf}&limit=${config.cache.maxCandles}`;
        const response = await fetch(url);
        const klines = await response.json();

        if (Array.isArray(klines)) {
          klines.forEach((k) => {
            const kline = {
              t: k[0],        // Open time
              o: k[1],        // Open
              h: k[2],        // High
              l: k[3],        // Low
              c: k[4],        // Close
              v: k[5],        // Volume
              T: k[6],        // Close time
              x: true,        // Mark as closed
            };
            dataCache.updateCandle(coin, tf, kline);
          });
          console.log(`[Binance] Loaded ${klines.length} historical ${tf} candles for ${coin}`);
        }
      } catch (err) {
        console.error(`[Binance] Failed to fetch historical ${tf} for ${coin}:`, err.message);
      }

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  console.log('[Binance] ✅ Historical data loaded');
}

/**
 * Disconnect cleanly
 */
function disconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (pingInterval) clearInterval(pingInterval);
  if (ws) {
    ws.removeAllListeners();
    ws.close();
    ws = null;
  }
  isConnected = false;
  console.log('[Binance] Disconnected');
}

/**
 * Check if connected
 */
function getStatus() {
  return {
    connected: isConnected,
    reconnectAttempts,
    cacheStats: dataCache.getCacheStats(),
  };
}

module.exports = {
  connect,
  disconnect,
  getStatus,
};
