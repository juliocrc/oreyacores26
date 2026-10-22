"use client";

import React from "react";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="bg-indigo-600 text-white px-6 py-2 rounded-xl shadow-lg font-bold hover:bg-indigo-700 print:hidden"
    >
      Imprimir / Guardar PDF
    </button>
  );
}
