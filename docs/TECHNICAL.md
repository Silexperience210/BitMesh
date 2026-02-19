# Documentation Technique - BitMesh Extensions

## Room Server Configuration

### Overview
Les Room Servers sont des nœuds BBS (Bulletin Board System) dans le réseau MeshCore. Ils permettent de créer des forums publics persistants accessibles via LoRa.

### AT Commands Supportés

| Commande | Description | Exemple |
|----------|-------------|---------|
| `AT+INFO` | Récupère les infos du device | `AT+INFO` → `RoomServer v1.2` |
| `AT+NAME=<name>` | Définit le nom du forum | `AT+NAME=MonForum` |
| `AT+MAXPEERS=<n>` | Limite le nombre de pairs | `AT+MAXPEERS=50` |
| `AT+WELCOME=<msg>` | Message de bienvenue | `AT+WELCOME=Bienvenue!` |
| `AT+AUTH=<0/1>` | Active/désactive l'auth | `AT+AUTH=1` |
| `AT+STATUS` | Récupère le statut | `AT+STATUS` → `online,peers:5,...` |
| `AT+POSTS` | Liste les posts | `AT+POSTS` → JSON ou texte |
| `AT+DELPOST=<id>` | Supprime un post | `AT+DELPOST=abc123` |
| `AT+REBOOT` | Redémarre le device | `AT+REBOOT` |
| `AT+FACTORY` | Reset factory | `AT+FACTORY` |

### Format de Réponse STATUS
```
STATUS:online,peers:5,messages:42,uptime:3600
```

### Format de Réponse POSTS (JSON)
```json
[
  {
    "id": "abc123",
    "author": "pubkey...",
    "content": "Hello world",
    "timestamp": 1708387200,
    "signature": "sig..."
  }
]
```

### Format de Réponse POSTS (Texte)
```
abc123|pubkey...|Hello world|1708387200|sig...
def456|pubkey...|Another post|1708387201|sig...
```

---

## Repeater Configuration

### Overview
Les Repeaters étendent la portée du réseau en relayant les messages entre nœuds. Ils peuvent fonctionner en mode bridge pour connecter différentes zones.

### AT Commands Supportés

| Commande | Description | Exemple |
|----------|-------------|---------|
| `AT+INFO` | Récupère les infos | `AT+INFO` |
| `AT+NAME=<name>` | Nom du repeater | `AT+NAME=RPT-01` |
| `AT+MAXHOPS=<n>` | Max hops à relayer | `AT+MAXHOPS=5` |
| `AT+DIRECT=<0/1>` | Forward direct only | `AT+DIRECT=0` |
| `AT+FILTER=<0/1>` | Filter by path quality | `AT+FILTER=1` |
| `AT+MINRSSI=<dbm>` | RSSI minimum | `AT+MINRSSI=-100` |
| `AT+TRANSPORT=<code>` | Code de transport | `AT+TRANSPORT=ZONE_A` |
| `AT+BRIDGE=<0/1>` | Mode bridge | `AT+BRIDGE=1` |
| `AT+STATUS` | Statut du repeater | `AT+STATUS` |
| `AT+NEIGHBORS` | Liste des voisins | `AT+NEIGHBORS` |
| `AT+STATS` | Statistiques | `AT+STATS` |
| `AT+RESETSTATS` | Reset stats | `AT+RESETSTATS` |
| `AT+REBOOT` | Redémarrer | `AT+REBOOT` |
| `AT+FACTORY` | Reset factory | `AT+FACTORY` |

### Format de Réponse STATUS
```
STATUS:online,relayed:1234,dropped:56,rssi:-85,uptime:7200
```

### Format de Réponse NEIGHBORS (JSON)
```json
[
  {
    "nodeId": "abc...",
    "rssi": -75,
    "lastSeen": 1708387200,
    "hops": 2
  }
]
```

### Format de Réponse STATS (JSON)
```json
{
  "totalRelayed": 1234,
  "totalDropped": 56,
  "byHour": [45, 52, 38, 41, ...]
}
```

---

## LZW Compression

### Overview
Compression LZW pour réduire la taille des messages sur LoRa. Gain typique: 30-50% sur texte.

### Algorithme
- Dictionnaire initial: 256 caractères ASCII
- Taille max: 4096 entrées (12 bits)
- Encodage: 12 bits par code, packé en bytes
- Header: `LZ` pour identifier

### API

```typescript
// Compresser
const result = compressMeshCoreMessage(texteLong);
// { compressed: 'LZ...', originalSize: 500, compressedSize: 300, ratio: 0.4 }

// Décompresser
const original = decompressMeshCoreMessage('LZ...');

// Vérifier si bénéfique
if (shouldCompress(texte)) {
  // Compresser
}
```

### Performance
- Messages < 100 caractères: pas de compression
- Seuil de compression: gain > 20%
- Complexité: O(n)

---

## Sub-meshes

### Overview
Segmentation du réseau en sous-réseaux logiques. Chaque sub-mesh a son propre ID (16 bits).

### IDs Réservés
- `0x0000`: Réseau principal (défaut)
- `0x0001-0x00FF`: Sub-meshes système
- `0x0100-0xFFFF`: Sub-meshes utilisateur

### Hiérarchie
```
0x0000 (Principal)
├── 0x0100 (Zone A)
│   ├── 0x0101 (Sous-zone A1)
│   └── 0x0102 (Sous-zone A2)
└── 0x0200 (Zone B)
```

### Code d'Invitation
Format base64 contenant:
```json
{
  "id": "0x0100",
  "name": "Zone A",
  "color": "#FF0000",
  "maxHops": 5
}
```

### Bridges
Les bridges sont des nœuds qui relient plusieurs sub-meshes. Ils ont `isBridge: true`.

---

## Intégration MeshCore Protocol

### Packet Structure avec Sub-mesh
```
[Header: 8 bytes]
[Sub-mesh ID: 2 bytes]  ← NEW
[Payload: variable]
[Signature: 64 bytes]
```

### Flags
- Bit 0: Encrypted
- Bit 1: Compressed (LZW)
- Bit 2: Multi-hop
- Bit 3: Ack requested
- Bit 4-7: Reserved

### Type de Messages
| Type | Code | Description |
|------|------|-------------|
| TEXT | 0x01 | Message texte |
| ACK | 0x02 | Accusé réception |
| PING | 0x03 | Heartbeat |
| ANNOUNCE | 0x04 | Annonce nœud |
| DIRECT | 0x05 | Message direct |
| ROOM_POST | 0x10 | Post sur Room Server |
| ROOM_JOIN | 0x11 | Rejoindre Room |

---

## Notes d'Implémentation

### USB Serial
- Baud rate: 115200
- Data bits: 8
- Stop bits: 1
- Parity: None
- Timeout: 5 secondes

### AT Command Format
- Terminaison: `\r\n` (CRLF)
- Réponse OK: `OK\r\n`
- Réponse ERREUR: `ERROR: <code>\r\n`

### Codes d'Erreur
| Code | Description |
|------|-------------|
| 1 | Commande invalide |
| 2 | Paramètre manquant |
| 3 | Valeur hors limites |
| 4 | Non autorisé |
| 5 | Timeout |
| 6 | Mémoire pleine |

---

## TODO

- [ ] Vérifier AT commands avec firmware MeshCore réel
- [ ] Implémenter encodage sub-mesh ID dans paquets
- [ ] Ajouter tests de compression sur device physique
- [ ] Documenter codes d'erreur spécifiques firmware
