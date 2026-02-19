/**
 * Utilitaires pour hasher les nodeIds dans les topics MQTT
 * 
 * Permet de masquer les vrais nodeIds dans les topics publics
 */

/**
 * Hashe simple d'un nodeId pour l'utiliser dans un topic MQTT
 * @param nodeId - NodeId original (ex: "MESH-A7F2")
 * @returns Hash court (16 premiers caractères)
 */
export function hashNodeIdForTopic(nodeId: string): string {
  // Simple hash: XOR des codes de caractères
  let hash = 0;
  for (let i = 0; i < nodeId.length; i++) {
    const char = nodeId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convertir en hex positif
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  // Ajouter un second hash pour atteindre 16 chars
  let hash2 = 0;
  for (let i = nodeId.length - 1; i >= 0; i--) {
    const char = nodeId.charCodeAt(i);
    hash2 = ((hash2 << 5) - hash2) + char;
    hash2 = hash2 & hash2;
  }
  const hex2 = Math.abs(hash2).toString(16).padStart(8, '0');
  return hex + hex2;
}

/**
 * Topics MQTT avec nodeIds hashés
 */
export const HASHED_TOPICS = {
  identity: (nodeId: string) => `meshcore/identity/${hashNodeIdForTopic(nodeId)}`,
  dm: (nodeId: string) => `meshcore/dm/${hashNodeIdForTopic(nodeId)}`,
  route: (nodeId: string) => `meshcore/route/${hashNodeIdForTopic(nodeId)}`,
} as const;

/**
 * Vérifie si un hash correspond à un nodeId
 * @param hash - Hash à vérifier
 * @param nodeId - NodeId original
 * @returns true si correspondance
 */
export function verifyNodeIdHash(hash: string, nodeId: string): boolean {
  return hash === hashNodeIdForTopic(nodeId);
}
