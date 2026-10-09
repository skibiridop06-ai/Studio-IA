const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Modelos ONNX empacotados como assets (IA local, sem download em runtime)
config.resolver.assetExts.push('onnx');
module.exports = config;
