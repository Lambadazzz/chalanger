param(
    [Parameter(Mandatory)][string]$UnsignedApk,
    [Parameter(Mandatory)][string]$OutputApk,
    [Parameter(Mandatory)][string]$SigningSettings,
    [Parameter(Mandatory)][string]$JavaExecutable,
    [Parameter(Mandatory)][string]$ApkSignerJar,
    [Parameter(Mandatory)][string]$AaptExecutable
)
$ErrorActionPreference = 'Stop'
$taskSettings = Get-Content -LiteralPath $SigningSettings -Raw | ConvertFrom-Json
if (!$taskSettings.keystore -or !$taskSettings.password -or !$taskSettings.certificateSha256) { throw 'Incomplete signing settings.' }
$taskPinnedCertificate = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '../android/release-certificate.sha256') -Raw).Trim()
if ($taskSettings.certificateSha256 -ne $taskPinnedCertificate) { throw 'Signing settings do not match the permanent project certificate.' }
if (Test-Path -LiteralPath $OutputApk) { throw 'Output APK already exists. Choose a new versioned filename.' }
$taskBadging = (& $AaptExecutable dump badging $UnsignedApk) -join "`n"
if ($LASTEXITCODE -ne 0) { throw 'Could not read APK manifest.' }
$taskIdentity = [regex]::Match($taskBadging, "package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'")
if (!$taskIdentity.Success -or $taskIdentity.Groups[1].Value -ne $taskSettings.package) { throw 'Unexpected application package.' }
if ($taskBadging.Contains('application-debuggable')) { throw 'Refusing to sign a debuggable APK with the production key.' }
$taskPrevious = $env:CHALANGER_SIGNING_PASSWORD
$env:CHALANGER_SIGNING_PASSWORD = $taskSettings.password
try {
    & $JavaExecutable -jar $ApkSignerJar sign --ks $taskSettings.keystore --ks-type PKCS12 --ks-key-alias $taskSettings.alias --ks-pass env:CHALANGER_SIGNING_PASSWORD --key-pass env:CHALANGER_SIGNING_PASSWORD --out $OutputApk $UnsignedApk
    if ($LASTEXITCODE -ne 0) { throw 'APK signing failed.' }
    $taskVerification = (& $JavaExecutable -jar $ApkSignerJar verify --verbose --print-certs $OutputApk) -join "`n"
    if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
    $taskSigner = [regex]::Match($taskVerification, 'Signer #1 certificate SHA-256 digest: ([0-9a-fA-F]+)')
    if (!$taskSigner.Success -or $taskSigner.Groups[1].Value.ToLowerInvariant() -ne $taskSettings.certificateSha256) { throw 'APK signed with an unexpected certificate.' }
    @{ package = $taskIdentity.Groups[1].Value; versionCode = [int]$taskIdentity.Groups[2].Value; versionName = $taskIdentity.Groups[3].Value;
        debuggable = $false; certificateSha256 = $taskSettings.certificateSha256;
        apkSha256 = (Get-FileHash -LiteralPath $OutputApk -Algorithm SHA256).Hash.ToLowerInvariant() } |
        ConvertTo-Json | Set-Content -LiteralPath ($OutputApk + '.verification.json') -Encoding utf8
    Write-Output $taskVerification
    Write-Output ('Verified signed APK: ' + $OutputApk)
} finally { $env:CHALANGER_SIGNING_PASSWORD = $taskPrevious }
