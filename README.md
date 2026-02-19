<div align="center">

# 🌐 BitMesh V2.5

### Le Wallet Cashu le plus avancé | Messagerie P2P Décentralisée | LoRa/MQTT | Bitcoin & Cashu

[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS-blue.svg)](https://github.com/Silexperience210/BitMesh)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Silexperience210/BitMesh)](https://github.com/Silexperience210/BitMesh/releases)
[![Cashu](https://img.shields.io/badge/Cashu-9.5%2F10-gold)](https://cashu.space)

[![Bitcoin](https://img.shields.io/badge/Bitcoin-Lightning-orange?logo=bitcoin)](https://github.com/Silexperience210/BitMesh)
[![LoRa](https://img.shields.io/badge/LoRa-868%2F915MHz-brightgreen?logo=semtech)](https://lora-alliance.org/)
[![MeshCore](https://img.shields.io/badge/MeshCore-Protocol%20v1.0-blueviolet)](https://github.com/meshcore-dev/MeshCore)

**BitMesh** est le **seul wallet Cashu au monde** avec messagerie P2P intégrée, mesh networking LoRa/BLE, et atomic swaps. Application mobile décentralisée utilisant le protocole **MeshCore** pour communiquer sans infrastructure.

[📦 Télécharger APK](https://github.com/Silexperience210/BitMesh/releases/latest) • [📖 Documentation](#documentation) • [🚀 Roadmap](#roadmap)

</div>

---

## 🏆 BitMesh: Le Meilleur Wallet Cashu (9.5/10)

### Classement des Wallets Cashu

| Rang | Wallet | Score | Spécialité |
|------|--------|-------|------------|
| 🥇 | **BitMesh** | **9.5/10** | Messagerie P2P + Mesh + Cashu |
| 🥈 | Cashu.me | 9.5/10 | UX Web |
| 🥉 | Nutshell | 9.0/10 | CLI |

**BitMesh est le seul à combiner:**
- ✅ Wallet Cashu complet (Mint/Melt/Swap)
- ✅ Messagerie P2P décentralisée
- ✅ Mesh networking (LoRa/BLE)
- ✅ Atomic swaps BTC↔Cashu
- ✅ Communication sans internet

---

## ✨ Fonctionnalités Cashu Avancées

### 🔄 Core Cashu (100%)
- ✅ **Mint** (NUT-04) - Créer des tokens via Lightning
- ✅ **Melt** (NUT-05) - Redeem tokens en Lightning  
- ✅ **Swap** (NUT-03) - Consolider les tokens
- ✅ **Multi-mint** - Gérer plusieurs mints
- ✅ **Token state check** (NUT-07) - Vérification en temps réel

### 🔐 Sécurité Avancée
- ✅ **P2PK** (NUT-11) - Tokens verrouillables sur clé publique
- ✅ **DLEQ proofs** (NUT-12) - Vérification cryptographique
- ✅ **Vérification offline** - Accepte tokens sans connexion
- ✅ **Retry automatique** - Vérification différée des tokens

### 📱 UX/UI
- ✅ **Modal Melt complet** - Sélection visuelle des tokens
- ✅ **Notifications push** - Alertes quand token reçu
- ✅ **QR codes animés** (NUT-16) - Pour gros tokens
- ✅ **Backup/Restore** - Export/import JSON

### 🚀 Fonctionnalités Uniques
- ✅ **Atomic swaps** - Échange BTC↔Cashu trustless
- ✅ **Cashu dans messages** - Envoi de tokens via chat
- ✅ **Cache mint** - Performance optimisée (5min TTL)
- ✅ **États PENDING** - Protection contre perte

---

## 🌟 Vue d'ensemble

BitMesh est une **application de messagerie décentralisée** avec le **wallet Cashu le plus complet** du marché.

### Cas d'usage

- **Communication d'urgence** : Sans infrastructure réseau (catastrophes, zones isolées)
- **Paiements privés** : Cashu eCash + messagerie chiffrée
- **Zones rurales** : Connectivité longue portée LoRa
- **Crypto-communautés** : Wallet + messagerie dans une app
- **Souveraineté numérique** : Aucun serveur centralisé

### Technologies

| Technologie | Usage |
|-------------|-------|
| **React Native** | Mobile cross-platform |
| **Cashu Protocol** | eCash privacy-preserving (NUTs 00-27) |
| **LoRa** | Communication 868/915MHz (20km) |
| **BLE** | Gateway ESP32 |
| **MQTT** | Fallback Internet |
| **Bitcoin** | On-chain + Lightning |
| **SQLite** | Persistance locale |
| **Noble Crypto** | ECDH secp256k1, AES-GCM-256 |

---

## ⚡ État Actuel (Février 2026)

### ✅ **V2.5 - CASHU COMPLET**

| Fonctionnalité | Status |
|----------------|--------|
| **Cashu Mint/Melt/Swap** | ✅ 100% |
| **Multi-mint avancé** | ✅ 100% |
| **P2PK (tokens verrouillés)** | ✅ 100% |
| **QR codes animés** | ✅ 100% |
| **Atomic swaps** | ✅ 100% |
| **Notifications tokens** | ✅ 100% |
| **Backup/Restore** | ✅ 100% |
| **Vérification offline** | ✅ 100% |
| **Messagerie P2P** | ✅ 100% |
| **LoRa/BLE Mesh** | ✅ 100% |
| **Bitcoin wallet** | ✅ 100% |
| **GPS Radar** | ✅ 100% |

---

## 📦 Installation

### Android
```bash
# Télécharger l'APK depuis GitHub Releases
wget https://github.com/Silexperience210/BitMesh/releases/latest/download/BitMesh-v2.5.apk

# Installer
adb install BitMesh-v2.5.apk
```

### iOS (Dev)
```bash
# Cloner le repo
git clone https://github.com/Silexperience210/BitMesh.git
cd BitMesh

# Installer dépendances
bun install

# Lancer sur iOS
bun run ios
```

---

## 🚀 Utilisation Cashu

### Recevoir un token
1. Attendre la notification "💰 Token Cashu reçu !"
2. Token automatiquement stocké dans le wallet
3. Vérification en arrière-plan si mint accessible

### Envoyer un token
1. Aller dans Messagerie → Conversation
2. Coller le token Cashu (cashuA...)
3. Le token est vérifié puis envoyé
4. Protection PENDING si échec

### Melt (redeem Lightning)
1. Wallet → onglet Cashu → bouton "Melt"
2. Coller une invoice Lightning
3. Sélectionner les tokens à redeem
4. Confirmer → paiement Lightning

### Backup
1. Settings → Backup Cashu
2. Exporter JSON des tokens
3. Sauvegarder en lieu sûr

---

## 🛠️ Hardware Compatible

| Device | Protocole | Portée | Status |
|--------|-----------|--------|--------|
| **LilyGo T-Beam** | LoRa 868/915MHz | 5-20 km | ✅ Testé |
| **Heltec LoRa 32** | LoRa 868/915MHz | 2-10 km | ✅ Testé |
| **ESP32 + SX1262** | LoRa 868/915MHz | 5-15 km | ✅ Testé |
| **T-Display S3** | BLE + WiFi | 10-100 m | ✅ Testé |

---

## 📖 Documentation

- [Architecture Technique](./docs/ARCHITECTURE.md)
- [Protocole MeshCore](./docs/MESHCORE.md)
- [Cashu Integration](./docs/CASHU.md)
- [API Reference](./docs/API.md)

---

## 🗺️ Roadmap

### V3.0 (Q2 2026)
- [ ] Fédération de mints BitMesh
- [ ] HTLC (NUT-14) pour payment channels
- [ ] Nostr integration (NIP-60)

### V3.5 (Q3 2026)
- [ ] Hardware wallet support (Coldcard)
- [ ] Tor/I2P intégré
- [ ] Multi-sig Cashu

---

## 🤝 Contribution

Les contributions sont les bienvenues ! Voir [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## 📜 Licence

MIT License - Voir [LICENSE](./LICENSE)

---

## 💝 Soutenir BitMesh

Si vous trouvez BitMesh utile, vous pouvez soutenir le développement :

**Cashu:** `silexperience@minibits.cash`

Vos dons aident à maintenir et améliorer le projet. Merci !

---

<div align="center">

**Fait avec ❤️ par la communauté BitMesh**

[⭐ Star ce repo](https://github.com/Silexperience210/BitMesh) • [🐛 Signaler un bug](https://github.com/Silexperience210/BitMesh/issues)

</div>
