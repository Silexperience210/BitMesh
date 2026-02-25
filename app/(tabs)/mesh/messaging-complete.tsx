/**
 * MessagingComplete - Interface complète de test MeshCore
 * 
 * Cet écran permet de tester TOUTES les fonctionnalités:
 * - Scan et connexion BLE
 * - Synchronisation contacts
 * - Envoi messages (DM, canal, flood)
 * - Réception messages
 * - Gestion des ACKs
 * - Visualisation des stats radio
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';

import { useBle } from '../../../providers/BleProvider-complete';
import {
  MeshContact,
  MeshMessage,
  PendingMessage,
  DeviceInfo,
  LIMITS,
  generateNodeId,
} from '../../../types/meshcore';

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export default function MessagingCompleteScreen() {
  const ble = useBle();
  
  // État local
  const [activeTab, setActiveTab] = useState<'connection' | 'contacts' | 'messages' | 'logs'>('connection');
  const [scanDuration, setScanDuration] = useState('5000');
  const [selectedContact, setSelectedContact] = useState<MeshContact | null>(null);
  const [messageText, setMessageText] = useState('');
  const [channelIndex, setChannelIndex] = useState('0');
  const [newContactPubkey, setNewContactPubkey] = useState('');
  const [newContactName, setNewContactName] = useState('');
  
  // ============================================================================
  // RENDU - TAB CONNEXION
  // ============================================================================
  
  const renderConnectionTab = () => (
    <ScrollView style={styles.tabContent}>
      {/* Statut connexion */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Statut Connexion</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, ble.connected ? styles.statusConnected : styles.statusDisconnected]} />
          <Text style={styles.statusText}>
            {ble.connecting ? 'Connexion en cours...' : 
             ble.connected ? `Connecté: ${ble.device?.name || 'MeshCore'}` : 'Déconnecté'}
          </Text>
        </View>
        
        {ble.error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{ble.error}</Text>
            <TouchableOpacity onPress={ble.clearError} style={styles.clearErrorBtn}>
              <Text style={styles.clearErrorText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      
      {/* Scan */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Scanner les devices</Text>
        <View style={styles.inputRow}>
          <Text>Durée (ms):</Text>
          <TextInput
            style={styles.numberInput}
            value={scanDuration}
            onChangeText={setScanDuration}
            keyboardType="number-pad"
          />
        </View>
        <TouchableOpacity
          style={[styles.button, ble.scanning && styles.buttonDisabled]}
          onPress={() => ble.scanForDevices(parseInt(scanDuration))}
          disabled={ble.scanning}
        >
          {ble.scanning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <FontAwesome5 name="search" size={16} color="#fff" />
              <Text style={styles.buttonText}>Scanner</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      
      {/* Device Info */}
      {ble.deviceInfo && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Info Device</Text>
          <InfoRow label="Nom" value={ble.deviceInfo.name || '-'} />
          <InfoRow label="Fréquence" value={`${ble.deviceInfo.freq} MHz`} />
          <InfoRow label="SF" value={ble.deviceInfo.sf?.toString() || '-'} />
          <InfoRow label="BW" value={`${ble.deviceInfo.bw} kHz`} />
          <InfoRow label="CR" value={`${ble.deviceInfo.cr}/${ble.deviceInfo.cr + 4}`} />
          <InfoRow label="TX Power" value={`${ble.deviceInfo.txPower} dBm`} />
        </View>
      )}
      
      {/* Stats */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Statistiques</Text>
        <InfoRow label="Contacts" value={ble.meshContacts.length.toString()} />
        <InfoRow label="Messages reçus" value={ble.messages.length.toString()} />
        <InfoRow label="Pending" value={ble.pendingMessages.length.toString()} />
        <InfoRow label="Adverts" value={ble.adverts.length.toString()} />
      </View>
      
      {/* Actions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Actions</Text>
        <View style={styles.actionButtons}>
          {ble.connected ? (
            <TouchableOpacity style={[styles.button, styles.buttonDanger]} onPress={ble.disconnect}>
              <MaterialIcons name="bluetooth-disabled" size={16} color="#fff" />
              <Text style={styles.buttonText}>Déconnecter</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.hintText}>Scannez et sélectionnez un device pour vous connecter</Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
  
  // ============================================================================
  // RENDU - TAB CONTACTS
  // ============================================================================
  
  const renderContactsTab = () => (
    <View style={styles.tabContent}>
      {/* Barre d'actions */}
      <View style={styles.card}>
        <TouchableOpacity
          style={[styles.button, ble.syncingContacts && styles.buttonDisabled]}
          onPress={ble.syncContacts}
          disabled={!ble.connected || ble.syncingContacts}
        >
          {ble.syncingContacts ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <FontAwesome5 name="sync" size={16} color="#fff" />
              <Text style={styles.buttonText}>Synchroniser Contacts</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      
      {/* Ajouter contact manuellement */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ajouter Contact</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Public Key (hex, 64 caractères)"
          value={newContactPubkey}
          onChangeText={setNewContactPubkey}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.textInput}
          placeholder="Nom (optionnel)"
          value={newContactName}
          onChangeText={setNewContactName}
        />
        <TouchableOpacity
          style={[styles.button, (!newContactPubkey || !ble.connected) && styles.buttonDisabled]}
          onPress={() => {
            ble.addContact(newContactPubkey, newContactName || undefined);
            setNewContactPubkey('');
            setNewContactName('');
          }}
          disabled={!newContactPubkey || !ble.connected}
        >
          <FontAwesome5 name="plus" size={16} color="#fff" />
          <Text style={styles.buttonText}>Ajouter</Text>
        </TouchableOpacity>
      </View>
      
      {/* Liste contacts */}
      <FlatList
        data={ble.meshContacts}
        keyExtractor={(item) => item.pubkeyHex}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.contactItem,
              selectedContact?.pubkeyHex === item.pubkeyHex && styles.contactItemSelected,
            ]}
            onPress={() => setSelectedContact(item)}
          >
            <View style={styles.contactHeader}>
              <Text style={styles.contactName}>{item.name}</Text>
              <Text style={styles.contactIndex}>#{item.firmwareIndex}</Text>
            </View>
            <Text style={styles.contactHash}>Hash: {item.hash}</Text>
            <Text style={styles.contactPrefix}>{item.pubkeyPrefix}...</Text>
            <View style={styles.contactMeta}>
              <Text style={styles.contactType}>Type: {getContactTypeLabel(item.type)}</Text>
              {item.outPathLen > 0 && (
                <Text style={styles.contactPath}>Path: {item.outPathLen} hops</Text>
              )}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <Text style={styles.emptyText}>Aucun contact</Text>
            <Text style={styles.emptySubtext}>
              {ble.connected 
                ? 'Synchronisez pour charger les contacts du device'
                : 'Connectez-vous d\'abord'}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={ble.syncingContacts}
            onRefresh={ble.syncContacts}
            enabled={ble.connected}
          />
        }
      />
    </View>
  );
  
  // ============================================================================
  // RENDU - TAB MESSAGES
  // ============================================================================
  
  const renderMessagesTab = () => (
    <View style={styles.tabContent}>
      {/* Envoi message */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Envoyer Message</Text>
        
        {/* Sélection contact */}
        <Text style={styles.label}>Destinataire:</Text>
        <TouchableOpacity
          style={styles.selector}
          onPress={() => setActiveTab('contacts')}
        >
          <Text>
            {selectedContact 
              ? `${selectedContact.name} (#${selectedContact.firmwareIndex})`
              : 'Sélectionner un contact...'}
          </Text>
          <FontAwesome5 name="chevron-right" size={14} color="#666" />
        </TouchableOpacity>
        
        {/* Texte */}
        <Text style={styles.label}>Message ({messageText.length}/{LIMITS.MAX_MESSAGE_LENGTH}):</Text>
        <TextInput
          style={[styles.textInput, styles.messageInput]}
          multiline
          numberOfLines={3}
          maxLength={LIMITS.MAX_MESSAGE_LENGTH}
          placeholder="Votre message..."
          value={messageText}
          onChangeText={setMessageText}
        />
        
        {/* Boutons envoi */}
        <View style={styles.sendButtons}>
          <TouchableOpacity
            style={[
              styles.button, 
              styles.buttonPrimary,
              (!selectedContact || !messageText || !ble.connected) && styles.buttonDisabled,
            ]}
            onPress={async () => {
              if (!selectedContact) return;
              try {
                await ble.sendDirectMessage(selectedContact.pubkeyHex, messageText);
                setMessageText('');
              } catch (err: any) {
                Alert.alert('Erreur', err.message);
              }
            }}
            disabled={!selectedContact || !messageText || !ble.connected}
          >
            <FontAwesome5 name="paper-plane" size={16} color="#fff" />
            <Text style={styles.buttonText}>Envoyer DM</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.button,
              (!messageText || !ble.connected) && styles.buttonDisabled,
            ]}
            onPress={async () => {
              try {
                await ble.sendFloodMessage(messageText);
                setMessageText('');
              } catch (err: any) {
                Alert.alert('Erreur', err.message);
              }
            }}
            disabled={!messageText || !ble.connected}
          >
            <FontAwesome5 name="broadcast-tower" size={16} color="#fff" />
            <Text style={styles.buttonText}>Broadcast</Text>
          </TouchableOpacity>
        </View>
        
        {/* Envoi canal */}
        <View style={styles.channelRow}>
          <Text>Canal:</Text>
          <TextInput
            style={styles.numberInput}
            value={channelIndex}
            onChangeText={setChannelIndex}
            keyboardType="number-pad"
            maxLength={1}
          />
          <TouchableOpacity
            style={[styles.buttonSmall, !ble.connected && styles.buttonDisabled]}
            onPress={async () => {
              try {
                await ble.sendChannelMessage(parseInt(channelIndex), messageText);
                setMessageText('');
              } catch (err: any) {
                Alert.alert('Erreur', err.message);
              }
            }}
            disabled={!messageText || !ble.connected}
          >
            <Text style={styles.buttonTextSmall}>Canal {channelIndex}</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Pending messages */}
      {ble.pendingMessages.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Messages en cours</Text>
          <FlatList
            data={ble.pendingMessages.slice(-5)}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.pendingItem}>
                <View style={styles.pendingHeader}>
                  <Text style={styles.pendingText} numberOfLines={1}>
                    {item.text}
                  </Text>
                  <StatusBadge status={item.status} />
                </View>
                {item.rtt && (
                  <Text style={styles.pendingRtt}>RTT: {item.rtt}ms</Text>
                )}
              </View>
            )}
          />
        </View>
      )}
      
      {/* Messages reçus */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Messages Reçus ({ble.messages.length})</Text>
        <FlatList
          data={[...ble.messages].reverse()}
          keyExtractor={(item, index) => `${item.timestamp}-${index}`}
          renderItem={({ item }) => (
            <View style={styles.messageItem}>
              <View style={styles.messageHeader}>
                <Text style={styles.messageFrom}>De: #{item.contactIndex}</Text>
                <Text style={styles.messageTime}>
                  {new Date(item.timestamp * 1000).toLocaleTimeString()}
                </Text>
              </View>
              <Text style={styles.messageText}>{item.text}</Text>
              {item.path.length > 0 && (
                <Text style={styles.messagePath}>Path: {item.path.join(' → ')}</Text>
              )}
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Aucun message reçu</Text>
          }
        />
      </View>
    </View>
  );
  
  // ============================================================================
  // RENDU - TAB LOGS
  // ============================================================================
  
  const renderLogsTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.card}>
        <View style={styles.logsHeader}>
          <Text style={styles.cardTitle}>Logs ({ble.logs.length})</Text>
          <TouchableOpacity onPress={ble.clearLogs}>
            <Text style={styles.clearLogsText}>Effacer</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={[...ble.logs].reverse()}
          keyExtractor={(item, index) => `${item.timestamp}-${index}`}
          renderItem={({ item }) => (
            <View style={styles.logItem}>
              <Text style={[styles.logLevel, styles[`log${item.level}`]]}>
                {item.level.toUpperCase()}
              </Text>
              <Text style={styles.logTime}>
                {new Date(item.timestamp).toLocaleTimeString()}
              </Text>
              <Text style={styles.logMessage} numberOfLines={2}>
                {item.message}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Aucun log</Text>
          }
        />
      </View>
    </View>
  );
  
  // ============================================================================
  // RENDU PRINCIPAL
  // ============================================================================
  
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>MeshCore Messaging</Text>
        <View style={[styles.statusIndicator, ble.connected ? styles.statusOn : styles.statusOff]} />
      </View>
      
      {/* Content */}
      {activeTab === 'connection' && renderConnectionTab()}
      {activeTab === 'contacts' && renderContactsTab()}
      {activeTab === 'messages' && renderMessagesTab()}
      {activeTab === 'logs' && renderLogsTab()}
      
      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TabButton
          icon="link"
          label="Connexion"
          active={activeTab === 'connection'}
          onPress={() => setActiveTab('connection')}
        />
        <TabButton
          icon="users"
          label="Contacts"
          active={activeTab === 'contacts'}
          onPress={() => setActiveTab('contacts')}
          badge={ble.meshContacts.length}
        />
        <TabButton
          icon="comments"
          label="Messages"
          active={activeTab === 'messages'}
          onPress={() => setActiveTab('messages')}
          badge={ble.messages.length}
        />
        <TabButton
          icon="terminal"
          label="Logs"
          active={activeTab === 'logs'}
          onPress={() => setActiveTab('logs')}
        />
      </View>
    </SafeAreaView>
  );
}

// ============================================================================
// SOUS-COMPOSANTS
// ============================================================================

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}:</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: PendingMessage['status'] }) {
  const colors = {
    sending: '#f0ad4e',
    sent: '#5bc0de',
    confirmed: '#5cb85c',
    failed: '#d9534f',
  };
  
  const labels = {
    sending: 'Envoi...',
    sent: 'Envoyé',
    confirmed: '✓ Confirmé',
    failed: '✗ Échec',
  };
  
  return (
    <View style={[styles.statusBadge, { backgroundColor: colors[status] }]}>
      <Text style={styles.statusBadgeText}>{labels[status]}</Text>
    </View>
  );
}

function TabButton({
  icon,
  label,
  active,
  onPress,
  badge,
}: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <TouchableOpacity
      style={[styles.tabButton, active && styles.tabButtonActive]}
      onPress={onPress}
    >
      <FontAwesome5 name={icon} size={20} color={active ? '#007AFF' : '#666'} />
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
      {badge !== undefined && badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function getContactTypeLabel(type: number): string {
  const types = ['Chat', 'Repeater', 'Room', 'Sensor'];
  return types[type] || `Type ${type}`;
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusOn: {
    backgroundColor: '#5cb85c',
  },
  statusOff: {
    backgroundColor: '#d9534f',
  },
  tabContent: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingBottom: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  tabButtonActive: {
    backgroundColor: '#f0f8ff',
  },
  tabLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  tabLabelActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: '20%',
    backgroundColor: '#ff3b30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#fff',
    margin: 8,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusConnected: {
    backgroundColor: '#5cb85c',
  },
  statusDisconnected: {
    backgroundColor: '#d9534f',
  },
  statusText: {
    fontSize: 16,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8d7da',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  errorText: {
    flex: 1,
    color: '#721c24',
  },
  clearErrorBtn: {
    padding: 4,
  },
  clearErrorText: {
    fontSize: 18,
    color: '#721c24',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  numberInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 8,
    width: 80,
    marginLeft: 8,
    textAlign: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  buttonPrimary: {
    backgroundColor: '#34C759',
  },
  buttonDanger: {
    backgroundColor: '#ff3b30',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSmall: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  buttonTextSmall: {
    color: '#fff',
    fontSize: 14,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  messageInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  sendButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: {
    color: '#666',
  },
  infoValue: {
    fontWeight: '500',
  },
  contactItem: {
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 8,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  contactItemSelected: {
    borderColor: '#007AFF',
  },
  contactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
  },
  contactIndex: {
    backgroundColor: '#007AFF',
    color: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 'bold',
  },
  contactHash: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
  },
  contactPrefix: {
    fontSize: 12,
    color: '#999',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  contactMeta: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  contactType: {
    fontSize: 12,
    color: '#666',
  },
  contactPath: {
    fontSize: 12,
    color: '#5cb85c',
  },
  emptyList: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
  },
  emptySubtext: {
    color: '#999',
    fontSize: 14,
    marginTop: 8,
  },
  pendingItem: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  pendingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pendingText: {
    flex: 1,
    fontSize: 14,
  },
  pendingRtt: {
    fontSize: 12,
    color: '#5cb85c',
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  messageItem: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  messageFrom: {
    fontWeight: '600',
    color: '#007AFF',
  },
  messageTime: {
    fontSize: 12,
    color: '#999',
  },
  messageText: {
    fontSize: 14,
  },
  messagePath: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
    fontStyle: 'italic',
  },
  logsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  clearLogsText: {
    color: '#007AFF',
  },
  logItem: {
    backgroundColor: '#f8f9fa',
    padding: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  logLevel: {
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  logdebug: {
    color: '#6c757d',
  },
  loginfo: {
    color: '#007bff',
  },
  logwarn: {
    color: '#ffc107',
  },
  logerror: {
    color: '#dc3545',
  },
  logTime: {
    fontSize: 10,
    color: '#999',
  },
  logMessage: {
    fontSize: 12,
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  hintText: {
    color: '#999',
    fontStyle: 'italic',
  },
});
