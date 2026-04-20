# ============================================================================
# Vocal — Dev Telegram tunnel launcher (Windows / PowerShell)
#
# What it does:
#   1. Reads TELEGRAM_BOT_TOKEN + TELEGRAM_WEBHOOK_SECRET from .env.local.
#   2. Starts a cloudflared quick tunnel pointing at http://localhost:3000.
#   3. Waits for the trycloudflare URL to appear, then calls Telegram's
#      setWebhook with that URL + the secret.
#   4. Prints a GET /api/webhooks/telegram/debug command you can paste to
#      verify everything end-to-end.
#
# Usage:
#   cd vocal-app
#   powershell -ExecutionPolicy Bypass -File scripts/dev-tunnel.ps1
#
# Prereqs:
#   - `cloudflared` installed (winget install --id Cloudflare.cloudflared).
#   - Dev server already running on localhost:3000.
# ============================================================================

$ErrorActionPreference = 'Stop'

$envFile = Join-Path $PSScriptRoot '..\.env.local'
if (-not (Test-Path $envFile)) {
  Write-Host "ERROR: .env.local not found at $envFile" -ForegroundColor Red
  exit 1
}

function Read-EnvVar($name) {
  $line = Select-String -Path $envFile -Pattern "^$name=(.+)$" | Select-Object -First 1
  if (-not $line) { return $null }
  return $line.Matches[0].Groups[1].Value.Trim('"').Trim("'")
}

$token  = Read-EnvVar 'TELEGRAM_BOT_TOKEN'
$secret = Read-EnvVar 'TELEGRAM_WEBHOOK_SECRET'
$orgId  = Read-EnvVar 'ORG_ID'

if (-not $token)  { Write-Host "ERROR: TELEGRAM_BOT_TOKEN missing in .env.local" -ForegroundColor Red; exit 1 }
if (-not $secret) { Write-Host "ERROR: TELEGRAM_WEBHOOK_SECRET missing in .env.local" -ForegroundColor Red; exit 1 }
if (-not $orgId)  { Write-Host "WARNING: ORG_ID missing in .env.local — webhook inserts will FK-violate." -ForegroundColor Yellow }

Write-Host "Starting cloudflared quick tunnel to http://localhost:3000 ..." -ForegroundColor Cyan

$logFile = Join-Path $env:TEMP "vocal-cloudflared.log"
if (Test-Path $logFile) { Remove-Item $logFile -Force }

$proc = Start-Process -FilePath 'cloudflared' `
  -ArgumentList 'tunnel','--url','http://localhost:3000' `
  -RedirectStandardError $logFile -RedirectStandardOutput "$logFile.out" `
  -PassThru -WindowStyle Hidden

# Poll for the URL to appear. cloudflared prints it to stderr.
$url = $null
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $logFile) {
    $content = Get-Content $logFile -Raw
    $match = [regex]::Match($content, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($match.Success) { $url = $match.Value; break }
  }
}

if (-not $url) {
  Write-Host "ERROR: cloudflared did not produce a tunnel URL within 60s. See $logFile" -ForegroundColor Red
  exit 1
}

Write-Host "Tunnel up: $url" -ForegroundColor Green

$hookUrl = "$url/api/webhooks/telegram"

# Cloudflare's edge DNS for a fresh quick-tunnel subdomain usually takes
# 5–20 s to propagate. Wait until WE can resolve it, then retry setWebhook
# a few times in case Telegram's resolver is still lagging.
Write-Host "Waiting for DNS to propagate for $url ..." -ForegroundColor Cyan
$tunnelHost = ([Uri]$url).Host
for ($i = 0; $i -lt 30; $i++) {
  try {
    [System.Net.Dns]::GetHostAddresses($tunnelHost) | Out-Null
    break
  } catch {
    Start-Sleep -Seconds 1
  }
}

Write-Host "Registering Telegram webhook at $hookUrl ..." -ForegroundColor Cyan

$body = @{
  url              = $hookUrl
  secret_token     = $secret
  allowed_updates  = @('message','callback_query')
} | ConvertTo-Json -Compress

$resp = $null
for ($attempt = 1; $attempt -le 6; $attempt++) {
  try {
    $resp = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/setWebhook" `
      -ContentType 'application/json' -Body $body
    if ($resp.ok) { break }
    Write-Host "  setWebhook attempt $attempt failed: $($resp.description). Retrying in 5s..." -ForegroundColor Yellow
  } catch {
    # Invoke-RestMethod throws on non-2xx; Telegram returns 400 with a JSON
    # body when it can't resolve the URL. Pull the body out of the exception.
    $errBody = $_.ErrorDetails.Message
    Write-Host "  setWebhook attempt $attempt threw: $errBody. Retrying in 5s..." -ForegroundColor Yellow
    $resp = $null
  }
  Start-Sleep -Seconds 5
}

if (-not $resp -or -not $resp.ok) {
  Write-Host "ERROR: setWebhook failed after retries: $($resp | ConvertTo-Json -Compress)" -ForegroundColor Red
  Write-Host "The tunnel at $url is live, but Telegram can't reach it yet." -ForegroundColor Red
  Write-Host "Wait 30 s and run the curl command from PROJECT_SUMMARY.md §8 manually." -ForegroundColor Red
  exit 1
}

Write-Host "Webhook registered." -ForegroundColor Green
Write-Host ""
Write-Host "Tunnel URL:    $url" -ForegroundColor Yellow
Write-Host "Webhook URL:   $hookUrl" -ForegroundColor Yellow
Write-Host "cloudflared PID: $($proc.Id)  (log: $logFile)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Next: open the dashboard at http://localhost:3000 and hit:" -ForegroundColor Cyan
Write-Host "  http://localhost:3000/api/webhooks/telegram/debug"
Write-Host ""
Write-Host "Leave this window open — the tunnel dies when you close it." -ForegroundColor DarkGray
Write-Host "Press Ctrl+C to stop the tunnel."
Wait-Process -Id $proc.Id
