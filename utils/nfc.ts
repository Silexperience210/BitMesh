/**
 * NFC Service - Lecture/écriture de transactions sur cartes NFC
 * Utilise react-native-nfc-manager
 */
import NfcManager, { Ndef, NfcTech } from 'react-native-nfc-manager';
import { Platform } from 'react-native';

export interface NFCTransactionRecord {
  txHex: string;
  txid: string;
  timestamp: number;
  description?: string;
}

/**
 * Initialise le NFC manager
 */
export async function initNFC(): Promise<void> {
  try {
    await NfcManager.start();
    console.log('[NFC] Initialisé');
  } catch (error) {
    console.error('[NFC] Erreur initialisation:', error);
    throw error;
  }
}

/**
 * Vérifie si NFC est disponible
 */
export async function isNFCAvailable(): Promise<boolean> {
  try {
    const supported = await NfcManager.isSupported();
    if (!supported) return false;
    
    const enabled = await NfcManager.isEnabled();
    return enabled;
  } catch (error) {
    console.error('[NFC] Erreur vérification:', error);
    return false;
  }
}

/**
 * Écrit une transaction sur une carte NFC
 */
export async function writeTransactionToNFC(
  record: NFCTransactionRecord
): Promise<{ success: boolean; error?: string }> {
  try {
    // Formater en NDEF
    const message = formatTransactionForNDEF(record);
    const bytes = Ndef.encodeMessage([Ndef.textRecord(message)]);
    
    if (!bytes) {
      throw new Error('Échec encodage NDEF');
    }

    // Demander à l'utilisateur d'approcher la carte
    await NfcManager.requestTechnology(NfcTech.Ndef);
    
    // Écrire
    await NfcManager.ndefHandler.writeNdefMessage(bytes);
    
    console.log('[NFC] Transaction écrite:', record.txid);
    
    // Arrêter la session
    await NfcManager.cancelTechnologyRequest();
    
    return { success: true };
  } catch (error) {
    console.error('[NFC] Erreur écriture:', error);
    await NfcManager.cancelTechnologyRequest().catch(() => {});
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
    // Demander à l'utilisateur d'approcher la carte
    await NfcManager.requestTechnology(NfcTech.Ndef);
    
    // Lire le message NDEF
    const tag = await NfcManager.getTag();
    const ndefRecords = tag?.ndefMessage;
    
    if (!ndefRecords || ndefRecords.length === 0) {
      throw new Error('Aucun enregistrement NDEF trouvé');
    }
    
    // Décoder le premier record
    const record = ndefRecords[0];
    const payload = new Uint8Array(record.payload as number[]);
    const decoded = Ndef.text.decodePayload(payload);
    
    // Parser la transaction
    const txRecord = parseNDEFTransaction(decoded);
    
    if (!txRecord) {
      throw new Error('Format de transaction invalide');
    }
    
    console.log('[NFC] Transaction lue:', txRecord.txid);
    
    // Arrêter la session
    await NfcManager.cancelTechnologyRequest();
    
    return { success: true, record: txRecord };
  } catch (error) {
    console.error('[NFC] Erreur lecture:', error);
    await NfcManager.cancelTechnologyRequest().catch(() => {});
    return { success: false, error: String(error) };
  }
}

/**
 * Formate une transaction pour NDEF
 */
export function formatTransactionForNDEF(record: NFCTransactionRecord): string {
  return JSON.stringify({
    t: 'bitmesh-tx',
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

/**
 * Arrête le NFC manager
 */
export async function stopNFC(): Promise<void> {
  try {
    await NfcManager.cancelTechnologyRequest();
    console.log('[NFC] Arrêté');
  } catch (error) {
    console.error('[NFC] Erreur arrêt:', error);
  }
}
