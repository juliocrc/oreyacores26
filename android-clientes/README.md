# Orey Cliente — Android

App Android do portal do cliente Orey Técnica. Abre a Área do Cliente numa
WebView segura e permite consultar equipamentos, documentos e faturas.

## Entrada do cliente

O cliente entra com **NIF + código de 5 dígitos**. Não é usado token de
dispositivo nem login automático pela conta Android.

1. O administrador abre a ficha do cliente e gera um código de acesso.
2. Envia o APK e o código ao cliente (email/WhatsApp).
3. O cliente instala o APK, abre a app, introduz o NIF e o código.
4. A sessão fica guardada no dispositivo durante **365 dias** (cookie e JWT
   validados no servidor).
5. Se o cliente perder o telemóvel, o administrador suspende o acesso ao
   portal; todas as sessões ativas são invalidadas imediatamente.

O código é de utilização única e válido por **24 horas**.

## Funcionalidades

- Login por NIF + código, com teclado numérico e preenchimento do código OTP.
- Sessão longa e revogável pelo administrador.
- PDFs de faturas, certificados e quadros abertos no **leitor nativo**, com:
  - partilhar por email/WhatsApp;
  - guardar em Downloads;
  - abrir noutra aplicação de PDF.
- Downloads de ficheiros para a pasta pública de Downloads (Android 10+) ou
  pasta privada da app (versões anteriores).
- Upload de PDFs assinados (declarações de IVA).
- Links externos, ecrã offline, rotação, split-screen e Android 16.
- **Sem** câmara, microfone, OCR ou permissões de localização.

## Compilar

```powershell
cd android-clientes
gradle assembleDebug
```

APK:

```
android-clientes/app/build/outputs/apk/debug/app-debug.apk
```

Para gerar uma app por estação (Açores, Lisboa, etc.), ver
`stations/README.md` e executar:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-station-apks.ps1 -App clientes
```

Os APKs de estação ficam em `dist/estacoes/<slug>/orey-cliente-<slug>.apk`.

## Notas

- A app usa `targetSdk 36` / Android 16, com edge-to-edge e margens do sistema.
- As faturas e certificados são pedidos com a sessão do cliente; o PDF não é
  enviado para serviços externos.
- O login do cliente é validado no servidor; suspender o acesso na ficha do
  cliente impede novas entradas e invalida os dispositivos existentes.
- O APK é de debug. Para distribuição, configurar assinatura de release.
