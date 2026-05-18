const fs = require('fs');

let c = fs.readFileSync('src/components/Dashboard.jsx', 'utf8');
c = c.replace(/\r\n/g, '\n');

const oldFetchStart = '  // Real-time price feed loop from public, CORS-enabled Exchange Rate API';
const oldFetchEnd = '  const [botLogs, setBotLogs] = useState({';

const newFetchLogic = `  // Real-time price feed loop from TradingView's Global Scanner API
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const postData = {
          "symbols": {"tickers": [
            'FX:EURUSD', 'FX:GBPUSD', 'FX:USDJPY', 
            'OANDA:XAUUSD', 
            'NASDAQ:AAPL', 'NASDAQ:TSLA', 
            'IDX:BBRI', 'IDX:TLKM'
          ]},
          "columns": ["close"]
        };

        const res = await fetch('https://scanner.tradingview.com/global/scan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(postData)
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.data) {
            setLivePrices(prev => {
              const nextPrices = { ...prev };
              data.data.forEach(item => {
                const tvSymbol = item.s;
                const price = item.d[0];
                
                if (tvSymbol === 'FX:EURUSD') nextPrices['EURUSD'] = price;
                else if (tvSymbol === 'FX:GBPUSD') nextPrices['GBPUSD'] = price;
                else if (tvSymbol === 'FX:USDJPY') nextPrices['USDJPY'] = price;
                else if (tvSymbol === 'OANDA:XAUUSD') nextPrices['XAUUSD'] = price;
                else if (tvSymbol === 'NASDAQ:AAPL') nextPrices['AAPL'] = price;
                else if (tvSymbol === 'NASDAQ:TSLA') nextPrices['TSLA'] = price;
                else if (tvSymbol === 'IDX:BBRI') nextPrices['BBRI'] = Math.round(price);
                else if (tvSymbol === 'IDX:TLKM') nextPrices['TLKM'] = Math.round(price);
              });
              return nextPrices;
            });
            // We NO LONGER mutate active trade entries here! Once a trade is open, its entry is permanent.
          }
        }
      } catch (e) {
        console.warn('Failed to fetch real-time TradingView rates', e);
      }
    };
    
    fetchRates();
    const interval = setInterval(fetchRates, 10000); // Fetch from TradingView every 10 seconds
    return () => clearInterval(interval);
  }, []);

`;

const startIdx = c.indexOf(oldFetchStart);
const endIdx = c.indexOf(oldFetchEnd);

if (startIdx !== -1 && endIdx !== -1) {
  const oldSection = c.substring(startIdx, endIdx);
  c = c.replace(oldSection, newFetchLogic);
  fs.writeFileSync('src/components/Dashboard.jsx', c, 'utf8');
  console.log('✅ Replaced API fetch with TradingView Scanner API. Active trades are no longer mutated!');
} else {
  console.log('❌ Could not find fetchRates loop');
  process.exit(1);
}
