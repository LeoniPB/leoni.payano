import { writeFileSync } from 'fs';

const GALLERY_ID = '6a84d1800d7db3e90cbcb0df';
const OUTPUT_FILE = 'featured.json';
const PHOTOS_TO_PICK = 5;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': `https://galleries.vsco.co/gallery/${GALLERY_ID}`,
  'Origin': 'https://galleries.vsco.co',
};

async function fetchGalleryImages() {
  // Try the galleries API endpoints
  const endpoints = [
    `https://galleries.vsco.co/api/v1/galleries/${GALLERY_ID}`,
    `https://galleries.vsco.co/api/galleries/${GALLERY_ID}`,
    `https://vsco.co/api/2.0/galleries/${GALLERY_ID}`,
  ];

  let data = null;
  for (const url of endpoints) {
    console.log(`Trying: ${url}`);
    try {
      const res = await fetch(url, { headers: HEADERS });
      console.log(`  Status: ${res.status}`);
      if (res.ok) {
        data = await res.json();
        console.log('  Response (first 800 chars):', JSON.stringify(data).slice(0, 800));
        break;
      }
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }

  // If API didn't work, fetch the HTML page and look for embedded JSON
  if (!data) {
    console.log('\nTrying HTML page...');
    const res = await fetch(
      `https://galleries.vsco.co/gallery/${GALLERY_ID}`,
      { headers: { ...HEADERS, Accept: 'text/html,application/xhtml+xml' } }
    );
    console.log(`HTML page status: ${res.status}`);
    const html = await res.text();
    console.log(`HTML length: ${html.length}`);
    console.log('First 1000 chars:', html.slice(0, 1000));

    // Look for JSON blobs in script tags
    const matches = html.match(/"responsive_url":"([^"]+)"/g) || [];
    console.log(`Found ${matches.length} responsive_url matches in HTML`);
    matches.slice(0, 5).forEach(m => console.log(' ', m));

    if (matches.length > 0) {
      const urls = matches.map(m => {
        const url = m.replace('"responsive_url":"', '').replace('"', '');
        return url.startsWith('//') ? `https:${url}` : url;
      });
      savePhotos(urls);
      return;
    }

    // Look for any im.vsco.co or image.vsco.co URLs
    const imgMatches = html.match(/https?:\/\/(im|image)\.vsco\.co\/[^"'\s]+/g) || [];
    console.log(`Found ${imgMatches.length} VSCO image URLs in HTML`);
    if (imgMatches.length > 0) {
      savePhotos(imgMatches);
      return;
    }

    console.warn('No images found in HTML either.');
    return;
  }

  // Extract image URLs from API response
  const images = [];
  extractImages(data, images);
  console.log(`\nExtracted ${images.length} image URLs from API.`);
  savePhotos(images);
}

function savePhotos(images) {
  const unique = [...new Set(images)].filter(u =>
    !u.includes('avatar') && !u.includes('profile') && !u.includes('icon')
  );
  console.log(`Unique usable images: ${unique.length}`);
  unique.slice(0, 5).forEach(u => console.log(' -', u));

  if (unique.length === 0) {
    console.warn('No images to save — keeping featured.json unchanged.');
    return;
  }

  const shuffled = [...unique].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(PHOTOS_TO_PICK, shuffled.length));
  const output = { week: new Date().toISOString().split('T')[0], photos: selected };
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Saved ${selected.length} photos.`);
}

function extractImages(obj, arr, depth = 0) {
  if (depth > 12 || !obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { obj.forEach(i => extractImages(i, arr, depth + 1)); return; }
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' &&
        (value.includes('im.vsco.co') || value.includes('image.vsco.co')) &&
        !value.includes('avatar')) {
      arr.push(value.startsWith('//') ? `https:${value}` : value);
    } else if (typeof value === 'object') {
      extractImages(value, arr, depth + 1);
    }
  }
}

fetchGalleryImages().catch(err => {
  console.error('fetch-vsco failed:', err);
  process.exit(1);
});
