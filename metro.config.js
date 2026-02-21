const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");

const config = getDefaultConfig(__dirname);

const EMPTY_SHIM = path.resolve(__dirname, "shims/empty.js");

// Modules Node.js non disponibles dans React Native → shim vide
const NODE_ONLY_MODULES = new Set([
  "child_process", "net", "tls", "fs", "os", "path", "crypto",
  "serialport",
  "@serialport/bindings-cpp",
  "@serialport/bindings-interface",
  "@serialport/parser-byte-length",
  "@serialport/parser-readline",
  "@serialport/parser-ready",
  "@serialport/stream",
]);

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Shim les modules purement Node.js
  if (NODE_ONLY_MODULES.has(moduleName)) {
    return { type: "sourceFile", filePath: EMPTY_SHIM };
  }
  // Préfixes serialport (ex: @serialport/bindings-cpp/dist/...)
  if (moduleName.startsWith("@serialport/") || moduleName.startsWith("serialport/")) {
    return { type: "sourceFile", filePath: EMPTY_SHIM };
  }
  // stream → readable-stream (compatible RN)
  if (moduleName === "stream") {
    return context.resolveRequest(context, "readable-stream", platform);
  }
  // Déléguer au resolver précédent ou par défaut
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withRorkMetro(config);
