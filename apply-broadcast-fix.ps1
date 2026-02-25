# Script PowerShell pour appliquer les corrections du broadcast flood
# Usage: .\apply-broadcast-fix.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Broadcast Flood Fix - MeshCore" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier qu'on est dans le bon dossier
if (-not (Test-Path "./utils/ble-gateway.ts")) {
    Write-Host "ERREUR: Ce script doit être exécuté depuis la racine du projet BitMesh!" -ForegroundColor Red
    exit 1
}

# Sauvegarder les fichiers originaux
Write-Host "📦 Sauvegarde des fichiers originaux..." -ForegroundColor Yellow

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

if (Test-Path "./utils/ble-gateway.ts") {
    Copy-Item "./utils/ble-gateway.ts" "./utils/ble-gateway.ts.backup.$timestamp"
    Write-Host "  ✓ utils/ble-gateway.ts sauvegardé"
}

if (Test-Path "./providers/BleProvider.tsx") {
    Copy-Item "./providers/BleProvider.tsx" "./providers/BleProvider.tsx.backup.$timestamp"
    Write-Host "  ✓ providers/BleProvider.tsx sauvegardé"
}

# Appliquer les corrections
Write-Host ""
Write-Host "🔧 Application des corrections..." -ForegroundColor Yellow

# 1. Remplacer le gateway
if (Test-Path "./utils/ble-gateway-fixed.ts") {
    Copy-Item "./utils/ble-gateway-fixed.ts" "./utils/ble-gateway.ts" -Force
    Write-Host "  ✓ Gateway BLE corrigé appliqué"
} else {
    Write-Host "  ✗ Fichier utils/ble-gateway-fixed.ts non trouvé!" -ForegroundColor Red
}

# 2. Remplacer le provider
if (Test-Path "./providers/BleProvider-fixed.tsx") {
    Copy-Item "./providers/BleProvider-fixed.tsx" "./providers/BleProvider.tsx" -Force
    Write-Host "  ✓ BleProvider corrigé appliqué"
} else {
    Write-Host "  ✗ Fichier providers/BleProvider-fixed.tsx non trouvé!" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✅ Corrections appliquées!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Nouveaux fichiers:" -ForegroundColor Cyan
Write-Host "  📁 components/RadioConfigModal.tsx" -ForegroundColor White
Write-Host "  📁 components/MeshDebugger.tsx" -ForegroundColor White
Write-Host "  📁 hooks/useMeshDiagnostics.ts" -ForegroundColor White
Write-Host "  📁 app/(tabs)/mesh/debug.tsx" -ForegroundColor White
Write-Host ""
Write-Host "Prochaines étapes:" -ForegroundColor Cyan
Write-Host "  1. Redémarrez Metro: npx expo start --clear" -ForegroundColor White
Write-Host "  2. Reconnectez votre device BLE" -ForegroundColor White
Write-Host "  3. Vérifiez les logs: Canal 0 (public) configuré" -ForegroundColor White
Write-Host "  4. Ouvrez Mesh Debugger: Mesh → Configurer Canaux → Debugger" -ForegroundColor White
Write-Host "  5. Lancez 'Test Complet' pour valider" -ForegroundColor White
Write-Host ""
Write-Host "Documentation:" -ForegroundColor Yellow
Write-Host "  📖 BROADCAST_FLOOD_FIX.md" -ForegroundColor Gray
Write-Host "  📖 CHANNEL_AND_FREQUENCY_GUIDE.md" -ForegroundColor Gray
Write-Host "  📖 MESH_DEBUGGER_GUIDE.md" -ForegroundColor Gray
Write-Host ""
Write-Host "Pour annuler les changements:" -ForegroundColor Yellow
Write-Host "  utils/ble-gateway.ts.backup.$timestamp" -ForegroundColor Gray
Write-Host "  providers/BleProvider.tsx.backup.$timestamp" -ForegroundColor Gray
Write-Host ""
