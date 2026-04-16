/**
 * Data Cache Module
 * Maintains rolling window of OHLCV candles for each coin/timeframe
 * Max 250 candles per pair to support all indicator calculations
 */

const config = require('../config.json');
const MAX_CANDLES = config.cache.maxCandles;

// Structure: cache[symbol][timeframe] = { candles: [], currentCandle: {} }
const cache = {};

// Price change tracking: priceHistory[symbol][timeframe] = [timestamps, prices]
const priceHistory = {};

/**
 * Initialize cache for a symbol
 */
function initSymbol(symbol) {
  if (!cache[symbol]) {
    cache[symbol] = {};
    priceHistory[symbol] = {};
    config.timeframes.forEach((tf) => {
      cache[symbol][tf] = {
        candles: [],
        currentPrice: 0,
        volume24h: 0,
        lastUpdate: 0,
      };
      priceHistory[symbol][tf] = [];
    });
  }
}

/**
 * Update cache with new kline data from Binance WebSocket
 * @param {string} symbol
 * @param {string} timeframe
 * @param {Object} kline - Binance kline object
 */
function updateCandle(symbol, timeframe, kline) {
  initSymbol(symbol);

  const tf = cache[symbol][timeframe];
  const candle = {
    time: kline.t,
    open: parseFloat(kline.o),
    high: parseFloat(kline.h),
    low: parseFloat(kline.l),
    close: parseFloat(kline.c),
    volume: parseFloat(kline.v),
    isClosed: kline.x,
  };

  tf.currentPrice = candle.close;
  tf.lastUpdate = Date.now();

  if (candle.isClosed) {
    // Candle is closed - add to history
    tf.candles.push(candle);
    if (tf.candles.length > MAX_CANDLES) {
      tf.candles.shift(); // Remove oldest
    }
    // Track price for % change calc
    priceHistory[symbol][timeframe].push({ time: candle.time, price: candle.close });
    if (priceHistory[symbol][timeframe].length > MAX_CANDLES) {
      priceHistory[symbol][timeframe].shift();
    }
  } else {
    // Live candle - update the last one or add as pending
    if (tf.candles.length > 0 && tf.candles[tf.candles.length - 1].time === candle.time) {
      tf.candles[tf.candles.length - 1] = candle;
    } else if (tf.candles.length === 0 || tf.candles[tf.candles.length - 1].time !== candle.time) {
      // New live candle
      tf.candles.push(candle);
      if (tf.candles.length > MAX_CANDLES) {
        tf.candles.shift();
      }
    }
  }
}

/**
 * Get closes array for a symbol/timeframe
 */
function getCloses(symbol, timeframe) {
  initSymbol(symbol);
  return cache[symbol][timeframe].candles.map((c) => c.close);
}

/**
 * Get highs array
 */
function getHighs(symbol, timeframe) {
  initSymbol(symbol);
  return cache[symbol][timeframe].candles.map((c) => c.high);
}

/**
 * Get lows array
 */
function getLows(symbol, timeframe) {
  initSymbol(symbol);
  return cache[symbol][timeframe].candles.map((c) => c.low);
}

/**
 * Get volumes array
 */
function getVolumes(symbol, timeframe) {
  initSymbol(symbol);
  return cache[symbol][timeframe].candles.map((c) => c.volume);
}

/**
 * Get last N candles as OHLCV objects
 */
function getCandles(symbol, timeframe, n = 10) {
  initSymbol(symbol);
  const candles = cache[symbol][timeframe].candles;
  return candles.slice(-n);
}

/**
 * Get current price for a symbol
 */
function getCurrentPrice(symbol) {
  initSymbol(symbol);
  // Use 1m as the most real-time price
  return cache[symbol]['1m']?.currentPrice || 0;
}

/**
 * Get candle count for a symbol/timeframe
 */
function getCandleCount(symbol, timeframe) {
  initSymbol(symbol);
  return cache[symbol][timeframe].candles.length;
}

/**
 * Get price N candles ago for % change calculation
 * @param {string} symbol
 * @param {string} timeframe - '1m', '5m', '15m'
 * @param {number} barsAgo - number of bars back
 */
function getPriceNBarsAgo(symbol, timeframe, barsAgo) {
  initSymbol(symbol);
  const candles = cache[symbol][timeframe].candles;
  if (candles.length <= barsAgo) return null;
  return candles[candles.length - 1 - barsAgo].close;
}

/**
 * Get all symbols with enough data for analysis
 */
function getReadySymbols() {
  return config.coins.filter((symbol) => {
    initSymbol(symbol);
    return cache[symbol]['15m']?.candles.length >= 80; // Lowered for faster activation
  });
}

/**
 * Get snapshot of all current prices
 */
function getAllPrices() {
  const result = {};
  config.coins.forEach((symbol) => {
    result[symbol] = getCurrentPrice(symbol);
  });
  return result;
}

/**
 * Get full cache stats for debugging
 */
function getCacheStats() {
  const stats = {};
  config.coins.forEach((symbol) => {
    if (cache[symbol]) {
      stats[symbol] = {};
      config.timeframes.forEach((tf) => {
        stats[symbol][tf] = cache[symbol][tf]?.candles.length || 0;
      });
    }
  });
  return stats;
}

module.exports = {
  updateCandle,
  getCloses,
  getHighs,
  getLows,
  getVolumes,
  getCandles,
  getCurrentPrice,
  getCandleCount,
  getPriceNBarsAgo,
  getReadySymbols,
  getAllPrices,
  getCacheStats,
  initSymbol,
};
