# 📘 Intégration MeshCore Complète - Guide d'Installation

**Date**: 24 Février 2026  
**Version**: Protocole MeshCore v1.12.0+  
**Auteur**: Analyse complète du protocole

---

## 🎯 Vue d'ensemble

Cette intégration implémente **100% du protocole MeshCore Companion**:
- ✅ Toutes les commandes BLE (CMD_*)
- ✅ Toutes les réponses (RESP_*)
- ✅ Tous les push codes asynchrones (PUSH_*)
- ✅ Mode FLOOD (broadcast)
- ✅ Mode DIRECT (routage par path)
- ✅ Découverte de path
- ✅ Gestion des contacts avec index firmware
- ✅ Gestion des ACKs et confirmations
- ✅ File d'attente offline

---

## 📁 Fichiers créés

```
BitMesh-Phase1-Fix/
├── types/
│   └── meshcore.ts                    # Toutes les constantes et types
├── utils/
│   └── ble-gateway-complete.ts        # Gateway BLE complet
├── providers/
│   └── BleProvider-complete.tsx       # Provider React avec tous les hooks
├── app/(tabs)/mesh/
│   └── messaging-complete.tsx         # UI de test complète
└── docs/
    └── INTEGRATION_MESHCORE_COMPLETE.md  # Ce fichier
```

---

## 🚀 Installation

### Étape 1: Remplacer les fichiers existants

```bash
# Depuis la racine du projet
cp types/meshcore.ts types/index.ts  # ou utiliser meshcore.ts directement
```

### Étape 2: Mettre à jour les imports

Dans tes fichiers existants qui utilisaient l'ancien gateway, remplace:

```typescript
// AVANT
import { useBle } from '../providers/BleProvider';
import { BleGatewayClient } from '../utils/ble-gateway';

// APRÈS
import { useBle } from '../providers/BleProvider-complete';
import { BleGatewayComplete } from '../utils/ble-gateway-complete';
```

### Étape 3: Mettre à jour le provider racine

Dans `app/_layout.tsx` ou ton fichier root:

```tsx
import { BleProviderComplete } from '../providers/BleProvider-complete';

export default function RootLayout() {
  return (
    <BleProviderComplete>
      {/* Ton app */}
    </BleProviderComplete>
  );
}
```

### Étape 4: Ajouter la route de test

Dans `app/(tabs)/_layout.tsx`:

```tsx
<Tabs.Screen
  name="mesh/messaging-complete"
  options={{
    title: 'Messaging',
    tabBarIcon: ({ color }) => <FontAwesome5 name="comments" color={color} size={24} />,
  }}
/>
```

---

## 🔑 Concepts Critiques

### 1. Index Firmware (CRITIQUE)

```typescript
// ❌ FAUX - N'existe pas dans MeshCore
await gateway.sendDirectMessage(pubkeyPrefix, text);

// ✅ CORRECT - Utilise l'index firmware
const contact = gateway.getContactByPubkey(pubkeyHex);
await gateway.sendDirectMessage(contact.firmwareIndex, text);
```

Le firmware attribue un **index (0-99)** à chaque contact. Cet index est **obligatoire** pour envoyer des messages.

### 2. Synchronisation des Contacts

```typescript
// Au démarrage ou après ajout de contact
await ble.syncContacts();  // Récupère tous les contacts avec leurs index
```

### 3. Mode FLOOD vs DIRECT

```typescript
// FLOOD - Broadcast à tous (pas besoin de path)
await ble.sendFloodMessage("Hello everyone!");
await ble.sendChannelMessage(0, "Hello public channel!");

// DIRECT - Unicast à un contact connu (nécessite un path)
await ble.sendDirectMessage(pubkeyHex, "Hello you!");
// Le firmware choisit automatiquement DIRECT si path connu, sinon FLOOD
```

### 4. Confirmation d'envoi (ACK)

```typescript
// 1. Envoi du message
await ble.sendDirectMessage(contactIndex, "Hello");
// → Status: 'sending' puis 'sent' (accepté par firmware)

// 2. Le firmware transmet sur LoRa

// 3. L'ACK arrive via PUSH_SEND_CONFIRMED
// → Status: 'confirmed' avec RTT

// Dans le UI:
ble.pendingMessages.forEach(msg => {
  if (msg.status === 'confirmed') {
    console.log(`Livré en ${msg.rtt}ms!`);
  }
});
```

---

## 📋 API Complète

### Connexion

```typescript
// Scanner les devices
const devices = await ble.scanForDevices(5000);

// Connecter
await ble.connectToDevice(deviceId, deviceName);

// Déconnecter
await ble.disconnect();

// État
ble.connected: boolean
ble.device: BleDevice | null
ble.deviceInfo: DeviceInfo | null
```

### Contacts

```typescript
// Synchroniser tous les contacts
await ble.syncContacts();

// Ajouter un contact scanné
await ble.addContact(pubkeyHex, optionalName);

// Récupérer un contact
const contact = ble.getContactByPubkey(pubkeyHex);

// Liste des contacts
ble.meshContacts: MeshContact[]

// Structure d'un contact:
interface MeshContact {
  firmwareIndex: number;    // ← CRITIQUE pour l'envoi
  pubkeyHex: string;
  pubkeyPrefix: string;
  hash: string;             // 1er byte pour routage
  name: string;
  type: number;             // 0=chat, 1=repeater, 2=room, 3=sensor
  flags: number;
  outPathLen: number;       // 0 = pas de path (utilisera FLOOD)
  outPath: Uint8Array;      // Chemin vers ce contact
  lastAdvert: number;
  lastmod: number;
  gpsLat?: number;
  gpsLon?: number;
}
```

### Messages

```typescript
// Envoyer DM (nécessite contact synchronisé)
await ble.sendDirectMessage(pubkeyHex, text);

// Envoyer sur canal (0=public, 1-7=privés)
await ble.sendChannelMessage(0, text);

// Broadcast (alias canal 0)
await ble.sendFloodMessage(text);

// Messages reçus
ble.messages: MeshMessage[]

// Messages en cours d'envoi
ble.pendingMessages: PendingMessage[]
```

### Canaux

```typescript
// Info canal
const info = await ble.getChannelInfo(channelIndex);

// Configurer canal (si supporté par firmware)
await gateway.setChannel(index, name, secret);
```

### Logs et Debug

```typescript
// Logs
ble.logs: MeshLogEvent[]
ble.clearLogs()

// Stats
const stats = ble.getStats();
// {
//   framesSent, framesReceived,
//   messagesSent, messagesReceived,
//   pendingMessages, storedMessages, storedContacts
// }
```

---

## 🔄 Flux de données

### 1. Connexion initiale

```
App → CMD_APP_START(ver=1, ident="mccli")
     ← SELF_INFO(freq, sf, bw, cr, tx, ...)
     ← (optionnel) PUSH_ADVERT (si adverts en attente)
```

### 2. Synchronisation contacts

```
App → CMD_GET_CONTACTS(since=0)
     ← RESP_CONTACTS_START
     ← RESP_CONTACT × N (148 bytes chacun)
     ← RESP_END_OF_CONTACTS
```

### 3. Envoi message DM

```
App → CMD_SEND_TXT_MSG(contact_idx, txtType=0, attempt, timestamp, text)
     ← RESP_SEND_CONFIRMED (accepté par firmware)
     
     [Temps de transmission LoRa]
     
     ← PUSH_SEND_CONFIRMED(ack_code, round_trip_ms)
```

### 4. Réception message

```
     ← PUSH_MSG_WAITING (si app déconnectée pendant réception)

App → CMD_SYNC_NEXT_MESSAGE
     ← RESP_CONTACT_MSG_RECV_V3(contact_idx, path, timestamp, text)
     
     (répéter jusqu'à NO_MORE_MESSAGES)
```

### 5. Réception advert (nouveau nœud)

```
     ← PUSH_ADVERT(pubkey, timestamp, signature, appdata)
     
App → (optionnel) CMD_ADD_UPDATE_CONTACT pour ajouter le contact
```

---

## 🧪 Tests recommandés

### Test 1: Connexion de base

```typescript
// Dans un composant de test
const TestConnection = () => {
  const ble = useBle();
  
  const runTest = async () => {
    // 1. Scanner
    const devices = await ble.scanForDevices(5000);
    console.log('Devices:', devices);
    
    // 2. Connecter
    if (devices.length > 0) {
      await ble.connectToDevice(devices[0].id);
      
      // 3. Vérifier deviceInfo
      console.log('Device info:', ble.deviceInfo);
    }
  };
  
  return <Button onPress={runTest} title="Test Connection" />;
};
```

### Test 2: Synchronisation contacts

```typescript
const TestContacts = () => {
  const ble = useBle();
  
  const runTest = async () => {
    await ble.syncContacts();
    console.log(`${ble.meshContacts.length} contacts synced`);
    
    ble.meshContacts.forEach(c => {
      console.log(`#${c.firmwareIndex}: ${c.name} (${c.outPathLen} hops)`);
    });
  };
  
  return <Button onPress={runTest} title="Sync Contacts" />;
};
```

### Test 3: Envoi/réception message

```typescript
const TestMessaging = () => {
  const ble = useBle();
  const [received, setReceived] = useState<MeshMessage[]>([]);
  
  useEffect(() => {
    // Écouter les messages reçus
    const interval = setInterval(() => {
      setReceived([...ble.messages]);
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  
  const sendTest = async () => {
    // Envoyer à un contact connu
    if (ble.meshContacts.length > 0) {
      await ble.sendDirectMessage(
        ble.meshContacts[0].pubkeyHex,
        "Test message " + Date.now()
      );
    }
  };
  
  return (
    <View>
      <Button onPress={sendTest} title="Send Test" />
      <Text>Received: {received.length}</Text>
      {received.map((m, i) => (
        <Text key={i}>{m.text}</Text>
      ))}
    </View>
  );
};
```

---

## 🚨 Résolution des problèmes

### "Contact non synchronisé"

**Cause**: Tu essaies d'envoyer à un contact sans `firmwareIndex`  
**Solution**: 
```typescript
await ble.syncContacts();
// OU
await ble.addContact(pubkeyHex, name);
await ble.syncContacts();  // Pour obtenir l'index attribué
```

### "Message non confirmé"

**Cause**: Pas d'ACK reçu du destinataire  
**Vérifications**:
1. Le destinataire est-il en ligne ?
2. Le path est-il valide ? (reset avec `gateway.resetPath(index)`)
3. Essayer en mode FLOOD plutôt que DIRECT

### "Timeout récupération contacts"

**Cause**: Connexion BLE instable ou firmware occupé  
**Solutions**:
1. Déconnecter/reconnecter
2. Redémarrer l'app
3. Vérifier les logs

### "Table pleine"

**Cause**: Limite de 100 contacts atteinte  
**Solution**: Supprimer des contacts ou utiliser `CONTACT_FLAGS.IS_FAVOURITE` pour protéger les importants

---

## 📊 Limites du système

| Ressource | Limite | Note |
|-----------|--------|------|
| Contacts | 100 | Max stockés dans le firmware |
| Message | ~150 caractères | Après overhead chiffrement |
| Path | 64 sauts | Max hops dans un path |
| Offline queue | 16 messages | File d'attente BLE |
| ACK timeout (FLOOD) | 32s | Max attente confirmation |
| ACK timeout (DIRECT) | 10s + path | Dépend du nombre de sauts |

---

## 🔗 Références

- **Documentation MeshCore**: https://github.com/meshcore-dev/MeshCore
- **Analyse protocole**: `MeshCore_Analysis_Report.md`
- **Plan d'action**: `ACTION_PLAN_MESSAGING.md`

---

## ✅ Checklist de validation

- [ ] Connexion BLE établie
- [ ] SELF_INFO reçu avec paramètres radio
- [ ] Synchronisation contacts réussie
- [ ] Envoi message DM → RESP_SEND_CONFIRMED reçu
- [ ] Réception PUSH_SEND_CONFIRMED avec RTT
- [ ] Réception message (mode FLOOD)
- [ ] Réception PUSH_ADVERT (si nœuds à proximité)
- [ ] Récupération messages offline (si disponibles)
- [ ] Reconnexion automatique fonctionnelle
- [ ] UI affiche correctement les statuts

---

**Prochaines étapes**: 
1. Tester l'écran `messaging-complete.tsx`
2. Intégrer les composants dans tes écrans existants
3. Personnaliser l'UI selon tes besoins

Des questions ? Consulte les logs avec `ble.logs` ou active `__DEV__` pour voir les logs console.
