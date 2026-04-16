# 🚀 Crypto Signal Dashboard

Real-time crypto trading signal dashboard with multi-timeframe analysis.

## 📦 Cài đặt

```bash
cd d:\DACTY\bottrading
yarn install
```

## ▶️ Chạy

```bash
yarn start
```

Mở trình duyệt: **http://localhost:3000**

## 📁 Cấu trúc

```
bottrading/
├── server/
│   ├── index.js          # Express + Socket.io server
│   ├── binanceClient.js  # Binance WebSocket + REST
│   ├── signalEngine.js   # Multi-timeframe signal engine
│   ├── indicators.js     # EMA, RSI, MACD, BB, ATR
│   ├── dataCache.js      # Rolling OHLCV cache
│   └── winrateTracker.js # Win/Loss tracker
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── app.js        # Main client logic
│       ├── alerts.js     # Sound + notifications
│       ├── chart.js      # TradingView widget
│       └── signals.js    # UI rendering
├── config.json           # Tunable settings
└── package.json
```

## ⚙️ Cấu hình (`config.json`)

| Tham số | Mặc định | Mô tả |
|---|---|---|
| `coins` | 7 coins | Danh sách coins theo dõi |
| `signal.minScore` | 80 | Ngưỡng tín hiệu alert |
| `signal.cooldownMs` | 300000 | Chống spam (5 phút) |
| `indicators.atr.slMultiplier` | 1.5 | Hệ số ATR cho SL |
| `indicators.atr.tpMultiplier` | 2.5 | Hệ số ATR cho TP |

## 🎯 Signal Scoring

| Component | Điểm | Nguồn |
|---|---|---|
| Trend (EMA50/200) | 30 | 15m |
| MACD crossover | 20 | 5m |
| Volume spike | 15 | 5m |
| RSI extreme | 15 | 1m |
| Candlestick pattern | 20 | 1m |
| **Total** | **100** | |

> Alert khi score ≥ 80
