#!/usr/bin/env node
/**
 * Script pour ajouter des try/catch à toutes les fonctions DB
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../utils/database.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Fonction pour ajouter try/catch à une fonction async
function addTryCatchToFunction(content, functionName) {
  const regex = new RegExp(
    `(export async function ${functionName}\\([^)]*\\): Promise<[^>]+>\\s*\\{)(\\s*)(?!\\s*try\\s*\\{)`,
    'g'
  );
  
  return content.replace(regex, (match, p1, p2) => {
    return `${p1}\\n  try {`;
  });
}

// Liste des fonctions à corriger (sans try/catch)
const functionsToFix = [
  'listConversationsDB',
  'loadMessagesDB',
  'updateMessageStatusDB',
  'queuePendingMessage',
  'getPendingMessages',
  'removePendingMessage',
  'incrementRetryCount',
  'cleanupOldMessages',
  'saveCashuToken',
  'getUnspentCashuTokens',
  'markCashuTokenSpent',
  'markCashuTokenPending',
  'markCashuTokenUnspent',
  'markCashuTokenVerified',
  'getCashuTokenById',
  'getCashuBalance',
  'getAllMints',
  'getTokensByMint',
  'exportCashuTokens',
  'importCashuTokens',
  'getUnverifiedCashuTokens',
  'getUserProfile',
  'setUserProfile',
  'savePubkey',
  'getPubkey',
  'getNextMessageId',
  'setAppState',
  'getAppState',
  'migrateFromAsyncStorage',
  'enqueueMqttMessage',
  'getPendingMqttMessages',
  'markMqttMessageSent',
  'incrementMqttRetry',
  'saveSubMeshDB',
  'getSubMeshesDB',
  'deleteSubMeshDB',
  'saveSubMeshPeerDB',
  'getSubMeshPeersDB',
];

console.log('Ajout de try/catch aux fonctions DB...');

for (const funcName of functionsToFix) {
  content = addTryCatchToFunction(content, funcName);
}

// Ajouter les catch à la fin de chaque fonction
// C'est plus complexe, on va le faire manuellement pour les fonctions critiques

fs.writeFileSync(filePath, content);
console.log('Script terminé !');
