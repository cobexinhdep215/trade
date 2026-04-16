/**
 * Signal Rendering Module
 * Handles all UI updates for the signal dashboard
 */

const SignalUI = (() => {
  // Track which coins are initialized in table
  const tableRows = {};

  // Signal history array (max 20)
  const signalHistory = [];

  // Coin icon colors per symbol
  const coinColors = {
    BTCUSDT: '#f7931a',
    ETHUSDT: '#627eea',
    SOLUSDT: '#9945ff',
    LTCUSDT: '#bfbbbb',
    XRPUSDT: '#00aae4',
    TAOUSDT: '#45d1b6',
    PAXGUSDT: '#d4a017',
  };

  // Abbreviations for coin icons
  const coinAbbr = {
    BTCUSDT: 'BTC',
    ETHUSDT: 'ETH',
    SOLUSDT: 'SOL',
    LTCUSDT: 'LTC',
    XRPUSDT: 'XRP',
    TAOUSDT: 'TAO',
    PAXGUSDT: 'PAXG',
  };

  /**
   * Initialize all coin rows in the table
   */
  function initTable(coins) {
    const tbody = document.getElementById('signal-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    coins.forEach((symbol) => {
      const tr = document.createElement('tr');
      tr.id = `row-${symbol}`;
      tr.dataset.symbol = symbol;
      tr.innerHTML = buildRowHTML(symbol, null);
      tbody.appendChild(tr);
      tableRows[symbol] = tr;
    });
  }

  /**
   * Build HTML for a table row
   */
  function buildRowHTML(symbol, signal) {
    const abbr = coinAbbr[symbol] || symbol.replace('USDT', '');
    const color = coinColors[symbol] || '#3b82f6';
    const shortAbbr = abbr.slice(0, 3);

    const ch24h = signal ? formatChange(signal.priceChanges?.['24h']) : '<span class="change-cell neutral">—</span>';
    const price = signal && signal.price ? `$${formatPrice(signal.price)}` : '—';

    if (!signal || signal.loading) {
      return `
        <td>
          <div class="coin-cell">
            <div class="coin-icon" style="background: linear-gradient(135deg, ${color}aa, ${color}55);">${shortAbbr}</div>
            <div>
              <div class="coin-name">${abbr}</div>
              <div class="coin-pair">${symbol}</div>
            </div>
          </div>
        </td>
        <td><span class="price-cell">${price}</span></td>
        <td colspan="3"><span class="change-cell neutral">Scanning... (${signal ? `${signal.candleCount?.['15m'] || 0}/80` : ''})</span></td>
        <td>${ch24h}</td>
        <td><span class="signal-badge loading">Scanning</span></td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
      `;
    }

    const price = formatPrice(signal.price);
    const dir = signal.direction;
    const dirClass = dir === 'LONG' ? 'long' : dir === 'SHORT' ? 'short' : 'none';
    const trendClass = signal.trend === 'UP' ? 'trend-up' : signal.trend === 'DOWN' ? 'trend-down' : 'trend-neutral';
    const confidence = signal.confidence;
    const barColor = dir === 'LONG' ? '#10b981' : dir === 'SHORT' ? '#ef4444' : '#374151';

    const ch1m = formatChange(signal.priceChanges?.['1m']);
    const ch5m = formatChange(signal.priceChanges?.['5m']);
    const ch15m = formatChange(signal.priceChanges?.['15m']);
    const ch24h = formatChange(signal.priceChanges?.['24h']);

    return `
      <td>
        <div class="coin-cell">
          <div class="coin-icon" style="background: linear-gradient(135deg, ${color}cc, ${color}44);">${shortAbbr}</div>
          <div>
            <div class="coin-name">${abbr}</div>
            <div class="coin-pair">${symbol}</div>
          </div>
        </div>
      </td>
      <td><span class="price-cell">$${price}</span></td>
      <td>${ch1m}</td>
      <td>${ch5m}</td>
      <td>${ch15m}</td>
      <td>${ch24h}</td>
      <td><span class="signal-badge ${dirClass}">${dir}</span></td>
      <td>
        <div class="confidence-cell">
          <div class="confidence-inline">
            <div class="mini-bar">
              <div class="mini-bar-fill" style="width:${confidence}%; background:${barColor};"></div>
            </div>
            <span class="confidence-text" style="color:${barColor};">${confidence}%</span>
          </div>
        </div>
      </td>
      <td><span class="${trendClass} trend-cell">${signal.trend === 'UP' ? '↑ UP' : signal.trend === 'DOWN' ? '↓ DOWN' : '— FLAT'}</span></td>
      <td><span class="entry-cell">${signal.entry ? formatPrice(signal.entry) : '—'}</span></td>
      <td><span class="sl-cell">${signal.sl ? formatPrice(signal.sl) : '—'}</span></td>
      <td><span class="tp-cell">${signal.tp ? formatPrice(signal.tp) : '—'}</span></td>
    `;
  }

  /**
   * Update a single row with new signal data
   */
  function updateRow(signal) {
    const tr = tableRows[signal.symbol];
    if (!tr) return;

    const prevDir = tr.dataset.direction;
    const newDir = signal.direction;

    tr.innerHTML = buildRowHTML(signal.symbol, signal);
    tr.dataset.direction = newDir;

    // Update row CSS class
    tr.className = '';
    if (newDir === 'LONG') {
      tr.classList.add('signal-long');
      if (prevDir !== 'LONG') tr.classList.add('flash-green');
    } else if (newDir === 'SHORT') {
      tr.classList.add('signal-short');
      if (prevDir !== 'SHORT') tr.classList.add('flash-red');
    }

    // Re-attach click
    tr.onclick = () => onRowClick(signal.symbol, signal);
  }

  /**
   * Update ALL signals at once
   */
  function updateAll(signalsMap) {
    Object.values(signalsMap).forEach((signal) => {
      updateRow(signal);
    });
    updateLoadingStatus(signalsMap);
  }

  /**
   * Update loading status text
   */
  function updateLoadingStatus(signalsMap) {
    const el = document.getElementById('data-loading-status');
    if (!el) return;
    const total = Object.keys(signalsMap).length;
    const ready = Object.values(signalsMap).filter((s) => !s.loading).length;
    if (ready >= total) {
      el.textContent = `✅ All ${total} pairs active`;
      el.style.color = '#10b981';
    } else {
      el.textContent = `Loading ${ready}/${total} pairs...`;
      el.style.color = '#06b6d4';
    }
  }

  /**
   * Render Top Opportunities panel
   */
  function renderTopOpportunities(opps) {
    const grid = document.getElementById('top-opps-grid');
    if (!grid) return;

    if (!opps || opps.length === 0) {
      grid.innerHTML = `
        <div class="top-opp-card" style="grid-column: 1/-1; text-align:center; padding: 30px;">
          <p style="color: var(--text-muted);">No strong signals yet. Scanning...</p>
        </div>
      `;
      return;
    }

    // Ensure 3 slots
    while (opps.length < 3) opps.push(null);

    grid.innerHTML = opps.slice(0, 3).map((opp, i) => {
      if (!opp) {
        return `<div class="top-opp-card"><div class="opp-rank">#${i + 1}</div><div style="color:var(--text-muted); font-size:13px;">No signal</div></div>`;
      }
      const dir = opp.direction.toLowerCase();
      const barColor = dir === 'long' ? '#10b981' : '#ef4444';
      return `
        <div class="top-opp-card ${dir}" onclick="onTopOppClick('${opp.symbol}', ${JSON.stringify(opp).replace(/'/g, "\\'")})">
          <div class="opp-rank">#${i + 1} BEST OPPORTUNITY</div>
          <div>
            <span class="opp-symbol">${opp.symbol.replace('USDT', '')}</span>
            <span class="opp-direction ${dir}">${opp.direction}</span>
          </div>
          <div class="opp-price">$${formatPrice(opp.price)}</div>
          <div class="opp-confidence">
            <div class="confidence-bar-track">
              <div class="confidence-bar-fill" style="width:${opp.confidence}%; background:${barColor};"></div>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:4px; font-size:11px; color:var(--text-muted);">
              <span>Confidence</span>
              <span style="color:${barColor}; font-weight:700;">${opp.confidence}%</span>
            </div>
          </div>
          <div class="opp-card-footer">
            <span>SL: ${formatPrice(opp.sl)}</span>
            <span>TP: ${formatPrice(opp.tp)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Render signal detail panel
   */
  function renderSignalDetail(signal) {
    const content = document.getElementById('signal-detail-content');
    if (!content) return;

    if (!signal || signal.direction === 'NONE' || signal.loading) {
      content.innerHTML = `<div class="no-signal-selected"><p>${signal?.loading ? 'Loading data...' : 'No signal for this coin'}</p></div>`;
      return;
    }

    const dir = signal.direction.toLowerCase();
    const barColor = dir === 'long' ? '#10b981' : '#ef4444';
    const scores = signal.scores || {};

    const scoreRows = [
      { label: 'Trend (15m)', pts: dir === 'long' ? (scores.trend?.longPts || 0) : (scores.trend?.shortPts || 0), max: 30 },
      { label: 'MACD (5m)', pts: dir === 'long' ? (scores.macd?.longPts || 0) : (scores.macd?.shortPts || 0), max: 20 },
      { label: 'Volume', pts: dir === 'long' ? (scores.volume?.longPts || 0) : (scores.volume?.shortPts || 0), max: 15 },
      { label: 'RSI (1m)', pts: dir === 'long' ? (scores.rsi?.longPts || 0) : (scores.rsi?.shortPts || 0), max: 15 },
      { label: 'Candlestick', pts: dir === 'long' ? (scores.candlestick?.longPts || 0) : (scores.candlestick?.shortPts || 0), max: 20 },
    ];

    content.innerHTML = `
      <div class="detail-symbol-header">
        <span class="detail-symbol-name">${signal.symbol.replace('USDT', '')}/USDT</span>
        <span class="detail-direction-badge ${dir}">${signal.direction}</span>
      </div>
      <div class="detail-price-row">$${formatPrice(signal.price)}</div>
      <div class="detail-levels">
        <div class="level-card entry">
          <div class="level-label">Entry</div>
          <div class="level-value">${formatPrice(signal.entry)}</div>
        </div>
        <div class="level-card sl">
          <div class="level-label">Stop Loss</div>
          <div class="level-value">${formatPrice(signal.sl)}</div>
        </div>
        <div class="level-card tp">
          <div class="level-label">Take Profit</div>
          <div class="level-value">${formatPrice(signal.tp)}</div>
        </div>
      </div>
      <div class="detail-score-section">
        <div class="score-row" style="margin-bottom:10px;">
          <span class="score-label" style="font-weight:700;">Total Score</span>
          <span class="score-value" style="font-size:16px; color:${barColor};">${signal.score}/100</span>
        </div>
        ${scoreRows.map(s => `
          <div class="score-row">
            <span class="score-label">${s.label}</span>
            <span class="score-value">${s.pts}/${s.max}</span>
          </div>
          <div class="score-bar-track" style="margin-bottom:6px;">
            <div class="score-bar-fill" style="width:${(s.pts/s.max)*100}%; background:${barColor};"></div>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--border-color);">
        <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">
          RSI(1m): <strong style="color:var(--text-primary)">${scores.rsi?.value1m?.toFixed(1) || '—'}</strong> |
          RSI(15m): <strong style="color:var(--text-primary)">${scores.rsi?.value15m?.toFixed(1) || '—'}</strong> |
          MACD: <strong style="color:${scores.macd?.crossover === 'bullish' ? 'var(--green)' : scores.macd?.crossover === 'bearish' ? 'var(--red)' : 'var(--text-muted)'}">${scores.macd?.crossover || 'None'}</strong>
        </div>
        <div style="font-size:11px; color:var(--text-muted);">
          Pattern: <strong style="color:var(--text-primary)">${scores.candlestick?.pattern?.pattern || 'None'}</strong> |
          Vol/MA: <strong style="color:var(--text-primary)">${scores.volume?.spike?.toFixed(2) || '—'}x</strong>
        </div>
      </div>
      <div class="detail-changes">
        ${[['1m', signal.priceChanges?.['1m']], ['5m', signal.priceChanges?.['5m']], ['15m', signal.priceChanges?.['15m']], ['24h', signal.priceChanges?.['24h']]].map(([tf, val]) => {
          const v = val || 0;
          const color = v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--text-muted)';
          return `
            <div class="change-badge">
              <div class="change-badge-label">${tf}</div>
              <div class="change-badge-value" style="color:${color};">${v > 0 ? '+' : ''}${v.toFixed(2)}%</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  /**
   * Add signal to history list
   */
  function addToHistory(signal) {
    // Only add strong signals with direction
    if (signal.direction === 'NONE') return;

    signalHistory.unshift({
      ...signal,
      historyTime: Date.now(),
    });

    if (signalHistory.length > 20) signalHistory.pop();

    renderHistory();
  }

  /**
   * Render history list
   */
  function renderHistory() {
    const list = document.getElementById('signal-history-list');
    const count = document.getElementById('history-count');
    if (!list) return;

    if (count) count.textContent = `${signalHistory.length} signals`;

    if (signalHistory.length === 0) {
      list.innerHTML = `<div class="empty-state"><p>Waiting for signals...</p></div>`;
      return;
    }

    list.innerHTML = signalHistory.map((s) => {
      const dir = s.direction.toLowerCase();
      const elapsed = Math.floor((Date.now() - s.historyTime) / 1000);
      const timeStr = elapsed < 60 ? `${elapsed}s ago` : `${Math.floor(elapsed / 60)}m ago`;
      const resultClass = s.result || '';

      return `
        <div class="history-item ${dir} ${resultClass}">
          <span class="history-symbol">${s.symbol.replace('USDT','')}</span>
          <span class="history-direction ${dir}">${s.direction}</span>
          <span class="history-price">$${formatPrice(s.price)}</span>
          <span class="history-confidence">${s.confidence}%</span>
          <span class="history-time">${timeStr}</span>
          ${s.result ? `<span class="history-result ${s.result}">${s.result.toUpperCase()}</span>` : '<span class="history-result pending">OPEN</span>'}
        </div>
      `;
    }).join('');
  }

  /**
   * Update winrate UI
   */
  function renderWinrate(data) {
    if (!data || !data.stats) return;
    const { stats, history } = data;

    const el = (id) => document.getElementById(id);
    if (el('wr-total')) el('wr-total').textContent = stats.totalTrades;
    if (el('wr-wins')) el('wr-wins').textContent = stats.wins;
    if (el('wr-losses')) el('wr-losses').textContent = stats.losses;
    if (el('wr-rate')) el('wr-rate').textContent = `${stats.winrate}%`;
    if (el('wr-pending')) el('wr-pending').textContent = stats.pending;

    // By symbol
    const bySymbolEl = document.getElementById('winrate-by-symbol');
    if (bySymbolEl && stats.bySymbol) {
      bySymbolEl.innerHTML = Object.entries(stats.bySymbol).map(([sym, d]) => {
        const color = d.winrate >= 60 ? 'var(--green)' : d.winrate >= 40 ? 'var(--yellow)' : 'var(--red)';
        return `
          <div class="symbol-win-card">
            <div class="symbol-win-name">${sym.replace('USDT', '')}</div>
            <div class="symbol-win-rate" style="color:${color};">${d.winrate}%</div>
            <div class="symbol-win-detail">${d.wins}W / ${d.losses}L</div>
          </div>
        `;
      }).join('');
    }

    // Update history results
    if (history && history.length > 0) {
      history.forEach((trade) => {
        const existing = signalHistory.find(
          (s) => s.symbol === trade.symbol && Math.abs(s.historyTime - trade.entryTime) < 5000
        );
        if (existing) {
          existing.result = trade.status;
        }
      });
      renderHistory();
    }
  }

  /**
   * Update BTC bias indicator
   */
  function updateBtcBias(signalsMap) {
    const btc = signalsMap['BTCUSDT'];
    const el = document.getElementById('btc-bias-value');
    if (!el || !btc) return;
    el.textContent = btc.trend === 'UP' ? '↑ BULL' : btc.trend === 'DOWN' ? '↓ BEAR' : '— FLAT';
    el.className = `bias-value ${btc.trend === 'UP' ? 'up' : btc.trend === 'DOWN' ? 'down' : ''}`;
  }

  // ===== HELPERS =====

  function formatPrice(price) {
    if (!price) return '—';
    if (price >= 10000) return price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
  }

  function formatChange(val) {
    if (val === null || val === undefined || val === 0) return `<span class="change-cell neutral">0.00%</span>`;
    const sign = val > 0 ? '+' : '';
    const isStrong = Math.abs(val) >= 1;
    const cls = `change-cell ${val > 0 ? 'positive' : 'negative'} ${isStrong ? 'strong' : ''}`;
    return `<span class="${cls}">${sign}${val.toFixed(2)}%</span>`;
  }

  return {
    initTable,
    updateRow,
    updateAll,
    renderTopOpportunities,
    renderSignalDetail,
    addToHistory,
    renderHistory,
    renderWinrate,
    updateBtcBias,
    formatPrice,
    formatChange,
  };
})();

// Global handler for top opp click
function onTopOppClick(symbol, signal) {
  ChartManager.loadChart(symbol);
  SignalUI.renderSignalDetail(signal);
  // Highlight row
  const row = document.getElementById(`row-${symbol}`);
  if (row) {
    document.querySelectorAll('#signal-table-body tr.selected').forEach(r => r.classList.remove('selected'));
    row.classList.add('selected');
  }
}
