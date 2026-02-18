# 🔘 Vérification Complète des Boutons - BitMesh

**Date** : 18 Février 2026
**App Version** : v1.1.0-beta

---

## 📱 Écran 1 : MESSAGES

### Bouton FAB "+" (Bas droite)
- **Localisation** : `app/(tabs)/(messages)/index.tsx:392`
- **Action** : Ouvre modal nouvelle conversation
- **Status** : ✅ FONCTIONNE
- **Test** : Cliquez → Modal apparaît avec 3 onglets

### Modal Nouvelle Conversation

#### Onglet "DM"
**Inputs** :
- Node ID destinataire (MESH-XXXX)
- Nom (optionnel)

**Bouton "Démarrer DM chiffré"**
- **Action** : Crée conversation P2P chiffrée E2E
- **Status** : ✅ FONCTIONNE
- **Requis** : NodeID valide
- **Test** : Entrez "MESH-TEST" → Conversation créée

#### Onglet "Forum"
**Input** :
- Nom du canal (ex: bitcoin-paris)

**Bouton "Rejoindre le forum"**
- **Action** : Rejoint forum public
- **Status** : ✅ FONCTIONNE
- **Requis** : Nom de canal
- **Test** : Entrez "test" → Forum ajouté aux conversations

#### Onglet "Découvrir" (NOUVEAU)
**Bouton "Créer un forum public"**
- **Action** : Affiche formulaire création
- **Status** : ✅ FONCTIONNE
- **Test** : Cliquez → Formulaire apparaît

**Bouton "Créer et Annoncer"**
- **Action** : Crée forum + annonce sur MQTT
- **Status** : ⚠️ DÉPEND MQTT CONNECTÉ
- **Requis** :
  - MQTT connecté
  - Wallet créé (pour identity)
- **Test** :
  ```bash
  1. Vérifiez "MQTT ●" (pas "MQTT...")
  2. Créez forum "test-btc"
  3. ✅ Forum créé et annoncé
  4. ❌ Si MQTT non connecté → Log "[Forums] Impossible d'annoncer"
  ```

**Liste Forums Découverts**
- **Action** : Clic sur forum → Rejoint forum
- **Status** : ✅ FONCTIONNE (si forums découverts)
- **Test** : Nécessite 2 appareils connectés MQTT

### Items Conversation
**Action** : Clic → Ouvre conversation
**Status** : ✅ FONCTIONNE

---

## 📡 Écran 2 : MESH

### Bouton "Scan"
- **Localisation** : `app/(tabs)/mesh/index.tsx:62-76`
- **Action** : Lance scan BLE pour gateways ESP32
- **Status** : ✅ FONCTIONNE (corrigé)
- **Requis** :
  - Permissions BLE accordées
  - Bluetooth activé
  - Gateway ESP32 à proximité (optionnel)
- **Test** :
  ```bash
  1. Mesh → Scan
  2. ✅ Animation rotation
  3. ✅ Trouve gateways si disponibles
  4. ❌ Ne liste plus tous devices BLE random (fix appliqué)
  ```

### Modal Scan Gateways (GatewayScanModal)
**Bouton "Connect" (sur chaque gateway trouvé)**
- **Action** : Connecte au gateway BLE sélectionné
- **Status** : ✅ DEVRAIT FONCTIONNER
- **Requis** : Gateway ESP32 avec Nordic UART Service
- **Test** :
  ```bash
  1. Scan termine
  2. Liste gateways trouvés
  3. Clic "Connect" sur un gateway
  4. ✅ BLE connecté
  5. ✅ Peut envoyer paquets LoRa
  ```

### Boutons Vue Radar/Liste
**Action** : Switch entre vue radar et liste
**Status** : ✅ FONCTIONNE
**Test** : Cliquez → Vue change

### Items Pairs (Liste)
**Action** : Clic → Affiche détails pair
**Status** : ⚠️ PROBABLEMENT JUSTE INFO
**Test** : Vérifier si ouvre détails ou conversation

---

## 💰 Écran 3 : WALLET

### Onglet "Bitcoin"

#### Bouton "Send" (Principal, avec icône flèche haut)
- **Localisation** : `app/(tabs)/wallet/index.tsx:239`
- **Action Actuelle** : Alert basique "Send Bitcoin via LoRa mesh or on-chain"
- **Status** : ❌ NON IMPLÉMENTÉ
- **Attendu** :
  ```typescript
  // Modal SendBitcoin avec :
  - Input adresse destinataire
  - Input montant (sats)
  - Bouton "Scan QR" (caméra)
  - Sélection fee (low/medium/high)
  - Bouton "Send" → Broadcast transaction
  ```
- **Test** : Cliquez → Voir seulement Alert

#### Bouton "Receive" (Secondaire, avec icône flèche bas)
- **Localisation** : `app/(tabs)/wallet/index.tsx:260`
- **Action Actuelle** : ❓ AUCUNE (pas de onPress visible)
- **Status** : ❌ NON IMPLÉMENTÉ
- **Attendu** :
  ```typescript
  // Modal ReceiveBitcoin avec :
  - QR code de l'adresse
  - Adresse Bitcoin complète
  - Bouton "Copy Address"
  - Sélection adresse (si plusieurs dérivées)
  ```
- **Test** : Cliquez → **RIEN NE SE PASSE**

#### Bouton "Copy" (À côté de l'adresse raccourcie)
- **Localisation** : `app/(tabs)/wallet/index.tsx:696-713`
- **Action** : Copie adresse dans clipboard
- **Status** : ✅ FONCTIONNE
- **Test** :
  ```bash
  1. Cliquez icône Copy
  2. ✅ Adresse copiée
  3. ✅ Alert "Copied" avec adresse complète
  ```

#### Bouton "Refresh" (Icône RefreshCw en haut)
- **Action** : Rafraîchit balance et transactions
- **Status** : ✅ DEVRAIT FONCTIONNER (react-query refetch)
- **Test** : Cliquez → Spinner puis données actualisées

#### Liste Transactions
**Items Cliquables** : ❓
**Status** : À VÉRIFIER
**Test** : Cliquez transaction → Voir si ouvre détails

---

### Onglet "Cashu"

#### Bouton "Mint eCash"
- **Action** : Crée quote pour minter Cashu
- **Status** : ⚠️ DÉPEND MINT CASHU
- **Requis** : Mint URL configuré
- **Test** : Nécessite mint Cashu fonctionnel

#### Bouton "Send" (Cashu)
- **Localisation** : `app/(tabs)/wallet/index.tsx:377`
- **Action Actuelle** : Alert "Paste or scan a Cashu token to send via LoRa mesh"
- **Status** : ❌ NON IMPLÉMENTÉ
- **Attendu** :
  ```typescript
  // Modal SendCashu avec :
  - Input pour coller token
  - Bouton "Scan QR" pour token
  - Bouton "Send via LoRa"
  ```

#### Bouton "Receive" (Cashu)
- **Localisation** : `app/(tabs)/wallet/index.tsx:389`
- **Action Actuelle** : Alert "Waiting for Cashu token via LoRa mesh..."
- **Status** : ❌ NON IMPLÉMENTÉ
- **Attendu** :
  ```typescript
  // Modal ReceiveCashu avec :
  - Écoute messages LoRa pour tokens
  - Affiche tokens reçus
  - Bouton "Redeem" pour chaque token
  ```

#### Bouton "Connect to Mint"
- **Action** : Connecte à mint Cashu custom
- **Status** : ⚠️ PROBABLEMENT BASIQUE
- **Test** : Entrez URL mint → Vérifier connexion

---

## ⚙️ Écran 4 : SETTINGS

### Section Wallet

#### Bouton "Generate 12 Words"
- **Localisation** : `app/(tabs)/settings/index.tsx:343-353`
- **Action** : Génère wallet BIP39 12 mots
- **Status** : ✅ FONCTIONNE (fix appliqué)
- **Requis** : Rien
- **Test** :
  ```bash
  1. Settings → Generate 12 Words
  2. ✅ Wallet créé, 12 mots affichés
  3. ❌ Si erreur → Alert avec message
  4. ✅ NodeID généré (MESH-XXXX)
  ```

#### Bouton "Generate 24 Words"
- **Action** : Génère wallet BIP39 24 mots (plus sécurisé)
- **Status** : ✅ FONCTIONNE
- **Test** : Même que 12 mots

#### Bouton "Show Seed" (Si wallet créé)
- **Action** : Affiche/cache seed phrase
- **Status** : ✅ FONCTIONNE
- **Test** :
  ```bash
  1. Cliquez → Seed visible
  2. Re-cliquez → Seed caché
  ```

#### Bouton "Copy Seed"
- **Action** : Copie seed dans clipboard
- **Status** : ✅ FONCTIONNE
- **Test** : Cliquez → Seed copié + Vibration

#### Bouton "Import Wallet"
- **Action** : Importe wallet depuis seed existant
- **Status** : ✅ FONCTIONNE
- **Test** :
  ```bash
  1. Cliquez "Import Wallet"
  2. Entrez 12/24 mots valides
  3. ✅ Wallet importé
  4. ❌ Si seed invalide → Alert erreur
  ```

#### Bouton "Delete Wallet"
- **Action** : Supprime wallet (DESTRUCTIF)
- **Status** : ✅ FONCTIONNE (avec confirmation)
- **Test** :
  ```bash
  1. Cliquez → Confirmation Alert
  2. Confirmer → Wallet supprimé
  3. ✅ NodeID disparaît
  ```

---

### Section Connection Mode

#### Boutons Radio "Internet / Bridge / LoRa Mesh"
- **Action** : Change mode de connexion
- **Status** : ✅ FONCTIONNE
- **Effet** :
  - **Internet** : MQTT direct via WiFi/4G
  - **Bridge** : MQTT + BLE Gateway (pont LoRa)
  - **LoRa Mesh** : 100% hors ligne, LoRa direct
- **Test** :
  ```bash
  1. Sélectionnez mode
  2. ✅ Mode change
  3. ✅ Icône en haut change (Mesh screen)
  ```

---

### Section Advanced

#### Bouton "Copy Node ID"
- **Action** : Copie NodeID (MESH-XXXX)
- **Status** : ✅ FONCTIONNE
- **Test** : Cliquez → NodeID copié

#### Bouton "Copy Public Key"
- **Action** : Copie clé publique secp256k1
- **Status** : ✅ FONCTIONNE
- **Test** : Cliquez → Pubkey (66 chars hex) copié

#### Input "Mempool API URL"
- **Action** : Change API pour balance/transactions Bitcoin
- **Status** : ✅ FONCTIONNE
- **Défaut** : https://mempool.space/api
- **Test** : Changez URL → Wallet utilise nouvelle API

#### Input "Cashu Mint URL"
- **Action** : Change mint Cashu
- **Status** : ✅ FONCTIONNE
- **Défaut** : https://mint.cashu.me
- **Test** : Changez URL → Cashu utilise nouveau mint

---

## 📋 Résumé des Problèmes par Bouton

### ❌ NON FONCTIONNELS (Critiques)

1. **Wallet → Send Bitcoin**
   - Alert basique au lieu de formulaire complet
   - **Action** : Créer SendBitcoinModal.tsx

2. **Wallet → Receive Bitcoin**
   - Bouton ne fait rien
   - **Action** : Créer ReceiveBitcoinModal.tsx avec QR code

3. **Wallet → Send Cashu**
   - Alert basique au lieu de modal scan/paste
   - **Action** : Créer SendCashuModal.tsx

4. **Wallet → Receive Cashu**
   - Alert basique au lieu de listener LoRa
   - **Action** : Créer ReceiveCashuModal.tsx

---

### ⚠️ DÉPENDANTS (Fonctionnent si conditions remplies)

5. **Messages → Créer forum public**
   - Fonctionne SI MQTT connecté
   - **Fix** : S'assurer wallet créé d'abord

6. **Messages → Découvrir forums**
   - Fonctionne SI MQTT connecté ET forums annoncés
   - **Fix** : Instructions claires dans README

7. **Mesh → Scan Gateways**
   - Fonctionne SI permissions BLE ET gateway ESP32 proche
   - **Fix** : Déjà corrigé (scan universel)

---

### ✅ FONCTIONNELS

- Messages → FAB + → Nouvelle conversation
- Messages → DM chiffré
- Messages → Rejoindre forum (nom connu)
- Settings → Generate Wallet (12/24 mots)
- Settings → Import Wallet
- Settings → Delete Wallet
- Settings → Show/Copy Seed
- Settings → Copy Node ID / Pubkey
- Settings → Change Connection Mode
- Wallet → Copy Address
- Wallet → Refresh Balance

---

## 🚀 Ordre de Priorité pour Implémenter

### 1. CRITIQUE - Wallet Receive (QR Code)
**Pourquoi** : Impossible de recevoir Bitcoin actuellement
**Effort** : 🟢 Facile (1-2h)
**Dépendances** : react-native-qrcode-svg

```bash
npm install react-native-qrcode-svg
# Créer components/ReceiveBitcoinModal.tsx
```

### 2. CRITIQUE - Wallet Send (Formulaire)
**Pourquoi** : Impossible d'envoyer Bitcoin actuellement
**Effort** : 🟡 Moyen (3-4h)
**Dépendances** : expo-barcode-scanner (pour scan QR)

```bash
npx expo install expo-barcode-scanner
# Créer components/SendBitcoinModal.tsx
```

### 3. IMPORTANT - Fix MQTT Connexion
**Pourquoi** : Bloque découverte forums et messaging
**Effort** : 🔴 Variable (debug requis)
**Action** : Ajouter logs détaillés, tester broker alternatif

### 4. UTILE - Cashu Send/Receive
**Pourquoi** : Fonctionnalité eCash pas utilisable
**Effort** : 🟡 Moyen (2-3h chacun)
**Dépendances** : Même que Bitcoin Send/Receive

---

## 🧪 Plan de Test Complet

### Test Wallet (Bitcoin)
```bash
1. Settings → Generate 12 Words
2. ✅ Wallet créé
3. Wallet → Tab Bitcoin
4. ✅ Balance affichée (0 si nouveau)
5. Cliquez "Copy" → ✅ Adresse copiée
6. Cliquez "Receive" → ❌ RIEN (TODO)
7. Cliquez "Send" → ❌ Alert basique (TODO)
8. Cliquez "Refresh" → ✅ Balance updated
```

### Test Messages
```bash
1. Messages → + (FAB)
2. Onglet DM → Entrez MESH-TEST → ✅ Créé
3. Onglet Forum → Entrez "test" → ✅ Créé
4. Onglet Découvrir → ✅ Formulaire affiché
5. Créer forum "test-btc" → ⚠️ Si MQTT ● → ✅ Annoncé
6. Créer forum "test-btc" → ⚠️ Si MQTT... → ❌ Log erreur
```

### Test Mesh
```bash
1. Mesh → Scan
2. ✅ Animation rotation
3. ⚠️ Si ESP32 proche → ✅ Gateway trouvé
4. ⚠️ Si pas d'ESP32 → Liste vide (normal)
5. ❌ NE doit PAS lister téléphones/laptops BLE random
```

### Test Settings
```bash
1. Generate 12 Words → ✅ Wallet créé
2. Show Seed → ✅ Visible/Caché
3. Copy Seed → ✅ Copié
4. Copy Node ID → ✅ Copié (MESH-XXXX)
5. Copy Pubkey → ✅ Copié (66 chars hex)
6. Change Mode → Internet/Bridge/LoRa → ✅ Change
7. Delete Wallet → ✅ Confirmation → Supprimé
```

---

**Questions ? Problèmes ?**
Vérifiez ISSUES_ACTUELS.md pour détails et solutions.
