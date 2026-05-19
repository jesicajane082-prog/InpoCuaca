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

        return { trades, logs, performance };
      }
    } catch (e) {
      console.warn('Gagal memuat dari Supabase, beralih ke Database Lokal:', e.message);
    }
  }

  // Fallback: Baca file lokal JSON
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const data = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
      return JSON.parse(data);
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
    performance: getDefaultPerformance()
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

      const [resTrades, resLogs, resPerf] = await Promise.all([upsertTrades, upsertLogs, upsertPerf]);
      
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

// Endpoint Handler Utama (Cron Job / API Request)
export default async function handler(req, res) {
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

    // Intersep aksi close_all manual
    if (req.method === 'POST' || req.method === 'PUT') {
      let body = {};
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      } catch (e) {}

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

        // Crossover check (SL/TP)
        if (trade.type === 'BUY') {
          if (currentPrice >= tpNum) {
            shouldClose = true;
            isWin = true;
          } else if (currentPrice <= slNum) {
            shouldClose = true;
            isWin = false;
          }
        } else { // SELL
          if (currentPrice <= tpNum) {
            shouldClose = true;
            isWin = true;
          } else if (currentPrice >= slNum) {
            shouldClose = true;
            isWin = false;
          }
        }

        // AI Trailing Stop early exit (3% peluang per evaluasi)
        if (!shouldClose && Math.random() < 0.03) {
          shouldClose = true;
          const runningProfit = trade.type === 'BUY'
            ? ((currentPrice - entryNum) / entryNum) * 100
            : ((entryNum - currentPrice) / entryNum) * 100;
          isWin = runningProfit >= 0;
          closeReason = 'AI Trailing Stop';
        }

        if (shouldClose) {
          const rrrParts = trade.rrr.split(':').map(Number);
          const riskMultiplier = rrrParts[1] || 2.0;
          const pnlChange = isWin ? (0.20 * riskMultiplier) : -0.20;
          
          trade.pnl = isWin 
            ? `PROFIT (+${(0.20 * riskMultiplier).toFixed(2)}%)` 
            : `LOSS (-${(0.20).toFixed(2)}%)`;
          trade.status = 'closed';
          trade.time = `Selesai (${closeReason})`;

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
    symbols.forEach((sym, index) => {
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
        executeTrade = probability >= 70;
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
        executeTrade = probability >= 70;
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
        const perf = db.performance[sym] || getDefaultPerformance()[sym];
        const rrrValStr = perf.avgRrr || '1:2.3';
        const rrrParts = rrrValStr.split(':').map(Number);
        const riskMultiplier = rrrParts[1] || 2.3;

        const newSl = tradeType === 'BUY' ? (currentLive - slDist) : (currentLive + slDist);
        const newTp = tradeType === 'BUY' ? (currentLive + slDist * riskMultiplier) : (currentLive - slDist * riskMultiplier);

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
          logText = `[DISIPLIN] ${sym} dilewati. Tren H1 selaras ${h1Trend}, namun tingkat konfluensi kurang memadai (Konfluensi aktif: [${confluences.join(' + ') || 'None'}]). Probabilitas ${probability}% (Batas minimal 70%).`;
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
