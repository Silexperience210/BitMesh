/**
 * Configuration de rétention des messages
 * 
 * Permet à l'utilisateur de configurer la durée de rétention
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const RETENTION_KEY = 'bitmesh_message_retention_hours';
const DEFAULT_RETENTION_HOURS = 24;

/**
 * Récupère la durée de rétention configurée
 * @returns nombre d'heures
 */
export async function getMessageRetentionHours(): Promise<number> {
  try {
    const value = await AsyncStorage.getItem(RETENTION_KEY);
    return value ? parseInt(value, 10) : DEFAULT_RETENTION_HOURS;
  } catch {
    return DEFAULT_RETENTION_HOURS;
  }
}

/**
 * Configure la durée de rétention
 * @param hours - nombre d'heures (min: 1, max: 168 = 7 jours)
 */
export async function setMessageRetentionHours(hours: number): Promise<void> {
  const clamped = Math.max(1, Math.min(168, hours));
  await AsyncStorage.setItem(RETENTION_KEY, clamped.toString());
}

/**
 * Options de rétention prédéfinies
 */
export const RETENTION_OPTIONS = [
  { label: '1 heure', value: 1 },
  { label: '6 heures', value: 6 },
  { label: '24 heures (défaut)', value: 24 },
  { label: '3 jours', value: 72 },
  { label: '7 jours', value: 168 },
] as const;
