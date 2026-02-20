#!/usr/bin/env node
/**
 * Patch meshcore.js pour React Native
 * Supprime l'import TCPConnection qui nécessite le module Node.js 'net'
 */

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '../node_modules/@liamcottle/meshcore.js/src/index.js');

if (!fs.existsSync(indexPath)) {
  console.log('[patch-meshcore] Fichier non trouvé, skip');
  process.exit(0);
}

let content = fs.readFileSync(indexPath, 'utf8');

// Vérifier si déjà patché
if (content.includes('// import TCPConnection')) {
  console.log('[patch-meshcore] Déjà patché, skip');
  process.exit(0);
}

// Patcher le fichier
content = content.replace(
  'import TCPConnection from "./connection/tcp_connection.js";',
  '// import TCPConnection from "./connection/tcp_connection.js"; // Commenté pour React Native (pas de module net)\nconst TCPConnection = null; // Fallback pour React Native'
);

content = content.replace(
  'TCPConnection,',
  '// TCPConnection, // Commenté pour React Native'
);

fs.writeFileSync(indexPath, content);
console.log('[patch-meshcore] Patch appliqué avec succès');
