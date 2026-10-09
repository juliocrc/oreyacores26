"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { Dialog, DialogContent, TextField, List, ListItemButton, Typography, InputAdornment, Box, Chip, CircularProgress } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useRouter } from "next/navigation";

type SearchResult = {
  type: string;
  label: string;
  href: string;
};

type GlobalSearchProps = {
  showTrigger?: boolean;
};

const TYPE_STYLES: Record<string, { chipSx: Record<string, unknown>; sectionSx: Record<string, unknown> }> = {
  Jangada: {
    chipSx: { bgcolor: "#dbeafe", color: "#1d4ed8" },
    sectionSx: { color: "#1d4ed8" },
  },
  Navio: {
    chipSx: { bgcolor: "#dcfce7", color: "#166534" },
    sectionSx: { color: "#166534" },
  },
  Cliente: {
    chipSx: { bgcolor: "#fef3c7", color: "#92400e" },
    sectionSx: { color: "#92400e" },
  },
  Colete: {
    chipSx: { bgcolor: "#ffedd5", color: "#c2410c" },
    sectionSx: { color: "#c2410c" },
  },
  EPIRB: {
    chipSx: { bgcolor: "#e0e7ff", color: "#4338ca" },
    sectionSx: { color: "#4338ca" },
  },
  "Fato Imersão": {
    chipSx: { bgcolor: "#ccfbf1", color: "#0f766e" },
    sectionSx: { color: "#0f766e" },
  },
  Artigo: {
    chipSx: { bgcolor: "#f1f5f9", color: "#334155" },
    sectionSx: { color: "#334155" },
  },
  Fatura: {
    chipSx: { bgcolor: "#fee2e2", color: "#b91c1c" },
    sectionSx: { color: "#b91c1c" },
  },
  "Ordem de Serviço": {
    chipSx: { bgcolor: "#f3e8ff", color: "#7e22ce" },
    sectionSx: { color: "#7e22ce" },
  },
};

export default function GlobalSearch({ showTrigger = false }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const groupedResults = useMemo(() => {
    const groups = new Map<string, SearchResult[]>();
    for (const result of results) {
      const bucket = groups.get(result.type) || [];
      bucket.push(result);
      groups.set(result.type, bucket);
    }
    return Array.from(groups.entries()).map(([type, items]) => ({ type, items }));
  }, [results]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Ajuste de estado derivado durante render (padrão React "adjusting state when props change")
  if (!open) {
    if (query !== "") setQuery("");
    if (results.length !== 0) setResults([]);
  } else if (query.trim().length < 2 && results.length !== 0) {
    setResults([]);
  }

  useEffect(() => {
    if (open) {
      // Focus automatically
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) {
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search/global?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
        }
      } catch (error) {
        console.error("Search error", error);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const handleSelect = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      {showTrigger ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="hidden items-center gap-2 rounded-full border border-white/35 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/15 md:inline-flex"
          aria-label="Abrir pesquisa global"
        >
          <SearchIcon sx={{ fontSize: 18 }} />
          <span>Pesquisa global</span>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide">Ctrl+K</span>
        </button>
      ) : null}

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 2, position: 'absolute', top: 50, m: 0 } }}>
        <DialogContent sx={{ p: 0 }}>
        <TextField
          inputRef={inputRef}
          fullWidth
          placeholder="Pesquisa rápida (Jangadas, Navios, Clientes, Artigos, Faturas, Obras, Coletes, EPIRBs, Fatos...)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          variant="standard"
          sx={{ '& .MuiInputBase-root': { px: 2, py: 2, fontSize: '1.2rem' } }}
          InputProps={{
            disableUnderline: true,
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" fontSize="large" />
              </InputAdornment>
            ),
          }}
        />
          {loading ? (
            <Box sx={{ p: 2.5, borderTop: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 1.5, color: 'text.secondary' }}>
              <CircularProgress size={18} />
              <Typography variant="body2">A procurar resultados...</Typography>
            </Box>
          ) : null}
          {groupedResults.length > 0 && !loading && (
            <List sx={{ pt: 0, borderTop: '1px solid #eee', maxHeight: 350, overflow: 'auto' }}>
            {groupedResults.map((group) => {
              const styles = TYPE_STYLES[group.type] || {
                chipSx: { bgcolor: '#e5e7eb', color: '#374151' },
                sectionSx: { color: '#374151' },
              };

              return (
                <Box key={group.type}>
                  <Box sx={{ px: 2, py: 1, position: 'sticky', top: 0, zIndex: 1, bgcolor: 'background.paper', borderBottom: '1px solid #f1f5f9' }}>
                    <Typography variant="caption" fontWeight={700} sx={{ letterSpacing: '0.08em', textTransform: 'uppercase', ...styles.sectionSx }}>
                      {group.type} · {group.items.length}
                    </Typography>
                  </Box>
                  {group.items.map((r, i) => (
                    <ListItemButton key={`${group.type}-${i}-${r.href}`} onClick={() => handleSelect(r.href)} sx={{ py: 1.5, px: 2 }}>
                      <Box sx={{ display: 'flex', width: '100%', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <Typography variant="body1" fontWeight="500" sx={{ lineHeight: 1.35 }}>{r.label}</Typography>
                          <Typography variant="caption" color="text.secondary">Abrir {r.type.toLowerCase()}</Typography>
                        </Box>
                        <Chip label={r.type} size="small" sx={{ fontWeight: 600, ...styles.chipSx }} />
                      </Box>
                    </ListItemButton>
                  ))}
                </Box>
              );
            })}
            </List>
          )}
          {query.trim().length >= 2 && results.length === 0 && !loading && (
            <Box sx={{ p: 3, textAlign: 'center', borderTop: '1px solid #eee' }}>
              <Typography color="text.secondary">Nenhum resultado encontrado.</Typography>
            </Box>
          )}
          {query.trim().length < 2 && !loading ? (
            <Box sx={{ p: 2.5, borderTop: '1px solid #eee', color: 'text.secondary' }}>
              <Typography variant="body2">Escreve pelo menos 2 caracteres para pesquisar por jangada, navio, cliente, artigo, fatura, obra ou equipamento.</Typography>
            </Box>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
