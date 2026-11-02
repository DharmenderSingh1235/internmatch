$ErrorActionPreference = "Stop"

$envPath = Join-Path $PSScriptRoot ".env"
$secureUri = Read-Host "Paste your MongoDB Atlas connection URI (input is hidden)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureUri)
try {
    $mongoUri = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim()
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ($mongoUri -notmatch '^mongodb(\+srv)?://\S+$') {
    throw "That doesn't look like a MongoDB URI. It should start with mongodb:// or mongodb+srv://."
}

$lines = if (Test-Path -LiteralPath $envPath) { @(Get-Content -LiteralPath $envPath) } else { @() }
$uriLine = 'MONGODB_URI="' + $mongoUri.Replace('"', '\"') + '"'
$dbLine = 'MONGODB_DB=internmatch'
$uriFound = $false
$dbFound = $false
$updated = foreach ($line in $lines) {
    if ($line -match '^\s*MONGODB_URI\s*=') {
        if (-not $uriFound) { $uriFound = $true; $uriLine }
    }
    elseif ($line -match '^\s*MONGODB_DB\s*=') {
        if (-not $dbFound) { $dbFound = $true; $dbLine }
    }
    else { $line }
}
if (-not $uriFound) { $updated += $uriLine }
if (-not $dbFound) { $updated += $dbLine }
Set-Content -LiteralPath $envPath -Value $updated -Encoding utf8
Write-Host "MongoDB settings saved in server/.env. The URI was not displayed."
