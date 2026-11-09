# Publicação das aplicações Android

O módulo `/aplicacoes` lista as estações ativas de `stations/stations.json` e
mostra, para cada uma, a versão e o download dos APKs **publicados**.

## Estado atual (Açores)

| App | applicationId | Versão | Ficheiro |
|---|---|---|---|
| Orey Técnicos – Açores | `pt.oreyacores.tecnicos.acores` | 2.3 | `public/downloads/android/acores/orey-tecnicos-acores-2.3.apk` |
| Orey Cliente – Açores | `pt.oreyacores.clientes.acores` | 1.0 | `public/downloads/android/acores/orey-cliente-acores-1.0.apk` |

Ambos são builds `release` assinados com o keystore da Orey
(`CN=Orey Tecnica, OU=Mobile, O=Orey Tecnica, L=Acores, C=PT`). Os APKs de
debug não são listados no módulo.

## Como gerar um APK de estação

```powershell
cd android-tecnicos   # ou android-clientes
.\gradlew.bat assembleRelease `
  -PstationSlug=acores -PstationId=1 -PstationCode=ACORES `
  -PstationName=Açores -PstationServerUrl=https://oreyacoresdeluxe.vercel.app/
```

## Como publicar uma nova versão

1. Confirmar o pacote e a assinatura:

   ```powershell
   aapt dump badging app\build\outputs\apk\release\app-release.apk
   apksigner verify --print-certs app\build\outputs\apk\release\app-release.apk
   ```

2. Copiar o APK para `public/downloads/android/<estacao>/` com nome versionado.
3. Calcular tamanho e SHA-256 e atualizar `PUBLISHED_APKS` em
   `src/lib/android-app-catalog.ts`.
4. Testar a instalação e o arranque num dispositivo antes do deploy.

Alternativa: alojar o APK num domínio HTTPS externo e definir
`ANDROID_APK_URL_TECNICOS_<ESTACAO>` / `ANDROID_APK_URL_CLIENTE_<ESTACAO>` no
Vercel. Só URLs HTTPS sem credenciais são aceites; qualquer outro valor é
ignorado e o ficheiro local continua a ser usado.

## Limites e cuidados

- Ficheiros estáticos em `public/` são servidos pelo CDN da Vercel. O limite por
  ficheiro é 100 MB; o APK dos técnicos tem ~79 MB.
- O SHA-256 apresentado na página corresponde ao ficheiro publicado; use-o para
  confirmar o download.
- As estações sem APK publicado aparecem como "Versão ainda não publicada".
