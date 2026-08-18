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
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  const page = await context.newPage();

  // Intercept API responses that contain image data
  const imageUrls = new Set();

  page.on('response', async response => {
    const url = response.url();
    if (
      url.includes('vsco.co/api') &&
      response.headers()['content-type']?.includes('application/json')
    ) {
      try {
        const body = await response.json();
        extractImages(body, imageUrls);
      } catch (_) {}
    }
  });

  console.log(`Navigating to ${GALLERY_URL}...`);
  await page.goto(GALLERY_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Scroll to trigger more API calls
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await page.waitForTimeout(2000);
  }

  // Also scan the DOM for any image URLs we might have missed
  const domImages = await page.evaluate(() => {
    const all = [];
    document.querySelectorAll('img').forEach(img => {
      if (img.src) all.push(img.src);
      if (img.dataset.src) all.push(img.dataset.src);
    });
    document.querySelectorAll('[style]').forEach(el => {
      const bg = el.style.backgroundImage;
      if (bg) all.push(bg.replace(/url\(["']?|["']?\)/g, ''));
    });
    return all;
  });

  domImages.forEach(src => {
    if (src && isPhotoUrl(src)) imageUrls.add(src);
  });

  // Also check window.__NEXT_DATA__ which VSCO uses
  const nextData = await page.evaluate(() => {
    try {
      const el = document.getElementById('__NEXT_DATA__');
      return el ? JSON.parse(el.textContent) : null;
    } catch (_) {
      return null;
    }
  });

  if (nextData) {
    extractImages(nextData, imageUrls);
  }

  await browser.close();

  const images = Array.from(imageUrls);
  console.log(`Found ${images.length} images.`);
  if (images.length > 0) {
    images.slice(0, 10).forEach(u => console.log(' -', u));
  }

  if (images.length === 0) {
    console.warn('No images found — keeping existing featured.json unchanged.');
    return;
  }

  const shuffled = [...images].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(PHOTOS_TO_PICK, shuffled.length));

  const output = {
    week: new Date().toISOString().split('T')[0],
    photos: selected,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Saved ${selected.length} photos to ${OUTPUT_FILE}.`);
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
  if (Array.isArray(obj)) {
    obj.forEach(item => extractImages(item, set, depth + 1));
    return;
  }
  for (const [key, value] of Object.entries(obj)) {
    if (
      typeof value === 'string' &&
      isPhotoUrl(value)
    ) {
      set.add(value);
    } else if (typeof value === 'object') {
      extractImages(value, set, depth + 1);
    }
  }
}

fetchVscoImages().catch(err => {
  console.error('fetch-vsco failed:', err);
  process.exit(1);
});
