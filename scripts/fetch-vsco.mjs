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
  const imageIds = new Set();

  // Intercept all responses and scan for image IDs
  page.on('response', async response => {
    const ct = response.headers()['content-type'] || '';
    if (!ct.includes('application/json')) return;
    try {
      const text = await response.text();
      const matches = text.match(/[a-f0-9]{24}/g) || [];
      // Also look for responsive_url or image paths
      const urls = text.match(/https?:\/\/img\.vsco\.co\/[^\s"']+/g) || [];
      urls.forEach(u => imageIds.add(u));
      // Extract image IDs from any JSON payload
      const imgPaths = text.match(/"\/images\/([a-f0-9]{24})\.jpg"/g) || [];
      imgPaths.forEach(p => {
        const id = p.match(/([a-f0-9]{24})/)?.[1];
        if (id) imageIds.add(id);
      });
    } catch (_) {}
  });

  console.log(`Navigating to ${GALLERY_URL}...`);
  await page.goto(GALLERY_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Scroll to trigger loading of all images
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
    await page.waitForTimeout(1500);
  }

  // Get all img srcs from the DOM
  const domUrls = await page.evaluate(() => {
    const urls = new Set();
    document.querySelectorAll('img').forEach(img => {
      if (img.src) urls.add(img.src);
      if (img.dataset.src) urls.add(img.dataset.src);
      // Check srcset
      if (img.srcset) {
        img.srcset.split(',').forEach(s => {
          const u = s.trim().split(' ')[0];
          if (u) urls.add(u);
        });
      }
    });
    // Also check picture/source elements
    document.querySelectorAll('source').forEach(src => {
      if (src.srcset) {
        src.srcset.split(',').forEach(s => {
          const u = s.trim().split(' ')[0];
          if (u) urls.add(u);
        });
      }
    });
    return Array.from(urls);
  });

  console.log(`DOM img URLs found: ${domUrls.length}`);
  domUrls.forEach(u => console.log('  dom:', u.slice(0, 100)));

  await browser.close();

  // Collect all img.vsco.co URLs
  const allUrls = [
    ...domUrls.filter(u => u.includes('img.vsco.co') || u.includes('im.vsco.co') || u.includes('vsco-galleries')),
    ...Array.from(imageIds).filter(u => u.startsWith('http')),
  ];

  // Deduplicate by image ID
  const seenIds = new Set();
  const uniqueImages = [];
  for (const url of allUrls) {
    const idMatch = url.match(/\/images\/([a-f0-9]{24})\./);
    if (idMatch) {
      if (seenIds.has(idMatch[1])) continue;
      seenIds.add(idMatch[1]);
      // Upgrade to high resolution
      const highRes = url.includes('cdn-cgi')
        ? url.replace(/width=\d+,/, 'width=1200,')
        : url;
      uniqueImages.push(highRes);
    } else if (!allUrls.some(other => other !== url && other.includes(url.slice(-20)))) {
      uniqueImages.push(url);
    }
  }

  console.log(`\nUnique images: ${uniqueImages.length}`);
  uniqueImages.forEach(u => console.log(' -', u.slice(0, 120)));

  if (uniqueImages.length === 0) {
    console.warn('No images found — keeping featured.json unchanged.');
    return;
  }

  const shuffled = [...uniqueImages].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(PHOTOS_TO_PICK, shuffled.length));

  const output = {
    week: new Date().toISOString().split('T')[0],
    photos: selected,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Saved ${selected.length} photos.`);
}

fetchGalleryImages().catch(err => {
  console.error('fetch-vsco failed:', err);
  process.exit(1);
});
