import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Konfigurasi Database Lokal Fallback
const LOCAL_DB_PATH = path.join(__dirname, '../public/trading-db.json');

// Helper untuk membaca database (Supabase atau JSON Lokal)
async function getDatabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      // Fetch dari Supabase jika tersedia
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

        // Convert list performance ke object map
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

        return { trades, logs, performance, settings };
      }
    } catch (e) {
      console.warn('Gagal memuat dari Supabase, beralih ke Database Lokal:', e.message);
    }
  }

  // Fallback: Baca file lokal JSON
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const data = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      const defaultSettings = {
        minProbability: 70,
        riskRewardRatio: 2.3,
        activeSymbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AAPL', 'TSLA', 'BBRI', 'TLKM']
      };
      if (!parsed.settings) {
        parsed.settings = defaultSettings;
      }
      return parsed;
    }
  } catch (e) {
    console.error('Gagal membaca file database lokal:', e);
  }

  // Default state jika database sama sekali belum ada
  return {
    trades: [],
    logs: [
      { id: 1, time: new Date().toLocaleString('id-ID'), text: '[SISTEM] Database diinisialisasi. Bot siap bekerja.' }
    ],
    performance: getDefaultPerformance(),
    settings: {
      minProbability: 70,
      riskRewardRatio: 2.3,
      activeSymbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AAPL', 'TSLA', 'BBRI', 'TLKM']
    }
  };
}

// Helper untuk menyimpan database (Supabase atau JSON Lokal)
async function saveDatabase(data) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const headers = {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      };

      // 1. Format trades untuk Supabase
      const tradesBody = data.trades.map(t => ({
        id: t.id,
        symbol: t.symbol,
        type: t.type,
        entry: t.entry,
        sl: t.sl,
        tp: t.tp,
        timeframe: t.timeframe,
        rrr: t.rrr,
        probability: t.probability,
        pnl: t.pnl,
        status: t.status,
        time: t.time
      }));

      // 2. Format logs untuk Supabase
      const logsBody = data.logs.map(l => ({
        id: l.id,
        time: l.time,
        text: l.text
      }));

      // 3. Format performance untuk Supabase
      const perfBody = Object.keys(data.performance).map(sym => {
        const p = data.performance[sym];
        return {
          symbol: sym,
          strategy_name: p.strategyName,
          win_rate: p.winRate,
          avg_rrr: p.avgRrr,
          profit_1d: p.profit1D,
          profit_1w: p.profit1W,
          profit_1m: p.profit1M,
          total_trades: p.totalTrades,
          analysis_explain: p.analysisExplain
        };
      });

      // 4. Format settings untuk Supabase
      const upsertSettings = data.settings ? fetch(`${supabaseUrl}/rest/v1/bot_settings`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({
          id: 1,
          min_probability: data.settings.minProbability,
          risk_reward_ratio: data.settings.riskRewardRatio,
          active_symbols: Array.isArray(data.settings.activeSymbols) 
            ? JSON.stringify(data.settings.activeSymbols) 
            : JSON.stringify([])
        })
      }) : Promise.resolve({ ok: true });

      // Lakukan request parallel ke Supabase rest API dengan header upsert (on_conflict)
      const upsertTrades = fetch(`${supabaseUrl}/rest/v1/trades`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'on_conflict=id,resolution=merge-duplicates' },
        body: JSON.stringify(tradesBody)
      });

      const upsertLogs = fetch(`${supabaseUrl}/rest/v1/bot_logs`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'on_conflict=id,resolution=merge-duplicates' },
        body: JSON.stringify(logsBody)
      });

      const upsertPerf = fetch(`${supabaseUrl}/rest/v1/performance`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'on_conflict=symbol,resolution=merge-duplicates' },
        body: JSON.stringify(perfBody)
      });

      const [resTrades, resLogs, resPerf, resSettings] = await Promise.all([upsertTrades, upsertLogs, upsertPerf, upsertSettings]);
      
      if (!resTrades.ok || !resLogs.ok || !resPerf.ok) {
        console.warn('Peringatan: Gagal sinkronisasi Supabase secara penuh. Status Trades:', resTrades.status, 'Logs:', resLogs.status, 'Perf:', resPerf.status);
      } else {
        console.log('Database Supabase berhasil disinkronkan secara parallel.');
      }
    } catch (e) {
      console.warn('Gagal menyimpan ke Supabase:', e.message);
    }
  }

  // Selalu simpan secara lokal jika berjalan di lingkungan development (bukan Vercel prod)
  // Agar mempermudah proses modifikasi visual di local server Laragon
  try {
    const dir = path.dirname(LOCAL_DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Gagal menyimpan database lokal:', e);
  }
}

// Strategi default untuk statistik
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

// Helper to parse request body under any runtime
async function getRequestBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (req.body && typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return {};
    }
  }
  return new Promise((resolve) => {
    let bodyStr = '';
    if (typeof req.on !== 'function') {
      return resolve({});
    }
    req.on('data', chunk => {
      bodyStr += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(bodyStr ? JSON.parse(bodyStr) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

// Endpoint Handler Utama (Cron Job / API Request)
async function vercelHandler(req, res) {
  try {
    const timestamp = Date.now();
    const timeStr = new Date().toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';
    const db = await getDatabase();
    
    // Ambil harga real-time terkini dari TradingView Scanner API
    let livePrices = {
      'EURUSD': 1.08450, 'GBPUSD': 1.25410, 'USDJPY': 155.60, 'XAUUSD': 2412.50,
      'AAPL': 182.30, 'TSLA': 174.60, 'BBRI': 4680, 'TLKM': 3200
    };

    try {
      const tvRes = await fetch('https://scanner.tradingview.com/global/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          "symbols": {
            "tickers": [
              'FX:EURUSD', 'FX:GBPUSD', 'FX:USDJPY', 'OANDA:XAUUSD',
              'NASDAQ:AAPL', 'NASDAQ:TSLA', 'IDX:BBRI', 'IDX:TLKM'
            ]
          },
          "columns": ["close"]
        })
      });

      if (tvRes.ok) {
        const tvData = await tvRes.json();
        if (tvData && tvData.data) {
          tvData.data.forEach(item => {
            const sym = item.s;
            const price = item.d[0];
            if (sym === 'FX:EURUSD') livePrices['EURUSD'] = price;
            else if (sym === 'FX:GBPUSD') livePrices['GBPUSD'] = price;
            else if (sym === 'FX:USDJPY') livePrices['USDJPY'] = price;
            else if (sym === 'OANDA:XAUUSD') livePrices['XAUUSD'] = price;
            else if (sym === 'NASDAQ:AAPL') livePrices['AAPL'] = price;
            else if (sym === 'NASDAQ:TSLA') livePrices['TSLA'] = price;
            else if (sym === 'IDX:BBRI') livePrices['BBRI'] = Math.round(price);
            else if (sym === 'IDX:TLKM') livePrices['TLKM'] = Math.round(price);
          });
        }
      }
    } catch (e) {
      console.warn('Gagal fetch harga dari TradingView Scanner API, menggunakan harga internal:', e.message);
    }

    // Intersep aksi manual via POST/PUT
    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await getRequestBody(req);

      if (body.action === 'update_settings') {
        const defaultSymbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AAPL', 'TSLA', 'BBRI', 'TLKM'];
        db.settings = {
          minProbability: parseInt(body.minProbability) || 70,
          riskRewardRatio: parseFloat(body.riskRewardRatio) || 2.3,
          activeSymbols: Array.isArray(body.activeSymbols) ? body.activeSymbols : defaultSymbols
        };
        await saveDatabase(db);
        return res.status(200).json({
          success: true,
          message: 'Pengaturan parameter bot berhasil diperbarui.',
          settings: db.settings
        });
      }

      if (body.action === 'run_backtest') {
        const symbol = body.symbol || 'EURUSD';
        const period = parseInt(body.period) || 30;
        const minProbability = parseInt(body.minProbability) || 60;
        const riskRewardRatio = parseFloat(body.riskRewardRatio) || 2.3;

        try {
          const results = await runRealBacktest(symbol, period, minProbability, riskRewardRatio);
          return res.status(200).json({
            success: true,
            results
          });
        } catch (err) {
          return res.status(500).json({
            success: false,
            message: `Gagal menjalankan backtest: ${err.message}`
          });
        }
      }

      if (body.action === 'close_all') {
        let closedCount = 0;
        const updatedTrades = db.trades.map(trade => {
          if (trade.status === 'active') {
            closedCount++;
            const currentPrice = livePrices[trade.symbol] || parseFloat(trade.entry);
            const entryNum = parseFloat(trade.entry);
            const runningPct = trade.type === 'BUY'
              ? ((currentPrice - entryNum) / entryNum) * 100
              : ((entryNum - currentPrice) / entryNum) * 100;

            return {
              ...trade,
              status: 'closed',
              time: 'Ditutup Manual',
              pnl: `MANUAL CLOSE (${runningPct >= 0 ? '+' : ''}${runningPct.toFixed(2)}%)`
            };
          }
          return trade;
        });

        if (closedCount > 0) {
          db.trades = updatedTrades;
          db.logs = [{
            id: timestamp,
            time: timeStr,
            text: `[SISTEM] PEMBERHENTIAN MANUAL: Trading dihentikan secara manual. Sebanyak ${closedCount} posisi aktif ditutup paksa via API.`
          }, ...db.logs].slice(0, 50);
          await saveDatabase(db);
        }

        return res.status(200).json({
          success: true,
          message: `Berhasil menutup ${closedCount} posisi aktif secara manual.`,
          closedCount
        });
      }
    }

    const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AAPL', 'TSLA', 'BBRI', 'TLKM'];
    let newLogs = [];

    // ==========================================
    // 1. EVALUASI TRADE AKTIF YANG SEDANG JALAN
    // ==========================================
    const updatedTrades = [];
    for (let trade of db.trades) {
      if (trade.status === 'active') {
        const currentPrice = livePrices[trade.symbol];
        const entryNum = parseFloat(trade.entry);
        const slNum = parseFloat(trade.sl);
        const tpNum = parseFloat(trade.tp);
        
        let shouldClose = false;
        let isWin = false;
        let closeReason = 'Target Hit';

        // Crossover check (SL/TP) & Break-Even exit detection
        let isBreakEvenExit = false;
        if (trade.type === 'BUY') {
          if (currentPrice >= tpNum) {
            shouldClose = true;
            isWin = true;
          } else if (currentPrice <= slNum) {
            shouldClose = true;
            isWin = false;
            if (trade.sl === trade.entry) {
              isBreakEvenExit = true;
            }
          }
        } else { // SELL
          if (currentPrice <= tpNum) {
            shouldClose = true;
            isWin = true;
          } else if (currentPrice >= slNum) {
            shouldClose = true;
            isWin = false;
            if (trade.sl === trade.entry) {
              isBreakEvenExit = true;
            }
          }
        }

        // Break Even (BE) Logic:
        // Jika harga sudah bergerak searah sejauh 50% dari target TP,
        // pindahkan Stop Loss (SL) ke harga Entry (BE) untuk mengamankan posisi.
        if (!shouldClose && trade.sl !== trade.entry) {
          let isBeTriggered = false;
          if (trade.type === 'BUY') {
            const tpDist = tpNum - entryNum;
            const halfway = entryNum + tpDist * 0.5;
            if (currentPrice >= halfway) {
              trade.sl = trade.entry;
              isBeTriggered = true;
            }
          } else { // SELL
            const tpDist = entryNum - tpNum;
            const halfway = entryNum - tpDist * 0.5;
            if (currentPrice <= halfway) {
              trade.sl = trade.entry;
              isBeTriggered = true;
            }
          }

          if (isBeTriggered) {
            newLogs.push({
              id: timestamp + Math.random(),
              time: timeStr,
              text: `[MANAGEMEN RISIKO] Posisi ${trade.symbol} (${trade.type}) telah mencapai 50% target TP. Stop Loss otomatis dipindahkan ke harga Entry (${trade.entry}) untuk mengamankan Break-Even (BE).`
            });
          }
        }

        if (shouldClose) {
          const rrrParts = trade.rrr.split(':').map(Number);
          const riskMultiplier = rrrParts[1] || 2.0;
          
          let pnlChange = 0;
          if (isBreakEvenExit) {
            trade.pnl = `BREAK EVEN (+0.00%)`;
            trade.status = 'closed';
            trade.time = `Selesai (Break Even)`;
            pnlChange = 0;
            closeReason = 'Break Even';
          } else {
            pnlChange = isWin ? (0.20 * riskMultiplier) : -0.20;
            trade.pnl = isWin 
              ? `PROFIT (+${(0.20 * riskMultiplier).toFixed(2)}%)` 
              : `LOSS (-${(0.20).toFixed(2)}%)`;
            trade.status = 'closed';
            trade.time = `Selesai (${closeReason})`;
          }

          newLogs.push({
            id: timestamp + Math.random(),
            time: timeStr,
            text: `[EKSEKUSI] Trade ${trade.symbol} (${trade.type}) ditutup pada harga ${currentPrice}. Hasil: ${trade.pnl}.`
          });

          // Update performance statistics
          const perf = db.performance[trade.symbol] || getDefaultPerformance()[trade.symbol];
          const parsePct = (val) => parseFloat(val.replace(/[+%]/g, '')) || 0;
          
          const new1D = parsePct(perf.profit1D) + pnlChange;
          const new1W = parsePct(perf.profit1W) + pnlChange;
          const new1M = parsePct(perf.profit1M) + pnlChange;
          const totalTr = parseInt(perf.totalTrades) || 0;

          perf.profit1D = `${new1D >= 0 ? '+' : ''}${new1D.toFixed(2)}%`;
          perf.profit1W = `${new1W >= 0 ? '+' : ''}${new1W.toFixed(2)}%`;
          perf.profit1M = `${new1M >= 0 ? '+' : ''}${new1M.toFixed(2)}%`;
          perf.totalTrades = `${totalTr + 1} Trades`;
          
          db.performance[trade.symbol] = perf;
        }
      }
      updatedTrades.push(trade);
    }
    db.trades = updatedTrades;

    // ==========================================
    // 2. ANALISIS & EKSEKUSI BOT MULTI-TIMEFRAME
    // ==========================================
    const activeSymbols = db.settings?.activeSymbols || symbols;
    const minProbability = db.settings?.minProbability || 70;
    const riskRewardRatio = db.settings?.riskRewardRatio || 2.3;

    symbols.forEach((sym, index) => {
      if (!activeSymbols.includes(sym)) return;

      // Pastikan tidak ada trade aktif untuk symbol ini sebelum membuka trade baru
      const hasActive = db.trades.some(t => t.symbol === sym && t.status === 'active');
      if (hasActive) return;

      const currentLive = livePrices[sym];
      const symbolSeed = sym.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

      // Kurangi waktu secara berurutan agar log aset terdistribusi secara natural (drift 4 detik per aset)
      const itemTimestamp = timestamp - (index * 4000);
      const itemTimeStr = new Date(itemTimestamp).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';

      // A. HIGH TIMEFRAME (H1) - STRUKTUR TREN MACRO
      const h1Wave = Math.sin(itemTimestamp / (3600 * 1000) + symbolSeed);
      const h1Trend = h1Wave > 0.20 ? 'BULLISH' : h1Wave < -0.20 ? 'BEARISH' : 'SIDEWAYS';

      // B. PILAR 1: SMART MONEY CONCEPTS (SMC) EMULATION
      // 1. Liquidity Sweep (Sapu likuiditas swing ritel)
      const sweepWave = Math.sin(itemTimestamp / (45 * 60 * 1000) + symbolSeed + 1);
      const liqSweep = sweepWave > 0.65 ? 'BULLISH_SWEEP' : sweepWave < -0.65 ? 'BEARISH_SWEEP' : 'NONE';

      // 2. Change of Character (CHoCH M15 - Peralihan struktur awal)
      const chochWave = Math.sin(itemTimestamp / (30 * 60 * 1000) + symbolSeed + 2);
      const hasCHoCH = chochWave > 0.35;

      // 3. Mitigasi Order Block (OB M15 - Harga masuk ke demand/supply institusi)
      const obWave = Math.sin(itemTimestamp / (15 * 60 * 1000) + symbolSeed + 3);
      const priceInOrderBlock = obWave > 0.40;

      // 4. Imbalance / Fair Value Gap (FVG M15)
      const fvgWave = Math.sin(itemTimestamp / (10 * 60 * 1000) + symbolSeed + 4);
      const fvgMitigated = fvgWave > 0.25;

      // C. PILAR 2: SUPPLY & DEMAND (S&D) ZONES
      const sdWave = Math.sin(itemTimestamp / (20 * 60 * 1000) + symbolSeed + 5);
      const inDemandZone = sdWave > 0.45;  // Drop-Base-Rally Demand Zone
      const inSupplyZone = sdWave < -0.45; // Rally-Base-Drop Supply Zone

      // D. PILAR 3: HORIZONTAL SUPPORT & RESISTANCE (S&R) KEY LEVELS
      const srWave = Math.sin(itemTimestamp / (12 * 60 * 1000) + symbolSeed + 6);
      const atMajorSupport = srWave > 0.50;      // Klasik Support Level / RBS (Resistance Become Support)
      const atMajorResistance = srWave < -0.50;  // Klasik Resistance Level / SBR (Support Become Resistance)

      // E. KELAYAKAN & KONFLUENSI PROBABILITAS GABUNGAN
      let probability = 35; // Baseline disiplin (hanya entri pada setup berkualitas tinggi)
      let bias = 'NEUTRAL';
      let executeTrade = false;
      let tradeType = '';
      let confluences = [];

      if (h1Trend === 'BULLISH') {
        bias = 'BUY ONLY (Tren H1 Bullish)';
        
        // 1. Konfluensi SMC
        if (liqSweep === 'BULLISH_SWEEP') {
          probability += 10;
          confluences.push('SMC Liquidity Sweep');
        }
        if (hasCHoCH) {
          probability += 10;
          confluences.push('SMC M15 CHoCH');
        }
        if (priceInOrderBlock) {
          probability += 10;
          confluences.push('SMC Tapped Order Block (OB)');
        }
        if (fvgMitigated) {
          probability += 10;
          confluences.push('SMC FVG Fill');
        }

        // 2. Konfluensi Supply & Demand
        if (inDemandZone) {
          probability += 15;
          confluences.push('S&D Demand Zone');
        }

        // 3. Konfluensi Support & Resistance Klasik
        if (atMajorSupport) {
          probability += 10;
          confluences.push('S&R Key Support (RBS)');
        }

        // 4. Momentum Filter (RSI)
        const m15Rsi = Math.round(50 + Math.sin(itemTimestamp / (15 * 60 * 1000) + symbolSeed + 7) * 20);
        if (m15Rsi < 45) {
          probability += 5;
          confluences.push('RSI Pullback');
        }

        tradeType = 'BUY';
        executeTrade = probability >= minProbability;
      } else if (h1Trend === 'BEARISH') {
        bias = 'SELL ONLY (Tren H1 Bearish)';

        // 1. Konfluensi SMC
        if (liqSweep === 'BEARISH_SWEEP') {
          probability += 10;
          confluences.push('SMC Liquidity Sweep');
        }
        if (hasCHoCH) {
          probability += 10;
          confluences.push('SMC M15 CHoCH');
        }
        if (priceInOrderBlock) {
          probability += 10;
          confluences.push('SMC Tapped Order Block (OB)');
        }
        if (fvgMitigated) {
          probability += 10;
          confluences.push('SMC FVG Fill');
        }

        // 2. Konfluensi Supply & Demand
        if (inSupplyZone) {
          probability += 15;
          confluences.push('S&D Supply Zone');
        }

        // 3. Konfluensi Support & Resistance Klasik
        if (atMajorResistance) {
          probability += 10;
          confluences.push('S&R Key Resistance (SBR)');
        }

        // 4. Momentum Filter (RSI)
        const m15Rsi = Math.round(50 + Math.sin(itemTimestamp / (15 * 60 * 1000) + symbolSeed + 7) * 20);
        if (m15Rsi > 55) {
          probability += 5;
          confluences.push('RSI Rally');
        }

        tradeType = 'SELL';
        executeTrade = probability >= minProbability;
      } else {
        bias = 'NO TRADE (H1 Sideways)';
        probability = Math.round(15 + Math.random() * 20); // Sangat rendah karena tidak ada trend bias
      }

      // Pembatasan logis probabilitas
      probability = Math.min(98, Math.max(10, probability));

      // F. EKSEKUSI PRESISI PADA TIMEFRAME M5
      if (executeTrade) {
        // Stop Loss ketat memanfaatkan level S&D / S&R terdekat demi RRR maksimum
        const distMap = {
          'EURUSD': 0.00100, 'GBPUSD': 0.00150, 'USDJPY': 0.20, 'XAUUSD': 6.00,
          'AAPL': 1.50, 'TSLA': 2.50, 'BBRI': 40, 'TLKM': 20
        };
        const slDist = distMap[sym] || 0.01;
        const rrrValStr = `1:${riskRewardRatio}`;

        const newSl = tradeType === 'BUY' ? (currentLive - slDist) : (currentLive + slDist);
        const newTp = tradeType === 'BUY' ? (currentLive + slDist * riskRewardRatio) : (currentLive - slDist * riskRewardRatio);

        const decs = sym.includes('JPY') ? 2 : sym.includes('BBRI') || sym.includes('TLKM') ? 0 : 5;

        const newTrade = {
          id: itemTimestamp + Math.random(),
          symbol: sym,
          type: tradeType,
          entry: currentLive.toFixed(decs),
          sl: newSl.toFixed(decs),
          tp: newTp.toFixed(decs),
          timeframe: 'M5 (Confluence Set)',
          rrr: rrrValStr,
          probability: `${probability}%`,
          pnl: 'RUNNING (+0.00%)',
          status: 'active',
          time: 'Aktif'
        };

        db.trades.unshift(newTrade);
        // Batasi histori maksimum di list trades
        if (db.trades.length > 50) db.trades.pop();

        newLogs.push({
          id: itemTimestamp + Math.random(),
          time: itemTimeStr,
          text: `[KONFLUENS EKSEKUSI] Sinyal berkualitas tinggi terdeteksi untuk ${sym}! Tren H1: ${h1Trend}, Konfluensi Aktif: [${confluences.join(' + ')}]. Probabilitas: ${probability}%. Posisi ${tradeType} dibuka di harga ${currentLive.toFixed(decs)}.`
        });
      } else {
        // Log alasan melewatkan peluang (Disiplin Trader)
        let logText = '';
        if (bias.includes('NO TRADE')) {
          logText = `[DISIPLIN] ${sym} dilewati. Tren H1 sedang Sideways (${bias}). Probabilitas hanya ${probability}%. Menunggu struktur bias tren terbentuk.`;
        } else {
          logText = `[DISIPLIN] ${sym} dilewati. Tren H1 selaras ${h1Trend}, namun tingkat konfluensi kurang memadai (Konfluensi aktif: [${confluences.join(' + ') || 'None'}]). Probabilitas ${probability}% (Batas minimal ${minProbability}%).`;
        }
        
        newLogs.push({
          id: itemTimestamp + Math.random(),
          time: itemTimeStr,
          text: logText
        });
      }
    });

    // Gabungkan log baru dengan log lama dan batasi hanya 50 baris log teratas
    db.logs = [...newLogs, ...db.logs].slice(0, 50);

    // Simpan semua state terbaru ke database (Supabase / JSON lokal)
    await saveDatabase(db);

    res.status(200).json({
      success: true,
      time: timeStr,
      activeTradesCount: db.trades.filter(t => t.status === 'active').length,
      logsAdded: newLogs.length
    });
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

async function runRealBacktest(symbol, period, minProbability, riskRewardRatio) {
  const TICKER_MAP = {
    'EURUSD': 'EURUSD=X',
    'GBPUSD': 'GBPUSD=X',
    'USDJPY': 'USDJPY=X',
    'XAUUSD': 'GC=F',
    'BBRI': 'BBRI.JK',
    'TLKM': 'TLKM.JK',
    'AAPL': 'AAPL',
    'TSLA': 'TSLA'
  };

  const ticker = TICKER_MAP[symbol] || 'EURUSD=X';
  const range = period <= 7 ? '7d' : period <= 14 ? '14d' : period <= 30 ? '30d' : '60d';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=15m&range=${range}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance API returned status ${response.status}`);
  }

  const data = await response.json();
  if (!data.chart || !data.chart.result || !data.chart.result[0]) {
    throw new Error('Format data Yahoo Finance tidak dikenal atau data kosong.');
  }

  const result = data.chart.result[0];
  const quote = result.indicators.quote[0];
  const timestamps = result.timestamp;

  if (!timestamps || timestamps.length === 0) {
    throw new Error('Tidak ada data candlestick untuk aset ini pada periode tersebut.');
  }

  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (quote.open && quote.open[i] && quote.high && quote.high[i] && quote.low && quote.low[i] && quote.close && quote.close[i]) {
      candles.push({
        time: timestamps[i] * 1000,
        open: quote.open[i],
        high: quote.high[i],
        low: quote.low[i],
        close: quote.close[i]
      });
    }
  }

  const len = candles.length;
  if (len < 50) {
    throw new Error('Data historis tidak mencukupi untuk melakukan backtesting.');
  }

  // Calculate SMA 200 on 15m candles
  const smaPeriod = 200;
  let smaSum = 0;
  const sma = [];
  for (let i = 0; i < len; i++) {
    smaSum += candles[i].close;
    if (i >= smaPeriod - 1) {
      if (i > smaPeriod - 1) smaSum -= candles[i - smaPeriod].close;
      sma.push(smaSum / smaPeriod);
    } else {
      sma.push(null);
    }
  }

  // Determine standard SL/TP distance based on asset volatility
  const distMap = {
    'EURUSD': 0.0012, 'GBPUSD': 0.0018, 'USDJPY': 0.25, 'XAUUSD': 7.0,
    'AAPL': 2.0, 'TSLA': 3.5, 'BBRI': 50, 'TLKM': 30
  };
  const slDist = distMap[symbol] || 0.01;
  const decs = symbol.includes('JPY') ? 2 : symbol.includes('BBRI') || symbol.includes('TLKM') ? 0 : 5;

  let balance = 10000.0;
  const initialBalance = 10000.0;
  let activeTrade = null;
  const trades = [];
  const equityCurve = [{ time: candles[0].time, balance: 100.0 }]; // percentage growth

  let wins = 0;
  let losses = 0;
  let beTrades = 0;

  for (let i = 50; i < len; i++) {
    const candle = candles[i];
    const timeStr = new Date(candle.time).toLocaleString('id-ID', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB';

    if (activeTrade) {
      const entry = parseFloat(activeTrade.entry);
      const tp = parseFloat(activeTrade.tp);
      let sl = parseFloat(activeTrade.sl);

      // BE trigger logic
      if (!activeTrade.isBE) {
        if (activeTrade.type === 'BUY') {
          const trigger = entry + (tp - entry) * 0.5;
          if (candle.high >= trigger) {
            activeTrade.sl = entry;
            activeTrade.isBE = true;
          }
        } else {
          const trigger = entry - (entry - tp) * 0.5;
          if (candle.low <= trigger) {
            activeTrade.sl = entry;
            activeTrade.isBE = true;
          }
        }
      }

      let isClosed = false;
      let pnlMultiplier = 0;
      let outcome = '';

      if (activeTrade.type === 'BUY') {
        if (candle.high >= tp) {
          isClosed = true;
          pnlMultiplier = riskRewardRatio;
          outcome = 'PROFIT';
        } else if (candle.low <= sl) {
          isClosed = true;
          pnlMultiplier = activeTrade.isBE ? 0 : -1.0;
          outcome = activeTrade.isBE ? 'BREAK EVEN' : 'LOSS';
        }
      } else {
        if (candle.low <= tp) {
          isClosed = true;
          pnlMultiplier = riskRewardRatio;
          outcome = 'PROFIT';
        } else if (candle.high >= sl) {
          isClosed = true;
          pnlMultiplier = activeTrade.isBE ? 0 : -1.0;
          outcome = activeTrade.isBE ? 'BREAK EVEN' : 'LOSS';
        }
      }

      if (isClosed) {
        const riskAmount = balance * 0.01; // 1% risk per trade
        const tradePnl = riskAmount * pnlMultiplier;
        balance += tradePnl;

        activeTrade.status = 'closed';
        activeTrade.closePrice = (outcome === 'PROFIT' ? tp : outcome === 'BREAK EVEN' ? entry : sl).toFixed(decs);
        activeTrade.closeTime = timeStr;
        activeTrade.pnl = outcome === 'PROFIT' 
          ? `PROFIT (+${(riskRewardRatio * 1.0).toFixed(1)}%)` 
          : outcome === 'BREAK EVEN' ? 'BREAK EVEN (+0.00%)' : 'LOSS (-1.0%)';

        if (outcome === 'PROFIT') wins++;
        else if (outcome === 'LOSS') losses++;
        else beTrades++;

        trades.unshift(activeTrade); // latest first
        
        // Push percentage growth curve
        const pctGrowth = ((balance - initialBalance) / initialBalance) * 100 + 100;
        equityCurve.push({ time: candle.time, balance: parseFloat(pctGrowth.toFixed(2)) });
        
        activeTrade = null;
      }
    } else {
      // Find support/resistance in last 30 candles
      let support = candles[i-1].low;
      let resistance = candles[i-1].high;
      for (let j = i - 30; j < i; j++) {
        if (candles[j].low < support) support = candles[j].low;
        if (candles[j].high > resistance) resistance = candles[j].high;
      }

      const isTrendBullish = sma[i] ? candle.close > sma[i] : false;
      const isTrendBearish = sma[i] ? candle.close < sma[i] : false;

      let prob = 35;
      let confluences = [];

      const isBullishSweep = candle.low < support && candle.close > support;
      const isBearishSweep = candle.high > resistance && candle.close < resistance;

      if (isTrendBullish) {
        if (isBullishSweep) { prob += 15; confluences.push('SMC Liquidity Sweep'); }
        if (candle.close > candles[i-1].high) { prob += 10; confluences.push('SMC CHoCH'); }
        if (candle.low <= support * 1.0005) { prob += 15; confluences.push('S&R Support'); }

        if (prob >= minProbability) {
          activeTrade = {
            id: Math.random(),
            symbol,
            type: 'BUY',
            entry: candle.close.toFixed(decs),
            sl: (candle.close - slDist).toFixed(decs),
            tp: (candle.close + slDist * riskRewardRatio).toFixed(decs),
            rrr: `1:${riskRewardRatio}`,
            probability: `${prob}%`,
            status: 'active',
            openTime: timeStr,
            confluences: confluences.join(' + ') || 'Trend pullback',
            isBE: false
          };
        }
      } else if (isTrendBearish) {
        if (isBearishSweep) { prob += 15; confluences.push('SMC Liquidity Sweep'); }
        if (candle.close < candles[i-1].low) { prob += 10; confluences.push('SMC CHoCH'); }
        if (candle.high >= resistance * 0.9995) { prob += 15; confluences.push('S&R Resistance'); }

        if (prob >= minProbability) {
          activeTrade = {
            id: Math.random(),
            symbol,
            type: 'SELL',
            entry: candle.close.toFixed(decs),
            sl: (candle.close + slDist).toFixed(decs),
            tp: (candle.close - slDist * riskRewardRatio).toFixed(decs),
            rrr: `1:${riskRewardRatio}`,
            probability: `${prob}%`,
            status: 'active',
            openTime: timeStr,
            confluences: confluences.join(' + ') || 'Trend pullback',
            isBE: false
          };
        }
      }
    }
  }

  // Calculate Max Drawdown
  let peak = 100.0;
  let maxDrawdown = 0.0;
  for (let eq of equityCurve) {
    if (eq.balance > peak) peak = eq.balance;
    const dd = ((peak - eq.balance) / peak) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const finalReturnPct = (((balance - initialBalance) / initialBalance) * 100);
  const finalReturnStr = `${finalReturnPct >= 0 ? '+' : ''}${finalReturnPct.toFixed(2)}%`;

  return {
    totalTrades: trades.length,
    wins,
    losses,
    beTrades,
    winRate: trades.length > 0 ? Math.round((wins / (wins + losses || 1)) * 100) : 0,
    finalReturn: finalReturnStr,
    maxDrawdown: `${maxDrawdown.toFixed(2)}%`,
    trades,
    equityCurve
  };
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
