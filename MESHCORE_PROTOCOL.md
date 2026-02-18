# MeshCore Protocol Specification v1.0

## Vue d'ensemble

**MeshCore** est un protocole de communication décentralisé pour réseaux mesh utilisant LoRa (longue portée) et MQTT (Internet) comme couches de transport. Il permet la messagerie P2P chiffrée avec routage multi-hop automatique.

### Caractéristiques

- **Multi-transport** : LoRa (868/915 MHz) + MQTT (WebSocket TLS)
- **Multi-hop routing** : Messages relayés automatiquement entre peers
- **Chiffrement E2E** : ECDH (secp256k1) + AES-GCM-256
- **Auto-discovery** : Peers annoncent leur présence via MQTT retained messages
- **Résilient** : TTL, deduplication, routage alternatif

---

## Architecture

```
┌─────────────┐      LoRa/MQTT       ┌─────────────┐
│   Node A    │◄────────────────────►│   Node B    │
│ (MESH-A7F2) │                      │ (MESH-B8E3) │
└─────────────┘                      └─────────────┘
       │                                     │
       │ LoRa                          LoRa │
       │                                     │
       ▼                                     ▼
┌─────────────┐      MQTT broker      ┌─────────────┐
│  Gateway 1  │◄────────────────────►│  Gateway 2  │
│ (ESP32+LoRa)│                      │ (ESP32+LoRa)│
└─────────────┘                      └─────────────┘
       │                                     │
       └─────────────────┬───────────────────┘
                         │
                  ┌──────▼──────┐
                  │ MQTT Broker │
                  │   (TLS/WS)  │
                  └─────────────┘
```

---

## Identité Nœud

Chaque nœud possède une identité unique dérivée de son wallet Bitcoin seed (BIP32).

### Dérivation

```
Seed (BIP39 12/24 mots)
  └─ m/69'/0'/0'/0 (MeshCore Identity Path)
       ├─ privkey: secp256k1 (32 bytes)
       ├─ pubkey: compressed (33 bytes)
       └─ nodeId: "MESH-" + hex(sha256(pubkey)[0:4])
```

### Exemple

```typescript
Seed: "abandon abandon abandon ... art"
Private key: 0x1234abcd...
Public key: 0x02a1b2c3d4...
SHA256(pubkey): 0xa7f29e1b3c4d...
NodeId: "MESH-A7F2"
```

---

## Topics MQTT

| Topic | QoS | Retained | Description |
|-------|-----|----------|-------------|
| `meshcore/identity/{nodeId}` | 1 | ✅ | Présence + pubkey + GPS (last will) |
| `meshcore/dm/{nodeId}` | 1 | ❌ | Messages directs chiffrés (ECDH) |
| `meshcore/forum/{channelId}` | 0 | ❌ | Forums/groupes (clé symétrique) |
| `meshcore/lora/outbound` | 0 | ❌ | Messages sortants vers gateway LoRa |
| `meshcore/lora/inbound` | 0 | ❌ | Messages entrants depuis gateway LoRa |
| `meshcore/route/{nodeId}` | 0 | ❌ | Messages multi-hop routés vers nodeId |

### Last Will (déconnexion)

Chaque client MQTT configure un **last will** sur `meshcore/identity/{nodeId}` :

```json
{
  "nodeId": "MESH-A7F2",
  "pubkeyHex": "02a1b2c3d4...",
  "online": false,
  "ts": 1234567890123
}
```

Si le client se déconnecte brutalement, le broker publie automatiquement ce message (retained) → tous les pairs savent que le nœud est offline.

---

## Format de Message

### Message Wire Format (MQTT payload)

```json
{
  "v": 1,
  "msgId": "uuid-v4",
  "from": "MESH-A7F2",
  "to": "MESH-B8E3",
  "fromPubkey": "02a1b2c3d4...",
  "enc": {
    "nonce": "base64_nonce_12_bytes",
    "ct": "base64_ciphertext"
  },
  "ts": 1234567890123,
  "type": "text" | "cashu" | "btc_tx",
  "ttl": 10,
  "hopCount": 0,
  "route": ["MESH-A7F2"]
}
```

### Champs

| Champ | Type | Description |
|-------|------|-------------|
| `v` | number | Version protocole (actuel: 1) |
| `msgId` | string | UUID unique (deduplication) |
| `from` | string | NodeId expéditeur |
| `to` | string | NodeId destinataire (ou "broadcast" pour forums) |
| `fromPubkey` | string | Pubkey expéditeur (hex compressed) |
| `enc.nonce` | string | Nonce AES-GCM (12 bytes base64) |
| `enc.ct` | string | Ciphertext AES-GCM (base64) |
| `ts` | number | Timestamp Unix (ms) |
| `type` | string | Type de message |
| `ttl` | number | Time-to-live (max hops restants) |
| `hopCount` | number | Nombre de hops déjà effectués |
| `route` | string[] | Chemin parcouru (nodeIds) |

---

## Chiffrement

### DM (Direct Message) — ECDH

**Expéditeur** :
```typescript
sharedSecret = ECDH(myPrivkey, theirPubkey)
key = sha256(sharedSecret)
nonce = random(12 bytes)
plaintext = JSON.stringify({ text: "Hello", ... })
ciphertext = AES-GCM-256(plaintext, key, nonce)
```

**Destinataire** :
```typescript
sharedSecret = ECDH(myPrivkey, senderPubkey)
key = sha256(sharedSecret)
plaintext = AES-GCM-256-decrypt(ciphertext, key, nonce)
message = JSON.parse(plaintext)
```

### Forum (Channel) — Clé Symétrique

Tous les participants connaissent le nom du channel → clé dérivée :

```typescript
key = sha256("forum:" + channelName)
nonce = random(12 bytes)
ciphertext = AES-GCM-256(plaintext, key, nonce)
```

---

## Multi-Hop Routing

### Principe

Quand un nœud A veut envoyer un message à B mais B n'est pas un voisin direct (hors portée LoRa/MQTT), le message est **relayé** par des nœuds intermédiaires.

### Algorithme : Flood Routing avec TTL

1. **Envoi initial** :
   - A envoie message avec `ttl=10`, `hopCount=0`, `route=["MESH-A7F2"]`
   - Publie sur `meshcore/route/MESH-B8E3` (topic du destinataire)

2. **Réception par nœud intermédiaire C** :
   - C vérifie `msgId` → si déjà vu, DROP (deduplication)
   - C vérifie `ttl > 0` → sinon DROP
   - C vérifie `to === myNodeId` → si oui, déchiffre et affiche
   - Sinon : C est un **relay node**
     - Décrémente `ttl -= 1`
     - Incrémente `hopCount += 1`
     - Ajoute son nodeId à `route`: `["MESH-A7F2", "MESH-C9F4"]`
     - Rebroadcast sur `meshcore/route/MESH-B8E3`

3. **Réception par destinataire B** :
   - B reçoit le message (via C)
   - `to === myNodeId` → déchiffre et affiche
   - Optionnel : envoie ACK vers A (via route inverse)

### Deduplication

Chaque nœud maintient un cache des `msgId` vus (avec timestamp) :

```typescript
seenMessages: Map<msgId, timestamp>
```

- Entrées expirées après 5 minutes (cleanup périodique)
- Si `msgId` déjà présent → DROP sans rebroadcast

### TTL (Time-To-Live)

- **Valeur initiale** : `ttl = 10` (max 10 hops)
- À chaque relay : `ttl -= 1`
- Si `ttl === 0` → DROP (évite flood infini)

### Route Path

Le champ `route` contient le chemin parcouru :

```json
"route": ["MESH-A7F2", "MESH-C9F4", "MESH-D1E5"]
```

Utile pour :
- Debugging (voir le chemin du message)
- Route inverse pour ACK
- Métriques (hop count, latency)

---

## Chunking LoRa (messages >240 bytes)

Les messages LoRa sont limités à **240 bytes** par paquet. Les messages plus longs sont fragmentés.

### Format Chunk

```
MCHK|{messageId}|{chunkIndex}|{totalChunks}|{payload}
```

### Exemple

Message 800 bytes → 4 chunks :

```
MCHK|abc123|0|4|<200 bytes payload>
MCHK|abc123|1|4|<200 bytes payload>
MCHK|abc123|2|4|<200 bytes payload>
MCHK|abc123|3|4|<200 bytes payload>
```

### Reassembly

Le récepteur maintient un buffer par `messageId` :

```typescript
chunkBuffers: Map<messageId, {
  chunks: string[],
  received: Set<number>,
  totalChunks: number,
  timestamp: number
}>
```

- Quand `received.size === totalChunks` → reassemble et traite le message complet
- Timeout 30s : si tous les chunks pas reçus → DROP

---

## BLE Gateway (ESP32)

### Service UUID

```
Service UUID: 6e400001-b5a3-f393-e0a9-e50e24dcca9e (Nordic UART)
```

### Characteristics

| UUID | Propriété | Description |
|------|-----------|-------------|
| `6e400002-...` | WRITE | TX (mobile → ESP32) |
| `6e400003-...` | NOTIFY | RX (ESP32 → mobile) |

### Workflow

**Mobile → ESP32 (envoi message)** :
1. Mobile écrit sur characteristic TX
2. ESP32 reçoit via BLE
3. ESP32 transmet via LoRa (si destinataire LoRa) OU via MQTT

**ESP32 → Mobile (réception message)** :
1. ESP32 reçoit via LoRa (ou MQTT)
2. ESP32 notify sur characteristic RX
3. Mobile reçoit via BLE

---

## Exemples de Flux

### 1. DM Direct (même réseau MQTT)

```
Alice (MQTT) → Broker → Bob (MQTT)
- Latency: ~50-200ms
- 1 hop
```

### 2. DM via Gateway LoRa

```
Alice (BLE) → Gateway A (LoRa) → Gateway B (LoRa) → Bob (BLE)
- Latency: ~1-3s (LoRa airtime)
- 1 hop LoRa
```

### 3. Multi-Hop (3 nœuds)

```
Alice → MQTT → Carol (relay) → MQTT → Bob
- Latency: ~100-400ms
- 2 hops MQTT
```

### 4. Multi-Hop LoRa + MQTT

```
Alice (LoRa) → Gateway A → MQTT → Carol (relay) → MQTT → Gateway B → LoRa → Bob
- Latency: ~2-5s
- 3 hops (LoRa → MQTT → LoRa)
```

---

## Gestion d'Erreurs

### Message perdu (LoRa interference)

- **ACK timeout** : Expéditeur retransmet après 5s si pas d'ACK
- **Max retries** : 3 tentatives max
- **Feedback UI** : "Message non livré" après 3 échecs

### Nœud relay offline

- **Route alternative** : Flood routing essaie tous les voisins
- **TTL prevents** : Boucles infinies (max 10 hops)

### Duplication messages

- **Deduplication** : Cache `msgId` vu (5 min TTL)
- **Idempotence** : Affichage message vérifie ID unique

---

## Métriques & Analytics

### Routing Table

Chaque nœud maintient une table des voisins :

```typescript
neighbors: Map<nodeId, {
  lastSeen: number,
  rssi: number,       // Signal strength (LoRa) ou latency (MQTT)
  hopCount: number,   // Distance en hops (1 = direct neighbor)
  via: string[]       // Chemin pour atteindre ce nœud
}>
```

### Métriques collectées

- **Messages sent/received** : Compteurs par type
- **Hop count distribution** : Histogramme (1-hop: 70%, 2-hop: 20%, 3+: 10%)
- **Average latency** : Par transport (MQTT: ~100ms, LoRa: ~2s)
- **Relay success rate** : % messages relayés avec succès

---

## Sécurité

### Menaces

1. **Eavesdropping** : Attaquant écoute LoRa/MQTT
   - **Mitigation** : Chiffrement E2E (ECDH + AES-GCM)

2. **Replay attack** : Attaquant rejoue ancien message
   - **Mitigation** : Timestamp + deduplication (`msgId`)

3. **Flood attack** : Attaquant envoie 1000 messages/s
   - **Mitigation** : Rate limiting (max 10 msg/s par nodeId)

4. **TTL exhaustion** : Attaquant met `ttl=255`
   - **Mitigation** : Max TTL=10 forcé par code

### Authentification

- **Signature optionnelle** : ECDSA(privkey, msgId + ts)
  - Vérifie que l'expéditeur possède bien la privkey correspondant à `fromPubkey`
  - Non implémenté dans v1.0 (overhead LoRa)

---

## Roadmap

### v1.1 (Q3 2026)

- ACK messages (confirmation livraison)
- DSR routing (Dynamic Source Routing) pour optimiser chemins
- Route caching (mémoriser les bons chemins)

### v1.2 (Q4 2026)

- Signature ECDSA optionnelle (auth)
- Compression zlib pour messages longs
- Multi-channel LoRa (fréquences alternatives)

### v2.0 (2027)

- Quantum-resistant crypto (post-quantum KEM)
- Mesh VPN (tunnel IP over LoRa)
- Satellite uplink (Blockstream Satellite)

---

## Conformité

**MeshCore Protocol v1.0** est compatible avec :

- **Meshtastic** : Via plugin MQTT (partiel)
- **LoRaMesh** : Via format JSON standard
- **Nostr** : Via NIP-44 (chiffrement) + relais MQTT

---

## Auteur

**Silexperience**
Spécification v1.0 — Février 2026
Licence : MIT

---

## Références

- [LoRa Alliance](https://lora-alliance.org/)
- [MQTT v5 Specification](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html)
- [BIP32 HD Wallets](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki)
- [AES-GCM NIST](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
- [ECDH Curve secp256k1](https://www.secg.org/sec2-v2.pdf)
