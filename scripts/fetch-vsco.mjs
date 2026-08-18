import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const VSCO_USERNAME = 'leonipb';
const GALLERY_URL = `https://vsco.co/${VSCO_USERNAME}/gallery`;
const OUTPUT_FILE = 'featured.json';
const PHOTOS_TO_PICK = 5;

async function fetchVscoImages() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();

  // Intercept all API responses
  const imageUrls = new Set();
  page.on('response', async response => {
    const url = response.url();
    const ct = response.headers()['content-type'] || '';
    if (ct.includes('application/json')) {
      try {
        const body = await response.json();
        extractImages(body, imageUrls);
      } catch (_) {}
    }
  });

  console.log(`Navigating to ${GALLERY_URL}...`);
  await page.goto(GALLERY_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  // Log page title and URL to see if we're being blocked
  const title = await page.title();
  const currentUrl = page.url();
  console.log(`Page title: ${title}`);
  console.log(`Current URL: ${currentUrl}`);

  // Scroll
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await page.waitForTimeout(2000);
  }

  // Take a screenshot and save as artifact
  await page.screenshot({ path: 'vsco-debug.png', fullPage: false });
  console.log('Screenshot saved as vsco-debug.png');

  // Dump ALL img srcs for debugging
  const allImgs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img')).map(i => i.src)
  );
  console.log(`Total <img> tags found: ${allImgs.length}`);
  allImgs.slice(0, 20).forEach(src => console.log('  img:', src));

  // Check __NEXT_DATA__
  const nextData = await page.evaluate(() => {
    try {
      const el = document.getElementById('__NEXT_DATA__');
      return el ? el.textContent.slice(0, 2000) : null;
    } catch (_) { return null; }
  });
  if (nextData) {
    console.log('__NEXT_DATA__ found (first 2000 chars):', nextData);
  } else {
    console.log('No __NEXT_DATA__ found.');
  }

  // DOM scan
  const domImages = await page.evaluate(() => {
    const all = [];
    document.querySelectorAll('img').forEach(img => {
      if (img.src) all.push(img.src);
      if (img.dataset.src) all.push(img.dataset.src);
    });
    return all;
  });
  domImages.forEach(src => { if (src && isPhotoUrl(src)) imageUrls.add(src); });

  await browser.close();

  const images = Array.from(imageUrls);
  console.log(`\nPhoto URLs found after filtering: ${images.length}`);
  images.forEach(u => console.log(' -', u));

  if (images.length === 0) {
    console.warn('No images found — keeping existing featured.json unchanged.');
    return;
  }

  const shuffled = [...images].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(PHOTOS_TO_PICK, shuffled.length));
  const output = { week: new Date().toISOString().split('T')[0], photos: selected };
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Saved ${selected.length} photos.`);
}

function isPhotoUrl(src) {
  return (
    (src.includes('im.vsco.co') ||
      src.includes('image.vsco.co') ||
      src.includes('vsco.co/media') ||
      src.includes('vsco.co/aws')) &&
    !src.includes('avatar') &&
    !src.includes('profile') &&
    !src.includes('icon') &&
    !src.includes('logo')
  );
}

function extractImages(obj, set, depth = 0) {
  if (depth > 10 || !obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { obj.forEach(item => extractImages(item, set, depth + 1)); return; }
  for (const [, value] of Object.entries(obj)) {
    if (typeof value === 'string' && isPhotoUrl(value)) set.add(value);
    else if (typeof value === 'object') extractImages(value, set, depth + 1);
  }
}

fetchVscoImages().catch(err => {
  console.error('fetch-vsco failed:', err);
  process.exit(1);
});
