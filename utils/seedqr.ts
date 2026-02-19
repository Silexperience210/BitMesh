/**
 * SeedQR - Génération et lecture de QR codes pour seeds BIP39
 * Format: 25x25 grid pour 12 words, 29x29 pour 24 words
 */
import { validateMnemonic } from '@/utils/bitcoin';

// SeedQR utilise un encodage binaire compact
// Chaque mot = 11 bits (index 0-2047 dans BIP39 wordlist)

/**
 * Convertit une seed en données binaires pour SeedQR
 */
export function seedToSeedQRData(mnemonic: string): Uint8Array {
  const words = mnemonic.trim().toLowerCase().split(/\s+/);
  
  if (words.length !== 12 && words.length !== 24) {
    throw new Error('Seed doit être de 12 ou 24 mots');
  }
  
  // TODO: Charger la wordlist et convertir en indices
  // Pour l'instant, on retourne les données brutes
  const encoder = new TextEncoder();
  return encoder.encode(mnemonic);
}

/**
 * Décode les données d'un SeedQR
 */
export function seedQRDataToSeed(data: Uint8Array): string {
  const decoder = new TextDecoder();
  const mnemonic = decoder.decode(data).trim().toLowerCase();
  
  if (!validateMnemonic(mnemonic)) {
    throw new Error('SeedQR invalide');
  }
  
  return mnemonic;
}

/**
 * Vérifie si un texte est un SeedQR valide
 */
export function isValidSeedQR(text: string): boolean {
  try {
    const clean = text.trim().toLowerCase();
    return validateMnemonic(clean);
  } catch {
    return false;
  }
}

/**
 * Génère un QR code texte standard (fallback)
 * Format: mots séparés par des espaces
 */
export function generateSeedQRText(mnemonic: string): string {
  return mnemonic.trim().toLowerCase();
}
