# Bundled into the installer (see build/installer.nsh). Starts a downloaded
# installer after a short delay: the running installer holds a single-instance
# mutex keyed on the app id, so the new one can only start once the current
# one has fully exited.
param([Parameter(Mandatory = $true)][string]$Path)

Start-Sleep -Seconds 3
Start-Process -FilePath $Path
