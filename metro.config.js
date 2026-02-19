const { getDefaultConfig } = require("expo/metro-config");
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");

const config = getDefaultConfig(__dirname);

// ✅ NOUVEAU: Ignorer les modules Node.js non compatibles React Native
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'net': require.resolve('./node_modules/@liamcottle/meshcore.js/src/connection/serial_connection.js'), // Fallback
  'tls': require.resolve('./node_modules/@liamcottle/meshcore.js/src/connection/serial_connection.js'), // Fallback
  'fs': require.resolve('./node_modules/@liamcottle/meshcore.js/src/connection/serial_connection.js'), // Fallback
};

// ✅ NOUVEAU: Blacklist des modules problématiques
config.resolver.blockList = [
  ...(config.resolver.blockList || []),
  /node_modules\/@liamcottle\/meshcore\.js\/src\/connection\/tcp_connection\.js/,
];

module.exports = withRorkMetro(config);
