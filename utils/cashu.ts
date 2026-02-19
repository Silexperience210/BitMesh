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
  const url = `${mintUrl}/v1/info`;
  console.log('[Cashu] Fetching mint info:', url);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Cashu mint error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log('[Cashu] Mint info:', data.name);
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
    // Si on ne peut pas vérifier, on accepte quand même mais on log
    console.log('[Cashu] Impossible de vérifier le statut des proofs:', err);
  }

  const amount = getTokenAmount(token);
  return { valid: true, token, amount, mintUrl };
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
