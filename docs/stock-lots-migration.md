# Stock Lot Rollout

## Identity And Legacy Data

Each Stock row retains its physical ID. `lote` stays nullable (`String?`) in all
Prisma schemas and the SQL bootstrap. Persisted `NULL` means **unknown legacy
lot**, not a newly identified batch. Multiple legacy unknown rows with the same
reference/station are preserved, including shared/null-station rows. Nothing is
merged, renamed, trimmed or assigned a fictional lot.

New application writes follow stricter rules than legacy storage:

- New expiry-controlled rows require an explicit actual batch and valid expiry.
- New non-expiring rows use canonical `lote = ''`; another row is rejected if the
  reference/station already has stock, including unknown legacy stock.
- New batch input is trimmed and checked against known sibling batches. Existing
  nonnull whitespace values are not silently normalized by an unrelated edit.
- Existing unknown rows remain editable by exact ID without changing their NULL
  lot or forcing reconciliation. Historical identity remains immutable once
  movements, installed articles or reservations exist.
- Actual known dated batches can be added alongside unknown legacy dated stock.
  The group cannot be reclassified as non-expiring to bypass the single-row rule.
- Seeds inspect legacy NULL rows explicitly, preserve an unambiguous legacy ID,
  and refuse ambiguous reference matches instead of upserting a new empty batch.
  Seeds are not production migration tools and are not part of this rollout.

Unknown inventory can be reconciled later using evidence and explicit row IDs.
Its existence is **not a migration blocker** and does not authorize consumption
by arbitrary reference-first matching. Scanners reject ambiguous references.

## Index-Only Migration

Prepared files:

- `scripts/migrate-stock-lots.cjs`: explicit target, read-only preflight,
  temporary-only PostgreSQL rehearsal, opt-in transactional apply.
- `scripts/sql/stock-lots.postgresql.sql`: PostgreSQL-only index DDL.
- `scripts/sql/stock-lots.sqlite.sql`: SQLite-only index DDL; no table rebuild,
  foreign-key disabling or sequence changes.

Both SQL migrations perform only these operations:

```sql
DROP INDEX IF EXISTS "Stock_referencia_serviceStationId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Stock_referencia_serviceStationId_lote_key"
  ON "Stock" ("referencia", "serviceStationId", "lote");
CREATE UNIQUE INDEX IF NOT EXISTS "Stock_global_referencia_lote_key"
  ON "Stock" ("referencia", "lote")
  WHERE "serviceStationId" IS NULL AND "lote" IS NOT NULL;
```

No UPDATE, ALTER COLUMN, SET NOT NULL, default change, table replacement or row
insertion/deletion occurs. Ordinary unique-index NULL semantics deliberately
preserve unknown legacy batches. Uniqueness for nonnull batches (including `''`)
is enforced by the triple key and the partial shared-stock index. Application
transactions prohibit creating new unknown dated batches and concurrent group
classification/single-row bypasses.

Preflight checks only exact **nonnull** stored keys for collisions. It reports
NULL/empty/noncanonical values without converting them. Verification fingerprints
include **every field, including lote**, and must remain identical after DDL.

These are runner-managed provider-specific SQL migrations, not entries replayed
from Prisma's existing SQLite migration history. Do not use reset, `db push` or
`--accept-data-loss`. Prisma 6 cannot express the partial index; the runner and
bootstrap SQL maintain it explicitly.

## Production Evidence

On 2026-10-25, the revised read-only preflight and full-data temporary PostgreSQL
rehearsal both passed using `DATABASE_URL` parsed privately from
`.env.production.local`.

- Safe target: `aws-0-eu-west-2.pooler.supabase.com`, database `postgres`, port 6543.
- Stock rows: **463**; quantity: **3876**; reservations: **0**.
- Legacy NULL lots: **462**, retained exactly; empty-string lots: **0**.
- Noncanonical stored nonnull lots: **0**; actual nonnull-key collisions: **0**.
- Incoming associations copied and verified: **4613 across five FKs**:
  ArtigoJangada, CustomPackTypeItem, MovimentacaoStock, OrdemCompraLinha and
  PedidoReposicaoLinha.
- Before apply, the expected old standalone pair index was valid/ready. No unexpected
  reference-only uniqueness constraint/index was found.
- `lote`, `foto` and `localizacao` remain nullable `text`;
  `quantidadeReservada` remains required `integer DEFAULT 0`, consistent with API
  photo/location/reservation projections.

All three index statements passed on the temporary copy. The copied rows' full
fingerprints, NULL counts, IDs, quantities, reservations, associations and column
definitions were unchanged. The two new unique indexes were valid/ready and the
old pair index was absent **on the copy**. Real source data and schema were also
verified unchanged within the repeatable-read snapshot. The transaction was
rolled back and temporary table cleanup verified.

The prior NOT NULL/normalization design was discarded. Its 15 reported collisions
were unknown legacy rows being incorrectly collapsed to empty strings, not
evidence requiring inventory merges or invented batch identifiers.

The live index-only migration was subsequently committed using the explicit
transaction-pooler opt-in described below. A verified local backup was written
under the Stock lock before DDL. The real table now has both new valid/ready lot
indexes and no legacy pair index. The complete 463-row fingerprint remained
`0631d1d419a4e1e720364e802057506782a85e9baec79e55776709d28166bb76`
both under the lock and in an independent post-commit read. No persistent test
stock, inventory changes, merges or invented batch identifiers were created.
Only the database transaction briefly blocked Stock access; no service was
suspended. This backup is Stock-specific, not a full-database recovery backup.

## Safe Commands

```powershell
node scripts/migrate-stock-lots.cjs --check --env-file=.env.production.local --target-env=DATABASE_URL
node scripts/migrate-stock-lots.cjs --rehearse --env-file=.env.production.local --target-env=DATABASE_URL
```

`--check` uses REPEATABLE READ READ ONLY. `--rehearse` writes exclusively to
qualified `pg_temp` tables and always rolls back. Its SQL whitelist is validated
before connecting. DROP INDEX is explicitly qualified in pg_temp; CREATE INDEX
targets `pg_temp."Stock"`, so PostgreSQL places the index in that namespace.
Public sequence defaults/identities are never copied or invoked. No public
triggers, RLS, grants, functions or migration history are changed.

`--env-file` uses `dotenv.parse` and selects only the named variable, without
overwriting process environment variables. Without it, the existing Next
`loadEnvConfig` behavior is used. URL credentials are never logged.

Only the production transaction-pooler URL on port 6543 is configured. The
session-mode endpoint on 5432 was subsequently investigated: TCP was reachable,
but authentication stalled; no usable alternate target was established. The
single-transaction temporary rehearsal already succeeded on the transaction
pooler. The guarded index-only production apply also completed on that connection;
it does not establish session-mode connectivity or authorize general migrations.

APPLY still rejects Supabase port 6543 by default. The explicit
`--allow-transaction-pooler` flag permits **only this reviewed index-only runner**,
not general migrations. Every PostgreSQL apply (direct or pooled) validates the
exact three statements in order before connecting. Repeated, reordered, extra,
data-mutating or otherwise changed statements are rejected. Live DROP INDEX and
table targets are qualified to `public`; rehearsal targets stay in `pg_temp`.
The SQL files intentionally remain provider-neutral with respect to namespaces;
the runner validates and qualifies them, rather than executing unchecked SQL.

The apply path uses one `pg.Client`, sequential awaited queries, unnamed parameter
bindings for catalog reads, and no named prepared statements, query pipeline,
external service calls or cross-transaction session state. Its sequence is:

1. BEGIN, transaction-local 5s lock timeout, 60s statement timeout, safe search path
   and `row_security = off` (fail rather than silently back up RLS-filtered rows).
2. ACCESS EXCLUSIVE lock on `public."Stock"`, then schema/collision preflight and
   all-field row snapshot. Reject reviewed index names owned by other relations.
3. Write a generated exclusive-create local backup, fsync it, read it back and
   verify its SHA-256 plus the row fingerprint **before any index DDL**.
4. Execute exactly the three validated index statements individually. Verify
   unchanged full-row fingerprints, columns, constraints, incoming FK metadata,
   unrelated indexes and the expected valid/ready new index definitions.
5. COMMIT only after all checks pass. Any prior failure attempts ROLLBACK and
   closes the client, including backup/preflight/DDL/fingerprint failures.

`migrate(url, apply, confirm, { backupDir, allowTransactionPooler })` requires a
selected preexisting local directory for PostgreSQL apply; it does not create
directories or overwrite files. The backup contains database/role identity,
all Stock rows, column/index/constraint definitions and incoming FK relationship
metadata, but no connection string or credentials. It does not copy incoming
tables' data or sequences and is **not a full recovery backup**. No rows are
logged. On Windows, `0600` is not an ACL guarantee: select a private directory
and protect backups using the directory's ACLs and retention policy.

## Deployment Gates

1. Prefer a verified direct or session-mode URL through the provider's connection
   settings. Store it securely as `STOCK_LOTS_DATABASE_URL`; do not print it or
   commit it. If unavailable, explicitly approve the narrowly scoped transaction
   pooler override below; do not generalize it to other migrations.
2. Verify a consistent encrypted full-database backup/PITR recovery point and an
   independent staging restore. Include all incoming FK tables and sequence,
   index and constraint state. Record and compare totals and association checksums.
3. Prepare the safe deployment using the optional-lot Prisma schema. Its read
   contract is compatible with production NULLs even before this migration.
   Keep new multi-lot writes gated until the indexes are installed: the old pair
   index will reject a second same-reference batch at a nonnull station.
4. Run check/rehearsal, apply and application smoke tests on independent staging.
   The temporary full-data rehearsal verifies SQL/data preservation, not production
   lock contention, triggers/RLS, recovery or deployment behavior.
5. Only with explicit production approval, suspend stock writes from old/new app
   instances, workers, imports and offline replay. Confirm the final backup,
   rerun preflight and apply the index-only migration in the controlled window.
6. Verify unchanged full-row fingerprints, NULL counts, totals, real associations
   and column definitions; confirm the two new unique indexes and removal of the
   old pair index. Activate the safe version and resume writes. Do not allow old
   reference-only writers after new multi-lot writes are enabled.

Future opt-in commands, **not executed on production**:

```powershell
node scripts/migrate-stock-lots.cjs --check --target-env=STOCK_LOTS_DATABASE_URL
node scripts/migrate-stock-lots.cjs --apply --target-env=STOCK_LOTS_DATABASE_URL --confirm-target=HOST/DATABASE --backup-dir="C:\Users\julio\AppData\Local\Temp\opencode"
node scripts/migrate-stock-lots.cjs --check --target-env=STOCK_LOTS_DATABASE_URL
```

After explicit production approval only, the rollout wrapper can select the
configured `DATABASE_URL` without attempting the stalled session endpoint:

```powershell
node scripts/stock-lots-rollout.cjs check --allow-transaction-pooler
node scripts/stock-lots-rollout.cjs rehearse --allow-transaction-pooler
node scripts/stock-lots-rollout.cjs apply --confirm-index-only --allow-transaction-pooler
```

The wrapper parses `.env.production.local` privately and passes its fixed
preexisting Temp/opencode backup directory to the migrator. Its earlier snapshot
is advisory only: backup and final data verification use the locked transaction,
not that stale snapshot or a post-commit snapshot subject to application writes.
The low-level CLI also accepts `--allow-transaction-pooler` with its explicit
target confirmation and required `--backup-dir`.

Supabase's [current connection documentation](https://supabase.com/docs/guides/database/connecting-to-postgres#transaction-mode-limitations)
allows state within a single explicit transaction but prohibits cross-transaction
session reliance, prepared statements and pipelining. Direct connections remain
the general recommendation for migrations. Residual risks include blocking live
traffic while the exclusive lock is held (including local backup I/O), pooler or
database transaction/idle timeouts, and network loss during COMMIT, whose outcome
may be ambiguous. The statement timeout is per statement, not an overall 60s
transaction deadline. If COMMIT acknowledgement is lost, check schema and backup
evidence before deciding whether to retry. Do not claim automatic rollback of an
already committed transaction, or use this exception for general SQL.

Use exactly the safe host/database printed by check for `--confirm-target`. For
SQLite it must be the absolute existing file path instead, quoted if needed.
Generate the deployment client with the correct provider:

```powershell
npx prisma generate --schema=prisma/schema.postgresql.prisma
node scripts/patch-prisma-types.cjs
```

For local SQLite use `--schema=prisma/schema.prisma`. Do not switch the shared
local generated client while another agent/process is checking types.

## Verification And Recovery

```powershell
node --test scripts/migrate-stock-lots.test.cjs
node scripts/test-stock-lots-migration.cjs
npx jest src/lib/__tests__/stock-lots.test.ts src/lib/__tests__/stock-lot-routes.test.ts src/lib/__tests__/stock-list-route.test.ts --runInBand --coverage=false
npm run typecheck
```

SQLite rehearsal creates only a disposable Temp/opencode database. It verifies
exact legacy NULL/whitespace preservation, associations, known-lot uniqueness,
concurrent protection, reapplication and collision rollback.

Both providers roll back failed index DDL atomically. After multi-lot writes,
do not merge batches, drop the new keys or redeploy old reference-only writers.
Keep the safe version, restrict stock traffic and fix forward. Full backup/PITR
restore is an explicitly approved incident operation, not an automatic rollback.

Labels encode the stored barcode, with an explicit legacy-reference fallback for
old rows without one. Portable imports reject ambiguous/repeated physical rows
and audit exact Stock IDs atomically. `check_stock_summary.cjs` is read-only.
