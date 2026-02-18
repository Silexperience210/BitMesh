# 🔍 Guide : Découverte de Forums via MQTT

## 📋 Vue d'ensemble

Cette fonctionnalité permet aux utilisateurs de BitMesh de :
1. **Annoncer publiquement** un forum sur le réseau MQTT
2. **Découvrir automatiquement** les forums annoncés par d'autres utilisateurs
3. **Rejoindre** ces forums en un clic

---

## 🏗️ Architecture

### Topic MQTT

```
Topic: meshcore/forums/announce
QoS: 0 (performance)
Retain: false (pas de pollution du réseau)
```

### Format de Message

```json
{
  "channelName": "bitcoin-paris",
  "description": "Discussions Bitcoin à Paris",
  "creatorNodeId": "MESH-A7F2",
  "creatorPubkey": "02abcd1234...",
  "ts": 1708281600000,
  "isPublic": true
}
```

---

## 🚀 Utilisation

### 1. Créer et Annoncer un Forum

```typescript
import { useMessages } from '@/providers/MessagesProvider';

function MyComponent() {
  const { announceForumPublic, joinForum } = useMessages();

  const createPublicForum = async () => {
    const channelName = 'bitcoin-paris';
    const description = 'Discussions Bitcoin à Paris';

    // 1. Rejoindre le forum localement
    await joinForum(channelName, description);

    // 2. Annoncer publiquement sur MQTT
    announceForumPublic(channelName, description);

    console.log('Forum créé et annoncé!');
  };

  return (
    <Button onPress={createPublicForum}>
      Créer un forum public
    </Button>
  );
}
```

### 2. Découvrir les Forums

```typescript
import { useMessages } from '@/providers/MessagesProvider';

function ForumsList() {
  const { discoveredForums } = useMessages();

  return (
    <View>
      <Text>Forums découverts : {discoveredForums.length}</Text>
      {discoveredForums.map(forum => (
        <View key={forum.channelName}>
          <Text>#{forum.channelName}</Text>
          <Text>{forum.description}</Text>
          <Text>Par {forum.creatorNodeId}</Text>
        </View>
      ))}
    </View>
  );
}
```

### 3. Rejoindre un Forum Découvert

```typescript
function ForumItem({ forum }: { forum: ForumAnnouncement }) {
  const { joinForum } = useMessages();

  const handleJoin = async () => {
    await joinForum(forum.channelName, forum.description);
    Alert.alert('Rejoint!', `Vous avez rejoint #${forum.channelName}`);
  };

  return (
    <TouchableOpacity onPress={handleJoin}>
      <Text>#{forum.channelName}</Text>
      <Text>{forum.description}</Text>
    </TouchableOpacity>
  );
}
```

---

## 🔄 Flux Complet

```
┌─────────────────────────────────────────────────┐
│           User A (Créateur de forum)            │
│                                                 │
│  1. Crée forum "bitcoin-paris"                  │
│  2. joinForum("bitcoin-paris", "Disc. BTC")     │
│  3. announceForumPublic(...)                    │
│     └─> MQTT publish(meshcore/forums/announce) │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
               ┌───────────────┐
               │  MQTT Broker  │
               │ (WebSocket)   │
               └───────┬───────┘
                       │
                       ▼ (broadcast)
       ┌───────────────┴───────────────┐
       │                               │
┌──────▼──────┐               ┌───────▼──────┐
│   User B    │               │   User C     │
│             │               │              │
│ Subscribe   │               │ Subscribe    │
│ forums/ann. │               │ forums/ann.  │
│             │               │              │
│ Reçoit:     │               │ Reçoit:      │
│ {           │               │ {            │
│  channel:   │               │  channel:    │
│  "bitcoin-  │               │  "bitcoin-   │
│   paris",   │               │   paris",    │
│  ...        │               │  ...         │
│ }           │               │ }            │
│             │               │              │
│ discoveredF │               │ discoveredF  │
│ orums +=    │               │ orums +=     │
│ forum       │               │ forum        │
│             │               │              │
│ User clique │               │ User clique  │
│ "Rejoindre" │               │ "Rejoindre"  │
│             │               │              │
│ joinForum() │               │ joinForum()  │
└─────────────┘               └──────────────┘
```

---

## 📝 API Reference

### MessagesProvider

#### `announceForumPublic(channelName: string, description: string): void`

Annonce un forum publiquement sur le réseau MQTT.

**Paramètres:**
- `channelName` : Nom du canal (ex: "bitcoin-paris")
- `description` : Description du forum

**Exemple:**
```typescript
announceForumPublic('bitcoin-paris', 'Discussions Bitcoin à Paris');
```

#### `discoveredForums: ForumAnnouncement[]`

État contenant la liste des forums découverts via MQTT.

**Type:**
```typescript
interface ForumAnnouncement {
  channelName: string;
  description: string;
  creatorNodeId: string;
  creatorPubkey: string;
  ts: number;
  isPublic: boolean;
}
```

**Exemple:**
```typescript
const { discoveredForums } = useMessages();
console.log(`${discoveredForums.length} forums découverts`);
```

#### `joinForum(channelName: string, description?: string): Promise<void>`

Rejoint un forum (localement + MQTT).

**Paramètres:**
- `channelName` : Nom du canal
- `description` (optionnel) : Description pour affichage local

**Exemple:**
```typescript
await joinForum('bitcoin-paris', 'Discussions BTC');
```

---

## 🔧 Fonctions MQTT (mqtt-client.ts)

### `announceForumChannel()`

```typescript
function announceForumChannel(
  instance: MeshMqttClient,
  channelName: string,
  description: string,
  creatorPubkey: string,
  isPublic: boolean = true
): void
```

Publie une annonce de forum sur `meshcore/forums/announce`.

### `subscribeForumAnnouncements()`

```typescript
function subscribeForumAnnouncements(
  instance: MeshMqttClient,
  handler: (announcement: ForumAnnouncement) => void
): void
```

S'abonne aux annonces de forums et appelle le handler pour chaque nouvelle annonce.

### `unsubscribeForumAnnouncements()`

```typescript
function unsubscribeForumAnnouncements(
  instance: MeshMqttClient
): void
```

Se désabonne des annonces de forums.

---

## 🎨 Composant UI (Exemple)

Un composant complet est disponible dans **`FORUM_DISCOVERY_EXAMPLE.tsx`**.

Il contient :
- ✅ Formulaire de création de forum
- ✅ Annonce automatique sur MQTT
- ✅ Liste des forums découverts
- ✅ Bouton "Rejoindre" pour chaque forum

**Intégration:**

```typescript
// Dans app/(tabs)/(messages)/index.tsx
import ForumDiscoveryScreen from '@/FORUM_DISCOVERY_EXAMPLE';

// Ajouter un bouton ou modal pour afficher ForumDiscoveryScreen
```

---

## 🧪 Test de la Fonctionnalité

### Test 1: Créer et Annoncer un Forum

```bash
1. Lancez l'app BitMesh
2. Assurez-vous d'être connecté au MQTT (state = 'connected')
3. Créez un forum:
   - Nom: "test-forum"
   - Description: "Forum de test"
4. Appelez announceForumPublic("test-forum", "Forum de test")
5. ✅ Vérifiez les logs: "[MQTT] Forum annoncé: test-forum"
```

### Test 2: Découvrir un Forum (2 appareils)

```bash
Device A:
1. Créez un forum "bitcoin-lightning"
2. Annoncez-le publiquement

Device B:
1. Connectez-vous au même broker MQTT
2. ✅ Le forum "bitcoin-lightning" apparaît dans discoveredForums[]
3. Cliquez "Rejoindre"
4. ✅ Le forum est ajouté à vos conversations
```

### Test 3: Vérifier le Topic MQTT

Avec un client MQTT (ex: MQTT Explorer):

```bash
1. Connectez-vous à wss://broker.emqx.io:8084/mqtt
2. Souscrivez à: meshcore/forums/announce
3. Depuis l'app, créez un forum
4. ✅ Vous recevez le message JSON:
   {
     "channelName": "test",
     "description": "...",
     "creatorNodeId": "MESH-XXX",
     ...
   }
```

---

## 🔒 Sécurité & Confidentialité

### Forums Publics
- ✅ **Découverte ouverte** : Tout le monde peut voir les forums annoncés
- ✅ **Chiffrement des messages** : Les messages dans le forum restent chiffrés avec clé dérivée du nom
- ⚠️ **Spam possible** : Pas de modération des annonces

### Forums Privés

Pour un forum privé (non annoncé) :
```typescript
// Ne PAS appeler announceForumPublic()
// Partager le nom du forum hors-bande (DM, QR code, etc.)
await joinForum('mon-forum-prive');
```

---

## 🚀 Améliorations Futures

### V1.1 (Court terme)
- [ ] Filtrage par catégorie (Bitcoin, Lightning, Cashu, etc.)
- [ ] Recherche de forums par mot-clé
- [ ] Limite du nombre d'annonces stockées (actuellement 50)

### V1.2 (Moyen terme)
- [ ] Nombre de membres dans le forum
- [ ] Dernière activité (timestamp dernier message)
- [ ] Modération décentralisée (vote pour bannir)

### V2.0 (Long terme)
- [ ] Forums avec invitation (whitelist)
- [ ] Multi-administrateurs (signatures multiples)
- [ ] Intégration Nostr (NIP-28 : Channels)

---

## 🐛 Troubleshooting

### Les forums n'apparaissent pas

**Causes possibles:**
1. Non connecté au MQTT
   - ✅ Vérifiez: `mqttState === 'connected'`
2. Pas de forums annoncés sur le réseau
   - ✅ Créez un forum de test
3. Handler non enregistré
   - ✅ Vérifiez les logs: `[MQTT] Abonné aux annonces de forums`

**Solution:**
```typescript
const { mqttState } = useMessages();
console.log('MQTT state:', mqttState); // Doit être 'connected'
```

### Les annonces se dupliquent

**Cause:** Le même forum est annoncé plusieurs fois.

**Solution:** Le code filtre déjà les doublons (ligne `exists` dans `handleForumAnnouncement`).

Si le problème persiste, ajouter une déduplication par timestamp:
```typescript
const exists = prev.find(f =>
  f.channelName === announcement.channelName &&
  Math.abs(f.ts - announcement.ts) < 60000 // < 1 minute
);
```

---

## 📚 Ressources

- **Fichiers modifiés:**
  - `utils/mqtt-client.ts` - Fonctions MQTT
  - `providers/MessagesProvider.ts` - Intégration dans l'app
  - `FORUM_DISCOVERY_EXAMPLE.tsx` - Composant UI exemple

- **Documentation MQTT:**
  - Broker: https://www.emqx.io/
  - MQTT v5: https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html

- **Protocole MeshCore:**
  - `MESHCORE_PROTOCOL.md` - Spécifications complètes

---

## ✅ Checklist d'Intégration

- [x] Ajouter topic `forumsAnnounce` dans TOPICS
- [x] Créer fonction `announceForumChannel()`
- [x] Créer fonction `subscribeForumAnnouncements()`
- [x] Ajouter état `discoveredForums` dans MessagesProvider
- [x] Ajouter fonction `announceForumPublic()` dans MessagesProvider
- [x] Handler `handleForumAnnouncement()` avec déduplication
- [x] S'abonner aux annonces dans `connect()`
- [x] Exporter `ForumAnnouncement` type
- [x] Documenter l'API
- [x] Créer composant UI exemple
- [ ] Intégrer le composant dans l'app (TODO par l'utilisateur)
- [ ] Tester avec 2+ appareils
- [ ] Déployer sur production

---

**Dernière mise à jour:** 18 Février 2026
**Version:** 1.0.0-beta
**Auteur:** Claude Code AI Assistant
