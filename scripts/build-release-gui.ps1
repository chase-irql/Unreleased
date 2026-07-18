# Packages release_gui.py into a standalone, double-clickable exe.
# Run once after changing release_gui.py; output lands in scripts/dist-gui/.
#
#   powershell -ExecutionPolicy Bypass -File scripts\build-release-gui.ps1
#
# Requires: pip install -r scripts\requirements-gui.txt

$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\.."
$root = (Get-Location).Path

pyinstaller --noconfirm --onefile --windowed `
    --name "Unreleased-Release" `
    --icon "$root\resources\icon.ico" `
    --distpath "scripts\dist-gui" `
    --workpath "scripts\build-gui" `
    --specpath "scripts\build-gui" `
    "scripts\release_gui.py"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Build FAILED (exit $LASTEXITCODE) -- see output above." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Built: scripts\dist-gui\Unreleased-Release.exe" -ForegroundColor Green
