@echo off
REM ============================================================================
REM  run-android.bat - build the app and put it on a phone/emulator, start to
REM  finish. Double-click it, or run it from a terminal.
REM
REM  What it does:
REM    1. finds the Android SDK
REM    2. if no device is attached, boots an emulator and waits for it
REM    3. npm run build  ->  cap sync android  ->  gradlew assembleDebug
REM    4. re-checks the device, then installs the debug APK and launches it
REM
REM  Step 4 re-checks on purpose: step 3 can run for minutes, which is plenty
REM  of time for an emulator to be closed or a USB cable to be knocked out, and
REM  the old failure mode was a completed build dying at the last line with
REM  "no devices/emulators found". Now it just waits for the device to come
REM  back (or reboots the emulator) instead of throwing the build away.
REM
REM  Stale emulators get cleared out at the start of every run, but a HEALTHY
REM  running emulator is reused rather than restarted. Only ones adb reports as
REM  offline/unauthorized - i.e. wedged, the ones that actually break a run -
REM  are shut down. Physical devices are never touched.
REM
REM  This is deliberately not "always restart": a cold boot of a current AVD
REM  was measured at over ten minutes on this machine, against ~4 seconds for
REM  the entire build when the emulator is already up. Paying that on every run
REM  to check a UI tweak is not a good trade. --restart-emulator forces the
REM  full shutdown-and-cold-boot when you do want a clean device.
REM
REM  Flags (any order):
REM    --no-build         skip the web build + cap sync; just recompile and
REM                       install. Only safe when nothing under src/ changed -
REM                       Gradle will otherwise bundle the previously synced
REM                       (stale) web assets.
REM    --restart-emulator shut down every running emulator first and cold-boot
REM                       a fresh one. Adds 10+ minutes.
REM    --no-emulator      don't start an emulator; fail if no device is attached
REM    --avd <name>       use a specific AVD instead of the first one listed
REM    --logs             tail the app's logcat output after launching
REM    --no-pause         don't wait for a keypress at the end
REM
REM  Control flow here is deliberately flat (goto, not nested parentheses):
REM  cmd mis-parses labels inside a parenthesized block, and
REM  `if errorlevel 1 echo x & goto y` runs the goto unconditionally.
REM  Messages avoid "!" too - delayed expansion eats it inside echo.
REM ============================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0\.."

set "DO_BUILD=1"
set "USE_EMULATOR=1"
set "AVD="
set "DO_LOGS=0"
set "DO_PAUSE=1"
set "APPID=com.juicewrldapi.player"
set "EMU_STARTED=0"
REM 0 = only clear out wedged emulators, 1 = shut down all of them
set "KILL_ALL_EMULATORS=0"
set "DEVICE="

REM ---- Arguments ------------------------------------------------------------
:parseargs
if "%~1"=="" goto argsdone
if /i "%~1"=="--no-build"         ( set "DO_BUILD=0"           & shift & goto parseargs )
if /i "%~1"=="--restart-emulator" ( set "KILL_ALL_EMULATORS=1" & shift & goto parseargs )
if /i "%~1"=="--no-emulator"      ( set "USE_EMULATOR=0"       & shift & goto parseargs )
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

REM Start the daemon now so its "* daemon not running" chatter doesn't land in
REM the middle of a device listing later.
"%ADB%" start-server >nul 2>&1

REM ---- Clean slate ----------------------------------------------------------
call :killemulators

REM ---- Make sure something is attached --------------------------------------
call :ensuredevice
if errorlevel 1 goto fail

REM ---- Build ----------------------------------------------------------------
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
REM Explicit path, not a bare `gradlew.bat`: this machine has
REM NoDefaultCurrentDirectoryInExePath=1, a Windows security setting that
REM disables cmd.exe's implicit "also search the current directory" step when
REM resolving an executable. A bare name fails to resolve even with cwd set
REM correctly - and only for executables, so `dir` and friends still work,
REM which makes it a confusing one to hit.
set "GRADLEW=%CD%\android\gradlew.bat"
if not exist "%GRADLEW%" goto err_nogradlew
pushd android
call "%GRADLEW%" assembleDebug
set "GRADLE_RC=%errorlevel%"
popd
if not "%GRADLE_RC%"=="0" goto err_gradle

set "APK=android\app\build\outputs\apk\debug\app-debug.apk"
if not exist "%APK%" goto err_noapk

REM ---- Install and launch ---------------------------------------------------
REM The build may have outlived the device it was aimed at.
echo.
call :ensuredevice
if errorlevel 1 goto fail

echo.
echo ==^> Installing on !DEVICE!
"%ADB%" -s "!DEVICE!" install -r "%APK%"
if errorlevel 1 goto err_install

echo ==^> Launching
"%ADB%" -s "!DEVICE!" shell am start -n %APPID%/.MainActivity
if errorlevel 1 goto err_launch

echo.
echo Done - the app is running on !DEVICE!.

if "%DO_LOGS%"=="0" goto finish
echo.
echo ==^> Logcat ^(Ctrl+C to stop^)
"%ADB%" -s "!DEVICE!" logcat -v brief Capacitor:V chromium:V *:S

:finish
if "%DO_PAUSE%"=="1" pause
exit /b 0


REM ===========================================================================
REM  Subroutines
REM ===========================================================================

REM ---- Clears out emulators, leaving physical devices alone -----------------
REM Serial prefix is the discriminator: emulators are always "emulator-<port>",
REM a handset is its hardware serial.
REM
REM By default only emulators that adb does NOT report as "device" get killed -
REM offline, unauthorized, or still-half-dead ones, which are the ones that
REM actually derail a run. A healthy emulator is left alone and reused, because
REM replacing it costs a 10+ minute cold boot. --restart-emulator kills every
REM emulator regardless of state.
:killemulators
set "FOUND_EMU=0"
for /f "usebackq skip=1 tokens=1,2" %%a in (`"%ADB%" devices`) do call :killone "%%a" "%%b"
if "%FOUND_EMU%"=="0" exit /b 0

echo     Waiting for it to exit...
set /a TRIES=0
:ke_wait
set "STILL=0"
for /f "usebackq skip=1 tokens=1,2" %%a in (`"%ADB%" devices`) do call :countemu "%%a"
if "!STILL!"=="0" goto ke_done
set /a TRIES+=1
if !TRIES! GTR 15 goto ke_force
call :sleep3
goto ke_wait

:ke_force
REM `adb emu kill` is a request, and a hung emulator can ignore it. Last
REM resort: kill the processes outright. Scoped to the emulator's own binaries,
REM but note this would also catch an unrelated QEMU VM if one were running.
echo     Not responding - forcing it down.
taskkill /f /im qemu-system-x86_64.exe >nul 2>&1
taskkill /f /im qemu-system-aarch64.exe >nul 2>&1
taskkill /f /im emulator.exe >nul 2>&1
call :sleep3

:ke_done
REM The dead emulator can linger in adb's device list; a server bounce clears
REM it so the boot wait below isn't satisfied by a ghost.
"%ADB%" kill-server >nul 2>&1
"%ADB%" start-server >nul 2>&1
echo     Done.
exit /b 0

:killone
set "SER=%~1"
set "STATE=%~2"
if /i not "!SER:~0,9!"=="emulator-" exit /b 0
REM Healthy and we weren't told to replace it - leave it running.
if "%KILL_ALL_EMULATORS%"=="0" if "!STATE!"=="device" (
  echo ==^> Reusing running emulator !SER!
  exit /b 0
)
if "%FOUND_EMU%"=="0" echo ==^> Shutting down emulators
set "FOUND_EMU=1"
if "!STATE!"=="device" ( echo     Stopping !SER! ) else ( echo     Stopping !SER! [!STATE!] )
"%ADB%" -s "!SER!" emu kill >nul 2>&1
exit /b 0

:countemu
set "SER=%~1"
if /i "!SER:~0,9!"=="emulator-" set "STILL=1"
exit /b 0

REM ---- Sets DEVICE to the first attached, ready device (empty if none) ------
REM Only lines whose second column is exactly "device" count: a handset that is
REM "offline", "unauthorized" (USB debugging prompt not accepted) or still
REM booting must not be treated as installable.
:finddevice
set "DEVICE="
for /f "usebackq skip=1 tokens=1,2" %%a in (`"%ADB%" devices`) do if "%%b"=="device" if not defined DEVICE set "DEVICE=%%a"
exit /b 0

REM ---- Guarantees a usable device in DEVICE, booting an emulator if needed --
:ensuredevice
call :finddevice
if not defined DEVICE goto ed_nodevice
echo ==^> Using device !DEVICE!
exit /b 0

:ed_nodevice
if "%USE_EMULATOR%"=="0" (
  echo [ERROR] No device or emulator attached, and --no-emulator was passed.
  exit /b 1
)
REM Already launched one this run - it went away or never came up. Starting a
REM second copy of the same AVD just fails with a lock error, so wait instead.
if "%EMU_STARTED%"=="1" goto ed_wait

if not exist "%EMULATOR%" (
  echo [ERROR] No device attached, and the emulator is not installed.
  echo         Plug in a phone with USB debugging on, or install the Android
  echo         Emulator through Android Studio's SDK Manager.
  exit /b 1
)
if defined AVD goto ed_haveavd
for /f "usebackq delims=" %%a in (`"%EMULATOR%" -list-avds`) do if not defined AVD set "AVD=%%a"
if not defined AVD (
  echo [ERROR] No AVDs exist. Create one in Android Studio's Device Manager.
  exit /b 1
)
:ed_haveavd
echo ==^> Booting emulator: !AVD!
echo     Leave its window open until this script finishes - closing it
echo     mid-build is what makes the install step fail.
REM -no-snapshot-load forces a real cold boot instead of restoring Quick Boot's
REM saved RAM image. That snapshot is written when the emulator is shut down,
REM so a hard kill (this script's own taskkill fallback, a crash, closing the
REM window mid-write) leaves a corrupt one behind - and restoring it hangs the
REM emulator on a black screen forever, with sys.boot_completed never flipping.
REM That looks exactly like "booting very slowly", which is what made it hard
REM to spot. Cold booting costs a little startup time and cannot wedge.
REM Userdata is untouched either way - installed apps and settings survive.
REM
REM Its own window, and its handles pointed at nul rather than inherited: cmd
REM hands a started child whatever stdout this script has, so when the script's
REM own output is piped somewhere, the emulator writes into that same pipe and
REM stalls the moment nobody drains it - which looks exactly like a device that
REM boots forever.
start "Android Emulator - !AVD!" /D "%SDK%\emulator" "%EMULATOR%" -avd "!AVD!" -no-snapshot-load -no-boot-anim >nul 2>&1
set "EMU_STARTED=1"

REM Each phase below gets its own budget. They used to share one counter, so
REM the minute or two an emulator spends before it even appears in `adb
REM devices` was billed against the boot wait, and a first cold boot of a
REM current AVD - which really can take ten minutes on a machine that is also
REM compiling - got killed as "never finished booting" while it was still
REM going. Sleeps use ping rather than `timeout`, which refuses to run at all
REM when stdin is redirected.
:ed_wait
echo     Waiting for the device. A first cold boot can take several minutes.
set /a TRIES=0

:ed_waitloop
call :finddevice
if defined DEVICE goto ed_bootstart
set /a TRIES+=1
if !TRIES! GTR 100 (
  echo [ERROR] No device showed up after 5 minutes. If the emulator window
  echo         closed or never opened, reopen it and run this again.
  exit /b 1
)
call :heartbeat "waiting for the emulator to appear"
call :sleep3
goto ed_waitloop

:ed_bootstart
echo     Device !DEVICE! attached - waiting for Android to finish booting...
set /a TRIES=0

REM Fail fast. A healthy cold boot of this AVD is ~40 seconds; past about three
REM minutes it is wedged, not slow, and waiting longer has never once turned
REM into a successful run - it just burns time before the same failure. So the
REM budget is deliberately short and the message says what to actually do.
:ed_waitboot
set "BOOTED="
for /f "usebackq delims=" %%b in (`"%ADB%" -s "!DEVICE!" shell getprop sys.boot_completed 2^>nul`) do set "BOOTED=%%b"
REM Substring compare: adb's output carries a trailing CR, which breaks =="1".
if "!BOOTED:~0,1!"=="1" goto ed_pmstart
REM Second opinions: some images set one of these well before the others.
set "BOOTED="
for /f "usebackq delims=" %%b in (`"%ADB%" -s "!DEVICE!" shell getprop dev.bootcomplete 2^>nul`) do set "BOOTED=%%b"
if "!BOOTED:~0,1!"=="1" goto ed_pmstart
set "ANIM="
for /f "usebackq delims=" %%b in (`"%ADB%" -s "!DEVICE!" shell getprop init.svc.bootanim 2^>nul`) do set "ANIM=%%b"
if "!ANIM:~0,7!"=="stopped" goto ed_pmstart
set /a TRIES+=1
if !TRIES! GTR 60 (
  echo [ERROR] The emulator is stuck - 3 minutes without finishing boot, when a
  echo         healthy cold boot takes about 40 seconds. It is almost certainly
  echo         sitting on a black screen. Fastest fix:
  echo.
  echo           1. close the emulator window
  echo           2. delete "%USERPROFILE%\.android\avd\%AVD%.avd\snapshots"
  echo           3. start the emulator yourself from Android Studio's Device
  echo              Manager, wait for the home screen, then run this again -
  echo              it reuses a running emulator and takes seconds
  exit /b 1
)
call :heartbeat "still booting"
call :sleep3
call :finddevice
if not defined DEVICE goto ed_waitloop
goto ed_waitboot

:ed_pmstart
set /a TRIES=0

:ed_waitpm
REM boot_completed flips before the package manager is actually serving, and
REM installing into that window dies with "Can't find service: package".
set "PMOK="
for /f "usebackq delims=" %%p in (`"%ADB%" -s "!DEVICE!" shell pm path android 2^>nul`) do set "PMOK=%%p"
if defined PMOK goto ed_ready
set /a TRIES+=1
if !TRIES! GTR 60 (
  echo [ERROR] The package manager never came up on !DEVICE!.
  exit /b 1
)
call :heartbeat "waiting for the package manager"
call :sleep3
goto ed_waitpm

:ed_ready
echo     Device ready: !DEVICE!
exit /b 0

REM ---- ~3 second sleep ------------------------------------------------------
:sleep3
ping -n 4 127.0.0.1 >nul 2>&1
exit /b 0

REM ---- Progress note every 10th tick, so a long wait doesn't look hung ------
:heartbeat
set /a HB=TRIES %% 10
if not "!HB!"=="0" exit /b 0
set /a HBSECS=TRIES*3
echo     ... !HBSECS!s - %~1
exit /b 0


REM ===========================================================================
REM  Failures
REM ===========================================================================
:err_nosdk
echo [ERROR] No Android SDK found at "%SDK%".
echo         Install it through Android Studio, or set ANDROID_HOME.
goto fail

:err_webbuild
echo [ERROR] Web build failed ^(tsc or vite^) - nothing was installed.
goto fail

:err_sync
echo [ERROR] cap sync failed.
goto fail

:err_nogradlew
echo [ERROR] gradlew.bat not found at "%GRADLEW%".
echo         Run this from the repo, and make sure the android/ folder exists.
goto fail

:err_gradle
echo [ERROR] Gradle build failed.
goto fail

:err_noapk
echo [ERROR] APK not found at %APK%.
goto fail

:err_install
echo [ERROR] Install failed. If it mentions signatures, remove the old copy first:
echo             "%ADB%" uninstall %APPID%
goto fail

:err_launch
echo [ERROR] The app installed but would not launch.
goto fail

:fail
echo.
echo BUILD FAILED.
if "%DO_PAUSE%"=="1" pause
exit /b 1
