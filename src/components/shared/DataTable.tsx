"use client";
import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  X,
  Filter,
  MoreVertical,
  Columns3,
} from "lucide-react";

export type SortDirection = "asc" | "desc" | null;

export type ColumnDef<T> = {
  key: string;
  header: string;
  accessor?: (row: T) => unknown;
  sortable?: boolean;
  filterable?: boolean;
  filterType?: "text" | "select" | "date" | "number";
  filterOptions?: Array<{ label: string; value: string }>;
  render?: (row: T, value: unknown) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  width?: string;
  hideOnMobile?: boolean;
  exportAccessor?: (row: T) => string;
};

export type DataTableProps<T> = {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  onExport?: (rows: T[]) => void;
  searchPlaceholder?: string;
  searchKeys?: string[];
  pageSize?: number;
  pageSizeOptions?: number[];
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  loading?: boolean;
  className?: string;
  headerActions?: React.ReactNode;
  rowActions?: (row: T) => React.ReactNode;
  stickyHeader?: boolean;
  compact?: boolean;
  zebra?: boolean;
  exportFileName?: string;
  selectable?: boolean;
  onSelectionChange?: (selectedRows: T[]) => void;
  bulkActions?: (selectedRows: T[]) => React.ReactNode;
};

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function DataTableNoMemo<T>({
  data,
  columns,
  keyExtractor,
  onRowClick,
  onExport,
  searchPlaceholder = "Pesquisar...",
  searchKeys,
  pageSize: initialPageSize = 20,
  pageSizeOptions = [10, 20, 50, 100],
  emptyMessage = "Sem dados para apresentar",
  emptyIcon,
  loading = false,
  className = "",
  headerActions,
  rowActions,
  stickyHeader = true,
  compact = false,
  zebra = true,
  exportFileName = "dados",
  selectable = false,
  onSelectionChange,
  bulkActions,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showColumnToggle, setShowColumnToggle] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(columns.map((c) => c.key))
  );
  const [showFilters, setShowFilters] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string | number>>(new Set());
  const columnToggleRef = useRef<HTMLDivElement>(null);

  const activeFiltersCount = Object.values(filters).filter(Boolean).length;

  const filteredData = useMemo(() => {
    let result = [...data];

    if (search.trim()) {
      const searchNorm = normalizeText(search);
      const keys =
        searchKeys && searchKeys.length > 0
          ? searchKeys
          : columns.filter((c) => c.filterable !== false).map((c) => c.key);
      result = result.filter((row) =>
        keys.some((key) => {
          const val = (row as Record<string, unknown>)[key];
          return normalizeText(val).includes(searchNorm);
        })
      );
    }

    Object.entries(filters).forEach(([key, filterVal]) => {
      if (!filterVal) return;
      const filterNorm = normalizeText(filterVal);
      result = result.filter((row) => {
        const val = (row as Record<string, unknown>)[key];
        return normalizeText(val).includes(filterNorm);
      });
    });

    return result;
  }, [data, search, filters, columns, searchKeys]);

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return filteredData;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = col.accessor ? col.accessor(a) : (a as Record<string, unknown>)[sortKey];
      const bVal = col.accessor ? col.accessor(b) : (b as Record<string, unknown>)[sortKey];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      let cmp = 0;
      if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
      } else if (aVal instanceof Date && bVal instanceof Date) {
        cmp = aVal.getTime() - bVal.getTime();
      } else {
        cmp = String(aVal).localeCompare(String(bVal), "pt-PT");
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [filteredData, sortKey, sortDir, columns]);

  useEffect(() => {
    setPage(0);
  }, [search, filters, pageSize]);

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [search, filters, pageSize]);

  useEffect(() => {
    if (onSelectionChange) {
      const selectedRows = sortedData.filter((row) => selectedKeys.has(keyExtractor(row)));
      onSelectionChange(selectedRows);
    }
  }, [selectedKeys, sortedData, keyExtractor, onSelectionChange]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        columnToggleRef.current &&
        !columnToggleRef.current.contains(e.target as Node)
      ) {
        setShowColumnToggle(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pagedData = useMemo(
    () => sortedData.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [sortedData, safePage, pageSize]
  );

  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        if (sortDir === "asc") setSortDir("desc");
        else if (sortDir === "desc") {
          setSortKey(null);
          setSortDir(null);
        }
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey, sortDir]
  );

  const toggleColumn = useCallback(
    (key: string) => {
      setVisibleColumns((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    []
  );

  const handleExportCSV = useCallback(() => {
    const visible = columns.filter((c) => visibleColumns.has(c.key));
    const header = visible.map((c) => `"${c.header}"`).join(";");
    const rows = sortedData.map((row) =>
      visible
        .map((c) => {
          const val = c.exportAccessor
            ? c.exportAccessor(row)
            : c.accessor
              ? String(c.accessor(row) ?? "")
              : String((row as Record<string, unknown>)[c.key] ?? "");
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(";")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    if (onExport) onExport(sortedData);
  }, [sortedData, columns, visibleColumns, exportFileName, onExport]);

  const visibleCols = useMemo(
    () => columns.filter((c) => visibleColumns.has(c.key)),
    [columns, visibleColumns]
  );

  const allPageSelected = selectable && pagedData.length > 0 && pagedData.every((row) => selectedKeys.has(keyExtractor(row)));
  const somePageSelected = selectable && pagedData.some((row) => selectedKeys.has(keyExtractor(row)));

  const toggleSelectAll = useCallback(() => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pagedData.forEach((row) => next.delete(keyExtractor(row)));
      } else {
        pagedData.forEach((row) => next.add(keyExtractor(row)));
      }
      return next;
    });
  }, [allPageSelected, pagedData, keyExtractor]);

  const toggleRow = useCallback((key: string | number) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectedRows = useMemo(
    () => data.filter((row) => selectedKeys.has(keyExtractor(row))),
    [data, selectedKeys, keyExtractor]
  );

  const cellPad = compact ? "px-2.5 py-1.5" : "px-4 py-2.5";
  const textPad = compact ? "text-xs" : "text-sm";

  if (loading) {
    return (
      <div className={`bg-white rounded-xl border border-slate-200 overflow-hidden ${className}`}>
        <div className="p-3 border-b border-slate-100">
          <div className="h-10 bg-slate-100 rounded-xl animate-pulse" />
        </div>
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-slate-50 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-sm ${className}`}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 p-3 border-b border-slate-100 bg-slate-50/40">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {columns.some((c) => c.filterable !== false) && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                showFilters || activeFiltersCount > 0
                  ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Filter size={14} />
              Filtros
              {activeFiltersCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 bg-indigo-600 text-white text-[10px] font-bold rounded-full">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          )}

          <div className="relative" ref={columnToggleRef}>
            <button
              onClick={() => setShowColumnToggle(!showColumnToggle)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
            >
              <Columns3 size={14} />
              Colunas
            </button>
            {showColumnToggle && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-white border border-slate-200 rounded-xl shadow-xl p-2 space-y-0.5">
                {columns.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns.has(col.key)}
                      onChange={() => toggleColumn(col.key)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-slate-700 font-medium">
                      {col.header}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
          >
            <Download size={14} />
            CSV
          </button>

          {headerActions}
        </div>
      </div>

      {/* Filters row */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50/80 border-b border-slate-100">
          {columns
            .filter((c) => c.filterable !== false)
            .map((col) => (
              <div key={col.key} className="flex items-center gap-1.5">
                {col.filterType === "select" && col.filterOptions ? (
                  <select
                    value={filters[col.key] || ""}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        [col.key]: e.target.value,
                      }))
                    }
                    className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">{col.header}</option>
                    {col.filterOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={col.filterType === "date" ? "date" : "text"}
                    value={filters[col.key] || ""}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        [col.key]: e.target.value,
                      }))
                    }
                    placeholder={col.header}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 w-32 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                )}
                {filters[col.key] && (
                  <button
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, [col.key]: "" }))
                    }
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          {activeFiltersCount > 0 && (
            <button
              onClick={() => setFilters({})}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 ml-2"
            >
              Limpar tudo
            </button>
          )}
        </div>
      )}

      {/* Bulk actions bar */}
      {selectable && selectedRows.length > 0 && bulkActions && (
        <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border-b border-indigo-100">
          <span className="text-sm font-bold text-indigo-700">
            {selectedRows.length} selecionado{selectedRows.length > 1 ? "s" : ""}
          </span>
          <div className="flex-1" />
          {bulkActions(selectedRows)}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr
              className={`border-b border-slate-200 ${stickyHeader ? "sticky top-0 z-10" : ""}`}
            >
              {selectable && (
                <th className={`${cellPad} w-[40px] bg-slate-50/90`}>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={(el) => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
              )}
              {visibleCols.map((col) => (
                <th
                  key={col.key}
                  className={`${cellPad} text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50/90 backdrop-blur-sm select-none ${col.headerClassName || ""} ${col.width ? `w-[${col.width}]` : ""} ${col.hideOnMobile ? "hidden lg:table-cell" : ""} ${col.sortable !== false ? "cursor-pointer hover:text-slate-700" : ""}`}
                  onClick={() =>
                    col.sortable !== false ? handleSort(col.key) : undefined
                  }
                >
                  <div className="flex items-center gap-1.5">
                    <span>{col.header}</span>
                    {col.sortable !== false && (
                      <span className="text-slate-400">
                        {sortKey === col.key ? (
                          sortDir === "asc" ? (
                            <ChevronUp size={12} />
                          ) : (
                            <ChevronDown size={12} />
                          )
                        ) : (
                          <ChevronsUpDown size={12} className="opacity-40" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              {rowActions && (
                <th
                  className={`${cellPad} text-right text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50/90 w-[60px]`}
                />
              )}
            </tr>
          </thead>
          <tbody>
            {              pagedData.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleCols.length + (rowActions ? 1 : 0) + (selectable ? 1 : 0)}
                  className="px-6 py-16 text-center"
                >
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    {emptyIcon || (
                      <Search size={32} className="opacity-30" />
                    )}
                    <span className="text-sm font-medium">{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            ) : (
              pagedData.map((row, idx) => (
                <tr
                  key={keyExtractor(row)}
                  className={`border-b border-slate-100 last:border-0 transition-colors ${
                    onRowClick
                      ? "cursor-pointer hover:bg-indigo-50/50"
                      : "hover:bg-slate-50/80"
                  } ${zebra && idx % 2 === 1 ? "bg-slate-50/40" : ""}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {selectable && (
                    <td className={`${cellPad} w-[40px]`} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(keyExtractor(row))}
                        onChange={() => toggleRow(keyExtractor(row))}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                  )}
                  {visibleCols.map((col) => {
                    const rawValue = col.accessor
                      ? col.accessor(row)
                      : (row as Record<string, unknown>)[col.key];
                    return (
                      <td
                        key={col.key}
                        className={`${cellPad} ${textPad} text-slate-700 ${col.className || ""} ${col.hideOnMobile ? "hidden lg:table-cell" : ""}`}
                      >
                        {col.render
                          ? col.render(row, rawValue)
                          : rawValue != null
                            ? String(rawValue)
                            : "—"}
                      </td>
                    );
                  })}
                  {rowActions && (
                    <td
                      className={`${cellPad} text-right`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {rowActions(row)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {sortedData.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>
              A mostrar{" "}
              <span className="font-bold text-slate-700">
                {safePage * pageSize + 1}–
                {Math.min((safePage + 1) * pageSize, sortedData.length)}
              </span>{" "}
              de{" "}
              <span className="font-bold text-slate-700">
                {sortedData.length}
              </span>
            </span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size} / pág
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(0)}
              disabled={safePage === 0}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft size={16} />
            </button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i;
              } else if (safePage < 2) {
                pageNum = i;
              } else if (safePage > totalPages - 3) {
                pageNum = totalPages - 5 + i;
              } else {
                pageNum = safePage - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`min-w-[32px] h-8 rounded-lg text-xs font-bold transition-all ${
                    pageNum === safePage
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  {pageNum + 1}
                </button>
              );
            })}

            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={safePage >= totalPages - 1}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(DataTableNoMemo) as typeof DataTableNoMemo;
