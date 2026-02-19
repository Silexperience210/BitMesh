/**
 * Compression utilities - Smaz for LoRa payload optimization
 * Réduit la taille des messages texte de ~30-50%
 */

// Smaz - compression pour petites strings
// Portage simplifié de https://github.com/antirez/smaz

const SMAZ_CODEBOOK = [
  'the', 'e', 't', 'a', 'of', 'o', 'and', 'i', 'n', 's', 'e ', 'r', ' th',
  ' t', 'in', 'he', 'th', 'h', 'he ', 'to', '\r\n', 'l', 's ', 'd', ' a', 'an',
  'er', 'c', ' o', 'd ', 'on', ' of', 're', 'of ', 't ', ', ', 'is', 'u', 'at',
  '   ', 'n ', 'or', 'which', 'f', 'm', 'as', 'it', 'that', '\n', 'was', 'en',
  '  ', ' w', 'es', ' an', ' i', '\r', 'f ', 'g', 'p', 'nd', ' s', 'nd ',
  'ed ', 'w', 'ed', 'http://', 'for', 'te', 'ing', 'y ', 'The', ' c', 'ti', 'r ',
  'his', 'st', ' in', 'ar', 'nt', ',', ' to', 'y', 'ng', ' a ', 'her', '...',
  'se', 'b', 'g ', 'P', 'cont', 'but', 'get', 'some', 'ould', 'it ', 'us',
  'en ', 'our', 'de', 'data', 'of ', 'tions', 'me', 'v', 'ment', 'from', 'tion',
  're ', 'age', 'ial', 'ants', 'here', 'wh', 'thei', 'hh', 'ati', 'er ', 'sto', 'be',
  'e s', 'res', 'con', 'ie', 'h', 'per', 'ea', 'sti', 'on ', 'n t', 'are', 'di',
  'ns', 'as ', 'ti', 'ing ', 'is ', 'io', 'pe', 'co', 'up', 'son', 'ch', 'all',
  've', 'z', 'fo', 'tio', 'had', 'ove', 'low', 'est', 'ine', 'an ', 'or ', 'not',
  'a ', 'ma', 'one', 'onl', 'ine', 'ton', 'or', 'ight', 'pro', 'ment', 'oth',
  'has', 'men', 'ty', 'whe', 'ate', 'ver', 'by', 'wo', 'out', 'have', 'ludes', 'ted',
  'com', 'reg', 'ess', 'ari', 'lit', 'sion', 'fi', 'tr', 'may', 'make', 'its', 'ong',
  'port', 'nt ', 'their', 'hi', 'wit', 'ha', 'to ', 'now', 'ere', 'any', 'ith',
  'for ', 'ate', 'bo', 'was', 'ly', 'ter', 'all', 'can', 'be ', 'ent', 'be',
  'an', 'nd', 'ed', 'for', 'te', 'ing', 'y ', 'The', ' c', 'ti', 'r ', 'his',
  'st', ' in', 'ar', 'nt', ',', ' to', 'y', 'ng', ' a ', 'her', '...', 'se', 'b',
  'g ', 'P', 'cont', 'but', 'get', 'some', 'ould', 'it ', 'us', 'en ', 'our', 'de',
];

const SMAZ_FLUSH = 0xFF;

/**
 * Compresse un texte avec Smaz
 * Retourne Uint8Array ou null si compression inefficace
 */
export function compressText(text: string): Uint8Array | null {
  const encoder = new TextEncoder();
  const input = encoder.encode(text);
  
  // Si le texte est très court, pas la peine de compresser
  if (input.length < 20) return null;
  
  const output: number[] = [];
  let i = 0;
  
  while (i < input.length) {
    let matched = false;
    
    // Chercher le plus long match dans le codebook
    for (let len = Math.min(7, input.length - i); len >= 1; len--) {
      const substr = new TextDecoder().decode(input.slice(i, i + len));
      const idx = SMAZ_CODEBOOK.indexOf(substr);
      
      if (idx !== -1) {
        output.push(idx);
        i += len;
        matched = true;
        break;
      }
    }
    
    if (!matched) {
      // Pas de match - encoder le byte tel quel avec flush
      if (input[i] < 32 || input[i] > 127) {
        // Caractère non-ASCII ou contrôle
        output.push(SMAZ_FLUSH);
        output.push(input[i]);
      } else {
        // Caractère ASCII verbatim
        output.push(SMAZ_FLUSH);
        output.push(input[i]);
      }
      i++;
    }
  }
  
  const compressed = new Uint8Array(output);
  
  // Ne retourner que si c'est avantageux (compression > 10%)
  if (compressed.length >= input.length * 0.9) {
    return null;
  }
  
  return compressed;
}

/**
 * Décompresse un texte Smaz
 */
export function decompressText(compressed: Uint8Array): string {
  const output: string[] = [];
  let i = 0;
  
  while (i < compressed.length) {
    const byte = compressed[i];
    
    if (byte === SMAZ_FLUSH) {
      // Verbatim byte
      i++;
      if (i < compressed.length) {
        output.push(String.fromCharCode(compressed[i]));
      }
    } else if (byte < SMAZ_CODEBOOK.length) {
      // Codebook entry
      output.push(SMAZ_CODEBOOK[byte]);
    }
    i++;
  }
  
  return output.join('');
}

/**
 * Compresse pour LoRa - avec métadonnées
 * Format: [1 byte version | 1 byte flags | compressed payload]
 */
export function compressForLora(text: string): Uint8Array | null {
  const compressed = compressText(text);
  if (!compressed) return null;
  
  const result = new Uint8Array(2 + compressed.length);
  result[0] = 0x01; // Version
  result[1] = 0x01; // Flags: compressed
  result.set(compressed, 2);
  
  return result;
}

/**
 * Décompresse depuis LoRa
 */
export function decompressFromLora(data: Uint8Array): string {
  if (data.length < 2) return new TextDecoder().decode(data);
  
  const version = data[0];
  const flags = data[1];
  
  if (version !== 0x01) {
    // Version inconnue - retourner tel quel
    return new TextDecoder().decode(data);
  }
  
  if (flags & 0x01) {
    // Compressed
    return decompressText(data.slice(2));
  }
  
  // Non compressé
  return new TextDecoder().decode(data.slice(2));
}

/**
 * Vérifie si les données sont compressées Smaz
 */
export function isCompressed(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === 0x01 && (data[1] & 0x01) !== 0;
}

/**
 * Compression avec fallback - retourne toujours un résultat
 * Utilise la compression si avantageuse, sinon retourne verbatim
 */
export function compressWithFallback(text: string): { data: Uint8Array; compressed: boolean } {
  const compressed = compressForLora(text);
  if (compressed) {
    return { data: compressed, compressed: true };
  }
  
  // Fallback: verbatim avec header
  const encoder = new TextEncoder();
  const raw = encoder.encode(text);
  const result = new Uint8Array(2 + raw.length);
  result[0] = 0x01; // Version
  result[1] = 0x00; // Flags: non compressé
  result.set(raw, 2);
  
  return { data: result, compressed: false };
}

export function decompress(data: Uint8Array): string {
  return decompressText(data);
}
