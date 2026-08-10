@echo off
REM ============================================================================
REM  run-android.bat - build the app and put it on a phone/emulator, start to
REM  finish. Double-click it, or run it from a terminal.
REM
REM  What it does:
REM    1. finds the Android SDK
REM    2. if no device is attached, boots an emulator and waits for it
REM    3. npm run build  ->  cap sync android  ->  gradlew assembleDebug
REM    4. installs the debug APK and launches the app
REM
REM  Flags (any order):
REM    --no-build    skip the web build + cap sync; just recompile and install.
REM                  Only safe when nothing under src/ changed - Gradle will
REM                  otherwise bundle the previously synced (stale) web assets.
REM    --no-emulator don't start an emulator; fail if no device is attached
REM    --avd <name>  use a specific AVD instead of the first one listed
REM    --logs        tail the app's logcat output after launching
REM    --no-pause    don't wait for a keypress at the end
REM
REM  Control flow here is deliberately flat (goto, not nested parentheses):
REM  cmd mis-parses labels inside a parenthesized block, and
REM  `if errorlevel 1 echo x & goto y` runs the goto unconditionally.
REM ============================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0\.."

set "DO_BUILD=1"
set "USE_EMULATOR=1"
set "AVD="
set "DO_LOGS=0"
set "DO_PAUSE=1"
set "APPID=com.juicewrldapi.player"

REM ---- Arguments ------------------------------------------------------------
:parseargs
if "%~1"=="" goto argsdone
if /i "%~1"=="--no-build"    ( set "DO_BUILD=0"     & shift & goto parseargs )
if /i "%~1"=="--no-emulator" ( set "USE_EMULATOR=0" & shift & goto parseargs )
if /i "%~1"=="--logs"        ( set "DO_LOGS=1"      & shift & goto parseargs )
if /i "%~1"=="--no-pause"    ( set "DO_PAUSE=0"     & shift & goto parseargs )
if /i "%~1"=="--avd"         ( set "AVD=%~2"        & shift & shift & goto parseargs )
echo [ERROR] Unknown option: %~1
goto fail
:argsdone

REM ---- Locate the SDK -------------------------------------------------------
set "SDK=%ANDROID_HOME%"
if not defined SDK set "SDK=%ANDROID_SDK_ROOT%"
if not defined SDK set "SDK=%LOCALAPPDATA%\Android\Sdk"
if not exist "%SDK%\platform-tools\adb.exe" goto err_nosdk
set "ADB=%SDK%\platform-tools\adb.exe"
set "EMULATOR=%SDK%\emulator\emulator.exe"

REM ---- Make sure something is attached --------------------------------------
call :finddevice
if defined DEVICE goto have_device

if "%USE_EMULATOR%"=="0" goto err_nodevice
if not exist "%EMULATOR%" goto err_noemulator

if defined AVD goto have_avd
for /f "usebackq delims=" %%a in (`"%EMULATOR%" -list-avds`) do if not defined AVD set "AVD=%%a"
if not defined AVD goto err_noavd
:have_avd

echo ==^> Booting emulator: %AVD%
REM Its own window, so the emulator's chatter doesn't drown out the build here.
start "Android Emulator - %AVD%" /D "%SDK%\emulator" "%EMULATOR%" -avd "%AVD%"
echo     Waiting for it to come up ^(a cold boot can take a couple of minutes^)...
"%ADB%" wait-for-device
set /a TRIES=0

:waitboot
set "BOOTED="
for /f "usebackq delims=" %%b in (`"%ADB%" shell getprop sys.boot_completed 2^>nul`) do set "BOOTED=%%b"
REM Substring compare: adb's output carries a trailing CR, which breaks =="1".
if "!BOOTED:~0,1!"=="1" goto booted
set /a TRIES+=1
if !TRIES! GTR 100 goto err_boottimeout
timeout /t 3 /nobreak >nul
goto waitboot

:booted
echo     Emulator ready.
call :finddevice
goto build

:have_device
echo ==^> Using device %DEVICE%

REM ---- Build ----------------------------------------------------------------
:build
if "%DO_BUILD%"=="0" goto skipbuild

echo.
echo ==^> Building web app
call npm run build
if errorlevel 1 goto err_webbuild

echo.
echo ==^> Syncing into the Android project
call npx cap sync android
if errorlevel 1 goto err_sync
goto compile

:skipbuild
echo ==^> Skipping web build ^(--no-build^)

:compile
echo.
echo ==^> Compiling debug APK
pushd android
call gradlew.bat assembleDebug
set "GRADLE_RC=%errorlevel%"
popd
if not "%GRADLE_RC%"=="0" goto err_gradle

REM ---- Install and launch ---------------------------------------------------
set "APK=android\app\build\outputs\apk\debug\app-debug.apk"
if not exist "%APK%" goto err_noapk

echo.
echo ==^> Installing
"%ADB%" install -r "%APK%"
if errorlevel 1 goto err_install

echo ==^> Launching
"%ADB%" shell am start -n %APPID%/.MainActivity
if errorlevel 1 goto err_launch

echo.
echo Done - the app is running on the device.

if "%DO_LOGS%"=="0" goto finish
echo.
echo ==^> Logcat ^(Ctrl+C to stop^)
"%ADB%" logcat -v brief Capacitor:V chromium:V *:S

:finish
if "%DO_PAUSE%"=="1" pause
exit /b 0

REM ---- Sets DEVICE to the first attached device, if any ----------------------
:finddevice
set "DEVICE="
for /f "usebackq skip=1 tokens=1,2" %%a in (`"%ADB%" devices`) do if "%%b"=="device" if not defined DEVICE set "DEVICE=%%a"
exit /b 0

REM ---- Failures -------------------------------------------------------------
:err_nosdk
echo [ERROR] No Android SDK found at "%SDK%".
echo     Install it through Android Studio, or set ANDROID_HOME.
goto fail

:err_nodevice
echo [ERROR] No device or emulator attached, and --no-emulator was passed.
goto fail

:err_noemulator
echo [ERROR] No device attached, and the emulator isn't installed.
echo     Plug in a phone with USB debugging on, or install the Android
echo     Emulator through Android Studio's SDK Manager.
goto fail

:err_noavd
echo [ERROR] No AVDs exist. Create one in Android Studio ^(Device Manager^).
goto fail

:err_boottimeout
echo [ERROR] The emulator didn't finish booting in time.
goto fail

:err_webbuild
echo [ERROR] Web build failed ^(tsc or vite^) - nothing was installed.
goto fail

:err_sync
echo [ERROR] cap sync failed.
goto fail

:err_gradle
echo [ERROR] Gradle build failed.
goto fail

:err_noapk
echo [ERROR] APK not found at %APK%.
goto fail

:err_install
echo [ERROR] Install failed. If it mentions signatures, remove the old copy first:
echo         "%ADB%" uninstall %APPID%
goto fail

:err_launch
echo [ERROR] The app installed but wouldn't launch.
goto fail

:fail
echo.
echo BUILD FAILED.
if "%DO_PAUSE%"=="1" pause
exit /b 1

