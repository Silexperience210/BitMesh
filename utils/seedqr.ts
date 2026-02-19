/**
 * SeedQR - Génération et lecture de QR codes pour seeds BIP39
 * Format: 25x25 grid pour 12 words, 29x29 pour 24 words
 */
import { validateMnemonic, entropyToMnemonic, wordlist } from '@/utils/bitcoin';

// SeedQR utilise un encodage binaire compact
// Chaque mot = 11 bits (index 0-2047 dans BIP39 wordlist)

/**
 * Convertit une seed en données binaires pour SeedQR
 * Format: entropie brute (plus compact que les mots)
 */
export function seedToSeedQRData(mnemonic: string): Uint8Array {
  const words = mnemonic.trim().toLowerCase().split(/\s+/);
  
  if (words.length !== 12 && words.length !== 24) {
    throw new Error('Seed doit être de 12 ou 24 mots');
  }
  
  // Convertir les mots en entropie
  const indices = words.map(word => wordlist.indexOf(word));
  
  if (indices.some(i => i === -1)) {
    throw new Error('Mot invalide dans la seed');
  }
  
  // Calculer la taille de l'entropie
  const totalBits = words.length * 11;
  const entropyBits = totalBits - (totalBits / 33); // Enlever le checksum
  const entropyBytes = entropyBits / 8;
  
  const entropy = new Uint8Array(entropyBytes);
  let currentBit = 0;
  let byteIndex = 0;
  let currentByte = 0;
  
  for (const index of indices) {
    for (let i = 10; i >= 0; i--) {
      const bit = (index >> i) & 1;
      currentByte = (currentByte << 1) | bit;
      currentBit++;
      
      if (currentBit === 8) {
        if (byteIndex < entropyBytes) {
          entropy[byteIndex++] = currentByte;
        }
        currentByte = 0;
        currentBit = 0;
      }
    }
  }
  
  return entropy;
}

/**
 * Décode les données d'un SeedQR
 * Convertit l'entropie en mnémonique
 */
export function seedQRDataToSeed(data: Uint8Array): string {
  // Essayer d'abord comme texte
  const decoder = new TextDecoder();
  const text = decoder.decode(data).trim().toLowerCase();
  
  if (validateMnemonic(text)) {
    return text;
  }
  
  // Sinon, traiter comme entropie brute
  const mnemonic = entropyToMnemonic(data);
  
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
