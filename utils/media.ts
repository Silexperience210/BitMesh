/**
 * Media Utils — Sélection et redimensionnement d'images/GIFs
 * Transport : MQTT uniquement (trop volumineux pour LoRa)
 *
 * Limites :
 *  - Photo JPEG : resize auto 400×400 max, qualité 0.6 → ~30–80 KB
 *  - GIF animé : pas de manipulation, envoi brut si < MAX_GIF_BYTES
 */

import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

// Limite taille GIF (400 KB)
const MAX_GIF_BYTES = 400 * 1024;
// Dimension max photo (pixels)
const MAX_IMAGE_DIM = 400;
// Qualité JPEG 0-1
const IMAGE_QUALITY = 0.6;

export interface PickedImage {
  base64: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  sizeKB: number;
}

export interface PickedGif {
  base64: string;
  mimeType: 'image/gif';
  sizeKB: number;
}

/**
 * Demander la permission galerie (iOS)
 */
async function requestMediaPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}

/**
 * Demander la permission caméra
 */
async function requestCameraPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  return status === 'granted';
}

/**
 * Choisir une photo depuis la galerie ou la caméra, puis la redimensionner auto
 * Retourne null si l'utilisateur annule
 * Lance une Error si permission refusée ou erreur de traitement
 */
export async function pickAndResizeImage(source: 'gallery' | 'camera' = 'gallery'): Promise<PickedImage | null> {
  // Permissions — erreurs propagées si refusées
  if (source === 'camera') {
    const ok = await requestCameraPermission();
    if (!ok) throw new Error('Permission caméra refusée');
  } else {
    const ok = await requestMediaPermission();
    if (!ok) throw new Error('Permission galerie refusée');
  }

  // Sélection
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1, // On va redimensionner nous-mêmes
        exif: false,
      })
    : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
        exif: false,
      });

  // Annulé par l'utilisateur → null silencieux
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const uri = asset.uri;

  // Calculer les dimensions de redimensionnement
  const origW = asset.width ?? MAX_IMAGE_DIM;
  const origH = asset.height ?? MAX_IMAGE_DIM;
  const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(origW, origH));
  const targetW = Math.round(origW * scale);
  const targetH = Math.round(origH * scale);

  // Redimensionner + compresser JPEG
  const manipResult = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: targetW, height: targetH } }],
    {
      compress: IMAGE_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    }
  );

  if (!manipResult.base64) throw new Error('Erreur conversion base64');

  const sizeKB = Math.round((manipResult.base64.length * 3) / 4 / 1024);
  console.log(`[Media] Photo redimensionnée: ${origW}×${origH} → ${targetW}×${targetH}, ~${sizeKB} KB`);

  return {
    base64: manipResult.base64,
    mimeType: 'image/jpeg',
    width: targetW,
    height: targetH,
    sizeKB,
  };
}

/**
 * Choisir un GIF depuis la galerie
 * Retourne null si l'utilisateur annule ou si le fichier n'est pas un GIF
 * Lance une Error si permission refusée ou GIF trop volumineux
 */
export async function pickGif(): Promise<PickedGif | null> {
  const ok = await requestMediaPermission();
  if (!ok) throw new Error('Permission galerie refusée');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], // GIFs sont inclus dans 'images'
    allowsEditing: false,
    quality: 1,
    exif: false,
  });

  // Annulé par l'utilisateur → null silencieux
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];

  // Vérifier l'extension GIF → null silencieux (mauvais type de fichier)
  const uri = asset.uri;
  const isGif = uri.toLowerCase().includes('.gif') || asset.mimeType === 'image/gif';
  if (!isGif) {
    console.log('[Media] Fichier sélectionné n\'est pas un GIF, utiliser pickAndResizeImage()');
    return null;
  }

  // Lire le fichier en base64
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Vérifier la taille → erreur propagée (feedback important)
  const sizeBytes = Math.round((base64.length * 3) / 4);
  const sizeKB = Math.round(sizeBytes / 1024);

  if (sizeBytes > MAX_GIF_BYTES) {
    throw new Error(`GIF trop lourd: ${sizeKB} KB (max ${MAX_GIF_BYTES / 1024} KB)`);
  }

  console.log(`[Media] GIF sélectionné: ~${sizeKB} KB`);

  return {
    base64,
    mimeType: 'image/gif',
    sizeKB,
  };
}

/**
 * Estime si une base64 image est petite (< 100 KB) ou grande
 */
export function estimateImageSizeKB(base64: string): number {
  return Math.round((base64.length * 3) / 4 / 1024);
}
