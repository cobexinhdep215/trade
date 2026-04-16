/**
 * Alert System
 * Handles: Toast notifications, Browser Notification API, Sound alerts
 */

const AlertSystem = (() => {
  let soundEnabled = true;
  let audioCtx = null;

  // Initialize Audio Context on first user interaction
  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  /**
   * Play alert beep using Web Audio API (no external file needed)
   * @param {'long'|'short'} direction
   */
  function playSound(direction) {
    if (!soundEnabled) return;
    try {
      initAudio();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      // LONG = higher pitch ascending, SHORT = lower pitch descending
      const freq1 = direction === 'long' ? 440 : 660;
      const freq2 = direction === 'long' ? 660 : 440;

      oscillator.frequency.setValueAtTime(freq1, audioCtx.currentTime);
      oscillator.frequency.linearRampToValueAtTime(freq2, audioCtx.currentTime + 0.15);
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.4);

      // Second beep
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.frequency.setValueAtTime(freq2, audioCtx.currentTime + 0.2);
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.25, audioCtx.currentTime + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      osc2.start(audioCtx.currentTime + 0.2);
      osc2.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      console.warn('[Audio] Failed to play:', e);
    }
  }

  /**
   * Show browser notification
   * @param {Object} signal
   */
  async function showBrowserNotification(signal) {
    if (!('Notification' in window)) return;

    if (Notification.permission !== 'granted') {
      await Notification.requestPermission();
    }

    if (Notification.permission === 'granted') {
      const emoji = signal.direction === 'LONG' ? '🚀' : '📉';
      const title = `${emoji} ${signal.symbol} ${signal.direction} Signal`;
      const body =
        `Entry: ${formatPrice(signal.entry)}\n` +
        `SL: ${formatPrice(signal.sl)} | TP: ${formatPrice(signal.tp)}\n` +
        `Confidence: ${signal.confidence}%`;

      const n = new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: signal.symbol, // Replace duplicate
      });

      n.onclick = () => {
        window.focus();
        n.close();
      };

      setTimeout(() => n.close(), 8000);
    }
  }

  /**
   * Show toast notification in UI
   * @param {Object} signal
   */
  function showToast(signal) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const dir = signal.direction.toLowerCase();
    const emoji = dir === 'long' ? '🚀' : '📉';

    const toast = document.createElement('div');
    toast.className = `toast ${dir}`;
    toast.id = `toast-${signal.symbol}`;

    toast.innerHTML = `
      <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
      <div class="toast-header">
        <span class="toast-symbol">${emoji} ${signal.symbol}</span>
        <span class="toast-direction ${dir}">${signal.direction}</span>
      </div>
      <div class="toast-price">$${formatPrice(signal.price)}</div>
      <div class="toast-levels">
        <span class="toast-sl">SL: ${formatPrice(signal.sl)}</span>
        <span class="toast-tp">TP: ${formatPrice(signal.tp)}</span>
      </div>
      <div class="toast-conf">Confidence: ${signal.confidence}% | Score: ${signal.score}/100</div>
    `;

    // Remove existing toast for same coin
    const existing = document.getElementById(`toast-${signal.symbol}`);
    if (existing) existing.remove();

    container.appendChild(toast);

    // Auto remove after 12s
    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.animation = 'none';
        toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
      }
    }, 12000);
  }

  /**
   * Main alert trigger: sound + browser notification + toast
   */
  function triggerAlert(signal) {
    const dir = signal.direction.toLowerCase();
    playSound(dir);
    showBrowserNotification(signal);
    showToast(signal);
  }

  /**
   * Toggle sound on/off, update button state
   */
  function toggleSound() {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById('btn-sound-toggle');
    if (btn) {
      btn.querySelector('span').textContent = soundEnabled ? '🔔' : '🔕';
      btn.classList.toggle('muted', !soundEnabled);
    }
    return soundEnabled;
  }

  // Format price nicely
  function formatPrice(price) {
    if (!price) return '—';
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
  }

  // Request notification permission on load
  function requestPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  return {
    triggerAlert,
    toggleSound,
    playSound,
    showToast,
    requestPermission,
    formatPrice,
  };
})();
