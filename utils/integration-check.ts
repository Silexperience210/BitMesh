/**
 * Integration Check - Vérifie que tous les modules sont correctement intégrés
 * 
 * À exécuter au démarrage pour détecter les problèmes d'intégration
 */

import { getDatabase } from '@/utils/database';
import { getMessageRetryService } from '@/services/MessageRetryService';
import { getAckService } from '@/services/AckService';
import { getBackgroundBleService } from '@/services/BackgroundBleService';

export interface IntegrationCheck {
  database: boolean;
  retryService: boolean;
  ackService: boolean;
  backgroundBle: boolean;
  errors: string[];
}

export async function runIntegrationCheck(): Promise<IntegrationCheck> {
  const result: IntegrationCheck = {
    database: false,
    retryService: false,
    ackService: false,
    backgroundBle: false,
    errors: [],
  };

  // 1. Vérifier la base de données
  try {
    const db = await getDatabase();
    // Test simple
    await db.getFirstAsync('SELECT 1');
    result.database = true;
    console.log('[IntegrationCheck] ✅ Database OK');
  } catch (error) {
    result.errors.push(`Database: ${error instanceof Error ? error.message : String(error)}`);
    console.error('[IntegrationCheck] ❌ Database failed:', error);
  }

  // 2. Vérifier le service de retry
  try {
    const retryService = getMessageRetryService();
    if (typeof retryService.start === 'function') {
      result.retryService = true;
      console.log('[IntegrationCheck] ✅ MessageRetryService OK');
    } else {
      throw new Error('Invalid retry service');
    }
  } catch (error) {
    result.errors.push(`RetryService: ${error instanceof Error ? error.message : String(error)}`);
    console.error('[IntegrationCheck] ❌ RetryService failed:', error);
  }

  // 3. Vérifier le service ACK
  try {
    const ackService = getAckService();
    if (typeof ackService.sendWithAck === 'function') {
      result.ackService = true;
      console.log('[IntegrationCheck] ✅ AckService OK');
    } else {
      throw new Error('Invalid ACK service');
    }
  } catch (error) {
    result.errors.push(`AckService: ${error instanceof Error ? error.message : String(error)}`);
    console.error('[IntegrationCheck] ❌ AckService failed:', error);
  }

  // 4. Vérifier le background BLE
  try {
    const bgService = getBackgroundBleService();
    if (typeof bgService.register === 'function') {
      result.backgroundBle = true;
      console.log('[IntegrationCheck] ✅ BackgroundBleService OK');
    } else {
      throw new Error('Invalid background BLE service');
    }
  } catch (error) {
    result.errors.push(`BackgroundBLE: ${error instanceof Error ? error.message : String(error)}`);
    console.error('[IntegrationCheck] ❌ BackgroundBLE failed:', error);
  }

  // Résumé
  const allOk = result.database && result.retryService && result.ackService && result.backgroundBle;
  if (allOk) {
    console.log('[IntegrationCheck] ✅ Tous les modules sont intégrés correctement');
  } else {
    console.warn('[IntegrationCheck] ⚠️ Certains modules ont des problèmes:', result.errors);
  }

  return result;
}
