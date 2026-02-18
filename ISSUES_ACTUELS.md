# 🐛 Problèmes Actuels - BitMesh

**Date** : 18 Février 2026
**Version** : v1.1.0-beta

---

## ❌ Problèmes Critiques (Bloquants)

### 1. Génération Wallet Échoue Silencieusement
**Status** : ✅ CORRIGÉ (commit 9e7df9e)

**Symptôme** :
- Clic sur "Generate 12 Words"
- Vibration puis rien
- Aucun wallet créé

**Fix Appliqué** :
- Ajout affichage d'erreur avec Alert
- Logs détaillés dans console
- Exposé `generateError` dans contexte

**Test** :
```bash
1. Settings → Generate 12 Words
2. Si erreur, vous verrez maintenant une Alert explicite
3. Vérifiez logs Metro pour détails
```

---

### 2. Connexion MQTT Reste Bloquée
**Status** : ⚠️ EN INVESTIGATION

**Symptôme** :
- "MQTT..." affiché indéfiniment
- Jamais "MQTT ●" (connecté)
- Impossible de créer forums ou envoyer messages

**Cause Probable** :
- Pas de wallet créé → pas d'identity → MQTT bloqué
- Ou broker public surchargé

**Solution Temporaire** :
```bash
1. Générez d'abord un wallet (Settings → Generate 12 Words)
2. Vérifiez que vous voyez votre NodeID (ex: MESH-A7F2)
3. Attendez 5-10 secondes pour connexion MQTT
4. Vérifiez logs Metro :
   - "[MQTT] Connexion à: wss://broker.emqx.io:8084/mqtt"
   - "[MQTT] Connecté! nodeId: MESH-XXXX"
```

**Si Toujours Bloqué** :
```bash
# Vérifiez connexion Internet
# Testez broker MQTT avec outil externe (MQTT Explorer)
# Logs possibles :
[MQTT] Erreur: Connection timeout
[MQTT] Erreur: Network unreachable
```

---

## ⚠️ Fonctionnalités Manquantes (Wallet)

### 3. Bouton "Receive" Ne Fait Rien
**Status** : ❌ NON IMPLÉMENTÉ

**Attendu** :
- Modal ou écran avec adresse Bitcoin complète
- QR code pour scanner
- Bouton Copy

**Actuel** :
```typescript
// wallet/index.tsx ligne 260
<Text>Receive</Text>
// Pas d'action onPress !
```

**TODO** :
```typescript
// Créer ReceiveModal.tsx
import QRCode from 'react-native-qrcode-svg';

function ReceiveModal({ address, visible, onClose }) {
  return (
    <Modal visible={visible}>
      <QRCode value={address} size={200} />
      <Text>{address}</Text>
      <Button onPress={() => Clipboard.copy(address)}>Copy</Button>
    </Modal>
  );
}
```

---

### 4. Bouton "Send" Basique
**Status** : ❌ NON IMPLÉMENTÉ

**Actuel** :
```typescript
// wallet/index.tsx ligne 239
Alert.alert('Send', 'Send Bitcoin via LoRa mesh or on-chain');
```

**Attendu** :
- Modal avec input pour adresse destinataire
- Input pour montant (sats)
- Bouton "Scan QR" pour scanner adresse
- Sélection fee (low/medium/high)
- Confirmation transaction

**TODO** :
```typescript
// Créer SendModal.tsx
function SendModal() {
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState<'low'|'medium'|'high'>('medium');

  const handleScan = () => {
    // Ouvrir caméra pour scanner QR code
    // Utiliser expo-barcode-scanner
  };

  const handleSend = () => {
    // Construire et broadcaster transaction
    // Via LoRa mesh ou on-chain
  };
}
```

---

### 5. Boutons Cashu "Send" et "Receive"
**Status** : ❌ NON IMPLÉMENTÉS

**Actuel** :
```typescript
// wallet/index.tsx lignes 377, 389
Alert.alert('Send Token', 'Paste or scan a Cashu token...');
Alert.alert('Receive Token', 'Waiting for Cashu token...');
```

**TODO** :
- Modal pour coller token Cashu (send)
- Modal pour afficher token généré en QR (receive)
- Scan QR pour token entrant

---

## 🔧 Améliorations Recommandées

### 6. Broker MQTT Public Peut Être Lent
**Impact** : Connexion lente ou timeout

**Solution** :
- Ajouter option dans Settings pour broker custom
- Proposer plusieurs brokers publics :
  ```
  - wss://broker.emqx.io:8084/mqtt (défaut)
  - wss://broker.hivemq.com:8884/mqtt
  - wss://test.mosquitto.org:8081
  ```

---

### 7. Pas de Notifications Visuelles Forums
**Impact** : Utilisateur peut manquer nouveaux forums

**Actuel** : Juste log console
**TODO** : Toast visuel avec react-native-toast-message

---

### 8. Token GitHub dans Historique Git
**Sécurité** : ⚠️ CRITIQUE

**Action Requise** :
```bash
1. Allez sur https://github.com/settings/tokens
2. Trouvez token commençant par "ghp_..." (visible dans historique git)
3. Cliquez "Delete" ou "Revoke"
4. Générez nouveau token si besoin
5. NE JAMAIS committer de tokens
```

---

## ✅ Corrections Déjà Appliquées

- [x] BLE scan filtre trop large (acceptait devices sans nom)
- [x] Queue messages BLE hors ligne
- [x] UI découverte forums intégrée
- [x] Notifications console pour forums
- [x] Affichage erreurs génération wallet

---

## 🧪 Plan de Test

### Test 1 : Génération Wallet
```bash
1. Ouvrez BitMesh
2. Settings → Generate 12 Words
3. ✅ Devrait afficher 12 mots
4. ❌ Si erreur, Alert avec message
5. Vérifiez logs Metro pour erreur détaillée
```

### Test 2 : Connexion MQTT
```bash
1. Assurez wallet créé (test 1)
2. Retournez à Messages
3. Attendez 10 secondes
4. ✅ "MQTT ●" en haut à droite
5. ✅ Votre NodeID affiché (MESH-XXXX)
6. ❌ Si "MQTT..." indéfiniment, vérifiez logs
```

### Test 3 : Découverte Forums
```bash
1. Messages → + (bouton en bas à droite)
2. Onglet "Découvrir"
3. Créer forum "test-btc"
4. ✅ Devrait apparaître dans liste
5. Sur 2ème appareil, vérifier si forum apparaît
```

### Test 4 : Scan BLE
```bash
1. Mesh → Scan Gateways
2. ✅ Devrait trouver ESP32 si à proximité
3. ❌ Ne devrait PAS lister tous devices BLE random
```

---

## 📦 Dépendances Manquantes Potentielles

Pour implémenter Receive/Send complets :
```json
{
  "react-native-qrcode-svg": "^6.3.0",
  "expo-barcode-scanner": "~13.0.0",
  "react-native-toast-message": "^2.2.0"
}
```

Installation :
```bash
npx expo install react-native-qrcode-svg expo-barcode-scanner
npm install react-native-toast-message
```

---

## 🚀 Prochaines Étapes Recommandées

1. **Priorité 1** : Implémenter Receive Modal (QR code)
2. **Priorité 2** : Implémenter Send Modal (scan + input)
3. **Priorité 3** : Débugger connexion MQTT si toujours bloquée
4. **Priorité 4** : Ajouter toast visuel pour forums
5. **Priorité 5** : Option broker MQTT custom

---

**Questions ? Vérifiez logs Metro avec :**
```bash
npx expo start --clear
# Puis filtrer par :
# - [WalletSeed]
# - [MQTT]
# - [BleProvider]
# - [Forums]
```
