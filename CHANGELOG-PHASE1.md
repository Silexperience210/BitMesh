# 🔧 BitMesh - Phase 1 Critical Bug Fixes

**Release**: v1.0.1-ph1-critical  
**Date**: 24 Février 2026  
**Branch**: `release/ph1-critical-bugfix`  
**Tag**: `v1.0.1-ph1-critical`

---

## 🚨 Problèmes Corrigés

### 1. BLE Protocol Version (CRITIQUE)
**Fichier**: `utils/ble-gateway.ts`

- **Problème**: `APP_PROTOCOL_VERSION = 3` alors que le protocole officiel MeshCore Companion utilise la version **1**
- **Impact**: Connexion BLE échouée silencieusement, pas de réception de `RESP_SELF_INFO`
- **Fix**: Changé à `APP_PROTOCOL_VERSION = 1`

```typescript
// AVANT
const APP_PROTOCOL_VERSION = 3;

// APRÈS
const APP_PROTOCOL_VERSION = 1; // Version officielle du protocole MeshCore Companion
```

---

### 2. DataView Buffer Safety (CRITIQUE)
**Fichier**: `utils/ble-gateway.ts`

- **Problème**: DataView créés sans `byteOffset` pouvaient lire des données incorrectes si le payload était un sous-tableau
- **Impact**: Corruption de données potentielle lors du parsing des paquets
- **Fix**: Ajout systématique de `payload.byteOffset` et `payload.byteLength`

```typescript
// AVANT
new DataView(payload.buffer).setUint32(off, ts, true);

// APRÈS
new DataView(payload.buffer, payload.byteOffset).setUint32(off, ts, true);
```

---

### 3. Memory Leak dans Listeners BLE (CRITIQUE)
**Fichiers**: `providers/BleProvider.tsx`, `providers/MessagesProvider.ts`

- **Problème**: Les handlers BLE s'accumulaient à chaque re-render, jamais nettoyés
- **Impact**: Crash après plusieurs connexions/déconnexions, fuite mémoire
- **Fix**: 
  - Ajout de fonctions de cleanup retournées par `onPacket()` et `onBleMessage()`
  - Ajout des méthodes `offPacket()` et `offBleMessage()`
  - useEffect dans MessagesProvider stocke et appelle les fonctions de cleanup

```typescript
// Dans BleProvider - AVANT
const onPacket = (handler) => {
  clientRef.current?.onMessage(handler);
};

// Dans BleProvider - APRÈS
const onPacket = (handler): (() => void) => {
  clientRef.current?.onMessage(handler);
  return () => { clientRef.current?.onMessage(() => {}); }; // Cleanup
};

// Dans MessagesProvider - APRÈS
useEffect(() => {
  const unsubscribers: (() => void)[] = [];
  
  if (ble.connected && identity) {
    const unsubPacket = ble.onPacket(handleIncomingMeshCorePacket);
    unsubscribers.push(unsubPacket);
    
    const unsubBleMsg = ble.onBleMessage((msg) => { /* ... */ });
    unsubscribers.push(unsubBleMsg);
  }
  
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
}, [ble.connected, identity, handleIncomingMeshCorePacket]);
```

---

### 4. Sécurité - Logging Sensible (HAUTE)
**Fichier**: `utils/ble-gateway.ts`

- **Problème**: Données sensibles (public keys, noms de devices, contenus) loggées en production
- **Impact**: Fuite d'informations potentielle via logs système Android
- **Fix**: Protection avec `__DEV__` et masquage des données

```typescript
// AVANT
console.log(`[BleGateway] SelfInfo:`, { name, freq, sf, txPower });
console.log(`[BleGateway] PUSH_ADVERT: ${pubkeyPrefix}...`);

// APRÈS
if (__DEV__) console.log(`[BleGateway] SelfInfo:`, { 
  name: name.slice(0, 8) + '***', 
  freq, sf, txPower 
});
if (__DEV__) console.log(`[BleGateway] PUSH_ADVERT: ${pubkeyPrefix.slice(0, 6)}...`);
```

---

### 5. Documentation BLE_MAX_WRITE (MINEUR)
**Fichier**: `utils/ble-gateway.ts`

- **Changement**: Ajout de commentaire explicatif pour `BLE_MAX_WRITE = 182`
- **Valeur**: MTU 185 - 3 bytes overhead ATT = 182 bytes max

---

## 📊 Résumé des Modifications

| Fichier | Lignes modifiées | Type de changement |
|---------|------------------|-------------------|
| `utils/ble-gateway.ts` | +25/-10 | Protocol, DataView, Logging |
| `providers/BleProvider.tsx` | +20/-5 | API Cleanup functions |
| `providers/MessagesProvider.ts` | +10/-5 | useEffect cleanup |
| **Total** | **+55/-20** | **3 fichiers** |

---

## 🧪 Tests Requis avant Merge

### Tests BLE
- [ ] Connexion à un device MeshCore Companion
- [ ] Réception de `RESP_SELF_INFO` sous 3 secondes
- [ ] Envoi de message direct (DM)
- [ ] Envoi de message sur canal
- [ ] Réception de messages
- [ ] Déconnexion/reconnexion 5x sans crash

### Tests Mémoire
- [ ] Monitorer avec Android Studio Profiler
- [ ] Vérifier pas de fuite lors des reconnections

### Tests Sécurité
- [ ] Vérifier logs en mode release (pas de données sensibles)

---

## 🚀 Prochaines Phases

- **Phase 2**: Tests automatisés + CI/CD
- **Phase 3**: Refonte architecture Clean Architecture
- **Phase 4**: Features manquantes (backup, rotation clés)

---

## 👥 Contributeurs

- Architecte Senior: Analyse et corrections

---

**⚠️ IMPORTANT**: Cette release est une correction critique. Testez exhaustivement avant déploiement en production.
