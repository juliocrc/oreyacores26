import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
        <p className="text-6xl font-black text-slate-200">404</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">Calibrações não encontradas</h1>
        <p className="mt-2 text-sm text-slate-600">
          O recurso que procuras não existe ou foi movido.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Voltar ao dashboard
        </Link>
      </div>
    </div>
  );
}
