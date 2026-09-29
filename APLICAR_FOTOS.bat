@echo off
title Aplicar Mapeamento de Fotos
cd /d "%~dp0"
echo A aplicar mapeamento de fotos do photo_mapping.json...
powershell -Command "
$map = Get-Content 'photo_mapping.json' -Raw | ConvertFrom-Json;
$count = 0;
foreach ($ref in $map.PSObject.Properties) {
  $path = $ref.Value;
  if ($path -and (Test-Path \"public$path\")) {
    $result = node -e \"const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); p.stock.updateMany({ where: { referencia: '$($ref.Name)' }, data: { foto: '$path' } }).then(r => { console.log('OK: $($ref.Name) -> $path'); p.\$disconnect(); }).catch(e => { console.log('ERRO: $($ref.Name) - ' + e.message); p.\$disconnect(); });\"
    echo $result
    set /a count+=1
  } else {
    if ($path) { echo \"IGNORADO: $($ref.Name) -> $path (ficheiro nao encontrado)\" }
  }
}
echo Feito. $count foto(s) associada(s).
" 2>&1
pause
