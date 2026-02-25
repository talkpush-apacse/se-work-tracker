/**
 * Generate PWA app icons from an SVG source.
 * Run: node scripts/generate-icons.mjs
 */
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publicDir = join(root, 'public');
const iconsDir = join(publicDir, 'icons');

// Ensure icons directory exists
mkdirSync(iconsDir, { recursive: true });

// SVG source — teal circle with "WT" monogram (Work Tracker)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#00BFA5"/>
  <text x="256" y="290" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-weight="700" font-size="220" fill="#fff" letter-spacing="-8">WT</text>
</svg>`;

const svgPath = join(iconsDir, 'icon.svg');
writeFileSync(svgPath, svg);
console.log('✓ Created SVG source');

// Generate PNGs using sharp-cli
const sizes = [
  { name: 'icon-192x192.png', size: 192, dir: iconsDir },
  { name: 'icon-512x512.png', size: 512, dir: iconsDir },
  { name: 'apple-touch-icon.png', size: 180, dir: publicDir },
  { name: 'favicon-32x32.png', size: 32, dir: publicDir },
];

for (const { name, size, dir } of sizes) {
  const out = join(dir, name);
  execSync(`npx sharp-cli -i "${svgPath}" -o "${out}" resize ${size} ${size}`, { stdio: 'inherit' });
  console.log(`✓ ${name} (${size}x${size})`);
}

console.log('\nAll icons generated!');
