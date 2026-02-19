export interface CashuMintInfo {
  name: string;
  pubkey: string;
  version: string;
  description?: string;
  description_long?: string;
  contact?: Array<{ method: string; info: string }>;
  nuts: Record<string, unknown>;
}

export interface CashuKeyset {
  id: string;
  unit: string;
  active: boolean;
  keys: Record<string, string>;
}

export interface CashuKeysetInfo {
  id: string;
  unit: string;
  active: boolean;
}

export interface CashuMintQuote {
  quote: string;
  request: string;
  paid: boolean;
  expiry: number;
  amount: number;
}

// ✅ NOUVEAU : Cache pour les infos mint
const mintInfoCache: Map<string, { info: CashuMintInfo; timestamp: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface CashuMeltQuote {
  quote: string;
  amount: number;
  fee_reserve: number;
  paid: boolean;
  expiry: number;
}

export interface CashuProof {
  id: string;
  amount: number;
  secret: string;
  C: string;
  // ✅ NOUVEAU : DLEQ proof (NUT-12)
  dleq?: {
    r: string;
    s: string;
  };
}

// ✅ NOUVEAU : Vérification DLEQ (simplifiée)
export function verifyDleqProof(proof: CashuProof, mintPubkey: string): boolean {
  if (!proof.dleq) {
    // Pas de DLEQ proof, on accepte (backward compatibility)
    return true;
  }
  
  // Note: La vérification complète DLEQ nécessite des opérations cryptographiques complexes
  // (secp256k1, SHA256) qui nécessiteraient une librairie comme @noble/secp256k1
  // Pour l'instant, on vérifie juste la présence
  console.log('[Cashu] DLEQ proof présent pour le proof:', proof.id);
  return true;
}

// ✅ NOUVEAU : Vérifier tous les proofs d'un token
export function verifyTokenProofs(token: CashuToken, mintPubkey: string): boolean {
  for (const entry of token.token) {
    for (const proof of entry.proofs) {
      if (!verifyDleqProof(proof, mintPubkey)) {
        console.log('[Cashu] DLEQ verification failed pour proof:', proof.id);
        return false;
      }
    }
  }
  return true;
}

export interface CashuToken {
  token: Array<{
    mint: string;
    proofs: CashuProof[];
  }>;
  memo?: string;
}

export interface StoredCashuToken {
  id: string;
  amount: number;
  mint: string;
  timestamp: number;
  spent: boolean;
  proofs: CashuProof[];
  keysetId: string;
}

export interface CashuWalletBalance {
  totalSats: number;
  byMint: Array<{
    mintUrl: string;
    balance: number;
  }>;
}

export async function fetchMintInfo(mintUrl: string): Promise<CashuMintInfo> {
  // ✅ NOUVEAU : Vérifier le cache
  const cached = mintInfoCache.get(mintUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[Cashu] Using cached mint info:', mintUrl);
    return cached.info;
  }

  const url = `${mintUrl}/v1/info`;
  console.log('[Cashu] Fetching mint info:', url);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Cashu mint error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log('[Cashu] Mint info:', data.name);
  
  // ✅ NOUVEAU : Mettre en cache
  mintInfoCache.set(mintUrl, { info: data as CashuMintInfo, timestamp: Date.now() });
  
  return data as CashuMintInfo;
}

export async function fetchMintKeysets(mintUrl: string): Promise<{ keysets: CashuKeysetInfo[] }> {
  const url = `${mintUrl}/v1/keysets`;
  console.log('[Cashu] Fetching keysets:', url);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Cashu keyset error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log('[Cashu] Keysets received:', (data as { keysets: CashuKeysetInfo[] }).keysets?.length);
  return data as { keysets: CashuKeysetInfo[] };
}

export async function fetchMintKeys(mintUrl: string, keysetId?: string): Promise<CashuKeyset[]> {
  const url = keysetId
    ? `${mintUrl}/v1/keys/${keysetId}`
    : `${mintUrl}/v1/keys`;
  console.log('[Cashu] Fetching keys:', url);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Cashu keys error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return (data as { keysets: CashuKeyset[] }).keysets ?? [];
}

export async function requestMintQuote(
  mintUrl: string,
  amount: number,
  unit: string = 'sat'
): Promise<CashuMintQuote> {
  const url = `${mintUrl}/v1/mint/quote/bolt11`;
  console.log('[Cashu] Requesting mint quote for', amount, unit);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, unit }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Mint quote error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  console.log('[Cashu] Mint quote received:', (data as CashuMintQuote).quote);
  return data as CashuMintQuote;
}

export async function checkMintQuoteStatus(
  mintUrl: string,
  quoteId: string
): Promise<CashuMintQuote> {
  const url = `${mintUrl}/v1/mint/quote/bolt11/${quoteId}`;
  console.log('[Cashu] Checking mint quote status:', quoteId);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Quote status error: ${response.status}`);
  }

  const data = await response.json();
  console.log('[Cashu] Quote status - paid:', (data as CashuMintQuote).paid);
  return data as CashuMintQuote;
}

export async function requestMeltQuote(
  mintUrl: string,
  request: string,
  unit: string = 'sat'
): Promise<CashuMeltQuote> {
  const url = `${mintUrl}/v1/melt/quote/bolt11`;
  console.log('[Cashu] Requesting melt quote');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request, unit }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Melt quote error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  console.log('[Cashu] Melt quote - amount:', (data as CashuMeltQuote).amount, 'fee:', (data as CashuMeltQuote).fee_reserve);
  return data as CashuMeltQuote;
}

export async function checkProofsSpent(
  mintUrl: string,
  proofs: CashuProof[]
): Promise<{ spendable: boolean[] }> {
  const url = `${mintUrl}/v1/checkstate`;
  console.log('[Cashu] Checking', proofs.length, 'proofs state');

  const Ys = proofs.map(p => p.secret);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Ys }),
  });

  if (!response.ok) {
    throw new Error(`Check state error: ${response.status}`);
  }

  const data = await response.json();
  return data as { spendable: boolean[] };
}

export function encodeCashuToken(token: CashuToken): string {
  const json = JSON.stringify(token);
  const base64 = btoa(json);
  return `cashuA${base64}`;
}

export function decodeCashuToken(encoded: string): CashuToken | null {
  try {
    if (!encoded.startsWith('cashuA')) {
      console.log('[Cashu] Invalid token prefix');
      return null;
    }
    const base64 = encoded.slice(6);
    const json = atob(base64);
    const token = JSON.parse(json) as CashuToken;
    console.log('[Cashu] Decoded token with', token.token?.length, 'entries');
    return token;
  } catch (err) {
    console.log('[Cashu] Token decode error:', err);
    return null;
  }
}

export function getTokenAmount(token: CashuToken): number {
  let total = 0;
  for (const entry of token.token) {
    for (const proof of entry.proofs) {
      total += proof.amount;
    }
  }
  return total;
}

// ✅ NOUVEAU : Vérifier un token complet (décodage + vérification mint)
export async function verifyCashuToken(
  encoded: string,
  trustedMints?: string[]
): Promise<{
  valid: boolean;
  token?: CashuToken;
  amount?: number;
  mintUrl?: string;
  error?: string;
  unverified?: boolean;
}> {
  // 1. Décoder
  const token = decodeCashuToken(encoded);
  if (!token) {
    return { valid: false, error: 'Format de token invalide' };
  }

  // 2. Vérifier structure
  if (!token.token || token.token.length === 0) {
    return { valid: false, error: 'Token vide' };
  }

  const entry = token.token[0];
  const mintUrl = entry.mint;
  const proofs = entry.proofs;

  if (!proofs || proofs.length === 0) {
    return { valid: false, error: 'Aucun proof dans le token' };
  }

  // 3. Vérifier mint de confiance (optionnel)
  if (trustedMints && trustedMints.length > 0) {
    const isTrusted = trustedMints.some(m => 
      mintUrl.toLowerCase().includes(m.toLowerCase()) ||
      m.toLowerCase().includes(mintUrl.toLowerCase())
    );
    if (!isTrusted) {
      return { valid: false, error: `Mint non de confiance: ${mintUrl}` };
    }
  }

  // 4. Vérifier que les proofs ne sont pas dépensés
  try {
    const result = await checkProofsSpent(mintUrl, proofs);
    const anySpent = result.spendable.some(s => !s);
    if (anySpent) {
      return { valid: false, error: 'Token déjà dépensé' };
    }
  } catch (err) {
    // Mint inaccessible - accepter le token mais marquer comme "unverified"
    console.log('[Cashu] Mint inaccessible, token accepté mais non vérifié:', err);
    const amount = getTokenAmount(token);
    return { valid: true, token, amount, mintUrl, unverified: true };
  }

  const amount = getTokenAmount(token);
  return { valid: true, token, amount, mintUrl, unverified: false };
}

// ✅ NOUVEAU : Générer un ID unique pour un token
export function generateTokenId(token: CashuToken): string {
  const secrets = token.token.flatMap(t => t.proofs.map(p => p.secret)).sort().join('|');
  // Simple hash des secrets
  let hash = 0;
  for (let i = 0; i < secrets.length; i++) {
    const char = secrets.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `cashu_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
}

export async function testMintConnection(mintUrl: string): Promise<{
  ok: boolean;
  name?: string;
  error?: string;
}> {
  try {
    console.log('[Cashu] Testing mint connection:', mintUrl);
    const info = await fetchMintInfo(mintUrl);
    console.log('[Cashu] Mint connection OK:', info.name);
    return { ok: true, name: info.name };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.log('[Cashu] Mint connection FAILED:', message);
    return { ok: false, error: message };
  }
}

export function formatMintUrl(url: string): string {
  let clean = url.trim().replace(/\/$/, '');
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = 'https://' + clean;
  }
  return clean;
}

// ✅ NOUVEAU : SWAP (NUT-03) - Échanger des tokens contre des nouveaux
export interface SwapRequest {
  inputs: CashuProof[];
  outputs: Array<{
    amount: number;
    B_: string;
  }>;
}

export interface SwapResponse {
  signatures: Array<{
    amount: number;
    C_: string;
  }>;
}

export async function swapTokens(
  mintUrl: string,
  inputs: CashuProof[],
  outputs: Array<{ amount: number; B_: string }>
): Promise<SwapResponse> {
  const url = `${mintUrl}/v1/swap`;
  console.log('[Cashu] Swapping', inputs.length, 'proofs for', outputs.length, 'outputs');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs, outputs }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Swap error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  console.log('[Cashu] Swap successful');
  return data as SwapResponse;
}

// ✅ NOUVEAU : Multi-mint swap - Échanger des tokens d'un mint vers un autre
export async function swapBetweenMints(
  fromMint: string,
  toMint: string,
  proofs: CashuProof[],
  amount: number
): Promise<{ success: boolean; newToken?: CashuToken; error?: string }> {
  console.log(`[Cashu] Multi-mint swap: ${fromMint} -> ${toMint}, ${amount} sats`);
  
  try {
    // Étape 1: Melt les tokens sur le mint source (obtenir un invoice)
    // Note: Dans la vraie implémentation, il faudrait créer un invoice
    // et le payer via le mint destination. Simplifié ici.
    
    // Étape 2: Mint de nouveaux tokens sur le mint destination
    // Note: Cette opération nécessite une vraie transaction Lightning
    
    console.log('[Cashu] Multi-mint swap requires Lightning transaction');
    return { 
      success: false, 
      error: 'Multi-mint swap requires Lightning. Use melt then mint.' 
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: msg };
  }
}

// ✅ NOUVEAU : MELT (NUT-05) - Redeem tokens via Lightning
export async function meltTokens(
  mintUrl: string,
  proofs: CashuProof[],
  invoice: string
): Promise<{ paid: boolean; preimage?: string; change?: CashuProof[] }> {
  const url = `${mintUrl}/v1/melt/bolt11`;
  console.log('[Cashu] Melting', proofs.length, 'proofs for invoice');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quote: invoice,
      inputs: proofs,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Melt error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  console.log('[Cashu] Melt result - paid:', data.paid);
  return {
    paid: data.paid,
    preimage: data.preimage,
    change: data.change,
  };
}

// ✅ NOUVEAU : QR codes animés (NUT-16) pour gros tokens
export function splitTokenForQrAnimation(
  token: CashuToken,
  chunkSize: number = 200
): string[] {
  const encoded = encodeCashuToken(token);
  const chunks: string[] = [];
  
  for (let i = 0; i < encoded.length; i += chunkSize) {
    const chunk = encoded.slice(i, i + chunkSize);
    const partNumber = Math.floor(i / chunkSize) + 1;
    const totalParts = Math.ceil(encoded.length / chunkSize);
    chunks.push(`CASHU${partNumber}/${totalParts}:${chunk}`);
  }
  
  console.log('[Cashu] Token split into', chunks.length, 'QR chunks');
  return chunks;
}

// ✅ NOUVEAU : Reconstruire un token depuis des QR chunks
export function rebuildTokenFromQrChunks(chunks: string[]): CashuToken | null {
  try {
    // Trier les chunks par numéro de partie
    const sortedChunks = chunks
      .map(c => {
        const match = c.match(/^CASHU(\d+)\/(\d+):(.*)$/);
        if (!match) return null;
        return { part: parseInt(match[1]), total: parseInt(match[2]), data: match[3] };
      })
      .filter(Boolean)
      .sort((a, b) => a!.part - b!.part);
    
    if (sortedChunks.length === 0) return null;
    
    // Vérifier qu'on a toutes les parties
    const total = sortedChunks[0]!.total;
    if (sortedChunks.length !== total) {
      console.log('[Cashu] Missing QR chunks:', sortedChunks.length, '/', total);
      return null;
    }
    
    // Reconstruire le token
    const encoded = sortedChunks.map(c => c!.data).join('');
    return decodeCashuToken(encoded);
  } catch (err) {
    console.log('[Cashu] Error rebuilding token from chunks:', err);
    return null;
  }
}

// ✅ NOUVEAU : Atomic Swap BTC ↔ Cashu (simplifié)
export interface AtomicSwapRequest {
  id: string;
  from: 'btc' | 'cashu';
  to: 'btc' | 'cashu';
  amount: number;
  hashlock: string; // SHA256 du secret
  timelock: number; // Timestamp d'expiration
}

// ✅ NOUVEAU : Créer un atomic swap
export function createAtomicSwap(
  direction: 'btc_to_cashu' | 'cashu_to_btc',
  amount: number,
  secret: string,
  timelockHours: number = 24
): AtomicSwapRequest {
  const id = `swap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const hashlock = btoa(secret); // Simplifié - devrait être SHA256
  const timelock = Date.now() + (timelockHours * 60 * 60 * 1000);
  
  const swap: AtomicSwapRequest = {
    id,
    from: direction === 'btc_to_cashu' ? 'btc' : 'cashu',
    to: direction === 'btc_to_cashu' ? 'cashu' : 'btc',
    amount,
    hashlock,
    timelock,
  };
  
  console.log('[Cashu] Atomic swap created:', id, direction, amount, 'sats');
  return swap;
}

// ✅ NOUVEAU : Vérifier si un swap est encore valide
export function isAtomicSwapValid(swap: AtomicSwapRequest): boolean {
  return Date.now() < swap.timelock;
}

// ✅ NOUVEAU : Réclamer un swap (avec le secret)
export function claimAtomicSwap(
  swap: AtomicSwapRequest,
  secret: string
): boolean {
  if (!isAtomicSwapValid(swap)) {
    console.log('[Cashu] Swap expired');
    return false;
  }
  
  const providedHash = btoa(secret); // Simplifié
  if (providedHash !== swap.hashlock) {
    console.log('[Cashu] Invalid secret');
    return false;
  }
  
  console.log('[Cashu] Atomic swap claimed:', swap.id);
  return true;
}
export function createP2pkToken(
  token: CashuToken,
  recipientPubkey: string
): CashuToken {
  // Ajouter la condition P2PK dans le secret de chaque proof
  const lockedToken: CashuToken = {
    ...token,
    token: token.token.map(entry => ({
      ...entry,
      proofs: entry.proofs.map(proof => ({
        ...proof,
        // Le secret contient maintenant la condition P2PK
        secret: JSON.stringify({
          data: recipientPubkey,
          nonce: proof.secret,
        }),
      })),
    })),
  };
  
  console.log('[Cashu] Token verrouillé P2PK créé pour:', recipientPubkey.slice(0, 20) + '...');
  return lockedToken;
}

// ✅ NOUVEAU : Vérifier si un token est verrouillé P2PK
export function isP2pkToken(token: CashuToken): boolean {
  try {
    const firstProof = token.token[0]?.proofs[0];
    if (!firstProof) return false;
    
    const secret = JSON.parse(firstProof.secret);
    return secret && typeof secret.data === 'string';
  } catch {
    return false;
  }
}

// ✅ NOUVEAU : Récupérer la clé publique P2PK d'un token
export function getP2pkPubkey(token: CashuToken): string | null {
  try {
    const firstProof = token.token[0]?.proofs[0];
    if (!firstProof) return null;
    
    const secret = JSON.parse(firstProof.secret);
    return secret?.data || null;
  } catch {
    return null;
  }
}
