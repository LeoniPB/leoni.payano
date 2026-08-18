import { writeFileSync } from 'fs';

const GALLERY_ID = '6a84d1800d7db3e90cbcb0df';
const OUTPUT_FILE = 'featured.json';
const PHOTOS_TO_PICK = 5;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchGalleryImages() {
  console.log(`Fetching gallery ${GALLERY_ID}...`);
  const res = await fetch(
    `https://galleries.vsco.co/gallery/${GALLERY_ID}`,
    { headers: HEADERS }
  );
  console.log(`Status: ${res.status}`);

  const html = await res.text();

  // Decode HTML entities
  const decoded = html.replace(/&amp;/g, '&').replace(/&#x27;/g, "'");

  // Find all img.vsco.co URLs (the CDN this gallery uses)
  const allMatches = decoded.match(/https:\/\/img\.vsco\.co\/cdn-cgi\/image\/[^"'\s]+/g) || [];
  console.log(`Raw URL matches: ${allMatches.length}`);

  // Each image appears multiple times (different widths). Deduplicate by the
  // underlying image path (the part after "image/width=NNN,/")
  const seenPaths = new Set();
  const uniqueImages = [];

  for (const url of allMatches) {
    // Extract the image path as the dedup key
    const pathMatch = url.match(/\/images\/([a-f0-9]+)\./);
    if (!pathMatch) continue;

    const imageId = pathMatch[1];
    if (seenPaths.has(imageId)) continue;
    seenPaths.add(imageId);

    // Pick the largest width variant we can find, or just use this one
    // Replace whatever width is present with 1200 for best quality
    const highRes = url.replace(/width=\d+,/, 'width=1200,');
    uniqueImages.push(highRes);
  }

  console.log(`Unique images found: ${uniqueImages.length}`);
  uniqueImages.forEach(u => console.log(' -', u));

  if (uniqueImages.length === 0) {
    console.warn('No images found — keeping existing featured.json unchanged.');
    return;
  }

  const shuffled = [...uniqueImages].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(PHOTOS_TO_PICK, shuffled.length));

  const output = {
    week: new Date().toISOString().split('T')[0],
    photos: selected,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Saved ${selected.length} photos to ${OUTPUT_FILE}.`);
}

fetchGalleryImages().catch(err => {
  console.error('fetch-vsco failed:', err);
  process.exit(1);
});
