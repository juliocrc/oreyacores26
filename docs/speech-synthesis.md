# WhatsApp Speech Synthesis

The Node.js backend uses Microsoft's Edge Read Aloud service over an outbound
WebSocket. No Python, subprocess, temporary file, Azure account or Azure API key
is required. The existing WhatsApp audio route runs in the Vercel Node.js runtime.

`TTS_VOICE` defaults to `pt-BR-AntonioNeural` when absent. An explicitly empty or
unsupported value disables synthesis. The Portuguese BR/PT allowlist lives in
`src/lib/tts-voices.ts`. Configuration status is not a service health check:
`speechConfigured` validates the voice, `deliveryConfigured` checks the selected
OpenWA or InfiniReach provider, and `audio.configured` requires both. These flags
do not check rate-limiter readiness. WhatsApp delivery can still incur charges.

## Preview Configuration

Both preview and delivery require the shared rate limiter. Without its
configuration, the routes return HTTP 503 before synthesis, even when
`speechConfigured` is true. They return the safe error code
`AUDIO_RATE_LIMIT_UNAVAILABLE`; the client should display the returned error
instead of replacing it with a generic synthesis failure.

- Development: `RATE_LIMIT_BACKEND=local`, `RATE_LIMIT_NAMESPACE`, and a nonempty
  `RATE_LIMIT_KEY_SECRET` are required. Local mode is only accepted in development
  or test, never in production or a Vercel preview deployment.
- Production: `RATE_LIMIT_BACKEND=upstash`, `RATE_LIMIT_NAMESPACE`,
  `RATE_LIMIT_KEY_SECRET`, `UPSTASH_REDIS_REST_URL` (HTTPS), and
  `UPSTASH_REDIS_REST_TOKEN` are required. Provision credentials through the
  deployment's secret manager, then redeploy. Never commit credential values.
- The namespace must contain 1 to 100 ASCII letters, digits, colons, underscores,
  or hyphens. Do not use customer data as the namespace.

Do not bypass the limiter or silently fall back to process-local counters in
production. A configured but unreachable Redis backend also returns this code.
Preview does not require a connected delivery provider or business hours; it
still requires authentication and the existing WhatsApp user permission.

## Service Limitations

Edge TTS is an unofficial, keyless integration, not the supported Azure Speech
API. There is no SLA or guaranteed free quota. Microsoft may throttle or block
requests, remove voices, or change the endpoint or signing protocol without
notice. Review Microsoft's applicable terms before production use. Message text
is sent to Microsoft for synthesis; it is not logged by this adapter. The audio
starts with the existing synthetic-voice disclosure.

The server clock must be accurate for the five-minute GEC signing window. A
provider rejection fails generically without automatic retries or paid fallback.
Delivery permissions, confirmation, rate limits, and uncertain-delivery handling
remain the responsibility of the existing WhatsApp route.

## Resource Limits

- Input: 1 to 1500 characters before the disclosure, valid XML text only.
- Total deadline: 30 seconds, covering connection and the entire synthesis.
- MP3: at most 10 MiB with the existing ID3/MPEG signature checks.
- WebSocket: 64 KiB per message, 12 MiB total protocol data, 4096 messages.
- Compression and redirects disabled; only the fixed Microsoft endpoint is used.
- Audio chunks are counted synchronously before retaining them, without a library queue.
- Success requires `turn.end`; early closure rejects potentially truncated audio.
- Success, failure, oversize, and timeout terminate the socket and clear the timer.

Signature checks are a sanity check, not a complete MP3 decoder. Long messages
can exceed the deadline and fail rather than continue generating in the background.

## Dependency Review

Runtime dependencies are pinned in `package.json` and `package-lock.json`:
`ws@8.22.0` (existing dependency, updated from 8.21.3) and `server-only@0.0.1`
(Next.js client-import guard). No high-level TTS package was added.

Reviewed npm metadata and implementations for `edge-tts-universal@1.4.0`,
`node-edge-tts@1.2.11`, `msedge-tts@2.1.0`, and `@andresaya/edge-tts@1.9.1`.
Their stream/close interfaces do
not provide the combination of a transport-level message cap, bounded incoming
queues, and immediate public cancellation needed here. In particular,
`Communicate.stream()` and `EdgeTTS.streamAudio()` queue incoming data without
a byte bound. A small direct adapter keeps ownership of the WebSocket and uses
Node's built-in SHA-256 plus the GEC v2 CS64 digest. The signing helper is
adapted from node-edge-tts's TypeScript implementation, with its MIT notice
retained. Endpoint, version and v2 signature format follow the current original
edge-tts implementation. No Python code or runtime is used.

The @andresaya v1.9.0 release documents cancellation and the October 2026
endpoint change, but its session uses graceful close rather than immediate
termination and exposes no transport payload cap. In live checks, that Node
endpoint rejected the WebSocket upgrade (HTTP 200 instead of 101). The original
Edge Read Aloud endpoint with GEC v2 successfully generated real MP3 audio.

Sources reviewed:

- https://github.com/SchneeHertz/node-edge-tts/blob/master/src/edge-tts.ts
- https://github.com/SchneeHertz/node-edge-tts/blob/master/src/drm.ts
- https://github.com/travisvn/edge-tts-universal/blob/main/src/communicate.ts
- https://github.com/travisvn/edge-tts-universal/releases
- https://github.com/Migushthe2nd/MsEdgeTTS/blob/master/src/MsEdgeTTS.ts
- https://github.com/andresayac/edge-tts/releases/tag/v1.9.0
- https://github.com/andresayac/edge-tts/blob/main/src/core/session.ts
- https://github.com/rany2/edge-tts/blob/master/src/edge_tts/constants.py
- https://github.com/rany2/edge-tts/blob/master/src/edge_tts/drm.py
- https://github.com/websockets/ws/releases/tag/8.22.0
- https://github.com/websockets/ws/blob/8.22.0/doc/ws.md

The ws 8.22.0 release adds a protocols option and fixes invalid close arguments.
Its documented `maxPayload`, `handshakeTimeout`, and `terminate()` controls are
used directly. No private package fields or monkey-patching are involved.

## Verification

The opt-in smoke test uses only a fixed harmless technical-test sentence. It
does not access customer records, save audio, or send WhatsApp messages.
Run it explicitly in PowerShell:

```powershell
$env:RUN_EDGE_TTS_SMOKE = "1"
npm test -- --runTestsByPath src/lib/__tests__/speech-synthesis.smoke.test.ts --coverage=false --detectOpenHandles
Remove-Item Env:RUN_EDGE_TTS_SMOKE
```

Live checks on 2026-10-24 returned 71,280 MP3 bytes for pt-BR-AntonioNeural and
61,920 bytes for pt-PT-DuarteNeural. Both passed the adapter's MP3 checks and
completed without open handles. This validates local Node synthesis, not Vercel
egress or WhatsApp delivery. Audio was not auditioned or decoded with a full
MP3 decoder. Ordinary tests mock the provider; live checks are skipped by default.
