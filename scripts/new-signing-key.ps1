param(
    [Parameter(Mandatory)][string]$Directory,
    [Parameter(Mandatory)][string]$OpenSsl
)
$ErrorActionPreference = 'Stop'
$taskDirectory = [IO.Path]::GetFullPath($Directory)
$taskKeystore = Join-Path $taskDirectory 'chalanger-release.p12'
$taskSettings = Join-Path $taskDirectory 'signing-settings.json'
if ((Test-Path -LiteralPath $taskKeystore) -or (Test-Path -LiteralPath $taskSettings)) {
    throw 'Signing material already exists. Do not replace the permanent signing key.'
}
New-Item -ItemType Directory -Force -Path $taskDirectory | Out-Null
$taskOwner = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $taskDirectory /inheritance:r /grant:r "${taskOwner}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect the signing directory.' }
$taskBytes = [byte[]]::new(32)
[Security.Cryptography.RandomNumberGenerator]::Fill($taskBytes)
$taskPassword = [Convert]::ToBase64String($taskBytes)
$taskPrevious = $env:CHALANGER_SIGNING_PASSWORD
$env:CHALANGER_SIGNING_PASSWORD = $taskPassword
$taskPem = Join-Path $taskDirectory 'temporary-encrypted-key.pem'
$taskCertificate = Join-Path $taskDirectory 'chalanger-release-certificate.pem'
try {
    & $OpenSsl req -x509 -newkey rsa:3072 -sha256 -days 10950 -subj '/CN=Ruslan N/O=Chalanger/C=RU' -addext 'basicConstraints=critical,CA:FALSE' -addext 'keyUsage=critical,digitalSignature' -passout env:CHALANGER_SIGNING_PASSWORD -keyout $taskPem -out $taskCertificate
    if ($LASTEXITCODE -ne 0) { throw 'Certificate generation failed.' }
    & $OpenSsl pkcs12 -export -inkey $taskPem -passin env:CHALANGER_SIGNING_PASSWORD -in $taskCertificate -out $taskKeystore -name chalanger-release -passout env:CHALANGER_SIGNING_PASSWORD
    if ($LASTEXITCODE -ne 0) { throw 'Keystore export failed.' }
    $taskFingerprint = & $OpenSsl x509 -in $taskCertificate -noout -fingerprint -sha256
    if ($LASTEXITCODE -ne 0) { throw 'Certificate verification failed.' }
    $taskDigest = ($taskFingerprint -replace '^.*=', '' -replace ':', '').Trim().ToLowerInvariant()
    @{ keystore = $taskKeystore; alias = 'chalanger-release'; password = $taskPassword; certificateSha256 = $taskDigest; package = 'ru.lambadazzz.chalanger' } |
        ConvertTo-Json | Set-Content -LiteralPath $taskSettings -Encoding utf8
    Remove-Item -LiteralPath $taskPem
    Write-Output ('Permanent certificate SHA-256: ' + $taskDigest)
    Write-Output ('Private signing material saved in: ' + $taskDirectory)
} finally { $env:CHALANGER_SIGNING_PASSWORD = $taskPrevious }
