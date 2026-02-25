# 📡 Guide Canaux et Fréquence - MeshCore

**Date**: 25 Février 2026

---

## 🎯 Différence Canaux vs Fréquence

Dans MeshCore, il y a **2 couches de communication** distinctes:

### 1. Fréquence Radio (Couche physique)
- **Quoi**: La fréquence LoRa réelle en MHz (ex: 869.525 MHz)
- **Qui doit être identique**: **TOUS** les devices du réseau
- **Configuration**: Dans le firmware ESP32 (flash)
- **Modifiable via app**: ❌ Non (lecture seule)

### 2. Canal Logique (Couche application)
- **Quoi**: Un canal virtuel (0-7) pour séparer les conversations
- **Qui doit être identique**: Les devices qui veulent communiquer ensemble
- **Configuration**: Via BLE depuis l'app
- **Modifiable via app**: ✅ Oui

```
┌─────────────────────────────────────────────────────────────┐
│                    COUCHE RADIO (PHY)                       │
│  Fréquence: 869.525 MHz (tous les devices)                  │
│  SF: 11, BW: 250 kHz (tous les devices)                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 COUCHE CANAL (Logiciel)                     │
│  Canal 0 (public) ──────────────> Broadcast ouvert          │
│  Canal 1 (privé) ───────────────> Groupe privé chiffré      │
│  Canal 2-7 (privés) ───────────-> Autres groupes            │
└─────────────────────────────────────────────────────────────┘
```

---

## 📻 Fréquence Radio

### Fréquences par Région

| Région | Fréquence | SF Recommandé | BW | Usage |
|--------|-----------|---------------|-----|-------|
| Europe | 869.525 MHz | SF11 | 250 kHz | License-free ISM |
| US | 915.000 MHz | SF10 | 125 kHz | FCC Part 15 |
| Asia 433 | 433.000 MHz | SF11 | 125 kHz | ISM band |

### Comment changer la fréquence

**⚠️ La fréquence ne peut PAS être changée via l'app!**

Elle est définie lors de la compilation du firmware:

```cpp
// Dans le firmware MeshCore (platformio.ini ou config.h)
#define LORA_FREQ 869525000  // Hz
#define LORA_SF 11
#define LORA_BW 250000       // Hz
```

**Pour changer de fréquence:**
1. Modifiez le code du firmware
2. Recompilez avec PlatformIO/Arduino
3. Reflashez l'ESP32
4. Tous les devices du réseau doivent utiliser la même fréquence

### Affichage dans l'app

La fréquence actuelle s'affiche dans:
- **Mesh Screen**: En-tête avec FREQ, SF, BW, CR, TX
- **RadioConfigModal**: Onglet "Fréquence" avec les préréglages régionaux

---

## 📢 Canaux Logiques (0-7)

### Canal 0 - Public (Broadcast)

**Usage**: Messages ouverts à tous
**Secret**: Aucun (ou "public")
**Cas d'usage**:
- Annonces générales
- Découverte de nœuds
- Messages publics

**Configuration**:
```typescript
// Canal 0 configuré automatiquement au démarrage
name: "public"
secret: "" (32 zéros)
```

### Canaux 1-7 - Privés

**Usage**: Groupes privés chiffrés
**Secret**: Clé partagée (max 32 caractères)
**Cas d'usage**:
- Chat privé entre amis
- Communication d'équipe
- Forums privés

**Configuration**:
```typescript
// Exemple: Canal 1 pour une équipe
name: "equipe-alpha"
secret: "mon-secret-super-securise"
```

**Important**: Tous les participants doivent avoir le **même nom ET le même secret**!

---

## 🔧 Configuration depuis l'UI

### 1. Accéder au Modal Radio

```
Mesh → Scan Gateways → "Configurer Canaux & Radio"
```

### 2. Changer de Canal Actif

1. Onglet "Canaux"
2. Cliquez sur le canal désiré (0-7)
3. Cliquez "Utiliser ce Canal"

### 3. Configurer un Canal

**Canal 0 (Public)**:
```
Nom: public (ou laissez vide)
Secret: (laissez vide pour public)
→ Cliquez "Configurer Canal"
```

**Canal 1-7 (Privé)**:
```
Nom: mon-canal-prive
Secret: mon-mot-de-passe-secret
→ Cliquez "Configurer Canal"
```

### 4. Vérification

Le badge "Configuré" s'affiche quand:
- Le canal a été configuré avec un nom
- Le firmware a confirmé la configuration

---

## 🧪 Scenarios d'Usage

### Scenario 1: Réseau Public Ouvert

**Objectif**: Tout le monde peut parler à tout le monde

**Configuration**:
- Fréquence: 869.525 MHz (tous)
- Canal: 0 (tous)
- Secret: (aucun)

**Résultat**: Broadcast ouvert, tous reçoivent tous les messages

### Scenario 2: Groupe Privé

**Objectif**: Un groupe de 3 amis discute en privé

**Configuration**:
- Fréquence: 869.525 MHz (tous)
- Canal: 1 (les 3 amis)
- Secret: "secret-des-amis-123" (les 3 amis)

**Résultat**: Seuls les 3 amis reçoivent les messages

### Scenario 3: Plusieurs Groupes sur Même Fréquence

**Objectif**: 2 équipes séparées sur la même zone

**Équipe Alpha**:
- Fréquence: 869.525 MHz
- Canal: 1, Secret: "alpha-2024"

**Équipe Beta**:
- Fréquence: 869.525 MHz
- Canal: 2, Secret: "beta-2024"

**Résultat**: Les équipes ne se voient pas mutuellement

### Scenario 4: Réseaux Séparés Géographiquement

**Objectif**: 2 réseaux indépendants dans des villes différentes

**Réseau Paris**:
- Fréquence: 868.100 MHz
- Canal: 0

**Réseau Lyon**:
- Fréquence: 869.525 MHz
- Canal: 0

**Résultat**: Aucune interférence entre les réseaux

---

## ⚠️ Règles Importantes

### Règle 1: Fréquence = Tous identiques

❌ **NE fonctionnera PAS**:
- Device A: 868.1 MHz
- Device B: 869.5 MHz

✅ **Fonctionne**:
- Device A: 869.525 MHz
- Device B: 869.525 MHz

### Règle 2: Canal = Groupe identique

❌ **NE fonctionnera PAS**:
- Device A: Canal 1, secret "abc"
- Device B: Canal 1, secret "xyz"

✅ **Fonctionne**:
- Device A: Canal 1, secret "abc"
- Device B: Canal 1, secret "abc"

### Règle 3: Canal 0 = Toujours public

Même avec un secret, le canal 0 reste le canal par défaut pour:
- Les adverts (annonces de nœuds)
- Les messages de service
- Les broadcasts d'urgence

---

## 🐛 Dépannage

### "Message envoyé mais pas reçu"

**Vérifier**:
1. ✅ Même fréquence radio
2. ✅ Même canal logique
3. ✅ Même secret (si canal privé)
4. ✅ Distance < portée radio
5. ✅ Pas d'obstacles importants

### "Canal non configuré"

**Solution**:
1. Déconnectez BLE
2. Reconnectez BLE
3. Attendez "Canal 0 configuré" dans les logs
4. Si persistant: Redémarrez l'app

### "Impossible de changer la fréquence"

**Normal!** La fréquence est hardcodée dans le firmware.
Pour changer:
1. Modifiez `LORA_FREQ` dans le firmware
2. Reflashez l'ESP32
3. Tous les devices doivent être reflahés avec la même fréquence

---

## 📊 Tableau Récapitulatif

| Paramètre | Modifiable App | Doit être identique | Stockage |
|-----------|----------------|---------------------|----------|
| Fréquence (MHz) | ❌ Non | ✅ Tous | Firmware ESP32 |
| Spreading Factor | ❌ Non | ✅ Tous | Firmware ESP32 |
| Bandwidth | ❌ Non | ✅ Tous | Firmware ESP32 |
| Canal (0-7) | ✅ Oui | ✅ Groupe | Firmware ESP32 + Cache App |
| Secret canal | ✅ Oui | ✅ Groupe | Firmware ESP32 |
| Nom canal | ✅ Oui | ❌ Non (info seule) | Firmware ESP32 |

---

## 🔗 Références

- [MeshCore Protocol](MESHCORE_PROTOCOL.md)
- [Broadcast Flood Fix](BROADCAST_FLOOD_FIX.md)
- [Intégration MeshCore](docs/INTEGRATION_MESHCORE_COMPLETE.md)

---

**Auteur**: Silexperience  
**Version**: 1.0 - 25 Février 2026
