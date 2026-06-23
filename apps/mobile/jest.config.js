/**
 * Configuration jest légère pour la logique pure du mobile (lib/).
 *
 * Pas de jest-expo : on teste les fichiers TypeScript sans dépendances natives,
 * en stubant les modules natifs (expo-constants, async-storage) via moduleNameMapper.
 * Les composants React Native / écrans ne sont pas couverts ici — ils relèvent
 * d'un harness jest-expo séparé si besoin futur.
 */
module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/lib'],
  testRegex: '\\.test\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { jsx: 'react', isolatedModules: true } }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@yumia/shared$': '<rootDir>/../../packages/shared/dist/index.js',
    '^expo-constants$': '<rootDir>/test/mocks/expo-constants.js',
    '^expo-secure-store$': '<rootDir>/test/mocks/secure-store.js',
    '^@react-native-async-storage/async-storage$': '<rootDir>/test/mocks/async-storage.js',
  },
};
