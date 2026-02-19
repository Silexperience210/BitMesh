/**
 * Background BLE Service - Maintient la connexion BLE en arrière-plan
 * 
 * NOTE: Version simplifiée sans expo-background-fetch
 * Pour une version complète, il faudrait migrer vers expo-background-task (SDK 53+)
 */

import { getBleGatewayClient } from '@/utils/ble-gateway';
import { getPendingMessages, removePendingMessage } from '@/utils/database';

class BackgroundBleService {
  private isRegistered = false;

  /**
   * Enregistre le service (simplifié)
   */
  async register(): Promise<void> {
    if (this.isRegistered) return;
    console.log('[BackgroundBLE] Service enregistré (mode simplifié)');
    this.isRegistered = true;
  }

  /**
   * Démarre le service
   */
  async start(): Promise<void> {
    console.log('[BackgroundBLE] Démarré (mode simplifié)');
  }

  /**
   * Arrête le service
   */
  async stop(): Promise<void> {
    this.isRegistered = false;
    console.log('[BackgroundBLE] Arrêté');
  }

  /**
   * Traite les messages en attente (à appeler manuellement)
   */
  async processPendingMessages(): Promise<void> {
    try {
      const client = getBleGatewayClient();
      if (!client.isConnected()) {
        console.log('[BackgroundBLE] Non connecté');
        return;
      }

      const pending = await getPendingMessages();
      if (pending.length === 0) return;

      console.log(`[BackgroundBLE] Traitement de ${pending.length} messages`);

      for (const msg of pending.slice(0, 5)) {
        try {
          await client.sendRawPacket(msg.packet);
          await removePendingMessage(msg.id);
        } catch {
          // Continuer avec le suivant
        }
      }
    } catch (error) {
      console.error('[BackgroundBLE] Erreur:', error);
    }
  }
}

// Singleton
let backgroundService: BackgroundBleService | null = null;

export function getBackgroundBleService(): BackgroundBleService {
  if (!backgroundService) {
    backgroundService = new BackgroundBleService();
  }
  return backgroundService;
}
