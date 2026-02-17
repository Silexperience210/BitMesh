import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Send, Bitcoin, Radio, CircleDollarSign, Layers, Check, AlertTriangle, Globe, Wifi } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { mockChats, Message } from '@/mocks/data';
import { formatMessageTime, getSignalColor } from '@/utils/helpers';
import { useAppSettings } from '@/providers/AppSettingsProvider';

function PaymentBubble({ amount }: { amount: number }) {
  return (
    <View style={styles.paymentBubble}>
      <Bitcoin size={16} color={Colors.accent} />
      <Text style={styles.paymentAmount}>{amount.toLocaleString()} sats</Text>
    </View>
  );
}

function CashuTokenBubble({ message }: { message: Message }) {
  const isMe = message.sender === 'me';
  const isComplete = message.chunkInfo?.isComplete ?? true;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isComplete) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [isComplete, pulseAnim]);

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  });

  return (
    <View style={styles.cashuBubble}>
      <View style={styles.cashuHeader}>
        <CircleDollarSign size={14} color={Colors.cyan} />
        <Text style={styles.cashuLabel}>Cashu Token</Text>
        {isComplete ? (
          <View style={styles.cashuCompleteBadge}>
            <Check size={10} color={Colors.green} />
          </View>
        ) : (
          <Animated.View style={[styles.cashuPendingBadge, { opacity: pulseOpacity }]}>
            <AlertTriangle size={10} color={Colors.yellow} />
          </Animated.View>
        )}
      </View>
      <Text style={styles.cashuAmount}>
        {(message.cashuAmount ?? 0).toLocaleString()} sats
      </Text>
      {message.chunkInfo && (
        <View style={styles.chunkInfoRow}>
          <Layers size={10} color={Colors.textMuted} />
          <Text style={styles.chunkInfoText}>
            {message.chunkInfo.receivedChunks}/{message.chunkInfo.totalChunks} chunks · #{message.chunkInfo.messageId}
          </Text>
          {isComplete && (
            <Text style={styles.chunkReassembled}>Reassembled</Text>
          )}
        </View>
      )}
      {!isComplete && message.chunkInfo && (
        <View style={styles.chunkProgressContainer}>
          <View style={styles.chunkProgressTrack}>
            <View
              style={[
                styles.chunkProgressFill,
                {
                  width: `${(message.chunkInfo.receivedChunks / message.chunkInfo.totalChunks) * 100}%`,
                },
              ]}
            />
          </View>
          <Text style={styles.chunkWaiting}>
            Waiting for chunk {message.chunkInfo.receivedChunks + 1}...
          </Text>
        </View>
      )}
    </View>
  );
}

function ChunkedInvoiceBubble({ message }: { message: Message }) {
  const isComplete = message.chunkInfo?.isComplete ?? false;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isComplete && message.chunkInfo) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(progressAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(progressAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [isComplete, progressAnim, message.chunkInfo]);

  const blinkOpacity = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });

  if (!message.chunkInfo) return null;

  const typeLabel = message.chunkInfo.dataType === 'LN_INV'
    ? 'Lightning Invoice'
    : message.chunkInfo.dataType === 'CASHU'
    ? 'Cashu Token'
    : 'BTC Transaction';

  const typeColor = message.chunkInfo.dataType === 'LN_INV'
    ? Colors.accent
    : message.chunkInfo.dataType === 'CASHU'
    ? Colors.cyan
    : Colors.yellow;

  return (
    <View style={[styles.chunkedBubble, { borderColor: `${typeColor}33` }]}>
      <View style={styles.chunkedHeader}>
        <Layers size={13} color={typeColor} />
        <Text style={[styles.chunkedType, { color: typeColor }]}>{typeLabel}</Text>
        <View style={[styles.chunkedDataTypeBadge, { backgroundColor: `${typeColor}20` }]}>
          <Text style={[styles.chunkedDataTypeText, { color: typeColor }]}>
            {message.chunkInfo.dataType}
          </Text>
        </View>
      </View>

      <View style={styles.chunkedChunkRow}>
        {Array.from({ length: message.chunkInfo.totalChunks }).map((_, i) => {
          const received = i < message.chunkInfo!.receivedChunks;
          return (
            <Animated.View
              key={i}
              style={[
                styles.chunkBlock,
                received && { backgroundColor: typeColor },
                !received && !isComplete && { opacity: blinkOpacity },
              ]}
            />
          );
        })}
      </View>

      <View style={styles.chunkedMeta}>
        <Text style={styles.chunkedMetaText}>
          #{message.chunkInfo.messageId} · {message.chunkInfo.receivedChunks}/{message.chunkInfo.totalChunks}
        </Text>
        {isComplete ? (
          <View style={styles.chunkedCompleteRow}>
            <Check size={10} color={Colors.green} />
            <Text style={styles.chunkedCompleteText}>Complete</Text>
          </View>
        ) : (
          <Animated.View style={[styles.chunkedPendingRow, { opacity: blinkOpacity }]}>
            <Text style={styles.chunkedPendingText}>Receiving...</Text>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isMe = message.sender === 'me';

  const isCashuComplete = message.isCashuToken && message.chunkInfo?.isComplete;
  const isChunkedInProgress = message.isChunked && !message.isCashuToken && !message.chunkInfo?.isComplete;
  const isCashuChunkedComplete = message.isCashuToken && message.isChunked;

  return (
    <View
      style={[
        styles.messageBubbleContainer,
        isMe ? styles.messageBubbleRight : styles.messageBubbleLeft,
      ]}
    >
      <View
        style={[
          styles.messageBubble,
          isMe ? styles.myBubble : styles.theirBubble,
          (message.isBtcPayment || message.isCashuToken) && styles.paymentBubbleWrapper,
          message.isCashuToken && styles.cashuBubbleWrapper,
          message.isChunked && !message.isCashuToken && styles.chunkedBubbleWrapper,
        ]}
      >
        {message.isCashuToken ? (
          <CashuTokenBubble message={message} />
        ) : message.isChunked && message.chunkInfo ? (
          <ChunkedInvoiceBubble message={message} />
        ) : message.isBtcPayment && message.btcAmount ? (
          <PaymentBubble amount={message.btcAmount} />
        ) : (
          <Text style={[styles.messageText, isMe && styles.myMessageText]}>
            {message.text}
          </Text>
        )}
        <View style={styles.messageFooter}>
          <Text
            style={[
              styles.messageTime,
              isMe && styles.myMessageTime,
            ]}
          >
            {formatMessageTime(message.timestamp)}
          </Text>
          {isMe && (
            <Text
              style={[
                styles.messageStatus,
                message.status === 'delivered' && styles.statusDelivered,
                message.status === 'failed' && styles.statusFailed,
              ]}
            >
              {message.status === 'delivered'
                ? '✓✓'
                : message.status === 'sent'
                ? '✓'
                : message.status === 'pending'
                ? '◎'
                : '✗'}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const chat = mockChats.find((c) => c.id === chatId);
  const [inputText, setInputText] = useState<string>('');
  const flatListRef = useRef<FlatList>(null);
  const { settings, isInternetMode, isLoRaMode } = useAppSettings();

  const handleSend = useCallback(() => {
    if (!inputText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInputText('');
  }, [inputText]);

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => <MessageBubble message={item} />,
    []
  );

  if (!chat) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Chat not found</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={styles.headerTitle}>
              <Text style={styles.headerName}>{chat.name}</Text>
              <View style={styles.headerMeta}>
                <View
                  style={[
                    styles.headerDot,
                    { backgroundColor: chat.online ? Colors.green : Colors.textMuted },
                  ]}
                />
                <Text style={styles.headerNodeId}>{chat.nodeId}</Text>
                <Text
                  style={[
                    styles.headerSignal,
                    { color: getSignalColor(chat.signalStrength) },
                  ]}
                >
                  {chat.signalStrength}%
                </Text>
              </View>
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.meshInfo}>
          {settings.connectionMode === 'internet' ? (
            <Globe size={12} color={Colors.blue} />
          ) : settings.connectionMode === 'bridge' ? (
            <Wifi size={12} color={Colors.cyan} />
          ) : (
            <Radio size={12} color={Colors.textMuted} />
          )}
          <Text style={styles.meshInfoText}>
            {isLoRaMode
              ? `${chat.hops} hop${chat.hops !== 1 ? 's' : ''} · LoRa 868 MHz · SF12`
              : isInternetMode && !isLoRaMode
              ? 'via MQTT Gateway · Internet'
              : `${chat.hops} hop${chat.hops !== 1 ? 's' : ''} · Bridge · LoRa + MQTT`}
          </Text>
        </View>

        <FlatList
          ref={flatListRef}
          data={chat.messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          inverted={false}
        />

        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.btcButton} activeOpacity={0.7} testID="btc-send-button">
            <Bitcoin size={20} color={Colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.cashuSendButton} activeOpacity={0.7} testID="cashu-send-button">
            <CircleDollarSign size={20} color={Colors.cyan} />
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={isLoRaMode ? 'Message via mesh...' : 'Message via gateway...'}
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={500}
            testID="message-input"
          />
          <TouchableOpacity
            style={[styles.sendButton, inputText.trim() ? styles.sendButtonActive : null]}
            onPress={handleSend}
            disabled={!inputText.trim()}
            activeOpacity={0.7}
            testID="send-button"
          >
            <Send size={18} color={inputText.trim() ? Colors.black : Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  errorText: {
    color: Colors.text,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
  headerTitle: {
    alignItems: 'center',
  },
  headerName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  headerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerNodeId: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  headerSignal: {
    fontSize: 11,
    fontWeight: '600',
  },
  meshInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  meshInfoText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  messagesList: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    paddingBottom: 8,
  },
  messageBubbleContainer: {
    marginBottom: 6,
    maxWidth: '85%',
  },
  messageBubbleRight: {
    alignSelf: 'flex-end',
  },
  messageBubbleLeft: {
    alignSelf: 'flex-start',
  },
  messageBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  myBubble: {
    backgroundColor: Colors.accent,
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: Colors.surfaceLight,
    borderBottomLeftRadius: 4,
  },
  paymentBubbleWrapper: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accentDim,
  },
  cashuBubbleWrapper: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.25)',
  },
  chunkedBubbleWrapper: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  paymentBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  paymentAmount: {
    color: Colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  cashuBubble: {
    paddingVertical: 2,
  },
  cashuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  cashuLabel: {
    color: Colors.cyan,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  cashuCompleteBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.greenDim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cashuPendingBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.yellowDim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cashuAmount: {
    color: Colors.cyan,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  chunkInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chunkInfoText: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: 'monospace',
  },
  chunkReassembled: {
    color: Colors.green,
    fontSize: 9,
    fontWeight: '700',
    marginLeft: 4,
  },
  chunkProgressContainer: {
    marginTop: 8,
  },
  chunkProgressTrack: {
    height: 3,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  chunkProgressFill: {
    height: '100%',
    backgroundColor: Colors.cyan,
    borderRadius: 2,
  },
  chunkWaiting: {
    color: Colors.textMuted,
    fontSize: 9,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  chunkedBubble: {
    paddingVertical: 2,
    borderRadius: 10,
  },
  chunkedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  chunkedType: {
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  chunkedDataTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  chunkedDataTypeText: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
  },
  chunkedChunkRow: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 8,
  },
  chunkBlock: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceHighlight,
  },
  chunkedMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chunkedMetaText: {
    color: Colors.textMuted,
    fontSize: 9,
    fontFamily: 'monospace',
  },
  chunkedCompleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  chunkedCompleteText: {
    color: Colors.green,
    fontSize: 9,
    fontWeight: '700',
  },
  chunkedPendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chunkedPendingText: {
    color: Colors.yellow,
    fontSize: 9,
    fontWeight: '700',
  },
  messageText: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  myMessageText: {
    color: Colors.black,
  },
  messageFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  messageTime: {
    color: Colors.textMuted,
    fontSize: 10,
  },
  myMessageTime: {
    color: 'rgba(0,0,0,0.5)',
  },
  messageStatus: {
    fontSize: 10,
    color: 'rgba(0,0,0,0.5)',
  },
  statusDelivered: {
    color: 'rgba(0,0,0,0.7)',
  },
  statusFailed: {
    color: Colors.red,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
    gap: 6,
  },
  btcButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accentGlow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cashuSendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.cyanDim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonActive: {
    backgroundColor: Colors.accent,
  },
});
