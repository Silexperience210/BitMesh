/**
 * NFC Service - Lecture/écriture de transactions sur cartes NFC
 * Compatible avec NDEF (NFC Data Exchange Format)
 */
import { Platform } from 'react-native';

// Note: Pour une vraie implémentation NFC, il faudrait:
// - react-native-nfc-manager pour React Native
// - expo-nfc si disponible

export interface NFCTransactionRecord {
  txHex: string;
  txid: string;
  timestamp: number;
  description?: string;
}

/**
 * Vérifie si NFC est disponible sur l'appareil
 */
export async function isNFCAvailable(): Promise<boolean> {
  // Pour l'instant, retourne false (à implémenter avec lib NFC)
  return false;
}

/**
 * Écrit une transaction sur une carte NFC
 */
export async function writeTransactionToNFC(
  record: NFCTransactionRecord
): Promise<{ success: boolean; error?: string }> {
  try {
    // TODO: Implémenter avec react-native-nfc-manager
    // 1. Formater en NDEF
    // 2. Écrire sur la carte
    
    console.log('[NFC] Écriture transaction:', record.txid);
    
    return {
      success: false,
      error: 'NFC non implémenté. Utilisez expo-nfc ou react-native-nfc-manager.',
    };
  } catch (error) {
    console.error('[NFC] Erreur écriture:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Lit une transaction depuis une carte NFC
 */
export async function readTransactionFromNFC(): Promise<{
  success: boolean;
  record?: NFCTransactionRecord;
  error?: string;
}> {
  try {
    // TODO: Implémenter avec react-native-nfc-manager
    // 1. Démarrer le scan NFC
    // 2. Parser le NDEF
    // 3. Retourner la transaction
    
    console.log('[NFC] Lecture transaction...');
    
    return {
      success: false,
      error: 'NFC non implémenté. Utilisez expo-nfc ou react-native-nfc-manager.',
    };
  } catch (error) {
    console.error('[NFC] Erreur lecture:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Formate une transaction pour NDEF
 */
export function formatTransactionForNDEF(record: NFCTransactionRecord): string {
  return JSON.stringify({
    t: 'bitmesh-tx', // type
    h: record.txHex,
    i: record.txid,
    ts: record.timestamp,
    d: record.description || '',
  });
}

/**
 * Parse un record NDEF en transaction
 */
export function parseNDEFTransaction(data: string): NFCTransactionRecord | null {
  try {
    const parsed = JSON.parse(data);
    
    if (parsed.t !== 'bitmesh-tx') {
      return null;
    }
    
    return {
      txHex: parsed.h,
      txid: parsed.i,
      timestamp: parsed.ts,
      description: parsed.d,
    };
  } catch {
    return null;
  }
}
