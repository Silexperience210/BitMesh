import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Radio, Plus, Wifi, Globe } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { mockChats, Chat } from '@/mocks/data';
import { formatTime, getSignalColor } from '@/utils/helpers';
import { useAppSettings } from '@/providers/AppSettingsProvider';

function SignalDots({ strength }: { strength: number }) {
  const color = getSignalColor(strength);
  const bars = strength >= 70 ? 3 : strength >= 40 ? 2 : 1;
  return (
    <View style={styles.signalDots}>
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            styles.signalDot,
            {
              backgroundColor: i <= bars ? color : Colors.surfaceHighlight,
              height: 4 + i * 3,
            },
          ]}
        />
      ))}
    </View>
  );
}

function ChatItem({ chat, onPress }: { chat: Chat; onPress: () => void }) {
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={styles.chatItem}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        testID={`chat-item-${chat.id}`}
      >
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, chat.online && styles.avatarOnline]}>
            <Text style={styles.avatarText}>{chat.avatar}</Text>
          </View>
          {chat.online && <View style={styles.onlineDot} />}
        </View>

        <View style={styles.chatContent}>
          <View style={styles.chatHeader}>
            <View style={styles.chatNameRow}>
              <Text style={styles.chatName} numberOfLines={1}>
                {chat.name}
              </Text>
              <View style={styles.meshBadge}>
                <Text style={styles.meshBadgeText}>{chat.hops}h</Text>
              </View>
            </View>
            <Text style={styles.chatTime}>{formatTime(chat.lastMessageTime)}</Text>
          </View>

          <View style={styles.chatFooter}>
            <Text style={styles.chatLastMessage} numberOfLines={1}>
              {chat.lastMessage}
            </Text>
            <View style={styles.chatMeta}>
              <SignalDots strength={chat.signalStrength} />
              {chat.unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{chat.unreadCount}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function MessagesScreen() {
  const router = useRouter();
  const { settings, isInternetMode, isLoRaMode } = useAppSettings();

  const modeLabel = settings.connectionMode === 'internet'
    ? 'Internet Mode'
    : settings.connectionMode === 'bridge'
    ? 'Bridge Mode'
    : 'LoRa Mesh';

  const modeColor = settings.connectionMode === 'internet'
    ? Colors.blue
    : settings.connectionMode === 'bridge'
    ? Colors.cyan
    : Colors.green;

  const ModeIcon = settings.connectionMode === 'internet'
    ? Globe
    : settings.connectionMode === 'bridge'
    ? Wifi
    : Radio;

  const renderChat = useCallback(
    ({ item }: { item: Chat }) => (
      <ChatItem
        chat={item}
        onPress={() => router.push(`/(messages)/${item.id}` as never)}
      />
    ),
    [router]
  );

  return (
    <View style={styles.container}>
      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <ModeIcon size={14} color={modeColor} />
          <Text style={[styles.statusText, { color: modeColor }]}>{modeLabel}</Text>
          <View style={styles.statusDivider} />
          <Text style={styles.statusNodes}>
            {isLoRaMode ? '5 nodes' : 'MQTT Bridge'}
          </Text>
        </View>
        <Text style={styles.statusFreq}>
          {isLoRaMode ? '868 MHz' : settings.connectionMode === 'internet' ? 'TCP/IP' : '868 MHz + TCP/IP'}
        </Text>
      </View>

      <FlatList
        data={mockChats}
        keyExtractor={(item) => item.id}
        renderItem={renderChat}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <TouchableOpacity style={styles.fab} activeOpacity={0.8} testID="new-chat-fab">
        <Plus size={24} color={Colors.black} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    color: Colors.green,
    fontSize: 12,
    fontWeight: '600',
  },
  statusDivider: {
    width: 1,
    height: 12,
    backgroundColor: Colors.border,
    marginHorizontal: 4,
  },
  statusNodes: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  statusFreq: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  listContent: {
    paddingTop: 4,
    paddingBottom: 100,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 14,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  avatarOnline: {
    borderColor: Colors.green,
  },
  avatarText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.green,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  chatContent: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  chatName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  meshBadge: {
    backgroundColor: Colors.accentGlow,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  meshBadgeText: {
    color: Colors.accent,
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  chatTime: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  chatFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatLastMessage: {
    color: Colors.textSecondary,
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  chatMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signalDots: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  signalDot: {
    width: 3,
    borderRadius: 1.5,
  },
  unreadBadge: {
    backgroundColor: Colors.accent,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: Colors.black,
    fontSize: 11,
    fontWeight: '700',
  },
  separator: {
    height: 0.5,
    backgroundColor: Colors.border,
    marginLeft: 80,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
