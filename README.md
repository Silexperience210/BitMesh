<div align="center">

# 🌐 BitMesh

### Messagerie P2P Décentralisée | LoRa/MQTT | Bitcoin & Cashu

[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS-blue.svg)](https://github.com/Silexperience210/BitMesh)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Silexperience210/BitMesh)](https://github.com/Silexperience210/BitMesh/releases)

[![Bitcoin](https://img.shields.io/badge/Bitcoin-Lightning-orange?logo=bitcoin)](https://github.com/Silexperience210/BitMesh)
[![Cashu](https://img.shields.io/badge/Cashu-eCash-yellow?logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMiAxMkwxMiAyMkwyMiAxMkwxMiAyWiIgZmlsbD0iI0ZGQjgwMCIvPgo8L3N2Zz4=)](https://cashu.space)
[![LoRa](https://img.shields.io/badge/LoRa-868%2F915MHz-brightgreen?logo=semtech)](https://lora-alliance.org/)
[![MeshCore](https://img.shields.io/badge/MeshCore-Protocol%20v1.0-blueviolet)](https://github.com/meshcore-dev/MeshCore)

**BitMesh** est une application mobile de messagerie décentralisée peer-to-peer utilisant le protocole **MeshCore** pour communiquer via **LoRa** (longue portée, jusqu'à 20 km) ou **MQTT** (Internet), avec chiffrement end-to-end, wallet Bitcoin intégré, et support natif des paiements Cashu eCash.

[📦 Télécharger APK](https://github.com/Silexperience210/BitMesh/releases/latest) • [📖 Documentation](#documentation) • [🚀 Roadmap](#roadmap)

</div>

---

## 📑 Table des Matières

- [Vue d'ensemble](#-vue-densemble)
- [État Actuel](#-état-actuel-février-2026)
- [Caractéristiques principales](#-caractéristiques-principales)
- [Architecture technique](#-architecture-technique)
- [Installation](#-installation)
- [Utilisation](#-utilisation)
- [Hardware compatible](#-hardware-compatible)
- [Documentation](#-documentation)
- [Roadmap](#-roadmap)
- [Contribution](#-contribution)
- [Licence](#-licence)

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
| **BLE (react-native-ble-plx)** | Connexion gateway ESP32 LoRa |

---

## ⚡ État Actuel (Février 2026)

### ✅ **100% FONCTIONNEL - V2.0**

| Fonctionnalité | Status | Notes |
|----------------|--------|-------|
| **Messagerie BLE/LoRa chiffrée** | ✅ **100%** | Chiffrement E2E ECDH/AES-GCM, KEY_ANNOUNCE |
| **Scan BLE Gateway** | ✅ **100%** | Détection universelle ESP32/LoRa |
| **Découverte de forums** | ✅ **100%** | Annonces MQTT automatiques |
| **Messagerie MQTT (Internet)** | ✅ **100%** | Chiffrement E2E, DMs + Forums |
| **GPS Radar temps réel** | ✅ **100%** | Haversine, bearing, signal strength |
| **Multi-hop Mesh Routing** | ✅ **100%** | Flood routing, TTL=10, deduplication |
| **Protocole MeshCore binaire** | ✅ **100%** | Format officiel v1.0, CRC16, NodeId uint64 |
| **Bitcoin wallet (HD)** | ✅ **100%** | BIP39/32/44, Native SegWit, envoi/reception |
| **Bitcoin transactions** | ✅ **100%** | Création, signature (tiny-secp256k1), broadcast |
| **SQLite Persistence** | ✅ **100%** | 6 tables, retry queue, ACKs |
| **Message Chunking** | ✅ **100%** | Messages >200 bytes découpés automatiquement |
| **Compression Smaz** | ✅ **100%** | 30-50% gain de taille |
| **Cashu token parsing** | ✅ **100%** | Preview amount + mint URL |
| **SeedQR Scanner** | ✅ **100%** | Scan QR codes pour import seed |
| **NFC (prêt)** | ✅ **100%** | Lecture/écriture transactions sur carte NFC |
| **Onboarding animé** | ✅ **100%** | 4 slides + tutoriel |

### 🎯 **Dernière Release (v2.0.0)**

**Nouvelles fonctionnalités majeures :**
- ✅ **SQLite Database** : Remplacement d'AsyncStorage, persistance robuste
- ✅ **Message Retry Service** : File d'attente persistante avec retry automatique
- ✅ **AckService** : Accusés de réception (ACKs) de livraison
- ✅ **ChunkManager** : Messages longs (>200 bytes) découpés automatiquement
- ✅ **Compression Smaz** : Compression automatique des messages
- ✅ **Bitcoin complet** : Création, signature (tiny-secp256k1), broadcast de transactions
- ✅ **SeedQR Scanner** : Import de seed via QR code
- ✅ **GPS/Position** : Traitement des paquets POSITION pour radar
- ✅ **Migration automatique** : Migration AsyncStorage → SQLite transparente
- ✅ **Build Release signé** : APK release signée avec keystore

**Corrections :**
- 🐛 Fix TypeScript : 0 erreurs
- 🐛 Fix signature Bitcoin avec tiny-secp256k1
- 🐛 Fix gestion des types dans tous les providers
- 🐛 Fix from → fromNodeId dans les messages
- 🐛 Fix erreurs de compilation Android

---

## ✨ Caractéristiques principales

### 🔐 **Messagerie Chiffrée E2E**

- **ECDH** : Keypair secp256k1 dérivée du wallet seed (BIP32 `m/69'/0'/0'/0`)
- **AES-GCM-256** : Chiffrement symétrique avec nonce 12 bytes
- **KEY_ANNOUNCE** : Échange automatique de clés publiques via BLE/LoRa
- **Format binaire** : Payload optimisé pour LoRa (version + nonce + ciphertext)

### 📡 **Communication Multi-Transport**

- **MQTT** : Internet via WebSocket TLS (wss://broker.emqx.io)
- **BLE** : Nordic UART Service → Gateway ESP32
- **LoRa** : 868/915 MHz, portée jusqu'à 20 km
- **Routing mesh** : Multi-hop avec TTL et déduplication

### 🔍 **Découverte de Forums**

- **Annonce publique** : Topic MQTT `meshcore/forums/announce`
- **Découverte automatique** : Liste mise à jour en temps réel
- **Rejoindre en 1 clic** : Interface intuitive
- **Chiffrement maintenu** : Clé dérivée du nom du forum

### 🪙 **Bitcoin & Cashu**

- **Wallet HD non-custodial** : BIP32/39/44, seed chiffré localement
- **Native SegWit** : Addresses bech32 (bc1q...)
- **Cashu eCash** : Support tokens pour paiements privés
- **Multi-mint** : Compatible tous les mints Cashu

### 🌍 **Radar GPS Temps Réel**

- **Haversine** : Distance précise entre coordonnées GPS
- **Bearing** : Angle compas pour affichage radar
- **Signal strength** : Fort/Moyen/Faible selon distance
- **Mise à jour auto** : Toutes les 5s ou 10m de déplacement

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
│  │  MessagesProvider│ BleProvider   │ WalletProvider   │   │
│  │  (MQTT + BLE)    │ (LoRa Bridge) │ (Bitcoin/Cashu)  │   │
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

### Flux de Message Chiffré BLE/LoRa

```
App A (Sender)
  ↓ 1. Texte: "Hello"
  ↓ 2. Chiffrement ECDH: sharedSecret = ECDH(privA, pubB)
  ↓ 3. AES-GCM: {nonce, ct} = encrypt(text, sharedSecret)
  ↓ 4. Encode: payload = [v|nonce|ct] (binaire)
  ↓ 5. MeshCore: packet = {flags: ENCRYPTED, payload}
  ↓ 6. BLE.sendPacket(packet)
  ↓
ESP32 Gateway
  ↓ LoRa TX (868/915 MHz)
  ↓
~~~ AIR ~~~
  ↓
ESP32 Gateway
  ↓ LoRa RX
  ↓ BLE → App B
  ↓
App B (Receiver)
  ↓ 7. BLE.onPacket(packet)
  ↓ 8. Decode: {v, nonce, ct} = decodeEncryptedPayload()
  ↓ 9. Déchiffrement ECDH: sharedSecret = ECDH(privB, pubA)
  ↓ 10. AES-GCM: plaintext = decrypt({nonce, ct}, sharedSecret)
  ↓ 11. Affichage: "Hello" ✅
```

---

## 📥 Installation

### Prérequis

- **Node.js** ≥ 18 ([Installation](https://nodejs.org/))
- **Bun** ≥ 1.0 ([Installation](https://bun.sh/docs/installation))
- **Android Studio** (émulateur) ou **Xcode** (simulateur iOS)

### Clone du repository

```bash
git clone https://github.com/Silexperience210/BitMesh.git
cd BitMesh
```

### Installation des dépendances

```bash
bun install
```

### Configuration (optionnel)

Créer un fichier `.env` :

```env
# MQTT Broker (optionnel, défaut: broker.emqx.io)
MQTT_BROKER_URL=wss://your-broker.com:8084/mqtt

# Bitcoin Network
BITCOIN_NETWORK=testnet

# Cashu Mint URL
DEFAULT_CASHU_MINT=https://mint.minibits.cash
```

---

## 🚀 Utilisation

### Mode développement

**Mobile (Expo Go)** :
```bash
bun start
# Scannez le QR code avec Expo Go
```

**iOS Simulator** :
```bash
bun start -- --ios
```

**Android Emulator** :
```bash
bun start -- --android
```

### Build Production (APK)

```bash
# Installer EAS CLI
bun i -g @expo/eas-cli

# Login
eas login

# Build APK
eas build --platform android --profile preview
```

### Première utilisation

1. **Générer un wallet** : Settings → "Generate 12 Words"
2. **⚠️ Sauvegarder le seed** : Noter les 12 mots sur papier
3. **Autoriser GPS** : Pour le radar de pairs
4. **Connexion MQTT** : Automatique au démarrage

### Envoyer un message

#### Via MQTT (Internet)
1. Messages → `+` → Sélectionner un pair du radar
2. Écrire le message → ✈️
3. ✅ Chiffré ECDH → publié sur MQTT

#### Via BLE/LoRa (Réseau mesh)
1. Settings → Scan BLE → Connecter au gateway ESP32
2. ✅ KEY_ANNOUNCE automatique (échange de clés)
3. Messages → Envoyer
4. ✅ Chiffré → BLE → LoRa → Destinataire

### Découvrir des forums

1. Messages → **Découverte de forums**
2. Voir les forums annoncés publiquement
3. Rejoindre en 1 clic
4. Ou créer un nouveau forum et l'annoncer

---

## 🛠 Hardware compatible

### LoRa Gateways

| Hardware | Chipset | Fréquence | Distance | Prix |
|----------|---------|-----------|----------|------|
| **Heltec WiFi LoRa 32 V3** | ESP32-S3 + SX1262 | 868/915 MHz | ~20 km | ~25€ |
| **TTGO LoRa32** | ESP32 + SX1276 | 868/915 MHz | ~15 km | ~20€ |
| **LilyGO T-Beam** | ESP32 + SX1276 + GPS | 868/915 MHz | ~15 km | ~35€ |
| **RAK WisBlock** | ESP32 + SX1262 | 868/915 MHz | ~20 km | ~40€ |
| **Meshtastic devices** | Various | 868/915 MHz | ~15-20 km | Varies |

### Firmware recommandé

**MeshCore Gateway Firmware** (ESP32) :
- Compatible avec Nordic UART Service BLE
- MQTT bridge automatique (WiFi → LoRa)
- Format binaire MeshCore v1.0

---

## 📚 Documentation

### Guides Techniques

- **[CORRECTIONS.md](CORRECTIONS.md)** - Corrections BLE/Messagerie complètes
- **[FORUM_DISCOVERY_GUIDE.md](FORUM_DISCOVERY_GUIDE.md)** - Guide découverte de forums
- **[FORUM_DISCOVERY_SUMMARY.md](FORUM_DISCOVERY_SUMMARY.md)** - Résumé rapide
- **[MESHCORE_PROTOCOL.md](MESHCORE_PROTOCOL.md)** - Spécifications protocole binaire

### Exemples de Code

- **[FORUM_DISCOVERY_EXAMPLE.tsx](FORUM_DISCOVERY_EXAMPLE.tsx)** - Composant UI forums

### Structure du projet

```
BitMesh/
├── app/                          # Screens (Expo Router)
│   ├── (tabs)/
│   │   ├── (messages)/           # Messages + conversations
│   │   ├── (wallet)/             # Wallet Bitcoin/Cashu
│   │   ├── mesh/                 # GPS radar
│   │   └── settings/             # Settings
│   └── onboarding.tsx
├── components/                   # React components
├── providers/                    # React Context
│   ├── MessagesProvider.ts       # MQTT + BLE messages
│   ├── BleProvider.tsx           # BLE gateway
│   └── WalletSeedProvider.ts     # Bitcoin wallet
├── utils/                        # Utility functions
│   ├── ble-gateway.ts            # BLE Nordic UART
│   ├── meshcore-protocol.ts      # MeshCore binaire
│   ├── mqtt-client.ts            # MQTT client
│   ├── encryption.ts             # ECDH + AES-GCM
│   └── bitcoin.ts                # Bitcoin wallet
└── constants/
```

---

## 🗺 Roadmap

### ✅ **v1.1.0 (Février 2026)** - COMPLÉTÉ

- [x] Messagerie BLE/LoRa chiffrée E2E
- [x] Scan BLE universel
- [x] KEY_ANNOUNCE automatique
- [x] Découverte de forums MQTT
- [x] Documentation complète

### 🚀 **v2.0.0 (Février 2026)** - COMPLÉTÉ ✅

- [x] SQLite Database avec 6 tables
- [x] Message Retry Service persistant
- [x] AckService (accusés de réception)
- [x] ChunkManager (messages longs)
- [x] Compression Smaz
- [x] Bitcoin complet (création, signature, broadcast)
- [x] SeedQR Scanner
- [x] GPS/Position pour radar
- [x] Migration AsyncStorage → SQLite
- [x] Build Release signé
- [x] 0 erreurs TypeScript

### 🚧 **v2.1.0 (Q2 2026)** - EN COURS

- [ ] Lightning Network (BOLT11 send/receive)
- [ ] Cashu mint integration complète (redeem/withdraw)
- [ ] Notifications push (FCM)
- [ ] Tests unitaires complets

### 📋 **v3.0.0 (Q3 2026)** - PLANIFIÉ

- [ ] iOS build (App Store)
- [ ] Media sharing (images, voice notes)
- [ ] Group calls (WebRTC mesh)
- [ ] Hardware wallet support (Ledger, Coldcard)

### 🔮 **Futur**

- [ ] Nostr integration (NIP-04/17/44)
- [ ] Desktop app (Electron)
- [ ] Hardware wallet support (Ledger, Coldcard)
- [ ] Satellite connectivity (Blockstream)

---

## 🤝 Contribution

Les contributions sont les bienvenues ! Merci de suivre ces guidelines :

### Issues

- 🐛 **Bug reports** : Description détaillée, steps to reproduce, logs
- ✨ **Feature requests** : Use case, mockups si possible
- 📚 **Documentation** : Typos, clarifications

### Pull Requests

1. Fork le repo
2. Créer une branche : `git checkout -b feature/ma-feature`
3. Commit : `feat: ajouter support NIP-04`
4. Push : `git push origin feature/ma-feature`
5. Ouvrir une PR avec description détaillée

**Commit convention** :
```
feat: nouvelle fonctionnalité
fix: correction de bug
docs: documentation
refactor: refactoring
test: ajout de tests
chore: tâches diverses
```

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

---

<div align="center">

**⚡ Construit avec React Native, Bitcoin, et LoRa**

**🚀 BitMesh — Messagerie décentralisée pour un monde souverain**

**Version 2.0.0** | Dernière mise à jour: Février 2026

[⬆ Retour en haut](#-bitmesh)

</div>
