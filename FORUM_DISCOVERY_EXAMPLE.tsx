/**
 * EXEMPLE : Composant de découverte de forums
 *
 * Ce fichier montre comment utiliser la fonctionnalité de découverte de forums
 * dans l'interface utilisateur de BitMesh.
 *
 * À intégrer dans : app/(tabs)/(messages)/index.tsx
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Alert } from 'react-native';
import { useMessages } from '@/providers/MessagesProvider';
import { Users, Hash, Plus } from 'lucide-react-native';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';

/**
 * Composant pour créer et annoncer un nouveau forum public
 */
function CreateForumCard() {
  const { announceForumPublic, joinForum } = useMessages();
  const [showCreate, setShowCreate] = useState(false);
  const [forumName, setForumName] = useState('');
  const [forumDesc, setForumDesc] = useState('');

  const handleCreate = async () => {
    if (!forumName.trim()) {
      Alert.alert('Erreur', 'Entrez un nom de forum');
      return;
    }

    const channelName = forumName.toLowerCase().replace(/\s+/g, '-');

    // 1. Rejoindre le forum localement
    await joinForum(channelName, forumDesc || `Forum ${forumName}`);

    // 2. Annoncer publiquement sur MQTT
    announceForumPublic(channelName, forumDesc || `Forum ${forumName}`);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Forum créé!', `Le forum "${channelName}" a été annoncé sur le réseau MQTT`);

    setShowCreate(false);
    setForumName('');
    setForumDesc('');
  };

  return (
    <View style={styles.createCard}>
      <TouchableOpacity
        style={styles.createHeader}
        onPress={() => setShowCreate(!showCreate)}
        activeOpacity={0.7}
      >
        <Plus size={18} color={Colors.accent} />
        <Text style={styles.createTitle}>
          {showCreate ? 'Annuler' : 'Créer un forum public'}
        </Text>
      </TouchableOpacity>

      {showCreate && (
        <View style={styles.createForm}>
          <TextInput
            style={styles.input}
            placeholder="Nom du forum (ex: bitcoin-paris)"
            placeholderTextColor={Colors.textMuted}
            value={forumName}
            onChangeText={setForumName}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Description (optionnel)"
            placeholderTextColor={Colors.textMuted}
            value={forumDesc}
            onChangeText={setForumDesc}
          />
          <TouchableOpacity
            style={styles.createButton}
            onPress={handleCreate}
            activeOpacity={0.7}
          >
            <Text style={styles.createButtonText}>Créer et Annoncer</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/**
 * Composant pour afficher les forums découverts via MQTT
 */
function DiscoveredForumsSection() {
  const { discoveredForums, joinForum } = useMessages();

  const handleJoinForum = async (channelName: string, description: string) => {
    await joinForum(channelName, description);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Rejoint!', `Vous avez rejoint #${channelName}`);
  };

  if (discoveredForums.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Hash size={32} color={Colors.textMuted} />
        <Text style={styles.emptyText}>Aucun forum découvert</Text>
        <Text style={styles.emptySubtext}>
          Les forums annoncés apparaîtront ici automatiquement
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        Forums Découverts ({discoveredForums.length})
      </Text>

      <FlatList
        data={discoveredForums}
        keyExtractor={(item, index) => `${item.channelName}-${item.creatorNodeId}-${index}`}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.forumItem}
            onPress={() => handleJoinForum(item.channelName, item.description)}
            activeOpacity={0.7}
          >
            <View style={styles.forumIcon}>
              <Hash size={20} color={Colors.accent} />
            </View>
            <View style={styles.forumContent}>
              <Text style={styles.forumName}>#{item.channelName}</Text>
              <Text style={styles.forumDesc} numberOfLines={1}>
                {item.description}
              </Text>
              <Text style={styles.forumMeta}>
                Par {item.creatorNodeId} • {new Date(item.ts).toLocaleString('fr-FR')}
              </Text>
            </View>
            <Users size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

/**
 * Écran complet de découverte de forums
 * À intégrer dans l'onglet Messages
 */
export default function ForumDiscoveryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Découverte de Forums</Text>
      <CreateForumCard />
      <DiscoveredForumsSection />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 16,
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
  },
  createCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  createHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  createTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.accent,
  },
  createForm: {
    marginTop: 16,
    gap: 12,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    padding: 12,
    color: Colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  createButton: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  createButtonText: {
    color: Colors.black,
    fontSize: 15,
    fontWeight: '700',
  },
  section: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  forumItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  forumIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accentDim,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  forumContent: {
    flex: 1,
  },
  forumName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  forumDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  forumMeta: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    maxWidth: 250,
  },
});
