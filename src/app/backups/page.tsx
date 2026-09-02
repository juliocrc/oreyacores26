"use client";

import { useEffect, useState, useRef } from "react";
import { Database, Download, Trash2, Play, CheckCircle, Loader2, FileJson, Mail, Upload, HardDrive } from "lucide-react";
import { importDatabaseAction } from "./actions";

type BackupItem = {
  name: string;
  createdAt: string;
  size: number;
  tablesCount: number;
};

export default function BackupsPage() {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSendEmailBackup = async () => {
    setSendingEmail(true);
    setMessage(null);
    try {
      const res = await fetch("/api/backups/email", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        if (data.simulated && data.fileData) {
          const byteCharacters = atob(data.fileData);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = data.filename || "backup_excel.xlsx";
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);
        }
        setMessage({ text: data.message || "Operação concluída.", type: "success" });
      } else {
        setMessage({ text: data.error || "Erro ao gerar backup por e-mail.", type: "error" });
      }
    } catch (e) {
      console.error(e);
      setMessage({ text: "Erro de rede ao enviar backup por e-mail.", type: "error" });
    } finally {
      setSendingEmail(false);
    }
  };

  const handleExportDb = () => {
    window.open("/api/backups/export-db", "_blank");
  };

  const handleImportDb = async (file: File) => {
    setImporting(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await importDatabaseAction(formData);
      if (res.success) {
        setMessage({ text: res.message || "Base de dados importada com sucesso!", type: "success" });
      } else {
        setMessage({ text: res.error || "Erro ao importar base de dados.", type: "error" });
      }
    } catch (e) {
      console.error(e);
      setMessage({ text: "Erro de rede ao importar base de dados.", type: "error" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/backups");
      if (res.ok) {
        const data = await res.json();
        setBackups(data);
      }
    } catch (e) {
      console.error("Erro ao carregar backups", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await fetchBackups();
    })();
  }, []);

  const handleCreateBackup = async () => {
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/backups", { method: "POST" });
      if (res.ok) {
        setMessage({ text: "Backup da base de dados criado com sucesso!", type: "success" });
        fetchBackups();
      } else {
        const data = await res.json();
        setMessage({ text: data.error || "Falha ao criar o backup.", type: "error" });
      }
    } catch (e) {
      console.error(e);
      setMessage({ text: "Erro de rede ao ligar ao servidor de backup.", type: "error" });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteBackup = async (name: string) => {
    if (!confirm(`Tem a certeza que deseja eliminar o backup "${name}"?`)) return;
    try {
      const res = await fetch(`/api/backups/${name}`, { method: "DELETE" });
      if (res.ok) {
        setMessage({ text: "Backup eliminado com sucesso.", type: "success" });
        fetchBackups();
      } else {
        const data = await res.json();
        setMessage({ text: data.error || "Falha ao eliminar o backup.", type: "error" });
      }
    } catch (e) {
      console.error(e);
      setMessage({ text: "Erro ao comunicar com o servidor.", type: "error" });
    }
  };

  const handleDownloadBackup = (name: string) => {
    window.open(`/api/backups/${name}`, "_blank");
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 pb-5 border-b border-gray-200">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Database className="text-indigo-600" /> Cópias de Segurança (Backups)
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Gerir as cópias de segurança locais do sistema e descarregar exportações em JSON.
            </p>
          </div>
          <div className="mt-4 sm:mt-0 flex flex-wrap gap-3">
            <button
              onClick={handleCreateBackup}
              disabled={creating}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-sm text-sm transition disabled:opacity-60"
            >
              {creating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Criando Cópia...
                </>
              ) : (
                <>
                  <Play size={16} />
                  Criar Backup JSON
                </>
              )}
            </button>
            <button
              onClick={handleSendEmailBackup}
              disabled={sendingEmail}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-sm text-sm transition disabled:opacity-60"
            >
              {sendingEmail ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  A enviar...
                </>
              ) : (
                <>
                  <Mail size={16} />
                  Enviar Cópia para E-mail
                </>
              )}
            </button>
            <button
              onClick={() => window.open("/api/backups/export-excel", "_blank")}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-sm text-sm transition"
            >
              <Download size={16} />
              Exportar Tabelas Excel (.xlsx)
            </button>
            <button
              onClick={handleExportDb}
              className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-sm text-sm transition"
              title="Descarregar o ficheiro local.db completo"
            >
              <HardDrive size={16} />
              Exportar BD (.db)
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-sm text-sm transition disabled:opacity-60"
              title="Importar um ficheiro .db para substituir a base de dados atual"
            >
              {importing ? (
                <><Loader2 size={16} className="animate-spin" /> A importar...</>
              ) : (
                <><Upload size={16} /> Importar BD (.db)</>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".db"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportDb(file);
              }}
            />
          </div>
        </div>

        {message && (
          <div
            className={`p-4 mb-6 rounded-xl border flex items-start gap-2.5 text-sm font-medium transition ${
              message.type === "success"
                ? "bg-emerald-50 border-emerald-250 text-emerald-800"
                : "bg-rose-50 border-rose-250 text-rose-800"
            }`}
          >
            <CheckCircle size={16} className="mt-0.5 shrink-0" />
            <span>{message.text}</span>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-150 bg-gray-50/50">
            <h3 className="font-bold text-gray-800 text-base">Ficheiros de Cópia Disponíveis</h3>
            <p className="text-xs text-gray-500 mt-1">O sistema mantém automaticamente os backups das últimas 48 horas.</p>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="animate-spin text-indigo-500" size={32} />
                <span className="text-sm text-slate-500 font-medium">A carregar lista de backups...</span>
              </div>
            ) : backups.length > 0 ? (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="p-4 pl-6">Nome do Ficheiro</th>
                    <th className="p-4">Data de Criação</th>
                    <th className="p-4">Tamanho</th>
                    <th className="p-4">Tabelas Exportadas</th>
                    <th className="p-4 pr-6 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {backups.map((backup) => (
                    <tr key={backup.name} className="hover:bg-slate-50/50 transition">
                      <td className="p-4 pl-6 font-semibold text-slate-800 flex items-center gap-2">
                        <FileJson size={14} className="text-slate-400" />
                        {backup.name}
                      </td>
                      <td className="p-4 text-slate-600">
                        {new Date(backup.createdAt).toLocaleString("pt-PT")}
                      </td>
                      <td className="p-4 text-slate-600 font-medium">
                        {formatBytes(backup.size)}
                      </td>
                      <td className="p-4 text-slate-500">
                        {backup.tablesCount} tabelas
                      </td>
                      <td className="p-4 pr-6 text-right space-x-2">
                        <button
                          onClick={() => handleDownloadBackup(backup.name)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition"
                          title="Descarregar ficheiro JSON combinado"
                        >
                          <Download size={12} />
                          Descarregar
                        </button>
                        <button
                          onClick={() => handleDeleteBackup(backup.name)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg transition"
                          title="Eliminar backup do servidor"
                        >
                          <Trash2 size={12} />
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-16 px-4">
                <Database size={40} className="mx-auto text-slate-300 mb-3" />
                <h4 className="text-sm font-bold text-slate-700">Nenhum backup encontrado</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Clique no botão &quot;Criar Backup Agora&quot; no topo para gerar a sua primeira cópia de segurança.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
