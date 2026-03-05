/**
 * CashuNfcModal — CB-like experience for Cashu NFC cards
 * Write: charge a card with Cashu tokens (NTAG215/NTAG216)
 * Read:  redeem a card (verify + save proofs, mark card empty)
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Animated,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { X, Nfc, CreditCard, CheckCircle, AlertCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import {
  encodeCashuToken,
  decodeCashuToken,
  checkProofsSpent,
  generateTokenId,
  type CashuProof,
  type CashuToken,
} from '@/utils/cashu';
import {
  getUnspentCashuTokens,
  getCashuBalance,
  markCashuTokenSpent,
  saveCashuToken,
  type DBCashuToken,
} from '@/utils/database';
import { writeCashuTokenToNFC, readCashuTokenFromNFC, isNFCAvailable } from '@/utils/nfc';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CashuNfcModalProps {
  visible: boolean;
  mode: 'write' | 'read';
  onClose: () => void;
  onSuccess?: (amount: number) => void;
}

type Step = 'amount' | 'preparing' | 'scanning' | 'redeeming' | 'success' | 'error';

interface SelectedProofs {
  tokenId: string;
  proofs: CashuProof[];
  mintUrl: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AMOUNT_PRESETS = [21, 100, 500, 1000, 2100];

/** Greedy selection: pick proofs totalling exactly `amount` sats.
 *  Returns null if impossible with available proofs. */
function selectProofsGreedy(
  tokens: DBCashuToken[],
  amount: number
): SelectedProofs | null {
  // Group by mint
  const byMint = new Map<string, { tokenId: string; proof: CashuProof }[]>();
  for (const t of tokens) {
    const proofs: CashuProof[] = JSON.parse(t.proofs);
    for (const p of proofs) {
      if (!byMint.has(t.mintUrl)) byMint.set(t.mintUrl, []);
      byMint.get(t.mintUrl)!.push({ tokenId: t.id, proof: p });
    }
  }

  // Try each mint independently
  for (const [mintUrl, items] of byMint) {
    const selected: typeof items = [];
    let remaining = amount;

    // Greedy: pick largest fitting proof
    const desc = [...items].sort((a, b) => b.proof.amount - a.proof.amount);
    for (const item of desc) {
      if (item.proof.amount <= remaining) {
        selected.push(item);
        remaining -= item.proof.amount;
        if (remaining === 0) break;
      }
    }

    if (remaining === 0) {
      // Deduplicate tokenIds
      const tokenIdSet = new Set(selected.map(s => s.tokenId));
      return {
        tokenId: [...tokenIdSet][0],
        proofs: selected.map(s => s.proof),
        mintUrl,
      };
    }
  }
  return null;
}

/** Estimate NDEF bytes for a cashuA token written in our format */
function estimateBytes(proofCount: number, mintUrl: string): number {
  // Each proof ≈ 200 bytes in JSON, plus token wrapper overhead
  return proofCount * 200 + mintUrl.length + 80;
}

function getTagInfo(bytes: number): { label: string; ok: boolean; color: string } {
  const ntag215 = bytes <= 490;
  const ntag216 = bytes <= 870;
  if (ntag215) return { label: 'NTAG215 ✅', ok: true, color: Colors.green };
  if (ntag216) return { label: 'NTAG216 ✅', ok: true, color: Colors.yellow };
  return { label: 'Trop grand ❌', ok: false, color: Colors.red };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CashuNfcModal({ visible, mode, onClose, onSuccess }: CashuNfcModalProps) {
  const [step, setStep] = useState<Step>(mode === 'read' ? 'scanning' : 'amount');
  const [customAmount, setCustomAmount] = useState('');
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [balance, setBalance] = useState(0);
  const [tokens, setTokens] = useState<DBCashuToken[]>([]);
  const [nfcAvailable, setNfcAvailable] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [succeededAmount, setSucceededAmount] = useState(0);

  // Pulse animation for NFC icon
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (step === 'scanning') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [step, pulseAnim]);

  useEffect(() => {
    if (visible) {
      setStep(mode === 'read' ? 'scanning' : 'amount');
      setCustomAmount('');
      setSelectedAmount(null);
      setErrorMsg('');
      setStatusMsg('');
      loadData();
      if (mode === 'read') {
        startRead();
      }
    }
  }, [visible, mode]);

  async function loadData() {
    const [avail, bal, toks] = await Promise.all([
      isNFCAvailable(),
      getCashuBalance(),
      getUnspentCashuTokens(),
    ]);
    setNfcAvailable(avail);
    setBalance(bal.total);
    setTokens(toks);
  }

  // ── WRITE flow ─────────────────────────────────────────────────────────────

  const handleWrite = async () => {
    const amount = selectedAmount ?? parseInt(customAmount, 10);
    if (!amount || amount <= 0) {
      Alert.alert('Montant invalide', 'Entrez un montant en sats');
      return;
    }
    if (amount > balance) {
      Alert.alert('Solde insuffisant', `Vous avez seulement ${balance} sats`);
      return;
    }
    if (amount > 10000) {
      Alert.alert(
        'Montant élevé',
        `${amount} sats sur une carte NFC peut être risqué. Continuer ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Continuer', onPress: () => doPrepare(amount) },
        ]
      );
      return;
    }
    await doPrepare(amount);
  };

  const doPrepare = async (amount: number) => {
    setStep('preparing');
    setStatusMsg('Sélection des proofs...');
    try {
      const freshTokens = await getUnspentCashuTokens();

      // Verify selected proofs aren't already spent
      const sel = selectProofsGreedy(freshTokens, amount);
      if (!sel) {
        setStep('error');
        setErrorMsg(`Impossible de sélectionner exactement ${amount} sats. Essayez de consolider (Pack) d'abord.`);
        return;
      }

      setStatusMsg('Vérification au mint...');
      try {
        const check = await checkProofsSpent(sel.mintUrl, sel.proofs);
        const anySpent = check.spendable.some(s => !s);
        if (anySpent) {
          setStep('error');
          setErrorMsg('Certains proofs sont déjà dépensés. Rafraîchissez votre wallet.');
          return;
        }
      } catch {
        // Mint inaccessible — continue anyway (offline)
        setStatusMsg('Mint inaccessible, écriture en mode offline...');
      }

      setStep('scanning');
      await doNfcWrite(sel, amount);
    } catch (err) {
      setStep('error');
      setErrorMsg(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  };

  const doNfcWrite = async (sel: SelectedProofs, amount: number) => {
    setStatusMsg('Approchez la carte NFC...');
    try {
      const token: CashuToken = {
        token: [{ mint: sel.mintUrl, proofs: sel.proofs }],
        memo: 'BitMesh NFC Card',
      };
      const encoded = encodeCashuToken(token);

      const result = await writeCashuTokenToNFC({ token: encoded, amount, memo: 'BitMesh NFC Card' });
      if (!result.success) {
        throw new Error(result.error ?? 'Écriture NFC échouée');
      }

      // Mark all source tokens as spent
      // Find which token IDs contributed these proofs
      const usedSecrets = new Set(sel.proofs.map(p => p.secret));
      const freshTokens = await getUnspentCashuTokens();
      for (const t of freshTokens) {
        const tProofs: CashuProof[] = JSON.parse(t.proofs);
        const contributed = tProofs.some(p => usedSecrets.has(p.secret));
        if (contributed) {
          await markCashuTokenSpent(t.id);
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSucceededAmount(amount);
      setStep('success');
      onSuccess?.(amount);
    } catch (err) {
      setStep('error');
      setErrorMsg(err instanceof Error ? err.message : 'Écriture NFC échouée');
    }
  };

  // ── READ flow ──────────────────────────────────────────────────────────────

  const startRead = async () => {
    setStep('scanning');
    setStatusMsg('Approchez la carte NFC...');
    try {
      const result = await readCashuTokenFromNFC();
      if (!result.success || !result.record) {
        setStep('error');
        setErrorMsg(result.error ?? 'Lecture NFC échouée');
        return;
      }

      const { token: tokenStr, amount } = result.record;

      if (tokenStr === 'CASHU:EMPTY') {
        setStep('error');
        setErrorMsg('Carte vide ou déjà utilisée.');
        return;
      }

      setStep('redeeming');
      setStatusMsg('Vérification au mint...');

      const decoded = decodeCashuToken(tokenStr);
      if (!decoded || !decoded.token[0]) {
        setStep('error');
        setErrorMsg('Format de token invalide sur cette carte.');
        return;
      }

      const entry = decoded.token[0];
      const mintUrl = entry.mint;
      const proofs = entry.proofs;

      try {
        const check = await checkProofsSpent(mintUrl, proofs);
        const allSpent = check.spendable.every(s => !s);
        if (allSpent) {
          setStep('error');
          setErrorMsg('Carte vide ou déjà utilisée.');
          return;
        }
        const anySpent = check.spendable.some(s => !s);
        if (anySpent) {
          setStep('error');
          setErrorMsg('Certains proofs ont déjà été dépensés. Carte partiellement utilisée.');
          return;
        }
      } catch {
        setStatusMsg('Mint inaccessible — sauvegarde en mode offline...');
      }

      // Save proofs to wallet
      const tokenId = generateTokenId(decoded);
      const realAmount = proofs.reduce((s, p) => s + p.amount, 0);
      await saveCashuToken({
        id: tokenId,
        mintUrl,
        amount: realAmount,
        token: tokenStr,
        proofs: JSON.stringify(proofs),
        state: 'unspent',
        source: 'nfc_card',
        memo: 'Carte NFC Cashu',
        unverified: false,
        retryCount: 0,
      });

      // Write CASHU:EMPTY marker on card (best effort — requires a 2nd tap)
      try {
        setStatusMsg('Tapez la carte à nouveau pour la marquer comme utilisée...');
        await writeCashuTokenToNFC({ token: 'CASHU:EMPTY', amount: 0, memo: '' });
      } catch {
        // Non-blocking — proofs already saved, marker is optional
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSucceededAmount(realAmount);
      setStep('success');
      onSuccess?.(realAmount);
    } catch (err) {
      setStep('error');
      setErrorMsg(err instanceof Error ? err.message : 'Erreur NFC');
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const activeAmount = selectedAmount ?? (customAmount ? parseInt(customAmount, 10) || 0 : 0);
  const proofEstimate = activeAmount > 0 ? selectProofsGreedy(tokens, activeAmount) : null;
  const proofCount = proofEstimate ? proofEstimate.proofs.length : 0;
  const estBytes = proofCount > 0 && proofEstimate ? estimateBytes(proofCount, proofEstimate.mintUrl) : 0;
  const tagInfo = estBytes > 0 ? getTagInfo(estBytes) : null;

  const nfcColor = mode === 'write' ? Colors.accent : Colors.green;
  const isWrite = mode === 'write';

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Handle bar */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {isWrite
                ? <CreditCard size={20} color={Colors.accent} />
                : <Nfc size={20} color={Colors.green} />
              }
              <Text style={styles.title}>
                {isWrite ? 'Charger une carte' : 'Encaisser une carte'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* NFC unavailable warning */}
          {!nfcAvailable && (
            <View style={styles.warningBar}>
              <AlertCircle size={14} color={Colors.yellow} />
              <Text style={styles.warningText}>NFC non disponible sur cet appareil</Text>
            </View>
          )}

          {/* ── Step: amount (WRITE only) ────────────────────────────────── */}
          {step === 'amount' && (
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <Text style={styles.balanceHint}>Solde disponible : {balance.toLocaleString()} sats</Text>

              <Text style={styles.sectionLabel}>Montant prédéfini</Text>
              <View style={styles.presetGrid}>
                {AMOUNT_PRESETS.map(amt => (
                  <TouchableOpacity
                    key={amt}
                    style={[styles.preset, selectedAmount === amt && styles.presetSelected]}
                    onPress={() => { setSelectedAmount(amt); setCustomAmount(''); }}
                  >
                    <Text style={[styles.presetText, selectedAmount === amt && styles.presetTextSelected]}>
                      {amt.toLocaleString()}
                    </Text>
                    <Text style={[styles.presetUnit, selectedAmount === amt && styles.presetTextSelected]}>sats</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Ou montant libre</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="Montant en sats"
                placeholderTextColor={Colors.textMuted}
                keyboardType="number-pad"
                value={customAmount}
                onChangeText={(v) => { setCustomAmount(v); setSelectedAmount(null); }}
              />

              {/* Size indicator */}
              {activeAmount > 0 && (
                <View style={styles.sizeIndicator}>
                  {proofCount > 0 && tagInfo ? (
                    <>
                      <Text style={styles.sizeText}>
                        {proofCount} proof{proofCount > 1 ? 's' : ''} · ~{estBytes} bytes
                      </Text>
                      <Text style={[styles.sizeTag, { color: tagInfo.color }]}>{tagInfo.label}</Text>
                    </>
                  ) : (
                    <Text style={styles.sizeText}>
                      {activeAmount > balance ? '⚠ Solde insuffisant' : 'Montant exact introuvable dans votre wallet'}
                    </Text>
                  )}
                </View>
              )}

              {proofCount > 3 && (
                <View style={styles.warnBox}>
                  <AlertCircle size={14} color={Colors.yellow} />
                  <Text style={styles.warnText}>
                    {proofCount} proofs sélectionnés. Utilisez "Pack" dans le wallet pour consolider d'abord.
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryBtn, (!activeAmount || activeAmount > balance || !proofEstimate) && styles.primaryBtnDisabled]}
                onPress={handleWrite}
                disabled={!activeAmount || activeAmount > balance || !proofEstimate}
              >
                <CreditCard size={18} color={Colors.black} />
                <Text style={styles.primaryBtnText}>Charger la carte →</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* ── Step: preparing ──────────────────────────────────────────── */}
          {step === 'preparing' && (
            <View style={styles.centeredBody}>
              <ActivityIndicator color={Colors.accent} size="large" />
              <Text style={styles.statusText}>{statusMsg}</Text>
            </View>
          )}

          {/* ── Step: scanning ───────────────────────────────────────────── */}
          {step === 'scanning' && (
            <View style={styles.centeredBody}>
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <Nfc size={72} color={nfcColor} />
              </Animated.View>
              <Text style={[styles.scanTitle, { color: nfcColor }]}>
                {isWrite ? 'Approchez la carte' : 'Approchez la carte'}
              </Text>
              <Text style={styles.scanSubtitle}>
                {isWrite
                  ? 'Maintenez la carte NFC contre l\'appareil'
                  : 'Posez la carte NFC sur l\'appareil'}
              </Text>
              {statusMsg ? <Text style={styles.statusText}>{statusMsg}</Text> : null}
            </View>
          )}

          {/* ── Step: redeeming ──────────────────────────────────────────── */}
          {step === 'redeeming' && (
            <View style={styles.centeredBody}>
              <ActivityIndicator color={Colors.green} size="large" />
              <Text style={styles.statusText}>{statusMsg}</Text>
            </View>
          )}

          {/* ── Step: success ────────────────────────────────────────────── */}
          {step === 'success' && (
            <View style={styles.centeredBody}>
              <CheckCircle size={64} color={Colors.green} />
              <Text style={styles.successTitle}>
                {isWrite
                  ? `Carte chargée : ${succeededAmount.toLocaleString()} sats`
                  : `${succeededAmount.toLocaleString()} sats reçus !`}
              </Text>
              <Text style={styles.successSubtitle}>
                {isWrite
                  ? 'Le token est écrit sur la carte. Utilisez-la comme du cash.'
                  : 'Les sats ont été ajoutés à votre wallet Cashu.'}
              </Text>
              <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
                <Text style={styles.doneBtnText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step: error ──────────────────────────────────────────────── */}
          {step === 'error' && (
            <View style={styles.centeredBody}>
              <AlertCircle size={64} color={Colors.red} />
              <Text style={styles.errorTitle}>Erreur</Text>
              <Text style={styles.errorMsg}>{errorMsg}</Text>
              <View style={styles.errorActions}>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => {
                    setStep(mode === 'read' ? 'scanning' : 'amount');
                    setErrorMsg('');
                    if (mode === 'read') startRead();
                  }}
                >
                  <Text style={styles.retryBtnText}>Réessayer</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
                  <Text style={styles.doneBtnText}>Fermer</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 32,
    minHeight: 420,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  closeBtn: {
    padding: 4,
  },
  warningBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.yellowDim,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  warningText: {
    color: Colors.yellow,
    fontSize: 13,
  },
  body: {
    paddingBottom: 16,
  },
  balanceHint: {
    color: Colors.textMuted,
    fontSize: 13,
    marginBottom: 16,
  },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  preset: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetSelected: {
    backgroundColor: Colors.accentGlow,
    borderColor: Colors.accent,
  },
  presetText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  presetUnit: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  presetTextSelected: {
    color: Colors.accent,
  },
  amountInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  sizeIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  sizeText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  sizeTag: {
    fontSize: 13,
    fontWeight: '600',
  },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.yellowDim,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  warnText: {
    flex: 1,
    color: Colors.yellow,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  primaryBtnDisabled: {
    opacity: 0.4,
  },
  primaryBtnText: {
    color: Colors.black,
    fontSize: 16,
    fontWeight: '700',
  },
  centeredBody: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 16,
  },
  scanTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  scanSubtitle: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  statusText: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.green,
    textAlign: 'center',
  },
  successSubtitle: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.red,
  },
  errorMsg: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  errorActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  doneBtn: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  doneBtnText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  retryBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryBtnText: {
    color: Colors.black,
    fontSize: 15,
    fontWeight: '600',
  },
});
