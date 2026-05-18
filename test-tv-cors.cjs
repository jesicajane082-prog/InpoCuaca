const https = require('https');

const postData = JSON.stringify({
  "symbols": {"tickers": ["FX:EURUSD"]},
  "columns": ["close"]
});

// Test with text/plain (avoids preflight in browser)
const options = {
  hostname: 'scanner.tradingview.com',
  path: '/global/scan',
  method: 'POST',
  headers: {
    'Content-Type': 'text/plain',
    'Content-Length': Buffer.byteLength(postData),
    'Origin': 'http://localhost:5173'
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => console.log('text/plain data:', body));
});
req.write(postData);
req.end();

// Test with application/x-www-form-urlencoded
const options2 = {
  hostname: 'scanner.tradingview.com',
  path: '/global/scan',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData),
    'Origin': 'http://localhost:5173'
  }
};

const req2 = https.request(options2, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => console.log('x-www-form-urlencoded data:', body));
});
req2.write(postData);
req2.end();
