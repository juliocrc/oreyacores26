"use client";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

type SearchResult = {
  type: string;
  label: string;
  href: string;
  icon?: string;
};

type QuickAction = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: string;
  keywords: string[];
};

const QUICK_ACTIONS: QuickAction[] = [
  { id: "criar-ot", label: "Criar Ordem de Serviço", description: "Nova OT para uma jangada", href: "/criar-ot", icon: "📋", keywords: ["criar", "ordem", "ot", "servico", "nova"] },
  { id: "dashboard", label: "Dashboard", description: "Visão geral do sistema", href: "/", icon: "🏠", keywords: ["dashboard", "inicio", "home"] },
  { id: "jangadas", label: "Jangadas", description: "Gestão de jangadas", href: "/jangadas", icon: "🛟", keywords: ["jangadas", "rafts", "listar"] },
  { id: "inspecoes", label: "Inspeções", description: "Inspeções de jangadas", href: "/inspecoes", icon: "🔍", keywords: ["inspecoes", "inspecao", "revisao"] },
  { id: "stock", label: "Stock", description: "Gestão de artigos", href: "/stock", icon: "📦", keywords: ["stock", "artigos", "inventario"] },
  { id: "clientes", label: "Clientes", description: "Gestão de clientes", href: "/clientes", icon: "👤", keywords: ["clientes", "cliente", "contactos"] },
  { id: "navios", label: "Navios", description: "Gestão de navios", href: "/navios", icon: "🚢", keywords: ["navios", "navio", "embarcacoes"] },
  { id: "agenda", label: "Agenda", description: "Calendário e agendamentos", href: "/agenda", icon: "📅", keywords: ["agenda", "calendario", "agendamentos"] },
  { id: "faturacao", label: "Faturação", description: "Emissão de faturas", href: "/faturacao", icon: "💰", keywords: ["faturacao", "fatura", "faturas", "emitir"] },
  { id: "orcamentos", label: "Orçamentos", description: "Gestão de orçamentos", href: "/orcamentos", icon: "📝", keywords: ["orcamentos", "orcamento", "propostas"] },
  { id: "ordens-servico", label: "Ordens de Serviço", description: "Lista de todas as OTs", href: "/ordens-servico", icon: "📋", keywords: ["ordens", "servico", "ots", "lista"] },
  { id: "equipamentos", label: "Equipamentos", description: "Coletes, fatos, EPIRBs", href: "/equipamentos", icon: "🦺", keywords: ["equipamentos", "coletes", "fatos", "epirbs"] },
  { id: "alertas", label: "Alertas", description: "Validades e notificações", href: "/alertas", icon: "🔔", keywords: ["alertas", "validades", "notificacoes"] },
  { id: "relatorios", label: "Relatórios", description: "Relatórios e estatísticas", href: "/relatorios", icon: "📊", keywords: ["relatorios", "relatorio", "estatisticas"] },
  { id: "logistica", label: "Logística", description: "Gestão logística", href: "/logistica", icon: "🚛", keywords: ["logistica", "transporte", "entregas"] },
  { id: "utilizadores", label: "Utilizadores", description: "Gestão de contas", href: "/utilizadores", icon: "⚙️", keywords: ["utilizadores", "users", "contas", "admin"] },
  { id: "estacoes", label: "Estações de Serviço", description: "Gestão de estações e multi-estação", href: "/estacoes", icon: "🏭", keywords: ["estacoes", "estacao", "servico", "multi", "stations"] },
];

const TYPE_ICONS: Record<string, string> = {
  Jangada: "🛟",
  Navio: "🚢",
  Cliente: "👤",
  Colete: "🦺",
  EPIRB: "📡",
  "Ordem de Serviço": "📋",
  Certificado: "📜",
  "Certificado Externo": "📑",
  "Certificado Colete": "🦺",
  "Certificado Fato": "🧥",
};

const TYPE_COLORS: Record<string, string> = {
  Jangada: "bg-blue-100 text-blue-700",
  Navio: "bg-cyan-100 text-cyan-700",
  Cliente: "bg-green-100 text-green-700",
  Colete: "bg-orange-100 text-orange-700",
  EPIRB: "bg-purple-100 text-purple-700",
  "Ordem de Serviço": "bg-amber-100 text-amber-700",
  Certificado: "bg-emerald-100 text-emerald-700",
  "Certificado Externo": "bg-teal-100 text-teal-700",
  "Certificado Colete": "bg-orange-100 text-orange-700",
  "Certificado Fato": "bg-indigo-100 text-indigo-700",
};

const RECENT_KEY = "cmd-palette-recent";

function getRecent(): SearchResult[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecent(item: SearchResult) {
  try {
    const recent = getRecent().filter((r) => r.href !== item.href);
    recent.unshift(item);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 8)));
  } catch { /* ignore */ }
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setRecent(getRecent());
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    } else {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(`/api/search/global?q=${encodeURIComponent(q)}`, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
        setSelectedIndex(0);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally {
      setLoading(false);
    }
  }, []);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => doSearch(query), 200);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [query, doSearch]);

  const filteredActions = useMemo(() => {
    if (query.length < 1) return QUICK_ACTIONS;
    const q = query.toLowerCase();
    return QUICK_ACTIONS.filter(
      (a) => a.label.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.keywords.some((k) => k.includes(q))
    );
  }, [query]);

  const grouped = useMemo(() => {
    return results.reduce<Record<string, SearchResult[]>>((acc, item) => {
      if (!acc[item.type]) acc[item.type] = [];
      acc[item.type].push(item);
      return acc;
    }, {});
  }, [results]);

  const totalItems = filteredActions.length + results.length + (query.length < 2 && recent.length > 0 ? recent.length : 0);

  function navigateTo(item: SearchResult) {
    saveRecent(item);
    setRecent(getRecent());
    setOpen(false);
    router.push(item.href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, totalItems - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      let idx = 0;
      // Check filtered actions
      if (idx + filteredActions.length > selectedIndex) {
        const action = filteredActions[selectedIndex - idx];
        if (action) { navigateTo({ type: "Ação", label: action.label, href: action.href, icon: action.icon }); return; }
      }
      idx += filteredActions.length;
      // Check recent (only when no query)
      if (query.length < 2) {
        if (idx + recent.length > selectedIndex) {
          const r = recent[selectedIndex - idx];
          if (r) { navigateTo(r); return; }
        }
        idx += recent.length;
      }
      // Check search results
      let flatIdx = 0;
      for (const [, items] of Object.entries(grouped)) {
        for (const item of items) {
          if (flatIdx === selectedIndex - idx) { navigateTo(item); return; }
          flatIdx++;
        }
      }
    }
  }

  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const selected = listEl.querySelector(`[data-index="${selectedIndex}"]`);
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  let flatIndex = 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-start justify-center pt-[12vh] sm:pt-[15vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-md"
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Panel */}
          <motion.div
            className="relative w-full max-w-xl mx-4 rounded-2xl shadow-2xl border border-white/20 overflow-hidden"
            style={{
              background: "rgba(255, 255, 255, 0.97)",
              backdropFilter: "blur(40px) saturate(180%)",
            }}
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
                onKeyDown={handleKeyDown}
                placeholder="Pesquisar ou navegar..."
                className="flex-1 bg-transparent outline-none text-gray-900 placeholder-gray-400 text-sm"
              />
              {loading && (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              )}
              <kbd className="hidden sm:inline-flex px-2 py-0.5 text-[10px] font-mono bg-gray-100 text-gray-500 rounded-md border border-gray-200">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[55vh] overflow-y-auto overscroll-contain">
              {/* Quick Actions */}
              {filteredActions.length > 0 && (
                <div>
                  <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    {query.length < 1 ? "⚡ Ações rápidas" : `⚡ Ações (${filteredActions.length})`}
                  </div>
                  {filteredActions.map((action) => {
                    const idx = flatIndex++;
                    return (
                      <button
                        key={action.id}
                        data-index={idx}
                        onClick={() => navigateTo({ type: "Ação", label: action.label, href: action.href, icon: action.icon })}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-all duration-100 ${
                          idx === selectedIndex
                            ? "bg-blue-50 text-blue-900"
                            : "hover:bg-gray-50 text-gray-700"
                        }`}
                      >
                        <span className="text-base w-6 text-center flex-shrink-0">{action.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{action.label}</div>
                          <div className="text-xs text-gray-400 truncate">{action.description}</div>
                        </div>
                        {idx === selectedIndex && (
                          <kbd className="text-[10px] font-mono text-blue-400 bg-blue-50 px-1.5 py-0.5 rounded">↵</kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Recent (when no query) */}
              {query.length < 2 && recent.length > 0 && (
                <div>
                  <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    🕐 Visitados recentemente
                  </div>
                  {recent.map((item) => {
                    const idx = flatIndex++;
                    return (
                      <button
                        key={`recent-${item.href}`}
                        data-index={idx}
                        onClick={() => navigateTo(item)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-all duration-100 ${
                          idx === selectedIndex
                            ? "bg-blue-50 text-blue-900"
                            : "hover:bg-gray-50 text-gray-700"
                        }`}
                      >
                        <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded ${TYPE_COLORS[item.type] || "bg-gray-100 text-gray-600"}`}>
                          {TYPE_ICONS[item.type] || "📄"}
                        </span>
                        <span className="flex-1 truncate">{item.label}</span>
                        {idx === selectedIndex && (
                          <kbd className="text-[10px] font-mono text-blue-400 bg-blue-50 px-1.5 py-0.5 rounded">↵</kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Search Results */}
              {Object.entries(grouped).map(([type, items]) => (
                <div key={type}>
                  <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    {TYPE_ICONS[type] || "📄"} {type} ({items.length})
                  </div>
                  {items.map((item) => {
                    const idx = flatIndex++;
                    return (
                      <button
                        key={`${item.type}-${item.href}`}
                        data-index={idx}
                        onClick={() => navigateTo(item)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-all duration-100 ${
                          idx === selectedIndex
                            ? "bg-blue-50 text-blue-900"
                            : "hover:bg-gray-50 text-gray-700"
                        }`}
                      >
                        <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded ${TYPE_COLORS[type] || "bg-gray-100 text-gray-600"}`}>
                          {TYPE_ICONS[type] || "📄"}
                        </span>
                        <span className="flex-1 truncate">{item.label}</span>
                        {idx === selectedIndex && (
                          <kbd className="text-[10px] font-mono text-blue-400 bg-blue-50 px-1.5 py-0.5 rounded">↵</kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}

              {/* Empty states */}
              {query.length >= 2 && results.length === 0 && !loading && (
                <div className="px-4 py-10 text-center text-gray-400 text-sm">
                  <div className="text-3xl mb-2">🔍</div>
                  <p className="font-medium">Nenhum resultado para &quot;{query}&quot;</p>
                  <p className="text-xs mt-1 text-gray-300">Tente outro termo ou navegue pelas ações rápidas</p>
                </div>
              )}

              {query.length < 2 && recent.length === 0 && (
                <div className="px-4 py-8 text-center text-gray-400 text-sm">
                  <div className="text-3xl mb-2">⌨️</div>
                  <p>Escreva para pesquisar jangadas, navios, clientes...</p>
                  <p className="text-xs mt-2 text-gray-300">
                    Use <kbd className="px-1 py-0.5 bg-gray-100 rounded text-gray-500 font-mono">:</kbd> para filtrar por tipo
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50/80 text-[10px] text-gray-400">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-gray-200 rounded font-mono">↑↓</kbd> navegar</span>
                <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-gray-200 rounded font-mono">↵</kbd> abrir</span>
                <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-gray-200 rounded font-mono">esc</kbd> fechar</span>
              </div>
              <span className="hidden sm:flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-500 font-mono">Ctrl</kbd>
                <span>+</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-500 font-mono">K</kbd>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
