import { formatBytes, getAndroidAppCatalog } from '@/lib/android-app-catalog';

export const dynamic = 'force-dynamic';

export default function AplicacoesPage() {
  const stations = getAndroidAppCatalog();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold text-slate-900">Aplicações</h1>
      <p className="mt-2 text-slate-600">
        Versões e downloads das aplicações Android por estação de serviço.
      </p>
      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Instale apenas APKs obtidos nesta página. Confirme o nome da estação no ecrã de arranque
        da aplicação antes de iniciar sessão.
      </p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {stations.map((station) => (
          <section
            key={station.slug}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-xl font-semibold text-slate-900">{station.name}</h2>
            <ul className="mt-4 space-y-4">
              {station.apps.map((app) => (
                <li
                  key={app.key}
                  className="border-t border-slate-100 pt-4 first:border-t-0 first:pt-0"
                >
                  <h3 className="font-semibold text-slate-900">
                    {app.name} — {station.name}
                  </h3>
                  {app.downloadUrl ? (
                    <>
                      <p className="mt-1 text-sm text-slate-600">
                        Versão {app.version}
                        {app.sizeBytes ? ` · ${formatBytes(app.sizeBytes)}` : ''}
                      </p>
                      <a
                        href={app.downloadUrl}
                        className="mt-3 inline-block rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
                      >
                        Descarregar APK
                      </a>
                      <details className="mt-3 text-xs text-slate-500">
                        <summary className="cursor-pointer">Verificação do ficheiro</summary>
                        <p className="mt-2 break-all font-mono">SHA-256: {app.sha256}</p>
                      </details>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">
                      Versão ainda não publicada para esta estação.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
