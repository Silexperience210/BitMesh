# 🐳 Guide Installation Docker + Build Android Local

## 📥 Téléchargement en Cours

Docker Desktop Installer est en cours de téléchargement (~500 MB)
📂 Destination : `C:\Users\Silex\Downloads\DockerDesktopInstaller.exe`

---

## 🚀 Installation Automatisée

### Option 1 : Script Automatique (Recommandé)

**Double-cliquez sur** : `INSTALL_DOCKER_BUILD.bat`

Le script va :
1. ✅ Vérifier si Docker est installé
2. ✅ Lancer l'installation silencieuse
3. ✅ Vous proposer de redémarrer Windows
4. ✅ Vérifier que Docker démarre
5. ✅ Lancer le build Android automatiquement

---

### Option 2 : Installation Manuelle

#### Étape 1 : Installer Docker Desktop
```
1. Allez dans : C:\Users\Silex\Downloads\
2. Double-cliquez sur : DockerDesktopInstaller.exe
3. Cliquez "OK" sur toutes les fenêtres
4. Attendez la fin de l'installation (~5 min)
5. Cliquez "Close and restart" (IMPORTANT)
```

⚠️ **REDÉMARRAGE REQUIS** - Windows doit redémarrer

---

#### Étape 2 : Démarrer Docker (Après Redémarrage)
```
1. Menu Démarrer → Chercher "Docker Desktop"
2. Lancer Docker Desktop
3. Attendre que l'icône Docker (baleine) soit verte dans la barre des tâches
4. Status : "Docker Desktop is running"
```

⏱️ Premier démarrage : 2-3 minutes

---

#### Étape 3 : Vérifier Installation
Ouvrez **PowerShell** ou **Git Bash** :
```bash
docker --version
# Devrait afficher : Docker version 24.x.x

docker info
# Devrait afficher des infos sans erreur
```

✅ Si ça fonctionne, passez à l'étape 4

---

#### Étape 4 : Build Android Local
```bash
cd "C:\Users\Silex\Documents\BitMesh"

# Lancer le build avec EAS
npx eas build --platform android --local
```

**Ce qui va se passer** :
1. EAS télécharge l'image Docker Android (~2-3 GB) - **Première fois seulement**
2. Compile votre projet dans le container Docker
3. Génère l'APK dans le dossier du projet

⏱️ **Temps** :
- Premier build : 20-30 minutes (téléchargement image + compilation)
- Builds suivants : 5-10 minutes (juste compilation)

---

## 📦 Résultat Final

Après le build, vous aurez :
```
BitMesh/
├── build-XXXXXXXXXX.apk   ← Votre APK Android !
└── ...
```

**Installation sur téléphone** :
1. Transférer l'APK sur votre téléphone
2. Installer (autoriser sources inconnues si nécessaire)
3. ✅ L'app fonctionne hors ligne, sans Expo

---

## 🐛 Dépannage

### "Docker daemon not running"
**Solution** : Lancez Docker Desktop et attendez qu'il démarre

### "Permission denied" ou "Access denied"
**Solution** : Relancez le terminal en Administrateur

### "Image pull failed"
**Solution** :
```bash
# Vérifier connexion Internet
ping google.com

# Retry le build
npx eas build --platform android --local
```

### Build échoue avec erreur Java/Gradle
**Solution** :
```bash
# Nettoyer cache
cd "C:\Users\Silex\Documents\BitMesh"
rm -rf android/.gradle android/build
npx eas build --platform android --local --clear-cache
```

---

## ⚡ Alternative : Expo Go (Test Rapide)

Si Docker prend trop de temps, testez avec Expo Go :

```bash
# Sur votre PC
cd "C:\Users\Silex\Documents\BitMesh"
npx expo start

# Sur votre téléphone Android
1. Installer "Expo Go" depuis Play Store
2. Scanner le QR code affiché
3. ✅ L'app se lance immédiatement
```

**Différences Expo Go vs Build Local** :
- Expo Go : ✅ Test rapide, ❌ Dépend d'Expo
- Build Local : ✅ APK standalone, ❌ Plus long

---

## 📊 Checklist Complète

- [ ] Docker Desktop téléchargé
- [ ] Docker Desktop installé
- [ ] Windows redémarré
- [ ] Docker Desktop lancé et actif (icône verte)
- [ ] `docker --version` fonctionne
- [ ] `npx eas build --platform android --local` lancé
- [ ] Build terminé sans erreur
- [ ] APK généré dans le dossier
- [ ] APK installé sur téléphone
- [ ] App fonctionne ! 🎉

---

**Besoin d'aide ? Vérifiez les logs de build ou demandez assistance.**
