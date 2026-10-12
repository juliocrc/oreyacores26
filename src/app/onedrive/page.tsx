"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowUp,
  CheckCircle,
  Cloud,
  Folder,
  FolderOpen,
  HardDrive,
  Loader2,
  RefreshCw,
  Save,
} from "lucide-react";

type OneDriveConfig = { enabled: boolean; rootPath: string };

type GraphStatus = {
  configured: boolean;
  missing: string[];
  drive: { id: string; name?: string; driveType?: string } | null;
  error?: string;
};

type BrowseState = {
  path: string;
  parent: string | null;
  directories: { name: string; path: string }[];
  oneDriveRoots: string[];
};

const ROOT_FOLDER = "OREYACORESDELUXE2026";

export default function OneDriveSettingsPage() {
  const [config, setConfig] = useState<OneDriveConfig>({ enabled: false, rootPath: "" });
  const [detectedRoots, setDetectedRoots] = useState<string[]>([]);
  const [rootExists, setRootExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingFolders, setCreatingFolders] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const [browse, setBrowse] = useState<BrowseState | null>(null);
  const [browseLoading, setBrowseLoading] = useState(true);

  const [graphStatus, setGraphStatus] = useState<GraphStatus | null>(null);
  const [graphLoading, setGraphLoading] = useState(true);

  const loadGraphStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/onedrive-sync/graph-status");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Erro ao verificar o Microsoft Graph.");
      setGraphStatus(data as GraphStatus);
    } catch (err) {
      setGraphStatus({
        configured: false,
        missing: [],
        drive: null,
        error: err instanceof Error ? err.message : "Erro ao verificar o Microsoft Graph.",
      });
    } finally {
      setGraphLoading(false);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/onedrive-sync");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Erro ao carregar a configuração.");
      setConfig({ enabled: Boolean(data.config?.enabled), rootPath: String(data.config?.rootPath || "") });
      setDetectedRoots(Array.isArray(data.detectedRoots) ? data.detectedRoots : []);
      setRootExists(Boolean(data.rootExists));
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Erro ao carregar a configuração.", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  const browseTo = useCallback(async (target?: string) => {
    try {
      const query = target ? `?path=${encodeURIComponent(target)}` : "";
      const res = await fetch(`/api/onedrive-sync/browse${query}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Erro ao listar pastas.");
      setBrowse({
        path: String(data.path || ""),
        parent: data.parent ?? null,
        directories: Array.isArray(data.directories) ? data.directories : [],
        oneDriveRoots: Array.isArray(data.oneDriveRoots) ? data.oneDriveRoots : [],
      });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Erro ao listar pastas.", type: "error" });
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carregamento inicial da configuração e da pasta a partir da API.
    void loadConfig();
    void browseTo();
    void loadGraphStatus();
  }, [loadConfig, browseTo, loadGraphStatus]);

  function selectFolder(target: string) {
    setConfig((prev) => ({ ...prev, enabled: true, rootPath: target }));
    setMessage(null);
  }

  function handleBrowse(target?: string) {
    setBrowseLoading(true);
    void browseTo(target);
  }

  function handleTestGraph() {
    setGraphLoading(true);
    void loadGraphStatus();
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/onedrive-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: config.enabled, rootPath: config.rootPath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Erro ao guardar a configuração.");
      setMessage({ text: "Configuração guardada. Os documentos passam a ser sincronizados para esta pasta.", type: "success" });
      await loadConfig();
      await browseTo(config.rootPath || undefined);
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Erro ao guardar a configuração.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateFolders() {
    if (!window.confirm("Criar no OneDrive a pasta Documentos (com DGRM, Quadros, Certificados, Documentos) de todos os navios com jangadas associadas?")) {
      return;
    }
    setCreatingFolders(true);
    setMessage(null);
    try {
      const res = await fetch("/api/onedrive-sync/navio-folders", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Erro ao criar as pastas dos navios.");
      setMessage({
        text: `Pastas criadas: ${data.created ?? 0} · já existentes: ${data.existing ?? 0} · erros: ${data.errors ?? 0} (origem: ${data.source ?? "n/a"})`,
        type: "success",
      });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Erro ao criar as pastas dos navios.", type: "error" });
    } finally {
      setCreatingFolders(false);
    }
  }

  const candidateRoots = Array.from(new Set([...(browse?.oneDriveRoots || []), ...detectedRoots]));

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 pb-5 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Cloud className="text-sky-600" /> OneDrive — Pasta de Destino
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Escolhe a pasta raiz do OneDrive <strong>neste computador</strong>. Os documentos são guardados em{" "}
            <code className="bg-gray-100 px-1 rounded">{ROOT_FOLDER}/…</code> dentro dessa pasta.
          </p>
        </div>

        {message && (
          <div
            className={`p-4 mb-6 rounded-xl border flex items-start gap-2.5 text-sm font-medium ${
              message.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle size={16} className="mt-0.5 shrink-0" />
            ) : (
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="animate-spin text-sky-500" size={32} />
            <span className="text-sm text-slate-500 font-medium">A carregar configuração…</span>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-800 text-base flex items-center gap-2">
                  <Cloud size={16} className="text-sky-600" /> Microsoft Graph (produção / Vercel)
                </h2>
                <button
                  onClick={handleTestGraph}
                  disabled={graphLoading}
                  className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition disabled:opacity-40"
                >
                  {graphLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Testar ligação
                </button>
              </div>

              {graphLoading ? (
                <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
                  <Loader2 size={16} className="animate-spin" /> A verificar…
                </div>
              ) : graphStatus?.configured && !graphStatus.error ? (
                <div className="flex items-start gap-2.5 text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <CheckCircle size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p>Ligado ao OneDrive via Microsoft Graph.</p>
                    {graphStatus.drive && (
                      <p className="text-xs mt-1 font-mono text-emerald-700 break-all">
                        {graphStatus.drive.name || "(sem nome)"} · {graphStatus.drive.driveType || "drive"}
                        <br />
                        {graphStatus.drive.id}
                      </p>
                    )}
                  </div>
                </div>
              ) : graphStatus?.configured && graphStatus.error ? (
                <div className="flex items-start gap-2.5 text-sm font-medium text-rose-800 bg-rose-50 border border-rose-200 rounded-xl p-4">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p>Variáveis definidas, mas a ligação falhou.</p>
                    <p className="text-xs mt-1 font-mono break-all">{graphStatus.error}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Microsoft Graph não configurado.</p>
                    <p className="mt-1 text-xs">
                      Define estas variáveis de ambiente na Vercel (Settings → Environment Variables) e faz redeploy:
                    </p>
                    <ul className="mt-2 text-xs font-mono list-disc list-inside">
                      <li>ONEDRIVE_TENANT_ID</li>
                      <li>ONEDRIVE_CLIENT_ID</li>
                      <li>ONEDRIVE_CLIENT_SECRET</li>
                      <li>ONEDRIVE_DRIVE_ID</li>
                    </ul>
                    {graphStatus?.missing && graphStatus.missing.length > 0 && (
                      <p className="mt-2 text-xs">Em falta agora: {graphStatus.missing.join(", ")}</p>
                    )}
                  </div>
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h2 className="font-bold text-gray-800 text-base mb-4 flex items-center gap-2">
                <Save size={16} className="text-sky-600" /> Pasta local (este computador)
              </h2>
              <div className="space-y-4">
                <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => setConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                  />
                  Sincronização com OneDrive ativa
                </label>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Pasta raiz (caminho no computador)
                  </label>
                  <input
                    type="text"
                    value={config.rootPath}
                    onChange={(e) => setConfig((prev) => ({ ...prev, rootPath: e.target.value }))}
                    placeholder="C:\Users\julio\OneDrive - LYNX"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  {config.rootPath && (
                    <p className={`text-xs mt-1.5 flex items-center gap-1 ${rootExists ? "text-emerald-600" : "text-rose-600"}`}>
                      {rootExists ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                      {rootExists ? "Pasta encontrada." : "Pasta não encontrada neste computador."}
                    </p>
                  )}
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-sm text-sm transition disabled:opacity-60"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Guardar
                </button>
              </div>
            </section>

            {candidateRoots.length > 0 && (
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h2 className="font-bold text-gray-800 text-base mb-1 flex items-center gap-2">
                  <HardDrive size={16} className="text-sky-600" /> Pastas OneDrive detetadas neste computador
                </h2>
                <p className="text-xs text-gray-500 mb-4">Clique para usar como pasta raiz.</p>
                <div className="flex flex-col gap-2">
                  {candidateRoots.map((root) => (
                    <button
                      key={root}
                      onClick={() => selectFolder(root)}
                      className={`text-left px-3 py-2 rounded-xl border text-sm font-mono transition ${
                        config.rootPath === root
                          ? "border-sky-400 bg-sky-50 text-sky-800"
                          : "border-gray-200 hover:bg-gray-50 text-slate-700"
                      }`}
                    >
                      {root}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-800 text-base flex items-center gap-2">
                  <FolderOpen size={16} className="text-sky-600" /> Navegar
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => browse?.parent && handleBrowse(browse.parent)}
                    disabled={!browse?.parent || browseLoading}
                    className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition disabled:opacity-40"
                  >
                    <ArrowUp size={12} /> Subir
                  </button>
                  <button
                    onClick={() => handleBrowse(browse?.path)}
                    disabled={browseLoading}
                    className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition disabled:opacity-40"
                  >
                    <RefreshCw size={12} /> Atualizar
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-mono text-slate-700 mb-3 break-all">
                {browse?.path || "…"}
              </div>

              <button
                onClick={() => browse?.path && selectFolder(browse.path)}
                disabled={!browse?.path}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-2 rounded-xl shadow-sm text-xs transition disabled:opacity-50 mb-4"
              >
                <CheckCircle size={14} /> Selecionar esta pasta
              </button>

              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-80 overflow-y-auto">
                {browseLoading ? (
                  <div className="flex items-center justify-center py-8 gap-2 text-slate-500">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-sm">A listar…</span>
                  </div>
                ) : browse && browse.directories.length > 0 ? (
                  browse.directories.map((dir) => (
                    <button
                      key={dir.path}
                      onClick={() => handleBrowse(dir.path)}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-sky-50 hover:text-sky-800 transition flex items-center gap-2"
                    >
                      <Folder size={14} className="text-amber-500 shrink-0" />
                      <span className="truncate">{dir.name}</span>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-8 text-center text-sm text-slate-400">Sem subpastas.</div>
                )}
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h2 className="font-bold text-gray-800 text-base mb-1 flex items-center gap-2">
                <FolderOpen size={16} className="text-sky-600" /> Pastas dos navios
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                Cria em <code className="bg-gray-100 px-1 rounded">{ROOT_FOLDER}/navios/&lt;navio&gt;/Documentos/…</code> a
                estrutura para todos os navios com jangadas associadas.
              </p>
              <button
                onClick={handleCreateFolders}
                disabled={creatingFolders || !config.enabled || !rootExists}
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-sm text-sm transition disabled:opacity-50"
              >
                {creatingFolders ? <Loader2 size={16} className="animate-spin" /> : <FolderOpen size={16} />}
                Criar pastas dos navios
              </button>
            </section>

            <p className="text-xs text-slate-400">
              Nota: este modo (pasta local) só funciona quando a aplicação corre no computador que tem o OneDrive
              sincronizado. Em produção na Vercel é necessário configurar o Microsoft Graph.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
