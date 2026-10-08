# Plano de sessão — Listas estilo clientes + Certificado/Quadro + Deploy + Isolamento

## Fase 1 — Listas de navios e jangadas com `DataTable` (estilo clientes)

Referência: `src/app/clientes/page.tsx:761-810` usa o partilhado `src/components/shared/DataTable.tsx`
(busca, ordenação, filtros por coluna, dropdown "Colunas", export CSV, paginação numerada,
sticky header, zebra, `compact`, `rowActions`, `headerActions`, `emptyMessage`).

### 1.1 Navios — `src/app/navios/page.tsx`
- Substituir a tabela inline do `viewMode === 'lista'` (linhas ~1211-1392) por `<DataTable<Navio>>`.
- Definir `columns: ColumnDef<Navio>[]` com as colunas atuais: Nome (Link), Matrícula, Cliente,
  Porto de Registo, Tipo (`normalizeNavioTipoCategoria`), Estado (`navioEstadoBadge`),
  Ilha/Localização (`getNavioLocationLabel`).
- Dados: hoje o navio pagina no servidor (`/api/navios?pagina&limite`). Para o `DataTable` client-side
  igual aos clientes, carregar o conjunto todo (ex. `limite` alto ou `lite=1` como os clientes)
  mantendo o filtro de página existente; **remover** o footer de paginação servidor (linhas ~1513-1547).
- Mover ações para `rowActions` (Ver ficha / Editar / Excluir com `e.stopPropagation()`) e a seleção
  multipla para `headerActions` ("Excluir (n)"); **remover** o painel seletor de colunas manual
  (linhas ~1215-1274) — o `DataTable` já tem "Colunas".
- `searchKeys` incluir nome, matrícula, cliente, porto.
- Manter: hero panel, formulário inline, filtros de página + URL sync, vistas quadros/detalhes.

### 1.2 Jangadas — `src/app/jangadas/page.tsx`
- Substituir a tabela inline do `viewMode === 'lista'` (linhas ~2069-2335) por `<DataTable<Jangada>>`.
- Colunas: #, Marca, Modelo, Tipo, Boletins (badges), Nº Série, Data Fabrico, Lotação, Tipo de Pack,
  Cliente/Proprietário, Navio, Data Inspeção, Próx. Inspeção, Consumíveis (semáforo) — via `render`.
- Dados já são client-side (`sortedFilteredJangadas`) → ligar o `DataTable` a essa lista.
- `onRowClick` → `handleRowClick` (já tem guarda de `stopPropagation`, linhas ~669-682).
- `rowActions`: Continuar (condicional) / Dossier / Editar / Excluir; batch delete → `headerActions`.
- **Remover** painel seletor de colunas (~2085-2144) e barra de batch manual; manter legenda de
  associação como texto de secção.
- Manter: hero, filtros + URL sync, banner de inspeção pausada, vistas detalhes/quadros/conformidade,
  wizard e scanner QR. O seletor de vista pode manter-se `<select>` com os 4 modos.

### 1.3 Verificação
- `npx tsc -p tsconfig.typecheck.json --noEmit` e `npm run lint` (ou equivalente do repo).
- Smoke test local: `/navios` e `/jangadas` — busca, ordenação, filtros, colunas, CSV, paginação,
  ações de linha, navegação para ficha.

## Fase 2 — Certificado/Quadro: embeds + commit + deploy + probe

Causa-raiz do 500 (`POST /api/exportar-raft` → `src/app/api/exportar-raft/route.ts:57-63`):
produção corre o HEAD antigo que faz `fs.readFile('templates/template quadro.xlsx')` e
`templates/*.xlsx` está em `.gitignore:67` → ENOENT → 500. O fix (loader fs→base64 +
`template-embeds.generated.ts`) existe mas **não está commitado**.

### 2.1 Preparação
1. Regenerar embeds: `node scripts/_generate_template_embeds.cjs`
   (já inclui os 6: orey.xltx, quadro.xlsx, coletes.docx, Ficha Múltipla.xlsx, terceiro template.xlsx,
   FICHA_DGRM_TEMPLATE.docx — verificar aviso de ficheiros em falta).
2. (Opcional, hardening) adicionar `template certificado.xltx` à lista do gerador se se quiser
   backup binário; sem referência em código — só se pedirem.
3. Ligar o gerador ao build (`prebuild` ou dentro de `build:vercel` em `package.json`) para os
   embeds nunca ficarem stale.

### 2.2 Verificação local antes do commit
- `npx tsc -p tsconfig.typecheck.json --noEmit` + lint (3 erros TS pré-existentes em
  kpis/ruptabilidade são da Fase 4 — não bloquear).
- Repro local do quadro: `scripts/_repro_quadro.ts` (chama `buildQuadroInspectionArtifacts`).

### 2.3 Commit + push (requer confirmação explícita do utilizador)
- Incluir necessariamente, juntos (senão o build rebenta):
  - novos: `src/lib/template-loader.ts`, `src/lib/template-embeds.generated.ts`,
    `scripts/_generate_template_embeds.cjs`
  - consumidores modificados: `quadro-template.ts`, `orey-certificate-template.ts`,
    `colete-certificate-template.ts`, `colete-verification-sheet-template.ts`,
    `cliente-terceiros-template.ts`, `declaracao-isencao-iva-docx.ts`,
    `api/exportar-raft/route.ts`, `api/exportar-raft-pdf/route.ts`,
    `api/export/dgrm-docx/route.ts`, `api/certificados/orey/route.ts`
  - o resto do working tree modificado (inclui o fix do proxy/módulos — leva tudo de uma vez)
  - Fase 1 (listas) no mesmo deploy
- **Não commitar**: `.env*`, `scripts/_tmp_*`, `scripts/_probe_*`, `cruzeiroilhas24/`, `terminal_logs/`,
  `.next/`, `fix_schema*.js`, `clean_pkg.js`, `.vercel*` — rever `git status` antes.

### 2.4 Deploy + probe
- Push para `main` → `.github/workflows/deploy.yml` faz build + `vercel-action --prod`.
- Probe produção: adaptar `scripts/_tmp_probe_cert_prod.cjs` para também fazer
  `POST /api/exportar-raft` → esperar **200** + `Content-Type` xlsx + `Content-Disposition`;
  manter o probe de `/api/certificados/orey?format=html|xlsx` → 200.

## Fase 3 — Isolamento por estação (destrutivo, com backup primeiro)

Ordem estrita:
1. **Backup**: `node scripts/_backup_isolation.cjs` → confirmar ficheiro gerado e legível.
2. Operações: DELETE dos dados MAINLAND (4 clientes, 5 navios, 5 jangadas, 67 stock, 5 técnicos,
   4 filas) → UPDATE dos `NULL` açorianos para estação 1 (16 clientes, 15 jangadas, navios/inspecões
   ligados). *(Validação prévia já feita: 0 referências externas MAINLAND.)*
3. **Verificação pós-operação**: contagens por estação, FKs íntegras, nenhuma referência órfã.
4. Mantidos conforme decidido: 2868 navios NULL órfãos e 410 stock NULL global.

## Fase 4 — Pendências restantes (se houver tempo)

1. **Jangada 2153 (wizard)**: correr `scripts/_repro_inspecao_2153.cjs` e
   `scripts/_repro_wizard_put_2815.cjs`, diagnosticar, fixar.
2. **Dados**: decidir fusão do cliente id 830 "FRANCISCO PAULO A BETTENCOURT" (sem histórico)
   no 746 (script `scripts/_tmp_merge_bettencourt.cjs` / `_apply_merge_bettencourt.cjs` existem).
3. **3 erros TS pré-existentes** em kpis/rentabilidade (l.13, 25, 26).

## Orem de execução resumida

Fase 1 (listas) → Fase 2.1-2.2 (embeds + verificação) → **pedido de confirmação** →
Fase 2.3-2.4 (commit+push+deploy+probe) → Fase 3 (backup+isolamento+verificação) → Fase 4.
