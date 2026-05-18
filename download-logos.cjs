const fs = require('fs');
const path = require('path');
const https = require('https');

const LOGO_DIR = path.join(__dirname, 'public', 'logos');

// Ensure the directory exists
if (!fs.existsSync(LOGO_DIR)) {
  fs.mkdirSync(LOGO_DIR, { recursive: true });
  console.log('Created directory:', LOGO_DIR);
}

const teams = [
  { id: '20265', name: 'persib' },
  { id: '20286', name: 'borneo' },
  { id: '20266', name: 'persija' },
  { id: '20269', name: 'persebaya' },
  { id: '1254884', name: 'malut' },
  { id: '960533', name: 'dewa' },
  { id: '953157', name: 'bhayangkara' },
  { id: '594801', name: 'bali' }
];

function downloadImage(id, name) {
  return new Promise((resolve, reject) => {
    const url = `https://www.sofascore.com/api/v1/team/${id}/image`;
    const dest = path.join(LOGO_DIR, `${name}.png`);
    const file = fs.createWriteStream(dest);

    console.log(`Downloading ${name} from ${url}...`);

    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${name}: Status code ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`Successfully saved ${name}.png`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {}); // Delete the file on error
      reject(err);
    });
  });
}

async function run() {
  for (const team of teams) {
    try {
      await downloadImage(team.id, team.name);
    } catch (err) {
      console.error('Error downloading:', team.name, err.message);
    }
  }
  console.log('All downloads completed!');
}

run();
