/**
 * Express Server + Socket.io
 * Main entry point for the crypto signal dashboard
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const config = require('../config.json');
const binanceClient = require('./binanceClient');
const signalEngine = require('./signalEngine');
const winrateTracker = require('./winrateTracker');
const dataCache = require('./dataCache');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API endpoint: config
app.get('/api/config', (req, res) => {
  res.json({
    coins: config.coins,
    timeframes: config.timeframes,
    minScore: config.signal.minScore,
  });
});

// API endpoint: status
app.get('/api/status', (req, res) => {
  res.json(binanceClient.getStatus());
});

// API endpoint: winrate
app.get('/api/winrate', (req, res) => {
  res.json({
    stats: winrateTracker.getStats(),
    history: winrateTracker.getHistory(20),
    activeTrades: winrateTracker.getActiveTrades(),
  });
});

// API endpoint: signals
app.get('/api/signals', (req, res) => {
  res.json(signalEngine.getAllSignals());
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Send current state immediately
  socket.emit('signals', signalEngine.getAllSignals());
  socket.emit('winrate', {
    stats: winrateTracker.getStats(),
    history: winrateTracker.getHistory(20),
  });
  socket.emit('status', binanceClient.getStatus());
  socket.emit('topOpportunities', signalEngine.getTopOpportunities(3));

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// ===== SIGNAL ANALYSIS LOOP =====

let analysisInterval = null;
let tickCounter = 0;

/**
 * Handle incoming data from Binance WebSocket
 */
function onBinanceData(symbol, timeframe, data) {
  if (data.type === 'ticker') {
    signalEngine.updateTicker(symbol, data);
    return;
  }

  // Run analysis when a candle closes on any timeframe, or every 5 ticks on live updates
  tickCounter++;
  if (data.isClosed || tickCounter % 5 === 0) {
    const signal = signalEngine.analyzeSymbol(symbol);

    // Emit individual signal update
    io.emit('signalUpdate', signal);

    // If alert-worthy signal
    if (signal.isAlert) {
      io.emit('alert', signal);
      console.log(
        `🚀 ALERT: ${signal.symbol} ${signal.direction} | ` +
        `Score: ${signal.score} | Confidence: ${signal.confidence}% | ` +
        `Entry: ${signal.entry} | SL: ${signal.sl} | TP: ${signal.tp}`
      );

      // Record for winrate tracking
      winrateTracker.recordSignal(signal);
    }
  }
}

/**
 * Periodic full analysis
 * Runs every 10 seconds to ensure fresh data for all coins
 */
function startPeriodicAnalysis() {
  analysisInterval = setInterval(() => {
    const signals = signalEngine.analyzeAll();
    io.emit('signals', signalEngine.getAllSignals());
    io.emit('topOpportunities', signalEngine.getTopOpportunities(3));
    io.emit('winrate', {
      stats: winrateTracker.getStats(),
      history: winrateTracker.getHistory(20),
    });
    io.emit('status', binanceClient.getStatus());
  }, 10000);
}

// ===== START =====

const PORT = process.env.PORT || config.server.port;

server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║    🚀 CRYPTO SIGNAL DASHBOARD               ║');
  console.log(`║    📡 Server running on port ${PORT}            ║`);
  console.log(`║    🌐 http://localhost:${PORT}                 ║`);
  console.log('║    📊 Tracking: ' + config.coins.join(', '));
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  // Initialize cache for all coins
  config.coins.forEach((coin) => dataCache.initSymbol(coin));

  // Connect to Binance
  binanceClient.connect(onBinanceData);

  // Start periodic analysis after a delay to let data load
  setTimeout(() => {
    startPeriodicAnalysis();
    console.log('[Engine] ✅ Periodic analysis started (every 10s)');
  }, 15000);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  binanceClient.disconnect();
  if (analysisInterval) clearInterval(analysisInterval);
  server.close(() => {
    console.log('[Server] Goodbye!');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[Server] Unhandled rejection:', err);
});
