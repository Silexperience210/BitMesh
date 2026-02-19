/**
 * LZW Compression pour MeshCore
 * 
 * Compression des messages pour réduire la taille sur LoRa
 * Basé sur l'algorithme LZW (Lempel-Ziv-Welch)
 * 
 * NUT-XX: Proposition pour MeshCore v2
 */

// Table de caractères initiale (ASCII étendu)
const INITIAL_DICT_SIZE = 256;
const MAX_DICT_SIZE = 4096; // 12 bits max

/**
 * Compresse une chaîne avec LZW
 * @param input Texte à compresser
 * @returns Buffer compressé en base64
 */
export function lzwCompress(input: string): string {
  if (!input || input.length === 0) return '';
  
  // Initialiser le dictionnaire
  let dict = new Map<string, number>();
  for (let i = 0; i < INITIAL_DICT_SIZE; i++) {
    dict.set(String.fromCharCode(i), i);
  }
  
  let dictSize = INITIAL_DICT_SIZE;
  let w = '';
  let result: number[] = [];
  
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const wc = w + c;
    
    if (dict.has(wc)) {
      w = wc;
    } else {
      result.push(dict.get(w)!);
      
      // Ajouter au dictionnaire si pas plein
      if (dictSize < MAX_DICT_SIZE) {
        dict.set(wc, dictSize++);
      }
      
      w = c;
    }
  }
  
  // Ne pas oublier le dernier
  if (w !== '') {
    result.push(dict.get(w)!);
  }
  
  // Encoder en base64 pour transmission
  return encodeCodes(result);
}

/**
 * Décompresse une chaîne LZW
 * @param compressed Buffer compressé (base64)
 * @returns Texte original
 */
export function lzwDecompress(compressed: string): string {
  if (!compressed || compressed.length === 0) return '';
  
  const codes = decodeCodes(compressed);
  
  // Initialiser le dictionnaire
  let dict: string[] = [];
  for (let i = 0; i < INITIAL_DICT_SIZE; i++) {
    dict[i] = String.fromCharCode(i);
  }
  
  let dictSize = INITIAL_DICT_SIZE;
  
  let w = String.fromCharCode(codes[0]);
  let result = w;
  
  for (let i = 1; i < codes.length; i++) {
    const k = codes[i];
    let entry: string;
    
    if (k < dictSize) {
      entry = dict[k];
    } else if (k === dictSize) {
      entry = w + w[0];
    } else {
      throw new Error('Invalid LZW code');
    }
    
    result += entry;
    
    // Ajouter au dictionnaire si pas plein
    if (dictSize < MAX_DICT_SIZE) {
      dict[dictSize++] = w + entry[0];
    }
    
    w = entry;
  }
  
  return result;
}

/**
 * Encode les codes LZW en base64 compact (React Native compatible)
 */
function encodeCodes(codes: number[]): string {
  // Convertir en bytes (12 bits par code)
  const bytes: number[] = [];
  let buffer = 0;
  let bufferSize = 0;
  
  for (const code of codes) {
    buffer = (buffer << 12) | code;
    bufferSize += 12;
    
    while (bufferSize >= 8) {
      bufferSize -= 8;
      bytes.push((buffer >> bufferSize) & 0xFF);
    }
  }
  
  // Flush le buffer restant
  if (bufferSize > 0) {
    bytes.push((buffer << (8 - bufferSize)) & 0xFF);
  }
  
  // Convertir en base64 avec Buffer (React Native compatible)
  const uint8Array = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return Buffer.from(binary, 'binary').toString('base64');
}

/**
 * Décode le base64 en codes LZW (React Native compatible)
 */
function decodeCodes(encoded: string): number[] {
  // Décoder avec Buffer
  const binary = Buffer.from(encoded, 'base64').toString('binary');
  const bytes: number[] = [];
  for (let i = 0; i < binary.length; i++) {
    bytes.push(binary.charCodeAt(i));
  }
  
  const codes: number[] = [];
  let buffer = 0;
  let bufferSize = 0;
  
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bufferSize += 8;
    
    while (bufferSize >= 12) {
      bufferSize -= 12;
      codes.push((buffer >> bufferSize) & 0xFFF);
    }
  }
  
  return codes;
}

/**
 * Compresse un message MeshCore avec header
 */
export function compressMeshCoreMessage(message: string): {
  compressed: string;
  originalSize: number;
  compressedSize: number;
  ratio: number;
} {
  const originalSize = new TextEncoder().encode(message).length;
  const compressed = lzwCompress(message);
  const compressedSize = new TextEncoder().encode(compressed).length;
  const ratio = originalSize > 0 ? (1 - compressedSize / originalSize) : 0;
  
  return {
    compressed: 'LZ' + compressed, // Header 'LZ' pour identifier
    originalSize,
    compressedSize,
    ratio,
  };
}

/**
 * Décompresse un message MeshCore
 */
export function decompressMeshCoreMessage(compressed: string): string {
  // Vérifier le header
  if (!compressed.startsWith('LZ')) {
    // Pas compressé, retourner tel quel
    return compressed;
  }
  
  const data = compressed.slice(2); // Enlever le header
  return lzwDecompress(data);
}

/**
 * Vérifie si la compression est bénéfique
 */
export function shouldCompress(message: string): boolean {
  // Ne compresser que les messages > 100 caractères
  if (message.length < 100) return false;
  
  // Tester la compression
  const result = compressMeshCoreMessage(message);
  
  // Compresser seulement si gain > 20%
  return result.ratio > 0.2;
}

/**
 * Test de compression/décompression
 * @returns true si le test passe
 */
export function testLzwCompression(): boolean {
  const testText = 'This is a test message for LZW compression. '.repeat(10);
  
  try {
    const compressed = compressMeshCoreMessage(testText);
    const decompressed = decompressMeshCoreMessage(compressed.compressed);
    
    const success = decompressed === testText;
    console.log('[LZW] Test:', success ? 'PASSED' : 'FAILED', 
      'Ratio:', Math.round(compressed.ratio * 100) + '%');
    return success;
  } catch (err) {
    console.error('[LZW] Test failed:', err);
    return false;
  }
}

/**
 * Stats de compression pour debug
 */
export function getCompressionStats(text: string): {
  original: number;
  compressed: number;
  ratio: number;
  shouldCompress: boolean;
} {
  const result = compressMeshCoreMessage(text);
  return {
    original: result.originalSize,
    compressed: result.compressedSize,
    ratio: result.ratio,
    shouldCompress: result.ratio > 0.2,
  };
}
