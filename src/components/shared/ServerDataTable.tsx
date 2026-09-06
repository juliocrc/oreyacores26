"use client";
import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Loader2,
} from "lucide-react";

export type SortDirection = "asc" | "desc" | null;

export type ColumnDef<T> = {
  key: string;
  header: string;
  accessor?: (row: T) => unknown;
  sortable?: boolean;
  render?: (row: T, value: unknown) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  width?: string;
  hideOnMobile?: boolean;
};

export type ServerDataTableProps<T> = {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor: (row: T) => string | number;
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  sortKey: string | null;
  sortDir: SortDirection;
  onSortChange?: (key: string, dir: SortDirection) => void;
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode;
  rowActions?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  onSelectionChange?: (selectedRows: T[]) => void;
  bulkActions?: (selectedRows: T[]) => React.ReactNode;
  stickyHeader?: boolean;
  zebra?: boolean;
  compact?: boolean;
};

function ServerDataTableNoMemo<T>({
  data,
  columns,
  keyExtractor,
  page,
  pageSize,
  totalRows,
  totalPages,
  onPageChange,
  onPageSizeChange,
  sortKey,
  sortDir,
  onSortChange,
  loading = false,
  emptyMessage = "Sem dados para apresentar",
  emptyIcon,
  className = "",
  headerActions,
  rowActions,
  onRowClick,
  selectable = false,
  onSelectionChange,
  bulkActions,
  stickyHeader = true,
  zebra = true,
  compact = false,
}: ServerDataTableProps<T>) {
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const [selectedKeys, setSelectedKeys] = useState<Set<string | number>>(new Set());
  const prevDataRef = useRef<T[]>(data);

  useEffect(() => {
    if (data !== prevDataRef.current) {
      setSelectedKeys(new Set());
      prevDataRef.current = data;
    }
  }, [data]);

  useEffect(() => {
    if (onSelectionChange) {
      const selectedRows = data.filter((row) => selectedKeys.has(keyExtractor(row)));
      onSelectionChange(selectedRows);
    }
  }, [selectedKeys, data, keyExtractor, onSelectionChange]);

  const visibleCols = useMemo(() => columns.filter((c) => true), [columns]);
  const pageKeys = useMemo(() => new Set(data.map((row) => keyExtractor(row))), [data, keyExtractor]);

  const allPageSelected = data.length > 0 && data.every((row) => selectedKeys.has(keyExtractor(row)));
  const somePageSelected = data.some((row) => selectedKeys.has(keyExtractor(row)));

  const toggleRow = (key: string | number) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const key of pageKeys) next.delete(key);
      } else {
        for (const key of pageKeys) next.add(key);
      }
      return next;
    });
  };

  const handleSort = (key: string) => {
    if (!onSortChange) return;
    if (sortKey === key) {
      const nextDir: SortDirection = sortDir === "asc" ? "desc" : sortDir === "desc" ? null : "asc";
      onSortChange(key, nextDir);
    } else {
      onSortChange(key, "asc");
    }
  };

  const cellPad = compact ? "px-3 py-2" : "px-4 py-3";
  const textPad = compact ? "text-xs" : "text-sm";
  const selectedRows = useMemo(
    () => data.filter((row) => selectedKeys.has(keyExtractor(row))),
    [data, selectedKeys, keyExtractor]
  );

  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className}`}>
      {headerActions && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-3 py-2.5 border-b border-slate-100 bg-slate-50/70">
          {headerActions}
        </div>
      )}

      {selectable && selectedRows.length > 0 && bulkActions && (
        <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border-b border-indigo-100">
          <span className="text-sm font-bold text-indigo-700">
            {selectedRows.length} selecionado{selectedRows.length > 1 ? "s" : ""}
          </span>
          <div className="flex-1" />
          {bulkActions(selectedRows)}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className={`border-b border-slate-200 ${stickyHeader ? "sticky top-0 z-10" : ""}`}>
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
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{col.header}</span>
                    {col.sortable !== false && (
                      <span className="text-slate-400">
                        {sortKey === col.key ? (
                          sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                        ) : (
                          <ChevronsUpDown size={12} className="opacity-40" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              {rowActions && (
                <th className={`${cellPad} text-right text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50/90 w-[60px]`} />
              )}
            </tr>
          </thead>
          <tbody className="relative">
            {loading ? (
              <tr>
                <td colSpan={visibleCols.length + (rowActions ? 1 : 0) + (selectable ? 1 : 0)} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <Loader2 size={28} className="animate-spin" />
                    <span className="text-sm font-medium">A carregar...</span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length + (rowActions ? 1 : 0) + (selectable ? 1 : 0)} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    {emptyIcon || <Search size={32} className="opacity-30" />}
                    <span className="text-sm font-medium">{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr
                  key={keyExtractor(row)}
                  className={`border-b border-slate-100 last:border-0 transition-colors ${onRowClick ? "cursor-pointer hover:bg-indigo-50/50" : "hover:bg-slate-50/80"} ${zebra && idx % 2 === 1 ? "bg-slate-50/40" : ""}`}
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
                    const rawValue = col.accessor ? col.accessor(row) : (row as Record<string, unknown>)[col.key];
                    return (
                      <td
                        key={col.key}
                        className={`${cellPad} ${textPad} text-slate-700 ${col.className || ""} ${col.hideOnMobile ? "hidden lg:table-cell" : ""}`}
                      >
                        {col.render ? col.render(row, rawValue) : rawValue != null ? String(rawValue) : "—"}
                      </td>
                    );
                  })}
                  {rowActions && (
                    <td className={`${cellPad} text-right`} onClick={(e) => e.stopPropagation()}>
                      {rowActions(row)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalRows > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>
              A mostrar{" "}
              <span className="font-bold text-slate-700">
                {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, totalRows)}
              </span>{" "}
              de <span className="font-bold text-slate-700">{totalRows}</span>
            </span>
            {onPageSizeChange && (
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium"
              >
                {[10, 20, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size} / pág
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(0)}
              disabled={safePage === 0}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              onClick={() => onPageChange(Math.max(0, safePage - 1))}
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
                  onClick={() => onPageChange(pageNum)}
                  className={`min-w-[32px] h-8 rounded-lg text-xs font-bold transition-all ${pageNum === safePage ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}
                >
                  {pageNum + 1}
                </button>
              );
            })}

            <button
              onClick={() => onPageChange(Math.min(totalPages - 1, safePage + 1))}
              disabled={safePage >= totalPages - 1}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => onPageChange(totalPages - 1)}
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

export default React.memo(ServerDataTableNoMemo) as typeof ServerDataTableNoMemo;
