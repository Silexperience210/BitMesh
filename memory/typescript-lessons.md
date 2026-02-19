# 🧠 SOUVENIRS - Erreurs corrigées à ne plus refaire

## 📋 Liste des erreurs TypeScript corrigées

### 1. Propriété `from` → `fromNodeId`
**Problème:** Le type `StoredMessage` utilise `fromNodeId`, pas `from`
**Solution:** Toujours utiliser `fromNodeId` dans tout le code
**Fichiers concernés:** MessagesProvider.ts, chatId.tsx, etc.

### 2. Fonctions mempool avec URL optionnelle
**Problème:** Les fonctions comme `getAddressBalance` n'acceptaient pas d'URL personnalisée
**Solution:** Ajouter paramètre `url?: string` avec fallback sur `MEMPOOL_API_BASE`
**Fichiers:** mempool.ts

### 3. Type `undefined` dans les interfaces
**Problème:** `wire.from` peut être `undefined` mais utilisé comme clé d'objet
**Solution:** Toujours vérifier avec fallback: `const value = wire.from || 'default'`

### 4. Cast de types complexes
**Problème:** Conversion entre types incompatibles (PSBT Transaction vs bitcoin Transaction)
**Solution:** Utiliser `as unknown as Type` pour les conversions forcées

### 5. Module non trouvé (expo-camera)
**Problème:** TypeScript ne trouve pas les types de expo-camera
**Solution:** Créer `types.d.ts` avec `declare module "expo-camera";`

### 6. Méthodes inexistantes sur les classes
**Problème:** `bitcoin.ECPair` n'existe pas dans cette version de bitcoinjs-lib
**Solution:** Vérifier la documentation de la librairie avant d'utiliser

### 7. Type union trop restrictif
**Problème:** `MessageType` inclut `'lora'` mais la fonction n'accepte que `'text' | 'cashu' | 'btc_tx'`
**Solution:** Caster avec `as 'text' | 'cashu' | 'btc_tx'` ou élargir le type cible

### 8. Uint8Array vs types personnalisés
**Problème:** `msg.packet` est `Uint8Array` mais `sendPacket` attend `MeshCorePacket`
**Solution:** Caster avec `as any` quand on est sûr du type à l'exécution

### 9. Return type nullable
**Problème:** `return db` où `db: SQLiteDatabase | null`
**Solution:** Utiliser `return db!` (non-null assertion) ou vérifier avant

### 10. Arguments de fonctions
**Problème:** Mauvais nombre ou ordre d'arguments
**Solution:** Toujours vérifier la signature de la fonction avant d'appeler

## 🎯 Règles d'or pour éviter les erreurs

1. **Toujours vérifier les types des propriétés** avant d'utiliser
2. **Utiliser des fallbacks** pour les valeurs optionnelles: `value || 'default'`
3. **Caster en dernier recours** quand on est sûr du type
4. **Vérifier les signatures** des fonctions avant d'appeler
5. **Créer des déclarations de modules** pour les libs sans types
6. **Tester avec `tsc --noEmit`** régulièrement pendant le développement

## 📁 Fichiers critiques à vérifier systématiquement

- `providers/MessagesProvider.ts` - Beaucoup de types complexes
- `utils/mempool.ts` - API externe, types d'entrée/sortie
- `utils/bitcoin-tx.ts` - Librairie externe bitcoinjs-lib
- `services/*.ts` - Interactions entre services
- `app/(tabs)/**/*.tsx` - Composants UI avec props complexes
