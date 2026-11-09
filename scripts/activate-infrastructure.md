# Infrastructure Activation

This is an operator-run PostgreSQL activation tool, not a deployment or generic migration runner. No environment files are changed. It accepts only the reviewed contents of `sql/stock-reversals.sql` and `sql/iva-declarations.sql`; changed executable SQL fails closed. Scripts commit separately, stock first. Historical duplicate numbers are never renumbered.

## CLI Contract

Run from the repository root. `pg` and `dotenv` must already be installed. Inspection is the default and all its catalog/count queries run in a repeatable-read, read-only transaction (apart from the initial database identity SELECT).

```powershell
node scripts/activate-infrastructure.cjs --inspect --env-file "C:\Users\julio\AppData\Local\Temp\opencode\orey-production-activation.env"
```

Review the returned `source`, `confirmTarget`, field types, validation status, duplicate counters, row counts and API grants. `confirmTarget` has the form `hostname:port/database`; it never includes user/password. Copy that exact value into the explicit apply invocation:

```powershell
node scripts/activate-infrastructure.cjs --apply --env-file "C:\Users\julio\AppData\Local\Temp\opencode\orey-production-activation.env" --confirm-target "HOST:PORT/DATABASE" --backup-dir "C:\Users\julio\AppData\Local\Temp\opencode"
```

Only the explicit file is parsed with `dotenv.parse`, without expansion or ambient environment fallback. URL precedence matches `src/lib/resolve-database-url.ts` runtime order, not Prisma CLI order. It does not silently switch to `DIRECT_URL`. TLS certificate/hostname verification is mandatory, even for `sslmode=require`; URL SSL paths, options and ambient PG connection settings are not used. Private certificate roots can be supplied through Node's normal trusted CA configuration before process startup. Never disable certificate verification. No credentials, SQL error details, backup rows or row hashes are printed.

`--backup-dir` must already exist and resolve inside the approved temporary directory above. No directories are created. `--apply` requires a stable `INFRASTRUCTURE_BACKUP_SECRET` (preferred) or the existing `AUTH_SECRET` fallback, with at least 32 non-padding characters. A nonempty dedicated key is never silently replaced by the auth key if invalid. Keep the selected key in an approved secret store: rotating or losing it makes its backups unrecoverable. Do not print it or put it in command arguments. An exported `main(argv, envText)` caller can supply explicit environment text in memory, avoiding plaintext recovery-key files; CLI behavior remains explicit-file-only, with no ambient secret fallback.

## Backup Scope

Use `--only iva` with inspect or apply to restrict all table inspection, backup,
DDL and verification to `DeclaracaoIsencaoIva`. Stock SQL is not loaded or applied
in this mode. All target, encryption, TLS and schema checks remain mandatory.

Before any DDL, the script captures every row of existing `public.MovimentacaoStock` and `public.DeclaracaoIsencaoIva`, their ordered column types/defaults, indexes and definitions, constraints, policies, table ACL/RLS flags and effective API grants. Absent tables are recorded as absent. Values are serialized as PostgreSQL text, with SQL NULL distinct from text, avoiding JavaScript bigint/decimal/timestamp precision loss. The snapshot is repeatable-read with `row_security=off`, so an account subject to RLS fails rather than silently backing up a subset.

This is a scoped application backup, **not a full database backup or pg_dump replacement**. It does not include other tables, sequence current values, triggers/functions, extensions, roles, storage or WAL/PITR. The metadata is not a complete dependency-aware restore script. No native pg_dump or Docker is required, and no automatic destructive restore command is provided. Recovery must be reviewed manually, preserving concurrent business writes and sequence continuity. Existing provider backups/PITR remain important.

The file is AES-256-GCM encrypted, with a random 96-bit nonce, domain-separated SHA-256 key derivation from the selected backup secret, authenticated domain/version and a plaintext SHA-256 digest. Existing AUTH-key backups retain their original encryption format and require their original key. It is exclusively created, fsynced, read back, decrypted, hash-checked and compared with the complete in-memory snapshot before DDL. Only encrypted files reach disk. File mode is `0600` where supported; Windows directory ACLs must independently restrict access. Backup encryption/decryption helpers are exported for controlled recovery, never a plaintext CLI mode.

## Safety And Limits

- Each migration uses its own transaction, a shared transaction-scoped advisory lock, `lock_timeout=5s`, `statement_timeout=60s`, and an explicit search path. These locks serialize cooperating activation scripts, including transaction-pooled connections, not arbitrary external DDL. Ordinary indexes/FK validation can temporarily block writes; timeout fails the script, not business data. Schedule during a low-traffic window.
- Backup capture commits before encryption/file IO and before any DDL. Rows are held in memory: large tables may exhaust memory, in which case activation stops before DDL. Statement timeouts bound individual queries, not total backup or wall-clock execution time.
- Existing object definitions are checked, not merely names. Same-name incompatible indexes/FKs/columns fail rather than being replaced. Original column/index/constraint/policy definitions and table security must remain unchanged. Required IVA index definitions and stock FK actions are checked before commit.
- A newly created IVA table gets RLS enabled and PUBLIC/anon/authenticated table and serial-sequence grants revoked before commit. Effective table/column permissions are checked; inherited API access causes rollback. No policies are added. The existing server database role must retain its normal owner/bypass access. Existing tables' RLS and grants are never changed automatically; inspection warns about them. Actual Supabase API exposed-schema settings cannot be proven from these catalogs, so public is treated as potentially exposed.
- Original rows are compared by ID and hashes of **original columns only**, using the same PostgreSQL text projection. New rows and newly added nullable columns are allowed. A changed/deleted original row fails verification; concurrent legitimate updates can also cause this failure. This detects a mismatch but cannot attribute it to DDL versus business traffic. Verification occurs in a separate read-only transaction after each commit, without extending DDL locks.
- There are no destructive data writes, renumbering, automatic rollback of committed migrations or automatic retries. A timeout in one transaction rolls it back, but earlier scripts may already be committed. A connection loss at COMMIT has an uncertain outcome: run inspect and review before any re-apply. A subsequent apply captures a fresh encrypted backup and rechecks idempotent definitions.
- SQL exceptions emit only SQLSTATE; other unexpected exceptions emit a fixed generic code. Never debug by printing raw errors or environment content. Retain the encrypted backup path and committed-script output for operator review.

## Production IVA Recovery Artifacts (2026-10-27)

- Vercel project: `oreyacoresdeluxe`; environment: production; sensitive variable: `INFRASTRUCTURE_BACKUP_SECRET`. The key is independent of authentication and must not be casually rotated. Sensitive values may not be retrievable from Vercel after creation.
- Encrypted backup: `C:\Users\julio\AppData\Local\Temp\opencode\infrastructure-1793091258399-985b2d8621f7.aesgcm.json`.
- DPAPI key envelope: `C:\Users\julio\AppData\Local\Temp\opencode\orey-infrastructure-backup-key-20261027.dpapi.json`.
- The envelope's `ciphertext` is base64 Windows DPAPI `CurrentUser`, with null optional entropy. Decrypt under the same Windows user profile on this machine using .NET `System.Security.Cryptography.ProtectedData.Unprotect`, then decode the recovered bytes as UTF-8, in memory only. Preserve the Windows profile/master keys; the envelope alone is not a portable recovery mechanism.
- The temporary helper `C:\Users\julio\AppData\Local\Temp\opencode\orey-iva-key-dpapi.ps1 -Mode Unprotect` accepts that ciphertext on stdin and returns the key on stdout. Use it only inside a controlled subprocess capturing stdout in memory, never directly in an interactive terminal, logs, shell transcripts or redirected plaintext files.
- Pass the recovered key and encrypted backup text to exported `unpackBackup(text, secret)` in `activate-infrastructure.cjs`. It authenticates/decrypts and verifies the snapshot digest; keep the returned payload in memory and report only verification status/counts. The original snapshot contains IVA metadata and zero rows. No automatic restore is provided; any restore must be DBA-reviewed, preserving subsequent business writes and sequence continuity.
- Both recovery-key roundtrip and complete encrypted-backup readback were verified before DDL. Retain both artifacts in approved durable secure storage before temporary cleanup; loss of the DPAPI user profile and lack of another recoverable key copy can make the backup unrecoverable. Never print either recovered secrets or decrypted row data.

## Local Verification

```powershell
node --test scripts/activate-infrastructure.test.cjs
node --check scripts/activate-infrastructure.cjs
```

These are offline unit/syntax checks only. They do not establish production permissions, certificate trust, lock behavior, PostgreSQL catalog formatting or end-to-end migration success. No production inspect/apply is performed by these tests.
