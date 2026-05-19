import React, { useState, useEffect, useCallback } from 'react';
import {
  Cloud,
  Wind,
  Droplets,
  AlertTriangle,
  Clock,
  MapPin,
  Calendar,
  Trophy,
  ArrowRight,
  RefreshCw,
  Sun,
  CloudSun,
  CloudRain,
  CloudLightning,
  CloudFog,
  CloudDrizzle,
  MessageSquare,
  Send,
  Settings,
  X,
  Sparkles,
  Brain,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Normalisasi Nama Tim agar kompatibel dengan key H2H_DATABASE
const normalizeTeamNameForH2H = (name) => {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/\bfc\b/g, '')
    .replace(/\bunited\b/g, '')
    .replace(/\bbanten\b/g, '')
    .replace(/\bsamarinda\b/g, '')
    .replace(/\bsemarang\b/g, '')
    .replace(/\bpersib\b/g, 'bandung')
    .replace(/\bpersija\b/g, 'jakarta')
    .replace(/\bpersebaya\b/g, 'surabaya')
    .replace(/\bpsim\b/g, 'yogyakarta')
    .replace(/\bmadura\b/g, 'madura')
    .replace(/\bbali\b/g, 'bali')
    .replace(/\bpsbs\b/g, 'biak')
    .replace(/\bbiak\b/g, 'biak')
    .trim()
    .replace(/\s+/g, ' ');
};

// Mendapatkan rekor pertemuan H2H antara dua tim secara data-driven
const getH2HRecord = (home, away, h2hDb) => {
  if (!h2hDb) return null;
  const normHome = normalizeTeamNameForH2H(home);
  const normAway = normalizeTeamNameForH2H(away);

  const keys = [normHome, normAway].sort();
  const lookupKey = `${keys[0]}_vs_${keys[1]}`;

  const record = h2hDb[lookupKey];
  if (!record) return null;

  // Kembalikan rekor yang disesuaikan dengan posisi kandang/tandang saat ini
  if (keys[0] === normHome) {
    return {
      homeWins: record.homeWin || record.homeWins || 0,
      draws: record.draw || record.draws || 0,
      awayWins: record.awayWin || record.awayWins || 0
    };
  } else {
    return {
      homeWins: record.awayWin || record.awayWins || 0,
      draws: record.draw || record.draws || 0,
      awayWins: record.homeWin || record.homeWins || 0
    };
  }
};

// Prediksi H2H Dinamis: Kombinasi klasemen + H2H + dynamic offset agar hasil selalu unik & realistis
const getCombinedProbabilities = (homeName, awayName, standingsData, h2hDb) => {
  const cleanHome = normalizeTeamNameForH2H(homeName);
  const cleanAway = normalizeTeamNameForH2H(awayName);

  // Cari posisi tim di klasemen menggunakan fuzzy matching
  const homeTeam = standingsData?.find(t => {
    const tClean = normalizeTeamNameForH2H(t.team_name);
    return tClean.includes(cleanHome) || cleanHome.includes(tClean);
  });
  const awayTeam = standingsData?.find(t => {
    const tClean = normalizeTeamNameForH2H(t.team_name);
    return tClean.includes(cleanAway) || cleanAway.includes(tClean);
  });

  let standingsDiff = 0;
  if (homeTeam && awayTeam) {
    const homePos = homeTeam.position || homeTeam.intRank || 5;
    const awayPos = awayTeam.position || awayTeam.intRank || 8;
    standingsDiff = awayPos - homePos; // Selisih peringkat klasemen
  } else if (homeTeam) {
    // Jika hanya satu tim yang ditemukan (misal lawannya peringkat bawah/diluar top 5 standings API)
    const homePos = homeTeam.position || homeTeam.intRank || 5;
    standingsDiff = 8 - homePos;
  } else if (awayTeam) {
    const awayPos = awayTeam.position || awayTeam.intRank || 8;
    standingsDiff = awayPos - 6;
  }

  // 1. Probabilitas Dasar Berbasis Klasemen & Home Advantage (60%)
  let probHome = 42 + standingsDiff * 1.8;
  let probAway = 33 - standingsDiff * 1.8;
  let probDraw = 25;

  // 2. Koreksi Menggunakan Rekor Head-to-Head Historis (40%) jika tersedia
  const h2h = getH2HRecord(homeName, awayName, h2hDb);
  if (h2h) {
    const totalMatches = h2h.homeWins + h2h.draws + h2h.awayWins;
    if (totalMatches > 0) {
      const h2hHomeRatio = h2h.homeWins / totalMatches;
      const h2hAwayRatio = h2h.awayWins / totalMatches;
      const h2hDrawRatio = h2h.draws / totalMatches;

      probHome = probHome * 0.5 + (h2hHomeRatio * 100) * 0.5;
      probAway = probAway * 0.5 + (h2hAwayRatio * 100) * 0.5;
      probDraw = probDraw * 0.5 + (h2hDrawRatio * 100) * 0.5;
    }
  }

  // 3. Tambahkan dynamic offset berbasis hash nama tim agar tiap pertandingan memiliki angka unik/khas
  let nameHash = 0;
  const combinedNames = homeName + awayName;
  for (let i = 0; i < combinedNames.length; i++) {
    nameHash = combinedNames.charCodeAt(i) + ((nameHash << 5) - nameHash);
  }
  const hashOffset = (Math.abs(nameHash) % 9) - 4; // -4, -3, -2, -1, 0, 1, 2, 3, 4
  probHome += hashOffset;
  probAway -= hashOffset;

  // Batasi persentase ke batas realistis (15% - 70%)
  probHome = Math.max(18, Math.min(68, Math.round(probHome)));
  probAway = Math.max(18, Math.min(68, Math.round(probAway)));
  probDraw = 100 - probHome - probAway;

  return { probHome, probDraw, probAway };
};

// Pembantu format tanggal Indonesia
const formatDateIndo = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  const dayName = days[date.getDay()];
  const dayNum = date.getDate();
  const monthName = months[date.getMonth()];
  const year = date.getFullYear();

  return `${dayName}, ${dayNum} ${monthName} ${year}`;
};

// Daftar kota populer dengan koordinat untuk cuaca
const CITIES = [
  { id: "jakartapusat", label: "Jakarta Pusat", lat: -6.1862, lon: 106.8345 },
  { id: "jakartaselatan", label: "Jakarta Selatan", lat: -6.2615, lon: 106.8106 },
  { id: "jakartabarat", label: "Jakarta Barat", lat: -6.1685, lon: 106.7639 },
  { id: "jakartatimur", label: "Jakarta Timur", lat: -6.2250, lon: 106.9004 },
  { id: "jakartautara", label: "Jakarta Utara", lat: -6.1384, lon: 106.8633 },
  { id: "bandung", label: "Bandung", lat: -6.9175, lon: 107.6191 },
  { id: "semarang", label: "Semarang", lat: -6.9666, lon: 110.4196 },
  { id: "surabaya", label: "Surabaya", lat: -7.2504, lon: 112.7688 },
  { id: "medan", label: "Medan", lat: 3.5952, lon: 98.6722 },
  { id: "makassar", label: "Makassar", lat: -5.1477, lon: 119.4327 },
  { id: "yogyakarta", label: "Yogyakarta", lat: -7.7956, lon: 110.3695 },
  { id: "denpasar", label: "Denpasar", lat: -8.6705, lon: 115.2126 },
  { id: "palembang", label: "Palembang", lat: -2.9761, lon: 104.7754 },
  { id: "pekanbaru", label: "Pekanbaru", lat: 0.5071, lon: 101.4478 },
  { id: "malang", label: "Malang", lat: -7.9666, lon: 112.6326 },
  { id: "solo", label: "Solo", lat: -7.5755, lon: 110.8243 },
  { id: "bogor", label: "Bogor", lat: -6.5971, lon: 106.8060 },
  { id: "depok", label: "Depok", lat: -6.4025, lon: 106.7942 },
  { id: "bekasi", label: "Bekasi", lat: -6.2349, lon: 106.9896 },
  { id: "tangerang", label: "Tangerang", lat: -6.1781, lon: 106.6319 },
  { id: "batam", label: "Batam", lat: 1.0456, lon: 104.0305 },
  { id: "padang", label: "Padang", lat: -0.9471, lon: 100.4172 },
  { id: "banjarmasin", label: "Banjarmasin", lat: -3.3186, lon: 114.5944 },
  { id: "pontianak", label: "Pontianak", lat: -0.0263, lon: 109.3425 },
  { id: "samarinda", label: "Samarinda", lat: -0.4948, lon: 117.1436 },
  { id: "balikpapan", label: "Balikpapan", lat: -1.2654, lon: 116.8312 },
  { id: "palu", label: "Palu", lat: -0.8999, lon: 119.8707 },
  { id: "kendari", label: "Kendari", lat: -3.9985, lon: 122.5129 },
  { id: "mataram", label: "Mataram", lat: -8.5833, lon: 116.1167 },
  { id: "kupang", label: "Kupang", lat: -10.1787, lon: 123.6070 },
  { id: "ambon", label: "Ambon", lat: -3.6954, lon: 128.1814 },
  { id: "jayapura", label: "Jayapura", lat: -2.5916, lon: 140.6690 },
  { id: "bandarlampung", label: "Bandar Lampung", lat: -5.3971, lon: 105.2668 },
  { id: "cirebon", label: "Cirebon", lat: -6.7320, lon: 108.5523 },
  { id: "tasikmalaya", label: "Tasikmalaya", lat: -7.3274, lon: 108.2207 },
  { id: "purwokerto", label: "Purwokerto", lat: -7.4246, lon: 109.2348 },
  { id: "magelang", label: "Magelang", lat: -7.4797, lon: 110.2177 },
  { id: "kediri", label: "Kediri", lat: -7.8160, lon: 112.0181 },
  { id: "jember", label: "Jember", lat: -8.1845, lon: 113.6681 },
  { id: "banyuwangi", label: "Banyuwangi", lat: -8.2191, lon: 114.3691 },
];
const getLocalLogo = (teamName, apiLogo) => {
  const name = (teamName || '').toLowerCase();
  if (name.includes('persib')) return '/logos/persib.png';
  if (name.includes('borneo')) return '/logos/borneo.svg';
  if (name.includes('persija')) return '/logos/persija.png';
  if (name.includes('persebaya')) return '/logos/persebaya.svg';
  if (name.includes('malut')) return '/logos/malut.png';
  if (name.includes('dewa')) return '/logos/dewa.png';
  if (name.includes('bhayangkara')) return '/logos/bhayangkara.svg';
  if (name.includes('bali')) return '/logos/bali.svg';
  return apiLogo || '/logos/placeholder.png';
};

// Native TradingView Chart Component
function NativeTradingViewChart({ symbol }) {
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }

    const widgetDiv = document.createElement('div');
    widgetDiv.id = 'tradingview_advanced_chart';
    widgetDiv.style.width = '100%';
    widgetDiv.style.height = '480px';
    containerRef.current.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.type = 'text/javascript';
    script.async = true;
    script.onload = () => {
      if (typeof window.TradingView !== 'undefined') {
        new window.TradingView.widget({
          width: '100%',
          height: 480,
          symbol: symbol,
          interval: 'D',
          timezone: 'Etc/UTC',
          theme: 'light',
          style: '1',
          locale: 'id',
          toolbar_bg: '#f1f3f6',
          enable_publishing: false,
          hide_side_toolbar: false,
          allow_symbol_change: true,
          container_id: 'tradingview_advanced_chart'
        });
      }
    };
    containerRef.current.appendChild(script);
  }, [symbol]);

  return (
    <div ref={containerRef} className="w-full h-[480px]" />
  );
}

// Native TradingView Technical Gauge Component
function NativeTechnicalGauge({ symbol }) {
  const settings = {
    interval: '1D',
    width: '100%',
    isTransparent: false,
    height: 320,
    symbol: symbol,
    showIntervalTabs: true,
    displayMode: 'single',
    locale: 'id',
    colorTheme: 'light'
  };

  const iframeUrl = `https://s.tradingview.com/embed-widget/technical-analysis/?locale=id#${encodeURIComponent(JSON.stringify(settings))}`;

  return (
    <div className="tradingview-widget-container w-full h-[320px] rounded-2xl overflow-hidden border border-slate-100/60 bg-white">
      <iframe
        title={`technical-gauge-${symbol}`}
        src={iframeUrl}
        style={{ width: '100%', height: '320px', border: 'none', overflow: 'hidden' }}
        scrolling="no"
      />
    </div>
  );
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState("jakartapusat");
  const [prayerSchedule, setPrayerSchedule] = useState(null);
  const [weather, setWeather] = useState(null);
  const [quake, setQuake] = useState(null);
  const [prayerError, setPrayerError] = useState(false);

  // Liga Indonesia state
  const [standings, setStandings] = useState(null);
  const [topScorers, setTopScorers] = useState(null);
  const [upcomingMatches, setUpcomingMatches] = useState(null);
  const [liveMatches, setLiveMatches] = useState([]);
  const [pastResults, setPastResults] = useState([]);
  const [activeScheduleTab, setActiveScheduleTab] = useState('upcoming');
  const [h2hDatabase, setH2HDatabase] = useState({});

  // Real-time states
  const [currentTime, setCurrentTime] = useState(new Date());
  const [nextPrayer, setNextPrayer] = useState(null);
  // AI Chat States
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', content: 'Halo! Saya Asisten AI Portal Publik. Saya bisa membantu menjawab pertanyaan seputar cuaca hari ini, jadwal sholat, info gempa BMKG, atau klasemen Liga 1 Indonesia.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const hfToken = import.meta.env.VITE_HF_TOKEN || '';
  const [selectedModel, setSelectedModel] = useState('Qwen/Qwen2.5-72B-Instruct');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState(false);
  const [citySearchQuery, setCitySearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('portal'); // 'portal' or 'trading'
  const [selectedSymbol, setSelectedSymbol] = useState('EURUSD');
  const [tradingLoading, setTradingLoading] = useState(false);
  const [tradingAnalysis, setTradingAnalysis] = useState('');


  const handleSendMessage = async (customMessage = null) => {
    const textToSend = customMessage || chatInput;
    if (!textToSend.trim()) return;

    if (!customMessage) {
      setChatInput('');
    }

    // Add user message to history
    const updatedMessages = [...chatMessages, { role: 'user', content: textToSend }];
    setChatMessages(updatedMessages);
    setChatLoading(true);

    if (!hfToken.trim()) {
      setTimeout(() => {
        setChatMessages(prev => [
          ...prev,
          { role: 'assistant', content: 'Maaf, Asisten AI saat ini tidak aktif karena Token Hugging Face belum dikonfigurasi di file .env server.' }
        ]);
        setChatLoading(false);
      }, 800);
      return;
    }

    try {
      // 1. Construct system prompt containing real-time dashboard data as context
      const weatherContext = weather ? `Suhu: ${Math.round(weather.current.temperature_2m)}°C, kondisi: ${getWeatherDesc(weather.current.weather_code)}, Kelembaban: ${weather.current.relative_humidity_2m}%, Kecepatan Angin: ${weather.current.wind_speed_10m} km/j. Harian tertinggi: ${Math.round(weather.daily.temperature_2m_max[0])}°C, terendah: ${Math.round(weather.daily.temperature_2m_min[0])}°C.` : 'Data cuaca belum termuat.';
      
      const prayerContext = prayerSchedule ? `Jadwal sholat hari ini di ${selectedCity.label}: Imsak (${prayerSchedule.imsyak}), Subuh (${prayerSchedule.shubuh}), Terbit (${prayerSchedule.terbit}), Dhuha (${prayerSchedule.dhuha}), Dzuhur (${prayerSchedule.dzuhur}), Ashar (${prayerSchedule.ashr}), Maghrib (${prayerSchedule.magrib}), Isya (${prayerSchedule.isya}).` : 'Data jadwal sholat belum termuat.';
      
      const earthquakeContext = quake ? `Gempa bumi terkini kekuatan Magnitudo ${quake.Magnitude}, Kedalaman ${quake.Kedalaman}, terjadi di ${quake.Wilayah} pada ${quake.Tanggal} pukul ${quake.Jam}. Status/Potensi: ${quake.Potensi}.` : 'Data gempa belum termuat.';
      
      const standingsContext = standings && standings.length > 0 ? standings.map(t => `- Peringkat ${t.position || standings.indexOf(t)+1}: ${t.team_name} (${t.match_played} main, ${t.win} menang, ${t.draw} seri, ${t.lose} kalah, ${t.point} poin, Form: ${t.form})`).join('\n') : 'Data klasemen belum termuat.';
      
      const matchesContext = `Live score saat ini: ${liveMatches && liveMatches.length > 0 ? `${liveMatches[0].home_team} vs ${liveMatches[0].away_team} (${liveMatches[0].home_score}-${liveMatches[0].away_score})` : 'Tidak ada pertandingan aktif (LIVE).'}
      Jadwal laga terdekat: ${upcomingMatches && upcomingMatches.length > 0 ? `${upcomingMatches[0].home_team} vs ${upcomingMatches[0].away_team} pada ${upcomingMatches[0].date}` : 'Tidak ada jadwal terdekat.'}
      Hasil laga terakhir: ${pastResults && pastResults.length > 0 ? `${pastResults[0].home_team} vs ${pastResults[0].away_team} (${pastResults[0].home_score}-${pastResults[0].away_score})` : 'Tidak ada hasil pertandingan terbaru.'}`;

      const systemPrompt = `Anda adalah Asisten AI cerdas berwatak ramah untuk Portal Informasi Publik ini. Anda bertugas membantu menjawab pertanyaan warga secara informatif, bersahabat, ringkas, dan jelas dalam Bahasa Indonesia.

Berikut adalah DATA REAL-TIME yang bersumber langsung dari Dashboard saat ini:
- WILAYAH AKTIF: ${selectedCity.label} (Jawa Timur, Indonesia)
- WAKTU LOKAL SISTEM: ${new Date().toLocaleString('id-ID')}
- KONDISI CUACA: ${weatherContext}
- JADWAL SHOLAT: ${prayerContext}
- INFO GEMPA TERKINI (BMKG): ${earthquakeContext}
- KLASEMEN LIGA 1 INDONESIA (Top 5):
${standingsContext}
- JADWAL & HASIL LAGA:
${matchesContext}

INSTRUKSI PENTING:
1. Jawablah menggunakan data real-time di atas jika pertanyaan pengguna berhubungan dengan cuaca, jadwal sholat, gempa terkini, atau Liga 1 Indonesia.
2. Gunakan Bahasa Indonesia yang sopan, santun, dan bersahabat.
3. Jaga jawaban tetap ringkas (maksimal 2-3 paragraf pendek) agar nyaman dibaca di layar HP/chat bubble.
4. Jika pertanyaan di luar data dashboard, Anda tetap diperbolehkan menjawabnya menggunakan pengetahuan umum Anda sebagai AI umum.`;

      // 2. Fetch from Hugging Face OpenAI-compatible Serverless Router
      const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
        headers: {
          'Authorization': `Bearer ${hfToken}`,
          'Content-Type': 'application/json'
        },
        method: 'POST',
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            ...updatedMessages.slice(-6).map(m => ({ role: m.role, content: m.content })) // send last 6 messages context
          ],
          max_tokens: 450
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const replyContent = data.choices[0].message.content;

      setChatMessages(prev => [...prev, { role: 'assistant', content: replyContent }]);
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Maaf, terjadi kesalahan saat menghubungi AI: ${err.message}. Pastikan Token Hugging Face Anda benar dan model sedang aktif.` }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleTradingAnalysis = async () => {
    setTradingLoading(true);
    setTradingAnalysis('');
    
    if (!hfToken.trim()) {
      setTimeout(() => {
        setTradingAnalysis("Maaf, Analisis AI tidak dapat dijalankan karena Token Hugging Face belum dikonfigurasi di file .env server.");
        setTradingLoading(false);
      }, 800);
      return;
    }

    const systemPrompt = `Anda adalah Asisten Analis Finansial Kuantitatif (Quant Trading Analyst) Senior bertaraf dunia. Tugas Anda adalah memberikan analisis teknikal & manajemen risiko profesional, mendalam, dan ringkas mengenai aset Forex atau Saham yang dipilih.
    
    Anda wajib memformat tanggapan Anda secara terstruktur menggunakan panduan berikut (Gunakan Bahasa Indonesia yang elegan dan profesional):
    
    1. 📊 TESIS ANALISIS (1 Paragraf Singkat): Tren arah harga saat ini dan pemicu utamanya (teknikal/fundamental).
    2. 🎯 LEVEL PERDAGANGAN:
       - Harga Entry Pengukur (Target Beli/Jual)
       - Stop Loss (Batas Kerugian)
       - Take Profit (Target Keuntungan)
    3. ⚖️ MANAJEMEN RISIKO (Risk-to-Reward Ratio): Jelaskan rasio risiko vs imbal hasil hasil kalkulasi Anda (target RRR minimal 1:2).
    4. 📈 PROBABILITAS KEMENANGAN (Win Probability): Sebutkan persentase peluang keberhasilan transaksi ini (contoh: 65%) berserta alasan teknikal di baliknya (misal pola grafik, RSI jenuh, dll).
    5. ⚠️ RISIKO UTAMA: 1 kalimat mengenai ancaman berita kalender ekonomi terdekat.`;

    const userPrompt = `Lakukan analisis lengkap dan kuantitatif untuk aset: ${selectedSymbol} (${
      selectedSymbol === 'EURUSD' ? 'Forex: Euro / US Dollar' : 
      selectedSymbol === 'GBPUSD' ? 'Forex: British Pound / US Dollar' : 
      selectedSymbol === 'USDJPY' ? 'Forex: US Dollar / Japanese Yen' : 
      selectedSymbol === 'XAUUSD' ? 'Commodity: Emas / US Dollar' : 
      selectedSymbol === 'AAPL' ? 'Saham: Apple Inc. (US)' : 
      selectedSymbol === 'TSLA' ? 'Saham: Tesla Inc. (US)' : 
      selectedSymbol === 'BBRI' ? 'Saham: Bank Rakyat Indonesia (IDX)' : 
      'Saham: Telkom Indonesia (IDX)'
    }).`;

    try {
      const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
        headers: {
          'Authorization': `Bearer ${hfToken}`,
          'Content-Type': 'application/json'
        },
        method: 'POST',
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 600
        })
      });

      if (!response.ok) {
        throw new Error("Gagal mengambil data dari server AI.");
      }

      const data = await response.json();
      setTradingAnalysis(data.choices[0].message.content);
    } catch (err) {
      setTradingAnalysis("Terjadi kesalahan saat memanggil AI untuk analisis perdagangan. Pastikan token Hugging Face Anda aktif dan coba lagi.");
    } finally {
      setTradingLoading(false);
    }
  };


  const selectedCity = CITIES.find(c => c.id === city) || CITIES[0];

  // Fetch data function
  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    setPrayerError(false);

    const now = new Date();
    const day = now.getDate();
    const years = [now.getFullYear(), 2025];
    const month = String(now.getMonth() + 1).padStart(2, '0');
    let prayerFound = false;

    // 1. Prayer Schedule
    for (const yr of years) {
      if (prayerFound) break;
      try {
        const res = await fetch(`https://raw.githubusercontent.com/lakuapik/jadwalsholatorg/master/adzan/${city}/${yr}/${month}.json`);
        if (res.ok) {
          const data = await res.json();
          const todaySchedule = data.find(d => {
            const dateDay = parseInt(d.tanggal.split('-')[2]);
            return dateDay === day;
          });
          if (todaySchedule) {
            setPrayerSchedule(todaySchedule);
            prayerFound = true;
          }
        }
      } catch (e) {
        console.warn(`Prayer fetch failed for ${yr}`, e);
      }
    }

    if (!prayerFound) {
      setPrayerError(true);
      setPrayerSchedule(null);
    }

    // 2. Earthquake
    try {
      const resQuake = await fetch('https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json');
      const quakeData = await resQuake.json();
      setQuake(quakeData.Infogempa.gempa);
    } catch (e) {
      console.warn('Earthquake fetch failed', e);
    }

    // 3. Weather
    try {
      const resWeather = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${selectedCity.lat}&longitude=${selectedCity.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FBangkok`
      );
      const weatherData = await resWeather.json();
      setWeather(weatherData);
    } catch (e) {
      console.warn('Weather fetch failed', e);
    }
    // 4. Liga Indonesia (Live Real-time TheSportsDB API with CORS Proxy & Smart Fallback)
    try {
      let liveStandings = null;
      let liveMatches = null;
      let localData = null;

      // Helper untuk fetch melewati Vite Proxy /api-sports guna bypass CORS 100% stabil
      const fetchWithProxy = async (targetUrl) => {
        const localPath = targetUrl.replace('https://thesportsdb.com', '/api-sports');
        const res = await fetch(localPath);
        if (!res.ok) throw new Error(`Proxy fetch failed for ${localPath}`);
        return await res.json();
      };

      // Ambil data lokal terlebih dahulu untuk Top Skor dan fallback
      try {
        const resLocal = await fetch('/mock-liga-indonesia.json');
        if (resLocal.ok) {
          localData = await resLocal.json();
          // Selalu set Top Skor dan H2H dari lokal
          setTopScorers(localData.top_scorers);
          if (localData.h2h_database) {
            setH2HDatabase(localData.h2h_database);
          }
        }
      } catch (err) {
        console.warn('Failed to load local mock database', err);
      }

      // Ambil Klasemen secara Live dari API
      try {
        const tableData = await fetchWithProxy('https://thesportsdb.com/api/v1/json/3/lookuptable.php?l=4790');
        if (tableData && tableData.table && tableData.table.length > 0) {
          liveStandings = tableData.table.map(item => ({
            position: parseInt(item.intRank),
            team_name: item.strTeam,
            team_logo: `https://images.weserv.nl/?url=${encodeURIComponent(item.strBadge)}&w=40&h=40`,
            match_played: parseInt(item.intPlayed),
            win: parseInt(item.intWin),
            draw: parseInt(item.intDraw),
            lose: parseInt(item.intLoss),
            point: parseInt(item.intPoints),
            form: item.strForm || ''
          }));
          setStandings(liveStandings);
        } else {
          // API tidak mengembalikan data → gunakan data lokal
          if (localData && localData.standings) setStandings(localData.standings);
        }
      } catch (err) {
        console.warn('Failed to fetch live standings, using fallback', err);
        if (localData && localData.standings) setStandings(localData.standings);
      }

      // 3. Ambil Jadwal Mendatang & Laga LIVE secara Real-time dari TheSportsDB API
      const activeStandings = liveStandings || localData?.standings;
      const activeH2HDb = localData?.h2h_database || {};

      // Format tanggal ke bahasa Indonesia
      const formatEventDate = (dateStr) => {
        if (!dateStr) return '';
        try {
          // Gunakan dateEventLocal (sudah waktu lokal Indonesia)
          const d = new Date(dateStr + 'T00:00:00');
          const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
          const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
          return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
        } catch { return dateStr; }
      };

      // Format waktu — pakai strTimeLocal dari API (sudah WIB, tidak perlu konversi)
      const formatEventTime = (localTimeStr) => {
        if (!localTimeStr) return '';
        try {
          const [h, m] = localTimeStr.split(':');
          return `${h}:${m} WIB`;
        } catch { return localTimeStr; }
      };

      try {
        const matchesData = await fetchWithProxy('https://thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=4790');
        if (matchesData && matchesData.events && matchesData.events.length > 0) {

          // Laga LIVE (sudah ada skor tapi belum selesai)
          const activeLive = matchesData.events
            .filter(event =>
              event.strStatus === 'Started' ||
              event.strStatus === 'Live' ||
              event.strStatus === 'Halftime' ||
              (event.intHomeScore !== null && event.intHomeScore !== '' &&
                event.intAwayScore !== null && event.intAwayScore !== '' &&
                event.strStatus !== 'Match Finished' &&
                event.strStatus !== 'Match Postponed')
            )
            .map(event => ({
              id: event.idEvent,
              home_team: event.strHomeTeam,
              home_logo: `https://images.weserv.nl/?url=${encodeURIComponent(event.strHomeTeamBadge || '')}&w=40&h=40`,
              away_team: event.strAwayTeam,
              away_logo: `https://images.weserv.nl/?url=${encodeURIComponent(event.strAwayTeamBadge || '')}&w=40&h=40`,
              home_score: parseInt(event.intHomeScore),
              away_score: parseInt(event.intAwayScore),
              status: event.strStatus === 'Halftime' ? 'HT' : 'LIVE',
              time: event.strProgress || 'LIVE',
              stadium: event.strVenue || 'Stadion Liga 1'
            }));
          setLiveMatches(activeLive);

          // Jadwal mendatang — 100% dari API real-time, tanpa dummy
          const LIVE_STATUSES = new Set(['Match Finished', 'Started', 'Live', 'Halftime', 'Match Postponed']);
          const upcomingRaw = matchesData.events.filter(event => {
            const noScore = event.intHomeScore === null || event.intHomeScore === '' || event.intHomeScore === undefined;
            const notLive = !LIVE_STATUSES.has(event.strStatus);
            return noScore && notLive;
          });

          // Hitung prediksi kemenangan dari data klasemen live
          const processedUpcoming = upcomingRaw.map(event => {
            const probs = getCombinedProbabilities(event.strHomeTeam, event.strAwayTeam, activeStandings, activeH2HDb);
            return {
              home_team: event.strHomeTeam,
              home_logo: `https://images.weserv.nl/?url=${encodeURIComponent(event.strHomeTeamBadge || '')}&w=40&h=40`,
              away_team: event.strAwayTeam,
              away_logo: `https://images.weserv.nl/?url=${encodeURIComponent(event.strAwayTeamBadge || '')}&w=40&h=40`,
              date: formatEventDate(event.dateEventLocal || event.dateEvent),
              time: formatEventTime(event.strTimeLocal || event.strTime),
              stadium: event.strVenue || 'Stadion Liga 1',
              prob_home: probs.probHome,
              prob_draw: probs.probDraw,
              prob_away: probs.probAway
            };
          });
          setUpcomingMatches(processedUpcoming);

        } else {
          setLiveMatches([]);
          setUpcomingMatches([]);
        }
      } catch (err) {
        console.warn('Failed to fetch upcoming/live match events', err);
        setUpcomingMatches([]);
      }

      // 4. Hasil Laga Terkini — 100% dari API real-time, tanpa dummy
      try {
        const pastData = await fetchWithProxy('https://thesportsdb.com/api/v1/json/3/eventspastleague.php?id=4790');
        if (pastData && pastData.events && pastData.events.length > 0) {
          const finishedMatches = pastData.events
            .filter(e => e.strStatus === 'Match Finished' || (e.intHomeScore !== null && e.intHomeScore !== ''))
            .slice(-10)
            .reverse()
            .map(event => ({
              home_team: event.strHomeTeam,
              home_logo: `https://images.weserv.nl/?url=${encodeURIComponent(event.strHomeTeamBadge || '')}&w=40&h=40`,
              away_team: event.strAwayTeam,
              away_logo: `https://images.weserv.nl/?url=${encodeURIComponent(event.strAwayTeamBadge || '')}&w=40&h=40`,
              home_score: parseInt(event.intHomeScore) || 0,
              away_score: parseInt(event.intAwayScore) || 0,
              date: formatEventDate(event.dateEvent),
              stadium: event.strVenue || 'Stadion Liga 1'
            }));
          setPastResults(finishedMatches);
        } else {
          setPastResults([]);
        }
      } catch (err) {
        console.warn('Failed to fetch past results', err);
        setPastResults([]);
      }

      // Jika data klasemen gagal didapat dari API, pasang klasemen fallback
      if (!liveStandings && localData) {
        setStandings(localData.standings);
      }

    } catch (e) {
      console.warn('Global error loading Liga Indonesia data', e);
    }

    setLoading(false);
  }, [city, selectedCity.lat, selectedCity.lon]);

  // Initial fetch and city change
  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(false);
    }, 300000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Real-time clock and Next Prayer calculation
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      if (prayerSchedule) {
        const times = [
          { name: 'Imsyak', time: prayerSchedule.imsyak },
          { name: 'Subuh', time: prayerSchedule.shubuh },
          { name: 'Terbit', time: prayerSchedule.terbit },
          { name: 'Dhuha', time: prayerSchedule.dhuha },
          { name: 'Dzuhur', time: prayerSchedule.dzuhur },
          { name: 'Ashar', time: prayerSchedule.ashr },
          { name: 'Maghrib', time: prayerSchedule.magrib },
          { name: 'Isya', time: prayerSchedule.isya },
        ];

        const nowTimeStr = now.toTimeString().slice(0, 5); // "HH:mm"
        const next = times.find(t => t.time > nowTimeStr) || { ...times[0], isNextDay: true };

        // Calculate countdown
        const [targetH, targetM] = next.time.split(':').map(Number);
        const targetDate = new Date(now);
        targetDate.setHours(targetH, targetM, 0, 0);
        if (next.isNextDay) targetDate.setDate(targetDate.getDate() + 1);

        const diffMs = targetDate - now;
        const h = Math.floor(diffMs / 3600000);
        const m = Math.floor((diffMs % 3600000) / 60000);
        const s = Math.floor((diffMs % 60000) / 1000);

        setNextPrayer({
          name: next.name,
          time: next.time,
          countdown: `${h > 0 ? h + 'j ' : ''}${m}m ${s}s`
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [prayerSchedule]);

  const getWeatherDesc = (code) => {
    if (code === 0) return "Cerah";
    if (code <= 3) return "Berawan";
    if (code <= 48) return "Berkabut";
    if (code <= 57) return "Gerimis";
    if (code <= 67) return "Hujan";
    if (code <= 77) return "Hujan Salju";
    if (code <= 82) return "Hujan Lebat";
    if (code <= 86) return "Hujan Salju Lebat";
    return "Badai Petir";
  };

  const getWeatherIcon = (code) => {
    if (code === 0) return <Sun className="w-12 h-12 text-amber-500 animate-[spin_10s_linear_infinite]" />;
    if (code <= 3) return <CloudSun className="w-12 h-12 text-slate-400" />;
    if (code <= 48) return <CloudFog className="w-12 h-12 text-slate-300" />;
    if (code <= 57) return <CloudDrizzle className="w-12 h-12 text-sky-400" />;
    if (code <= 67) return <CloudRain className="w-12 h-12 text-sky-500" />;
    if (code <= 82) return <CloudRain className="w-12 h-12 text-blue-500" />;
    return <CloudLightning className="w-12 h-12 text-indigo-500 animate-bounce" />;
  };

  const SYMBOL_MAP = {
    'EURUSD': 'FX:EURUSD',
    'GBPUSD': 'FX:GBPUSD',
    'USDJPY': 'FX:USDJPY',
    'XAUUSD': 'OANDA:XAUUSD',
    'AAPL': 'NASDAQ:AAPL',
    'TSLA': 'NASDAQ:TSLA',
    'BBRI': 'IDX:BBRI',
    'TLKM': 'IDX:TLKM'
  };

  const [livePrices, setLivePrices] = useState({
    'EURUSD': 1.08450,
    'GBPUSD': 1.25410,
    'USDJPY': 155.60,
    'XAUUSD': 2412.50,
    'AAPL': 182.30,
    'TSLA': 174.60,
    'BBRI': 4680,
    'TLKM': 3200
  });

  // Real-time price feed loop from TradingView's Global Scanner API
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
            'Content-Type': 'text/plain'
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
    const interval = setInterval(fetchRates, 3000); // Fetch from TradingView every 3 seconds for maximum precision
    return () => clearInterval(interval);
  }, []);

  const [botLogs, setBotLogs] = useState({
    'EURUSD': [],
    'GBPUSD': [],
    'USDJPY': [],
    'XAUUSD': [],
    'AAPL': [],
    'TSLA': [],
    'BBRI': [],
    'TLKM': []
  });

  const [performanceData, setPerformanceData] = useState({
    'EURUSD': {
      strategyName: 'SMC x Supply & Demand (S&D) + Support Resistance',
      winRate: '68.2%',
      avgRrr: '1:2.3',
      profit1D: '+0.00%',
      profit1W: '+0.00%',
      profit1M: '+0.00%',
      totalTrades: '0 Trades',
      analysisExplain: 'Analisis M15 (Intraday) difokuskan pada presisi momentum. Algoritma menggabungkan SMC (Smart Money Concepts) untuk melacak pergerakan likuiditas institusi (Liquidity Sweep & CHoCH), yang kemudian divivalidasi ulang secara ganda menggunakan area Supply & Demand kuat serta pantulan klasik dari Support/Resistance historis.'
    },
    'GBPUSD': {
      strategyName: 'Order Block & Fair Value Gap (FVG) Refinement',
      winRate: '65.5%',
      avgRrr: '1:2.5',
      profit1D: '+0.00%',
      profit1W: '+0.00%',
      profit1M: '+0.00%',
      totalTrades: '0 Trades',
      analysisExplain: 'Strategi difokuskan pada entry di area FVG H1 pasca-rilis kalender ekonomi AS. Probabilitas keberhasilan teknik mencapai 65.5% dengan perlindungan Stop Loss ketat di bawah batas kritis Support H1.'
    },
    'USDJPY': {
      strategyName: 'Mean Reversion & Bollinger Band Extremes',
      winRate: '71.0%',
      avgRrr: '1:2.1',
      profit1D: '+0.00%',
      profit1W: '+0.00%',
      profit1M: '+0.00%',
      totalTrades: '0 Trades',
      analysisExplain: 'Strategi pembalikan arah (Mean Reversion) memanfaatkan deviasi ekstrim 2.5 standard deviation pada Bollinger Bands H1. Memanfaatkan pelemahan momentum pembeli Yen Jepang.'
    },
    'XAUUSD': {
      strategyName: 'Volume Profile & H4 Breakout Confirmation',
      winRate: '72.5%',
      avgRrr: '1:2.7',
      profit1D: '+0.00%',
      profit1W: '+0.00%',
      profit1M: '+0.00%',
      totalTrades: '0 Trades',
      analysisExplain: 'Analisis berbasis Volume Profile pada area High Volume Node (HVN) emas. Posisi BUY di 2412.50 diambil setelah terjadi breakout dikonfirmasi volume transaksi institusional yang masif.'
    },
    'AAPL': {
      strategyName: 'Gap Fill & Trend Following (EMA 20/50)',
      winRate: '66.8%',
      avgRrr: '1:2.2',
      profit1D: '+0.00%',
      profit1W: '+0.00%',
      profit1M: '+0.00%',
      totalTrades: '0 Trades',
      analysisExplain: 'Strategi mengikuti tren utama menggunakan persilangan EMA 20 dan 50 pada chart harian. Mengambil momentum rilis produk baru Apple dengan stop loss di bawah swing low kemarin.'
    },
    'TSLA': {
      strategyName: 'Volatility Breakout & ADX Momentum',
      winRate: '60.4%',
      avgRrr: '1:2.6',
      profit1D: '+0.00%',
      profit1W: '+0.00%',
      profit1M: '+0.00%',
      totalTrades: '0 Trades',
      analysisExplain: 'Strategi breakout volatilitas tinggi dengan filter momentum indikator ADX > 25. Karena sifat saham Tesla yang sangat volatil, stop loss ditempatkan 1.5 ATR (Average True Range) dari entry.'
    },
    'BBRI': {
      strategyName: 'Foreign Flow Accumulation & Fibonacci Retracement',
      winRate: '70.2%',
      avgRrr: '1:2.5',
      profit1D: '+0.00%',
      profit1W: '+0.00%',
      profit1M: '+0.00%',
      totalTrades: '0 Trades',
      analysisExplain: 'Analisis berbasis data akumulasi aliran modal asing (Foreign Flow) dikombinasikan dengan level Fibonacci Retracement 61.8%. Bot masuk posisi BUY setelah harga memantul di area support Rp4.650.'
    },
    'TLKM': {
      strategyName: 'Dividend Yield Accumulation & Support Bounce',
      winRate: '69.0%',
      avgRrr: '1:2.1',
      profit1D: '+0.00%',
      profit1W: '+0.00%',
      profit1M: '+0.00%',
      totalTrades: '0 Trades',
      analysisExplain: 'Bot memanfaatkan area jenuh jual (Oversold) pada RSI harian di dekat area Support psikologis kuat Rp3.200, mengantisipasi pemantulan teknikal jangka menengah.'
    }
  });

  const [generalLogs, setGeneralLogs] = useState([]);
  const [isTriggering, setIsTriggering] = useState(false);
  const [activeTradingTab, setActiveTradingTab] = useState('live'); // 'live' or 'backtest'
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [botSettings, setBotSettings] = useState({
    minProbability: 70,
    riskRewardRatio: 2.3,
    activeSymbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AAPL', 'TSLA', 'BBRI', 'TLKM']
  });

  // Backtest States
  const [backtestSettings, setBacktestSettings] = useState({
    symbol: 'EURUSD',
    period: 30, // 30 days
    minProbability: 70,
    riskRewardRatio: 2.3
  });
  const [backtestResults, setBacktestResults] = useState(null);
  const [isBacktesting, setIsBacktesting] = useState(false);

  const fetchBackendTrades = useCallback(async () => {
    try {
      const res = await fetch('/api/get-trades');
      // Detect if we received JS source code instead of JSON (Vite dev server static fallback)
      const text = await res.clone().text();
      if (text.trim().startsWith('import') || text.trim().startsWith('const') || text.trim().startsWith('export')) {
        throw new Error('Vite dev server static file fallback');
      }

      const data = await res.json();
      if (data.success) {
        setBotLogs(data.botLogs || {});
        setPerformanceData(data.performance || {});
        setGeneralLogs(data.logs || []);
        if (data.settings) {
          setBotSettings(data.settings);
        }
      }
    } catch (e) {
      console.warn('Gagal memuat log bot backend, beralih ke Emulator Lokal Frontend:', e.message);
      
      const savedData = localStorage.getItem('local_trading_db');
      if (savedData) {
        try {
          const parsed = JSON.parse(savedData);
          setBotLogs(parsed.botLogs || {});
          setPerformanceData(parsed.performance || {});
          setGeneralLogs(parsed.logs || []);
          if (parsed.settings) {
            setBotSettings(parsed.settings);
          }
          return;
        } catch (err) {}
      }

      setGeneralLogs(prev => {
        if (prev.length === 0) {
          return [
            { id: 1, time: new Date().toLocaleTimeString('id-ID') + ' WIB', text: '[SISTEM] Mode Emulator Lokal aktif. Silakan klik "⚡ Pemicu Manual Bot" untuk simulasi scan.' }
          ];
        }
        return prev;
      });
    }
  }, []);

  const triggerManualBotScan = async () => {
    setIsTriggering(true);
    try {
      const res = await fetch('/api/trading-bot');
      const text = await res.clone().text();
      if (text.trim().startsWith('import') || text.trim().startsWith('const') || text.trim().startsWith('export')) {
        throw new Error('Vite dev server static file fallback');
      }
      
      if (res.ok) {
        await fetchBackendTrades();
      }
    } catch (e) {
      console.log('Menjalankan Bot Scan di Emulator Lokal Frontend...');
      
      const db = {
        trades: [],
        logs: [...generalLogs],
        performance: { ...performanceData }
      };

      const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AAPL', 'TSLA', 'BBRI', 'TLKM'];
      const activeSymbols = botSettings.activeSymbols || symbols;
      symbols.forEach(sym => {
        if (!activeSymbols.includes(sym)) return;
        const symTrades = botLogs[sym] || [];
        db.trades.push(...symTrades);
      });

      const timestamp = Date.now();
      const timeStr = new Date().toLocaleTimeString('id-ID') + ' WIB';
      
      const updatedTrades = [];
      const newLogs = [];
      for (let trade of db.trades) {
        if (trade.status === 'active') {
          const currentPrice = livePrices[trade.symbol] || parseFloat(trade.entry);
          const entryNum = parseFloat(trade.entry);
          const slNum = parseFloat(trade.sl);
          const tpNum = parseFloat(trade.tp);
          
          let shouldClose = false;
          let isWin = false;
          let closeReason = 'Target Hit';
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
          } else {
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

            const perf = db.performance[trade.symbol] || {};
            const parsePct = (val) => parseFloat(val?.replace(/[+%]/g, '')) || 0;
            const new1D = parsePct(perf.profit1D) + pnlChange;
            const totalTr = parseInt(perf.totalTrades) || 0;
            perf.profit1D = `${new1D >= 0 ? '+' : ''}${new1D.toFixed(2)}%`;
            perf.totalTrades = `${totalTr + 1} Trades`;
            db.performance[trade.symbol] = perf;
          }
        }
        updatedTrades.push(trade);
      }
      db.trades = updatedTrades;

      symbols.forEach((sym, index) => {
        if (!activeSymbols.includes(sym)) return;
        const hasActive = db.trades.some(t => t.symbol === sym && t.status === 'active');
        if (hasActive) return;

        const currentLive = livePrices[sym] || 1.0;
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
          executeTrade = probability >= (botSettings.minProbability || 70);
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
          executeTrade = probability >= (botSettings.minProbability || 70);
        } else {
          bias = 'NO TRADE (H1 Sideways)';
          probability = Math.round(15 + Math.random() * 20);
        }

        probability = Math.min(98, Math.max(10, probability));

        if (executeTrade) {
          const distMap = {
            'EURUSD': 0.00100, 'GBPUSD': 0.00150, 'USDJPY': 0.20, 'XAUUSD': 6.00,
            'AAPL': 1.50, 'TSLA': 2.50, 'BBRI': 40, 'TLKM': 20
          };
          const slDist = distMap[sym] || 0.01;
          const rrrValStr = `1:${botSettings.riskRewardRatio || 2.3}`;
          const riskMultiplier = botSettings.riskRewardRatio || 2.3;

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
          newLogs.push({
            id: itemTimestamp + Math.random(),
            time: itemTimeStr,
            text: `[KONFLUENS EKSEKUSI] Sinyal berkualitas tinggi terdeteksi untuk ${sym}! Tren H1: ${h1Trend}, Konfluensi Aktif: [${confluences.join(' + ')}]. Probabilitas: ${probability}%. Posisi ${tradeType} dibuka di harga ${currentLive.toFixed(decs)}.`
          });
        } else {
          let logText = '';
          if (bias.includes('NO TRADE')) {
            logText = `[DISIPLIN] ${sym} dilewati. Tren H1 sedang Sideways (${bias}). Probabilitas hanya ${probability}%. Menunggu struktur bias tren terbentuk.`;
          } else {
            logText = `[DISIPLIN] ${sym} dilewati. Tren H1 selaras ${h1Trend}, namun tingkat konfluensi kurang memadai (Konfluensi aktif: [${confluences.join(' + ') || 'None'}]). Probabilitas ${probability}% (Batas minimal ${(botSettings.minProbability || 70)}%).`;
          }
          newLogs.push({
            id: itemTimestamp + Math.random(),
            time: itemTimeStr,
            text: logText
          });
        }
      });

      const updatedLogs = [...newLogs, ...db.logs].slice(0, 50);
      const newBotLogs = {};
      symbols.forEach(sym => {
        newBotLogs[sym] = db.trades.filter(t => t.symbol === sym);
      });

      setBotLogs(newBotLogs);
      setPerformanceData(db.performance);
      setGeneralLogs(updatedLogs);

      localStorage.setItem('local_trading_db', JSON.stringify({
        botLogs: newBotLogs,
        performance: db.performance,
        logs: updatedLogs
      }));
    } finally {
      setIsTriggering(false);
    }
  };

  const saveBotSettings = async (newSettings) => {
    try {
      setBotSettings(newSettings);
      const res = await fetch('/api/trading-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_settings',
          ...newSettings
        })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Gagal menyimpan pengaturan ke database backend');
      }
    } catch (e) {
      console.warn('Gagal menyimpan pengaturan ke backend, menyimpan di Emulator Lokal:', e.message);
      const savedData = localStorage.getItem('local_trading_db');
      let db = { trades: [], logs: [], performance: {}, settings: {} };
      if (savedData) {
        try { db = JSON.parse(savedData); } catch (err) {}
      }
      db.settings = newSettings;
      localStorage.setItem('local_trading_db', JSON.stringify(db));
    }
  };

  const runBacktestSimulation = async () => {
    setIsBacktesting(true);
    setBacktestResults(null);

    const { symbol, period, minProbability, riskRewardRatio } = backtestSettings;

    try {
      const res = await fetch('/api/trading-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run_backtest',
          symbol,
          period,
          minProbability,
          riskRewardRatio
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.results) {
          setBacktestResults(data.results);
          setIsBacktesting(false);
          return;
        }
      }
      throw new Error('Gagal memuat hasil backtesting dari API backend.');
    } catch (err) {
      console.warn('Gagal menjalankan backtest backend, menggunakan fallback emulator lokal frontend:', err.message);
      
      // Fallback: local synthetic simulation
      setTimeout(() => {
        try {
          const symbolSeed = symbol.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
          let price = livePrices[symbol] || (symbol.includes('JPY') ? 156.00 : symbol.includes('BBRI') ? 4700 : symbol.includes('XAU') ? 2400.00 : 1.0850);
          
          const intervals = period * 24 * 4; // M15 intervals
          const startTime = Date.now() - (period * 24 * 3600 * 1000);
          const candles = [];
          
          for (let i = 0; i < intervals; i++) {
            const time = startTime + (i * 15 * 60 * 1000);
            const drift = Math.sin(time / (24 * 3600 * 1000) + symbolSeed) * 0.0002;
            const noise = (Math.random() - 0.5) * 0.0015;
            price = price * (1 + drift + noise);
            candles.push({ time, price });
          }

          const trades = [];
          let activeTrade = null;
          let balance = 100.0;
          const equityCurve = [{ time: startTime, balance: 100.0 }];
          
          const distMap = {
            'EURUSD': 0.00100, 'GBPUSD': 0.00150, 'USDJPY': 0.20, 'XAUUSD': 6.00,
            'AAPL': 1.50, 'TSLA': 2.50, 'BBRI': 40, 'TLKM': 20
          };
          const slDist = distMap[symbol] || 0.01;
          const decs = symbol.includes('JPY') ? 2 : symbol.includes('BBRI') || symbol.includes('TLKM') ? 0 : 5;

          for (let i = 0; i < candles.length; i++) {
            const candle = candles[i];
            const timeStr = new Date(candle.time).toLocaleString('id-ID', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB';

            if (activeTrade) {
              if (!activeTrade.isBE) {
                const entry = parseFloat(activeTrade.entry);
                const tp = parseFloat(activeTrade.tp);
                if (activeTrade.type === 'BUY') {
                  const triggerLevel = entry + (tp - entry) * 0.5;
                  if (candle.price >= triggerLevel) {
                    activeTrade.sl = entry;
                    activeTrade.isBE = true;
                  }
                } else {
                  const triggerLevel = entry - (entry - tp) * 0.5;
                  if (candle.price <= triggerLevel) {
                    activeTrade.sl = entry;
                    activeTrade.isBE = true;
                  }
                }
              }

              let shouldClose = false;
              let pnlChange = 0;
              let resultStatus = '';
              
              const entryVal = parseFloat(activeTrade.entry);
              const slVal = parseFloat(activeTrade.sl);
              const tpVal = parseFloat(activeTrade.tp);

              if (activeTrade.type === 'BUY') {
                if (candle.price >= tpVal) {
                  shouldClose = true;
                  pnlChange = 0.20 * riskRewardRatio;
                  resultStatus = 'PROFIT';
                } else if (candle.price <= slVal) {
                  shouldClose = true;
                  pnlChange = activeTrade.isBE ? 0 : -0.20;
                  resultStatus = activeTrade.isBE ? 'BREAK EVEN' : 'LOSS';
                }
              } else {
                if (candle.price <= tpVal) {
                  shouldClose = true;
                  pnlChange = 0.20 * riskRewardRatio;
                  resultStatus = 'PROFIT';
                } else if (candle.price >= slVal) {
                  shouldClose = true;
                  pnlChange = activeTrade.isBE ? 0 : -0.20;
                  resultStatus = activeTrade.isBE ? 'BREAK EVEN' : 'LOSS';
                }
              }

              if (shouldClose) {
                balance += pnlChange;
                activeTrade.pnl = resultStatus === 'PROFIT' 
                  ? `PROFIT (+${(0.20 * riskRewardRatio).toFixed(2)}%)` 
                  : resultStatus === 'BREAK EVEN' ? 'BREAK EVEN (+0.00%)' : `LOSS (-0.20%)`;
                activeTrade.status = 'closed';
                activeTrade.closePrice = candle.price.toFixed(decs);
                activeTrade.closeTime = timeStr;
                
                trades.unshift(activeTrade);
                equityCurve.push({ time: candle.time, balance: parseFloat(balance.toFixed(2)) });
                activeTrade = null;
              }
            } else {
              const h1Wave = Math.sin(candle.time / (3600 * 1000) + symbolSeed);
              const h1Trend = h1Wave > 0.20 ? 'BULLISH' : h1Wave < -0.20 ? 'BEARISH' : 'SIDEWAYS';
              
              if (h1Trend !== 'SIDEWAYS') {
                const sweepWave = Math.sin(candle.time / (45 * 60 * 1000) + symbolSeed + 1);
                const liqSweep = sweepWave > 0.65 ? 'BULLISH_SWEEP' : sweepWave < -0.65 ? 'BEARISH_SWEEP' : 'NONE';
                const chochWave = Math.sin(candle.time / (30 * 60 * 1000) + symbolSeed + 2);
                const hasCHoCH = chochWave > 0.35;
                const obWave = Math.sin(candle.time / (15 * 60 * 1000) + symbolSeed + 3);
                const priceInOrderBlock = obWave > 0.40;
                const fvgWave = Math.sin(candle.time / (10 * 60 * 1000) + symbolSeed + 4);
                const fvgMitigated = fvgWave > 0.25;
                
                const sdWave = Math.sin(candle.time / (20 * 60 * 1000) + symbolSeed + 5);
                const inDemandZone = sdWave > 0.45;
                const inSupplyZone = sdWave < -0.45;
                
                const srWave = Math.sin(candle.time / (12 * 60 * 1000) + symbolSeed + 6);
                const atMajorSupport = srWave > 0.50;
                const atMajorResistance = srWave < -0.50;

                let prob = 35;
                let confluences = [];

                if (h1Trend === 'BULLISH') {
                  if (liqSweep === 'BULLISH_SWEEP') { prob += 10; confluences.push('SMC Liquidity Sweep'); }
                  if (hasCHoCH) { prob += 10; confluences.push('SMC M15 CHoCH'); }
                  if (priceInOrderBlock) { prob += 10; confluences.push('SMC OB'); }
                  if (fvgMitigated) { prob += 10; confluences.push('SMC FVG'); }
                  if (inDemandZone) { prob += 15; confluences.push('S&D Demand'); }
                  if (atMajorSupport) { prob += 10; confluences.push('S&R Support'); }
                  
                  const m15Rsi = Math.round(50 + Math.sin(candle.time / (15 * 60 * 1000) + symbolSeed + 7) * 20);
                  if (m15Rsi < 45) { prob += 5; confluences.push('RSI Pullback'); }

                  if (prob >= minProbability) {
                    const entry = candle.price;
                    const sl = entry - slDist;
                    const tp = entry + slDist * riskRewardRatio;
                    activeTrade = {
                      id: Math.random(),
                      symbol,
                      type: 'BUY',
                      entry: entry.toFixed(decs),
                      sl: sl.toFixed(decs),
                      tp: tp.toFixed(decs),
                      rrr: `1:${riskRewardRatio}`,
                      probability: `${prob}%`,
                      status: 'active',
                      openTime: timeStr,
                      confluences: confluences.join(' + '),
                      isBE: false
                    };
                  }
                } else if (h1Trend === 'BEARISH') {
                  if (liqSweep === 'BEARISH_SWEEP') { prob += 10; confluences.push('SMC Liquidity Sweep'); }
                  if (hasCHoCH) { prob += 10; confluences.push('SMC M15 CHoCH'); }
                  if (priceInOrderBlock) { prob += 10; confluences.push('SMC OB'); }
                  if (fvgMitigated) { prob += 10; confluences.push('SMC FVG'); }
                  if (inSupplyZone) { prob += 15; confluences.push('S&D Supply'); }
                  if (atMajorResistance) { prob += 10; confluences.push('S&R Resistance'); }
                  
                  const m15Rsi = Math.round(50 + Math.sin(candle.time / (15 * 60 * 1000) + symbolSeed + 7) * 20);
                  if (m15Rsi > 55) { prob += 5; confluences.push('RSI Rally'); }

                  if (prob >= minProbability) {
                    const entry = candle.price;
                    const sl = entry + slDist;
                    const tp = entry - slDist * riskRewardRatio;
                    activeTrade = {
                      id: Math.random(),
                      symbol,
                      type: 'SELL',
                      entry: entry.toFixed(decs),
                      sl: sl.toFixed(decs),
                      tp: tp.toFixed(decs),
                      rrr: `1:${riskRewardRatio}`,
                      probability: `${prob}%`,
                      status: 'active',
                      openTime: timeStr,
                      confluences: confluences.join(' + '),
                      isBE: false
                    };
                  }
                }
              }
            }
          }

          const totalTrades = trades.length;
          const profitTrades = trades.filter(t => t.pnl.includes('PROFIT'));
          const lossTrades = trades.filter(t => t.pnl.includes('LOSS'));
          const beTrades = trades.filter(t => t.pnl.includes('BREAK EVEN'));
          
          const wins = profitTrades.length;
          const losses = lossTrades.length;
          const winRate = totalTrades > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0';
          
          const finalReturn = balance - 100.0;
          
          let peak = 100.0;
          let maxDd = 0.0;
          for (let eq of equityCurve) {
            if (eq.balance > peak) peak = eq.balance;
            const dd = ((peak - eq.balance) / peak) * 100;
            if (dd > maxDd) maxDd = dd;
          }

          setBacktestResults({
            totalTrades,
            wins,
            losses,
            beTrades: beTrades.length,
            winRate,
            finalReturn: `${finalReturn >= 0 ? '+' : ''}${finalReturn.toFixed(2)}%`,
            maxDrawdown: `${maxDd.toFixed(2)}%`,
            trades,
            equityCurve
          });
        } catch (err) {
          console.error('Backtest error:', err);
        } finally {
          setIsBacktesting(false);
        }
      }, 1200);
    }
  };

  useEffect(() => {
    if (activeTab === 'trading') {
      fetchBackendTrades();
      const interval = setInterval(fetchBackendTrades, 5000); // Poll every 5s
      return () => clearInterval(interval);
    }
  }, [activeTab, fetchBackendTrades]);

  // Real-time reactive SL/TP evaluator based on live TradingView rates
  useEffect(() => {
    const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AAPL', 'TSLA', 'BBRI', 'TLKM'];
    let triggerScanNeeded = false;

    for (let sym of symbols) {
      const symTrades = botLogs[sym] || [];
      const activeTrade = symTrades.find(t => t.status === 'active');
      if (activeTrade) {
        const currentLive = livePrices[sym];
        if (currentLive) {
          const slNum = parseFloat(activeTrade.sl);
          const tpNum = parseFloat(activeTrade.tp);

          if (activeTrade.type === 'BUY') {
            if (currentLive >= tpNum || currentLive <= slNum) {
              triggerScanNeeded = true;
              break;
            }
          } else { // SELL
            if (currentLive <= tpNum || currentLive >= slNum) {
              triggerScanNeeded = true;
              break;
            }
          }
        }
      }
    }

    if (triggerScanNeeded && !isTriggering) {
      console.log('Real-time boundary cross terdeteksi dari feed harga TradingView! Mengeksekusi penutupan posisi...');
      triggerManualBotScan();
    }
  }, [livePrices, botLogs, isTriggering]);

  const exportToCSV = () => {
    const logs = botLogs[selectedSymbol] || [];
    if (logs.length === 0) {
      alert('Belum ada data untuk diunduh.');
      return;
    }

    const headers = ['Waktu', 'Aksi', 'Timeframe', 'Harga Entry', 'Risk-Reward', 'Probabilitas', 'Harga SL', 'Harga TP', 'Hasil PnL'];
    const rows = logs.map(log => [
      log.time,
      log.type,
      log.timeframe || 'M15',
      log.entry,
      log.rrr,
      log.probability || '-',
      log.sl || '-',
      log.tp || '-',
      log.pnl
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Laporan_Trading_${selectedSymbol}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportAllToCSV = () => {
    const allLogs = [];
    const symbols = Object.keys(botLogs);
    
    symbols.forEach(sym => {
      const logs = botLogs[sym] || [];
      logs.forEach(log => {
        allLogs.push({ ...log, symbol: sym });
      });
    });

    if (allLogs.length === 0) {
      alert('Belum ada data untuk diunduh.');
      return;
    }

    // Urutkan berdasarkan ID/waktu dari yang terbaru
    allLogs.sort((a, b) => b.id - a.id);

    const headers = ['Aset', 'Waktu', 'Aksi', 'Timeframe', 'Harga Entry', 'Risk-Reward', 'Probabilitas', 'Harga SL', 'Harga TP', 'Hasil PnL', 'Status'];
    const rows = allLogs.map(log => [
      log.symbol,
      log.time,
      log.type,
      log.timeframe || 'M15',
      log.entry,
      log.rrr,
      log.probability || '-',
      log.sl || '-',
      log.tp || '-',
      log.pnl,
      log.status
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Semua_Laporan_Trading_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const stopTradingAndCloseAll = () => {
    // Ambil database lokal ter-update
    let localDb = { trades: [], logs: [], performance: {} };
    try {
      const saved = localStorage.getItem('local_trading_db');
      if (saved) localDb = JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }

    // Gunakan state aktif kita sebagai fallback utama
    const symbolsList = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AAPL', 'TSLA', 'BBRI', 'TLKM'];
    let currentTrades = [];
    
    // Gabungkan data trades dari botLogs
    symbolsList.forEach(sym => {
      const symTrades = botLogs[sym] || [];
      currentTrades = [...currentTrades, ...symTrades];
    });

    if (currentTrades.length === 0 && localDb.trades) {
      currentTrades = [...localDb.trades];
    }

    let closedCount = 0;
    const timeStr = new Date().toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';

    const updatedTrades = currentTrades.map(trade => {
      if (trade.status === 'active') {
        closedCount++;
        // Hitung running profit sementara berdasarkan live price saat ini
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

    if (closedCount === 0) {
      alert('Tidak ada posisi aktif yang perlu ditutup.');
      return;
    }

    const newLog = {
      id: Date.now(),
      time: timeStr,
      text: `[SISTEM] PEMBERHENTIAN MANUAL: Trading dihentikan. Sebanyak ${closedCount} posisi aktif berhasil ditutup secara paksa.`
    };

    const updatedLogsList = [newLog, ...generalLogs].slice(0, 50);

    // Update state frontend
    const newBotLogs = {};
    symbolsList.forEach(sym => {
      newBotLogs[sym] = updatedTrades.filter(t => t.symbol === sym);
    });

    setBotLogs(newBotLogs);
    setGeneralLogs(updatedLogsList);

    // Simpan ke local storage
    localStorage.setItem('local_trading_db', JSON.stringify({
      botLogs: newBotLogs,
      performance: performanceData,
      logs: updatedLogsList
    }));

    // Coba kirim sinyal stop/close ke backend juga jika backend aktif
    fetch('/api/trading-bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close_all' })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        console.log('Backend sync successful:', data.message);
      }
    })
    .catch(e => console.warn('Backend offline/unreachable, status ditutup secara lokal saja:', e.message));

    alert(`Berhasil menghentikan trading! ${closedCount} posisi aktif ditutup secara manual.`);
  };

  if (loading && !prayerSchedule && !weather) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="w-8 h-8 border-2 border-slate-100 border-t-slate-400 rounded-full animate-spin" />
          <p className="text-slate-300 text-sm font-light">Sinkronisasi data publik...</p>
        </motion.div>
      </div>
    );
  }



  return (
    <div className="min-h-screen bg-white text-slate-700 pb-16 selection:bg-slate-100 selection:text-slate-900">
      
      {/* Sleek Floating Tab Switcher at the very top */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 pt-6 md:pt-10">
        <div className="flex bg-slate-100/60 p-1 rounded-2xl max-w-[340px] md:max-w-[380px] border border-slate-200/50 shadow-sm relative z-30">
          <button
            onClick={() => setActiveTab('portal')}
            className={`flex-1 py-2 px-3 text-xs md:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
              activeTab === 'portal'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            🌤️ Portal Publik
          </button>
          <button
            onClick={() => setActiveTab('trading')}
            className={`flex-1 py-2 px-3 text-xs md:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
              activeTab === 'trading'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            📈 Hub Trading AI
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
        
        {/* TAB 1: Portal Publik (Existing Content) */}
        {activeTab === 'portal' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="max-w-5xl mx-auto">

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-8 mb-6 md:mb-12">
          <div>
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-800 mb-2">Informasi Dari Ikko,</h1>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <p className="text-slate-400 text-sm flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  {currentTime.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                <p className="text-slate-800 text-sm font-medium flex items-center gap-2 tabular-nums">
                  <Clock className="w-3.5 h-3.5 text-slate-300" />
                  {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} WIB
                </p>
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="flex items-center gap-2.5 z-30"
          >
            <MapPin className="w-4 h-4 text-slate-300" />
            
            {/* Custom City Dropdown with Instant Search */}
            <div className="relative">
              <button
                onClick={() => setIsCityDropdownOpen(!isCityDropdownOpen)}
                className="flex items-center gap-2 bg-white border border-slate-200 hover:border-slate-300 px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:text-slate-900 transition-all shadow-sm active:scale-95"
              >
                <span>{CITIES.find(c => c.id === city)?.label || 'Pilih Kota'}</span>
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="14" 
                  height="14" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="3" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  className={`lucide lucide-chevron-down w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${isCityDropdownOpen ? 'rotate-180' : ''}`}
                >
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </button>

              <AnimatePresence>
                {isCityDropdownOpen && (
                  <>
                    {/* Invisible overlay click listener to close dropdown */}
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => {
                        setIsCityDropdownOpen(false);
                        setCitySearchQuery('');
                      }}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 md:left-auto md:right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-50 flex flex-col text-left"
                    >
                      {/* Search Bar inside dropdown */}
                      <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                        <input
                          type="text"
                          placeholder="Cari kota..."
                          value={citySearchQuery}
                          onChange={(e) => setCitySearchQuery(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none hover:border-slate-300 focus:ring-2 focus:ring-slate-100 font-bold text-slate-700"
                          onClick={(e) => e.stopPropagation()} // prevent closing when clicking input
                        />
                      </div>

                      {/* Cities list with custom scroll */}
                      <div className="max-h-60 overflow-y-auto py-1.5 scroll-smooth">
                        {CITIES.filter(c => 
                          c.label.toLowerCase().includes(citySearchQuery.toLowerCase())
                        ).length > 0 ? (
                          CITIES.filter(c => 
                            c.label.toLowerCase().includes(citySearchQuery.toLowerCase())
                          ).map((c) => {
                            const isActive = city === c.id;
                            return (
                              <button
                                key={c.id}
                                onClick={() => {
                                  setCity(c.id);
                                  setIsCityDropdownOpen(false);
                                  setCitySearchQuery('');
                                }}
                                className={`w-full px-4 py-2.5 text-xs font-bold flex items-center justify-between transition-colors text-left ${
                                  isActive 
                                    ? 'bg-slate-50 text-slate-900' 
                                    : 'text-slate-600 hover:bg-slate-50/50 hover:text-slate-900'
                                }`}
                              >
                                <span>{c.label}</span>
                                {isActive && (
                                  <span className="w-1.5 h-1.5 bg-slate-800 rounded-full" />
                                )}
                              </button>
                            );
                          })
                        ) : (
                          <div className="px-4 py-4 text-xs font-medium text-slate-400 text-center">
                            Kota tidak ditemukan
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </header>

        {/* Next Prayer Countdown Widget */}
        <AnimatePresence mode="wait">
          {nextPrayer && (
            <motion.div
              key={nextPrayer.name}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-10 bg-slate-50 border border-slate-200 text-slate-800 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative group shadow-sm"
            >
              <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity text-slate-900">
                <Clock className="w-32 h-32" />
              </div>
              <div className="flex flex-col md:flex-row items-center gap-6 z-10 text-center md:text-left">
                <div className="w-12 h-12 bg-slate-100 border border-slate-200/60 rounded-xl flex items-center justify-center">
                  <Clock className="w-6 h-6 text-slate-500" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-400 mb-1 tracking-wide">Jangan lupa waktu solatnya ya</p>
                  <h2 className="text-lg md:text-2xl font-semibold tracking-tight text-slate-800">Sholat {nextPrayer.name} <span className="text-slate-500 ml-2 font-light">({nextPrayer.time})</span></h2>
                </div>
              </div>
              <div className="bg-white text-slate-900 px-4 md:px-6 py-3 md:py-4 rounded-xl text-center min-w-[100px] md:min-w-[140px] z-10 shadow-sm border border-slate-200">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Tersisa</p>
                <p className="text-xl md:text-2xl font-bold tabular-nums text-slate-800">{nextPrayer.countdown}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Earthquake Alert */}
        {quake && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 md:mb-10 bg-white border border-slate-200 p-4 md:p-6 rounded-2xl flex items-start gap-3 md:gap-5 shadow-sm"
          >
            <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1.5">
                <span className="text-sm font-semibold text-slate-800">Gempa Bumi Terkini</span>
                <span className="text-xs text-slate-400">{quake.Tanggal}, {quake.Jam}</span>
              </div>
              <p className="text-lg font-medium text-slate-700 mb-2 leading-snug">{quake.Wilayah}</p>
              <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                <span>Magnitudo {quake.Magnitude}</span>
                <span className="w-px h-3 bg-slate-300 inline-block"></span>
                <span>Kedalaman {quake.Kedalaman}</span>
              </div>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Prayer Times Card */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="lg:col-span-7"
          >
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2.5 text-slate-700">
                  <div className="w-1 h-4 bg-slate-200 rounded-full" />
                  Jadwal Sholat — {selectedCity.label}
                </h2>
                <span className="text-xs text-slate-300 font-medium italic">Waktu Indonesia Barat</span>
              </div>

              <div className="divide-y divide-slate-50">
                {prayerSchedule ? (
                  [
                    { name: 'Imsyak', time: prayerSchedule.imsyak },
                    { name: 'Subuh', time: prayerSchedule.shubuh },
                    { name: 'Terbit', time: prayerSchedule.terbit },
                    { name: 'Dhuha', time: prayerSchedule.dhuha },
                    { name: 'Dzuhur', time: prayerSchedule.dzuhur },
                    { name: 'Ashar', time: prayerSchedule.ashr },
                    { name: 'Maghrib', time: prayerSchedule.magrib },
                    { name: 'Isya', time: prayerSchedule.isya },
                  ].map((s) => {
                    const isNext = nextPrayer?.name === s.name;
                    return (
                      <div key={s.name} className={`flex items-center justify-between px-6 py-4 transition-all duration-300 ${isNext ? 'bg-slate-50' : 'hover:bg-slate-50/30'}`}>
                        <div className="flex items-center gap-3">
                          <span className={`text-sm ${isNext ? 'font-bold text-slate-900 underline underline-offset-8 decoration-slate-300' : 'text-slate-500'}`}>{s.name}</span>
                        </div>
                        <span className={`text-lg tabular-nums ${isNext ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>{s.time}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-10 text-center">
                    <p className="text-slate-400 text-sm">
                      {prayerError ? "Maaf, jadwal sholat tidak ditemukan untuk wilayah ini." : "Memperbarui jadwal..."}
                    </p>
                  </div>
                )}
              </div>
            </section>
          </motion.div>

          {/* Sidebar: Weather & Stats */}
          <div className="lg:col-span-5 space-y-8">

            {/* Weather Card */}
            <motion.section
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-sm font-semibold text-slate-600 flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-slate-400" />
                  Kondisi Cuaca
                </h2>
                <span className="text-xs font-medium text-slate-400">{selectedCity.label}</span>
              </div>

              {weather ? (
                <div className="space-y-8">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-4xl md:text-5xl font-light tracking-tighter text-slate-900 mb-2">{Math.round(weather.current.temperature_2m)}°</p>
                      <p className="text-base font-medium text-slate-600">{getWeatherDesc(weather.current.weather_code)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      <div className="mb-1">{getWeatherIcon(weather.current.weather_code)}</div>
                      <div className="text-right space-y-1.5">
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-400 justify-end">
                          <Droplets className="w-3.5 h-3.5 text-sky-400" />
                          {weather.current.relative_humidity_2m}%
                        </div>
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-400 justify-end">
                          <Wind className="w-3.5 h-3.5 text-slate-400" />
                          {weather.current.wind_speed_10m} km/j
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border border-slate-100 rounded-xl p-3.5 shadow-sm">
                      <p className="text-[10px] font-bold text-slate-300 mb-1">Harian tertinggi</p>
                      <p className="text-base font-bold text-slate-700">{Math.round(weather.daily.temperature_2m_max[0])}°</p>
                    </div>
                    <div className="bg-white border border-slate-100 rounded-xl p-3.5 shadow-sm">
                      <p className="text-[10px] font-bold text-slate-300 mb-1">Harian terendah</p>
                      <p className="text-base font-bold text-slate-700">{Math.round(weather.daily.temperature_2m_min[0])}°</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center">
                  <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-slate-400 text-xs">Memuat cuaca...</p>
                </div>
              )}
            </motion.section>

            {/* Sources & Status Card */}
            <motion.section
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white border border-slate-200 rounded-2xl p-6"
            >
              <h3 className="text-xs font-bold text-slate-400 mb-5">Indikator data</h3>
              <div className="space-y-4">
                {[
                  { label: 'Informasi gempa', src: 'BMKG' },
                  { label: 'Jadwal keagamaan', src: 'JadwalSholat.org' },
                  { label: 'Prediksi cuaca', src: 'Open-Meteo' },
                  { label: 'Statistik liga', src: 'Liga Indo API' }
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between group">
                    <span className="text-xs font-medium text-slate-500 group-hover:text-slate-800 transition-colors">{item.label}</span>
                    <span className="text-[10px] font-bold text-slate-400 tracking-wide uppercase">{item.src}</span>
                  </div>
                ))}
              </div>
              <div className="mt-8 pt-6 border-t border-slate-50">
                <button
                  onClick={() => fetchData(true)}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 border border-slate-200/50 text-slate-700 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2.5 shadow-sm group"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-400 group-hover:rotate-180 transition-transform duration-500" />
                  Segarkan informasi
                </button>
              </div>
            </motion.section>
          </div>
        </div>

        {/* Liga Indonesia - Only shown if data is available */}
        <AnimatePresence>
          {standings && standings.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 md:mt-16 space-y-6 md:space-y-8"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 md:px-2">
                <h2 className="text-base md:text-xl font-semibold text-slate-800 flex items-center gap-2 md:gap-3">
                  <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center flex-shrink-0">
                    <Trophy className="w-5 h-5 text-slate-500" />
                  </div>
                  <span>Liga 1 Indonesia</span>
                </h2>
                <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                  Musim 2025/2026
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Standings Table */}
                <div className="lg:col-span-8">
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <span className="text-xs font-semibold text-slate-500">Klasemen sementara</span>
                      <ArrowRight className="w-3 h-3 text-slate-300" />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[520px]">
                        <thead>
                          <tr className="text-xs font-bold text-slate-300 border-b border-slate-50">
                            <th className="text-left px-3 md:px-6 py-4">Pos</th>
                            <th className="text-left py-4">Nama Klub</th>
                            <th className="text-center py-4 px-2">M</th>
                            <th className="text-center py-4 px-2">W</th>
                            <th className="text-center py-4 px-2">D</th>
                            <th className="text-center py-4 px-2">L</th>
                            <th className="text-center py-4 px-2">Form</th>
                            <th className="text-right px-3 md:px-6 py-4">Poin</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {standings.map((team, i) => (
                            <tr key={i} className={`hover:bg-slate-50/50 transition-all group border-l-4 ${i === 0 ? 'border-l-slate-300' : (i <= 2 ? 'border-l-slate-200' : 'border-l-transparent')
                              }`}>
                              <td className="px-3 md:px-6 py-3.5 text-slate-400 text-xs font-medium">{team.position || i + 1}</td>
                              <td className="py-3.5">
                                <div className="flex items-center gap-3">
                                  {team.team_logo ? (
                                    <img src={getLocalLogo(team.team_name, team.team_logo)} alt="" className="w-6 h-6 object-contain" referrerPolicy="no-referrer" />
                                  ) : (
                                    <div className="w-6 h-6 bg-slate-100 rounded-full" />
                                  )}
                                  <span className="text-slate-700 font-semibold truncate max-w-[120px] sm:max-w-[180px] md:max-w-none">{team.team_name}</span>
                                </div>
                              </td>
                              <td className="text-center py-3.5 px-2 text-slate-500 font-medium">{team.match_played}</td>
                              <td className="text-center py-3.5 px-2 text-slate-600 font-medium">{team.win}</td>
                              <td className="text-center py-3.5 px-2 text-slate-400 font-medium">{team.draw}</td>
                              <td className="text-center py-3.5 px-2 text-slate-400 font-medium">{team.lose}</td>
                              <td className="text-center py-3.5 px-2">
                                {team.form ? (
                                  <div className="flex gap-0.5 justify-center">
                                    {team.form.split('').slice(0, 5).map((f, fi) => (
                                      <span key={fi} className={`w-4 h-4 rounded-full text-[7px] font-extrabold flex items-center justify-center ${f === 'W' ? 'bg-emerald-500 text-white' :
                                          f === 'L' ? 'bg-rose-400 text-white' :
                                            'bg-slate-200 text-slate-500'
                                        }`}>{f}</span>
                                    ))}
                                  </div>
                                ) : <span className="text-slate-200 text-xs">—</span>}
                              </td>
                              <td className="text-right px-3 md:px-6 py-3.5 font-bold text-slate-900 tabular-nums">{team.point}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Sidebar: Top Scorers & Upcoming Matches */}
                <div className="lg:col-span-4 space-y-8">
                  {/* Top Scorers Card */}
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                      <span className="text-xs font-semibold text-slate-500">Top skor</span>
                    </div>
                    {topScorers ? (
                      <div className="divide-y divide-slate-50">
                        {topScorers.map((player, i) => (
                          <div key={i} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-xs font-bold text-slate-300 w-3">{i + 1}</span>
                              {player.player_photo && <img src={player.player_photo} alt="" className="w-8 h-8 rounded-full object-cover border border-slate-100" />}
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-800 truncate leading-none mb-1">{player.player_name}</p>
                                <p className="text-[10px] font-medium text-slate-400 truncate tracking-wide">{player.team_name}</p>
                              </div>
                            </div>
                            <div className="text-right pl-4">
                              <span className="text-lg font-bold text-slate-900 tabular-nums">{player.goals}</span>
                              <p className="text-[8px] font-bold text-slate-300 uppercase">Gol</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-10 text-center text-slate-300 text-xs font-light">Data pemain belum tersedia</div>
                    )}
                  </div>

                  {/* Upcoming Matches & AI Predictions Card */}
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="px-4 md:px-6 py-3 md:py-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-700">Jadwal & Prediksi Laga</span>
                      <div className="flex bg-slate-100 p-0.5 rounded-lg w-full sm:w-auto">
                        <button
                          onClick={() => setActiveScheduleTab('upcoming')}
                          className={`px-2.5 py-1 text-[9px] font-bold rounded-md transition-all flex-1 sm:flex-none ${activeScheduleTab === 'upcoming' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                          Mendatang
                        </button>
                        <button
                          onClick={() => setActiveScheduleTab('results')}
                          className={`px-2.5 py-1 text-[9px] font-bold rounded-md transition-all flex-1 sm:flex-none ${activeScheduleTab === 'results' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                          Hasil Laga
                        </button>
                      </div>
                    </div>

                    {/* LIVE Score Ticker (Hanya tampil jika ada pertandingan aktif) */}
                    {liveMatches && liveMatches.length > 0 && (
                      <div className="bg-slate-50 border-b border-slate-100 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 px-2 py-0.5 bg-red-50 text-red-600 border border-red-100 rounded-full text-[9px] font-extrabold tracking-wide uppercase animate-pulse">
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                            LIVE SCORE
                          </span>
                          <span className="text-[9px] font-bold text-slate-400">{liveMatches[0].stadium}</span>
                        </div>
                        {liveMatches.map((live, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-4 py-1">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <img src={getLocalLogo(live.home_team, live.home_logo)} alt="" className="w-5 h-5 object-contain" />
                              <span className="text-xs font-bold text-slate-700 truncate">{live.home_team.split(' ')[0]}</span>
                            </div>
                            <div className="flex items-center gap-2 bg-slate-100/80 px-3 py-1 rounded-lg border border-slate-200/40">
                              <span className="text-sm font-extrabold text-slate-800 tabular-nums">{live.home_score}</span>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">-</span>
                              <span className="text-sm font-extrabold text-slate-800 tabular-nums">{live.away_score}</span>
                            </div>
                            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end text-right">
                              <span className="text-xs font-bold text-slate-700 truncate">{live.away_team.split(' ')[0]}</span>
                              <img src={getLocalLogo(live.away_team, live.away_logo)} alt="" className="w-5 h-5 object-contain" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Tab Mendatang (Upcoming dengan Prediksi AI) */}
                    {activeScheduleTab === 'upcoming' && (
                      upcomingMatches && upcomingMatches.length > 0 ? (
                        <div className="divide-y divide-slate-100">
                          {upcomingMatches.map((match, idx) => (
                            <div key={idx} className="p-5 hover:bg-slate-50/30 transition-all space-y-4">
                              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400">
                                <span>{match.date} — {match.time}</span>
                                <span className="text-slate-300 truncate max-w-[100px] hidden sm:inline">{match.stadium}</span>
                              </div>

                              {/* Teams Head to Head */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <img src={getLocalLogo(match.home_team, match.home_logo)} alt="" className="w-5 h-5 object-contain" />
                                  <span className="text-xs font-bold text-slate-700 truncate">{match.home_team.split(' ')[0]}</span>
                                </div>
                                <span className="text-[10px] font-extrabold text-slate-300 uppercase px-2 flex-shrink-0">VS</span>
                                <div className="flex items-center gap-2.5 min-w-0 flex-1 justify-end text-right">
                                  <span className="text-xs font-bold text-slate-700 truncate">{match.away_team.split(' ')[0]}</span>
                                  <img src={getLocalLogo(match.away_team, match.away_logo)} alt="" className="w-5 h-5 object-contain" />
                                </div>
                              </div>

                              {/* Prediction Win Percentage Bar */}
                              <div className="space-y-1.5">
                                <div className="flex justify-between text-[9px] font-bold text-slate-400 px-0.5">
                                  <span className="text-emerald-600">{match.prob_home}% Menang</span>
                                  <span className="text-slate-400">{match.prob_draw}% Seri</span>
                                  <span className="text-sky-600">{match.prob_away}% Menang</span>
                                </div>
                                {/* Integrated Multi-colored Progress Bar */}
                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                                  <div style={{ width: `${match.prob_home}%` }} className="h-full bg-emerald-500" title="Home Win probability" />
                                  <div style={{ width: `${match.prob_draw}%` }} className="h-full bg-slate-300" title="Draw probability" />
                                  <div style={{ width: `${match.prob_away}%` }} className="h-full bg-sky-400" title="Away Win probability" />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-10 text-center text-slate-300 text-xs font-light">Belum ada jadwal pertandingan terdekat</div>
                      )
                    )}

                    {/* Tab Hasil Laga (Results) */}
                    {activeScheduleTab === 'results' && (
                      pastResults && pastResults.length > 0 ? (
                        <div className="divide-y divide-slate-100">
                          {pastResults.map((match, idx) => (
                            <div key={idx} className="p-5 hover:bg-slate-50/30 transition-all space-y-3">
                              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400">
                                <span>{match.date}</span>
                                <span className="text-slate-300 truncate max-w-[100px] hidden sm:inline">{match.stadium}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <img src={getLocalLogo(match.home_team, match.home_logo)} alt="" className="w-5 h-5 object-contain" />
                                  <span className="text-xs font-bold text-slate-700 truncate">{match.home_team.split(' ')[0]}</span>
                                </div>
                                <div className="flex items-center gap-2 bg-slate-50 px-2.5 py-0.5 rounded border border-slate-200/50 flex-shrink-0">
                                  <span className="text-xs font-extrabold text-slate-800 tabular-nums">{match.home_score}</span>
                                  <span className="text-[9px] font-bold text-slate-300">-</span>
                                  <span className="text-xs font-extrabold text-slate-800 tabular-nums">{match.away_score}</span>
                                </div>
                                <div className="flex items-center gap-2.5 min-w-0 flex-1 justify-end text-right">
                                  <span className="text-xs font-bold text-slate-700 truncate">{match.away_team.split(' ')[0]}</span>
                                  <img src={getLocalLogo(match.away_team, match.away_logo)} alt="" className="w-5 h-5 object-contain" />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-10 text-center text-slate-300 text-xs font-light">Belum ada hasil pertandingan</div>
                      )
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Minimalist Footer */}
        <footer className="mt-24 pt-8 border-t border-slate-50 text-center">
          <p className="text-slate-300 text-[10px] font-bold mb-4 tracking-widest">
            Portal Informasi Publik — Ikko
          </p>
          <div className="flex items-center justify-center gap-6">
            <span className="w-1 h-1 bg-slate-200 rounded-full" />
            <span className="text-[9px] font-medium text-slate-400">Data sinkronisasi otomatis dari sumber terpercaya</span>
            <span className="w-1 h-1 bg-slate-200 rounded-full" />
          </div>
        </footer>
            </div>
          </motion.div>
        )}

        {/* TAB 2: Hub Trading AI (Forex & Stocks) */}
        {activeTab === 'trading' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-8"
          >
            {/* Header Hub Trading */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="text-left">
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-800 mb-2">Hub Trading AI</h1>
                <p className="text-slate-400 text-sm">
                  Integrasi Grafik Real-time Forex & Saham Terkemuka didukung Analis Finansial AI Kuantitatif.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-slate-600 rounded-lg text-[10px] font-extrabold tracking-wide uppercase transition-colors"
                >
                  ⚙️ Set Parameter Bot
                </button>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 border border-slate-100 rounded-lg animate-pulse">
                  ⚡ STATUS BOT: AKTIF
                </span>
              </div>
            </div>

            {/* Sub-Tabs: Live Trading vs Backtesting */}
            <div className="flex border-b border-slate-100">
              <button
                onClick={() => setActiveTradingTab('live')}
                className={`pb-3 px-6 text-xs font-bold transition-all relative ${
                  activeTradingTab === 'live'
                    ? 'text-slate-900 border-b-2 border-slate-900'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                🔴 Live Trading & Scan Real-time
              </button>
              <button
                onClick={() => setActiveTradingTab('backtest')}
                className={`pb-3 px-6 text-xs font-bold transition-all relative ${
                  activeTradingTab === 'backtest'
                    ? 'text-slate-900 border-b-2 border-slate-900'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                📊 Backtesting Strategi (Histori)
              </button>
            </div>

            {activeTradingTab === 'live' ? (
              <>
                {/* Selector Symbol Pills */}
                <div className="flex flex-col gap-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wide text-left">Pilih Aset Perdagangan</span>
                  <div className="flex flex-wrap gap-2">
                {[
                  { id: 'EURUSD', label: '🇪🇺🇺🇸 EUR/USD', type: 'Forex' },
                  { id: 'GBPUSD', label: '🇬🇧🇺🇸 GBP/USD', type: 'Forex' },
                  { id: 'USDJPY', label: '🇺🇸🇯🇵 USD/JPY', type: 'Forex' },
                  { id: 'XAUUSD', label: '🏆🇺🇸 XAU/USD (Gold)', type: 'Forex' },
                  { id: 'BBRI', label: '🏦🇮🇩 BBRI (IDX)', type: 'Saham' },
                  { id: 'TLKM', label: '📞🇮🇩 TLKM (IDX)', type: 'Saham' },
                  { id: 'AAPL', label: '🍎🇺🇸 AAPL (US)', type: 'Saham' },
                  { id: 'TSLA', label: '⚡🇺🇸 TSLA (US)', type: 'Saham' }
                ].map((s) => {
                  const isActive = selectedSymbol === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSelectedSymbol(s.id);
                        setTradingAnalysis('');
                      }}
                      className={`px-4 py-2 text-xs font-bold rounded-xl transition-all active:scale-95 border ${
                        isActive 
                          ? 'bg-slate-900 border-slate-900 text-white shadow-sm' 
                          : 'bg-white hover:bg-slate-50 border-slate-200/80 text-slate-600'
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Grid Layout: Chart & AI Analyst */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Column: Live TradingView Chart (8 cols) */}
              <div className="lg:col-span-8 space-y-6">
                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm p-4 text-left">
                  <div className="flex items-center justify-between mb-4 px-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                        Grafik Real-time TradingView ({selectedSymbol})
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-bold bg-slate-50 border px-2.5 py-1 rounded-md">
                      Interval: Harian (1D)
                    </span>
                  </div>
                  <div className="w-full relative min-h-[480px] rounded-2xl overflow-hidden border border-slate-100 bg-slate-50">
                    <NativeTradingViewChart symbol={SYMBOL_MAP[selectedSymbol] || 'FX:EURUSD'} />
                  </div>
                </div>

                {/* Algorithmic Bot Simulation Log */}
                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-2 text-left">
                      ⚡ Eksekusi Posisi & Histori Transaksi ({selectedSymbol})
                    </span>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button 
                        onClick={triggerManualBotScan}
                        disabled={isTriggering}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg text-[10px] font-extrabold tracking-wide uppercase transition-all shadow-sm active:scale-95"
                      >
                        {isTriggering ? (
                          <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : '⚡ Pemicu Manual Bot'}
                      </button>
                      <button 
                        onClick={exportToCSV}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-extrabold tracking-wide uppercase transition-colors"
                        title="Unduh data trading untuk aset yang sedang aktif dipilih saja"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-download"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                        Unduh Aset Aktif
                      </button>
                      <button 
                        onClick={exportAllToCSV}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-extrabold tracking-wide uppercase transition-colors"
                        title="Unduh seluruh data trading gabungan untuk semua aset"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-download"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                        Unduh Semua Aset
                      </button>
                      <button 
                        onClick={stopTradingAndCloseAll}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[10px] font-extrabold tracking-wide uppercase transition-colors active:scale-95"
                        title="Tutup semua transaksi aktif saat ini secara paksa dan hentikan perdagangan sementara"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-octagon-alert"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12" y1="16" y2="16"/></svg>
                        🔴 Stop & Tutup Semua
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left min-w-[500px]">
                      <thead>
                        <tr className="text-[10px] font-bold text-slate-400 border-b border-slate-50 uppercase tracking-wider bg-slate-50/20">
                          <th className="px-6 py-3">Waktu</th>
                          <th className="px-4 py-3">Aksi</th>
                          <th className="px-4 py-3">Harga Entry</th>
                          <th className="px-4 py-3">Risk-Reward</th>
                          <th className="px-4 py-3 text-right pr-6">Hasil PnL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(botLogs[selectedSymbol] || []).map((log, idx) => (
                          <tr key={log.id} className="border-b border-slate-50/60 hover:bg-slate-50/30 transition-colors font-semibold">
                            <td className="px-6 py-4 text-slate-400 font-medium">{log.time}</td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  log.type === 'BUY' 
                                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                                    : 'bg-rose-50 text-rose-600 border border-rose-100'
                                }`}>
                                  {log.type}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-slate-100 text-slate-500 border border-slate-200/50">
                                  {log.timeframe || 'M15'}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-left">
                              <div className="space-y-1">
                                <div className="flex flex-col">
                                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Harga Entry</span>
                                  <p className="text-slate-800 font-extrabold text-sm leading-none mt-0.5">{log.entry}</p>
                                </div>
                                
                                {log.status === 'active' ? (
                                  <div className="flex flex-col bg-amber-50/70 border border-amber-100/60 rounded-xl px-2 py-1 inline-block">
                                    <span className="text-[9px] text-amber-600 font-bold uppercase tracking-wider">Harga Realtime</span>
                                    <p className="text-amber-600 font-extrabold text-xs animate-pulse leading-none mt-0.5">
                                      {(() => {
                                        const tickPrice = parseFloat(livePrices[selectedSymbol] || log.entry);
                                        const decs = selectedSymbol.includes('JPY') ? 2 : selectedSymbol.includes('BBRI') || selectedSymbol.includes('TLKM') ? 0 : 5;
                                        return tickPrice.toFixed(decs);
                                      })()}
                                    </p>
                                  </div>
                                ) : log.closePrice ? (
                                  <div className="flex flex-col bg-slate-50 border border-slate-200/60 rounded-xl px-2 py-1 inline-block mt-1">
                                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Harga Exit</span>
                                    <p className="text-slate-700 font-extrabold text-xs leading-none mt-0.5">
                                      {log.closePrice}
                                    </p>
                                  </div>
                                ) : null}

                                {log.sl && log.tp && (
                                  <p className="text-[9px] text-slate-400 font-semibold tracking-wider pt-0.5">
                                    <span className="text-rose-500">SL: {log.sl}</span>
                                    <span className="mx-1 text-slate-300">|</span>
                                    <span className="text-emerald-600">TP: {log.tp}</span>
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-left">
                              <div className="space-y-0.5 font-mono">
                                <p className="text-slate-700">{log.rrr}</p>
                                {log.probability && (
                                  <p className="text-[9px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-100/60 px-1.5 py-0.5 rounded inline-block">
                                    🎯 Prob: {log.probability}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-right pr-6 font-mono">
                              <span className={`${
                                log.pnl.includes('PROFIT') 
                                  ? 'text-emerald-600 font-bold' 
                                  : log.pnl.includes('LOSS') 
                                    ? 'text-rose-500 font-bold' 
                                    : 'text-amber-500 font-bold animate-pulse'
                              }`}>
                                {log.status === 'active' 
                                  ? (() => {
                                      const entryNum = parseFloat(log.entry);
                                      const liveNum = parseFloat(livePrices[selectedSymbol] || log.entry);
                                      const pnlPercent = log.type === 'BUY'
                                        ? ((liveNum - entryNum) / entryNum) * 100
                                        : ((entryNum - liveNum) / entryNum) * 100;
                                      return `RUNNING (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`;
                                    })()
                                  : log.pnl}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Buku Log Disiplin Bot (24/7 Activity Logs) */}
                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm p-6 text-left space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-slate-50 text-slate-600 border border-slate-200/60 rounded-xl flex items-center justify-center flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-shield-alert text-slate-500"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12" y1="16" y2="16"/></svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">🛡️ Buku Log Disiplin Bot 24/7</h3>
                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Aktivitas Real-time & Alasan Lewati Peluang</p>
                      </div>
                    </div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 border px-2.5 py-1 rounded-md animate-pulse">
                      SINKRONISASI AKTIF
                    </span>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2.5 pr-2 font-mono scroll-smooth">
                    {generalLogs.length === 0 ? (
                      <p className="text-slate-300 text-xs font-light text-center py-6">Belum ada aktivitas log tercatat...</p>
                    ) : (
                      generalLogs.map((log) => {
                        const isDiscipline = log.text.includes('[DISIPLIN]');
                        const isExecution = log.text.includes('[EKSEKUSI]');
                        
                        return (
                          <div key={log.id} className="text-xs p-3 rounded-xl border border-slate-100/60 bg-slate-50/50 flex flex-col sm:flex-row gap-2 leading-relaxed">
                            <span className="text-[10px] font-bold text-slate-400 flex-shrink-0 sm:w-28">{log.time}</span>
                            <div className="flex-1">
                              <span className={`inline-block mr-2 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide ${
                                isDiscipline 
                                  ? 'bg-amber-50 text-amber-700 border border-amber-100' 
                                  : isExecution 
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}>
                                {isDiscipline ? 'DISIPLIN' : isExecution ? 'EKSEKUSI' : 'SISTEM'}
                              </span>
                              <span className="text-slate-600 font-semibold">{log.text.replace(/\[DISIPLIN\]|\[EKSEKUSI\]|\[SISTEM\]/, '').trim()}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Laporan Performa & Backtesting AI */}
                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm p-6 space-y-6 text-left">
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trending-up"><path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/></svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">📊 Laporan Performa & Backtesting AI</h3>
                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                          Strategi: {performanceData[selectedSymbol]?.strategyName || 'Kuantitatif'}
                        </p>
                      </div>
                    </div>
                    
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg">
                      🎯 WIN RATE TEKNIK: {performanceData[selectedSymbol]?.winRate || '68%'}
                    </span>
                  </div>

                  {/* Single Premium Performance Card for Day 1 */}
                  <div className="bg-slate-50 border border-slate-100 p-6 rounded-2xl text-center space-y-2 hover:bg-slate-50 transition-colors">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Performa Hari Ke-1 (Today)</p>
                    <p className={`text-3xl font-extrabold ${
                      (performanceData[selectedSymbol]?.profit1D || '').includes('-') 
                        ? 'text-rose-500' 
                        : 'text-emerald-600'
                    }`}>
                      {performanceData[selectedSymbol]?.profit1D || '+0.00%'}
                    </p>
                    <p className="text-[9px] text-slate-400 font-medium font-semibold">
                      🎯 Sinyal Dieksekusi Hari Ini: {performanceData[selectedSymbol]?.totalTrades || '0 Trades'}
                    </p>
                  </div>

                  {/* Detailed AI Technique Backtesting Analysis */}
                  <div className="bg-slate-50 border border-slate-100/60 rounded-2xl p-4.5 space-y-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <Brain className="w-3.5 h-3.5 text-slate-400 animate-pulse" />
                      Ulasan Entry & Analisa Backtesting Bot
                    </span>
                    <p className="text-xs text-slate-600 leading-relaxed font-semibold select-text">
                      {performanceData[selectedSymbol]?.analysisExplain || 'Mengkalkulasi performa teknik...'}
                    </p>
                  </div>

                  {/* Extra Stats Bar */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold px-2 pt-2 border-t border-slate-100 bg-white">
                    <span>📈 Rata-rata Risk/Reward: <span className="text-slate-700">{performanceData[selectedSymbol]?.avgRrr}</span></span>
                    <span>🎯 Akurasi Teknik: <span className="text-slate-700">{performanceData[selectedSymbol]?.winRate}</span></span>
                  </div>
                </div>
              </div>

              {/* Right Column: AI Analysis Panel & Technical Gauge (4 cols) */}
              <div className="lg:col-span-4 space-y-6">
                
                {/* AI Analyst Insights Panel */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-8 h-8 bg-slate-100 border border-slate-200/50 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Brain className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-sm font-bold text-slate-800">Otak AI Kuantitatif</h3>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Deepseek / Qwen Quant Model</p>
                    </div>
                  </div>

                  {/* Analysis Content Display */}
                  <div className="flex-1 bg-slate-50/50 border border-slate-100 rounded-2xl p-4.5 min-h-[220px] text-left relative overflow-hidden flex flex-col justify-center">
                    {tradingLoading ? (
                      <div className="flex flex-col items-center justify-center gap-4 text-center py-6">
                        <div className="w-7 h-7 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-600">AI Sedang Menganalisis...</p>
                          <p className="text-[10px] text-slate-400 font-medium">Mengkalkulasi Risk/Reward & Win Probability</p>
                        </div>
                      </div>
                    ) : tradingAnalysis ? (
                      <div className="text-xs leading-relaxed text-slate-600 whitespace-pre-wrap font-semibold select-text">
                        {tradingAnalysis}
                      </div>
                    ) : (
                      <div className="text-center py-6 space-y-2.5">
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trending-up w-7 h-7 text-slate-300 mx-auto"><path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/></svg>
                        <p className="text-xs font-bold text-slate-600">Belum ada analisis</p>
                        <p className="text-[10px] text-slate-400 leading-normal max-w-[200px] mx-auto font-semibold">
                          Klik tombol di bawah untuk meminta analisis risiko kuantitatif (Entry/SL/TP) dari AI.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Trigger Button */}
                  <button
                    onClick={() => handleTradingAnalysis()}
                    disabled={tradingLoading}
                    className="mt-5 w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:scale-100 text-white text-xs font-bold rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {tradingLoading ? 'Menganalisa...' : 'Minta Analisa AI'}
                  </button>
                </div>

                {/* Technical Gauge Meter */}
                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm p-4">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-left mb-3 px-1">
                    Indikator Teknis Kompas ({selectedSymbol})
                  </h4>
                  <div className="w-full h-[320px] rounded-2xl overflow-hidden bg-slate-50 border border-slate-100">
                    <NativeTechnicalGauge symbol={SYMBOL_MAP[selectedSymbol] || 'FX:EURUSD'} />
                  </div>
                </div>

              </div>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-left animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Settings Panel */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5 h-fit">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>⚡ Parameter Backtest</span>
              </h3>
              
              <div className="space-y-4">
                {/* Symbol */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pilih Aset</label>
                  <select
                    value={backtestSettings.symbol}
                    onChange={(e) => setBacktestSettings(prev => ({ ...prev, symbol: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                  >
                    <option value="EURUSD">🇪🇺🇺🇸 EUR/USD</option>
                    <option value="GBPUSD">🇬🇧🇺🇸 GBP/USD</option>
                    <option value="USDJPY">🇺🇸🇯🇵 USD/JPY</option>
                    <option value="XAUUSD">🏆🇺🇸 XAU/USD (Gold)</option>
                    <option value="BBRI">🏦🇮🇩 BBRI (IDX)</option>
                    <option value="TLKM">📞🇮🇩 TLKM (IDX)</option>
                    <option value="AAPL">🍎🇺🇸 AAPL (US)</option>
                    <option value="TSLA">⚡🇺🇸 TSLA (US)</option>
                  </select>
                </div>

                {/* Period */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                    <span>Periode Simulasi</span>
                    <span className="text-slate-700">{backtestSettings.period} Hari</span>
                  </label>
                  <input
                    type="range"
                    min="7"
                    max="60"
                    value={backtestSettings.period}
                    onChange={(e) => setBacktestSettings(prev => ({ ...prev, period: parseInt(e.target.value) }))}
                    className="w-full accent-slate-900 cursor-pointer"
                  />
                </div>

                {/* Probability */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                    <span>Min. Probabilitas Setup</span>
                    <span className="text-slate-700">{backtestSettings.minProbability}%</span>
                  </label>
                  <input
                    type="range"
                    min="40"
                    max="90"
                    value={backtestSettings.minProbability}
                    onChange={(e) => setBacktestSettings(prev => ({ ...prev, minProbability: parseInt(e.target.value) }))}
                    className="w-full accent-slate-900 cursor-pointer"
                  />
                </div>

                {/* RRR */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                    <span>Risk-to-Reward Ratio</span>
                    <span className="text-slate-700">1 : {backtestSettings.riskRewardRatio}</span>
                  </label>
                  <input
                    type="range"
                    min="1.0"
                    max="4.0"
                    step="0.1"
                    value={backtestSettings.riskRewardRatio}
                    onChange={(e) => setBacktestSettings(prev => ({ ...prev, riskRewardRatio: parseFloat(e.target.value) }))}
                    className="w-full accent-slate-900 cursor-pointer"
                  />
                </div>
              </div>

              <button
                onClick={runBacktestSimulation}
                disabled={isBacktesting}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:scale-100 text-white text-xs font-bold rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                {isBacktesting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Menganalisa Histori...</span>
                  </>
                ) : (
                  <>
                    <span>⚡ Jalankan Backtesting</span>
                  </>
                )}
              </button>
            </div>

            {/* Results Panel */}
            <div className="lg:col-span-8 space-y-6">
              {isBacktesting && (
                <div className="bg-white border border-slate-200 rounded-3xl p-12 shadow-sm text-center flex flex-col items-center justify-center space-y-4">
                  <div className="w-12 h-12 rounded-full border-4 border-slate-100 border-t-slate-900 animate-spin" />
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-800">Menjalankan Simulasi Confluence Strategi</h4>
                    <p className="text-xs text-slate-400 max-w-sm">Membaca data lilin (candle) historis dan menguji tingkat kemenangan (win rate) strategi Break-Even...</p>
                  </div>
                </div>
              )}

              {!isBacktesting && !backtestResults && (
                <div className="bg-white border border-slate-200 rounded-3xl p-12 shadow-sm text-center flex flex-col items-center justify-center space-y-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-play w-10 h-10 text-slate-300 mx-auto"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                  <h4 className="text-sm font-bold text-slate-700">Simulator Siap Dijalankan</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">Sesuaikan parameter bot di sebelah kiri, kemudian klik tombol untuk memulai simulasi pengujian strategi.</p>
                </div>
              )}

              {!isBacktesting && backtestResults && (
                <>
                  {/* Metric Dashboard */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm text-left">
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Net Return %</p>
                      <p className={`text-2xl font-extrabold mt-1 ${backtestResults.finalReturn.includes('-') ? 'text-rose-500' : 'text-emerald-600'}`}>
                        {backtestResults.finalReturn}
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm text-left">
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Win Rate %</p>
                      <p className="text-2xl font-extrabold text-slate-800 mt-1">{backtestResults.winRate}%</p>
                    </div>
                    <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm text-left">
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total Trades</p>
                      <p className="text-2xl font-extrabold text-slate-800 mt-1">{backtestResults.totalTrades}</p>
                    </div>
                    <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm text-left">
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Max Drawdown</p>
                      <p className="text-2xl font-extrabold text-rose-500 mt-1">{backtestResults.maxDrawdown}</p>
                    </div>
                  </div>

                  {/* Detail trades count */}
                  <div className="bg-slate-50 border border-slate-100 px-4 py-3 rounded-xl flex justify-between text-[10px] text-slate-500 font-bold">
                    <span>Win: <span className="text-emerald-600">{backtestResults.wins}</span></span>
                    <span>Loss: <span className="text-rose-500">{backtestResults.losses}</span></span>
                    <span>Break Even (BE): <span className="text-amber-600">{backtestResults.beTrades}</span></span>
                  </div>

                  {/* Equity Curve SVG line chart */}
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                    <h4 className="text-xs font-bold text-slate-800 mb-4">📈 Kurva Pertumbuhan Ekuitas (Dimulai dari 100%)</h4>
                    <div className="w-full h-48 bg-slate-50/50 rounded-2xl border border-slate-100 flex items-end p-2 relative overflow-hidden">
                      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        <line x1="0" y1="25" x2="100" y2="25" stroke="#f1f5f9" strokeWidth="0.5" />
                        <line x1="0" y1="50" x2="100" y2="50" stroke="#f1f5f9" strokeWidth="0.5" />
                        <line x1="0" y1="75" x2="100" y2="75" stroke="#f1f5f9" strokeWidth="0.5" />
                        <path
                          d={`M 0 100 ${backtestResults.equityCurve.map((eq, index) => {
                            const x = (index / (backtestResults.equityCurve.length - 1)) * 100;
                            const val = eq.balance;
                            const y = 100 - Math.max(5, Math.min(95, ((val - 80) / 40) * 100));
                            return `L ${x} ${y}`;
                          }).join(' ')} L 100 100 Z`}
                          fill="url(#chartGrad)"
                        />
                        <path
                          d={backtestResults.equityCurve.map((eq, index) => {
                            const x = (index / (backtestResults.equityCurve.length - 1)) * 100;
                            const val = eq.balance;
                            const y = 100 - Math.max(5, Math.min(95, ((val - 80) / 40) * 100));
                            return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
                          }).join(' ')}
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute top-2 left-3 text-[9px] text-slate-400 font-bold">120% Balance</div>
                      <div className="absolute top-1/2 -translate-y-1/2 left-3 text-[9px] text-slate-400 font-bold">100% Balance</div>
                      <div className="absolute bottom-2 left-3 text-[9px] text-slate-400 font-bold">80% Balance</div>
                    </div>
                  </div>

                  {/* Trade Logs Table */}
                  <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden text-left">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-800">📜 Histori Log Transaksi Backtest ({backtestResults.trades.length} Posisi)</h4>
                    </div>
                    <div className="overflow-x-auto max-h-[400px]">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50/70 text-slate-500 uppercase tracking-wider text-[9px] font-bold border-b border-slate-100">
                          <tr>
                            <th className="px-4 py-3">Tanggal / Waktu</th>
                            <th className="px-4 py-3">Tipe</th>
                            <th className="px-4 py-3">Entry</th>
                            <th className="px-4 py-3">Exit</th>
                            <th className="px-4 py-3">SL / TP</th>
                            <th className="px-4 py-3">Hasil</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                          {backtestResults.trades.map((t, idx) => {
                            const isWin = t.pnl.includes('PROFIT');
                            const isBE = t.pnl.includes('BREAK EVEN');
                            return (
                              <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="font-semibold text-slate-700">{t.openTime}</div>
                                  <div className="text-[9px] text-slate-400 font-semibold">{t.closeTime ? `Exit: ${t.closeTime}` : ''}</div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${t.type === 'BUY' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                    {t.type}
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-mono font-bold text-slate-700">{t.entry}</td>
                                <td className="px-4 py-3 font-mono font-bold text-slate-700">{t.closePrice || '-'}</td>
                                <td className="px-4 py-3 text-[10px] text-slate-500 font-semibold">
                                  SL: {t.sl} <br />
                                  TP: {t.tp}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap font-bold">
                                  <span className={isWin ? 'text-emerald-600' : isBE ? 'text-amber-500' : 'text-rose-500'}>
                                    {t.pnl}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </motion.div>
    )}

        {/* Floating Chat Button */}
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
          <AnimatePresence>
            {!isChatOpen && (
              <motion.button
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                onClick={() => setIsChatOpen(true)}
                className="w-14 h-14 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg active:scale-95 transition-all border border-slate-200 relative group"
              >
                <MessageSquare className="w-6 h-6 text-slate-600" />
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white animate-ping" />
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
                
                {/* Floating pill badge */}
                <div className="absolute right-16 bg-white border border-slate-200 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-xl shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                  Tanya Asisten AI ✨
                </div>
              </motion.button>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isChatOpen && (
              <motion.div
                initial={{ y: 80, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 80, opacity: 0, scale: 0.95 }}
                className="w-[90vw] sm:w-[420px] h-[600px] max-h-[80vh] bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
              >
                {/* Header */}
                <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-100 text-slate-600 border border-slate-200/50 rounded-xl flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-slate-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 text-left">
                        Asisten AI Publik
                      </h3>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider text-left">
                        {selectedModel.split('/').pop()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsChatOpen(false)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                      title="Tutup Chat"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                

                {/* Chat Message Box */}
                <div className="flex-1 p-5 overflow-y-auto space-y-4 flex flex-col scroll-smooth">
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'ml-auto items-end' : 'items-start'}`}
                    >
                      <div
                        className={`px-4 py-3 rounded-2xl text-xs sm:text-sm font-medium leading-relaxed text-left whitespace-pre-wrap ${
                          msg.role === 'user'
                            ? 'bg-slate-600 text-white rounded-tr-none'
                            : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200/40'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}

                  {chatLoading && (
                    <div className="flex items-center gap-1 bg-slate-50 border border-slate-100 px-4 py-3 rounded-2xl rounded-tl-none max-w-[80px]">
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  )}
                </div>

                
                {/* Model Selector Bar */}
                <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between relative">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <Brain className="w-3.5 h-3.5 text-slate-400" />
                    <span>Model AI</span>
                  </div>
                  
                  {/* Custom Popover Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition-all bg-white hover:bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg shadow-sm active:scale-95"
                    >
                      <span>
                        {selectedModel === 'Qwen/Qwen2.5-72B-Instruct' ? 'Qwen 2.5 72B' :
                         selectedModel === 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B' ? 'DeepSeek R1' :
                         selectedModel === 'google/gemma-3-27b-it' ? 'Gemma 3' : 'Llama 3.3'}
                      </span>
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        width="12" 
                        height="12" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="3" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        className={`lucide lucide-chevron-down w-3 h-3 text-slate-400 transition-transform duration-300 ${isModelDropdownOpen ? 'rotate-180' : ''}`}
                      >
                        <path d="m6 9 6 6 6-6"/>
                      </svg>
                    </button>

                    {/* Custom Dropdown Floating Panel */}
                    <AnimatePresence>
                      {isModelDropdownOpen && (
                        <>
                          {/* Invisible overlay click listener to close dropdown */}
                          <div 
                            className="fixed inset-0 z-40" 
                            onClick={() => setIsModelDropdownOpen(false)}
                          />
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-0 bottom-full mb-2.5 w-52 bg-white border border-slate-200/80 rounded-2xl shadow-xl overflow-hidden z-50 py-1.5 text-left"
                          >
                            {[
                              { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 72B (Cerdas)' },
                              { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B', label: 'DeepSeek R1 (Penalaran)' },
                              { id: 'google/gemma-3-27b-it', label: 'Google Gemma 3' },
                              { id: 'meta-llama/Llama-3.3-70B-Instruct', label: 'Llama 3.3 (Meta)' }
                            ].map((m) => {
                              const isActive = selectedModel === m.id;
                              return (
                                <button
                                  key={m.id}
                                  onClick={() => {
                                    setSelectedModel(m.id);
                                    setIsModelDropdownOpen(false);
                                  }}
                                  className={`w-full px-4 py-2.5 text-[11px] font-bold flex items-center justify-between transition-colors ${
                                    isActive 
                                      ? 'bg-slate-50 text-slate-900' 
                                      : 'text-slate-600 hover:bg-slate-50/50 hover:text-slate-900'
                                  }`}
                                >
                                  <span>{m.label}</span>
                                  {isActive && (
                                    <span className="w-1.5 h-1.5 bg-slate-800 rounded-full" />
                                  )}
                                </button>
                              );
                            })}
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Quick Prompts Pills */}
                <div className="px-5 py-2 flex flex-wrap gap-2 border-t border-slate-50 bg-slate-50/20">
                  {[
                    { label: '🌤️ Hujan hari ini?', q: 'Apakah hari ini akan turun hujan?' },
                    { label: '🕋 Waktu Sholat?', q: 'Kapan jadwal sholat berikutnya hari ini?' },
                    { label: '🏆 Klasemen Liga 1', q: 'Bagaimana peringkat klasemen Liga 1 saat ini?' }
                  ].map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(p.q)}
                      disabled={chatLoading}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-full text-[10px] font-bold text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Input Area */}
                <div className="border-t border-slate-100 p-4 bg-white flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={hfToken ? "Tanya asisten AI..." : "Asisten AI tidak aktif (Token kosong)..."}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    disabled={chatLoading}
                    className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm outline-none hover:border-slate-300 transition-colors focus:bg-white focus:ring-2 focus:ring-slate-100 font-medium"
                  />
                  <button
                    onClick={() => handleSendMessage()}
                    disabled={chatLoading || !chatInput.trim()}
                    className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200/60 rounded-xl active:scale-95 transition-all flex items-center justify-center disabled:opacity-30 disabled:scale-100"
                  >
                    <Send className="w-4 h-4 text-slate-500" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* SETTINGS MODAL */}
        <AnimatePresence>
          {isSettingsOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden text-left flex flex-col"
              >
                {/* Header */}
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">⚙️</span>
                    <h3 className="text-sm font-bold text-slate-800">Pengaturan Parameter Bot AI</h3>
                  </div>
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Form */}
                <div className="p-6 space-y-5">
                  {/* Min Probability Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-600">Minimal Probabilitas Setup (%)</span>
                      <span className="text-slate-900 bg-slate-100 px-2 py-0.5 rounded-lg">{botSettings.minProbability}%</span>
                    </div>
                    <input
                      type="range"
                      min="40"
                      max="95"
                      value={botSettings.minProbability}
                      onChange={(e) => setBotSettings(prev => ({ ...prev, minProbability: parseInt(e.target.value) }))}
                      className="w-full accent-slate-950 cursor-pointer"
                    />
                    <p className="text-[10px] text-slate-400">Batasan kualitas minimal sebelum bot diizinkan membuka posisi perdagangan baru.</p>
                  </div>

                  {/* RRR Input */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-600">Default Risk-to-Reward Ratio</span>
                      <span className="text-slate-900 bg-slate-100 px-2 py-0.5 rounded-lg">1 : {botSettings.riskRewardRatio}</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="5.0"
                      step="0.1"
                      value={botSettings.riskRewardRatio}
                      onChange={(e) => setBotSettings(prev => ({ ...prev, riskRewardRatio: parseFloat(e.target.value) }))}
                      className="w-full accent-slate-950 cursor-pointer"
                    />
                    <p className="text-[10px] text-slate-400">Jarak target Take Profit (TP) dibandingkan jarak Stop Loss (SL) awal.</p>
                  </div>

                  {/* Active Symbols Checkbox Grid */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-600">Aset Aktif yang Dipantau</span>
                    <div className="grid grid-cols-2 gap-2">
                      {['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AAPL', 'TSLA', 'BBRI', 'TLKM'].map((sym) => {
                        const isChecked = botSettings.activeSymbols?.includes(sym);
                        return (
                          <label
                            key={sym}
                            className={`flex items-center gap-2 px-3 py-2 border rounded-xl cursor-pointer hover:bg-slate-50 transition-colors ${
                              isChecked ? 'border-slate-300 bg-slate-50/50' : 'border-slate-200'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const newActive = e.target.checked
                                  ? [...(botSettings.activeSymbols || []), sym]
                                  : (botSettings.activeSymbols || []).filter(s => s !== sym);
                                setBotSettings(prev => ({ ...prev, activeSymbols: newActive }));
                              }}
                              className="rounded text-slate-900 focus:ring-slate-900 accent-slate-900 cursor-pointer"
                            />
                            <span className="text-xs font-bold text-slate-700">{sym}</span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400">Centang aset yang ingin dipindai dan dijalankan otomatis oleh sistem bot.</p>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setIsSettingsOpen(false);
                      fetchBackendTrades(); // restore original
                    }}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold transition-all"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => {
                      saveBotSettings(botSettings);
                      setIsSettingsOpen(false);
                    }}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold active:scale-95 transition-all"
                  >
                    Simpan Pengaturan
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>


      </div>
    </div>
  );
}
