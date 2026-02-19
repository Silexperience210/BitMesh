/**
 * BitcoinProvider - Gestion du wallet Bitcoin via mempool.space
 * Solde, UTXOs, historique, envoi de transactions
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import { useWalletSeed } from './WalletSeedProvider';
import {
  getAddressUtxos,
  getAddressBalance,
  getFeeEstimates,
  broadcastTransaction,
  getAddressTransactions,
  type MempoolUtxo,
  type MempoolFeeEstimates,
} from '@/utils/mempool';

export interface BitcoinTransaction {
  txid: string;
  amount: number;
  type: 'incoming' | 'outgoing';
  confirmed: boolean;
  timestamp?: number;
  fee?: number;
}

export interface BitcoinState {
  balance: number;
  unconfirmedBalance: number;
  utxos: MempoolUtxo[];
  transactions: BitcoinTransaction[];
  feeEstimates: MempoolFeeEstimates | null;
  isLoading: boolean;
  lastSync: number | null;
  error: string | null;
  refreshBalance: () => Promise<void>;
  sendBitcoin: (toAddress: string, amountSats: number, feeRate: number) => Promise<{ txid: string }>;
}

export const [BitcoinContext, useBitcoin] = createContextHook((): BitcoinState => {
  const { walletInfo, receiveAddresses, isInitialized } = useWalletSeed();
  
  const [balance, setBalance] = useState(0);
  const [unconfirmedBalance, setUnconfirmedBalance] = useState(0);
  const [utxos, setUtxos] = useState<MempoolUtxo[]>([]);
  const [transactions, setTransactions] = useState<BitcoinTransaction[]>([]);
  const [feeEstimates, setFeeEstimates] = useState<MempoolFeeEstimates | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Rafraîchit le solde et les UTXOs
   */
  const refreshBalance = useCallback(async () => {
    if (!isInitialized || !receiveAddresses.length) {
      console.log('[Bitcoin] Wallet non initialisé, skip sync');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Utiliser la première adresse pour le solde (simplifié)
      const primaryAddress = receiveAddresses[0];
      
      console.log('[Bitcoin] Sync adresse:', primaryAddress);

      // Récupérer solde et UTXOs en parallèle
      const [balanceData, utxosData, feesData] = await Promise.all([
        getAddressBalance(primaryAddress),
        getAddressUtxos(primaryAddress),
        getFeeEstimates(),
      ]);

      setBalance(balanceData.confirmed);
      setUnconfirmedBalance(balanceData.unconfirmed);
      setUtxos(utxosData);
      setFeeEstimates(feesData);
      setLastSync(Date.now());

      console.log('[Bitcoin] Sync OK - Solde:', balanceData.confirmed, 'sats');
    } catch (err) {
      console.error('[Bitcoin] Erreur sync:', err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized, receiveAddresses]);

  /**
   * Charge l'historique des transactions
   */
  const loadTransactions = useCallback(async () => {
    if (!isInitialized || !receiveAddresses.length) return;

    try {
      const primaryAddress = receiveAddresses[0];
      const txs = await getAddressTransactions(primaryAddress, 20);
      
      // Transformer en format interne
      const formatted: BitcoinTransaction[] = txs.map((tx: any) => {
        const isIncoming = tx.vout.some((vout: any) => 
          vout.scriptpubkey_address === primaryAddress
        );
        
        const amount = isIncoming
          ? tx.vout
              .filter((vout: any) => vout.scriptpubkey_address === primaryAddress)
              .reduce((sum: number, vout: any) => sum + vout.value, 0)
          : tx.vin
              .filter((vin: any) => vin.prevout?.scriptpubkey_address === primaryAddress)
              .reduce((sum: number, vin: any) => sum + vin.prevout.value, 0);

        return {
          txid: tx.txid,
          amount,
          type: isIncoming ? 'incoming' : 'outgoing',
          confirmed: tx.status?.confirmed ?? false,
          timestamp: tx.status?.block_time,
          fee: tx.fee,
        };
      });

      setTransactions(formatted);
    } catch (err) {
      console.error('[Bitcoin] Erreur chargement transactions:', err);
    }
  }, [isInitialized, receiveAddresses]);

  /**
   * Envoie des bitcoins (simplifié - nécessite une lib de signature)
   * Pour l'instant, cette fonction est un placeholder
   */
  const sendBitcoin = useCallback(async (
    toAddress: string,
    amountSats: number,
    feeRate: number
  ): Promise<{ txid: string }> => {
    throw new Error('Envoi Bitcoin non encore implémenté. Utilisez Cashu pour l\'instant.');
    
    // TODO: Implémenter avec une lib comme bitcoinjs-lib ou @bitcoinerlab/secp256k1
    // 1. Sélectionner les UTXOs
    // 2. Créer la transaction
    // 3. Signer avec la clé privée dérivée du mnemonic
    // 4. Broadcast via mempool.space
  }, []);

  // Sync au montage et quand le wallet change
  useEffect(() => {
    if (isInitialized) {
      refreshBalance();
      loadTransactions();
    }
  }, [isInitialized, refreshBalance, loadTransactions]);

  // Sync périodique (toutes les 2 minutes)
  useEffect(() => {
    if (isInitialized) {
      syncIntervalRef.current = setInterval(() => {
        refreshBalance();
      }, 2 * 60 * 1000);
    }

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [isInitialized, refreshBalance]);

  return {
    balance,
    unconfirmedBalance,
    utxos,
    transactions,
    feeEstimates,
    isLoading,
    lastSync,
    error,
    refreshBalance,
    sendBitcoin,
  };
});
