module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4 : le plugin vit désormais dans react-native-worklets
    // (react-native-reanimated/plugin n'en est qu'un ré-export).
    // Il doit rester le DERNIER plugin de la liste.
    plugins: ['react-native-worklets/plugin'],
  };
};
