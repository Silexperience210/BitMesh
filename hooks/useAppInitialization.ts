/**
 * useAppInitialization - Hook pour initialiser tous les services au démarrage
 * 
 * Ce hook garantit que:
 * 1. La migration AsyncStorage → SQLite est effectuée
 * 2. La base de données est initialisée
 * 3. Les services sont démarrés
 * 4. Les handlers sont enregistrés
 */
import { useEffect, useState } from 'react';
import { getDatabase } from '@/utils/database';
import { isMigrationNeeded, runMigration } from '@/services/MigrationService';
import { getMessageRetryService } from '@/services/MessageRetryService';
import { getAckService } from '@/services/AckService';
import { runIntegrationCheck } from '@/utils/integration-check';

interface InitState {
  isReady: boolean;
  isMigrating: boolean;
  error: string | null;
}

export function useAppInitialization(): InitState {
  const [state, setState] = useState<InitState>({
    isReady: false,
    isMigrating: false,
    error: null,
  });

  useEffect(() => {
    const initialize = async () => {
      try {
        // 1. Initialiser la base de données
        console.log('[Init] Initialisation de la base de données...');
        await getDatabase();

        // 2. Vérifier si migration nécessaire
        const needsMigration = await isMigrationNeeded();
        if (needsMigration) {
          console.log('[Init] Migration des données nécessaire...');
          setState(prev => ({ ...prev, isMigrating: true }));
          
          const result = await runMigration();
          if (result.success) {
            console.log(`[Init] Migration réussie: ${result.migrated} éléments migrés`);
          } else {
            console.error('[Init] Échec de la migration');
          }
          
          setState(prev => ({ ...prev, isMigrating: false }));
        }

        // 3. Initialiser les services
        console.log('[Init] Initialisation des services...');
        
        // Configurer le service de retry
        const retryService = getMessageRetryService((msgId, status) => {
          console.log(`[Init] Message ${msgId}: ${status}`);
          // TODO: Mettre à jour l'UI si nécessaire
        });
        
        // Configurer le service ACK
        const ackService = getAckService(
          (msgId) => {
            console.log(`[Init] ACK reçu pour ${msgId}`);
            // TODO: Mettre à jour le statut du message dans l'UI
          },
          (msgId) => {
            console.log(`[Init] Timeout ACK pour ${msgId}`);
            // TODO: Marquer le message comme failed dans l'UI
          }
        );

        // 4. Vérifier l'intégration complète
        console.log('[Init] Vérification de l\'intégration...');
        const integration = await runIntegrationCheck();
        if (!integration.database || !integration.retryService) {
          console.warn('[Init] Certains modules ont des problèmes:', integration.errors);
        }

        // 5. Marquer comme prêt
        setState({
          isReady: true,
          isMigrating: false,
          error: integration.errors.length > 0 ? integration.errors.join(', ') : null,
        });
        
        console.log('[Init] Application prête');
      } catch (error) {
        console.error('[Init] Erreur d\'initialisation:', error);
        setState({
          isReady: false,
          isMigrating: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        });
      }
    };

    initialize();
  }, []);

  return state;
}
