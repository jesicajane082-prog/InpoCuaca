const https = require('https');

function scan(market, symbols) {
  const postData = JSON.stringify({
    "symbols": {"tickers": symbols},
    "columns": ["close"]
  });

  const options = {
    hostname: 'scanner.tradingview.com',
    path: `/${market}/scan`,
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
    res.on('end', () => console.log(`${market} data:`, body));
  });
  req.write(postData);
  req.end();
}

scan('forex', ['FX:EURUSD', 'FX:GBPUSD', 'FX:USDJPY']);
scan('america', ['NASDAQ:AAPL', 'NASDAQ:TSLA']);
scan('indonesia', ['IDX:BBRI', 'IDX:TLKM']);
scan('cfd', ['OANDA:XAUUSD']); // Gold might be in CFD or crypto
