<#
.SYNOPSIS
  Prepara a base Supabase e importa a base local (SQLite) para ela.

.DESCRIPTION
  Passos, por ordem:
    1. Resolve a connection string do Supabase (SUPABASE_DATABASE_URL no
       ambiente ou no .env; se nao existir, pede a password de forma oculta).
    2. Cria/actualiza o esquema (prisma db push com o schema PostgreSQL).
    3. Dry-run do import (nao escreve nada) para preview das contagens.
    4. Com -Apply, volta a limpar o destino e importa de facto.

  As exclusoes de demonstracao vem de scripts/import-exclusions.json.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\aplicar-import-supabase.ps1
  powershell -ExecutionPolicy Bypass -File scripts\aplicar-import-supabase.ps1 -Apply
#>
[CmdletBinding()]
param(
  [switch]$Apply,
  [string]$ConnectionString = ""
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

$Schema = "prisma\schema.postgresql.prisma"
$SqliteClient = Join-Path $PWD "node_modules\.prisma\sqlite-client"

function Get-SupabaseUrl {
  param([string]$Override)

  if ($Override) { return $Override }

  $fromEnv = $env:SUPABASE_DATABASE_URL
  if ($fromEnv) { return $fromEnv }

  $envFile = Join-Path $PWD ".env"
  if (Test-Path $envFile) {
    $line = Get-Content $envFile |
      Where-Object { $_ -match '^\s*SUPABASE_DATABASE_URL\s*=' } |
      Select-Object -First 1
    if ($line) {
      $value = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
      if ($value) { return $value }
    }
  }

  Write-Host ""
  Write-Host "SUPABASE_DATABASE_URL nao esta definido. A password sera pedida de forma oculta."
  $ref = Read-Host "Project ref do Supabase" -Default "gczoknfzbtbkmmpbmqed"
  $region = Read-Host "Regiao" -Default "eu-west-1"
  $port = Read-Host "Porta do pooler (5432 = transaction mode, 6543 = session mode; Recommended 6543)" -Default "6543"
  $secure = Read-Host "Password da base de dados" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    $encoded = [Uri]::EscapeDataString($password)
    return "postgresql://postgres.${ref}:${encoded}@aws-0-${region}.pooler.supabase.com:${port}/postgres?sslmode=require&connection_limit=5"
  }
  finally {
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    $password = $null
    $encoded = $null
    $secure.Dispose()
  }
}

function Show-Target {
  param([string]$Url)
  $parsed = [Uri]$Url
  Write-Host "  host    : $($parsed.Host)"
  Write-Host "  porta   : $($parsed.Port)"
  Write-Host "  base    : $($parsed.AbsolutePath.Trim('/'))"
}

$url = Get-SupabaseUrl -Override $ConnectionString

Write-Host ""
Write-Host "=== Destino ===" -ForegroundColor Cyan
Show-Target -Url $url
Write-Host ""

Write-Host "=== 1/4 Esquema (prisma db push) ===" -ForegroundColor Cyan
$env:DATABASE_URL = $url
npx prisma db push --schema $Schema --skip-generate
if ($LASTEXITCODE -ne 0) { throw "prisma db push falhou (exit $LASTEXITCODE)" }

if (-not (Test-Path $SqliteClient)) {
  Write-Host ""
  Write-Host "Cliente SQLite de leitura em falta; a gerar..." -ForegroundColor Yellow
  npx prisma generate --schema=prisma/schema.import-sqlite.prisma
  if ($LASTEXITCODE -ne 0) { throw "prisma generate (sqlite) falhou" }
}

Write-Host ""
Write-Host "=== 2/4 Dry-run do import (nao escreve) ===" -ForegroundColor Cyan
$env:IMPORT_DATABASE_URL = $url
$env:SQLITE_PRISMA_CLIENT = $SqliteClient
node scripts\import-sqlite-to-pg.cjs
if ($LASTEXITCODE -ne 0) { throw "dry-run do import falhou (exit $LASTEXITCODE)" }

if (-not $Apply) {
  Write-Host ""
  Write-Host "Dry-run concluido, nada foi escrito no Supabase." -ForegroundColor Yellow
  Write-Host "Repete com -Apply para criar o esquema e importar:" -ForegroundColor Yellow
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\aplicar-import-supabase.ps1 -Apply" -ForegroundColor Yellow
  exit 0
}

Write-Host ""
$confirm = Read-Host "Isto limpa as tabelas public do Supabase e importa a base local. Continuar? (SIM/NAO)"
if ($confirm -ne "SIM") {
  Write-Host "Cancelado." -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "=== 3/4 Import (--apply) ===" -ForegroundColor Cyan
node scripts\import-sqlite-to-pg.cjs --apply
if ($LASTEXITCODE -ne 0) { throw "import falhou (exit $LASTEXITCODE)" }

Write-Host ""
Write-Host "=== 4/4 Verificacao (local vs Supabase) ===" -ForegroundColor Cyan
node scripts\verificar-import-supabase.cjs
if ($LASTEXITCODE -ne 0) { Write-Host "A verificacao apontou diferencas (ver acima)." -ForegroundColor Yellow }

Remove-Item Env:\IMPORT_DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:\SQLITE_PRISMA_CLIENT -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Concluido. A BD local e a do Vercel passam a ser a mesma." -ForegroundColor Green
