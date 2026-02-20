import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
} from 'react-native';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Copy,
  QrCode,
  Zap,
  CircleDollarSign,
  RefreshCw,
  ChevronRight,
  Shield,
  Landmark,
  ArrowRightLeft,
  AlertTriangle,
  Plus,
  Check,
  Wifi,
  WifiOff,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useQuery } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useWalletSeed } from '@/providers/WalletSeedProvider';
import { useBitcoin } from '@/providers/BitcoinProvider';
import { useAppSettings } from '@/providers/AppSettingsProvider';
import { shortenAddress } from '@/utils/bitcoin';
import { getBitcoinPrice } from '@/utils/mempool';
import {
  fetchAddressBalance,
  fetchAddressTransactions,
  fetchFeeEstimates,
  fetchBtcPrice,
  formatTransactions,
  satsToBtc,
  satsToFiat,
  type AddressBalance,
  type FormattedTransaction,
  type MempoolFeeEstimate,
} from '@/utils/mempool';
import {
  fetchMintInfo,
  fetchMintKeysets,
  requestMintQuote,
  testMintConnection,
  swapTokens,
  meltTokens,
  verifyCashuToken,
  encodeCashuToken,
  generateTokenId,
  decodeCashuToken,
  type CashuMintInfo,
  type CashuKeysetInfo,
  type CashuMintQuote,
  type CashuProof,
} from '@/utils/cashu';
import { formatSats } from '@/utils/helpers';
import { getCashuBalance, getUnspentCashuTokens, markCashuTokenSpent, saveCashuToken, type DBCashuToken } from '@/utils/database';
import ReceiveBitcoinModal from '@/components/ReceiveBitcoinModal';
import NFCModal from '@/components/NFCModal';
import QRCode from 'react-native-qrcode-svg';
import { writeCashuTokenToNFC, readCashuTokenFromNFC, isNFCAvailable } from '@/utils/nfc';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type WalletTab = 'bitcoin' | 'cashu';

function WalletTabSelector({
  activeTab,
  onTabChange,
}: {
  activeTab: WalletTab;
  onTabChange: (tab: WalletTab) => void;
}) {
  const slideAnim = useRef(new Animated.Value(activeTab === 'bitcoin' ? 0 : 1)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: activeTab === 'bitcoin' ? 0 : 1,
      friction: 8,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [activeTab, slideAnim]);

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, (SCREEN_WIDTH - 40) / 2],
  });

  return (
    <View style={styles.tabSelector}>
      <Animated.View
        style={[
          styles.tabIndicator,
          { transform: [{ translateX }] },
        ]}
      />
      <TouchableOpacity
        style={styles.tabButton}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onTabChange('bitcoin');
        }}
        activeOpacity={0.8}
        testID="tab-bitcoin"
      >
        <Zap size={14} color={activeTab === 'bitcoin' ? Colors.accent : Colors.textMuted} />
        <Text style={[styles.tabText, activeTab === 'bitcoin' && styles.tabTextActive]}>
          Bitcoin
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.tabButton}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onTabChange('cashu');
        }}
        activeOpacity={0.8}
        testID="tab-cashu"
      >
        <CircleDollarSign size={14} color={activeTab === 'cashu' ? Colors.cyan : Colors.textMuted} />
        <Text style={[styles.tabText, activeTab === 'cashu' && styles.tabTextCashu]}>
          Cashu
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function BitcoinBalanceCard({
  balance,
  bitcoinBalance,
  btcPrice,
  fees,
  isLoading,
  currency,
  onReceivePress,
}: {
  balance: AddressBalance | null;
  bitcoinBalance?: number;
  btcPrice: number;
  fees: MempoolFeeEstimate | null;
  isLoading: boolean;
  currency: string;
  onReceivePress: () => void;
}) {
  const glowAnim = useRef(new Animated.Value(0)).current;
  const { walletInfo, isInitialized } = useWalletSeed();

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, [glowAnim]);

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  const totalSats = bitcoinBalance ?? balance?.total ?? 0;
  const fiatValue = satsToFiat(totalSats, btcPrice);

  const handleCopyAddress = useCallback(() => {
    if (walletInfo?.firstReceiveAddress) {
      Clipboard.setStringAsync(walletInfo.firstReceiveAddress).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Copied', 'Address copied to clipboard');
    }
  }, [walletInfo]);

  return (
    <View style={styles.balanceCard}>
      <Animated.View style={[styles.balanceGlow, { opacity: glowOpacity }]} />
      <View style={styles.balanceHeader}>
        <Zap size={16} color={Colors.accent} />
        <Text style={styles.balanceLabel}>Bitcoin Balance</Text>
        {isInitialized && (
          <View style={styles.seedActiveBadge}>
            <Text style={styles.seedActiveBadgeText}>SEED</Text>
          </View>
        )}
        {isLoading && <ActivityIndicator color={Colors.accent} size="small" />}
      </View>

      {isInitialized ? (
        <>
          <Text style={styles.balanceSats}>
            {totalSats.toLocaleString()}
            <Text style={styles.balanceSatsUnit}> sats</Text>
          </Text>
          <Text style={styles.balanceBtc}>
            {satsToBtc(totalSats)} BTC · {currency === 'USD' ? '$' : '€'}{fiatValue.toFixed(2)}
          </Text>
          {balance && balance.unconfirmed !== 0 && (
            <View style={styles.unconfirmedRow}>
              <AlertTriangle size={12} color={Colors.yellow} />
              <Text style={styles.unconfirmedText}>
                {balance.unconfirmed > 0 ? '+' : ''}{balance.unconfirmed.toLocaleString()} sats unconfirmed
              </Text>
            </View>
          )}
          {walletInfo && (
            <View style={styles.derivedAddressRow}>
              <Text style={styles.derivedAddressLabel}>Receive</Text>
              <TouchableOpacity onPress={handleCopyAddress} activeOpacity={0.7} style={styles.addressCopyRow}>
                <Text style={styles.derivedAddressValue}>
                  {shortenAddress(walletInfo.firstReceiveAddress)}
                </Text>
                <Copy size={12} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}
          {fees && (
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Fees</Text>
              <Text style={styles.feeValue}>
                {fees.economyFee} · {fees.halfHourFee} · {fees.fastestFee} sat/vB
              </Text>
            </View>
          )}
        </>
      ) : (
        <View style={styles.noWalletContainer}>
          <AlertTriangle size={24} color={Colors.textMuted} />
          <Text style={styles.noWalletText}>Generate a seed in Settings to activate your Bitcoin wallet</Text>
        </View>
      )}

      <View style={styles.balanceActions}>
        <TouchableOpacity
          style={[styles.actionButton, !isInitialized && styles.actionButtonDisabled]}
          activeOpacity={0.7}
          onPress={() => {
            if (!isInitialized) {
              Alert.alert('No Wallet', 'Generate a seed phrase in Settings first');
              return;
            }
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            Alert.alert('Send', 'Send Bitcoin via LoRa mesh or on-chain');
          }}
          testID="send-btc-button"
        >
          <ArrowUpRight size={20} color={isInitialized ? Colors.black : Colors.textMuted} />
          <Text style={[styles.actionButtonText, !isInitialized && styles.actionButtonTextDisabled]}>Send</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.actionButtonSecondary, !isInitialized && styles.actionButtonDisabledAlt]}
          activeOpacity={0.7}
          onPress={() => {
            if (!isInitialized) {
              Alert.alert('No Wallet', 'Generate a seed phrase in Settings first');
              return;
            }
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onReceivePress();
          }}
          testID="receive-btc-button"
        >
          <ArrowDownLeft size={20} color={isInitialized ? Colors.accent : Colors.textMuted} />
          <Text style={[styles.actionButtonTextSecondary, !isInitialized && styles.actionButtonTextDisabled]}>Receive</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CashuBalanceCard({
  mintInfo,
  isLoading,
  isOnline,
  mintUrl,
}: {
  mintInfo: CashuMintInfo | null;
  isLoading: boolean;
  isOnline: boolean;
  mintUrl: string;
}) {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const [showMintQuote, setShowMintQuote] = useState<boolean>(false);
  const [mintAmount, setMintAmount] = useState<string>('');
  const [mintQuote, setMintQuote] = useState<CashuMintQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState<boolean>(false);
  
  // États pour Melt
  const [showMeltModal, setShowMeltModal] = useState<boolean>(false);
  const [meltInvoice, setMeltInvoice] = useState<string>('');
  const [meltLoading, setMeltLoading] = useState<boolean>(false);
  const [selectedTokens, setSelectedTokens] = useState<string[]>([]);

  // États pour Receive (coller un token cashuA)
  const [showReceiveModal, setShowReceiveModal] = useState<boolean>(false);
  const [receiveInput, setReceiveInput] = useState<string>('');
  const [receiveLoading, setReceiveLoading] = useState<boolean>(false);

  // États pour Send offline (générer un token à partager)
  const [showSendModal, setShowSendModal] = useState<boolean>(false);
  const [sendSelectedTokens, setSendSelectedTokens] = useState<string[]>([]);
  const [sendLoading, setSendLoading] = useState<boolean>(false);
  const [generatedSendToken, setGeneratedSendToken] = useState<string | null>(null);

  // État NFC
  const [nfcAvailable, setNfcAvailable] = useState<boolean>(false);
  const [nfcLoading, setNfcLoading] = useState<boolean>(false);

  useEffect(() => {
    isNFCAvailable().then(setNfcAvailable).catch(() => setNfcAvailable(false));
  }, []);
  
  // ✅ NOUVEAU : Récupérer le solde Cashu depuis la DB
  const [cashuBalance, setCashuBalance] = useState<{ total: number; byMint: Record<string, number> }>({ total: 0, byMint: {} });
  const [tokens, setTokens] = useState<DBCashuToken[]>([]);
  
  useEffect(() => {
    async function loadCashuBalance() {
      try {
        const balance = await getCashuBalance();
        setCashuBalance(balance);
        const unspent = await getUnspentCashuTokens();
        setTokens(unspent);
      } catch (err) {
        console.log('[Cashu] Erreur chargement solde:', err);
      }
    }
    loadCashuBalance();
    // Rafraîchir toutes les 10 secondes
    const interval = setInterval(loadCashuBalance, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  const glowOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.6],
  });

  const handleRequestQuote = useCallback(async () => {
    const amount = parseInt(mintAmount, 10);
    if (!amount || amount <= 0) {
      Alert.alert('Error', 'Enter a valid amount in sats');
      return;
    }
    setQuoteLoading(true);
    try {
      const quote = await requestMintQuote(mintUrl, amount);
      setMintQuote(quote);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Mint Quote Error', msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setQuoteLoading(false);
    }
  }, [mintAmount, mintUrl]);

  const handleCopyInvoice = useCallback(() => {
    if (mintQuote?.request) {
      Clipboard.setStringAsync(mintQuote.request).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Copied', 'Lightning invoice copied to clipboard');
    }
  }, [mintQuote]);

  // ✅ NOUVEAU : Fonction MELT (redeem tokens en Lightning)
  const handleMelt = useCallback(async () => {
    if (!meltInvoice.trim() || selectedTokens.length === 0) {
      Alert.alert('Error', 'Enter a Lightning invoice and select tokens');
      return;
    }
    
    setMeltLoading(true);
    try {
      // Récupérer les proofs des tokens sélectionnés
      const selectedProofs = tokens
        .filter(t => selectedTokens.includes(t.id))
        .flatMap(t => JSON.parse(t.proofs) as CashuProof[]);
      
      const result = await meltTokens(mintUrl, selectedProofs, meltInvoice.trim());
      
      if (result.paid) {
        // Marquer les tokens comme spent
        for (const tokenId of selectedTokens) {
          await markCashuTokenSpent(tokenId);
        }
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Success',
          `Tokens redeemed!${result.preimage ? '\nPreimage: ' + result.preimage.slice(0, 16) + '...' : ''}`
        );
        
        // Rafraîchir le solde
        const balance = await getCashuBalance();
        setCashuBalance(balance);
        const unspent = await getUnspentCashuTokens();
        setTokens(unspent);
        
        setShowMeltModal(false);
        setMeltInvoice('');
        setSelectedTokens([]);
      } else {
        Alert.alert('Failed', 'Payment failed. Tokens not spent.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Melt Error', msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setMeltLoading(false);
    }
  }, [meltInvoice, selectedTokens, tokens, mintUrl]);

  // Receive : coller un token cashuA et le sauvegarder dans le wallet
  const handleReceiveToken = useCallback(async () => {
    const tokenStr = receiveInput.trim();
    if (!tokenStr.startsWith('cashuA')) {
      Alert.alert('Format invalide', 'Le token doit commencer par "cashuA"');
      return;
    }
    setReceiveLoading(true);
    try {
      const verification = await verifyCashuToken(tokenStr);
      if (!verification.valid && !verification.unverified) {
        Alert.alert('Token invalide', verification.error ?? 'Token refusé par le mint');
        return;
      }
      if (!verification.token) {
        Alert.alert('Erreur', 'Impossible de décoder le token');
        return;
      }
      const tokenId = generateTokenId(verification.token);
      const entry = verification.token.token[0];
      await saveCashuToken({
        id: tokenId,
        mintUrl: verification.mintUrl ?? entry.mint ?? 'unknown',
        amount: verification.amount ?? 0,
        token: tokenStr,
        proofs: JSON.stringify(entry.proofs),
        state: verification.unverified ? 'unverified' : 'unspent',
        source: 'manual',
        memo: 'Importé manuellement',
        unverified: verification.unverified ?? false,
        retryCount: 0,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Reçu !', `${verification.amount ?? 0} sats ajoutés au wallet`);
      setShowReceiveModal(false);
      setReceiveInput('');
      // Rafraîchir la liste
      const unspent = await getUnspentCashuTokens();
      setTokens(unspent);
      const balance = await getCashuBalance();
      setCashuBalance(balance);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      Alert.alert('Erreur', msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setReceiveLoading(false);
    }
  }, [receiveInput]);

  // Send offline : générer un token cashuA à copier/partager
  const handleSendOffline = useCallback(async () => {
    if (sendSelectedTokens.length === 0) {
      Alert.alert('Sélection vide', 'Sélectionne au moins un token à envoyer');
      return;
    }
    setSendLoading(true);
    try {
      const selected = tokens.filter(t => sendSelectedTokens.includes(t.id));
      const proofs: CashuProof[] = selected.flatMap(t => JSON.parse(t.proofs) as CashuProof[]);
      const mintUrl = selected[0].mintUrl;
      // Encoder les proofs en token cashuA
      const cashuToken = {
        token: [{ mint: mintUrl, proofs }],
        memo: 'BitMesh offline transfer',
      };
      const encoded = encodeCashuToken(cashuToken);
      // Marquer les tokens comme dépensés AVANT de les partager
      for (const tokenId of sendSelectedTokens) {
        await markCashuTokenSpent(tokenId);
      }
      setGeneratedSendToken(encoded);
      // Rafraîchir le solde
      const unspent = await getUnspentCashuTokens();
      setTokens(unspent);
      const balance = await getCashuBalance();
      setCashuBalance(balance);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      Alert.alert('Erreur', msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSendLoading(false);
    }
  }, [sendSelectedTokens, tokens]);

  // NFC Send : écrire le token généré sur une carte NFC
  const handleNfcSend = useCallback(async () => {
    if (!generatedSendToken) return;
    const amount = tokens
      .filter(t => sendSelectedTokens.includes(t.id))
      .reduce((s, t) => s + t.amount, 0);
    setNfcLoading(true);
    try {
      const result = await writeCashuTokenToNFC({ token: generatedSendToken, amount, memo: 'BitMesh' });
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('NFC', 'Token écrit sur la carte NFC avec succès');
      } else {
        Alert.alert('Erreur NFC', result.error ?? 'Écriture échouée');
      }
    } catch (err) {
      Alert.alert('Erreur NFC', err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setNfcLoading(false);
    }
  }, [generatedSendToken, tokens, sendSelectedTokens]);

  // NFC Receive : lire un token depuis une carte NFC et l'importer
  const handleNfcReceive = useCallback(async () => {
    setNfcLoading(true);
    try {
      const result = await readCashuTokenFromNFC();
      if (!result.success || !result.record) {
        Alert.alert('Erreur NFC', result.error ?? 'Lecture échouée');
        return;
      }
      const { token: tokenStr, amount } = result.record;
      const verification = await verifyCashuToken(tokenStr);
      if (!verification.valid && !verification.unverified) {
        Alert.alert('Token invalide', verification.error ?? 'Token refusé');
        return;
      }
      if (!verification.token) return;
      const tokenId = generateTokenId(verification.token);
      const entry = verification.token.token[0];
      await saveCashuToken({
        id: tokenId,
        mintUrl: verification.mintUrl ?? entry.mint ?? 'unknown',
        amount: verification.amount ?? amount,
        token: tokenStr,
        proofs: JSON.stringify(entry.proofs),
        state: verification.unverified ? 'unverified' : 'unspent',
        source: 'nfc',
        memo: 'Reçu par NFC',
        unverified: verification.unverified ?? false,
        retryCount: 0,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('NFC', `${verification.amount ?? amount} sats reçus via NFC`);
      const unspent = await getUnspentCashuTokens();
      setTokens(unspent);
      const balance = await getCashuBalance();
      setCashuBalance(balance);
      setShowReceiveModal(false);
    } catch (err) {
      Alert.alert('Erreur NFC', err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setNfcLoading(false);
    }
  }, []);

  // Consolidation offline : regroupe tous les proofs d'un même mint en un seul token cashuA.
  // Opération 100% locale, sans appel au mint.
  const handleSwap = useCallback(async () => {
    const unspentTokens = tokens.filter(t => t.state === 'unspent');
    if (unspentTokens.length < 2) {
      Alert.alert('Info', 'Need at least 2 tokens to consolidate');
      return;
    }

    // Grouper par mint
    const byMint: Record<string, typeof unspentTokens> = {};
    for (const t of unspentTokens) {
      if (!byMint[t.mintUrl]) byMint[t.mintUrl] = [];
      byMint[t.mintUrl].push(t);
    }

    const mintGroups = Object.entries(byMint).filter(([, ts]) => ts.length >= 2);
    if (mintGroups.length === 0) {
      Alert.alert('Info', 'All tokens are already from different mints');
      return;
    }

    const [mintUrl, group] = mintGroups[0];
    const totalAmount = group.reduce((s, t) => s + t.amount, 0);

    Alert.alert(
      'Consolidate Tokens',
      `Pack ${group.length} tokens (${totalAmount} sats) from ${mintUrl.replace('https://', '')} into one?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Consolidate',
          onPress: async () => {
            try {
              // Réunir tous les proofs dans un seul token
              const allProofs: CashuProof[] = group.flatMap(t => JSON.parse(t.proofs) as CashuProof[]);
              const consolidated = encodeCashuToken({
                token: [{ mint: mintUrl, proofs: allProofs }],
                memo: `Consolidated ${group.length} tokens`,
              });

              // Marquer les anciens comme spent
              for (const t of group) {
                await markCashuTokenSpent(t.id);
              }

              // Sauvegarder le nouveau token consolidé
              const newToken = decodeCashuToken(consolidated);
              if (newToken) {
                const tokenId = generateTokenId(newToken);
                await saveCashuToken({
                  id: tokenId,
                  mintUrl,
                  amount: totalAmount,
                  token: consolidated,
                  proofs: JSON.stringify(allProofs),
                  state: 'unspent',
                  source: 'consolidation',
                  memo: `Consolidated ${group.length} tokens`,
                  unverified: false,
                  retryCount: 0,
                });
              }

              // Rafraîchir
              const unspent = await getUnspentCashuTokens();
              setTokens(unspent);
              const balance = await getCashuBalance();
              setCashuBalance(balance);

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Done', `${group.length} tokens consolidated into 1 (${totalAmount} sats)`);
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Unknown error';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  }, [tokens]);

  return (
    <View style={styles.cashuBalanceCard}>
      <Animated.View style={[styles.cashuGlow, { opacity: glowOpacity }]} />
      <View style={styles.balanceHeader}>
        <CircleDollarSign size={16} color={Colors.cyan} />
        <Text style={styles.balanceLabel}>Cashu eCash</Text>
        <View style={styles.ecashBadge}>
          <Text style={styles.ecashBadgeText}>eCash</Text>
        </View>
        {isLoading && <ActivityIndicator color={Colors.cyan} size="small" />}
      </View>

      <View style={styles.mintInfoRow}>
        <Text style={styles.mintInfoLabel}>Mint</Text>
        <Text style={styles.mintInfoValue} numberOfLines={1}>
          {mintInfo?.name ?? 'Connecting...'}
        </Text>
        {isOnline ? (
          <Wifi size={12} color={Colors.green} />
        ) : (
          <WifiOff size={12} color={Colors.red} />
        )}
      </View>

      {/* ✅ NOUVEAU : Affichage du solde */}
      <View style={styles.cashuBalanceRow}>
        <Text style={styles.cashuBalanceAmount}>
          {cashuBalance.total.toLocaleString()} sats
        </Text>
        <Text style={styles.cashuBalanceLabel}>
          {tokens.length} token{tokens.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {mintInfo?.version && (
        <View style={styles.mintInfoRow}>
          <Text style={styles.mintInfoLabel}>Version</Text>
          <Text style={styles.mintInfoValue}>{mintInfo.version}</Text>
        </View>
      )}

      <View style={styles.balanceActions}>
        <TouchableOpacity
          style={styles.cashuActionButton}
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowMintQuote(prev => !prev);
            setMintQuote(null);
            setMintAmount('');
          }}
          testID="mint-cashu-button"
        >
          <Plus size={18} color={Colors.black} />
          <Text style={styles.cashuActionText}>Mint</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cashuActionButtonAlt}
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setGeneratedSendToken(null);
            setSendSelectedTokens([]);
            setShowSendModal(true);
          }}
          testID="send-cashu-button"
        >
          <ArrowUpRight size={18} color={Colors.cyan} />
          <Text style={styles.cashuActionTextAlt}>Send</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cashuActionButtonAlt}
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setReceiveInput('');
            setShowReceiveModal(true);
          }}
          testID="receive-cashu-button"
        >
          <ArrowDownLeft size={18} color={Colors.cyan} />
          <Text style={styles.cashuActionTextAlt}>Receive</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cashuActionButtonAlt}
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowMeltModal(true);
          }}
          testID="melt-cashu-button"
        >
          <Zap size={18} color={Colors.cyan} />
          <Text style={styles.cashuActionTextAlt}>Melt</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cashuActionButtonAlt}
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            handleSwap();
          }}
          testID="consolidate-cashu-button"
        >
          <ArrowRightLeft size={18} color={Colors.cyan} />
          <Text style={styles.cashuActionTextAlt}>Pack</Text>
        </TouchableOpacity>
      </View>

      {showMintQuote && (
        <View style={styles.mintQuoteContainer}>
          <Text style={styles.mintQuoteTitle}>Mint eCash Tokens</Text>
          <Text style={styles.mintQuoteDesc}>
            Enter amount in sats to get a Lightning invoice
          </Text>
          <TextInput
            style={styles.mintQuoteInput}
            placeholder="Amount in sats (e.g. 1000)"
            placeholderTextColor={Colors.textMuted}
            value={mintAmount}
            onChangeText={setMintAmount}
            keyboardType="number-pad"
            testID="mint-amount-input"
          />
          <TouchableOpacity
            style={styles.mintQuoteButton}
            onPress={handleRequestQuote}
            activeOpacity={0.7}
            disabled={quoteLoading}
          >
            {quoteLoading ? (
              <ActivityIndicator color={Colors.black} size="small" />
            ) : (
              <Text style={styles.mintQuoteButtonText}>Get Invoice</Text>
            )}
          </TouchableOpacity>

          {mintQuote && (
            <View style={styles.invoiceContainer}>
              <Text style={styles.invoiceLabel}>Lightning Invoice</Text>
              <Text style={styles.invoiceText} numberOfLines={3}>
                {mintQuote.request}
              </Text>
              <TouchableOpacity
                style={styles.copyInvoiceBtn}
                onPress={handleCopyInvoice}
                activeOpacity={0.7}
              >
                <Copy size={14} color={Colors.cyan} />
                <Text style={styles.copyInvoiceText}>Copy Invoice</Text>
              </TouchableOpacity>
              <Text style={styles.invoiceNote}>
                Pay this invoice to mint {mintAmount} sats as eCash tokens
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ✅ NOUVEAU : Modal MELT (redeem tokens) */}
      {showMeltModal && (
        <View style={styles.meltModalContainer}>
          <Text style={styles.meltModalTitle}>Redeem Tokens (Melt)</Text>
          <Text style={styles.meltModalDesc}>
            Enter a Lightning invoice to redeem your tokens
          </Text>
          
          <TextInput
            style={styles.meltInput}
            placeholder="Lightning invoice (lnbc...)"
            placeholderTextColor={Colors.textMuted}
            value={meltInvoice}
            onChangeText={setMeltInvoice}
            multiline
            numberOfLines={3}
          />
          
          <Text style={styles.meltTokenLabel}>
            Select tokens to redeem ({selectedTokens.length} selected):
          </Text>
          
          <ScrollView style={styles.tokenList}>
            {tokens.map((token) => (
              <TouchableOpacity
                key={token.id}
                style={[
                  styles.tokenItem,
                  selectedTokens.includes(token.id) && styles.tokenItemSelected
                ]}
                onPress={() => {
                  setSelectedTokens(prev =>
                    prev.includes(token.id)
                      ? prev.filter(id => id !== token.id)
                      : [...prev, token.id]
                  );
                }}
              >
                <View style={styles.tokenCheckbox}>
                  {selectedTokens.includes(token.id) && (
                    <View style={styles.tokenCheckboxChecked} />
                  )}
                </View>
                <View style={styles.tokenInfo}>
                  <Text style={styles.tokenAmount}>{token.amount} sats</Text>
                  <Text style={styles.tokenMint} numberOfLines={1}>
                    {token.mintUrl.replace('https://', '')}
                  </Text>
                  {token.unverified && (
                    <Text style={styles.tokenUnverified}>⚠️ Unverified</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
          
          <View style={styles.meltActions}>
            <TouchableOpacity
              style={styles.meltCancelBtn}
              onPress={() => {
                setShowMeltModal(false);
                setMeltInvoice('');
                setSelectedTokens([]);
              }}
            >
              <Text style={styles.meltCancelText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.meltConfirmBtn,
                (meltLoading || !meltInvoice.trim() || selectedTokens.length === 0) &&
                  styles.meltConfirmBtnDisabled
              ]}
              onPress={handleMelt}
              disabled={meltLoading || !meltInvoice.trim() || selectedTokens.length === 0}
            >
              {meltLoading ? (
                <ActivityIndicator color={Colors.black} size="small" />
              ) : (
                <Text style={styles.meltConfirmText}>
                  Redeem {selectedTokens.reduce((sum, id) => {
                    const t = tokens.find(tok => tok.id === id);
                    return sum + (t?.amount || 0);
                  }, 0)} sats
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Modal RECEIVE : coller un token cashuA */}
      {showReceiveModal && (
        <View style={styles.meltModalContainer}>
          <Text style={styles.meltModalTitle}>Receive eCash Token</Text>
          <Text style={styles.meltModalDesc}>
            Paste a cashuA token received from another user
          </Text>
          <TextInput
            style={[styles.meltInput, { height: 80 }]}
            placeholder="cashuAeyJ0b2tlbiI6..."
            placeholderTextColor={Colors.textMuted}
            value={receiveInput}
            onChangeText={setReceiveInput}
            multiline
            numberOfLines={4}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {nfcAvailable && (
            <TouchableOpacity
              style={[styles.meltConfirmBtn, { marginTop: 8 }, nfcLoading && styles.meltConfirmBtnDisabled]}
              onPress={handleNfcReceive}
              disabled={nfcLoading}
            >
              {nfcLoading ? (
                <ActivityIndicator color={Colors.black} size="small" />
              ) : (
                <>
                  <QrCode size={14} color={Colors.black} />
                  <Text style={[styles.meltConfirmText, { marginLeft: 6 }]}>Receive via NFC</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          <View style={styles.meltActions}>
            <TouchableOpacity
              style={styles.meltCancelBtn}
              onPress={() => { setShowReceiveModal(false); setReceiveInput(''); }}
            >
              <Text style={styles.meltCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.meltConfirmBtn,
                (receiveLoading || !receiveInput.trim()) && styles.meltConfirmBtnDisabled,
              ]}
              onPress={handleReceiveToken}
              disabled={receiveLoading || !receiveInput.trim()}
            >
              {receiveLoading ? (
                <ActivityIndicator color={Colors.black} size="small" />
              ) : (
                <Text style={styles.meltConfirmText}>Import Token</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Modal SEND : générer un token cashuA à partager */}
      {showSendModal && (
        <View style={styles.meltModalContainer}>
          {generatedSendToken ? (
            <>
              <Text style={styles.meltModalTitle}>Token Ready to Share</Text>
              <Text style={styles.meltModalDesc}>
                Scan the QR code or copy the token string
              </Text>
              <View style={styles.sendQrContainer}>
                <QRCode
                  value={generatedSendToken}
                  size={180}
                  color={Colors.white}
                  backgroundColor={Colors.surface}
                />
              </View>
              <View style={styles.invoiceContainer}>
                <Text style={styles.invoiceText} numberOfLines={3} selectable>
                  {generatedSendToken}
                </Text>
                <TouchableOpacity
                  style={styles.copyInvoiceBtn}
                  onPress={() => {
                    Clipboard.setStringAsync(generatedSendToken).catch(() => {});
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    Alert.alert('Copié', 'Token copié dans le presse-papiers');
                  }}
                >
                  <Copy size={14} color={Colors.cyan} />
                  <Text style={styles.copyInvoiceText}>Copy Token</Text>
                </TouchableOpacity>
              </View>
              {nfcAvailable && (
                <TouchableOpacity
                  style={[styles.meltConfirmBtn, { marginTop: 8 }, nfcLoading && styles.meltConfirmBtnDisabled]}
                  onPress={handleNfcSend}
                  disabled={nfcLoading}
                >
                  {nfcLoading ? (
                    <ActivityIndicator color={Colors.black} size="small" />
                  ) : (
                    <>
                      <QrCode size={14} color={Colors.black} />
                      <Text style={[styles.meltConfirmText, { marginLeft: 6 }]}>Send via NFC</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.meltCancelBtn, { marginTop: 8 }]}
                onPress={() => {
                  setShowSendModal(false);
                  setGeneratedSendToken(null);
                  setSendSelectedTokens([]);
                }}
              >
                <Text style={styles.meltCancelText}>Close</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.meltModalTitle}>Send eCash (Offline)</Text>
              <Text style={styles.meltModalDesc}>
                Select tokens to pack into a shareable token string
              </Text>
              <Text style={styles.meltTokenLabel}>
                Select tokens ({sendSelectedTokens.length} selected — {
                  tokens
                    .filter(t => sendSelectedTokens.includes(t.id))
                    .reduce((s, t) => s + t.amount, 0)
                } sats):
              </Text>
              <ScrollView style={styles.tokenList}>
                {tokens.filter(t => t.state === 'unspent').map((token) => (
                  <TouchableOpacity
                    key={token.id}
                    style={[
                      styles.tokenItem,
                      sendSelectedTokens.includes(token.id) && styles.tokenItemSelected,
                    ]}
                    onPress={() => {
                      setSendSelectedTokens(prev =>
                        prev.includes(token.id)
                          ? prev.filter(id => id !== token.id)
                          : [...prev, token.id]
                      );
                    }}
                  >
                    <View style={styles.tokenCheckbox}>
                      {sendSelectedTokens.includes(token.id) && (
                        <View style={styles.tokenCheckboxChecked} />
                      )}
                    </View>
                    <View style={styles.tokenInfo}>
                      <Text style={styles.tokenAmount}>{token.amount} sats</Text>
                      <Text style={styles.tokenMint} numberOfLines={1}>
                        {token.mintUrl.replace('https://', '')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.meltActions}>
                <TouchableOpacity
                  style={styles.meltCancelBtn}
                  onPress={() => { setShowSendModal(false); setSendSelectedTokens([]); }}
                >
                  <Text style={styles.meltCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.meltConfirmBtn,
                    (sendLoading || sendSelectedTokens.length === 0) && styles.meltConfirmBtnDisabled,
                  ]}
                  onPress={handleSendOffline}
                  disabled={sendLoading || sendSelectedTokens.length === 0}
                >
                  {sendLoading ? (
                    <ActivityIndicator color={Colors.black} size="small" />
                  ) : (
                    <Text style={styles.meltConfirmText}>
                      Generate Token ({
                        tokens.filter(t => sendSelectedTokens.includes(t.id)).reduce((s, t) => s + t.amount, 0)
                      } sats)
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

function CashuKeysetsList({
  keysets,
  isLoading,
}: {
  keysets: CashuKeysetInfo[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <View style={styles.keysetsLoading}>
        <ActivityIndicator color={Colors.cyan} size="small" />
        <Text style={styles.keysetsLoadingText}>Loading keysets...</Text>
      </View>
    );
  }

  if (keysets.length === 0) return null;

  return (
    <View style={styles.txSection}>
      <Text style={styles.txSectionTitle}>Keysets</Text>
      {keysets.map((ks) => (
        <View key={ks.id} style={styles.keysetItem}>
          <View style={styles.keysetIcon}>
            <Shield size={14} color={Colors.cyan} />
          </View>
          <View style={styles.keysetContent}>
            <Text style={styles.keysetId} numberOfLines={1}>{ks.id}</Text>
            <Text style={styles.keysetUnit}>{ks.unit}</Text>
          </View>
          <View style={[
            styles.keysetStatusBadge,
            ks.active ? styles.keysetActive : styles.keysetInactive,
          ]}>
            <Text style={[
              styles.keysetStatusText,
              ks.active ? styles.keysetActiveText : styles.keysetInactiveText,
            ]}>
              {ks.active ? 'ACTIVE' : 'INACTIVE'}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function TransactionItem({ tx, btcPrice, currency }: { tx: FormattedTransaction; btcPrice: number; currency: string }) {
  const isSent = tx.type === 'outgoing';
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 3, useNativeDriver: true }).start();
  }, [scaleAnim]);

  const fiatValue = satsToFiat(Math.abs(tx.amount), btcPrice);
  const txDate = tx.blockTime ? new Date(tx.blockTime * 1000) : null;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={styles.txItem}
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => {
          Clipboard.setStringAsync(tx.txid).catch(() => {});
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          Alert.alert('TX ID Copied', tx.txid);
        }}
      >
        <View style={[
          styles.txIcon,
          isSent ? styles.txIconSent : styles.txIconReceived,
        ]}>
          {isSent ? (
            <ArrowUpRight size={18} color={Colors.red} />
          ) : (
            <ArrowDownLeft size={18} color={Colors.green} />
          )}
        </View>
        <View style={styles.txContent}>
          <Text style={styles.txContact}>
            {isSent ? 'Sent' : 'Received'}
          </Text>
          <Text style={styles.txMemo}>
            {tx.confirmed ? (txDate ? txDate.toLocaleDateString() : 'Confirmed') : 'Unconfirmed'}
            {tx.fee && tx.fee > 0 ? ` · ${tx.fee} sat fee` : ''}
          </Text>
        </View>
        <View style={styles.txAmountCol}>
          <Text style={[
            styles.txAmount,
            isSent ? styles.txAmountSent : styles.txAmountReceived,
          ]}>
            {isSent ? '-' : '+'}{formatSats(Math.abs(tx.amount))}
          </Text>
          <Text style={styles.txFiat}>{currency === 'USD' ? '$' : '€'}{fiatValue.toFixed(2)}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function WalletScreen() {
  const [activeTab, setActiveTab] = useState<WalletTab>('bitcoin');
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [showReceiveModal, setShowReceiveModal] = useState<boolean>(false);
  const [showNFCModal, setShowNFCModal] = useState<boolean>(false);

  const { walletInfo, isInitialized, receiveAddresses } = useWalletSeed();
  const { balance: bitcoinBalance, isLoading: bitcoinLoading, refreshBalance: refreshBitcoinBalance } = useBitcoin();
  const { getMempoolUrl, getCashuMintUrl, settings } = useAppSettings();

  const mempoolUrl = getMempoolUrl();
  const cashuMintUrl = getCashuMintUrl();
  const allAddresses = useMemo(() => {
    const addrs = [...receiveAddresses];
    if (walletInfo?.firstReceiveAddress && !addrs.includes(walletInfo.firstReceiveAddress)) {
      addrs.unshift(walletInfo.firstReceiveAddress);
    }
    return addrs;
  }, [receiveAddresses, walletInfo]);

  const balanceQuery = useQuery({
    queryKey: ['btc-balance', mempoolUrl, walletInfo?.firstReceiveAddress],
    queryFn: async () => {
      if (!walletInfo?.firstReceiveAddress) return null;
      console.log('[Wallet] Fetching BTC balance from', mempoolUrl);
      return fetchAddressBalance(mempoolUrl, walletInfo.firstReceiveAddress);
    },
    enabled: isInitialized && !!walletInfo?.firstReceiveAddress,
    refetchInterval: 60000,
    retry: 2,
  });

  const txQuery = useQuery({
    queryKey: ['btc-transactions', mempoolUrl, walletInfo?.firstReceiveAddress],
    queryFn: async () => {
      if (!walletInfo?.firstReceiveAddress) return [];
      console.log('[Wallet] Fetching BTC transactions from', mempoolUrl);
      const raw = await fetchAddressTransactions(walletInfo.firstReceiveAddress, 50, mempoolUrl);
      return formatTransactions(raw, allAddresses);
    },
    enabled: isInitialized && !!walletInfo?.firstReceiveAddress,
    refetchInterval: 60000,
    retry: 2,
  });

  const feeQuery = useQuery({
    queryKey: ['btc-fees', mempoolUrl],
    queryFn: () => fetchFeeEstimates(mempoolUrl),
    refetchInterval: 120000,
    retry: 2,
  });

  const priceQuery = useQuery({
    queryKey: ['btc-price', mempoolUrl, settings.fiatCurrency],
    queryFn: () => fetchBtcPrice(mempoolUrl, settings.fiatCurrency),
    refetchInterval: 300000,
    retry: 2,
  });

  const mintInfoQuery = useQuery({
    queryKey: ['cashu-mint-info', cashuMintUrl],
    queryFn: () => fetchMintInfo(cashuMintUrl),
    retry: 2,
    staleTime: 300000,
  });

  const mintKeysetsQuery = useQuery({
    queryKey: ['cashu-mint-keysets', cashuMintUrl],
    queryFn: async () => {
      const result = await fetchMintKeysets(cashuMintUrl);
      return result.keysets ?? [];
    },
    retry: 2,
    staleTime: 300000,
  });

  const mintConnectionQuery = useQuery({
    queryKey: ['cashu-mint-connection', cashuMintUrl],
    queryFn: () => testMintConnection(cashuMintUrl),
    retry: 1,
    staleTime: 60000,
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (activeTab === 'bitcoin') {
        await Promise.all([
          refreshBitcoinBalance(),
          balanceQuery.refetch(),
          txQuery.refetch(),
          feeQuery.refetch(),
          priceQuery.refetch(),
        ]);
      } else {
        await Promise.all([
          mintInfoQuery.refetch(),
          mintKeysetsQuery.refetch(),
          mintConnectionQuery.refetch(),
        ]);
      }
    } finally {
      setRefreshing(false);
    }
  }, [activeTab, refreshBitcoinBalance, balanceQuery, txQuery, feeQuery, priceQuery, mintInfoQuery, mintKeysetsQuery, mintConnectionQuery]);

  const transactions = txQuery.data ?? [];
  const btcPrice = priceQuery.data ?? 0;

  return (
    <>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={activeTab === 'bitcoin' ? Colors.accent : Colors.cyan}
          colors={[Colors.accent]}
        />
      }
    >
      <WalletTabSelector activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'bitcoin' ? (
        <>
          <BitcoinBalanceCard
            balance={balanceQuery.data ?? null}
            bitcoinBalance={bitcoinBalance}
            btcPrice={btcPrice}
            fees={feeQuery.data ?? null}
            isLoading={bitcoinLoading || balanceQuery.isLoading || balanceQuery.isFetching}
            currency={settings.fiatCurrency}
            onReceivePress={() => setShowReceiveModal(true)}
          />

          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickAction}
              activeOpacity={0.7}
              onPress={() => setShowNFCModal(true)}
            >
              <Wifi size={18} color={Colors.textSecondary} />
              <Text style={styles.quickActionText}>NFC</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickAction}
              activeOpacity={0.7}
              onPress={() => {
                if (walletInfo?.firstReceiveAddress) {
                  Clipboard.setStringAsync(walletInfo.firstReceiveAddress).catch(() => {});
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  Alert.alert('Copied', 'Full address copied');
                }
              }}
            >
              <QrCode size={18} color={Colors.textSecondary} />
              <Text style={styles.quickActionText}>QR Code</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickAction}
              activeOpacity={0.7}
              onPress={() => {
                if (walletInfo?.firstReceiveAddress) {
                  Clipboard.setStringAsync(walletInfo.firstReceiveAddress).catch(() => {});
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  Alert.alert('Copied', walletInfo.firstReceiveAddress);
                }
              }}
            >
              <Copy size={18} color={Colors.textSecondary} />
              <Text style={styles.quickActionText}>Address</Text>
            </TouchableOpacity>
          </View>

          {btcPrice > 0 && (
            <View style={styles.priceBar}>
              <Text style={styles.priceBarLabel}>BTC Price</Text>
              <Text style={styles.priceBarValue}>
                {settings.fiatCurrency === 'USD' ? '$' : '€'}
                {btcPrice.toLocaleString()}
              </Text>
            </View>
          )}

          <View style={styles.txSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.txSectionTitle}>Transactions</Text>
              {txQuery.isFetching && <ActivityIndicator color={Colors.accent} size="small" />}
            </View>
            {!isInitialized ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>Generate a wallet seed in Settings to view transactions</Text>
              </View>
            ) : transactions.length === 0 && !txQuery.isLoading ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No transactions yet</Text>
              </View>
            ) : txQuery.isLoading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={Colors.accent} size="small" />
                <Text style={styles.emptyStateText}>Loading transactions...</Text>
              </View>
            ) : (
              transactions.slice(0, 20).map((tx) => (
                <TransactionItem key={tx.txid} tx={tx} btcPrice={btcPrice} currency={settings.fiatCurrency} />
              ))
            )}
          </View>

          {txQuery.isError && (
            <View style={styles.errorBar}>
              <AlertTriangle size={14} color={Colors.red} />
              <Text style={styles.errorBarText}>Failed to load transactions. Pull to retry.</Text>
            </View>
          )}
        </>
      ) : (
        <>
          <CashuBalanceCard
            mintInfo={mintInfoQuery.data ?? null}
            isLoading={mintInfoQuery.isLoading}
            isOnline={mintConnectionQuery.data?.ok ?? false}
            mintUrl={cashuMintUrl}
          />

          <View style={styles.cashuQuickActions}>
            <TouchableOpacity
              style={styles.cashuQuickAction}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Alert.alert('Backup', 'Token backup will export all unspent proofs');
              }}
            >
              <Shield size={16} color={Colors.cyan} />
              <Text style={styles.cashuQuickActionText}>Backup</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cashuQuickAction}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                mintConnectionQuery.refetch();
              }}
            >
              <RefreshCw size={16} color={Colors.cyan} />
              <Text style={styles.cashuQuickActionText}>Check Mint</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.txSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.txSectionTitle}>Active Mint</Text>
            </View>
            <View style={styles.activeMintCard}>
              <View style={styles.mintIconContainer}>
                <Landmark size={18} color={Colors.cyan} />
              </View>
              <View style={styles.activeMintContent}>
                <Text style={styles.activeMintName}>{mintInfoQuery.data?.name ?? 'Loading...'}</Text>
                <Text style={styles.activeMintUrl} numberOfLines={1}>{cashuMintUrl}</Text>
              </View>
              <View style={[
                styles.mintStatusDot,
                mintConnectionQuery.data?.ok ? styles.mintStatusOnline : styles.mintStatusOffline,
              ]} />
            </View>
          </View>

          <CashuKeysetsList
            keysets={mintKeysetsQuery.data ?? []}
            isLoading={mintKeysetsQuery.isLoading}
          />

          <View style={styles.meshChunkInfo}>
            <View style={styles.meshChunkHeader}>
              <Text style={styles.meshChunkTitle}>LoRa Chunking</Text>
              <View style={styles.meshChunkBadge}>
                <Text style={styles.meshChunkBadgeText}>ACTIVE</Text>
              </View>
            </View>
            <Text style={styles.meshChunkDesc}>
              Cashu tokens larger than 200 bytes are automatically split into chunks with MCHK prefix for LoRa mesh transmission. Gateways reassemble using message ID.
            </Text>
            <View style={styles.meshChunkStats}>
              <View style={styles.meshChunkStat}>
                <Text style={styles.meshChunkStatValue}>200B</Text>
                <Text style={styles.meshChunkStatLabel}>Max Payload</Text>
              </View>
              <View style={styles.meshChunkStat}>
                <Text style={styles.meshChunkStatValue}>MCHK</Text>
                <Text style={styles.meshChunkStatLabel}>Prefix</Text>
              </View>
              <View style={styles.meshChunkStat}>
                <Text style={styles.meshChunkStatValue}>4-ID</Text>
                <Text style={styles.meshChunkStatLabel}>Msg ID</Text>
              </View>
            </View>
          </View>
        </>
      )}

      <View style={styles.apiInfoBar}>
        <Text style={styles.apiInfoText}>
          {activeTab === 'bitcoin'
            ? `Mempool: ${mempoolUrl}`
            : `Mint: ${cashuMintUrl}`
          }
        </Text>
      </View>
    </ScrollView>

    {/* Modal Receive Bitcoin */}
    <ReceiveBitcoinModal
      visible={showReceiveModal}
      onClose={() => setShowReceiveModal(false)}
      address={walletInfo?.firstReceiveAddress || ''}
      addresses={receiveAddresses}
    />
    
    {/* Modal NFC */}
    <NFCModal
      visible={showNFCModal}
      onClose={() => setShowNFCModal(false)}
      txHex=""
      txid=""
      onTxRead={(tx) => {
        console.log('[NFC] Transaction lue:', tx.txid);
        Alert.alert('NFC', `Transaction ${tx.txid.slice(0, 16)}... lue depuis la carte`);
      }}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  tabSelector: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 3,
    position: 'relative',
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  tabIndicator: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: '50%',
    height: '100%',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 11,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    zIndex: 1,
  },
  tabText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  tabTextActive: {
    color: Colors.accent,
  },
  tabTextCashu: {
    color: Colors.cyan,
  },
  balanceCard: {
    margin: 16,
    padding: 24,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  balanceGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.accent,
  },
  cashuBalanceCard: {
    margin: 16,
    padding: 24,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.2)',
    overflow: 'hidden',
  },
  cashuGlow: {
    position: 'absolute',
    top: -40,
    left: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.cyan,
  },
  // ✅ NOUVEAU : Styles pour le solde Cashu
  cashuBalanceRow: {
    alignItems: 'center',
    marginVertical: 16,
  },
  cashuBalanceAmount: {
    color: Colors.cyan,
    fontSize: 32,
    fontWeight: '700' as const,
  },
  cashuBalanceLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  // ✅ NOUVEAU : Styles pour le modal MELT
  meltModalContainer: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
  },
  meltModalTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  meltModalDesc: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginBottom: 16,
  },
  meltInput: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    color: Colors.text,
    fontSize: 14,
    borderWidth: 0.5,
    borderColor: Colors.border,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  meltTokenLabel: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  tokenList: {
    maxHeight: 200,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 8,
  },
  tokenItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 4,
    backgroundColor: Colors.surfaceHighlight,
  },
  tokenItemSelected: {
    backgroundColor: Colors.cyan + '20',
    borderWidth: 1,
    borderColor: Colors.cyan,
  },
  tokenCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenCheckboxChecked: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.cyan,
  },
  tokenInfo: {
    flex: 1,
  },
  tokenAmount: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  tokenMint: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  tokenUnverified: {
    color: Colors.yellow,
    fontSize: 10,
    marginTop: 2,
  },
  meltActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 12,
  },
  meltCancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: Colors.surfaceHighlight,
    alignItems: 'center',
  },
  meltCancelText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  meltConfirmBtn: {
    flex: 2,
    padding: 14,
    borderRadius: 10,
    backgroundColor: Colors.cyan,
    alignItems: 'center',
  },
  meltConfirmBtnDisabled: {
    backgroundColor: Colors.surfaceHighlight,
  },
  meltConfirmText: {
    color: Colors.black,
    fontSize: 14,
    fontWeight: '700',
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  balanceLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
    flex: 1,
  },
  ecashBadge: {
    backgroundColor: Colors.cyanDim,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 4,
  },
  ecashBadgeText: {
    color: Colors.cyan,
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  balanceSats: {
    color: Colors.text,
    fontSize: 36,
    fontWeight: '800' as const,
    letterSpacing: -1,
  },
  balanceSatsUnit: {
    fontSize: 18,
    fontWeight: '500' as const,
    color: Colors.textSecondary,
  },
  balanceBtc: {
    color: Colors.textMuted,
    fontSize: 14,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  unconfirmedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: Colors.yellowDim,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  unconfirmedText: {
    color: Colors.yellow,
    fontSize: 11,
    fontWeight: '600' as const,
  },
  noWalletContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  noWalletText: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  balanceActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.accent,
  },
  actionButtonSecondary: {
    backgroundColor: Colors.accentGlow,
    borderWidth: 1,
    borderColor: Colors.accentDim,
  },
  actionButtonDisabled: {
    backgroundColor: Colors.surfaceLight,
  },
  actionButtonDisabledAlt: {
    backgroundColor: Colors.surfaceLight,
    borderColor: Colors.border,
  },
  actionButtonText: {
    color: Colors.black,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  actionButtonTextSecondary: {
    color: Colors.accent,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  actionButtonTextDisabled: {
    color: Colors.textMuted,
  },
  cashuActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.cyan,
  },
  cashuActionText: {
    color: Colors.black,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  cashuActionButtonAlt: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.cyanDim,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.2)',
  },
  cashuActionTextAlt: {
    color: Colors.cyan,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 12,
  },
  quickAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  quickActionText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  priceBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  priceBarLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  priceBarValue: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: '700' as const,
    fontFamily: 'monospace',
  },
  cashuQuickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 20,
  },
  cashuQuickAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: 'rgba(34, 211, 238, 0.12)',
  },
  cashuQuickActionText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600' as const,
  },
  txSection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  txSectionTitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700' as const,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  txItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txIconSent: {
    backgroundColor: Colors.redDim,
  },
  txIconReceived: {
    backgroundColor: Colors.greenDim,
  },
  txContent: {
    flex: 1,
  },
  txContact: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  txMemo: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  txAmountCol: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700' as const,
    fontFamily: 'monospace',
  },
  txAmountSent: {
    color: Colors.red,
  },
  txAmountReceived: {
    color: Colors.green,
  },
  txFiat: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyStateText: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    padding: 12,
    backgroundColor: Colors.redDim,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorBarText: {
    color: Colors.red,
    fontSize: 12,
    fontWeight: '600' as const,
    flex: 1,
  },
  mintInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(34, 211, 238, 0.1)',
  },
  mintInfoLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600' as const,
    minWidth: 50,
  },
  mintInfoValue: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: 'monospace',
    flex: 1,
  },
  mintQuoteContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(34, 211, 238, 0.2)',
  },
  mintQuoteTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  mintQuoteDesc: {
    color: Colors.textMuted,
    fontSize: 12,
    marginBottom: 12,
  },
  mintQuoteInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 12,
    color: Colors.text,
    fontSize: 14,
    fontFamily: 'monospace',
    borderWidth: 0.5,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  mintQuoteButton: {
    backgroundColor: Colors.cyan,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mintQuoteButtonText: {
    color: Colors.black,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  sendQrContainer: {
    alignItems: 'center' as const,
    marginVertical: 16,
    padding: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    alignSelf: 'center' as const,
  },
  invoiceContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: 'rgba(34, 211, 238, 0.2)',
  },
  invoiceLabel: {
    color: Colors.cyan,
    fontSize: 11,
    fontWeight: '700' as const,
    marginBottom: 6,
  },
  invoiceText: {
    color: Colors.text,
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  copyInvoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    backgroundColor: Colors.cyanDim,
    borderRadius: 8,
  },
  copyInvoiceText: {
    color: Colors.cyan,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  invoiceNote: {
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
  activeMintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(34, 211, 238, 0.15)',
  },
  mintIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.cyanDim,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activeMintContent: {
    flex: 1,
  },
  activeMintName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  activeMintUrl: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  mintStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  mintStatusOnline: {
    backgroundColor: Colors.green,
  },
  mintStatusOffline: {
    backgroundColor: Colors.red,
  },
  keysetsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginHorizontal: 16,
  },
  keysetsLoadingText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  keysetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  keysetIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.cyanDim,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  keysetContent: {
    flex: 1,
  },
  keysetId: {
    color: Colors.text,
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '600' as const,
  },
  keysetUnit: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  keysetStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  keysetActive: {
    backgroundColor: Colors.greenDim,
  },
  keysetInactive: {
    backgroundColor: Colors.surfaceLight,
  },
  keysetStatusText: {
    fontSize: 9,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  keysetActiveText: {
    color: Colors.green,
  },
  keysetInactiveText: {
    color: Colors.textMuted,
  },
  meshChunkInfo: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 16,
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(34, 211, 238, 0.12)',
  },
  meshChunkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  meshChunkTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  meshChunkBadge: {
    backgroundColor: Colors.greenDim,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  meshChunkBadgeText: {
    color: Colors.green,
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  meshChunkDesc: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  meshChunkStats: {
    flexDirection: 'row',
    gap: 0,
  },
  meshChunkStat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    marginHorizontal: 3,
  },
  meshChunkStatValue: {
    color: Colors.cyan,
    fontSize: 16,
    fontWeight: '800' as const,
    fontFamily: 'monospace',
  },
  meshChunkStatLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '600' as const,
    marginTop: 2,
  },
  seedActiveBadge: {
    backgroundColor: Colors.greenDim,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  seedActiveBadgeText: {
    color: Colors.green,
    fontSize: 9,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  derivedAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  derivedAddressLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  addressCopyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  derivedAddressValue: {
    color: Colors.accent,
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '600' as const,
  },
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  feeLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  feeValue: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  apiInfoBar: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  apiInfoText: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
});
