# Pending Activation

The local worktree contains unpublished infrastructure changes as well as stock
and document fixes. Do not deploy the whole worktree without these prerequisites.

## Shared Rate Limiter

Configure `RATE_LIMIT_BACKEND=upstash`, `RATE_LIMIT_NAMESPACE`,
`RATE_LIMIT_KEY_SECRET`, `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` on the server. All instances of an environment must
share the backend and namespace. Use different namespaces across environments.
The limiter fails closed with HTTP 503 when configuration or Redis is unavailable;
there is no production fallback to in-memory counters.

## Database Changes

Review and apply the additive scripts against the intended database after taking
a backup:

- `scripts/sql/stock-reversals.sql`: persistent reversal linkage and uniqueness.
- `scripts/sql/iva-declarations.sql`: declaration ownership, snapshot and
  idempotency fields and annual sequence constraints.

SQLite has a separate stock reversal script. Do not run PostgreSQL scripts on a
SQLite database or use the SQLite migration history for PostgreSQL deployment.
`prisma generate` only regenerates the client; it does not update any database.
IVA prerequisites were applied to production on 2026-10-27 as detailed below.
Stock reversal activation remains separate and was not performed in this operation.

### IVA Production Activation (2026-10-27)

IVA activation is complete. The linked Vercel project's production environment
selected `DATABASE_URL`, targeting
`aws-0-eu-west-2.pooler.supabase.com:6543/postgres`. Its `sslmode=no-verify`
was rejected. A separate operator-only environment with mandatory certificate
verification initially failed with `SELF_SIGNED_CERT_IN_CHAIN`. This was resolved
for the operator process using Supabase's published production CA, linked by its
official dashboard source:
`https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`.
Certificate and hostname verification remained enabled; production connection
parameters and SSL enforcement were not changed.

Read-only IVA inspection succeeded. The existing table was compatible with
the additive script and contained zero rows. Missing columns `clienteId`, `navioId`,
`snapshotJson` and `idempotencyKey` were added. Four missing indexes were added:
`DeclaracaoIsencaoIva_ano_numeroSequencial_key`,
`DeclaracaoIsencaoIva_idempotencyKey_key`,
`DeclaracaoIsencaoIva_clienteId_dataEmissao_idx` and
`DeclaracaoIsencaoIva_navioId_dataEmissao_idx`. Existing annual-number and
complete-number duplicate counters are zero. RLS is disabled; no policies or
effective anon/authenticated table or column read/write grants were reported.
No security settings were changed.

The auth-secret dependency was removed by supporting a preferred independent
`INFRASTRUCTURE_BACKUP_SECRET`, retaining the existing AUTH fallback. A random
384-bit key was persisted via CLI stdin as a sensitive production Vercel variable
and separately encrypted using Windows DPAPI CurrentUser. Its on-disk recovery
copy was decrypted and compared before use. No auth secret was changed or used.
The independent key was never written as plaintext to disk or command arguments.

The IVA-only metadata/full-row snapshot was AES-256-GCM encrypted, fsynced,
decrypted and compared before the reviewed `iva-declarations.sql` ran. DDL used
the existing transaction-scoped advisory lock, 5-second lock timeout and 60-second
statement timeout. All seven required indexes and 18 columns were verified;
original metadata/security was preserved, with zero original/current/added rows
and zero duplicate groups. A separate strict-TLS, read-only Prisma select of all
18 model fields and count succeeded. No declarations, numbering, messages,
stock migrations or deployments were performed.

Backup:
`C:\Users\julio\AppData\Local\Temp\opencode\infrastructure-1793091258399-985b2d8621f7.aesgcm.json`

Key recovery artifact:
`C:\Users\julio\AppData\Local\Temp\opencode\orey-infrastructure-backup-key-20261027.dpapi.json`

See `scripts/activate-infrastructure.md` for recovery handling. Retain both
artifacts in approved durable secure storage before temporary-directory cleanup.

## Stock And Documents

- Validity mode is AUTO, SIM or NAO, stored in existing stock metadata.
- L-prefixed references, numeric ES references, A10, B10 and A8 are resources.
- Stock photos use progressive thumbnail hydration and optimistic upload preview.
  JPEG/PNG/WebP uploads are reduced to at most 1600 pixels per side where supported;
  GIF/SVG and failed or larger conversions keep the original.
- Stock field autosaves exclude photos and preserve typing during pending saves.
- Closing a stock sheet does not reopen it because its query-string ID is unchanged.
- Packs R and E do not include rations in the inspection workbook or its annexes.

After activating prerequisites, verify login, a real stock edit and photo upload,
sheet close/reopen, explicit validity choices, PDF/XLSX exports and reversal replay.
