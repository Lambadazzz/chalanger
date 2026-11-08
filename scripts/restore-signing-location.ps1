param([Parameter(Mandatory)][string]$PrivateDirectory)
$ErrorActionPreference = 'Stop'
$taskDirectory = (Resolve-Path -LiteralPath $PrivateDirectory).Path
$taskSettingsPath = Join-Path $taskDirectory 'signing-settings.json'
$taskKeystore = Join-Path $taskDirectory 'chalanger-release.p12'
if (!(Test-Path -LiteralPath $taskKeystore -PathType Leaf)) { throw 'Permanent keystore is missing. Do not create a replacement.' }
$taskSettings = Get-Content -LiteralPath $taskSettingsPath -Raw | ConvertFrom-Json
$taskPinned = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '../android/release-certificate.sha256') -Raw).Trim()
if ($taskSettings.certificateSha256 -ne $taskPinned -or $taskSettings.package -ne 'ru.lambadazzz.chalanger') {
    throw 'Signing materials do not belong to this project.'
}
if (!$taskSettings.password -or $taskSettings.alias -ne 'chalanger-release') { throw 'Signing settings are incomplete.' }
$taskOwner = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $taskDirectory /inheritance:r /grant:r "${taskOwner}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect the signing directory.' }
$taskSettings.keystore = $taskKeystore
$taskSettings | ConvertTo-Json | Set-Content -LiteralPath $taskSettingsPath -Encoding utf8
Write-Output ('Signing location restored: ' + $taskDirectory)
Write-Output ('Permanent certificate SHA-256: ' + $taskPinned)
