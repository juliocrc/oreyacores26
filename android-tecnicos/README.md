# Orey Técnicos — Android

Aplicação Android que abre a estação OREY ACORES DELUXE numa WebView segura.

## Funcionalidades

- **Fotografar documentos**: ao escolher uma fotografia, abre a câmara e devolve a imagem ao formulário web.
- **Galeria e ficheiros**: seletor nativo para imagens, PDF, XLSX, XLSM e XLS.
- **Câmara em direto**: o WebView autoriza `getUserMedia` (câmara e microfone), necessário para o digitalizador de documentos e para os leitores QR/código de barras.
- **Microfone/Júlia**: o WebView do Android não implementa a Web Speech API; a app injeta um adaptador que liga o ditado ao `SpeechRecognizer` nativo, com transcrição parcial em direto.
- **Voz da Júlia**: quando o servidor TTS não está disponível (por exemplo, offline), usa o `TextToSpeech` nativo em português. O botão de parar também interrompe a voz nativa.
- **OCR no dispositivo**: as fotografias de certificados/quadros são lidas com o ML Kit (modelo Latin incluído no APK). A imagem não sai do telemóvel.
- **Importação assistida**: o texto reconhecido é interpretado pelo mesmo motor de análise já usado nos PDFs e o técnico confirma os campos antes de importar.
- **Downloads**: PDF/Excel gerados pela aplicação (incluindo `blob:`) podem ser guardados, abertos e partilhados.
- **Sem ligação**: ecrã nativo com botão “Tentar novamente” quando a página não carrega.
- **Ligações externas** (`mailto:`, `tel:`, `whatsapp:`, etc.) abrem na aplicação adequada.
- **Tablet / Android 16**: interface adaptável, suporte a rotação, split-screen, ecrãs grandes, edge-to-edge com margens do sistema e gesto de voltar preditivo.

## Compilar

Requisitos: JDK 17+, Android SDK 36 e Build Tools 36.1.0. O projeto está em `compileSdk 36` / `targetSdk 36` com AGP 8.13.2.

Para gerar uma app por estação (Açores, Lisboa, etc.) a partir deste mesmo
código, ver `stations/README.md` e usar:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-station-apks.ps1 -App tecnicos
```

```powershell
cd android-tecnicos
gradle assembleDebug
```

O APK fica em:

```
android-tecnicos/app/build/outputs/apk/debug/app-debug.apk
```

Para uma versão de distribuição, configure a assinatura de release no Android Studio ou com um keystore próprio e execute `gradle assembleRelease`.

## Notas

- `android.useAndroidX=true` é necessário para o `FileProvider` e para o ML Kit.
- As permissões `CAMERA` e `RECORD_AUDIO` são pedidas em tempo de execução. Se forem negadas, devem ser autorizadas em **Definições → Aplicações → Orey Técnicos → Permissões**.
- A câmara nativa (`ACTION_IMAGE_CAPTURE`) e a câmara em direto (`getUserMedia`) usam a mesma permissão `CAMERA`.
- O ditado da Júlia usa o serviço de reconhecimento de voz do Android/Google. Se o tablet não tiver esse serviço, o ditado não fica disponível.
- O endereço da aplicação está em `MainActivity.APP_URL`.
