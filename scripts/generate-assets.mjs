/**
 * Generates PNG assets for the YUMIA mobile app from the original logo file.
 *
 * Run once before building:
 *   node scripts/generate-assets.mjs
 */

import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = resolve(ROOT, 'apps/mobile/assets');
const LOGO = resolve(ROOT, 'apps/mobile/assets/src/logo-original.png');

let sharp;
try {
  const mod = await import('sharp');
  sharp = mod.default;
} catch {
  console.error('sharp not installed. Run: npm install -D sharp');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

// App icon — 1024×1024, logo recadré centré
await sharp(LOGO)
  .resize(1024, 1024, { fit: 'cover', position: 'centre' })
  .png()
  .toFile(resolve(OUT, 'icon.png'));
console.log('✓ icon.png  (1024×1024)');

// Android adaptive icon — même source, fond déjà dans le logo
await sharp(LOGO)
  .resize(1024, 1024, { fit: 'cover', position: 'centre' })
  .png()
  .toFile(resolve(OUT, 'adaptive-icon.png'));
console.log('✓ adaptive-icon.png  (1024×1024)');

// Favicon web — 196×196
await sharp(LOGO)
  .resize(196, 196, { fit: 'cover', position: 'centre' })
  .png()
  .toFile(resolve(OUT, 'favicon.png'));
console.log('✓ favicon.png  (196×196)');

// Splash screen — logo centré sur fond #130F2E, taille iPhone 14 Pro Max
const splashSize = { width: 1284, height: 2778 };
const logoSize = 600; // taille du logo dans le splash

const logoResized = await sharp(LOGO)
  .resize(logoSize, logoSize, { fit: 'cover', position: 'centre' })
  .png()
  .toBuffer();

const left = Math.round((splashSize.width - logoSize) / 2);
const top = Math.round((splashSize.height - logoSize) / 2) - 200; // légèrement au-dessus du centre

await sharp({
  create: {
    width: splashSize.width,
    height: splashSize.height,
    channels: 3,
    background: { r: 19, g: 15, b: 46 }, // #130F2E
  },
})
  .composite([{ input: logoResized, left, top }])
  .png()
  .toFile(resolve(OUT, 'splash.png'));
console.log('✓ splash.png  (1284×2778)');

console.log('\nTous les assets générés dans apps/mobile/assets/');
