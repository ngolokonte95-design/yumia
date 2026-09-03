// Adds a brand-new language block to translations.ts from a full {key: value} JSON file.
// Usage: node scripts/i18n-add-language.cjs <locale-code> <ConstName> <path-to-full-json>
const fs = require('fs');
const path = require('path');

const [, , locale, constName, jsonPath] = process.argv;
if (!locale || !constName || !jsonPath) {
  throw new Error('Usage: node i18n-add-language.cjs <locale> <ConstName> <path-to-full-json>');
}

const filePath = path.join(__dirname, '..', 'lib', 'translations.ts');
let content = fs.readFileSync(filePath, 'utf8');

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Extract FR keys (source of truth for TranslationKey) to validate completeness.
const frStart = content.indexOf('const FR = {');
const frBraceIdx = content.indexOf('{', frStart);
const frCloseIdx = content.indexOf('\n} as const;', frBraceIdx);
const frLiteral = content.slice(frBraceIdx, frCloseIdx + 2);
// eslint-disable-next-line no-eval
const frObj = eval('(' + frLiteral + ')');
const frKeys = Object.keys(frObj);

const missing = frKeys.filter((k) => !(k in data));
const extra = Object.keys(data).filter((k) => !frKeys.includes(k));
if (missing.length) {
  console.error(`Missing ${missing.length} keys:`, missing.slice(0, 20));
  throw new Error(`${missing.length} keys missing from ${jsonPath}`);
}
if (extra.length) {
  console.warn(`Warning: ${extra.length} extra keys not in FR (ignored):`, extra.slice(0, 10));
}

// Already exists? Skip creation, just report.
if (content.includes(`const ${constName}`)) {
  throw new Error(`const ${constName} already exists in translations.ts`);
}

let body = '';
for (const key of frKeys) {
  const val = String(data[key]).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  body += `  ${key}: '${val}',\n`;
}

const block = `const ${constName}: Record<TranslationKey, string> = {\n${body}};\n\n`;

// Insert new block right before "export const TRANSLATIONS"
const exportMarker = 'export const TRANSLATIONS';
const exportIdx = content.indexOf(exportMarker);
if (exportIdx === -1) throw new Error('Could not find export const TRANSLATIONS marker');
content = content.slice(0, exportIdx) + block + content.slice(exportIdx);

// Register in TRANSLATIONS map: insert "  xx: XX," before the closing "};" of the map object.
const mapStart = content.indexOf('export const TRANSLATIONS');
const mapBraceIdx = content.indexOf('{', mapStart);
const mapCloseIdx = content.indexOf('\n};', mapBraceIdx);
content = content.slice(0, mapCloseIdx) + `\n  ${locale}: ${constName},` + content.slice(mapCloseIdx);

fs.writeFileSync(filePath, content, 'utf8');
console.log(`Added language '${locale}' (${constName}) with ${frKeys.length} keys.`);
