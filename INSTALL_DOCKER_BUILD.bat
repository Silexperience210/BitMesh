@echo off
echo ================================================
echo Installation Docker Desktop pour Build Android
echo ================================================
echo.

REM Vérifier si Docker est déjà installé
docker --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Docker est deja installe !
    docker --version
    goto :build
)

echo [STEP 1/4] Installation Docker Desktop...
echo.

REM Vérifier si l'installateur existe
if not exist "%USERPROFILE%\Downloads\DockerDesktopInstaller.exe" (
    echo [ERREUR] Installateur non trouve dans Downloads
    echo Telechargement en cours...
    echo Veuillez patienter...
    timeout /t 5
    goto :check_installer
)

:check_installer
if exist "%USERPROFILE%\Downloads\DockerDesktopInstaller.exe" (
    echo [OK] Installateur trouve !
    echo.
    echo Lancement de l'installation...
    echo IMPORTANT: Acceptez les parametres par defaut
    echo.
    start /wait "%USERPROFILE%\Downloads\DockerDesktopInstaller.exe" install --quiet --accept-license

    echo.
    echo [STEP 2/4] Redemarrage requis
    echo ATTENTION: Windows va redemarrer dans 60 secondes
    echo Sauvegardez votre travail !
    echo.
    choice /C YN /M "Redemarrer maintenant"
    if errorlevel 2 goto :manual_restart
    shutdown /r /t 60 /c "Redemarrage pour finaliser installation Docker"
    goto :end
) else (
    echo [ERREUR] Telechargement en cours...
    echo Veuillez patienter que le telechargement se termine
    echo Puis relancez ce script
    goto :end
)

:manual_restart
echo.
echo Veuillez redemarrer Windows manuellement
echo Puis lancez Docker Desktop depuis le menu Demarrer
echo Enfin, relancez ce script pour continuer le build
goto :end

:build
echo.
echo [STEP 3/4] Verification Docker demarre...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ATTENTION] Docker n'est pas demarre
    echo 1. Lancez "Docker Desktop" depuis le menu Demarrer
    echo 2. Attendez que l'icone Docker soit verte dans la barre des taches
    echo 3. Relancez ce script
    pause
    goto :end
)

echo [OK] Docker est actif !
echo.

echo [STEP 4/4] Lancement build Android...
cd /d "%~dp0"
echo Dossier: %CD%
echo.
echo ATTENTION: Premier build peut prendre 20-30 minutes
echo (Telechargement image Docker Android ~2-3 GB)
echo.
pause

npx eas build --platform android --local

echo.
echo ================================================
echo Build termine !
echo ================================================
echo.
echo L'APK se trouve dans le dossier du projet
dir *.apk /s /b 2>nul
echo.

:end
pause
