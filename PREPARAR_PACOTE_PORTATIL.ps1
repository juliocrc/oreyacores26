[CmdletBinding()]
param(
  [string]$Destino = 'E:\OREY_ACORES',
  [switch]$SemBuild
)

$ErrorActionPreference = 'Stop'
$Origem = (Resolve-Path (Join-Path $PSScriptRoot '.')).Path
$Node = Join-Path $Origem 'bin\node.exe'

Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  PACOTE PORTATIL OREYACORES' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host "Origem : $Origem"
Write-Host "Destino: $Destino"

if (-not (Test-Path $Node)) {
  throw "Node portatil nao encontrado: $Node"
}

if (-not $SemBuild) {
  Write-Host 'A construir a aplicacao para producao...' -ForegroundColor Yellow
  Push-Location $Origem
  try {
    & $Node 'node_modules\next\dist\bin\next' build --webpack
    if ($LASTEXITCODE -ne 0) { throw "Build falhou com codigo $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
}

$required = @(
  '.next\required-server-files.json',
  '.next\standalone',
  '.next\static',
  'node_modules\next',
  'prisma\local.db',
  'public',
  'templates',
  'launcher.js',
  'server.js',
  'OREYACORES92026.bat'
)
foreach ($relative in $required) {
  if (-not (Test-Path (Join-Path $Origem $relative))) {
    throw "Artefacto obrigatorio em falta: $relative"
  }
}

if (Test-Path $Destino) {
  Write-Host 'A remover pacote anterior...' -ForegroundColor Yellow
  Remove-Item -LiteralPath $Destino -Recurse -Force
}
New-Item -ItemType Directory -Path $Destino -Force | Out-Null

function Copy-Tree([string]$RelativePath) {
  $source = Join-Path $Origem $RelativePath
  $target = Join-Path $Destino $RelativePath
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  & robocopy $source $target /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -gt 7) { throw "Falha ao copiar $RelativePath (robocopy $LASTEXITCODE)" }
}

function Copy-File([string]$RelativePath) {
  $source = Join-Path $Origem $RelativePath
  $target = Join-Path $Destino $RelativePath
  New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
  Copy-Item -LiteralPath $source -Destination $target -Force
}

# Runtime completo, sem codigo-fonte ou artefactos de desenvolvimento desnecessarios.
foreach ($tree in @('.next', 'node_modules', 'prisma', 'public', 'templates', 'scripts', 'bin')) {
  Write-Host "A copiar $tree ..."
  Copy-Tree $tree
}
foreach ($file in @('launcher.js', 'server.js', 'OREYACORES92026.bat', 'package.json', 'next.config.ts', '.env', '.env.local')) {
  if (Test-Path (Join-Path $Origem $file)) { Copy-File $file }
}

# O launcher gera backups localmente; nao transportar backups antigos.
New-Item -ItemType Directory -Path (Join-Path $Destino 'backups') -Force | Out-Null

$readme = @'
OREYACORES - PACOTE PORTATIL OFFLINE

Para iniciar: execute OREYACORES92026.bat.
Nao e necessario instalar Node.js, npm ou outras dependencias.

A aplicacao usa SQLite local em prisma\local.db.
Sem internet ficam indisponiveis Google Drive, AIS, Equasis, email, SMS,
WhatsApp e outros servicos externos; o nucleo local continua disponivel.
'@
Set-Content -LiteralPath (Join-Path $Destino 'LEIA-ME_PORTATIL.txt') -Value $readme -Encoding UTF8

$checks = @(
  'bin\node.exe',
  '.next\required-server-files.json',
  '.next\standalone\server.js',
  'node_modules\next',
  'prisma\local.db',
  'OREYACORES92026.bat'
)
foreach ($relative in $checks) {
  if (-not (Test-Path (Join-Path $Destino $relative))) {
    throw "Pacote incompleto: $relative"
  }
}

Write-Host ''
Write-Host "Pacote criado com sucesso em $Destino" -ForegroundColor Green
Write-Host 'Execute OREYACORES92026.bat nessa pasta para testar.' -ForegroundColor Green
