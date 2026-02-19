/**
 * Background BLE Service - Maintient la connexion BLE en arrière-plan
 * Utilise expo-background-fetch et expo-task-manager
 */
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { getBleGatewayClient } from '@/utils/ble-gateway';
import { getPendingMessages, removePendingMessage } from '@/utils/database';
import { decodeMeshCorePacket, MeshCoreMessageType, extractTextFromPacket } from '@/utils/meshcore-protocol';

const BACKGROUND_BLE_TASK = 'background-ble-task';
const BACKGROUND_FETCH_TASK = 'background-fetch-ble';

// Configuration des notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Définir la tâche de background
TaskManager.defineTask(BACKGROUND_BLE_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[BackgroundBLE] Erreur:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }

  try {
    const client = getBleGatewayClient();
    
    // Vérifier si connecté
    if (!client.isConnected()) {
      // Tenter de reconnecter
      console.log('[BackgroundBLE] Tentative reconnexion...');
      await client.reconnect().catch(() => {
        // Échec silencieux en background
      });
    }

    // Traiter les messages en attente
    const pending = await getPendingMessages();
    if (pending.length > 0 && client.isConnected()) {
      for (const msg of pending.slice(0, 5)) { // Max 5 messages par cycle
        try {
          await client.sendRawPacket(msg.packet);
          await removePendingMessage(msg.id);
        } catch {
          // Continuer avec le suivant
        }
      }
    }

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (err) {
    console.error('[BackgroundBLE] Erreur:', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  // Tâche périodique pour maintenir la connexion
  const now = new Date().toISOString();
  console.log('[BackgroundFetch] Exécution:', now);
  
  try {
    const client = getBleGatewayClient();
    
    if (!client.isConnected()) {
      await client.reconnect().catch(() => {});
    }
    
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

class BackgroundBleService {
  private isRegistered = false;

  /**
   * Enregistre les tâches de background
   */
  async register(): Promise<void> {
    if (this.isRegistered) return;

    try {
      // Enregistrer le background fetch (toutes les 15 min minimum)
      await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
        minimumInterval: 15 * 60, // 15 minutes
        stopOnTerminate: false,
        startOnBoot: true,
      });

      console.log('[BackgroundBLE] Service enregistré');
      this.isRegistered = true;
    } catch (error) {
      console.error('[BackgroundBLE] Erreur enregistrement:', error);
    }
  }

  /**
   * Démarre le service
   */
  async start(): Promise<void> {
    try {
      await BackgroundFetch.setMinimumIntervalAsync(15 * 60);
      console.log('[BackgroundBLE] Démarré');
    } catch (error) {
      console.error('[BackgroundBLE] Erreur démarrage:', error);
    }
  }

  /**
   * Arrête le service
   */
  async stop(): Promise<void> {
    try {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
      this.isRegistered = false;
      console.log('[BackgroundBLE] Arrêté');
    } catch (error) {
      console.error('[BackgroundBLE] Erreur arrêt:', error);
    }
  }

  /**
   * Vérifie le statut
   */
  async getStatus(): Promise<BackgroundFetch.BackgroundFetchStatus | null> {
    return await BackgroundFetch.getStatusAsync();
  }

  /**
   * Affiche une notification locale
   */
  async showNotification(title: string, body: string): Promise<void> {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: 'message' },
      },
      trigger: null, // Immédiat
    });
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

export { BACKGROUND_BLE_TASK, BACKGROUND_FETCH_TASK };
