/**
 * Main Application Logic
 * Connects Socket.io, wires up all UI modules
 */

(function () {
  'use strict';

  let socket = null;
  let selectedSymbol = null;
  let allSignals = {};
  let coins = [];

  // ===== INIT =====
  function init() {
    AlertSystem.requestPermission();
    setupSoundButton();
    fetchConfig().then(() => {
      connectSocket();
    });
  }

  /**
   * Fetch server config and initialize table
   */
  async function fetchConfig() {
    try {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      coins = cfg.coins;
      SignalUI.initTable(coins);

      // Attach click handlers to rows (will be re-attached on update too)
      attachRowClicks();
    } catch (err) {
      console.error('[App] Failed to fetch config:', err);
      // Fallback
      coins = ['BTCUSDT','ETHUSDT','SOLUSDT','LTCUSDT','XRPUSDT','TAOUSDT','PAXGUSDT'];
      SignalUI.initTable(coins);
    }
  }

  /**
   * Connect to Socket.io server
   */
  function connectSocket() {
    socket = io();

    socket.on('connect', () => {
      console.log('[Socket] Connected');
      setConnectionStatus(true);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Disconnected');
      setConnectionStatus(false);
    });

    socket.on('connect_error', () => {
      setConnectionStatus(false);
    });

    // Full signals update (all coins)
    socket.on('signals', (signalsMap) => {
      allSignals = signalsMap;
      SignalUI.updateAll(signalsMap);
      SignalUI.updateBtcBias(signalsMap);
      attachRowClicks();

      // If a coin is selected, update detail too
      if (selectedSymbol && signalsMap[selectedSymbol]) {
        SignalUI.renderSignalDetail(signalsMap[selectedSymbol]);
      }
    });

    // Individual signal update (one coin)
    socket.on('signalUpdate', (signal) => {
      allSignals[signal.symbol] = signal;
      SignalUI.updateRow(signal);
      SignalUI.updateBtcBias(allSignals);

      // Re-attach click for updated row
      const row = document.getElementById(`row-${signal.symbol}`);
      if (row) {
        row.onclick = () => onCoinSelect(signal.symbol, signal);
      }

      // Update detail if this coin is selected
      if (selectedSymbol === signal.symbol) {
        SignalUI.renderSignalDetail(signal);
      }
    });

    // Alert signal (strong signal, cooldown passed)
    socket.on('alert', (signal) => {
      console.log(`[Alert] ${signal.symbol} ${signal.direction} | Score: ${signal.score}`);
      AlertSystem.triggerAlert(signal);
      SignalUI.addToHistory(signal);
    });

    // Top opportunities
    socket.on('topOpportunities', (opps) => {
      SignalUI.renderTopOpportunities(opps);
    });

    // Winrate update
    socket.on('winrate', (data) => {
      SignalUI.renderWinrate(data);
    });

    // Connection status from server
    socket.on('status', (status) => {
      setConnectionStatus(status.connected);
    });
  }

  /**
   * Attach click handlers to all table rows
   */
  function attachRowClicks() {
    coins.forEach((symbol) => {
      const row = document.getElementById(`row-${symbol}`);
      if (row) {
        row.onclick = () => {
          const signal = allSignals[symbol] || { symbol, loading: true };
          onCoinSelect(symbol, signal);
        };
      }
    });
  }

  /**
   * Handle coin row click
   */
  function onCoinSelect(symbol, signal) {
    selectedSymbol = symbol;

    // Update selected row styling
    document.querySelectorAll('#signal-table-body tr').forEach((r) => {
      r.classList.remove('selected');
    });
    const row = document.getElementById(`row-${symbol}`);
    if (row) row.classList.add('selected');

    // Load TradingView chart
    ChartManager.loadChart(symbol);

    // Render signal detail
    SignalUI.renderSignalDetail(signal);

    // Scroll chart into view on mobile
    const chartPanel = document.getElementById('chart-panel');
    if (chartPanel && window.innerWidth < 900) {
      chartPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Update connection status indicator
   */
  function setConnectionStatus(connected) {
    const el = document.getElementById('connection-status');
    if (!el) return;
    const dot = el.querySelector('.status-dot');
    const text = el.querySelector('.status-text');

    if (connected) {
      el.className = 'status-indicator connected';
      text.textContent = 'Live • Binance';
    } else {
      el.className = 'status-indicator disconnected';
      text.textContent = 'Reconnecting...';
    }
  }

  /**
   * Sound toggle button
   */
  function setupSoundButton() {
    const btn = document.getElementById('btn-sound-toggle');
    if (btn) {
      btn.addEventListener('click', () => {
        // Initialize audio context on user interaction
        AlertSystem.toggleSound();
      });
    }
  }

  // ===== START =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
