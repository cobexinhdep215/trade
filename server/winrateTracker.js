/**
 * Winrate Tracker
 * Tracks signal results by checking if price hit TP or SL
 * Stores history server-side in memory
 */

const config = require('../config.json');
const dataCache = require('./dataCache');

const MAX_HISTORY = config.winrate.maxHistory;
const CHECK_DELAY = config.winrate.checkDelayMs;

// Active signals waiting for result
const activeTrades = [];

// Completed trades history
const tradeHistory = [];

// Stats cache
const stats = {
  totalTrades: 0,
  wins: 0,
  losses: 0,
  pending: 0,
  winrate: 0,
  bySymbol: {},
};

/**
 * Record a new signal for tracking
 */
function recordSignal(signal) {
  if (!signal || signal.direction === 'NONE' || !signal.entry || !signal.sl || !signal.tp) {
    return;
  }

  const trade = {
    id: `${signal.symbol}-${Date.now()}`,
    symbol: signal.symbol,
    direction: signal.direction,
    entry: signal.entry,
    sl: signal.sl,
    tp: signal.tp,
    confidence: signal.confidence,
    score: signal.score,
    entryTime: Date.now(),
    status: 'pending', // pending, win, loss
    exitPrice: null,
    exitTime: null,
    pnlPercent: null,
  };

  activeTrades.push(trade);
  stats.pending++;

  // Schedule check
  setTimeout(() => checkTrade(trade), CHECK_DELAY);

  return trade;
}

/**
 * Check if a trade hit TP or SL
 */
function checkTrade(trade) {
  if (trade.status !== 'pending') return;

  const currentPrice = dataCache.getCurrentPrice(trade.symbol);

  if (!currentPrice || currentPrice === 0) {
    // No price data yet, recheck later
    setTimeout(() => checkTrade(trade), 60000);
    return;
  }

  let result = null;

  if (trade.direction === 'LONG') {
    if (currentPrice >= trade.tp) {
      result = 'win';
    } else if (currentPrice <= trade.sl) {
      result = 'loss';
    }
    // Also check if price has moved significantly
    if (!result) {
      const elapsed = Date.now() - trade.entryTime;
      if (elapsed > CHECK_DELAY * 2) {
        // Force close after 2x delay
        result = currentPrice > trade.entry ? 'win' : 'loss';
      }
    }
  } else {
    // SHORT
    if (currentPrice <= trade.tp) {
      result = 'win';
    } else if (currentPrice >= trade.sl) {
      result = 'loss';
    }
    if (!result) {
      const elapsed = Date.now() - trade.entryTime;
      if (elapsed > CHECK_DELAY * 2) {
        result = currentPrice < trade.entry ? 'win' : 'loss';
      }
    }
  }

  if (result) {
    completeTrade(trade, result, currentPrice);
  } else {
    // Recheck in 1 minute
    setTimeout(() => checkTrade(trade), 60000);
  }
}

/**
 * Complete a trade with result
 */
function completeTrade(trade, result, exitPrice) {
  trade.status = result;
  trade.exitPrice = exitPrice;
  trade.exitTime = Date.now();

  if (trade.direction === 'LONG') {
    trade.pnlPercent = ((exitPrice - trade.entry) / trade.entry) * 100;
  } else {
    trade.pnlPercent = ((trade.entry - exitPrice) / trade.entry) * 100;
  }
  trade.pnlPercent = Math.round(trade.pnlPercent * 100) / 100;

  // Move from active to history
  const idx = activeTrades.findIndex((t) => t.id === trade.id);
  if (idx >= 0) activeTrades.splice(idx, 1);

  tradeHistory.unshift(trade);
  if (tradeHistory.length > MAX_HISTORY) {
    tradeHistory.pop();
  }

  // Update stats
  recalcStats();

  console.log(
    `[Winrate] ${trade.symbol} ${trade.direction} → ${result.toUpperCase()} | ` +
    `Entry: ${trade.entry} → Exit: ${exitPrice} | PnL: ${trade.pnlPercent}%`
  );
}

/**
 * Recalculate stats
 */
function recalcStats() {
  stats.totalTrades = tradeHistory.length;
  stats.wins = tradeHistory.filter((t) => t.status === 'win').length;
  stats.losses = tradeHistory.filter((t) => t.status === 'loss').length;
  stats.pending = activeTrades.length;
  stats.winrate = stats.totalTrades > 0 ? Math.round((stats.wins / stats.totalTrades) * 100) : 0;

  // By symbol
  stats.bySymbol = {};
  tradeHistory.forEach((t) => {
    if (!stats.bySymbol[t.symbol]) {
      stats.bySymbol[t.symbol] = { wins: 0, losses: 0, total: 0, winrate: 0 };
    }
    stats.bySymbol[t.symbol].total++;
    if (t.status === 'win') stats.bySymbol[t.symbol].wins++;
    else stats.bySymbol[t.symbol].losses++;
    stats.bySymbol[t.symbol].winrate =
      Math.round((stats.bySymbol[t.symbol].wins / stats.bySymbol[t.symbol].total) * 100);
  });
}

/**
 * Get winrate stats
 */
function getStats() {
  return { ...stats };
}

/**
 * Get trade history (last N)
 */
function getHistory(n = 20) {
  return tradeHistory.slice(0, n);
}

/**
 * Get active trades
 */
function getActiveTrades() {
  return [...activeTrades];
}

module.exports = {
  recordSignal,
  getStats,
  getHistory,
  getActiveTrades,
};
