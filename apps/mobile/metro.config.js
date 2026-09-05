// Configuration Metro pour monorepo (npm workspaces) — voir
// https://docs.expo.dev/guides/monorepos/
// Sans ça, Metro ne regarde que node_modules local à apps/mobile et échoue à
// résoudre les paquets hissés à la racine du monorepo (ex: expo-file-system,
// dont le champ "main" pointe vers une source TS que Metro ne trouve que si
// watchFolders/nodeModulesPaths couvrent la racine du workspace).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// (Ancien correctif retiré : le monorepo avait deux copies de react qui
// pouvaient être résolues différemment selon le module, faisant planter le
// dispatcher des hooks — désormais évité à la source par l'override
// `"react"` dans le package.json racine, qui garantit une copie unique.)

module.exports = config;
