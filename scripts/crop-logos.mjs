// One-off utility: auto-trim the surrounding whitespace from the logo JPGs and
// write tightly-cropped PNG versions into public/. Run with: npm run crop-logos
import Jimp from 'jimp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');

const jobs = [
  { in: 'shelley-icon.jpg', out: 'shelley-icon.png' },
  { in: 'shelley-title.jpg', out: 'shelley-title.png' },
];

for (const job of jobs) {
  const inPath = path.join(publicDir, job.in);
  const outPath = path.join(publicDir, job.out);
  try {
    const img = await Jimp.read(inPath);
    // Trim near-uniform border (the white margin), with a small tolerance.
    img.autocrop({ tolerance: 0.02, cropOnlyFrames: false });
    await img.writeAsync(outPath);
    console.log(`Cropped ${job.in} -> ${job.out} (${img.bitmap.width}x${img.bitmap.height})`);
  } catch (err) {
    console.error(`Failed on ${job.in}:`, err.message);
  }
}
