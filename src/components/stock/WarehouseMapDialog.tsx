"use client";

import React from "react";
import { X } from "lucide-react";
import StockShelvesMap, { type ShelfStockItem } from "@/components/stock/StockShelvesMap";

type WarehouseMapDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  items: ShelfStockItem[];
  mode?: "view" | "select";
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
};

export default function WarehouseMapDialog({
  isOpen,
  onClose,
  items,
  mode = "view",
  selectedLocation = "",
  onSelectLocation,
}: WarehouseMapDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div>
            <h3 className="text-lg font-black text-slate-800">
              {mode === "select" ? "Escolher prateleira" : "Mapa das prateleiras"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {mode === "select"
                ? "Escolhe uma localização e confirma para este artigo."
                : "Stock agrupado pelas localizações registadas, sem alterar o armazém."}
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar prateleiras"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-200/65 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <StockShelvesMap
            items={items}
            mode={mode}
            selectedLocation={selectedLocation}
            onSelectLocation={(loc) => {
              onSelectLocation?.(loc);
              if (mode === "select") onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
