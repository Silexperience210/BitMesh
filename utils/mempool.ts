export interface MempoolAddressInfo {
  address: string;
  chain_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
  mempool_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
}

export interface MempoolTransaction {
  txid: string;
  version: number;
  locktime: number;
  size: number;
  weight: number;
  fee: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
  vin: Array<{
    txid: string;
    vout: number;
    prevout: {
      scriptpubkey_address: string;
      value: number;
    } | null;
  }>;
  vout: Array<{
    scriptpubkey_address: string;
    value: number;
  }>;
}

export interface MempoolFeeEstimate {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

export interface MempoolBlockTip {
  height: number;
  hash: string;
}

export interface AddressBalance {
  confirmed: number;
  unconfirmed: number;
  total: number;
}

export interface FormattedTransaction {
  txid: string;
  type: 'sent' | 'received';
  amount: number;
  fee: number;
  confirmed: boolean;
  blockTime: number | null;
  blockHeight: number | null;
}

export async function fetchAddressInfo(
  baseUrl: string,
  address: string
): Promise<MempoolAddressInfo> {
  const url = `${baseUrl}/api/address/${address}`;
  console.log('[Mempool] Fetching address info:', url);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Mempool API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log('[Mempool] Address info received for', address);
  return data as MempoolAddressInfo;
}

export async function fetchAddressBalance(
  baseUrl: string,
  address: string
): Promise<AddressBalance> {
  const info = await fetchAddressInfo(baseUrl, address);

  const confirmed = info.chain_stats.funded_txo_sum - info.chain_stats.spent_txo_sum;
  const unconfirmed = info.mempool_stats.funded_txo_sum - info.mempool_stats.spent_txo_sum;

  console.log('[Mempool] Balance - confirmed:', confirmed, 'unconfirmed:', unconfirmed);
  return {
    confirmed,
    unconfirmed,
    total: confirmed + unconfirmed,
  };
}

export async function fetchAddressTransactions(
  baseUrl: string,
  address: string
): Promise<MempoolTransaction[]> {
  const url = `${baseUrl}/api/address/${address}/txs`;
  console.log('[Mempool] Fetching transactions:', url);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Mempool API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log('[Mempool] Received', (data as MempoolTransaction[]).length, 'transactions');
  return data as MempoolTransaction[];
}

export async function fetchFeeEstimates(
  baseUrl: string
): Promise<MempoolFeeEstimate> {
  const url = `${baseUrl}/api/v1/fees/recommended`;
  console.log('[Mempool] Fetching fee estimates:', url);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Mempool API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log('[Mempool] Fee estimates:', data);
  return data as MempoolFeeEstimate;
}

export async function fetchBlockTipHeight(
  baseUrl: string
): Promise<number> {
  const url = `${baseUrl}/api/blocks/tip/height`;
  console.log('[Mempool] Fetching block tip height');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Mempool API error: ${response.status} ${response.statusText}`);
  }

  const height = parseInt(await response.text(), 10);
  console.log('[Mempool] Block tip height:', height);
  return height;
}

export async function fetchBtcPrice(
  baseUrl: string,
  currency: string = 'EUR'
): Promise<number> {
  const url = `${baseUrl}/api/v1/prices`;
  console.log('[Mempool] Fetching BTC price');

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Price API error: ${response.status}`);
    }

    const data = await response.json();
    const price = currency === 'USD' ? data.USD : data.EUR;
    console.log('[Mempool] BTC price in', currency, ':', price);
    return price ?? 0;
  } catch (err) {
    console.log('[Mempool] Price fetch error, using fallback:', err);
    return 0;
  }
}

export function formatTransactions(
  txs: MempoolTransaction[],
  ownAddresses: string[]
): FormattedTransaction[] {
  const addressSet = new Set(ownAddresses.map(a => a.toLowerCase()));

  return txs.map((tx) => {
    let totalIn = 0;
    let totalOut = 0;

    for (const vin of tx.vin) {
      if (vin.prevout && addressSet.has(vin.prevout.scriptpubkey_address.toLowerCase())) {
        totalIn += vin.prevout.value;
      }
    }

    for (const vout of tx.vout) {
      if (addressSet.has(vout.scriptpubkey_address.toLowerCase())) {
        totalOut += vout.value;
      }
    }

    const isSent = totalIn > 0;
    const amount = isSent ? totalIn - totalOut - tx.fee : totalOut;

    return {
      txid: tx.txid,
      type: isSent ? 'sent' as const : 'received' as const,
      amount,
      fee: tx.fee,
      confirmed: tx.status.confirmed,
      blockTime: tx.status.block_time ?? null,
      blockHeight: tx.status.block_height ?? null,
    };
  });
}

export function satsToBtc(sats: number): string {
  return (sats / 100000000).toFixed(8);
}

export function satsToFiat(sats: number, btcPrice: number): number {
  return (sats / 100000000) * btcPrice;
}

export async function testMempoolConnection(baseUrl: string): Promise<boolean> {
  try {
    console.log('[Mempool] Testing connection to:', baseUrl);
    const response = await fetch(`${baseUrl}/api/blocks/tip/height`);
    const ok = response.ok;
    console.log('[Mempool] Connection test:', ok ? 'SUCCESS' : 'FAILED');
    return ok;
  } catch (err) {
    console.log('[Mempool] Connection test FAILED:', err);
    return false;
  }
}
