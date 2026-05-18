const https = require('https');

const postData = JSON.stringify({
  "symbols": {"tickers": ["FX:EURUSD"]},
  "columns": ["close"]
});

const options = {
  hostname: 'scanner.tradingview.com',
  path: '/forex/scan',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'Origin': 'http://localhost:5173'
  }
};

const req = https.request(options, (res) => {
  console.log('STATUS:', res.statusCode);
  console.log('CORS HEADERS:', res.headers['access-control-allow-origin']);
  
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  
  res.on('end', () => {
    console.log('BODY:', body);
  });
});

req.on('error', (e) => {
  console.error('Problem with request:', e.message);
});

req.write(postData);
req.end();
