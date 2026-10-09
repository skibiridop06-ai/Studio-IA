module.exports = function (api) {
  api.cache(true);
  // babel-preset-expo já inclui o plugin de worklets (Reanimated 4) automaticamente.
  return { presets: ['babel-preset-expo'] };
};
