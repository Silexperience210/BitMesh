<div align="center">

# 🌐 BitMesh

### Messagerie P2P Décentralisée | LoRa/MQTT | Bitcoin & Cashu

[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS-blue.svg)](https://github.com/Silexperience210/BitMesh)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Build](https://img.shields.io/github/actions/workflow/status/Silexperience210/BitMesh/eas-build.yml?branch=main)](https://github.com/Silexperience210/BitMesh/actions)
[![Release](https://img.shields.io/github/v/release/Silexperience210/BitMesh)](https://github.com/Silexperience210/BitMesh/releases)

**BitMesh** est une application mobile de messagerie décentralisée peer-to-peer utilisant le protocole **MeshCore** pour communiquer via **LoRa** (longue portée, jusqu'à 20 km) ou **MQTT** (Internet), avec chiffrement end-to-end, wallet Bitcoin intégré, et support natif des paiements Cashu eCash.

[📦 Télécharger APK](https://github.com/Silexperience210/BitMesh/releases/latest) • [📖 Documentation](#documentation) • [🚀 Roadmap](#roadmap)

</div>

---

## 📑 Table des Matières

- [Vue d'ensemble](#-vue-densemble)
- [Caractéristiques principales](#-caractéristiques-principales)
- [Architecture technique](#-architecture-technique)
- [MeshCore Protocol](#-meshcore-protocol)
- [Sécurité & Chiffrement](#-sécurité--chiffrement)
- [Bitcoin & Cashu](#-bitcoin--cashu)
- [GPS Radar & Présence](#-gps-radar--présence)
- [Installation](#-installation)
- [Utilisation](#-utilisation)
- [Structure du projet](#-structure-du-projet)
- [Hardware compatible](#-hardware-compatible)
- [Développement](#-développement)
- [Build & Déploiement](#-build--déploiement)
- [API & Intégrations](#-api--intégrations)
- [Roadmap](#-roadmap)
- [Contribution](#-contribution)
- [Licence](#-licence)
- [Auteur](#-auteur)

---

## 🌟 Vue d'ensemble

BitMesh est une **application de messagerie décentralisée** conçue pour fonctionner sur des réseaux maillés (mesh networks) en utilisant des technologies de communication longue portée comme **LoRa** et des protocoles légers comme **MQTT**.

### Cas d'usage

- **Communication d'urgence** : Messagerie fonctionnelle sans infrastructure réseau (catastrophes naturelles, zones isolées)
- **Événements & Festivals** : Communication longue portée sans réseau cellulaire
- **Zones rurales** : Connectivité dans les zones à faible couverture réseau
- **Crypto-communautés** : Messagerie sécurisée avec paiements Bitcoin/Lightning/Cashu intégrés
- **Souveraineté numérique** : Contrôle total de vos données, aucun serveur centralisé

### Technologies clés

| Technologie | Usage |
|-------------|-------|
| **React Native** | Framework mobile cross-platform (iOS/Android) |
| **Expo Router** | Navigation file-based + deep linking |
| **MQTT v5** | Protocol pub/sub pour messagerie temps réel |
| **LoRa** | Communication longue portée (jusqu'à 20 km) |
| **Bitcoin/Lightning** | Paiements on-chain et Lightning Network |
| **Cashu Protocol** | eCash tokens (privacy-preserving payments) |
| **Noble Crypto** | ECDH secp256k1, AES-GCM-256, BIP32/39 |
| **Expo Location** | GPS tracking pour radar de pairs |

---

## ✨ Caractéristiques principales

### 🔐 Messagerie chiffrée E2E

- **Chiffrement ECDH** : Keypair secp256k1 dérivée du wallet seed (BIP32 `m/69'/0'/0'/0`)
- **AES-GCM-256** : Chiffrement symétrique avec nonce 12 bytes
- **Forward secrecy** : Clés éphémères pour chaque session
- **Aucun serveur central** : Messages routés via MQTT pub/sub décentralisé

### 📡 MeshCore Protocol

- **Multi-transport** : LoRa (longue portée) + MQTT (Internet)
- **Chunking automatique** : Messages >240 bytes fragmentés pour LoRa
- **Routing mesh** : Messages relayés automatiquement entre peers
- **QoS configurable** : QoS 0 (statuts), QoS 1 (DMs), QoS 2 (transactions)

### 🪙 Bitcoin & Lightning

- **Wallet HD non-custodial** : BIP32/39/44, seed chiffré localement
- **Lightning Network** : Envoi/réception de paiements instantanés
- **On-chain** : Support transactions Bitcoin classiques
- **Multi-wallet** : Gestion de plusieurs wallets (mainnet/testnet)

### 🎫 Cashu eCash

- **Support Cashu Protocol** : eCash tokens pour paiements privés
- **Multi-mint** : Compatible avec tous les mints Cashu
- **Envoi/Réception** : Tokens envoyés directement dans les conversations
- **Preview** : Décodage automatique des tokens (amount, mint URL)

### 🌍 Radar GPS temps réel

- **Positionnement GPS** : Affichage des pairs sur radar avec distance/bearing réels
- **Mise à jour automatique** : Présence GPS publiée toutes les 5s / 10m
- **Calcul Haversine** : Distance précise entre deux coordonnées GPS
- **Signal strength** : Indicateur de qualité basé sur distance (Fort >70%, Moyen 40-70%, Faible <40%)

### 👥 Forums multi-utilisateurs

- **Channels publics** : Forums ouverts avec clé symétrique dérivée du nom
- **Channels privés** : Forums avec clé partagée hors-bande
- **Pas de limite** : Nombre illimité de participants par forum

---

## 🏗 Architecture technique

```
┌─────────────────────────────────────────────────────────────┐
│                     BitMesh Mobile App                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              React Native + Expo Router               │  │
│  └───────────────────────────────────────────────────────┘  │
│                             │                                │
│  ┌──────────────────┬───────┴───────┬──────────────────┐   │
│  │  MessagesProvider│ GatewayProvider│ WalletProvider   │   │
│  │  (MQTT + Store)  │  (LoRa Bridge) │ (Bitcoin/Cashu)  │   │
│  └──────────────────┴───────────────┴──────────────────┘   │
│                             │                                │
│  ┌──────────────────┬───────┴───────┬──────────────────┐   │
│  │   Encryption     │   Identity    │   GPS Radar       │   │
│  │  (ECDH/AES-GCM)  │ (secp256k1)   │  (Haversine)      │   │
│  └──────────────────┴───────────────┴──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
        ┌───────▼────────┐       ┌───────▼────────┐
        │  MQTT Broker    │       │  LoRa Gateway  │
        │ (WebSocket TLS) │       │  (ESP32+SX127x)│
        └────────────────┘       └────────────────┘
                │                         │
                └────────────┬────────────┘
                             │
                    ┌────────▼─────────┐
                    │  MeshCore Network│
                    │   (P2P Routing)  │
                    └──────────────────┘
```

### Flux de données

#### 1. Envoi d'un message DM chiffré

```
User A → Input → ECDH(privA, pubB) → AES-GCM(msg, sharedSecret)
     → MQTT publish(meshcore/dm/{nodeIdB}, ciphertext)
     → Broker → User B subscribe → AES-GCM decrypt → Display
```

#### 2. Envoi d'un message LoRa

```
User A → Input → Chunking (240 bytes max)
     → MQTT publish(meshcore/lora/outbound, chunk[0..N])
     → Gateway ESP32 → LoRa TX (868/915 MHz)
     → LoRa RX → Gateway ESP32 → MQTT publish(meshcore/lora/inbound)
     → User B subscribe → Reassembly → Decrypt → Display
```

#### 3. Paiement Cashu

```
User A → Generate Cashu token (mint URL + amount + proofs)
     → Encrypt token → MQTT publish(meshcore/dm/{nodeIdB})
     → User B → Decrypt → Parse cashuA token → Display preview
     → User B → Redeem proofs on mint → Wallet updated
```

---

## 🔗 MeshCore Protocol

**MeshCore** est le protocole de communication décentralisé utilisé par BitMesh. Il combine MQTT pub/sub avec LoRa pour créer un réseau mesh résilient.

### Topics MQTT

| Topic | QoS | Retained | Description |
|-------|-----|----------|-------------|
| `meshcore/identity/{nodeId}` | 1 | ✅ | Pubkey + GPS presence (last will) |
| `meshcore/dm/{nodeId}` | 1 | ❌ | Messages directs chiffrés ECDH |
| `meshcore/forum/{channelId}` | 0 | ❌ | Forums/groupes (chiffré symétrique) |
| `meshcore/lora/outbound` | 0 | ❌ | Messages sortants vers gateway LoRa |
| `meshcore/lora/inbound` | 0 | ❌ | Messages entrants depuis gateway LoRa |

### Format de message

```json
{
  "v": 1,
  "from": "MESH-A7F2",
  "fromPubkey": "02abcd1234...",
  "enc": {
    "nonce": "base64_nonce_12_bytes",
    "ct": "base64_ciphertext"
  },
  "ts": 1234567890123,
  "type": "text" | "cashu" | "btc_tx"
}
```

### Chunking LoRa (messages >240 bytes)

Format: `MCHK|{messageId}|{chunkIndex}|{totalChunks}|{payload}`

```
Message 800 bytes → 4 chunks:
  MCHK|abc123|0|4|<200bytes>
  MCHK|abc123|1|4|<200bytes>
  MCHK|abc123|2|4|<200bytes>
  MCHK|abc123|3|4|<200bytes>
```

Le récepteur reassemble les chunks et reconstruit le message complet.

---

## 🔐 Sécurité & Chiffrement

### Dérivation d'identité (BIP32)

```
Seed (12/24 mots BIP39)
  └─ m/69'/0'/0'/0 (BitMesh Identity)
       ├─ privkey secp256k1
       ├─ pubkey compressed (33 bytes)
       └─ NodeId = "MESH-" + hex(sha256(pubkey)[0:4])
```

**Exemple** :
- Pubkey: `02a1b2c3d4...`
- Hash: `sha256(pubkey) = a7f29e1b...`
- NodeId: `MESH-A7F2`

### Chiffrement DM (Direct Messages)

**ECDH (Elliptic Curve Diffie-Hellman)** :
```
sharedSecret = ECDH(myPrivkey, theirPubkey)
key = sha256(sharedSecret)
nonce = random(12 bytes)
ciphertext = AES-GCM-256(plaintext, key, nonce)
```

**Envoi** :
```json
{
  "enc": {
    "nonce": "base64(nonce)",
    "ct": "base64(ciphertext)"
  }
}
```

### Chiffrement Forum (Channels)

**Clé symétrique dérivée du nom du channel** :
```
key = sha256("forum:" + channelName)
nonce = random(12 bytes)
ciphertext = AES-GCM-256(plaintext, key, nonce)
```

Tous les participants connaissant le nom du channel peuvent déchiffrer les messages.

### Stockage local

- **Wallet seed** : Chiffré avec `expo-secure-store` (Keychain iOS / Keystore Android)
- **Messages** : Stockés dans AsyncStorage (limité à 200 messages par conversation)
- **Clés privées** : Jamais exposées, restent dans le provider

---

## 🪙 Bitcoin & Cashu

### Bitcoin HD Wallet

**Dérivation BIP44** :
```
m/84'/0'/0'/0/0  → Première adresse native segwit (bc1q...)
m/84'/0'/0'/0/1  → Deuxième adresse
...
```

**Support** :
- ✅ Addresses native segwit (bech32)
- ✅ Transaction signing (PSBT)
- ✅ Fee estimation
- ✅ UTXO management
- ✅ Lightning invoice (BOLT11)

### Lightning Network

**Intégration LND/CLN via API** :
- Génération d'invoices (BOLT11)
- Paiement d'invoices
- Vérification de paiement (webhook/polling)

### Cashu eCash Protocol

**Format token** :
```
cashuAeyJ0b2tlbiI6W3sicHJvb2ZzIjpbeyJpZCI6IjAwOWEi...
```

**Workflow envoi** :
```
1. User A génère token sur mint (withdraw)
2. Token encodé en cashuA + chiffré
3. Envoyé via MQTT (meshcore/dm/{nodeIdB})
4. User B reçoit, déchiffre, parse le token
5. User B redeem sur mint → sats ajoutés au wallet
```

**Mints compatibles** :
- Tous les mints respectant [NUT-00 à NUT-12](https://github.com/cashubtc/nuts)
- Exemples : cashu.me, mint.minibits.cash, etc.

---

## 🌍 GPS Radar & Présence

### Calcul de distance (Haversine)

```typescript
function haversineDistance(lat1, lng1, lat2, lng2): number {
  const R = 6371e3; // Rayon Terre en mètres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance en mètres
}
```

### Calcul de bearing (angle compas)

```typescript
function gpsBearing(lat1, lng1, lat2, lng2): number {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  let θ = Math.atan2(y, x);
  if (θ < 0) θ += 2 * Math.PI;
  return θ; // Radians (0 = Nord, π/2 = Est)
}
```

### Affichage radar

- **Anneaux** : 2 km, 4 km, 6 km, 8 km
- **Position blip** : `(x, y) = CENTER + (cos(bearing - π/2), sin(bearing - π/2)) * ratio * radius`
- **Couleur signal** :
  - 🟢 Vert (>70%) : < 2.4 km
  - 🟠 Orange (40-70%) : 2.4-4.8 km
  - 🔴 Rouge (<40%) : > 4.8 km
  - ⚫ Gris : Hors ligne (>5 min sans mise à jour)

### Mise à jour présence

**Fréquence** : Toutes les 5 secondes OU 10 mètres de déplacement

```typescript
Location.watchPositionAsync(
  {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,  // 5s
    distanceInterval: 10 // 10m
  },
  (location) => {
    updatePresence(nodeId, pubkey, location.coords.latitude, location.coords.longitude);
  }
);
```

---

## 📥 Installation

### Prérequis

- **Node.js** ≥ 18 (recommandé via [nvm](https://github.com/nvm-sh/nvm))
- **Bun** ≥ 1.0 ([Installation](https://bun.sh/docs/installation))
- **Android Studio** (pour émulateur Android) OU **Xcode** (pour simulateur iOS)

### Clone du repository

```bash
git clone https://github.com/Silexperience210/BitMesh.git
cd BitMesh
```

### Installation des dépendances

```bash
bun install
```

### Configuration

Créer un fichier `.env` à la racine :

```env
# MQTT Broker (optionnel, défaut: broker.emqx.io)
MQTT_BROKER_URL=wss://your-broker.com:8084/mqtt

# Bitcoin Network (mainnet/testnet)
BITCOIN_NETWORK=testnet

# Cashu Mint URL (optionnel)
DEFAULT_CASHU_MINT=https://mint.minibits.cash
```

---

## 🚀 Utilisation

### Mode développement

**Web** (preview rapide) :
```bash
bun run start-web
```

**Mobile** (Expo Go) :
```bash
bun start
# Scannez le QR code avec l'app Expo Go
```

**iOS Simulator** :
```bash
bun start -- --ios
```

**Android Emulator** :
```bash
bun start -- --android
```

### APK de production

Télécharger la dernière version :

🔗 [BitMesh Releases](https://github.com/Silexperience210/BitMesh/releases/latest)

**Installation** :
1. Téléchargez `BitMesh-release.apk`
2. Activez "Sources inconnues" dans les paramètres Android
3. Installez l'APK
4. Lancez BitMesh 🚀

### Première utilisation

1. **Onboarding** : Écran de bienvenue animé expliquant BitMesh/MeshCore/Bitcoin/Cashu
2. **Création wallet** : Générer un nouveau seed (12 mots) ou importer un existant
3. **Sauvegarde seed** : **CRITIQUE** — Notez vos 12 mots sur papier (jamais en ligne !)
4. **GPS permissions** : Autoriser la localisation pour le radar
5. **Connexion MQTT** : Automatique au démarrage

### Envoyer un message

1. Onglet **Messages** → Bouton `+` (nouvelle conversation)
2. Sélectionner un peer depuis le radar
3. Écrire le message → Bouton ✈️ (envoi)
4. Le message est chiffré ECDH → publié sur `meshcore/dm/{peerNodeId}`

### Envoyer des sats (Cashu)

1. Ouvrir une conversation
2. Bouton 💰 (Cashu)
3. Coller un token `cashuA...` (généré depuis votre mint)
4. Preview affiche : `X sats` + `Mint: https://...`
5. Bouton **Envoyer X sats** → Token chiffré et envoyé

### Rejoindre un forum

1. Onglet **Messages** → Bouton `+` → **Nouveau Forum**
2. Nom du channel : `bitcoin-paris`
3. Le forum est créé avec clé `sha256("forum:bitcoin-paris")`
4. Tous ceux connaissant ce nom peuvent rejoindre

---

## 📂 Structure du projet

```
BitMesh/
├── app/                          # Screens (Expo Router file-based)
│   ├── (tabs)/                   # Navigation tabs
│   │   ├── (messages)/           # Messages tab + conversations
│   │   │   ├── [chatId].tsx      # Conversation screen (DM/Forum)
│   │   │   └── index.tsx         # Liste conversations
│   │   ├── (wallet)/             # Wallet tab
│   │   │   ├── index.tsx         # Wallet overview
│   │   │   ├── receive.tsx       # Receive BTC/Lightning
│   │   │   └── send.tsx          # Send BTC/Lightning
│   │   ├── mesh/                 # Mesh radar tab
│   │   │   └── index.tsx         # GPS radar + peers
│   │   ├── settings/             # Settings tab
│   │   │   └── index.tsx         # App settings
│   │   └── _layout.tsx           # Tabs layout
│   ├── _layout.tsx               # Root layout + providers
│   ├── index.tsx                 # Splash + onboarding redirect
│   └── onboarding.tsx            # Onboarding animated screen
├── components/                   # React components
│   ├── MeshRadar.tsx             # GPS radar component
│   ├── MessageBubble.tsx         # Message bubble (text/cashu/btc)
│   └── ...
├── providers/                    # React Context providers
│   ├── MessagesProvider.ts       # MQTT + messages state
│   ├── WalletSeedProvider.ts     # Bitcoin wallet seed
│   ├── GatewayProvider.ts        # LoRa gateway bridge
│   └── AppSettingsProvider.ts    # App settings
├── utils/                        # Utility functions
│   ├── identity.ts               # NodeId + keypair derivation
│   ├── encryption.ts             # ECDH + AES-GCM
│   ├── mqtt-client.ts            # MQTT client (mqtt v5)
│   ├── messages-store.ts         # AsyncStorage persistence
│   ├── radar.ts                  # Haversine + GPS bearing
│   ├── chunking.ts               # LoRa message chunking
│   ├── wallet/                   # Bitcoin wallet utils
│   │   ├── seed.ts               # BIP39 seed generation
│   │   ├── derive.ts             # BIP32/44 derivation
│   │   └── transaction.ts        # TX signing
│   └── cashu/                    # Cashu utils
│       ├── token.ts              # cashuA encode/decode
│       └── mint.ts               # Mint API calls
├── constants/                    # Constants & config
│   └── colors.ts                 # Color palette
├── assets/                       # Static assets
│   └── images/                   # App icons
├── .github/workflows/            # GitHub Actions
│   └── eas-build.yml             # Auto-build APK on push
├── app.json                      # Expo config
├── eas.json                      # EAS Build config
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
└── README.md                     # This file
```

---

## 🛠 Hardware compatible

### LoRa Gateways

BitMesh est compatible avec tout gateway LoRa ESP32 supportant MeshCore :

| Hardware | Chipset | Fréquence | Distance | Prix |
|----------|---------|-----------|----------|------|
| **Heltec WiFi LoRa 32 V3** | ESP32-S3 + SX1262 | 868/915 MHz | ~20 km | ~25€ |
| **TTGO LoRa32** | ESP32 + SX1276 | 868/915 MHz | ~15 km | ~20€ |
| **LilyGO T-Beam** | ESP32 + SX1276 + GPS | 868/915 MHz | ~15 km | ~35€ |
| **RAK WisBlock** | ESP32 + SX1262 | 868/915 MHz | ~20 km | ~40€ |
| **Meshtastic devices** | Various | 868/915 MHz | ~15-20 km | Varies |

### Firmware recommandé

**MeshCore Gateway Firmware** (ESP32) :
- Repository : [github.com/Silexperience210/meshcore-gateway](https://github.com/Silexperience210/meshcore-gateway) *(à venir)*
- PlatformIO project
- MQTT bridge automatique (WiFi → LoRa)
- Topics : `meshcore/lora/outbound` → LoRa TX, LoRa RX → `meshcore/lora/inbound`

**Alternative : Meshtastic** (compatible mais limité) :
- [meshtastic.org](https://meshtastic.org)
- Flash via Web Flasher
- MQTT plugin activé

---

## 💻 Développement

### Lancer les tests

```bash
# Unit tests
bun test

# E2E tests (Detox)
bun run test:e2e:android
bun run test:e2e:ios
```

### Linter & Formatter

```bash
# ESLint
bun run lint

# Prettier
bun run format

# Type checking
bun run type-check
```

### Architecture des providers

Les providers React Context gèrent l'état global de l'application :

**MessagesProvider** :
- Connexion MQTT (WebSocket TLS)
- Subscribe aux topics (`identity/+`, `dm/{nodeId}`, `forum/*`)
- Chiffrement/déchiffrement des messages
- Stockage AsyncStorage (200 derniers messages)
- Radar peers avec GPS

**WalletSeedProvider** :
- Génération/import seed BIP39
- Stockage sécurisé (Keychain/Keystore)
- Dérivation BIP32/44
- Balance tracking

**GatewayProvider** :
- Bridge MQTT ↔ LoRa (via gateway ESP32)
- Chunking/reassembly messages LoRa
- Status connexion gateway

---

## 🏗 Build & Déploiement

### Build local (APK preview)

```bash
# Installer EAS CLI
bun i -g @expo/eas-cli

# Login
eas login

# Build APK (preview)
eas build --platform android --profile preview

# Build AAB (Google Play)
eas build --platform android --profile production
```

### Build automatique (GitHub Actions)

Le workflow `.github/workflows/eas-build.yml` se déclenche automatiquement à chaque push sur `main` :

1. Génère un keystore Android
2. Build APK via EAS
3. Crée une GitHub Release avec APK téléchargeable

**Releases** : https://github.com/Silexperience210/BitMesh/releases

### Secrets GitHub requis

| Secret | Description |
|--------|-------------|
| `EXPO_TOKEN` | Token EAS (généré via `eas login`) |

---

## 🔌 API & Intégrations

### MQTT Broker

**Production** : `wss://broker.emqx.io:8084/mqtt` (public)

**Self-hosted** (recommandé pour production) :
```bash
# Docker Compose
version: '3.8'
services:
  emqx:
    image: emqx/emqx:latest
    ports:
      - "1883:1883"    # MQTT
      - "8083:8083"    # WebSocket
      - "8084:8084"    # WebSocket TLS
      - "18083:18083"  # Dashboard
    environment:
      EMQX_ALLOW_ANONYMOUS: "true"
```

### Bitcoin Node (optionnel)

Pour transactions on-chain, connecter un full node :

```bash
# Bitcoin Core (testnet)
bitcoind -testnet -daemon

# Ou via Electrum Server
electrs --network testnet
```

Config dans `.env` :
```env
BITCOIN_RPC_URL=http://localhost:18332
BITCOIN_RPC_USER=user
BITCOIN_RPC_PASS=pass
```

### Lightning Node (optionnel)

Pour paiements Lightning :

```bash
# LND
lnd --bitcoin.testnet --bitcoin.node=bitcoind

# CLN (Core Lightning)
lightningd --network=testnet
```

### Cashu Mint

Utiliser un mint public ou self-hosted :

**Public mints** :
- https://mint.minibits.cash
- https://cashu.me
- https://mint.coinos.io

**Self-hosted** (Nutshell) :
```bash
git clone https://github.com/cashubtc/nutshell
cd nutshell
pip install .
poetry run mint
```

---

## 🗺 Roadmap

### Q2 2026

- [x] Messagerie P2P chiffrée (ECDH + AES-GCM)
- [x] MQTT real-time (WebSocket)
- [x] Bitcoin HD wallet (BIP32/39/44)
- [x] Cashu eCash support
- [x] GPS radar temps réel
- [x] Forums multi-utilisateurs
- [x] Onboarding animé
- [ ] LoRa hardware integration (BLE)
- [ ] Multi-hop routing (mesh relay)
- [ ] Lightning invoices (BOLT11 send/receive)

### Q3 2026

- [ ] iOS build (App Store)
- [ ] Push notifications (FCM)
- [ ] Media sharing (images, voice notes)
- [ ] Group calls (WebRTC mesh)
- [ ] Offline message queue
- [ ] Message reactions & replies
- [ ] Contact sync (from phonebook)

### Q4 2026

- [ ] Nostr integration (NIP-04/17/44)
- [ ] eSIM data marketplace (via LoRa)
- [ ] Mesh routing analytics (hop count, latency)
- [ ] Multi-language (EN, ES, DE, FR)
- [ ] Desktop app (Electron)
- [ ] Hardware wallet support (Ledger, Coldcard)

### Futur

- [ ] Satellite connectivity (Blockstream Satellite)
- [ ] Mesh VPN (tunnel IP over LoRa)
- [ ] Local marketplaces (P2P trades via Cashu)
- [ ] Emergency broadcast (SOS mode)

---

## 🤝 Contribution

Les contributions sont les bienvenues ! Merci de suivre ces guidelines :

### Issues

Créer une issue pour :
- 🐛 **Bug reports** : Description détaillée, steps to reproduce, logs
- ✨ **Feature requests** : Use case, mockups si possible
- 📚 **Documentation** : Typos, clarifications

### Pull Requests

1. Fork le repo
2. Créer une branche : `git checkout -b feature/ma-feature`
3. Commit avec message conventionnel : `feat: ajouter support NIP-04`
4. Push : `git push origin feature/ma-feature`
5. Ouvrir une PR avec description détaillée

**Commit convention** :
```
feat: nouvelle fonctionnalité
fix: correction de bug
docs: documentation
refactor: refactoring
test: ajout de tests
chore: tâches diverses (deps, config)
```

### Code Style

- **TypeScript strict mode** : Toujours typer les paramètres/retours
- **Commentaires en français** : Code comments in French
- **ESLint + Prettier** : Lancer `bun run lint` avant commit
- **Tests unitaires** : Couverture >80% pour utils/

---

## 📜 Licence

**MIT License**

Copyright (c) 2026 Silexperience

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## 👤 Auteur

**Silexperience**

🔗 [GitHub](https://github.com/Silexperience210)
📧 Contact : noreply@github.com
🌐 Website : *Coming soon*

---

<div align="center">

**⚡ Construit avec React Native, Bitcoin, et LoRa**

**🚀 BitMesh — Messagerie décentralisée pour un monde souverain**

[⬆ Retour en haut](#-bitmesh)

</div>
