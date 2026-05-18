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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-16">

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
            className="flex items-center gap-2"
          >
            <MapPin className="w-4 h-4 text-slate-300" />
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm outline-none hover:border-slate-300 transition-all cursor-pointer focus:ring-2 focus:ring-slate-100 font-medium"
            >
              {CITIES.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
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
        {/* Floating Chat Button */}
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
          <AnimatePresence>
            {!isChatOpen && (
              <motion.button
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                onClick={() => setIsChatOpen(true)}
                className="w-14 h-14 bg-slate-900 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl active:scale-95 transition-all hover:bg-slate-800 relative group"
              >
                <MessageSquare className="w-6 h-6 text-white" />
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
                    <div className="w-8 h-8 bg-slate-900 text-white rounded-xl flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-white" />
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
                      onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                      className={`p-2 rounded-lg transition-all ${isSettingsOpen ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                      title="Pengaturan AI"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setIsChatOpen(false)}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Settings Overlay / Panel */}
                <AnimatePresence>
                  {isSettingsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-b border-slate-100 bg-slate-50/50 overflow-hidden"
                    >
                      <div className="p-5 space-y-4 text-left">
                        

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                            <Brain className="w-3 h-3 text-slate-400" />
                            Pilih Model AI
                          </label>
                          <select
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none hover:border-slate-300 focus:ring-2 focus:ring-slate-100 font-medium"
                          >
                            <option value="Qwen/Qwen2.5-72B-Instruct">Qwen 2.5 72B (Cepat & Cerdas)</option>
                            <option value="deepseek-ai/DeepSeek-R1-Distill-Qwen-32B">DeepSeek R1 32B (Reasoning/Penalaran)</option>
                            <option value="google/gemma-3-27b-it">Google Gemma 3 27B (Terbaru)</option>
                            <option value="meta-llama/Llama-3.3-70B-Instruct">Llama 3.3 70B (Meta AI)</option>
                          </select>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

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
                            ? 'bg-slate-950 text-white rounded-tr-none'
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
                    className="p-2.5 bg-slate-950 hover:bg-slate-850 text-white rounded-xl active:scale-95 transition-all flex items-center justify-center disabled:opacity-30 disabled:scale-100"
                  >
                    <Send className="w-4 h-4" />
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
