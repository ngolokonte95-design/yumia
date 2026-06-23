// Génère les screenshots marketing pour App Store / Play Store (1290×2796, 6.7").
// Mockups stylisés aux couleurs YUMIA (pas des captures réelles — à remplacer par
// de vraies captures device quand l'app tournera, mais conformes pour une 1re soumission).
// Usage : node docs/stores/build-screenshots.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'screenshots');
mkdirSync(outDir, { recursive: true });

const W = 1290, H = 2796;
const CORAL = '#FF8A5B', MAGENTA = '#FF2E93', VIOLET = '#8B3DFF';

// Cadre téléphone
const PX = 185, PY = 590, PW = 920, PH = 2120; // frame
const BZ = 18;                                   // bezel
const SX = PX + BZ, SY = PY + BZ, SW = PW - 2 * BZ, SH = PH - 2 * BZ; // screen

const defs = `
  <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${CORAL}"/><stop offset="0.5" stop-color="${MAGENTA}"/><stop offset="1" stop-color="${VIOLET}"/>
  </linearGradient>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#141019"/><stop offset="1" stop-color="#0B0B0F"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="${MAGENTA}" stop-opacity="0.45"/>
    <stop offset="1" stop-color="${VIOLET}" stop-opacity="0"/>
  </radialGradient>`;

// Mini pin YUMIA (teardrop + trou blanc), centré en (cx,cy), hauteur ~h.
function pin(cx, cy, h, fill = 'url(#brand)') {
  const s = h / 52;
  const tx = cx - 20 * s, ty = cy - 26 * s;
  return `<g transform="translate(${tx} ${ty}) scale(${s})">
    <path d="M20,2 C31,2 38,11 38,21 C38,33 20,50 20,50 C20,50 2,33 2,21 C2,11 9,2 20,2 Z" fill="${fill}"/>
    <circle cx="20" cy="20" r="7" fill="#0E0E12"/>
  </g>`;
}

const statusBar = (x, y, w) => `
  <text x="${x + 38}" y="${y + 46}" font-family="Arial" font-size="30" font-weight="700" fill="#fff">9:41</text>
  <g fill="#fff"><rect x="${x + w - 150}" y="${y + 26}" width="34" height="22" rx="4" opacity="0.9"/>
  <rect x="${x + w - 108}" y="${y + 24}" width="30" height="24" rx="4" opacity="0.9"/>
  <rect x="${x + w - 66}" y="${y + 22}" width="46" height="26" rx="6" opacity="0.9"/></g>`;

const phoneFrame = `
  <rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="72" fill="#000"/>
  <rect x="${PX - 2}" y="${PY - 2}" width="${PW + 4}" height="${PH + 4}" rx="74" fill="none" stroke="#2A2A33" stroke-width="3"/>
  <rect x="${SX}" y="${SY}" width="${SW}" height="${SH}" rx="56" fill="#0E0E12"/>
  <rect x="${PX + PW / 2 - 70}" y="${PY + 22}" width="140" height="34" rx="17" fill="#000"/>`;

// rect texte (placeholder typographique)
const line = (x, y, w, h = 16, op = 0.5, fill = '#8A8A99') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" opacity="${op}"/>`;

function headline(l1, l2accent) {
  return `
  <text x="${W / 2}" y="300" font-family="Arial" font-size="78" font-weight="800" fill="#fff" text-anchor="middle">${l1}</text>
  <text x="${W / 2}" y="400" font-family="Arial" font-size="78" font-weight="800" fill="url(#brand)" text-anchor="middle">${l2accent}</text>`;
}

// ── Contenus d'écran ───────────────────────────────────────────────────────────

// 1. Home — Top 3
function screenHome() {
  const cardX = SX + 40, cardW = SW - 80;
  const card = (i, name, uni) => {
    const y = SY + 320 + i * 320;
    return `<rect x="${cardX}" y="${y}" width="${cardW}" height="280" rx="36" fill="#17171E" stroke="#262630" stroke-width="2"/>
      ${pin(cardX + 90, y + 110, 120)}
      <text x="${cardX + 180}" y="${y + 90}" font-family="Arial" font-size="38" font-weight="700" fill="#fff">${name}</text>
      <text x="${cardX + 180}" y="${y + 140}" font-family="Arial" font-size="28" fill="#8A8A99">${uni}</text>
      ${line(cardX + 180, y + 180, cardW - 320, 16, 0.4)}
      <rect x="${cardX + cardW - 130}" y="${y + 40}" width="100" height="56" rx="28" fill="url(#brand)"/>
      <text x="${cardX + cardW - 80}" y="${y + 78}" font-family="Arial" font-size="30" font-weight="800" fill="#fff" text-anchor="middle">${[96,91,88][i]}%</text>`;
  };
  return `
    ${statusBar(SX, SY, SW)}
    <text x="${SX + 40}" y="${SY + 150}" font-family="Arial" font-size="34" fill="#8A8A99">Salut 👋</text>
    <text x="${SX + 40}" y="${SY + 210}" font-family="Arial" font-size="52" font-weight="800" fill="#fff">Ton Top 3 du moment</text>
    ${card(0, 'Le Bistrot', '🍽️ Restaurant · 4 min')}
    ${card(1, 'Café Lumière', '☕ Café · 6 min')}
    ${card(2, 'Rooftop 360', '🌆 Rooftop · 9 min')}`;
}

// 2. Modes
function screenModes() {
  const chips = [['🎲','Surprise'],['❤️','Date'],['👨‍👩‍👧','Famille'],['👥','Groupe'],['✈️','Voyage']];
  let y = SY + 280;
  const items = chips.map((c, i) => {
    const yy = y + i * 200;
    return `<rect x="${SX + 40}" y="${yy}" width="${SW - 80}" height="160" rx="36" fill="#17171E" stroke="#262630" stroke-width="2"/>
      <text x="${SX + 100}" y="${yy + 105}" font-family="Arial" font-size="64" text-anchor="middle">${c[0]}</text>
      <text x="${SX + 170}" y="${yy + 102}" font-family="Arial" font-size="46" font-weight="700" fill="#fff">${c[1]}</text>
      <circle cx="${SX + SW - 80}" cy="${yy + 80}" r="26" fill="none" stroke="url(#brand)" stroke-width="5"/>`;
  }).join('');
  return `${statusBar(SX, SY, SW)}
    <text x="${SX + 40}" y="${SY + 200}" font-family="Arial" font-size="52" font-weight="800" fill="#fff">5 modes, 1 envie</text>
    ${items}`;
}

// 3. For You — grande carte
function screenFeed() {
  const cx = SX + 40, cw = SW - 80, cy = SY + 230, ch = SH - 360;
  return `${statusBar(SX, SY, SW)}
    <text x="${SX + 40}" y="${SY + 160}" font-family="Arial" font-size="52" font-weight="800" fill="#fff">For You ✨</text>
    <rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="44" fill="#17171E" stroke="#262630" stroke-width="2"/>
    <rect x="${cx}" y="${cy}" width="${cw}" height="${ch * 0.62}" rx="44" fill="url(#brand)" opacity="0.9"/>
    <rect x="${cx}" y="${cy + ch * 0.45}" width="${cw}" height="${ch * 0.17}" fill="#17171E" opacity="0.0"/>
    ${pin(cx + cw / 2, cy + ch * 0.31, 200, '#ffffff')}
    <text x="${cx + 50}" y="${cy + ch * 0.62 + 90}" font-family="Arial" font-size="50" font-weight="800" fill="#fff">La Trattoria</text>
    <text x="${cx + 50}" y="${cy + ch * 0.62 + 150}" font-family="Arial" font-size="32" fill="#8A8A99">🍝 Italien · Coup de cœur du quartier</text>
    ${line(cx + 50, cy + ch * 0.62 + 200, cw - 200, 18, 0.4)}
    ${line(cx + 50, cy + ch * 0.62 + 240, cw - 320, 18, 0.3)}
    <rect x="${cx + 50}" y="${cy + ch - 130}" width="240" height="80" rx="40" fill="url(#brand)"/>
    <text x="${cx + 170}" y="${cy + ch - 78}" font-family="Arial" font-size="34" font-weight="700" fill="#fff" text-anchor="middle">J'y vais</text>`;
}

// 4. Passeport — XP + badges
function screenPassport() {
  const gx = SX + 40, gw = SW - 80;
  const badge = (i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const bx = gx + col * (gw / 4) + 30, by = SY + 620 + row * 220;
    const emo = ['🌅','🌙','🌍','🍣','❤️','🔥','🎲','📸'][i];
    const filled = i < 5; // 5 badges débloqués (dégradé), 3 verrouillés (sombre)
    return `<circle cx="${bx + 70}" cy="${by + 70}" r="68" fill="${filled ? 'url(#brand)' : '#17171E'}" stroke="url(#brand)" stroke-width="3" opacity="${filled ? 1 : 0.5}"/>
      <text x="${bx + 70}" y="${by + 92}" font-family="Arial" font-size="56" fill="#fff" text-anchor="middle" opacity="${filled ? 1 : 0.55}">${emo}</text>`;
  };
  let badges = ''; for (let i = 0; i < 8; i++) badges += badge(i);
  return `${statusBar(SX, SY, SW)}
    <text x="${SX + 40}" y="${SY + 160}" font-family="Arial" font-size="52" font-weight="800" fill="#fff">Ton passeport</text>
    <rect x="${gx}" y="${SY + 220}" width="${gw}" height="280" rx="40" fill="#17171E" stroke="#262630" stroke-width="2"/>
    <text x="${gx + 50}" y="${SY + 320}" font-family="Arial" font-size="44" font-weight="800" fill="#fff">⭐ Niveau 4 · Voyageur</text>
    <text x="${gx + 50}" y="${SY + 380}" font-family="Arial" font-size="30" fill="#8A8A99">3 720 / 5 000 XP</text>
    <rect x="${gx + 50}" y="${SY + 410}" width="${gw - 100}" height="36" rx="18" fill="#262630"/>
    <rect x="${gx + 50}" y="${SY + 410}" width="${(gw - 100) * 0.74}" height="36" rx="18" fill="url(#brand)"/>
    <text x="${gx + 10}" y="${SY + 580}" font-family="Arial" font-size="34" font-weight="700" fill="#fff">Badges débloqués</text>
    ${badges}`;
}

// 5. Carte
function screenMap() {
  // fond carte sombre + rues + pins
  let streets = '';
  for (let i = 1; i < 7; i++) streets += `<line x1="${SX}" y1="${SY + i * SH / 7}" x2="${SX + SW}" y2="${SY + i * SH / 7}" stroke="#1C1C24" stroke-width="3"/>`;
  for (let i = 1; i < 5; i++) streets += `<line x1="${SX + i * SW / 5}" y1="${SY}" x2="${SX + i * SW / 5}" y2="${SY + SH}" stroke="#1C1C24" stroke-width="3"/>`;
  const pins = [[0.3,0.4,90],[0.62,0.32,70],[0.45,0.58,110],[0.72,0.66,80],[0.25,0.72,70]]
    .map(([fx,fy,h]) => pin(SX + fx * SW, SY + fy * SH, h)).join('');
  return `
    <clipPath id="mapclip"><rect x="${SX}" y="${SY}" width="${SW}" height="${SH}" rx="56"/></clipPath>
    <g clip-path="url(#mapclip)">
      <rect x="${SX}" y="${SY}" width="${SW}" height="${SH}" fill="#101016"/>
      ${streets}
      <circle cx="${SX + 0.45 * SW}" cy="${SY + 0.58 * SH}" r="160" fill="url(#glow)"/>
      ${pins}
    </g>
    ${statusBar(SX, SY, SW)}
    <rect x="${SX + 50}" y="${SY + 110}" width="${SW - 100}" height="96" rx="48" fill="#17171Eee"/>
    <text x="${SX + 100}" y="${SY + 170}" font-family="Arial" font-size="34" fill="#8A8A99">Dis-moi ton envie…</text>`;
}

const screens = [
  { file: '01-top3.png', head: headline('Ton Top 3,', "choisi par l'IA ✨"), body: screenHome },
  { file: '02-modes.png', head: headline('5 modes', 'pour chaque moment'), body: screenModes },
  { file: '03-foryou.png', head: headline('Un feed', 'rien que pour toi'), body: screenFeed },
  { file: '04-passport.png', head: headline('Des XP', 'à chaque sortie 🔥'), body: screenPassport },
  { file: '05-map.png', head: headline('Explore', 'comme un local 🌍'), body: screenMap },
];

for (const s of screens) {
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>${defs}</defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <ellipse cx="${W / 2}" cy="280" rx="720" ry="520" fill="url(#glow)"/>
    ${s.head}
    ${phoneFrame}
    ${s.body()}
  </svg>`;
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(join(outDir, s.file));
  console.log(`✓ ${s.file}`);
}
console.log('Terminé — 5 screenshots 1290×2796 dans docs/stores/screenshots/');
