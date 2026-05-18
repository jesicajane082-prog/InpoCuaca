const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const LOGO_DIR = path.join(__dirname, 'public', 'logos');

// Ensure the directory exists
if (!fs.existsSync(LOGO_DIR)) {
  fs.mkdirSync(LOGO_DIR, { recursive: true });
  console.log('Created directory:', LOGO_DIR);
}

// Candidates for filenames for each team. We will try to download them.
const teamCandidates = {
  persib: ['Logo_Persib_Bandung.png'],
  borneo: ['Logo_Borneo_FC.svg', 'Logo_Borneo_FC_Samarinda.png'],
  persija: ['Logo_Persija.png', 'Logo_Persija.svg', 'Persija_Jakarta.svg', 'Persija_Jakarta_logo.png', 'Persija_logo.png', 'Logo_Persija_Jakarta.png'],
  persebaya: ['Persebaya_logo.svg', 'Logo_Persebaya.png', 'Persebaya_Surabaya_logo.svg'],
  malut: ['Malut_United_Football_Club.png', 'Malut_United_logo.png'],
  dewa: ['Dewa_United_FC.png', 'Dewa_United_FC_logo.svg'],
  bhayangkara: ['Bhayangkara_FC_logo.svg', 'Bhayangkara_Presisi_FC_logo.png', 'Bhayangkara_Presisi_FC.png'],
  bali: ['Bali_United_logo.svg', 'Bali_United_FC_logo.svg', 'Bali_United_FC_logo.png']
};

function getWikiUrl(filename, baseType) {
  // Calculate MD5 of the filename
  const md5 = crypto.createHash('md5').update(filename).digest('hex');
  const dir1 = md5[0];
  const dir2 = md5.slice(0, 2);
  
  // baseType can be 'id', 'commons', or 'en'
  return `https://upload.wikimedia.org/wikipedia/${baseType}/${dir1}/${dir2}/${filename}`;
}

function tryDownload(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'IndonesianFootballStandingsWidget/1.0 (contact@ikko-standings-widget.id) Node.js/18'
      }
    }, (response) => {
      if (response.statusCode === 200) {
        resolve(response);
      } else {
        reject(new Error(`Status ${response.statusCode}`));
      }
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function saveStream(response, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    response.pipe(file);
    file.on('finish', () => {
      file.close();
      resolve();
    });
    file.on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadTeamLogo(teamKey, filenames) {
  const bases = ['commons', 'id', 'en'];
  
  for (const filename of filenames) {
    for (const base of bases) {
      const url = getWikiUrl(filename, base);
      console.log(`Trying ${teamKey} -> ${url}...`);
      
      try {
        const response = await tryDownload(url);
        // Determine file extension
        const ext = path.extname(filename);
        const destName = `${teamKey}${ext}`;
        const destPath = path.join(LOGO_DIR, destName);
        
        await saveStream(response, destPath);
        console.log(`>>> SUCCESS: Saved ${teamKey} as ${destName}`);
        return true; // Stop trying other URLs for this team
      } catch (err) {
        // Fall through to try next URL candidate
      }
    }
  }
  
  console.error(`!!! FAILED: Could not download logo for ${teamKey}`);
  return false;
}

async function run() {
  for (const [teamKey, filenames] of Object.entries(teamCandidates)) {
    await downloadTeamLogo(teamKey, filenames);
    await delay(1500); // Be polite to Wikipedia
  }
  console.log('All team logo downloads completed!');
}

run();
