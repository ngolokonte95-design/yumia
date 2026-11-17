/**
 * Corrige @expo/fingerprint sous Windows dans un monorepo.
 *
 * Avec `runtimeVersion: { policy: "fingerprint" }`, EAS refuse un build si
 * l'empreinte calculée sur le poste diffère de celle calculée sur son serveur
 * (« Runtime version mismatch », phase « Configure expo-updates »).
 *
 * Sous Windows, ExpoConfigLoader compare ses motifs d'exclusion
 * (`** /node_modules/@expo/** /*`…) à un chemin relatif en antislashs
 * (`..\..\node_modules\@expo\…`) : rien ne correspond, et des centaines de
 * fichiers de node_modules entrent dans l'empreinte locale alors que macOS
 * (EAS) les écarte. On convertit donc le chemin en POSIX avant la comparaison.
 * Sans effet sur macOS/Linux, où `toPosixPath` ne fait rien.
 *
 * Lancé par le `postinstall` de ce paquet (réappliqué à chaque `npm install`),
 * idempotent, et silencieux si le fichier n'existe pas ou a changé de forme :
 * il ne doit jamais faire échouer une installation (image Docker de l'API).
 */
const fs = require('fs');
const path = require('path');

const BEFORE = 'const relativePath = path_1.default.relative(projectRoot, modulePath);';
const AFTER = 'const relativePath = (0, Path_1.toPosixPath)(path_1.default.relative(projectRoot, modulePath));';

try {
  const pkg = require.resolve('@expo/fingerprint/package.json', { paths: [path.join(__dirname, '..')] });
  const file = path.join(path.dirname(pkg), 'build', 'ExpoConfigLoader.js');
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes(AFTER)) {
    // Déjà corrigé.
  } else if (/toPosixPath\)\(.*relative\(projectRoot/.test(src)) {
    // @expo/fingerprint >= 0.21 (Expo 58) convertit lui-même le chemin :
    // plus rien à corriger.
  } else if (src.includes(BEFORE) && src.includes('Path_1')) {
    fs.writeFileSync(file, src.replace(BEFORE, AFTER));
    console.log('[yumia] @expo/fingerprint corrigé (chemins Windows)');
  } else {
    console.warn('[yumia] @expo/fingerprint a changé : correctif Windows non appliqué, vérifier apps/mobile/scripts/patch-expo-fingerprint.js');
  }
} catch {
  // Paquet absent (installation partielle) : rien à faire.
}
