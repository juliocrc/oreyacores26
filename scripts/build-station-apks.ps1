param(
    [string]$Station = "",
    [ValidateSet("tecnicos", "clientes", "both")]
    [string]$App = "both",
    [switch]$IncludeInactive,
    [switch]$Release
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$stationsPath = Join-Path $root "stations\stations.json"
if (-not (Test-Path -LiteralPath $stationsPath)) {
    throw "Configuração de estações não encontrada: $stationsPath"
}

$stations = Get-Content -LiteralPath $stationsPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($Station) {
    $stations = @($stations | Where-Object { $_.slug -eq $Station })
    if ($stations.Count -eq 0) {
        throw "Estação '$Station' não encontrada em $stationsPath"
    }
} elseif (-not $IncludeInactive) {
    $stations = @($stations | Where-Object { $_.active -eq $true })
}

if ($stations.Count -eq 0) {
    throw "Não há estações ativas para compilar. Use -IncludeInactive para incluir as inativas."
}

$targets = if ($App -eq "both") { @("tecnicos", "clientes") } else { @($App) }
$outputRoot = Join-Path $root "dist\estacoes"
$task = if ($Release) { "assembleRelease" } else { "assembleDebug" }
$apkFolder = if ($Release) { "release" } else { "debug" }
$apkFile = if ($Release) { "app-release.apk" } else { "app-debug.apk" }

function Invoke-StationBuild {
    param(
        [string]$ProjectDirectory,
        [string]$OutputFile,
        [pscustomobject]$StationConfig
    )

    $gradleArgs = @(
        $task,
        "--console=plain",
        "-PstationSlug=$($StationConfig.slug)",
        "-PstationId=$($StationConfig.stationId)",
        "-PstationCode=$($StationConfig.stationCode)",
        "-PstationName=$($StationConfig.name)",
        "-PstationServerUrl=$($StationConfig.serverUrl)"
    )

    Push-Location $ProjectDirectory
    try {
        Write-Host "==> $($StationConfig.name) :: $([System.IO.Path]::GetFileName($ProjectDirectory))" -ForegroundColor Cyan
        $gradleWrapper = Join-Path $ProjectDirectory "gradlew.bat"
        if (-not (Test-Path -LiteralPath $gradleWrapper)) {
            throw "Gradle wrapper não encontrado: $gradleWrapper"
        }
        & $gradleWrapper @gradleArgs
        if ($LASTEXITCODE -ne 0) {
            throw "Gradle falhou para a estação $($StationConfig.slug) em $ProjectDirectory"
        }
    } finally {
        Pop-Location
    }

    $sourceApk = Join-Path $ProjectDirectory "app\build\outputs\apk\$apkFolder\$apkFile"
    if (-not (Test-Path -LiteralPath $sourceApk)) {
        throw "APK não encontrado: $sourceApk"
    }

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputFile) | Out-Null
    Copy-Item -LiteralPath $sourceApk -Destination $OutputFile -Force
    Write-Host "    -> $OutputFile" -ForegroundColor Green
}

foreach ($stationConfig in $stations) {
    $stationOutputDir = Join-Path $outputRoot $stationConfig.slug
    New-Item -ItemType Directory -Force -Path $stationOutputDir | Out-Null

    foreach ($target in $targets) {
        if ($target -eq "tecnicos") {
            Invoke-StationBuild `
                -ProjectDirectory (Join-Path $root "android-tecnicos") `
                -OutputFile (Join-Path $stationOutputDir "orey-tecnicos-$($stationConfig.slug).apk") `
                -StationConfig $stationConfig
        } else {
            Invoke-StationBuild `
                -ProjectDirectory (Join-Path $root "android-clientes") `
                -OutputFile (Join-Path $stationOutputDir "orey-cliente-$($stationConfig.slug).apk") `
                -StationConfig $stationConfig
        }
    }

    $info = [ordered]@{
        slug = $stationConfig.slug
        stationId = $stationConfig.stationId
        stationCode = $stationConfig.stationCode
        name = $stationConfig.name
        serverUrl = $stationConfig.serverUrl
        active = $stationConfig.active
        builtAt = (Get-Date).ToString("s")
        release = [bool]$Release
    }
    $info | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stationOutputDir "estacao.json") -Encoding UTF8

    # Metadados de assinatura (se o APK de release estiver assinado com a chave Orey).
    $signed = $false
    if ($Release) {
        $signerBat = Get-ChildItem "$env:LOCALAPPDATA\Android\Sdk\build-tools" -Recurse -Filter "apksigner.bat" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
        if ($signerBat) {
            foreach ($apk in (Get-ChildItem -LiteralPath $stationOutputDir -Filter "*.apk")) {
                $cert = & $signerBat verify --print-certs $apk.FullName 2>$null | Select-String "certificate DN"
                if ($cert -and ($cert.Line -replace ".*certificate DN: ","").Trim().StartsWith("CN=Orey")) {
                    $signed = $true
                    break
                }
            }
        }
    }

    $instructions = @"
Orey — $($stationConfig.name)

INSTALAÇÃO
1. Se já tiver uma versão de teste (debug) instalada, desinstale-a primeiro:
   Definições > Aplicações > Orey Cliente > Desinstalar.
2. Instale este APK Orey Cliente no telemóvel.
3. Se o Android pedir, autorize a instalação de aplicações desta origem.
4. Abra a app Orey Cliente.

ENTRADA
1. Introduza o NIF da ficha do cliente.
2. Introduza o código de 5 dígitos fornecido pela Orey Técnica.
3. Toque em Entrar.

O código é de utilização única e válido por 24 horas. Depois de entrar, a
sessão fica guardada neste telemóvel durante 1 ano.

Se perder o telemóvel, contacte a Orey Técnica: o acesso é suspenso e as
sessões ativas são terminadas.

Estação: $($stationConfig.stationCode) — $($stationConfig.name)
Versão: $(if ($Release) { "release (assinada)" } else { "debug (teste)" })
"@
    Set-Content -LiteralPath (Join-Path $stationOutputDir "LEIA-ME.txt") -Value $instructions -Encoding UTF8
}

Write-Host ""
Write-Host "APKs gerados em: $outputRoot" -ForegroundColor Green
if ($Release -and -not $signed) {
    Write-Host "AVISO: o build era release mas não foi detetada a assinatura CN=Orey. Crie keystore.properties (ver *.example)." -ForegroundColor Yellow
} elseif ($Release) {
    Write-Host "APKs de release assinados com a chave Orey (CN=Orey Tecnica)." -ForegroundColor Green
}
