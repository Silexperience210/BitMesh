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
import { createTransaction, estimateFee, validateAddress, signTransaction } from '@/utils/bitcoin-tx';

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
  sendBitcoin: (toAddress: string, amountSats: number, feeRate: number) => Promise<{ txid: string; hex: string }>;
  estimateSendFee: (amountSats: number, feeRate: number) => number;
}

export const [BitcoinContext, useBitcoin] = createContextHook((): BitcoinState => {
  const { walletInfo, receiveAddresses, isInitialized, mnemonic } = useWalletSeed();
  
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
      const primaryAddress = receiveAddresses[0];
      
      console.log('[Bitcoin] Sync adresse:', primaryAddress);

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
   * Estime les frais pour un envoi
   */
  const estimateSendFee = useCallback((amountSats: number, feeRate: number): number => {
    // Sélectionner les UTXOs nécessaires
    let totalNeeded = amountSats;
    let numInputs = 0;
    let selectedValue = 0;
    
    for (const utxo of utxos.filter(u => u.status.confirmed).sort((a, b) => b.value - a.value)) {
      selectedValue += utxo.value;
      numInputs++;
      
      const fee = estimateFee(numInputs, 2, feeRate);
      if (selectedValue >= amountSats + fee) {
        return fee;
      }
    }
    
    return estimateFee(1, 2, feeRate); // Estimation par défaut
  }, [utxos]);

  /**
   * Envoie des bitcoins
   * Retourne la transaction hex (à signer manuellement pour l'instant)
   */
  const sendBitcoin = useCallback(async (
    toAddress: string,
    amountSats: number,
    feeRate: number
  ): Promise<{ txid: string; hex: string }> => {
    if (!isInitialized || !receiveAddresses.length || !mnemonic) {
      throw new Error('Wallet non initialisé');
    }

    if (!validateAddress(toAddress)) {
      throw new Error('Adresse invalide');
    }

    if (amountSats <= 0) {
      throw new Error('Montant invalide');
    }

    if (amountSats > balance) {
      throw new Error('Solde insuffisant');
    }

    const primaryAddress = receiveAddresses[0];
    
    console.log('[Bitcoin] Création transaction:', {
      to: toAddress,
      amount: amountSats,
      feeRate,
    });

    try {
      // Créer la transaction
      const unsignedTx = createTransaction(
        utxos,
        toAddress,
        amountSats,
        primaryAddress, // Change revient à nous
        feeRate
      );

      console.log('[Bitcoin] Transaction créée:', unsignedTx.txid);
      console.log('[Bitcoin] Frais:', unsignedTx.fee);
      
      // Signer la transaction
      const signedHex = await signTransaction(unsignedTx.hex, mnemonic, utxos);
      
      // Broadcast
      const { txid } = await broadcastTransaction(signedHex);
      
      console.log('[Bitcoin] Transaction broadcastée:', txid);
      
      // Rafraîchir le solde
      await refreshBalance();
      
      return { txid, hex: signedHex };
      
    } catch (error) {
      console.error('[Bitcoin] Erreur création transaction:', error);
      throw error;
    }
  }, [isInitialized, receiveAddresses, mnemonic, balance, utxos]);

  // Sync au montage
  useEffect(() => {
    if (isInitialized) {
      refreshBalance();
    }
  }, [isInitialized, refreshBalance]);

  // Sync périodique
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
    estimateSendFee,
  };
});
