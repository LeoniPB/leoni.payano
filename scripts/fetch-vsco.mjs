import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const GALLERY_ID = '6a84d1800d7db3e90cbcb0df';
const GALLERY_URL = `https://galleries.vsco.co/gallery/${GALLERY_ID}`;
const OUTPUT_FILE = 'featured.json';
const PHOTOS_TO_PICK = 5;

async function fetchGalleryImages() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();
  const imageUrls = new Set();

  // Log every JSON response URL and scan for image URLs
  page.on('response', async response => {
    const url = response.url();
    const ct = response.headers()['content-type'] || '';
    if (ct.includes('application/json')) {
      console.log(`JSON response: ${url}`);
      try {
        const text = await response.text();
        // Look for any vsco image URLs in the response
        const imgMatches = text.match(/https?:\/\/[^\s"']+vsco[^\s"']*\.(?:jpg|jpeg|png|webp)/gi) || [];
        const r2Matches = text.match(/https?:\/\/[^\s"']*cloudflarestorage[^\s"']*\.(?:jpg|jpeg|png|webp)[^\s"']*/gi) || [];
        const imgVscoMatches = text.match(/https?:\/\/img\.vsco\.co\/[^\s"']+/gi) || [];

        [...imgMatches, ...r2Matches, ...imgVscoMatches].forEach(u => {
          const clean = u.replace(/\\u0026/g, '&').replace(/\\/g, '');
          imageUrls.add(clean);
        });

        if (imgMatches.length + r2Matches.length + imgVscoMatches.length > 0) {
          console.log(`  → Found ${imgMatches.length + r2Matches.length + imgVscoMatches.length} image URLs`);
          console.log('  Preview:', text.slice(0, 300));
        }
      } catch (_) {}
    }
  });

  console.log(`Navigating to ${GALLERY_URL}...`);
  await page.goto(GALLERY_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Scroll to load more
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await page.waitForTimeout(1500);
  }

  // Also grab all img srcs from DOM
  const domUrls = await page.evaluate(() => {
    const urls = [];
    document.querySelectorAll('img').forEach(img => {
      if (img.src) urls.push(img.src);
      if (img.currentSrc) urls.push(img.currentSrc);
    });
    return urls;
  });

  console.log(`\nDOM images: ${domUrls.length}`);
  domUrls.forEach(u => {
    if (u.includes('vsco') || u.includes('cloudflare')) {
      imageUrls.add(u);
      console.log(' dom:', u.slice(0, 120));
    }
  });

  await browser.close();

  // Deduplicate by image file ID
  const seenIds = new Set();
  const uniqueImages = [];
  for (const url of imageUrls) {
    const idMatch = url.match(/\/images\/([a-f0-9]{24})/);
    if (idMatch) {
      if (seenIds.has(idMatch[1])) continue;
      seenIds.add(idMatch[1]);
    }
    uniqueImages.push(url);
  }

  console.log(`\nTotal unique images: ${uniqueImages.length}`);
  uniqueImages.forEach(u => console.log(' -', u.slice(0, 120)));

  if (uniqueImages.length === 0) {
    console.warn('No images found — keeping featured.json unchanged.');
    return;
  }

  const shuffled = [...uniqueImages].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(PHOTOS_TO_PICK, shuffled.length));

  const output = { week: new Date().toISOString().split('T')[0], photos: selected };
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nSaved ${selected.length} photos.`);
}

fetchGalleryImages().catch(err => {
  console.error('fetch-vsco failed:', err);
  process.exit(1);
});
