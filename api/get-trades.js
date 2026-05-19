import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCAL_DB_PATH = path.join(__dirname, '../public/trading-db.json');

// Strategi default jika data belum terisi
function getDefaultPerformance() {
  const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AAPL', 'TSLA', 'BBRI', 'TLKM'];
  const defaultMap = {
    'EURUSD': {
      strategyName: 'SMC x Supply & Demand (S&D) + Support Resistance',
      winRate: '68.2%', avgRrr: '1:2.3', profit1D: '+0.00%', profit1W: '+0.00%', profit1M: '+0.00%', totalTrades: '0 Trades',
      analysisExplain: 'Analisis M15 (Intraday) difokuskan pada presisi momentum H4/H1 Trend. Algoritma menggabungkan SMC (Smart Money Concepts) untuk melacak pergerakan likuiditas institusi (CHoCH), divalidasi dengan area S&D kuat.'
    },
    'GBPUSD': {
      strategyName: 'Order Block & Fair Value Gap (FVG) Refinement',
      winRate: '65.5%', avgRrr: '1:2.5', profit1D: '+0.00%', profit1W: '+0.00%', profit1M: '+0.00%', totalTrades: '0 Trades',
      analysisExplain: 'Strategi difokuskan pada entri di area FVG M15 pasca-konfirmasi bias tren H4/H1. Menggunakan Stop Loss ketat di bawah batas kritis Support H1.'
    },
    'USDJPY': {
      strategyName: 'Mean Reversion & Bollinger Band Extremes',
      winRate: '71.0%', avgRrr: '1:2.1', profit1D: '+0.00%', profit1W: '+0.00%', profit1M: '+0.00%', totalTrades: '0 Trades',
      analysisExplain: 'Strategi pembalikan arah memanfaatkan deviasi ekstrim Bollinger Bands M15/M5 yang selaras dengan tren H4.'
    },
    'XAUUSD': {
      strategyName: 'Volume Profile & H4 Breakout Confirmation',
      winRate: '72.5%', avgRrr: '1:2.7', profit1D: '+0.00%', profit1W: '+0.00%', profit1M: '+0.00%', totalTrades: '0 Trades',
      analysisExplain: 'Analisis berbasis Volume Profile pada area High Volume Node (HVN) emas. Entri M15 diambil searah dengan trend kuat H4/H1.'
    },
    'AAPL': {
      strategyName: 'Gap Fill & Trend Following (EMA 20/50)',
      winRate: '66.8%', avgRrr: '1:2.2', profit1D: '+0.00%', profit1W: '+0.00%', profit1M: '+0.00%', totalTrades: '0 Trades',
      analysisExplain: 'Strategi mengikuti tren utama menggunakan persilangan EMA di timeframe H1 didukung oleh konfirmasi breakout M15.'
    },
    'TSLA': {
      strategyName: 'Volatility Breakout & ADX Momentum',
      winRate: '60.4%', avgRrr: '1:2.6', profit1D: '+0.00%', profit1W: '+0.00%', profit1M: '+0.00%', totalTrades: '0 Trades',
      analysisExplain: 'Breakout volatilitas M15 disaring ADX > 25, hanya mengambil entri saat tren utama H4 Bullish.'
    },
    'BBRI': {
      strategyName: 'Foreign Flow Accumulation & Fibonacci Retracement',
      winRate: '70.2%', avgRrr: '1:2.5', profit1D: '+0.00%', profit1W: '+0.00%', profit1M: '+0.00%', totalTrades: '0 Trades',
      analysisExplain: 'Analisis akumulasi modal asing dipadukan retracement Fibonacci di H1, pemicu entri di M15.'
    },
    'TLKM': {
      strategyName: 'Dividend Yield Accumulation & Support Bounce',
      winRate: '69.0%', avgRrr: '1:2.1', profit1D: '+0.00%', profit1W: '+0.00%', profit1M: '+0.00%', totalTrades: '0 Trades',
      analysisExplain: 'Bot memanfaatkan area jenuh jual (Oversold) pada RSI M15 di dekat area Support psikologis H4.'
    }
  };
  return defaultMap;
}

async function vercelHandler(req, res) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    // Jika Supabase disetup, coba fetch dari Supabase
    if (supabaseUrl && supabaseKey) {
      try {
        const headers = {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        };

        const resTrades = await fetch(`${supabaseUrl}/rest/v1/trades?select=*&order=created_at.desc`, { headers });
        const resLogs = await fetch(`${supabaseUrl}/rest/v1/bot_logs?select=*&order=created_at.desc&limit=50`, { headers });
        const resPerf = await fetch(`${supabaseUrl}/rest/v1/performance?select=*`, { headers });

        if (resTrades.ok && resLogs.ok && resPerf.ok) {
          const trades = await resTrades.json();
          const logs = await resLogs.json();
          const performanceList = await resPerf.json();

          const performance = {};
          performanceList.forEach(item => {
            performance[item.symbol] = {
              strategyName: item.strategy_name,
              winRate: item.win_rate,
              avgRrr: item.avg_rrr,
              profit1D: item.profit_1d,
              profit1W: item.profit_1w,
              profit1M: item.profit_1m,
              totalTrades: item.total_trades,
              analysisExplain: item.analysis_explain
            };
          });

          // Fetch settings
          let settings = {
            minProbability: 70,
            riskRewardRatio: 2.3,
            activeSymbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AAPL', 'TSLA', 'BBRI', 'TLKM']
          };
          try {
            const resSettings = await fetch(`${supabaseUrl}/rest/v1/bot_settings?select=*&limit=1`, { headers });
            if (resSettings.ok) {
              const settingsList = await resSettings.json();
              if (settingsList && settingsList.length > 0) {
                settings = {
                  minProbability: settingsList[0].min_probability,
                  riskRewardRatio: settingsList[0].risk_reward_ratio,
                  activeSymbols: typeof settingsList[0].active_symbols === 'string'
                    ? JSON.parse(settingsList[0].active_symbols)
                    : settingsList[0].active_symbols
                };
              }
            }
          } catch(err) {
            console.warn('Gagal membaca tabel bot_settings:', err.message);
          }

          // Format trades ke botLogs untuk kompatibilitas frontend
          const botLogs = {};
          const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AAPL', 'TSLA', 'BBRI', 'TLKM'];
          symbols.forEach(sym => {
            botLogs[sym] = trades.filter(t => t.symbol === sym);
          });

          return res.status(200).json({
            success: true,
            source: 'supabase',
            trades,
            botLogs,
            logs,
            performance,
            settings
          });
        }
      } catch (e) {
        console.warn('Gagal memuat dari Supabase, beralih ke Lokal:', e.message);
      }
    }

    // Fallback: Membaca database file lokal
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const data = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
      const parsed = JSON.parse(data);

      // Format trades ke botLogs untuk kompatibilitas frontend
      const botLogs = {};
      const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AAPL', 'TSLA', 'BBRI', 'TLKM'];
      symbols.forEach(sym => {
        botLogs[sym] = parsed.trades.filter(t => t.symbol === sym);
      });

      const defaultSettings = {
        minProbability: 70,
        riskRewardRatio: 2.3,
        activeSymbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AAPL', 'TSLA', 'BBRI', 'TLKM']
      };

      return res.status(200).json({
        success: true,
        source: 'local_file',
        trades: parsed.trades,
        botLogs,
        logs: parsed.logs,
        performance: parsed.performance,
        settings: parsed.settings || defaultSettings
      });
    }

    // Default jika file lokal pun belum ada (inisialisasi awal)
    const initialDb = {
      trades: [],
      logs: [
        { id: 1, time: new Date().toLocaleString('id-ID'), text: '[SISTEM] Database siap. Menunggu Cron Job berjalan.' }
      ],
      performance: getDefaultPerformance()
    };

    // Tulis file inisialisasi agar terbuat secara permanen
    try {
      const dir = path.dirname(LOCAL_DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(initialDb, null, 2), 'utf-8');
    } catch (e) {
      console.error('Gagal menginisialisasi file lokal:', e);
    }

    // Format trades ke botLogs
    const botLogs = {};
    const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AAPL', 'TSLA', 'BBRI', 'TLKM'];
    symbols.forEach(sym => {
      botLogs[sym] = [];
    });

    res.status(200).json({
      success: true,
      source: 'initial_default',
      trades: [],
      botLogs,
      logs: initialDb.logs,
      performance: initialDb.performance
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

// Ekspor default untuk Vercel
export default vercelHandler;

// Adapter untuk Netlify Functions
export const handler = async (event, context) => {
  let responseStatusCode = 200;
  let responseBody = {};

  let parsedBody = {};
  try {
    if (event.body) {
      parsedBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    }
  } catch(e) {}

  const req = {
    method: event.httpMethod,
    body: parsedBody
  };

  const res = {
    status: (code) => {
      responseStatusCode = code;
      return res;
    },
    json: (data) => {
      responseBody = data;
      return res;
    }
  };

  await vercelHandler(req, res);

  return {
    statusCode: responseStatusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(responseBody)
  };
};
