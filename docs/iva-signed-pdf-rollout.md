# Signed IVA PDF Handoff

Application deployment remains with main. The additive production database
prerequisite was applied and verified on 2026-10-27 as recorded below. This
database operation performed no deployment, messages or document uploads.

## Production Database Verification (2026-10-27)

- Confirmed target: `aws-0-eu-west-2.pooler.supabase.com:6543/postgres`, using mandatory certificate/hostname verification and the published Supabase production CA.
- Reused the existing `INFRASTRUCTURE_BACKUP_SECRET` through its DPAPI CurrentUser recovery envelope, without printing, regenerating or rotating it. Successfully decrypted the prior verified backup to confirm key continuity.
- Captured a fresh complete IVA row/metadata snapshot, encrypted with AES-256-GCM, fsynced, read back, decrypted and compared before DDL. Backup: `C:\Users\julio\AppData\Local\Temp\opencode\iva-signed-column-1793095284093-21b669bd7094.aesgcm.json`.
- Applied only the exact reviewed `scripts/sql/iva-signed-pdf.sql`, through a separate pinned operator runner. The original activation SQL allowlist was not expanded. Shared transaction-scoped advisory lock, 5-second lock timeout and 30-second statement timeout were used.
- Verified `pdfAssinadoMeta` is nullable `text`, with no default. No backfill, other schema changes, stock migration, grants or policies were applied.
- Fresh row counts before/after: 0/0, added rows: 0. Original-column values/hash projections, indexes, constraints, policies, ACL/RLS and effective API grants were preserved. Effective anon/authenticated table and column read/write privileges remained denied; existing RLS state was not modified.
- Post-commit SQL field selection succeeded. A separate strict-TLS read-only Prisma select of all 19 model fields, including `pdfAssinadoMeta`, and row count also succeeded.
- Recovery key envelope remains `C:\Users\julio\AppData\Local\Temp\opencode\orey-infrastructure-backup-key-20261027.dpapi.json`. Follow `scripts/activate-infrastructure.md` recovery instructions; retain both artifacts before temporary-directory cleanup.
- No declaration was issued, number consumed, attachment uploaded or message sent. Main owns build/deployment and subsequent approved synthetic feature checks.

## Approval Gate

One additional database column is required before deploying the new Prisma client/application:

```sql
public."DeclaracaoIsencaoIva"."pdfAssinadoMeta" TEXT NULL
```

The four previously added IVA fields remain unchanged. The new column contains JSON metadata for the separate signed attachment, never fiscal number/date/snapshot data. No new environment variables or Blob stores are needed; the existing encryption key and Blob credentials/OIDC are reused.

## Safe Manual Rollout

Only the deployment owner should perform these steps after explicit approval:

1. Verify the target database identity and take a restorable backup/PITR restore point. Preserve the IVA table rows, definitions, indexes, policies and grants. Do not rely on the earlier report of zero rows.
2. Inspect existing Data API exposure and grants. This is a server-only table: neither `anon` nor `authenticated` should be able to obtain attachment metadata/storage keys through the Data API. Preserve the existing approved protection; stop if direct access is possible.
3. Review and execute `scripts/sql/iva-signed-pdf.sql` in the approved database tool with stop-on-error enabled. The script is additive and transactional, has lock/statement timeouts, checks the column type/nullability and performs no backfill. The existing `activate-infrastructure.cjs` allowlist does NOT include this file; do not pass it to that runner or change the old reviewed SQL just to bypass its safety checks.
4. Verify `information_schema.columns` reports `data_type = 'text'`, `is_nullable = 'YES'` for the new column. Verify existing rows, fiscal fields, snapshots, indexes, policies and grants are unchanged. Existing rows should have a null attachment field.
5. Regenerate Prisma from the deployment schema (`npx prisma generate --schema=prisma/schema.postgresql.prisma`), run the repository's normal Prisma type patch/build steps, then deploy through the normal main-owned process.
6. Verify with synthetic approved test data, not real signed documents: issue/download an original, upload an externally signed test PDF, reload history, download both files, and check cross-client denial.

If the deployment is rolled back, retain the nullable column and stored objects. Do not drop it or delete attachments as part of application rollback. Back up `INVOICE_PDF_ENCRYPTION_KEY` securely alongside the established recovery process; Blob objects cannot be decrypted without it.

## Behavior

- `POST /api/portal/declaracao-isencao-assinada?declaracaoId=ID` accepts only multipart `pdf` and `expectedSha256` (empty for the first upload). The ID must refer to an already numbered, owned declaration with its immutable snapshot.
- `GET` on the same URL downloads the signed attachment through authorization. It never returns a Blob URL, storage key or redirect.
- History includes only signed filename, size, upload time and digest. Original PDF/Word reprints continue using the unchanged fiscal snapshot.
- Client ownership must match both the current vessel and the issued declaration. Staff require current/original station access and report-view permission to download, report-edit permission to upload. Admin preview is supported.
- PDFs are limited to 4 MiB, plus a bounded 128 KiB multipart envelope. Actual streamed bytes are counted even without a trustworthy Content-Length. Extension, MIME, PDF header and parser checks run before storage.
- Signed bytes are stored unchanged under `iva-signed/ID/UUID.bin`, using AES-GCM and namespaced AAD. Invoice wrapper keys/AAD/local paths remain exactly compatible with `invoice-official/ID/UUID.bin` and `.private-invoice-pdfs`.
- Replacements use a digest precondition and a metadata/updatedAt compare-and-swap. Storage failure cannot change metadata. Ownership is checked again after storage. A failed CAS can leave an unreferenced encrypted object; no destructive cleanup is attempted. Replaced objects are also retained, but attachment-version history is not exposed by this feature.
- The application only accepts externally signed documents. It neither signs files nor certifies the legal validity of signatures.

## Files

- `src/app/api/portal/declaracao-isencao-assinada/route.ts`
- `src/app/area-cliente/DeclaracoesIvaPanel.tsx`
- `src/lib/declaracao-isencao-iva-request.ts`
- `src/lib/declaracao-isencao-iva.ts` (persisted-row type fields only)
- `src/lib/secure-pdf-storage.ts` (extracted shared storage implementation)
- `src/lib/invoice-official-storage.ts` (compatible invoice wrappers)
- `src/lib/iva-signed-storage.ts`
- `src/lib/iva-signed-metadata.ts`
- `prisma/schema.prisma`
- `prisma/schema.postgresql.prisma`
- `prisma/schema.sqlite.prisma`
- `prisma/schema.local.prisma`
- `prisma/schema.import-sqlite.prisma`
- `prisma/schema.sql`
- `scripts/sql/iva-signed-pdf.sql`
- `src/lib/__tests__/iva-declarations.test.ts`
- `src/lib/__tests__/invoice-official-storage.test.ts`
- `src/app/area-cliente/DeclaracoesIvaPanel.test.tsx`
- `docs/iva-signed-pdf-rollout.md`

## Local Verification

```powershell
npm run typecheck
npx jest --runInBand src/lib/__tests__/invoice-official-storage.test.ts src/lib/__tests__/invoice-official-route.test.ts src/lib/__tests__/portal-official-invoice-route.test.ts src/lib/__tests__/iva-declarations.test.ts src/app/area-cliente/DeclaracoesIvaPanel.test.tsx
```

These use mocked database/Blob providers and synthetic PDFs. The live additive
migration and encrypted-backup verification are recorded above; no backup restore
or production upload was performed. Full production build/deployment remains
with main to avoid interference with its concurrent publication.
