# Plano — Stock: listas compactas + vistas Lista/Quadros/Detalhes

Pedido: *"no stock, organiza as listas para ocupar menos espaço, sem ter um grande espaço para cada artigo, permite mostrar lista, quadro e detalhes"*.

**Contexto:** o seletor Quadros/Lista/Detalhes **já existe** em `src/app/stock/page.tsx:2560-2589` (idêntico ao dos clientes, persistido em localStorage). O trabalho é tornar cada vista compacta — sobretudo a Lista (3 tabelas agrupadas com scroll próprio e linhas altas) e os cartões Quadros (`p-4` + 7 linhas empilhadas por artigo).

Decisões do utilizador: **tabela única DataTable** · **compactar Quadros e Detalhes** · **enxugar o cromo superior**.

---

## 1. `src/components/shared/DataTable.tsx` — 2 melhorias opcionais (base comum)

1. **Filtros usam `accessor` quando existe** — hoje `filteredData` (L127-134) lê só `row[key]`, o que quebra colunas calculadas (`secção`, `marcaModelo`, `cliente`, `estado` com badge). Mudar para `col.accessor ? col.accessor(row) : row[key]` (mesma lógica do sort, L145-146). Inofensivo para os clientes.
2. **Colunas persistentes** — novos props opcionais:
   - `visibleColumnsKeys?: string[] | null` — quando não-nulo, controla as colunas visíveis (sincronizado via `useEffect`); `null` = ainda a carregar (mostra todas).
   - `onVisibleColumnsChange?: (keys: string[]) => void` — notifica alterações do menu "Colunas".
   Permite ao stock manter o `localStorage` atual (`STOCK_LIST_COLUMNS_KEY`) **sem** o seletor manual.

Nada mais muda no componente (search, sort, CSV, paginação, sticky header, `compact`, `rowActions`, `headerActions` mantêm-se).

## 2. Vista Lista → uma única `DataTable` (`src/app/stock/page.tsx:2685-2964`)

Substituir as 3 tabelas de secções por:

```tsx
<DataTable<ItemStock>
  data={itensFiltrados}
  columns={stockListColumns}   // 17 STOCK_LIST_COLUMNS + "Secção"
  compact
  pageSize={50}  pageSizeOptions={[10, 25, 50, 100]}
  onRowClick={(r) => openViewItem(r)}
  searchKeys={["nome", "descricao", "referencia", "codigoFabricante", "categoria", "estadoArtigo"]}
  searchPlaceholder="Pesquisar artigos..."
  exportFileName="stock"
  visibleColumnsKeys={...}  onVisibleColumnsChange={...}   // §1.2, localStorage atual
  headerActions={<> Exportar Excel (exportStockExcel) · Densidade </>
                 + botão "Selecionar filtrados (n)"}
  rowActions={(item) => <div className="flex gap-1 whitespace-nowrap" onClick={stop}>+1 · −1 · Repôr mínimo? · Ver ficha · Etiqueta · Excluir</div>}
/>
```

- **Nova coluna `secção`** (primeira): `accessor: getPrioritySectionKey`, `render` = badge com o label da secção, `filterType: "select"` com as 3 opções (`validade`/`jangadas`/`restantes` → labels de `stockPrioritySections`). Substitui os cabeçalhos/KPIs-dentro-de-tabela; os **chips de KPI por secção** (contagem, un., €, resumo de validade ❌/⚠️/📅) ficam numa **linha compacta única acima da tabela** (reaproveitar o JSX de L2691-2720 numa só linha flex com chips).
- Restantes colunas calculadas via `accessor`: `marcaModelo` (`marca / modelo`), `necessidade12m`/`saldoProjetado12m`/`necessidadeMensal` (de `stockNeedsById`), `prateleira` (chip com `resolveShelfCode` + `onClick` a `setFiltroPrateleira` **com `e.stopPropagation()`**), `referencia` (link `/stock/{id}`), `quantidade` (badges 🔻/❌/⚠️), `foto` (`renderStockThumb`).
- **Checkbox de seleção** = coluna própria com `render` (`checked={selectedIds.includes(id)}`, `stopPropagation`) → mantém a barra de seleção em lote atual (L2656-2684) e a consistência com as vistas Quadros/Detalhes (não usar `selectable` do DataTable para não limpar a seleção ao trocar de vista/página).
- `acordeões de categoria` (`expandedStockCategories`, expandir/recolher) **passam a servir só Quadros/Detalhes** — os botões Expandir/Recolher saem da linha do seletor nessa vista (ficam só em quadros/detalhes). Na Lista, a categoria é coluna com filtro select.
- Remover: bloco `space-y-4` das 3 secções, os `max-h-[75vh]`, os `<td class="flex">` (bug de layout que infla as linhas) e o `<table>` manual.

## 3. Vista Quadros → cartões compactos (L3029-3092)

Por artigo:
- `p-4` → `p-3`, grid `gap-4` → `gap-3`;
- alinhar thumb + nome + badge numa linha de cabeçalho (checkbox ao lado);
- as **7 linhas empilhadas** (L3062-3079) → `grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs`: Qtd (mín), Referência, Preço, Categoria, Marca/Modelo, Associável; badges 🔻/❌ mantidos como chips inline no cabeçalho;
- 5 botões → linha `mt-2` com botões `text-[11px] px-1.5`; "Repôr mínimo" condicional como na lista.
- Objetivo: ~50% menos altura por cartão. Cabeçalhos de secção/categoria mantêm-se.

## 4. Vista Detalhes → compressão moderada (L3174-3221)

- `p-4` → `p-3`; grelha `md:grid-cols-3` → `md:grid-cols-4`, `gap-2 mt-3` → `gap-x-3 gap-y-1 mt-2 text-xs`;
- botões do cabeçalho no mesmo estilo compacto da §3.

## 5. Enxugar o cromo superior

1. **Chips das 21 prateleiras (L2342-2396)** → colapsar atrás de um botão `🗂 Prateleiras (20) · N/20 ocupadas` (estado novo `showShelves`, default **fechado**; abrir se `filtroPrateleira` ativo). O grid de chips só renderiza quando aberto.
2. **Barra da vista Lista (L2590-2655)** → eliminar o painel seletor de colunas manual (o menu "Colunas" do DataTable substitui, com persistência §1.2) e mover para a **linha do seletor de vistas** (L2560): manter `Densidade` (liga `compact` do DataTable via `listDensity`) e `⬇ Exportar Excel` como `headerActions`. "Mostrar todas/Ocultar quase todas" passam para o menu Colunas (ou botões mínimos nessa linha).
3. **Barra de seleção (L2656-2684)** → mantida (é uma linha fina e serve as 3 vistas), mas esconder os botões "Selecionar/Limpar" quando `selectedIds.length === 0` (mostrar só "Selecionar filtrados (n)").
4. KPIs `needsSummary` (L2309-2341) → manter (são globais, não por artigo).

## 6. Limpezas derivadas

- `stockPrioritySections` deixa de ser usado na Lista; continua em Quadros/Detalhes → mantido.
- Botões Expandir/Recolher tudo (L2575-2588): renderizar só quando `viewMode !== "lista"`.
- Manter `itensFiltrados` (filtros de página, L1321-1379) como `data` da DataTable — a busca/filtros internos do DataTable atuam por cima.
- Não tocar em `/stock/reposicoes` e `/stock/necessidades` (já são tabelas compactas).

## 7. Verificação

1. `npx tsc -p tsconfig.typecheck.json --noEmit` + lint (3 erros TS pré-existentes em kpis/rentabilidade são conhecidos e não bloqueiam).
2. Dev server: `/stock` — vista Lista (busca, ordenação, filtro Secção/Categoria, colunas, CSV/Excel, paginação, ações por linha, seleção em lote, clique abre ficha), Quadros (cartões compactos, ações), Detalhes, persistência das colunas/densidade/vista entre reloads, chips de prateleira colapsados.
3. Regressão: `/clientes` continua a funcionar (DataTable partilhado alterado na §1).

## Ordem

§1 (DataTable) → §2 (lista) → §3+§4 (cartões) → §5 (cromo) → §7 (verificação).

**Nota:** as fases anteriores de `PLANO_SESSAO.md` (listas de navios/jangadas, embeds do certificado + deploy, isolamento) continuam pendentes deste lado — este plano tem prioridade agora.
