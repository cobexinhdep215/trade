/**
 * Technical Indicators Library
 * Implements: EMA, RSI, MACD, Bollinger Bands, ATR, Volume MA
 */

/**
 * Calculate Exponential Moving Average
 * @param {number[]} closes - Array of closing prices
 * @param {number} period - EMA period
 * @returns {number[]} EMA values
 */
function calcEMA(closes, period) {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  const result = [];
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

/**
 * Get latest EMA value
 */
function getEMA(closes, period) {
  const emas = calcEMA(closes, period);
  return emas.length > 0 ? emas[emas.length - 1] : null;
}

/**
 * Calculate RSI
 * @param {number[]} closes
 * @param {number} period
 * @returns {number} RSI value (0-100)
 */
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Calculate MACD
 * @returns {{ macdLine, signalLine, histogram, crossover }}
 *   crossover: 'bullish' | 'bearish' | null
 */
function calcMACD(closes, fastP = 12, slowP = 26, signalP = 9) {
  if (closes.length < slowP + signalP) {
    return { macdLine: null, signalLine: null, histogram: null, crossover: null };
  }
  const fastEMA = calcEMA(closes, fastP);
  const slowEMA = calcEMA(closes, slowP);

  // Align arrays - fast EMA is longer, trim to match slow EMA length
  const offset = fastEMA.length - slowEMA.length;
  const macdArray = [];
  for (let i = 0; i < slowEMA.length; i++) {
    macdArray.push(fastEMA[i + offset] - slowEMA[i]);
  }

  const signalArray = calcEMA(macdArray, signalP);
  const signalOffset = macdArray.length - signalArray.length;

  const macdLine = macdArray[macdArray.length - 1];
  const macdLinePrev = macdArray[macdArray.length - 2];
  const signalLine = signalArray[signalArray.length - 1];
  const signalLinePrev = signalArray[signalArray.length - 2];
  const histogram = macdLine - signalLine;

  let crossover = null;
  if (macdLinePrev <= signalLinePrev && macdLine > signalLine) {
    crossover = 'bullish';
  } else if (macdLinePrev >= signalLinePrev && macdLine < signalLine) {
    crossover = 'bearish';
  }

  return { macdLine, signalLine, histogram, crossover };
}

/**
 * Calculate Bollinger Bands
 * @returns {{ upper, middle, lower, bandwidth, percentB }}
 */
function calcBollingerBands(closes, period = 20, stddevMult = 2) {
  if (closes.length < period) return null;
  const recent = closes.slice(-period);
  const middle = recent.reduce((a, b) => a + b, 0) / period;
  const variance = recent.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) / period;
  const stddev = Math.sqrt(variance);
  const upper = middle + stddevMult * stddev;
  const lower = middle - stddevMult * stddev;
  const bandwidth = (upper - lower) / middle;
  const currentPrice = closes[closes.length - 1];
  const percentB = (currentPrice - lower) / (upper - lower);
  return { upper, middle, lower, bandwidth, percentB };
}

/**
 * Calculate ATR (Average True Range)
 * @param {number[]} highs
 * @param {number[]} lows
 * @param {number[]} closes
 * @param {number} period
 * @returns {number} ATR value
 */
function calcATR(highs, lows, closes, period = 14) {
  if (highs.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  if (trs.length < period) return null;
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

/**
 * Calculate Volume Moving Average
 * @param {number[]} volumes
 * @param {number} period
 * @returns {number} Volume MA
 */
function calcVolumeMA(volumes, period = 20) {
  if (volumes.length < period) return null;
  const recent = volumes.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

/**
 * Detect candlestick patterns
 * @param {Object} candles - Last few candles {open, high, low, close}[]
 * @returns {{ pattern: string, direction: 'bullish'|'bearish'|null }}
 */
function detectCandlePattern(candles) {
  if (!candles || candles.length < 2) return { pattern: null, direction: null };

  const c = candles[candles.length - 1]; // Current candle
  const p = candles[candles.length - 2]; // Previous candle

  const body = Math.abs(c.close - c.open);
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  const totalRange = c.high - c.low;

  if (totalRange === 0) return { pattern: null, direction: null };

  // Hammer: small body at top, long lower wick
  if (
    lowerWick > body * 2 &&
    upperWick < body * 0.5 &&
    body / totalRange < 0.4
  ) {
    return { pattern: 'Hammer', direction: 'bullish' };
  }

  // Shooting Star: small body at bottom, long upper wick
  if (
    upperWick > body * 2 &&
    lowerWick < body * 0.5 &&
    body / totalRange < 0.4
  ) {
    return { pattern: 'Shooting Star', direction: 'bearish' };
  }

  const prevBody = Math.abs(p.close - p.open);

  // Bullish Engulfing
  if (
    p.close < p.open && // prev bearish
    c.close > c.open && // curr bullish
    c.open < p.close &&
    c.close > p.open &&
    body > prevBody * 1.1
  ) {
    return { pattern: 'Bullish Engulfing', direction: 'bullish' };
  }

  // Bearish Engulfing
  if (
    p.close > p.open && // prev bullish
    c.close < c.open && // curr bearish
    c.open > p.close &&
    c.close < p.open &&
    body > prevBody * 1.1
  ) {
    return { pattern: 'Bearish Engulfing', direction: 'bearish' };
  }

  // Doji: very small body
  if (body / totalRange < 0.1 && totalRange > 0) {
    return { pattern: 'Doji', direction: null };
  }

  return { pattern: null, direction: null };
}

/**
 * Calculate % price change
 * @param {number} currentPrice
 * @param {number} pastPrice
 * @returns {number} percentage change
 */
function calcPriceChange(currentPrice, pastPrice) {
  if (!pastPrice || pastPrice === 0) return 0;
  return ((currentPrice - pastPrice) / pastPrice) * 100;
}

module.exports = {
  calcEMA,
  getEMA,
  calcRSI,
  calcMACD,
  calcBollingerBands,
  calcATR,
  calcVolumeMA,
  detectCandlePattern,
  calcPriceChange,
};
