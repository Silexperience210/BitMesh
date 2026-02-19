/**
 * Mempool.space API - Broadcast de transactions Bitcoin
 * Permet d'envoyer des transactions raw hex directement
 */

const MEMPOOL_API_BASE = 'https://mempool.space/api';
const MEMPOOL_TESTNET_API_BASE = 'https://mempool.space/testnet/api';

export interface MempoolTxStatus {
  confirmed: boolean;
  blockHeight?: number;
  blockHash?: string;
  blockTime?: number;
}

export interface MempoolUtxo {
  txid: string;
  vout: number;
  value: number;
  status: MempoolTxStatus;
}

export interface MempoolFeeEstimates {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

/**
 * Teste la connexion à mempool.space
 */
export async function testMempoolConnection(url?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const baseUrl = url || MEMPOOL_API_BASE;
    const response = await fetch(`${baseUrl}/blocks/tip/height`, {
      method: 'GET',
      headers: { 'Accept': 'text/plain' },
    });
    
    if (response.ok) {
      const height = await response.text();
      console.log('[Mempool] Connecté, hauteur bloc:', height);
      return { success: true };
    }
    
    return { success: false, error: `HTTP ${response.status}` };
  } catch (error) {
    console.error('[Mempool] Erreur connexion:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Récupère les UTXOs d'une adresse Bitcoin
 */
export async function getAddressUtxos(address: string, url?: string): Promise<MempoolUtxo[]> {
  try {
    const baseUrl = url || MEMPOOL_API_BASE;
    const response = await fetch(`${baseUrl}/address/${address}/utxo`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const utxos: MempoolUtxo[] = await response.json();
    console.log(`[Mempool] ${utxos.length} UTXOs trouvés pour ${address}`);
    return utxos;
  } catch (error) {
    console.error('[Mempool] Erreur récupération UTXOs:', error);
    throw error;
  }
}

/**
 * Récupère le solde confirmé d'une adresse
 */
export async function getAddressBalance(address: string, url?: string): Promise<{ confirmed: number; unconfirmed: number; total: number }> {
  try {
    const baseUrl = url || MEMPOOL_API_BASE;
    const response = await fetch(`${baseUrl}/address/${address}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    const confirmed = data.chain_stats?.funded_txo_sum - data.chain_stats?.spent_txo_sum || 0;
    const unconfirmed = data.mempool_stats?.funded_txo_sum - data.mempool_stats?.spent_txo_sum || 0;
    
    return { confirmed, unconfirmed, total: confirmed + unconfirmed };
  } catch (error) {
    console.error('[Mempool] Erreur récupération solde:', error);
    throw error;
  }
}

/**
 * Récupère les estimations de frais actuels
 */
export async function getFeeEstimates(url?: string): Promise<MempoolFeeEstimates> {
  try {
    const baseUrl = url || MEMPOOL_API_BASE;
    const response = await fetch(`${baseUrl}/v1/fees/recommended`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[Mempool] Erreur récupération frais:', error);
    // Valeurs par défaut sécuritaires
    return {
      fastestFee: 20,
      halfHourFee: 10,
      hourFee: 5,
      economyFee: 2,
      minimumFee: 1,
    };
  }
}

/**
 * Broadcast une transaction raw hex sur le réseau Bitcoin
 * C'est la fonction clé pour envoyer des bitcoins
 */
export async function broadcastTransaction(txHex: string, url?: string): Promise<{ txid: string }> {
  try {
    console.log('[Mempool] Broadcast transaction...');
    const baseUrl = url || MEMPOOL_API_BASE;
    
    const response = await fetch(`${baseUrl}/tx`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: txHex,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Broadcast failed: ${errorText}`);
    }
    
    const txid = await response.text();
    console.log('[Mempool] Transaction broadcastée:', txid);
    
    return { txid };
  } catch (error) {
    console.error('[Mempool] Erreur broadcast:', error);
    throw error;
  }
}

/**
 * Récupère le statut d'une transaction
 */
export async function getTransactionStatus(txid: string): Promise<MempoolTxStatus> {
  try {
    const response = await fetch(`${MEMPOOL_API_BASE}/tx/${txid}/status`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[Mempool] Erreur statut transaction:', error);
    throw error;
  }
}

/**
 * Récupère l'historique des transactions d'une adresse
 */
export async function getAddressTransactions(address: string, limit: number = 50, url?: string): Promise<any[]> {
  try {
    const baseUrl = url || MEMPOOL_API_BASE;
    const response = await fetch(`${baseUrl}/address/${address}/txs`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const txs = await response.json();
    return txs.slice(0, limit);
  } catch (error) {
    console.error('[Mempool] Erreur historique transactions:', error);
    throw error;
  }
}

// Aliases pour compatibilité
export const fetchAddressBalance = getAddressBalance;
export const fetchAddressTransactions = getAddressTransactions;
export const fetchFeeEstimates = getFeeEstimates;
export const fetchBtcPrice = async (mempoolUrl?: string, currency?: string): Promise<number> => {
  // TODO: Implémenter récupération prix BTC
  return currency === 'USD' ? 65000 : 60000;
};
export const formatTransactions = (raw: any[], addresses: string[]): any[] => raw;
export const satsToBtc = (sats: number): string => (sats / 100000000).toFixed(8);
export const satsToFiat = (sats: number, price: number): number => (sats / 100000000) * price;

export interface AddressBalance {
  confirmed: number;
  unconfirmed: number;
  total: number;
}

export interface FormattedTransaction {
  txid: string;
  amount: number;
  type: 'incoming' | 'outgoing';
  confirmed: boolean;
  timestamp?: number;
  blockTime?: number;
  fee?: number;
}

export interface MempoolFeeEstimate {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}
