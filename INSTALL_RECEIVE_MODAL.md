# 📦 Installation du Modal Receive Bitcoin

## 🎯 Fonctionnalité Ajoutée

✅ Modal complet pour recevoir du Bitcoin avec :
- QR code scannable de l'adresse
- Affichage adresse Bitcoin complète
- Bouton Copy avec feedback visuel
- Support adresses multiples (dérivation HD)
- Logo BitMesh dans le QR code

---

## 📋 Installation Requise

### 1. Installer la Dépendance QR Code

```bash
npm install react-native-qrcode-svg react-native-svg
```

**Pourquoi ?** Le modal utilise `react-native-qrcode-svg` pour générer les QR codes.

---

### 2. Ajouter le Logo (Optionnel)

Le QR code utilise `require('@/assets/images/icon.png')` comme logo.

**Si vous n'avez pas de logo** :
- Option 1 : Retirez les props `logo`, `logoSize`, `logoBackgroundColor`, `logoBorderRadius` du composant QRCode (ligne ~66 de `ReceiveBitcoinModal.tsx`)
- Option 2 : Ajoutez une image `icon.png` dans `assets/images/`

---

## 🧪 Test

### Test 1 : Ouvrir le Modal
```bash
1. Wallet → Tab Bitcoin
2. Cliquez bouton "Receive" (flèche vers le bas)
3. ✅ Modal apparaît avec QR code
4. ✅ Adresse Bitcoin affichée
```

### Test 2 : Copier l'Adresse
```bash
1. Dans le modal Receive
2. Cliquez "Copier l'adresse"
3. ✅ Bouton devient vert "Copié !"
4. ✅ Adresse dans clipboard
5. ✅ Vibration de succès
```

### Test 3 : Sélection d'Adresse (Si HD)
```bash
1. Si plusieurs adresses dérivées
2. ✅ Liste affichée en bas du modal
3. Cliquez sur une adresse
4. ✅ QR code change
5. ✅ Adresse sélectionnée surbrillée
```

### Test 4 : Scanner le QR
```bash
1. Ouvrez wallet Bitcoin externe (ex: BlueWallet)
2. Send → Scan QR
3. Scannez le QR code du modal
4. ✅ Adresse reconnue
5. ✅ Peut envoyer Bitcoin
```

---

## 🎨 Fichiers Créés/Modifiés

```
✨ NOUVEAU :
   components/ReceiveBitcoinModal.tsx (345 lignes)
   - Modal complet avec QR code
   - Gestion multi-adresses
   - Copy to clipboard
   - Styles cohérents avec l'app

📝 MODIFIÉ :
   app/(tabs)/wallet/index.tsx
   - Import ReceiveBitcoinModal
   - State showReceiveModal
   - Prop onReceivePress dans BitcoinBalanceCard
   - Bouton Receive déclenche modal (au lieu de copy)
   - Modal rendu à la fin du composant
```

---

## 🔧 Dépannage

### Erreur : "Unable to resolve module 'react-native-qrcode-svg'"
**Cause** : Package non installé
**Fix** :
```bash
npm install react-native-qrcode-svg react-native-svg
npx expo start --clear
```

### Erreur : "Unable to resolve '@/assets/images/icon.png'"
**Cause** : Pas de logo
**Fix** : Retirez les props logo du QRCode :
```typescript
// Dans ReceiveBitcoinModal.tsx ligne ~66
<QRCode
  value={selectedAddress}
  size={220}
  backgroundColor={Colors.surface}
  color={Colors.text}
  // Retirez ces lignes :
  // logo={require('@/assets/images/icon.png')}
  // logoSize={40}
  // logoBackgroundColor={Colors.surface}
  // logoBorderRadius={8}
/>
```

### Le modal ne s'ouvre pas
**Vérifications** :
1. Wallet créé ? (Settings → Generate 12 Words)
2. Logs Metro : erreurs affichées ?
3. Bouton Receive cliqué ET wallet initialisé ?

---

## 🚀 Prochaine Étape : Send Modal

Pour compléter le wallet, implémenter **SendBitcoinModal** avec :
- Input adresse destinataire
- Input montant (sats)
- Bouton "Scan QR" (nécessite expo-barcode-scanner)
- Sélection fee (low/medium/high)
- Construction + broadcast transaction

**Dépendances** :
```bash
npx expo install expo-barcode-scanner
npm install @scure/btc-signer  # Pour signer transactions
```

---

## 📚 Ressources

- **QR Code** : https://github.com/awesomejerry/react-native-qrcode-svg
- **BIP32/84** : Dérivation adresses SegWit (déjà implémenté dans `utils/bitcoin.ts`)
- **Expo Barcode** : https://docs.expo.dev/versions/latest/sdk/bar-code-scanner/

---

**✅ Le modal Receive est prêt à l'emploi après installation de `react-native-qrcode-svg` !**
