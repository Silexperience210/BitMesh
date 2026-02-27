import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { ArrowUpRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useBitcoin } from '@/providers/BitcoinProvider';
import { satsToFiat, type MempoolFeeEstimate } from '@/utils/mempool';
import { validateAddress } from '@/utils/bitcoin-tx';

interface SendBitcoinModalProps {
  visible: boolean;
  onClose: () => void;
  balance: number;
  fees: MempoolFeeEstimate | null;
  currency: string;
  btcPrice: number;
}

export default function SendBitcoinModal({
  visible,
  onClose,
  balance,
  fees,
  currency,
  btcPrice,
}: SendBitcoinModalProps) {
  const { sendBitcoin, estimateSendFee } = useBitcoin();
  const [address, setAddress] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [feeSpeed, setFeeSpeed] = useState<'economy' | 'normal' | 'fast' | 'custom'>('normal');
  const [customFeeRate, setCustomFeeRate] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);

  const feeRate = useMemo(() => {
    if (feeSpeed === 'custom') {
      const parsed = parseInt(customFeeRate, 10);
      return isNaN(parsed) || parsed < 1 ? 1 : parsed;
    }
    if (!fees) return 2;
    switch (feeSpeed) {
      case 'economy': return fees.economyFee;
      case 'fast': return fees.fastestFee;
      default: return fees.halfHourFee;
    }
  }, [fees, feeSpeed, customFeeRate]);

  const amountSats = useMemo(() => {
    const parsed = parseInt(amount, 10);
    return isNaN(parsed) || parsed <= 0 ? 0 : parsed;
  }, [amount]);

  const estimatedFee = useMemo(() => {
    if (amountSats <= 0) return 0;
    return estimateSendFee(amountSats, feeRate);
  }, [amountSats, feeRate, estimateSendFee]);

  const fiatValue = useMemo(() => satsToFiat(amountSats, btcPrice), [amountSats, btcPrice]);

  const canSend = address.trim().length > 0 && amountSats > 0 && amountSats + estimatedFee <= balance;

  const currencySymbol = currency === 'USD' ? '$' : '\u20ac';

  const handleClose = useCallback(() => {
    setAddress('');
    setAmount('');
    setFeeSpeed('normal');
    setCustomFeeRate('');
    onClose();
  }, [onClose]);

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    const trimmedAddr = address.trim();
    if (!validateAddress(trimmedAddr)) {
      Alert.alert('Invalid Address', 'Please enter a valid Bitcoin address');
      return;
    }
    if (amountSats + estimatedFee > balance) {
      Alert.alert(
        'Insufficient Balance',
        'You need ' + (amountSats + estimatedFee).toLocaleString() + ' sats but have ' + balance.toLocaleString() + ' sats'
      );
      return;
    }

    Alert.alert(
      'Confirm Send',
      'Send ' + amountSats.toLocaleString() + ' sats to ' + trimmedAddr.slice(0, 12) + '...?\nFee: ~' + estimatedFee + ' sats (' + feeRate + ' sat/vB)',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'destructive',
          onPress: async () => {
            setSending(true);
            try {
              const result = await sendBitcoin(trimmedAddr, amountSats, feeRate);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Sent!', 'Transaction broadcast.\nTXID: ' + result.txid.slice(0, 16) + '...');
              handleClose();
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Unknown error';
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Send Failed', msg);
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  }, [canSend, address, amountSats, estimatedFee, balance, feeRate, sendBitcoin, handleClose]);

  const feeChips: { speed: 'economy' | 'normal' | 'fast' | 'custom'; label: string; rate: number | undefined }[] = [
    { speed: 'economy', label: 'Economy', rate: fees?.economyFee },
    { speed: 'normal', label: 'Normal', rate: fees?.halfHourFee },
    { speed: 'fast', label: 'Fast', rate: fees?.fastestFee },
    { speed: 'custom', label: 'Custom', rate: undefined },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Send Bitcoin</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
              <View style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>{'\u00d7'}</Text>
              </View>
            </TouchableOpacity>
          </View>

          <Text style={styles.inputLabel}>Recipient Address</Text>
          <TextInput
            style={styles.input}
            placeholder="bc1q..."
            placeholderTextColor={Colors.textMuted}
            value={address}
            onChangeText={setAddress}
            autoCapitalize="none"
            autoCorrect={false}
            testID="send-btc-address-input"
          />

          <Text style={styles.inputLabel}>Amount (sats)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 10000"
            placeholderTextColor={Colors.textMuted}
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
            testID="send-btc-amount-input"
          />
          {amountSats > 0 && btcPrice > 0 && (
            <Text style={styles.fiatHint}>
              {'\u2248 ' + currencySymbol + fiatValue.toFixed(2) + ' \u00b7 Fee: ~' + estimatedFee + ' sats (' + feeRate + ' sat/vB)'}
            </Text>
          )}

          <Text style={styles.inputLabel}>Fee Speed</Text>
          <View style={styles.feeSpeedGrid}>
            {feeChips.map(({ speed, label, rate }) => {
              const isActive = feeSpeed === speed;
              const rateLabel =
                speed === 'custom'
                  ? customFeeRate ? customFeeRate + ' sat/vB' : 'Manuel'
                  : rate != null ? rate + ' sat/vB' : '? sat/vB';
              return (
                <TouchableOpacity
                  key={speed}
                  style={[styles.feeSpeedChip, isActive && styles.feeSpeedChipActive]}
                  onPress={() => { setFeeSpeed(speed); Haptics.selectionAsync(); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.feeSpeedLabel, isActive && styles.feeSpeedLabelActive]}>{label}</Text>
                  <Text style={[styles.feeSpeedRate, isActive && speed !== 'custom' && styles.feeSpeedRateActive]}>
                    {rateLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {feeSpeed === 'custom' && (
            <View style={styles.customFeeRow}>
              <TextInput
                style={styles.customFeeInput}
                placeholder="15"
                placeholderTextColor={Colors.textMuted}
                value={customFeeRate}
                onChangeText={setCustomFeeRate}
                keyboardType="number-pad"
                autoFocus
              />
              <Text style={styles.customFeeUnit}>sat/vB</Text>
            </View>
          )}

          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Available</Text>
            <Text style={styles.balanceValue}>{balance.toLocaleString()} sats</Text>
          </View>

          <TouchableOpacity
            style={[styles.confirmBtn, (!canSend || sending) && styles.confirmBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend || sending}
            activeOpacity={0.7}
            testID="send-btc-confirm"
          >
            {sending ? (
              <ActivityIndicator color={Colors.black} size="small" />
            ) : (
              <>
                <ArrowUpRight size={18} color={canSend ? Colors.black : Colors.textMuted} />
                <Text style={[styles.confirmText, !canSend && { color: Colors.textMuted }]}>
                  {amountSats > 0 ? 'Send ' + amountSats.toLocaleString() + ' sats' : 'Send'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceHighlight,
    alignSelf: 'center' as const,
    marginTop: 10,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 20,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700' as const,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  closeBtnText: {
    color: Colors.textSecondary,
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 22,
  },
  inputLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600' as const,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 15,
    borderWidth: 0.5,
    borderColor: Colors.border,
    fontFamily: 'monospace',
  },
  fiatHint: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  feeSpeedGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 4,
  },
  feeSpeedChip: {
    width: '47%' as any,
    alignItems: 'center' as const,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  feeSpeedChipActive: {
    backgroundColor: Colors.accentGlow,
    borderColor: Colors.accentDim,
  },
  feeSpeedLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  feeSpeedLabelActive: {
    color: Colors.accent,
  },
  feeSpeedRate: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  feeSpeedRateActive: {
    color: Colors.accentDim,
  },
  customFeeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: 8,
    gap: 10,
  },
  customFeeInput: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.accent,
    fontFamily: 'monospace',
  },
  customFeeUnit: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  balanceRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  balanceLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  balanceValue: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
    fontFamily: 'monospace',
  },
  confirmBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: Colors.accent,
  },
  confirmBtnDisabled: {
    backgroundColor: Colors.surfaceLight,
  },
  confirmText: {
    color: Colors.black,
    fontSize: 16,
    fontWeight: '700' as const,
  },
});
