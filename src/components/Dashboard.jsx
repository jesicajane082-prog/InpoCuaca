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
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      
      // Re-create the required inner widget div for TradingView script targeting
      const widgetDiv = document.createElement('div');
      widgetDiv.className = 'tradingview-widget-container__widget';
      containerRef.current.appendChild(widgetDiv);

      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js';
      script.type = 'text/javascript';
      script.async = true;
      script.innerHTML = JSON.stringify({
        interval: '1D',
        width: '100%',
        isTransparent: false,
        height: 320,
        symbol: symbol,
        showIntervalTabs: true,
        displayMode: 'single',
        locale: 'id',
        colorTheme: 'light'
      });

      containerRef.current.appendChild(script);
    }
  }, [symbol]);

  return (
    <div ref={containerRef} className="tradingview-widget-container w-full h-[320px]" />
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

  // Real-time price feed loop from public, CORS-enabled Exchange Rate API
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        if (res.ok) {
          const data = await res.json();
          if (data && data.rates) {
            setLivePrices(prev => ({
              ...prev,
              'EURUSD': parseFloat((1 / (data.rates.EUR || 0.92)).toFixed(5)),
              'GBPUSD': parseFloat((1 / (data.rates.GBP || 0.79)).toFixed(5)),
              'USDJPY': parseFloat((data.rates.JPY || 155.6).toFixed(2)),
              'XAUUSD': parseFloat((1 / (data.rates.XAU || 0.00041)).toFixed(2)),
              'AAPL': parseFloat((182.30 + (Math.random() - 0.5) * 1.5).toFixed(2)),
              'TSLA': parseFloat((174.60 + (Math.random() - 0.5) * 2.5).toFixed(2)),
              'BBRI': Math.round(4680 + (Math.random() - 0.5) * 60),
              'TLKM': Math.round(3200 + (Math.random() - 0.5) * 40)
            }));
          }
        }
      } catch (e) {
        console.warn('Failed to fetch real-time exchange rates', e);
      }
    };
    
    fetchRates();
    const interval = setInterval(fetchRates, 30000);
    return () => clearInterval(interval);
  }, []);

  const [botLogs, setBotLogs] = useState({
    'EURUSD': [
      { id: 1, type: 'SELL', entry: '1.08450', rrr: '1:2.3', sl: '1.08600', tp: '1.08105', timeframe: 'M15', pnl: 'PROFIT (+0.56%)', status: 'closed', time: '10 menit yang lalu' },
      { id: 2, type: 'BUY', entry: '1.08210', rrr: '1:2.0', sl: '1.08060', tp: '1.08510', timeframe: 'M15', pnl: 'LOSS (-0.31%)', status: 'closed', time: '2 jam yang lalu' }
    ],
    'GBPUSD': [
      { id: 1, type: 'BUY', entry: '1.25410', rrr: '1:2.5', sl: '1.25210', tp: '1.25910', timeframe: 'M30', pnl: 'PROFIT (+0.82%)', status: 'closed', time: '45 menit yang lalu' }
    ],
    'USDJPY': [
      { id: 1, type: 'BUY', entry: '155.60', rrr: '1:2.1', sl: '155.35', tp: '156.12', timeframe: 'H1', pnl: 'RUNNING (+0.44%)', status: 'active', time: 'Aktif' }
    ],
    'XAUUSD': [
      { id: 1, type: 'BUY', entry: '2412.50', rrr: '1:2.7', sl: '2404.50', tp: '2434.10', timeframe: 'H4', pnl: 'PROFIT (+1.24%)', status: 'closed', time: '5 menit yang lalu' },
      { id: 2, type: 'SELL', entry: '2430.10', rrr: '1:2.4', sl: '2438.10', tp: '2418.66', timeframe: 'H4', pnl: 'RUNNING (+0.18%)', status: 'active', time: 'Aktif' }
    ],
    'AAPL': [
      { id: 1, type: 'BUY', entry: '182.30', rrr: '1:2.2', sl: '180.30', tp: '186.70', timeframe: 'D1', pnl: 'PROFIT (+1.95%)', status: 'closed', time: '1 hari yang lalu' }
    ],
    'TSLA': [
      { id: 1, type: 'BUY', entry: '174.60', rrr: '1:2.6', sl: '171.10', tp: '183.70', timeframe: 'H1', pnl: 'LOSS (-0.85%)', status: 'closed', time: '5 jam yang lalu' }
    ],
    'BBRI': [
      { id: 1, type: 'BUY', entry: '4680', rrr: '1:2.5', sl: '4630', tp: '4755', timeframe: 'D1', pnl: 'PROFIT (+3.20%)', status: 'closed', time: '3 jam yang lalu' }
    ],
    'TLKM': [
      { id: 1, type: 'BUY', entry: '3200', rrr: '1:2.1', sl: '3170', tp: '3263', timeframe: 'D1', pnl: 'RUNNING (+0.75%)', status: 'active', time: 'Aktif' }
    ]
  });

  const [performanceData, setPerformanceData] = useState({
    'EURUSD': {
      strategyName: 'Smart Money Concepts (SMC) & Liquidity Sweeps',
      winRate: '68.2%',
      avgRrr: '1:2.3',
      profit1D: '+1.24%',
      profit1W: '+5.82%',
      profit1M: '+22.40%',
      totalTrades: '34 Trades',
      analysisExplain: 'Menggunakan pemetaan struktur pasar CHoCH (Change of Character) di timeframe M15. Bot mengeksekusi SELL di 1.08450 setelah mendeteksi Liquidity Sweep di atas harga tertinggi sesi London (London High) dengan probabilitas keberhasilan teknik mencapai 68.2% didukung RSI Divergence.'
    },
    'GBPUSD': {
      strategyName: 'Order Block & Fair Value Gap (FVG) Refinement',
      winRate: '65.5%',
      avgRrr: '1:2.5',
      profit1D: '+0.82%',
      profit1W: '+4.90%',
      profit1M: '+18.15%',
      totalTrades: '28 Trades',
      analysisExplain: 'Strategi difokuskan pada entry di area FVG H1 pasca-rilis kalender ekonomi AS. Probabilitas keberhasilan teknik mencapai 65.5% dengan perlindungan Stop Loss ketat di bawah batas kritis Support H1.'
    },
    'USDJPY': {
      strategyName: 'Mean Reversion & Bollinger Band Extremes',
      winRate: '71.0%',
      avgRrr: '1:2.1',
      profit1D: '+0.44%',
      profit1W: '+3.75%',
      profit1M: '+15.80%',
      totalTrades: '42 Trades',
      analysisExplain: 'Strategi pembalikan arah (Mean Reversion) memanfaatkan deviasi ekstrim 2.5 standard deviation pada Bollinger Bands H1. Memanfaatkan pelemahan momentum pembeli Yen Jepang.'
    },
    'XAUUSD': {
      strategyName: 'Volume Profile & H4 Breakout Confirmation',
      winRate: '72.5%',
      avgRrr: '1:2.7',
      profit1D: '+2.15%',
      profit1W: '+9.40%',
      profit1M: '+31.60%',
      totalTrades: '38 Trades',
      analysisExplain: 'Analisis berbasis Volume Profile pada area High Volume Node (HVN) emas. Posisi BUY di 2412.50 diambil setelah terjadi breakout dikonfirmasi volume transaksi institusional yang masif.'
    },
    'AAPL': {
      strategyName: 'Gap Fill & Trend Following (EMA 20/50)',
      winRate: '66.8%',
      avgRrr: '1:2.2',
      profit1D: '+1.95%',
      profit1W: '+5.10%',
      profit1M: '+12.40%',
      totalTrades: '16 Trades',
      analysisExplain: 'Strategi mengikuti tren utama menggunakan persilangan EMA 20 dan 50 pada chart harian. Mengambil momentum rilis produk baru Apple dengan stop loss di bawah swing low kemarin.'
    },
    'TSLA': {
      strategyName: 'Volatility Breakout & ADX Momentum',
      winRate: '60.4%',
      avgRrr: '1:2.6',
      profit1D: '-0.85%',
      profit1W: '+2.90%',
      profit1M: '+14.20%',
      totalTrades: '22 Trades',
      analysisExplain: 'Strategi breakout volatilitas tinggi dengan filter momentum indikator ADX > 25. Karena sifat saham Tesla yang sangat volatil, stop loss ditempatkan 1.5 ATR (Average True Range) dari entry.'
    },
    'BBRI': {
      strategyName: 'Foreign Flow Accumulation & Fibonacci Retracement',
      winRate: '70.2%',
      avgRrr: '1:2.5',
      profit1D: '+3.20%',
      profit1W: '+7.80%',
      profit1M: '+19.60%',
      totalTrades: '14 Trades',
      analysisExplain: 'Analisis berbasis data akumulasi aliran modal asing (Foreign Flow) dikombinasikan dengan level Fibonacci Retracement 61.8%. Bot masuk posisi BUY setelah harga memantul di area support Rp4.650.'
    },
    'TLKM': {
      strategyName: 'Dividend Yield Accumulation & Support Bounce',
      winRate: '69.0%',
      avgRrr: '1:2.1',
      profit1D: '+0.75%',
      profit1W: '+3.40%',
      profit1M: '+10.80%',
      totalTrades: '12 Trades',
      analysisExplain: 'Bot memanfaatkan area jenuh jual (Oversold) pada RSI harian di dekat area Support psikologis kuat Rp3.200, mengantisipasi pemantulan teknikal jangka menengah.'
    }
  });

  // Live Trading Simulation Engine Loop (Runs every 15s)
  useEffect(() => {
    const interval = setInterval(() => {
      const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AAPL', 'TSLA', 'BBRI', 'TLKM'];
      const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
      
      setBotLogs(prevLogs => {
        const symbolLogs = [...(prevLogs[randomSymbol] || [])];
        
        // 1. If active trade exists, resolve it!
        const activeTradeIdx = symbolLogs.findIndex(log => log.status === 'active');
        if (activeTradeIdx !== -1 && Math.random() > 0.4) {
          const activeTrade = { ...symbolLogs[activeTradeIdx] };
          const winRateVal = parseFloat(performanceData[randomSymbol]?.winRate || '68%') / 100;
          const isWin = Math.random() < winRateVal;
          
          const rrrParts = activeTrade.rrr.split(':').map(Number);
          const riskMultiplier = rrrParts[1] || 2.0;
          const pnlVal = isWin 
            ? `PROFIT (+${(0.20 * riskMultiplier).toFixed(2)}%)` 
            : `LOSS (-${(0.20).toFixed(2)}%)`;
          
          activeTrade.pnl = pnlVal;
          activeTrade.status = 'closed';
          activeTrade.time = 'Baru saja selesai';
          
          symbolLogs[activeTradeIdx] = activeTrade;
          
          // Update portfolio returns
          setPerformanceData(prevPerf => {
            const currentSymbolPerf = { ...prevPerf[randomSymbol] };
            const changePct = isWin ? (0.20 * riskMultiplier) : -0.20;
            
            const parsePct = (val) => parseFloat(val.replace(/[+%]/g, '')) || 0;
            const new1D = parsePct(currentSymbolPerf.profit1D) + changePct;
            const new1W = parsePct(currentSymbolPerf.profit1W) + changePct;
            const new1M = parsePct(currentSymbolPerf.profit1M) + changePct;
            
            currentSymbolPerf.profit1D = `${new1D >= 0 ? '+' : ''}${new1D.toFixed(2)}%`;
            currentSymbolPerf.profit1W = `${new1W >= 0 ? '+' : ''}${new1W.toFixed(2)}%`;
            currentSymbolPerf.profit1M = `${new1M >= 0 ? '+' : ''}${new1M.toFixed(2)}%`;
            
            const totalTr = parseInt(currentSymbolPerf.totalTrades) || 0;
            currentSymbolPerf.totalTrades = `${totalTr + 1} Trades`;
            
            return {
              ...prevPerf,
              [randomSymbol]: currentSymbolPerf
            };
          });
        } 
        // 2. Spawn new running trade
        else if (symbolLogs.filter(log => log.status === 'active').length === 0) {
          const basePrice = livePrices[randomSymbol] || 1.08;
          const delta = basePrice * (Math.random() - 0.5) * 0.0003;
          const newEntryNum = basePrice + delta;
          
          const tfMap = {
            'EURUSD': 'M15', 'GBPUSD': 'M30', 'USDJPY': 'H1', 'XAUUSD': 'H4',
            'AAPL': 'D1', 'TSLA': 'H1', 'BBRI': 'D1', 'TLKM': 'D1'
          };
          const tf = tfMap[randomSymbol] || 'H1';
          
          const distMap = {
            'EURUSD': 0.00150, 'GBPUSD': 0.00200, 'USDJPY': 0.25, 'XAUUSD': 8.00,
            'AAPL': 2.00, 'TSLA': 3.50, 'BBRI': 50, 'TLKM': 30
          };
          const slDist = distMap[randomSymbol] || 0.01;
          
          const isBuy = Math.random() > 0.5;
          const typeStr = isBuy ? 'BUY' : 'SELL';
          
          const rrrValStr = performanceData[randomSymbol]?.avgRrr || '1:2.0';
          const rrrParts = rrrValStr.split(':').map(Number);
          const riskMultiplier = rrrParts[1] || 2.0;
          
          const slNum = isBuy ? (newEntryNum - slDist) : (newEntryNum + slDist);
          const tpNum = isBuy ? (newEntryNum + slDist * riskMultiplier) : (newEntryNum - slDist * riskMultiplier);
          
          const decs = randomSymbol.includes('JPY') ? 2 : randomSymbol.includes('BBRI') || randomSymbol.includes('TLKM') ? 0 : 5;
          const newEntry = newEntryNum.toFixed(decs);
          const slPrice = slNum.toFixed(decs);
          const tpPrice = tpNum.toFixed(decs);
          
          const newTrade = {
            id: Date.now(),
            type: typeStr,
            entry: newEntry,
            sl: slPrice,
            tp: tpPrice,
            timeframe: tf,
            rrr: rrrValStr,
            pnl: 'RUNNING (+0.00%)',
            status: 'active',
            time: 'Aktif'
          };
          
          symbolLogs.unshift(newTrade);
          if (symbolLogs.length > 5) symbolLogs.pop();
        }
        
        return {
          ...prevLogs,
          [randomSymbol]: symbolLogs
        };
      });
    }, 15000);
    
    return () => clearInterval(interval);
  }, [performanceData, livePrices]);

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
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 border border-slate-100 rounded-lg animate-pulse">
                  ⚡ STATUS BOT: AKTIF
                </span>
              </div>
            </div>

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
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-2 text-left">
                      ⚡ Simulasi Eksekusi Algoritma Bot ({selectedSymbol})
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Live Trading Logs
                    </span>
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
                              <div className="space-y-0.5">
                                <p className="text-slate-800 font-bold">{log.entry}</p>
                                {log.sl && log.tp && (
                                  <p className="text-[9px] text-slate-400 font-semibold tracking-wider">
                                    <span className="text-rose-500">SL: {log.sl}</span>
                                    <span className="mx-1 text-slate-300">|</span>
                                    <span className="text-emerald-600">TP: {log.tp}</span>
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-slate-500 font-mono">{log.rrr}</td>
                            <td className="px-4 py-4 text-right pr-6 font-mono">
                              <span className={`${
                                log.pnl.includes('PROFIT') 
                                  ? 'text-emerald-600 font-bold' 
                                  : log.pnl.includes('LOSS') 
                                    ? 'text-rose-500 font-bold' 
                                    : 'text-amber-500 font-bold animate-pulse'
                              }`}>
                                {log.pnl}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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


      </div>
    </div>
  );
}
