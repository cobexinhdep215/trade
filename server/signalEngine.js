/**
 * Multi-Timeframe Signal Engine
 * Calculates LONG/SHORT signals with confidence scoring
 * Integrates: Trend (15m), Setup (5m), Entry (1m)
 */

const config = require('../config.json');
const dataCache = require('./dataCache');
const {
  getEMA,
  calcRSI,
  calcMACD,
  calcBollingerBands,
  calcATR,
  calcVolumeMA,
  detectCandlePattern,
  calcPriceChange,
} = require('./indicators');

const weights = config.signal.scoreWeights;

// Cooldown tracking: lastAlert[symbol] = timestamp
const lastAlert = {};

// Store latest signals for all coins
const latestSignals = {};

// Store ticker data
const tickerData = {};

/**
 * Update ticker data from mini ticker stream
 */
function updateTicker(symbol, data) {
  tickerData[symbol] = data;
}

/**
 * Analyze a single symbol and generate signal
 * @param {string} symbol - e.g. 'BTCUSDT'
 * @returns {Object} signal data
 */
function analyzeSymbol(symbol) {
  const closes1m = dataCache.getCloses(symbol, '1m');
  const closes5m = dataCache.getCloses(symbol, '5m');
  const closes15m = dataCache.getCloses(symbol, '15m');
  const highs15m = dataCache.getHighs(symbol, '15m');
  const lows15m = dataCache.getLows(symbol, '15m');
  const volumes5m = dataCache.getVolumes(symbol, '5m');

  const currentPrice = dataCache.getCurrentPrice(symbol);

  // Minimum data check
  const minData = {
    '1m': closes1m.length >= 30,
    '5m': closes5m.length >= 30,
    '15m': closes15m.length >= 210,
  };

  const hasEnoughData = minData['1m'] && minData['5m'] && minData['15m'];

  if (!hasEnoughData) {
    const signal = {
      symbol,
      price: currentPrice,
      direction: 'NONE',
      confidence: 0,
      score: 0,
      scores: {},
      trend: 'NEUTRAL',
      priceChanges: calcPriceChanges(symbol, currentPrice),
      ticker: tickerData[symbol] || null,
      entry: null,
      sl: null,
      tp: null,
      timestamp: Date.now(),
      loading: true,
      candleCount: {
        '1m': closes1m.length,
        '5m': closes5m.length,
        '15m': closes15m.length,
      },
    };
    latestSignals[symbol] = signal;
    return signal;
  }

  // ===== SCORE CALCULATION =====

  let longScore = 0;
  let shortScore = 0;
  const scores = {};

  // ----- 1. TREND (15m) - 30 points -----
  const ema50 = getEMA(closes15m, config.indicators.ema.fast);
  const ema200 = getEMA(closes15m, config.indicators.ema.slow);
  const rsi15m = calcRSI(closes15m, config.indicators.rsi.period);

  let trendDirection = 'NEUTRAL';
  let trendScore = 0;

  if (ema50 !== null && ema200 !== null) {
    if (ema50 > ema200) {
      trendDirection = 'UP';
      trendScore = weights.trend;
      if (rsi15m !== null && rsi15m > 50) {
        longScore += trendScore;
      } else {
        longScore += trendScore * 0.6;
      }
    } else if (ema50 < ema200) {
      trendDirection = 'DOWN';
      trendScore = weights.trend;
      if (rsi15m !== null && rsi15m < 50) {
        shortScore += trendScore;
      } else {
        shortScore += trendScore * 0.6;
      }
    }
  }
  scores.trend = { direction: trendDirection, ema50, ema200, rsi15m, longPts: Math.round(longScore), shortPts: Math.round(shortScore) };

  // ----- 2. MACD (5m) - 20 points -----
  const macd = calcMACD(
    closes5m,
    config.indicators.macd.fast,
    config.indicators.macd.slow,
    config.indicators.macd.signal
  );

  let macdLong = 0;
  let macdShort = 0;

  if (macd.crossover === 'bullish') {
    macdLong = weights.macd;
  } else if (macd.crossover === 'bearish') {
    macdShort = weights.macd;
  } else if (macd.histogram !== null) {
    // Partial score based on histogram direction
    if (macd.histogram > 0) {
      macdLong = weights.macd * 0.4;
    } else {
      macdShort = weights.macd * 0.4;
    }
  }

  longScore += macdLong;
  shortScore += macdShort;
  scores.macd = { ...macd, longPts: Math.round(macdLong), shortPts: Math.round(macdShort) };

  // ----- 3. VOLUME (5m) - 15 points -----
  const volumeMA = calcVolumeMA(volumes5m, config.indicators.volume.maPeriod);
  const currentVolume = volumes5m.length > 0 ? volumes5m[volumes5m.length - 1] : 0;

  let volumeLong = 0;
  let volumeShort = 0;

  if (volumeMA !== null && currentVolume > volumeMA * config.indicators.volume.spikeMultiplier) {
    // Volume spike - supports whatever direction price is moving
    if (trendDirection === 'UP') {
      volumeLong = weights.volume;
    } else if (trendDirection === 'DOWN') {
      volumeShort = weights.volume;
    } else {
      // Split
      volumeLong = weights.volume * 0.5;
      volumeShort = weights.volume * 0.5;
    }
  } else if (volumeMA !== null && currentVolume > volumeMA) {
    // Above average volume
    if (trendDirection === 'UP') volumeLong = weights.volume * 0.3;
    else if (trendDirection === 'DOWN') volumeShort = weights.volume * 0.3;
  }

  longScore += volumeLong;
  shortScore += volumeShort;
  scores.volume = { current: currentVolume, ma: volumeMA, spike: volumeMA ? currentVolume / volumeMA : 0, longPts: Math.round(volumeLong), shortPts: Math.round(volumeShort) };

  // ----- 4. RSI (1m) - 15 points -----
  const rsi1m = calcRSI(closes1m, config.indicators.rsi.period);

  let rsiLong = 0;
  let rsiShort = 0;

  if (rsi1m !== null) {
    if (rsi1m <= config.indicators.rsi.oversold) {
      rsiLong = weights.rsi;
    } else if (rsi1m >= config.indicators.rsi.overbought) {
      rsiShort = weights.rsi;
    } else if (rsi1m < 40) {
      rsiLong = weights.rsi * 0.4;
    } else if (rsi1m > 60) {
      rsiShort = weights.rsi * 0.4;
    }
  }

  longScore += rsiLong;
  shortScore += rsiShort;
  scores.rsi = { value1m: rsi1m, value15m: rsi15m, longPts: Math.round(rsiLong), shortPts: Math.round(rsiShort) };

  // ----- 5. CANDLESTICK (1m) - 20 points -----
  const candles1m = dataCache.getCandles(symbol, '1m', 5);
  const candlePattern = detectCandlePattern(candles1m);

  // Bollinger Bands on 1m
  const bb = calcBollingerBands(
    closes1m,
    config.indicators.bb.period,
    config.indicators.bb.stddev
  );

  let candleLong = 0;
  let candleShort = 0;

  if (candlePattern.direction === 'bullish') {
    candleLong = weights.candlestick * 0.7;
  } else if (candlePattern.direction === 'bearish') {
    candleShort = weights.candlestick * 0.7;
  }

  // BB contribution
  if (bb) {
    if (bb.percentB < 0.05) {
      candleLong += weights.candlestick * 0.3; // Price at lower band
    } else if (bb.percentB > 0.95) {
      candleShort += weights.candlestick * 0.3; // Price at upper band
    }
  }

  longScore += candleLong;
  shortScore += candleShort;
  scores.candlestick = { pattern: candlePattern, bb, longPts: Math.round(candleLong), shortPts: Math.round(candleShort) };

  // ===== BTC MARKET BIAS =====
  if (symbol !== 'BTCUSDT') {
    const btcSignal = latestSignals['BTCUSDT'];
    if (btcSignal && btcSignal.trend === 'DOWN') {
      longScore *= 0.5; // Reduce long signals when BTC is bearish
    } else if (btcSignal && btcSignal.trend === 'UP') {
      shortScore *= 0.5; // Reduce short signals when BTC is bullish
    }
  }

  // ===== DETERMINE SIGNAL =====
  let direction = 'NONE';
  let score = 0;

  if (longScore > shortScore && longScore >= 20) {
    direction = 'LONG';
    score = Math.round(longScore);
  } else if (shortScore > longScore && shortScore >= 20) {
    direction = 'SHORT';
    score = Math.round(shortScore);
  }

  const confidence = Math.min(Math.round(score), 100);

  // ===== AUTO SL/TP =====
  const atr = calcATR(highs15m, lows15m, closes15m, config.indicators.atr.period);
  let entry = null;
  let sl = null;
  let tp = null;

  if (direction !== 'NONE' && atr !== null) {
    entry = currentPrice;
    if (direction === 'LONG') {
      sl = parseFloat((entry - atr * config.indicators.atr.slMultiplier).toFixed(getPrecision(currentPrice)));
      tp = parseFloat((entry + atr * config.indicators.atr.tpMultiplier).toFixed(getPrecision(currentPrice)));
    } else {
      sl = parseFloat((entry + atr * config.indicators.atr.slMultiplier).toFixed(getPrecision(currentPrice)));
      tp = parseFloat((entry - atr * config.indicators.atr.tpMultiplier).toFixed(getPrecision(currentPrice)));
    }
  }

  // ===== PRICE CHANGES =====
  const priceChanges = calcPriceChanges(symbol, currentPrice);

  // ===== BUILD SIGNAL =====
  const signal = {
    symbol,
    price: currentPrice,
    direction,
    confidence,
    score,
    scores,
    trend: trendDirection,
    priceChanges,
    ticker: tickerData[symbol] || null,
    entry: entry ? parseFloat(entry.toFixed(getPrecision(currentPrice))) : null,
    sl,
    tp,
    atr: atr ? parseFloat(atr.toFixed(getPrecision(currentPrice))) : null,
    timestamp: Date.now(),
    loading: false,
    candleCount: {
      '1m': closes1m.length,
      '5m': closes5m.length,
      '15m': closes15m.length,
    },
  };

  // Check if this is a new strong signal (for alerts)
  signal.isAlert = false;
  if (score >= config.signal.minScore && direction !== 'NONE') {
    const now = Date.now();
    const lastTime = lastAlert[symbol] || 0;
    if (now - lastTime >= config.signal.cooldownMs) {
      signal.isAlert = true;
      lastAlert[symbol] = now;
    }
  }

  latestSignals[symbol] = signal;
  return signal;
}

/**
 * Calculate price changes for all timeframes
 */
function calcPriceChanges(symbol, currentPrice) {
  return {
    '1m': round2(calcPriceChange(currentPrice, dataCache.getPriceNBarsAgo(symbol, '1m', 1))),
    '5m': round2(calcPriceChange(currentPrice, dataCache.getPriceNBarsAgo(symbol, '5m', 1))),
    '15m': round2(calcPriceChange(currentPrice, dataCache.getPriceNBarsAgo(symbol, '15m', 1))),
    '24h': tickerData[symbol] ? round2(calcPriceChange(currentPrice, tickerData[symbol].open24h)) : 0,
  };
}

/**
 * Analyze ALL coins
 * @returns {Object[]} array of signals
 */
function analyzeAll() {
  const signals = [];
  config.coins.forEach((symbol) => {
    const signal = analyzeSymbol(symbol);
    signals.push(signal);
  });
  return signals;
}

/**
 * Get top N opportunities sorted by confidence
 */
function getTopOpportunities(n = 3) {
  const signals = Object.values(latestSignals)
    .filter((s) => s.direction !== 'NONE' && s.confidence >= 50)
    .sort((a, b) => b.confidence - a.confidence);
  return signals.slice(0, n);
}

/**
 * Get all latest signals
 */
function getAllSignals() {
  return latestSignals;
}

function round2(num) {
  if (num === null || num === undefined || isNaN(num)) return 0;
  return Math.round(num * 100) / 100;
}

function getPrecision(price) {
  if (price >= 1000) return 2;
  if (price >= 1) return 4;
  return 6;
}

module.exports = {
  analyzeSymbol,
  analyzeAll,
  getTopOpportunities,
  getAllSignals,
  updateTicker,
};
