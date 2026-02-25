# 🔧 Mesh Debugger - Guide d'Utilisation

**Date**: 25 Février 2026

---

## 🎯 Vue d'ensemble

Le **Mesh Debugger** est un outil de diagnostic complet pour vérifier le fonctionnement de BitMesh et du device MeshCore.

### Fonctionnalités

- ✅ **Tests automatisés** (10+ tests de connectivité)
- ✅ **Monitoring temps réel** des stats
- ✅ **Export de rapports** détaillés
- ✅ **Tests manuels** de messages
- ✅ **Visualisation des logs** complets

---

## 📱 Accès au Debugger

### Méthode 1: Via l'écran Mesh
```
Mesh → "Configurer Canaux & Radio" → Debugger (onglet Tools)
```

### Méthode 2: Écran dédié
```
Router → /mesh/debug
```

### Méthode 3: Shake Gesture (à implémenter)
```javascript
// Dans App.tsx, ajouter:
import { useShakeGesture } from '@/hooks/useShakeGesture';

// Secouer le téléphone pour ouvrir le debugger
```

---

## 🧪 Tests Disponibles

### Catégorie: Connexion

| Test | Description | Critique |
|------|-------------|----------|
| BLE Initialisé | Vérifie BLE Manager prêt | ⚠️ Moyen |
| Connexion Device | Vérifie connexion active | 🔴 Oui |
| Handshake Protocole | Vérifie MeshCore Companion | 🔴 Oui |
| SelfInfo Reçue | Vérifie infos device | 🟢 Non |

### Catégorie: Radio

| Test | Description | Critique |
|------|-------------|----------|
| Configuration Canal | Vérifie canal configuré | 🔴 Oui |
| Canal Actif | Affiche canal courant | 🟢 Info |
| Fréquence Radio | Affiche fréquence MHz | 🟢 Info |
| Paramètres Radio | SF, BW, CR, TX Power | 🟢 Info |

### Catégorie: Messagerie

| Test | Description | Critique |
|------|-------------|----------|
| Capacité Envoi | Test envoi message | 🔴 Oui |
| Capacité Réception | Vérifie réception | 🔴 Oui |
| Mécanisme ACK | Test accusés réception | 🟡 Moyen |
| Broadcast Flood | Test canal 0 | 🔴 Oui |

### Catégorie: Protocole

| Test | Description | Critique |
|------|-------------|----------|
| Sync Contacts | Vérifie table contacts | 🟡 Moyen |

---

## 🚀 Guide d'Utilisation

### 1. Quick Check (Santé Rapide)

**Quand l'utiliser**: Vérification rapide avant un envoi important

**Steps**:
1. Ouvrir le debugger
2. Appuyer sur **"Quick Check"**
3. Vérifier que les 3 tests critiques passent:
   - ✅ Connexion Device
   - ✅ Handshake Protocole  
   - ✅ Configuration Canal

**Résultat attendu**: 
```
✅ Santé OK
Les fonctions critiques fonctionnent correctement.
```

### 2. Test Complet

**Quand l'utiliser**: Diagnostic complet, debugging, validation setup

**Steps**:
1. Ouvrir le debugger
2. Appuyer sur **"Test Complet"**
3. Attendre ~10-15 secondes (10 tests)
4. Analyser les résultats

**Interprétation**:

| Résultat | Signification | Action |
|----------|---------------|--------|
| ✅ Tous passent | Configuration optimale | Aucune |
| ⚠️ Avertissements | Fonctionne mais peut être amélioré | Vérifier warnings |
| ❌ Échecs | Problèmes critiques | Consulter détails |

### 3. Test Manuel

**Quand l'utiliser**: Tester un scénario spécifique

**Steps**:
1. Onglet **"Outils"**
2. Entrer message de test
3. Choisir canal (0-7)
4. Appuyer **"Envoyer Test"**

**Exemples**:
```
Canal 0: Broadcast public
Canal 1: Groupe privé (avec secret configuré)
```

### 4. Export Rapport

**Quand l'utiliser**: Partager un problème, documentation

**Steps**:
1. Exécuter les tests
2. Appuyer sur **"Exporter"**
3. Choisir: Partager ou Copier

**Contenu du rapport**:
```
=== RAPPORT DIAGNOSTIC BITMESH ===
Date: 2026-02-25T13:30:00
Version: MeshCore Companion v1.12

=== STATUT GLOBAL ===
Connexion BLE: ✅ Connecté
Canal actif: 0 ✅
Contacts: 3
Messages envoyés: 12
Latence moyenne: 245ms

=== PARAMÈTRES RADIO ===
Fréquence: 869.525 MHz
SF: 11
BW: 250 kHz
CR: 4/5
TX Power: 20 dBm

=== RÉSULTATS DES TESTS ===
✅ Connexion BLE: Connecté à MeshCore-A7F2
✅ Handshake Protocole: Handshake MeshCore OK
⚠️ Configuration Canal: Canal 0 actif, config non confirmée
...
```

---

## 📊 Interprétation des Résultats

### Code Couleur

| Icône | Signification | Action |
|-------|---------------|--------|
| ✅ | Test passé | Aucune |
| ⚠️ | Avertissement | Vérifier mais pas bloquant |
| ❌ | Échec | Doit être corrigé |
| ⏳ | En cours | Attendre fin |
| ⏸️ | En attente | Pas encore exécuté |

### Problèmes Courants

#### ❌ "Non connecté à un device BLE"
**Cause**: Pas de connexion BLE active
**Solution**:
1. Mesh → Scan Gateways
2. Sélectionner device
3. Connecter

#### ❌ "Handshake incomplet"
**Cause**: Connexion BLE mais pas de réponse MeshCore
**Solution**:
1. Vérifier firmware MeshCore Companion
2. Redémarrer l'ESP32
3. Reconnecter

#### ⚠️ "Config canal non confirmée"
**Cause**: Canal actif mais pas configuré explicitement
**Solution**:
1. Configurer le canal dans RadioConfigModal
2. Ou: reconnexion BLE (auto-config canal 0)

#### ❌ "Échec envoi"
**Cause**: Canal non configuré ou BLE déconnecté
**Solution**:
1. Vérifier connexion BLE
2. Vérifier canal configuré
3. Réessayer

---

## 🔧 Tests Avancés

### Hook useMeshDiagnostics

Pour intégrer les diagnostics dans d'autres composants:

```typescript
import { useMeshDiagnostics } from '@/hooks/useMeshDiagnostics';

function MonComposant() {
  const {
    isRunningDiagnostics,
    tests,
    stats,
    runAllDiagnostics,
    quickHealthCheck,
    runTest,  // Test individuel
  } = useMeshDiagnostics();

  // Lancer un test spécifique
  const testConnection = async () => {
    const result = await runTest('ble_connection');
    console.log(result.status, result.message);
  };

  // Health check rapide
  const checkHealth = async () => {
    const isHealthy = await quickHealthCheck();
    if (!isHealthy) {
      Alert.alert('Problème détecté');
    }
  };
}
```

### Tests Personnalisés

Pour ajouter un nouveau test:

```typescript
// Dans useMeshDiagnostics.ts
const availableTests = [
  // ... tests existants
  {
    id: 'mon_test',
    name: 'Mon Test',
    description: 'Description du test',
    category: 'protocol',
  },
];

// Dans la fonction runTest:
case 'mon_test':
  // Implémentation du test
  return {
    ...testBase,
    status: 'success', // ou 'failed', 'warning'
    message: 'Résultat du test',
    duration: Date.now() - startTime.current,
    timestamp: Date.now(),
  };
```

---

## 📈 Monitoring Stats

Les statistiques suivies:

| Stat | Description |
|------|-------------|
| `messagesSent` | Nombre de messages envoyés |
| `messagesReceived` | Nombre de messages reçus |
| `ackReceived` | Nombre d'ACK reçus |
| `ackTimeout` | Nombre de timeouts ACK |
| `connectionDrops` | Nombre de déconnexions |
| `lastActivity` | Timestamp dernière activité |
| `avgLatency` | Latence moyenne (ms) |

**Reset**: Bouton "Reset stats" dans l'interface

---

## 🐛 Debugging Tips

### Problème: Tests passent mais messages non reçus

**Vérifier**:
1. Les 2 devices ont la même fréquence radio
2. Les 2 devices sont sur le même canal logique
3. Pour canal privé: même secret sur les 2 devices
4. Distance < portée radio (tester à courte distance d'abord)

### Problème: Latence très élevée (>5s)

**Causes possibles**:
- SF trop élevé (essayer SF9-10)
- Interférences radio
- Canal occupé (CAD retry)

### Problème: Connexion instable

**Vérifier**:
1. RSSI du BLE (doit être > -80 dBm)
2. Alimentation ESP32 (stable 3.3V)
3. Antenne LoRa correctement connectée

---

## 🔗 Fichiers Liés

| Fichier | Description |
|---------|-------------|
| `components/MeshDebugger.tsx` | Composant UI modal |
| `hooks/useMeshDiagnostics.ts` | Hook de diagnostics |
| `app/(tabs)/mesh/debug.tsx` | Écran debug dédié |
| `BROADCAST_FLOOD_FIX.md` | Doc correction broadcast |
| `CHANNEL_AND_FREQUENCY_GUIDE.md` | Doc canaux/fréquence |

---

**Auteur**: Silexperience  
**Version**: 1.0 - 25 Février 2026
