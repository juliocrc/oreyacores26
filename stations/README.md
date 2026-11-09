# APKs por estação de serviço

A mesma base de código (`android-tecnicos` e `android-clientes`) gera uma app
separada por estação. Cada APK tem:

- nome próprio: **Orey Técnicos — Lisboa** / **Orey Cliente — Lisboa**;
- `applicationId` próprio: `pt.oreyacores.tecnicos.lisboa` / `pt.oreyacores.clientes.lisboa`;
- estação ativa predefinida no arranque (cookie `active_service_station_id`);
- o mesmo login, permissões e servidor.

## Estações atuais

Confirmadas na base de produção (Nov 2026):

| Estação | `stationId` | Código | Slug |
|---|---|---|---|
| Açores | 1 | ACORES | `acores` |
| Lisboa | 2 | LISBOA | `lisboa` |
| Aveleda | 5 | AVELEDA | `aveleda` |
| Alcantarilha | 6 | ALCANTARILHA | `alcantarilha` |
| Setúbal | 11 | SETUBAL | `setubal` |

## Configuração

Editar `stations/stations.json`:

```json
{
  "slug": "lisboa",
  "stationId": 2,
  "stationCode": "LISBOA",
  "name": "Lisboa",
  "serverUrl": "https://oreyacoresdeluxe.vercel.app/",
  "active": true
}
```

- `stationId` tem de corresponder ao `ServiceStation.id` da base de dados usada
  pela app (produção ou estação local).
- `slug` só pode ter letras/números; é usado no `applicationId`.
- `active: false` não é compilado por omissão.

## Compilar

Todas as estações ativas, app dos técnicos e dos clientes:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-station-apks.ps1
```

Só uma estação:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-station-apks.ps1 -Station lisboa
```

Só a app dos clientes:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-station-apks.ps1 -App clientes
```

Incluir estações inativas e/ou gerar release:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-station-apks.ps1 -IncludeInactive
powershell -ExecutionPolicy Bypass -File scripts/build-station-apks.ps1 -Station acores -Release
```

## Empacotar para envio

Depois de compilar, cria um ZIP por estação (APKs + `LEIA-ME.txt` +
`estacao.json` + `SHA256SUMS.txt`) e um índice com hashes:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-station-apks.ps1
```

## Ficheiros gerados

```
dist/estacoes/<slug>/orey-tecnicos-<slug>.apk
dist/estacoes/<slug>/orey-cliente-<slug>.apk
dist/estacoes/<slug>/estacao.json
dist/estacoes/<slug>/LEIA-ME.txt
dist/estacoes/<slug>/SHA256SUMS.txt
dist/estacoes/orey-<slug>.zip
dist/estacoes/INDICE.md
```

## Importante

- O `serverUrl` pode apontar para o Vercel ou para um servidor local da
  estação (tem de ser HTTPS; a app não permite HTTP em claro).
- A estação é predefinida no arranque, mas o servidor continua a validar a
  conta, as permissões e o acesso à estação.
- Ao mudar a lista de estações na produção, atualizar os `stationId` neste
  ficheiro e voltar a compilar.

## Assinatura de release

Os APKs de debug servem para testar, mas não para distribuir: a chave de debug
expira e não permite atualizar a app noutro computador. A assinatura de release
está preparada nos dois projetos:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-station-apks.ps1 -App both -Release
```

Se existirem `android-tecnicos/keystore.properties` e
`android-clientes/keystore.properties`, o APK é assinado com essa chave.
Os modelos estão em `keystore.properties.example`. As credenciais e o keystore
estão documentados em `CHAVE-ASSINATURA.txt` (fora do git) e **têm de ser
guardados em local seguro**.

Conferir a assinatura:

```powershell
apksigner verify --print-certs dist\estacoes\acores\orey-cliente-acores.apk
```

Deve indicar `CN=Orey Tecnica` (release) e não `CN=Android Debug`.

## Compilação automática (CI)

`.github/workflows/android-station-apks.yml` compila todas as estações a cada
alteração em `android-tecnicos/`, `android-clientes/` ou `stations/`, e publica
os APKs e ZIPs como artefactos do workflow. Também pode ser executado à mão
(workflow_dispatch), com opção de release assinado se os secrets do keystore
estiverem configurados.

