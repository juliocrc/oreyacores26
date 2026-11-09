param(
    [string]$Station = "",
    [switch]$NoZip
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$stationsPath = Join-Path $root "stations\stations.json"
if (-not (Test-Path -LiteralPath $stationsPath)) {
    throw "Configuracao de estacoes nao encontrada: $stationsPath"
}

$stations = Get-Content -LiteralPath $stationsPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($Station) {
    $stations = $stations | Where-Object { $_.slug -eq $Station }
    if (-not $stations) { throw "Estacao '$Station' nao encontrada." }
}

$dist = Join-Path $root "dist\estacoes"
$rows = @()

foreach ($st in $stations) {
    $dir = Join-Path $dist $st.slug
    if (-not (Test-Path -LiteralPath $dir)) {
        Write-Host "Sem APKs para $($st.slug) (pasta inexistente)." -ForegroundColor Yellow
        continue
    }

    $apks = @(Get-ChildItem -LiteralPath $dir -File -Filter "*.apk")
    if ($apks.Count -eq 0) {
        Write-Host "Sem APKs para $($st.slug)." -ForegroundColor Yellow
        continue
    }

    $hashLines = @()
    foreach ($apk in $apks) {
        $hash = (Get-FileHash -LiteralPath $apk.FullName -Algorithm SHA256).Hash
        $hashLines += "$hash  $($apk.Name)"
        $rows += [pscustomobject]@{
            Estacao   = $st.name
            Codigo    = $st.stationCode
            Id        = $st.stationId
            Ficheiro  = "$($st.slug)/$($apk.Name)"
            TamanhoMB = [math]::Round($apk.Length / 1MB, 1)
            SHA256    = $hash
        }
    }
    $hashLines | Set-Content -LiteralPath (Join-Path $dir "SHA256SUMS.txt") -Encoding ASCII

    if (-not $NoZip) {
        $zipPath = Join-Path $dist "orey-$($st.slug).zip"
        if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
        $items = @($apks.FullName)
        foreach ($extra in @("LEIA-ME.txt", "estacao.json", "SHA256SUMS.txt")) {
            $candidate = Join-Path $dir $extra
            if (Test-Path -LiteralPath $candidate) { $items += $candidate }
        }
        Compress-Archive -LiteralPath $items -DestinationPath $zipPath -CompressionLevel Optimal -Force
        Write-Host "ZIP: $zipPath" -ForegroundColor Green
    }
}

if ($rows.Count -gt 0) {
    $md = @("# APKs por estacao de servico", "", "Gerado: $(Get-Date -Format 'yyyy-MM-dd HH:mm')", "", "| Estacao | Codigo | Id | Ficheiro | MB | SHA-256 |", "|---|---|---|---|---|---|")
    foreach ($r in $rows) {
        $md += "| $($r.Estacao) | $($r.Codigo) | $($r.Id) | $($r.Ficheiro) | $($r.TamanhoMB) | ``$($r.SHA256)`` |"
    }
    $md += ""
    $md += "Pacotes prontos a enviar: ``dist/estacoes/orey-<slug>.zip``"
    $md -join "`n" | Set-Content -LiteralPath (Join-Path $dist "INDICE.md") -Encoding UTF8
}

Write-Host ""
Write-Host "Concluido. Pacotes em: $dist" -ForegroundColor Green
