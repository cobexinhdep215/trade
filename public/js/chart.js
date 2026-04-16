/**
 * TradingView Widget Integration
 * Dynamically loads chart when user clicks a coin
 */

const ChartManager = (() => {
  let currentSymbol = null;
  let widgetInstance = null;

  /**
   * Load TradingView chart for a given symbol
   * @param {string} symbol - e.g. 'BTCUSDT'
   */
  function loadChart(symbol) {
    const tvSymbol = `BINANCE:${symbol}`;
    if (currentSymbol === tvSymbol) return; // Already loaded
    currentSymbol = tvSymbol;

    // Update label
    const label = document.getElementById('chart-symbol-label');
    if (label) label.textContent = tvSymbol;

    const container = document.getElementById('tradingview-widget');
    if (!container) return;

    // Clear previous widget
    container.innerHTML = '';

    // Create TradingView widget
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: '5',
      timezone: 'Asia/Ho_Chi_Minh',
      theme: 'dark',
      style: '1',
      locale: 'en',
      enable_publishing: false,
      backgroundColor: 'rgba(22, 27, 39, 1)',
      gridColor: 'rgba(31, 41, 55, 1)',
      allow_symbol_change: true,
      calendar: false,
      hide_side_toolbar: false,
      withdateranges: true,
      hide_volume: false,
      support_host: 'https://www.tradingview.com',
      studies: [
        'MASimple@tv-basicstudies',
        'MACD@tv-basicstudies',
        'RSI@tv-basicstudies',
        'BB@tv-basicstudies',
      ],
    });

    // Create wrapper div with TV class
    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container';
    widgetDiv.style.height = '100%';
    widgetDiv.style.width = '100%';

    const innerDiv = document.createElement('div');
    innerDiv.className = 'tradingview-widget-container__widget';
    innerDiv.style.height = 'calc(100% - 32px)';
    innerDiv.style.width = '100%';

    widgetDiv.appendChild(innerDiv);
    widgetDiv.appendChild(script);
    container.appendChild(widgetDiv);
  }

  /**
   * Set chart interval (1m, 5m, 15m)
   */
  function setInterval(interval) {
    if (currentSymbol) {
      loadChart(currentSymbol.replace('BINANCE:', ''));
    }
  }

  /**
   * Get current symbol
   */
  function getCurrentSymbol() {
    return currentSymbol ? currentSymbol.replace('BINANCE:', '') : null;
  }

  return {
    loadChart,
    setInterval,
    getCurrentSymbol,
  };
})();
