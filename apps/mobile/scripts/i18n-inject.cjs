// Reusable i18n batch-injection script. Usage: node scripts/i18n-inject.cjs <path-to-batch-json>
const fs = require('fs');
const path = require('path');

const jsonPath = process.argv[2];
if (!jsonPath) throw new Error('Usage: node i18n-inject.cjs <path-to-batch-json>');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const filePath = path.join(__dirname, '..', 'lib', 'translations.ts');
let content = fs.readFileSync(filePath, 'utf8');

const langs = ['fr', 'en', 'es', 'pt', 'ar'];
const constNames = { fr: 'FR', en: 'EN', es: 'ES', pt: 'PT', ar: 'AR' };

for (const lang of langs) {
  const constName = constNames[lang];
  const openMarker = `const ${constName}`;
  const openIdx = content.indexOf(openMarker);
  if (openIdx === -1) throw new Error(`Could not find const ${constName}`);
  const braceIdx = content.indexOf('{', openIdx);

  const closeToken = lang === 'fr' ? '\n} as const;' : '\n};';
  const closeIdx = content.indexOf(closeToken, braceIdx);
  if (closeIdx === -1) throw new Error(`Could not find close token for ${constName}`);

  let insertion = '';
  for (const key of Object.keys(data)) {
    const val = data[key][lang].replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
    insertion += `  ${key}: '${val}',\n`;
  }

  content = content.slice(0, closeIdx) + '\n' + insertion.trimEnd() + content.slice(closeIdx);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log(`Injected ${Object.keys(data).length} keys x5 langs from ${path.basename(jsonPath)}`);
