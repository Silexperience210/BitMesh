import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Send, Bitcoin, CircleDollarSign, Lock, Hash, Radio, Globe, Wifi } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { formatMessageTime } from '@/utils/helpers';
import { useAppSettings } from '@/providers/AppSettingsProvider';
import { useMessages } from '@/providers/MessagesProvider';
import type { StoredMessage } from '@/utils/messages-store';

function PaymentBubble({ amount }: { amount: number }) {
  return (
    <View style={styles.paymentBubble}>
      <Bitcoin size={16} color={Colors.accent} />
      <Text style={styles.paymentAmount}>{amount.toLocaleString()} sats</Text>
    </View>
  );
}

function CashuBubble({ amount }: { amount: number }) {
  return (
    <View style={styles.cashuBubble}>
      <CircleDollarSign size={14} color={Colors.cyan} />
      <Text style={styles.cashuLabel}>Cashu Token</Text>
      <Text style={styles.cashuAmount}>{amount.toLocaleString()} sats</Text>
    </View>
  );
}

function MessageBubble({ message }: { message: StoredMessage }) {
  const isMe = message.isMine;

  return (
    <View style={[styles.messageBubbleContainer, isMe ? styles.bubbleRight : styles.bubbleLeft]}>
      {!isMe && (
        <Text style={styles.senderLabel}>{message.from}</Text>
      )}
      <View style={[
        styles.messageBubble,
        isMe ? styles.myBubble : styles.theirBubble,
        message.type === 'btc_tx' && styles.paymentWrapper,
        message.type === 'cashu' && styles.cashuWrapper,
      ]}>
        {message.type === 'cashu' && message.cashuAmount ? (
          <CashuBubble amount={message.cashuAmount} />
        ) : message.type === 'btc_tx' && message.btcAmount ? (
          <PaymentBubble amount={message.btcAmount} />
        ) : (
          <Text style={[styles.messageText, isMe && styles.myMessageText]}>
            {message.text}
          </Text>
        )}
        <View style={styles.messageFooter}>
          <Text style={[styles.messageTime, isMe && styles.myMessageTime]}>
            {formatMessageTime(message.timestamp)}
          </Text>
          {isMe && (
            <Text style={[styles.messageStatus, message.status === 'delivered' && styles.statusDelivered, message.status === 'failed' && styles.statusFailed]}>
              {message.status === 'delivered' ? '✓✓' : message.status === 'sent' ? '✓' : message.status === 'pending' ? '◎' : '✗'}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const convId = decodeURIComponent(chatId ?? '');
  const { settings, isLoRaMode } = useAppSettings();
  const { conversations, messagesByConv, sendMessage, sendCashu, loadConversationMessages, markRead, mqttState } = useMessages();

  const conv = conversations.find(c => c.id === convId);
  const messages = messagesByConv[convId] ?? [];

  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const isForum = convId.startsWith('forum:');

  // Charger les messages au montage
  useEffect(() => {
    loadConversationMessages(convId);
    markRead(convId);
  }, [convId]);

  // Scroll vers le bas à chaque nouveau message
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isSending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInputText('');
    setIsSending(true);
    setError(null);
    try {
      await sendMessage(convId, text, 'text');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur envoi');
    } finally {
      setIsSending(false);
    }
  }, [inputText, isSending, convId, sendMessage]);

  const renderMessage = useCallback(
    ({ item }: { item: StoredMessage }) => <MessageBubble message={item} />,
    []
  );

  const convName = conv?.name ?? convId;

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={styles.headerTitle}>
              <View style={styles.headerNameRow}>
                {isForum ? <Hash size={14} color={Colors.cyan} /> : <Lock size={12} color={Colors.accent} />}
                <Text style={styles.headerName}>{convName}</Text>
              </View>
              <View style={styles.headerMeta}>
                <View style={[styles.headerDot, { backgroundColor: mqttState === 'connected' ? Colors.green : Colors.textMuted }]} />
                <Text style={styles.headerNodeId}>{convId.slice(0, 20)}</Text>
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
          {settings.connectionMode === 'internet' ? <Globe size={12} color={Colors.blue} />
            : settings.connectionMode === 'bridge' ? <Wifi size={12} color={Colors.cyan} />
            : <Radio size={12} color={Colors.textMuted} />}
          <Text style={styles.meshInfoText}>
            {isForum
              ? `Forum #${convId.slice(6)} · chiffrement symétrique`
              : `DM chiffré E2E · ECDH secp256k1 · AES-GCM-256`}
          </Text>
        </View>

        {error && (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Lock size={32} color={Colors.textMuted} />
              <Text style={styles.emptyChatText}>
                {mqttState !== 'connected'
                  ? 'Connexion MQTT en cours...'
                  : 'Aucun message. Dites bonjour !'}
              </Text>
            </View>
          }
        />

        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.cashuSendButton} activeOpacity={0.7}>
            <CircleDollarSign size={20} color={Colors.cyan} />
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={isForum ? 'Message au forum...' : 'Message chiffré E2E...'}
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={500}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            style={[styles.sendButton, inputText.trim() && !isSending ? styles.sendButtonActive : null]}
            onPress={handleSend}
            disabled={!inputText.trim() || isSending}
            activeOpacity={0.7}
          >
            {isSending
              ? <ActivityIndicator size="small" color={Colors.black} />
              : <Send size={18} color={inputText.trim() ? Colors.black : Colors.textMuted} />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerTitle: { alignItems: 'center' },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerName: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  headerDot: { width: 6, height: 6, borderRadius: 3 },
  headerNodeId: { color: Colors.textMuted, fontSize: 10, fontFamily: 'monospace' },
  meshInfo: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 8, backgroundColor: Colors.surface,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  meshInfoText: { color: Colors.textMuted, fontSize: 11, fontFamily: 'monospace' },
  errorBar: { backgroundColor: Colors.redDim, paddingHorizontal: 16, paddingVertical: 8 },
  errorText: { color: Colors.red, fontSize: 12 },
  messagesList: { paddingHorizontal: 12, paddingVertical: 12, paddingBottom: 8 },
  emptyChat: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyChatText: { color: Colors.textMuted, fontSize: 14, textAlign: 'center' },
  messageBubbleContainer: { marginBottom: 6, maxWidth: '85%' },
  bubbleRight: { alignSelf: 'flex-end' },
  bubbleLeft: { alignSelf: 'flex-start' },
  senderLabel: { color: Colors.textMuted, fontSize: 10, fontFamily: 'monospace', marginBottom: 2, marginLeft: 4 },
  messageBubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  myBubble: { backgroundColor: Colors.accent, borderBottomRightRadius: 4 },
  theirBubble: { backgroundColor: Colors.surfaceLight, borderBottomLeftRadius: 4 },
  paymentWrapper: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.accentDim },
  cashuWrapper: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: 'rgba(34,211,238,0.25)' },
  paymentBubble: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  paymentAmount: { color: Colors.accent, fontSize: 16, fontWeight: '700' },
  cashuBubble: { gap: 4 },
  cashuLabel: { color: Colors.cyan, fontSize: 11, fontWeight: '700' },
  cashuAmount: { color: Colors.cyan, fontSize: 20, fontWeight: '800' },
  messageText: { color: Colors.text, fontSize: 15, lineHeight: 20 },
  myMessageText: { color: Colors.black },
  messageFooter: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 4 },
  messageTime: { color: Colors.textMuted, fontSize: 10 },
  myMessageTime: { color: 'rgba(0,0,0,0.5)' },
  messageStatus: { fontSize: 10, color: 'rgba(0,0,0,0.5)' },
  statusDelivered: { color: 'rgba(0,0,0,0.7)' },
  statusFailed: { color: Colors.red },
  inputContainer: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: Colors.surface, borderTopWidth: 0.5, borderTopColor: Colors.border, gap: 6,
  },
  cashuSendButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.cyanDim, justifyContent: 'center', alignItems: 'center',
  },
  textInput: {
    flex: 1, backgroundColor: Colors.surfaceLight, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, color: Colors.text,
    fontSize: 15, maxHeight: 100, borderWidth: 0.5, borderColor: Colors.border,
  },
  sendButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surfaceLight, justifyContent: 'center', alignItems: 'center',
  },
  sendButtonActive: { backgroundColor: Colors.accent },
});
