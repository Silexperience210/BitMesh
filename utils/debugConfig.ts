/**
 * Configuration Debug - Contrôle l'accès aux outils de debug
 * 
 * En production (__DEV__ = false):
 * - Debugger caché mais accessible via gesture secret
 * - Logs réduits
 * - Tests désactivés
 * 
 * En développement (__DEV__ = true):
 * - Debugger visible
 * - Logs complets
 * - Tests actifs
 */

import { Platform } from 'react-native';

// Mode debug global
export const DEBUG_MODE = __DEV__;

// Feature flags
export const DebugFeatures = {
  // Afficher le bouton debugger dans l'UI
  SHOW_DEBUG_BUTTON: __DEV__,
  
  // Permettre l'accès via shake gesture (même en prod)
  SHAKE_TO_DEBUG: true,
  
  // Logger détaillé
  VERBOSE_LOGGING: __DEV__,
  
  // Tests automatisés disponibles
  ENABLE_DIAGNOSTICS: __DEV__,
  
  // Exporter les logs
  ALLOW_LOG_EXPORT: __DEV__,
  
  // Données brutes accessibles
  SHOW_RAW_DATA: __DEV__,
} as const;

// Secret gesture pour ouvrir le debugger en production
// Secouer 3 fois rapidement
export const DEBUG_GESTURE = {
  SHAKE_COUNT: 3,
  SHAKE_TIMEOUT: 2000, // ms
  SHAKE_THRESHOLD: 15, // m/s²
};

// Masquer les infos sensibles en production
export const sanitizeForProduction = (data: any): any => {
  if (!__DEV__ && typeof data === 'object' && data !== null) {
    // Masquer les clés publiques
    if (data.publicKey) {
      return { ...data, publicKey: data.publicKey.slice(0, 8) + '...' };
    }
    // Masquer les secrets de canal
    if (data.secret) {
      return { ...data, secret: '***' };
    }
  }
  return data;
};

// Logger conditionnel
export const debugLog = (level: 'debug' | 'info' | 'warn' | 'error', ...args: any[]) => {
  if (!DebugFeatures.VERBOSE_LOGGING && level === 'debug') {
    return;
  }
  
  const timestamp = new Date().toISOString();
  const prefix = `[BitMesh:${level.toUpperCase()}]`;
  
  // En production, masquer les données sensibles
  const sanitizedArgs = args.map(arg => sanitizeForProduction(arg));
  
  if (level === 'error') {
    console.error(timestamp, prefix, ...sanitizedArgs);
  } else if (level === 'warn') {
    console.warn(timestamp, prefix, ...sanitizedArgs);
  } else {
    console.log(timestamp, prefix, ...sanitizedArgs);
  }
};

// Hook pour savoir si on peut afficher le debug
export const useDebugFeatures = () => {
  return {
    isDebugMode: DEBUG_MODE,
    features: DebugFeatures,
    canAccessDebugger: DebugFeatures.SHOW_DEBUG_BUTTON || DebugFeatures.SHAKE_TO_DEBUG,
  };
};
