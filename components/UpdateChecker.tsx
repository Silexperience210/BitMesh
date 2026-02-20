import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Download, CheckCircle, AlertCircle } from 'lucide-react-native';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import Colors from '@/constants/colors';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.1';

export function UpdateChecker() {
  const [checking, setChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function checkForUpdates() {
    setChecking(true);
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        setUpdateAvailable(true);
        Alert.alert(
          'Mise à jour disponible',
          'Une nouvelle version de BitMesh est disponible. Voulez-vous la télécharger ?',
          [
            { text: 'Plus tard', style: 'cancel' },
            { text: 'Télécharger', onPress: downloadUpdate },
          ]
        );
      } else {
        Alert.alert('À jour', 'Vous utilisez la dernière version de BitMesh.');
      }
    } catch (err) {
      console.log('[Update] Erreur vérification:', err);
      Alert.alert('Erreur', 'Impossible de vérifier les mises à jour.');
    } finally {
      setChecking(false);
    }
  }

  async function downloadUpdate() {
    setDownloading(true);
    try {
      await Updates.fetchUpdateAsync();
      Alert.alert(
        'Mise à jour téléchargée',
        'Redémarrer pour appliquer la mise à jour ?',
        [
          { text: 'Plus tard', style: 'cancel' },
          { text: 'Redémarrer', onPress: () => Updates.reloadAsync() },
        ]
      );
    } catch (err) {
      console.log('[Update] Erreur téléchargement:', err);
      Alert.alert('Erreur', 'Impossible de télécharger la mise à jour.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.versionRow}>
        <Text style={styles.title}>Mises à jour</Text>
        <Text style={styles.version}>v{APP_VERSION}</Text>
      </View>
      
      {updateAvailable ? (
        <View style={styles.updateAvailable}>
          <AlertCircle size={20} color={Colors.yellow} />
          <Text style={styles.updateText}>Mise à jour disponible</Text>
        </View>
      ) : (
        <View style={styles.upToDate}>
          <CheckCircle size={20} color={Colors.green} />
          <Text style={styles.upToDateText}>À jour</Text>
        </View>
      )}
      
      <TouchableOpacity
        style={styles.button}
        onPress={checkForUpdates}
        disabled={checking || downloading}
      >
        {checking || downloading ? (
          <ActivityIndicator color={Colors.black} />
        ) : (
          <>
            <Download size={18} color={Colors.black} />
            <Text style={styles.buttonText}>Vérifier les mises à jour</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
  },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  version: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  upToDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  upToDateText: {
    color: Colors.green,
    fontSize: 14,
  },
  updateAvailable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  updateText: {
    color: Colors.yellow,
    fontSize: 14,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: {
    color: Colors.black,
    fontSize: 14,
    fontWeight: '600',
  },
});
