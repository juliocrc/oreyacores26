"use client";

export default function PrintPageButton({
  label = "Imprimir / Guardar PDF",
  className = "bg-indigo-600 text-white px-6 py-2 rounded-xl shadow-lg font-bold hover:bg-indigo-700",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      {label}
    </button>
  );
}
