import { chromium } from 'playwright';
import { writeFileSync, existsSync, readFileSync } from 'fs';

const VSCO_USERNAME = 'leonipb';
const GALLERY_URL = `https://vsco.co/${VSCO_USERNAME}/gallery`;
const OUTPUT_FILE = 'featured.json';
const PHOTOS_TO_PICK = 5;

async function fetchVscoImages() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();

  console.log(`Navigating to ${GALLERY_URL}...`);
  await page.goto(GALLERY_URL, { waitUntil: 'networkidle', timeout: 60000 });

  // Scroll down several times to trigger lazy-loading
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
    await page.waitForTimeout(1500);
  }

  // Extract image URLs from img tags and picture srcsets
  const images = await page.evaluate(() => {
    const seen = new Set();
    const results = [];

    document.querySelectorAll('img').forEach(img => {
      const srcs = [img.src, img.dataset.src].filter(Boolean);
      srcs.forEach(src => {
        if (
          src &&
          (src.includes('im.vsco.co') || src.includes('image.vsco.co')) &&
          !src.includes('avatar') &&
          !src.includes('profile') &&
          !seen.has(src)
        ) {
          seen.add(src);
          results.push(src);
        }
      });
    });

    // Also check picture/source elements
    document.querySelectorAll('source').forEach(source => {
      const srcset = source.srcset || '';
      srcset.split(',').forEach(entry => {
        const src = entry.trim().split(' ')[0];
        if (
          src &&
          (src.includes('im.vsco.co') || src.includes('image.vsco.co')) &&
          !src.includes('avatar') &&
          !src.includes('profile') &&
          !seen.has(src)
        ) {
          seen.add(src);
          results.push(src);
        }
      });
    });

    return results;
  });

  await browser.close();

  console.log(`Found ${images.length} images.`);

  if (images.length === 0) {
    console.warn('No images found — keeping existing featured.json unchanged.');
    return;
  }

  // Shuffle and pick
  const shuffled = [...images].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(PHOTOS_TO_PICK, shuffled.length));

  const output = {
    week: new Date().toISOString().split('T')[0],
    photos: selected,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Saved ${selected.length} photos to ${OUTPUT_FILE}:`);
  selected.forEach(p => console.log(' -', p));
}

fetchVscoImages().catch(err => {
  console.error('fetch-vsco failed:', err);
  process.exit(1);
});
