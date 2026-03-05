Param(
  [string]$ConfigPath = "$env:ProgramData\TeamCoveyEFB\backend-config.json",
  [string]$PsxReferencesDir = "C:\Users\levis\OneDrive\Documents 1\Aerowinx\Developers"
)

$ErrorActionPreference = "Stop"

Write-Host "Preparing Team Covey EFB backend config..."

$configDir = Split-Path -Path $ConfigPath -Parent
if (-not (Test-Path $configDir)) {
  New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

if (-not (Test-Path $ConfigPath)) {
  $json = @{
    psxHost = "127.0.0.1"
    psxPort = 10747
    psxReferencesDir = $PsxReferencesDir
  } | ConvertTo-Json
  $json | Out-File -FilePath $ConfigPath -Encoding utf8
  Write-Host "Created config file at $ConfigPath"
} else {
  Write-Host "Config file already exists at $ConfigPath"
}

if (-not (Test-Path ".env.backend")) {
  Copy-Item ".\backend\.env.backend.example" ".\.env.backend"
  Write-Host "Created .env.backend from template."
} else {
  Write-Host ".env.backend already exists."
}

Write-Host ""
Write-Host "Next steps:"
Write-Host "1) Edit .env.backend"
Write-Host "2) Set env vars from .env.backend in your service manager"
Write-Host "3) Run: npm ci && npm run build && npm run start"
Write-Host "4) Open /setup and sign in with Discord to finalize PSX host/port/references folder"
