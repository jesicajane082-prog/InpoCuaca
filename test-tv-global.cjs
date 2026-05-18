const https = require('https');

const postData = JSON.stringify({
  "symbols": {"tickers": [
    'FX:EURUSD', 'FX:GBPUSD', 'FX:USDJPY', 
    'OANDA:XAUUSD', 
    'NASDAQ:AAPL', 'NASDAQ:TSLA', 
    'IDX:BBRI', 'IDX:TLKM'
  ]},
  "columns": ["close"]
});

const options = {
  hostname: 'scanner.tradingview.com',
  path: '/global/scan',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'Origin': 'http://localhost:5173'
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => console.log('global data:', body));
});
req.write(postData);
req.end();
