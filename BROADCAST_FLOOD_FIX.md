# 🔧 Correction Broadcast Flood - MeshCore

**Date**: 25 Février 2026  
**Problème**: Le broadcast flood ne fonctionne pas - l'expéditeur voit "Message broadcast réussi" mais le destinataire ne reçoit rien.

---

## 🎯 Résumé du Problème

### Symptômes
- ✅ UI affiche "Message broadcast réussi"
- ❌ Le compagnon ne reçoit aucun message
- ❌ Pas de logs de réception côté destinataire

### Causes Racines Identifiées

1. **Canal 0 non configuré** - Le firmware MeshCore nécessite que le canal soit configuré avec un nom et un secret avant d'envoyer/recevoir des messages
2. **Handler RESP_CHANNEL_MSG_V3 incomplet** - Le parser ne loggait pas correctement les réceptions
3. **Pas de vérification de configuration** - L'envoi échouait silencieusement si le canal n'était pas configuré
4. **Logs insuffisants** - Difficile de diagnostiquer où le message se perd

---

## ✅ Corrections Appliquées

### 1. Configuration Automatique du Canal 0

**Fichier**: `utils/ble-gateway-fixed.ts`

```typescript
// Configuration automatique au handshake
private async configureDefaultChannels(): Promise<void> {
  const DEFAULT_CHANNEL_NAME = 'public';
  const DEFAULT_CHANNEL_SECRET = new Uint8Array(32); // 32 zéros
  
  await this.setChannel(0, DEFAULT_CHANNEL_NAME, DEFAULT_CHANNEL_SECRET);
  console.log('[BleGateway] Canal 0 (public) configuré avec succès');
}
```

Le canal 0 est maintenant configuré automatiquement après le handshake BLE.

### 2. Vérification Pré-Envoi

```typescript
async sendChannelMessage(channelIdx: number, text: string): Promise<void> {
  // Vérifier que le canal est configuré
  const channelConfig = this.channelConfigs.get(channelIdx);
  if (!channelConfig?.configured) {
    console.warn(`[BleGateway] Canal ${channelIdx} non configuré!`);
    if (channelIdx === 0) {
      await this.configureDefaultChannels(); // Auto-fix
    }
  }
  // ... envoi
}
```

### 3. Logs Détaillés pour Debugging

**Côté expéditeur**:
```
[BleGateway] 🚀 ENVOI BROADCAST ch=0
[BleGateway]    Texte: "Hello World"
[BleGateway]    Taille: 11 bytes
[BleGateway]    Canal configuré: public
[BleGateway] ✓ CMD_SEND_CHAN_MSG envoyé au firmware
[BleGateway]    En attente de RESP_SENT puis PUSH_SEND_CONFIRMED...
[BleGateway] ✓ RESP_SENT - Message accepté par le firmware
[BleGateway] ✓✓✓ PUSH_SEND_CONFIRMED
[BleGateway]    ACK Code: 12345
[BleGateway]    Round-trip: 2450ms
[BleGateway]    Le message a été relayé avec succès sur le réseau LoRa!
```

**Côté destinataire**:
```
[BleGateway] 📢 MESSAGE CANAL REÇU !
[BleGateway]    Canal: 0 (public)
[BleGateway]    Texte: "Hello World"
[BleGateway]    SNR: 8.5dB, Hops: 1
[BleGateway]    ✓ Canal configuré: "public"
```

### 4. Handler RESP_CHANNEL_MSG_V3 Corrigé

```typescript
private parseChannelMsgV3(payload: Uint8Array): void {
  const channelIdx = payload[3];
  const pathLen = payload[4];
  const timestamp = view.getUint32(6, true);
  const text = new TextDecoder().decode(payload.slice(10)).replace(/\0/g, '');
  
  console.log(`[BleGateway] 📢 MESSAGE CANAL REÇU !`);
  console.log(`[BleGateway]    Canal: ${channelIdx}`);
  console.log(`[BleGateway]    Texte: "${text}"`);
  
  // Notifier l'UI
  this.incomingMessageCallback?.({ 
    type: 'channel', 
    channelIdx, 
    senderPubkeyPrefix: '',
    pathLen, 
    timestamp, 
    text, 
    snr 
  });
}
```

---

## 🧪 Guide de Test

### Prérequis
- 2x ESP32 avec firmware MeshCore Companion
- 2x Smartphones avec BitMesh
- Distance: 10-100m entre les devices

### Test 1: Vérification Configuration Canal

**Étapes**:
1. Connecter les 2 devices BLE
2. Vérifier les logs:
   ```
   [BleGateway] Configuration des canaux par défaut...
   [BleGateway] ✓ Canal 0 (public) configuré avec succès
   ```

### Test 2: Envoi Broadcast Simple

**Étapes**:
1. Sur Device A: Mesh → Envoi Test
2. Laisser le champ "Destinataire" vide (broadcast)
3. Entrer "Test broadcast" comme message
4. Appuyer sur Envoyer

**Résultats attendus**:
- Device A: Voir les logs d'envoi et PUSH_SEND_CONFIRMED
- Device B: Recevoir le message avec logs 📢 MESSAGE CANAL REÇU

### Test 3: Vérification Canal Configuré

**Étapes**:
1. Sur Device B: Gateway Scan Modal
2. Vérifier "Channel actif : 🌐 Public (ch0)"

### Test 4: Test avec Canal Privé

**Étapes**:
1. Sur les 2 devices: Changer vers canal 1
2. Configurer le même nom et secret sur les 2 devices
3. Envoyer un message

**Résultats attendus**:
- Seul le destinataire avec le même canal configuré reçoit le message

---

## 🔧 Intégration

### Étape 1: Remplacer le Gateway

```bash
# Sauvegarder l'ancien
cp utils/ble-gateway.ts utils/ble-gateway.ts.backup

# Copier le nouveau
cp utils/ble-gateway-fixed.ts utils/ble-gateway.ts
```

### Étape 2: Mettre à jour BleProvider.tsx

Ajouter dans l'interface:
```typescript
sendFloodMessage: (text: string) => Promise<void>;
getChannelConfig: (index: number) => { configured: boolean; name: string } | undefined;
```

Implémenter:
```typescript
const sendFloodMessage = async (text: string) => {
  if (!clientRef.current || !state.connected) throw new Error('BLE non connecté');
  await clientRef.current.sendChannelMessage(0, text); // ch0 = broadcast
  setState((prev) => prev.loraActive ? prev : { ...prev, loraActive: true });
};
```

### Étape 3: Vérifier l'UI

Dans `mesh/index.tsx`, la fonction `handleSendTestMessage` devrait appeler:
```typescript
if (testRecipient.trim()) {
  // DM à un contact spécifique
  await sendDirectMessage(contact.pubkeyHex, testMsg.trim());
} else {
  // Broadcast sur canal 0
  await sendChannelMessage(testMsg.trim()); // ou sendFloodMessage
}
```

---

## 📋 Checklist de Validation

- [ ] Connexion BLE établie sur les 2 devices
- [ ] Canal 0 configuré automatiquement (logs)
- [ ] Envoi broadcast: RESP_SENT reçu
- [ ] Envoi broadcast: PUSH_SEND_CONFIRMED reçu
- [ ] Réception: 📢 MESSAGE CANAL REÇU visible
- [ ] Message affiché dans l'UI du destinataire
- [ ] Test avec canal privé (ch1+) fonctionnel

---

## 🐛 Dépannage

### "Canal non configuré"
**Solution**: Déconnecter/reconnecter le BLE. Le canal 0 se configure automatiquement au handshake.

### "RESP_SENT mais pas de PUSH_SEND_CONFIRMED"
**Causes possibles**:
- Destinataire hors de portée LoRa
- Interférence radio
- Canal mal configuré côté destinataire

**Solution**: 
1. Vérifier la distance (< 1km en zone dégagée)
2. Vérifier la configuration radio (même fréquence, SF, BW)
3. Vérifier que le destinataire a le canal configuré

### "PUSH_SEND_CONFIRMED mais pas de réception"
**Cause**: Le destinataire n'a pas le canal 0 configuré

**Solution**: Sur le destinataire:
1. Gateway Scan Modal
2. Vérifier "Channel actif"
3. Si différent, sélectionner "🌐 Public (ch0)"
4. Redémarrer la connexion BLE si nécessaire

---

## 📚 Références

- [MeshCore Protocol](MESHCORE_PROTOCOL.md)
- [Intégration MeshCore Complète](docs/INTEGRATION_MESHCORE_COMPLETE.md)
- [Types MeshCore](types/meshcore.ts)

---

**Auteur**: Silexperience  
**Version**: 1.0 - 25 Février 2026
