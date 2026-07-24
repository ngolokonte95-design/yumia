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

// Le monorepo contient deux copies de react (19.1.0 ici, 19.2.8 à la racine
// pour l'API). Si react-native (racine) résout l'une et le code app l'autre,
// le dispatcher des hooks est null → « Cannot read property 'useEffect' of
// null ». On épingle donc react (et ses entrées jsx-runtime) sur la copie
// locale attendue par Expo SDK 54.
const reactPath = path.resolve(projectRoot, 'node_modules/react');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    const subpath = moduleName === 'react' ? '' : moduleName.slice('react'.length);
    return context.resolveRequest(context, reactPath + subpath, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
