$ErrorActionPreference = 'Stop'
$envPath = Join-Path $PSScriptRoot '.env'
$examplePath = Join-Path $PSScriptRoot '.env.example'

if (-not (Test-Path -LiteralPath $envPath)) {
    if (-not (Test-Path -LiteralPath $examplePath)) { throw 'server/.env.example is missing.' }
    Copy-Item -LiteralPath $examplePath -Destination $envPath
}

$secureKey = Read-Host 'Paste your Resend API key (input is hidden)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try { $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
if ($apiKey -notmatch '^re_[A-Za-z0-9_-]{10,}$') { throw 'That does not look like a Resend API key.' }

$sender = (Read-Host 'Enter the sender address verified in Resend (example: InternMatch <you@yourdomain.com>)').Trim()
if ($sender -notmatch '^([^<>]*<)?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$') { throw 'Enter a valid sender email address or display-name address.' }

$site = (Read-Host 'Enter your public frontend origin (HTTPS URL; local Live Server may use http://127.0.0.1:5500)').Trim().TrimEnd('/')
try { $siteUri = [Uri]$site } catch { throw 'Enter a valid website origin, for example https://internmatch.example.' }
if ($siteUri.Scheme -ne 'https' -and $siteUri.Host -notin @('127.0.0.1', 'localhost')) { throw 'Use an HTTPS website URL except for local development.' }
if ($siteUri.AbsolutePath -ne '/') { throw 'Enter only the site origin, without a page path.' }

$lines = [System.Collections.Generic.List[string]]::new()
$lines.AddRange([string[]](Get-Content -LiteralPath $envPath))
$entries = @(
    @{ Key = 'RESEND_API_KEY'; Value = $apiKey },
    @{ Key = 'EMAIL_FROM'; Value = $sender },
    @{ Key = 'PUBLIC_APP_URL'; Value = $site }
)
foreach ($entry in $entries) {
    $pattern = '^\s*' + [regex]::Escape($entry.Key) + '\s*=.*$'
    $found = $false
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match $pattern) {
            $lines[$index] = '{0}="{1}"' -f $entry.Key, $entry.Value.Replace('"', '\"')
            $found = $true
        }
    }
    if (-not $found) { $lines.Add(('{0}="{1}"' -f $entry.Key, $entry.Value.Replace('"', '\"'))) }
}
Set-Content -LiteralPath $envPath -Value $lines -Encoding utf8
Write-Host 'Email invitation settings saved to server/.env. The API key was not displayed.' -ForegroundColor Green
Write-Host 'Restart the API with npm start from the server folder.'
