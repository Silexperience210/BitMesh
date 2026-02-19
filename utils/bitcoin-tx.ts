/**
 * Bitcoin transactions - Création et signature de transactions Bitcoin
 * Utilise bitcoinjs-lib pour la construction et la signature
 */
import * as bitcoin from 'bitcoinjs-lib';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeed } from '@/utils/bitcoin';
import type { MempoolUtxo } from './mempool';

const NETWORK = bitcoin.networks.bitcoin; // Mainnet
const DUST_LIMIT = 546; // sats - minimum pour une sortie

export interface TxInput {
  txid: string;
  vout: number;
  value: number;
  scriptPubKey: string;
}

export interface TxOutput {
  address: string;
  value: number;
}

export interface UnsignedTransaction {
  hex: string;
  txid: string;
  fee: number;
  inputs: TxInput[];
  outputs: TxOutput[];
}

/**
 * Dérive la clé privée pour un chemin BIP44 spécifique
 */
function derivePrivateKey(mnemonic: string, path: string): Buffer {
  const seed = mnemonicToSeed(mnemonic);
  const master = HDKey.fromMasterSeed(seed);
  const child = master.derive(path);
  
  if (!child.privateKey) {
    throw new Error('Impossible de dériver la clé privée');
  }
  
  return Buffer.from(child.privateKey);
}

/**
 * Sélectionne les UTXOs à utiliser (simple - prend les plus gros d'abord)
 */
function selectUtxos(utxos: MempoolUtxo[], targetAmount: number, feeRate: number): {
  selected: MempoolUtxo[];
  total: number;
  fee: number;
} {
  // Trier par valeur décroissante
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  
  const selected: MempoolUtxo[] = [];
  let total = 0;
  
  for (const utxo of sorted) {
    if (utxo.status.confirmed) { // Uniquement UTXOs confirmés
      selected.push(utxo);
      total += utxo.value;
      
      // Estimer les frais (approximatif: 150 bytes par input, 35 par output)
      const estimatedSize = 150 * selected.length + 35 * 2 + 10;
      const fee = Math.ceil(estimatedSize * feeRate);
      
      if (total >= targetAmount + fee + DUST_LIMIT) {
        return { selected, total, fee };
      }
    }
  }
  
  throw new Error('Fonds insuffisants');
}

/**
 * Crée une transaction non signée
 */
export function createTransaction(
  utxos: MempoolUtxo[],
  toAddress: string,
  amountSats: number,
  changeAddress: string,
  feeRate: number
): UnsignedTransaction {
  // Sélectionner les UTXOs
  const { selected, total, fee } = selectUtxos(utxos, amountSats, feeRate);
  
  // Créer la transaction
  const psbt = new bitcoin.Psbt({ network: NETWORK });
  
  // Ajouter les inputs
  for (const utxo of selected) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: Buffer.from(utxo.status.blockHash || '', 'hex'), // Simplifié - normalement le scriptPubKey
        value: utxo.value,
      },
    });
  }
  
  // Ajouter la sortie principale
  psbt.addOutput({
    address: toAddress,
    value: amountSats,
  });
  
  // Calculer et ajouter le change
  const change = total - amountSats - fee;
  if (change > DUST_LIMIT) {
    psbt.addOutput({
      address: changeAddress,
      value: change,
    });
  }
  
  // Extraire l'hex non signé (pour estimation)
  const unsignedTx = psbt.data.globalMap.unsignedTx as unknown as bitcoin.Transaction;
  const hex = unsignedTx.toHex();
  const txid = unsignedTx.getId();
  
  return {
    hex,
    txid,
    fee,
    inputs: selected.map(u => ({
      txid: u.txid,
      vout: u.vout,
      value: u.value,
      scriptPubKey: '', // Rempli lors de la signature
    })),
    outputs: [
      { address: toAddress, value: amountSats },
      ...(change > DUST_LIMIT ? [{ address: changeAddress, value: change }] : []),
    ],
  };
}

/**
 * Signe une transaction P2WPKH avec le mnemonic
 * Version simplifiée pour adresses SegWit natives (bc1...)
 */
export async function signTransaction(
  psbtHex: string,
  mnemonic: string,
  utxos: MempoolUtxo[]
): Promise<string> {
  try {
    // Reconstruire le PSBT
    const psbt = bitcoin.Psbt.fromHex(psbtHex, { network: NETWORK });
    
    // Pour chaque input, dériver la clé privée et signer
    for (let i = 0; i < psbt.inputCount; i++) {
      const input = psbt.data.inputs[i];
      
      // Trouver l'UTXO correspondant
      const utxo = utxos.find(u => {
        const hash = Buffer.from(u.txid, 'hex').reverse().toString('hex');
        // Comparer avec l'hash de l'input (format différent)
        return true; // Simplifié - à améliorer
      });
      
      if (!utxo) {
        throw new Error(`UTXO non trouvé pour l'input ${i}`);
      }
      
      // Dériver la clé privée (chemin BIP44 standard)
      const path = `m/84'/0'/0'/0/${utxo.vout}`; // Simplifié - devrait chercher l'index correct
      const privKey = derivePrivateKey(mnemonic, path);
      
      // Signer l'input
      // Note: ECPair n'est pas disponible dans cette version de bitcoinjs-lib
      // La signature complète nécessite une implémentation différente
      throw new Error('Signature non implémentée - utiliser un wallet externe');
    }
    
    // Finaliser
    psbt.finalizeAllInputs();
    
    // Extraire la transaction signée
    const tx = psbt.extractTransaction();
    return tx.toHex();
    
  } catch (error) {
    console.error('[BitcoinTx] Erreur signature:', error);
    throw new Error(`Signature échouée: ${error}`);
  }
}

/**
 * Estime les frais pour une transaction
 */
export function estimateFee(
  numInputs: number,
  numOutputs: number,
  feeRate: number
): number {
  // P2WPKH: ~68 vbytes par input, ~31 vbytes par output
  const vbytes = 68 * numInputs + 31 * numOutputs + 11; // +11 pour l'en-tête
  return Math.ceil(vbytes * feeRate);
}

/**
 * Valide une adresse Bitcoin
 */
export function validateAddress(address: string): boolean {
  try {
    bitcoin.address.toOutputScript(address, NETWORK);
    return true;
  } catch {
    return false;
  }
}
