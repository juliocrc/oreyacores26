"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";

type Change = { campo: string; antes: unknown; depois: unknown };
type HistoryItem = { id: number; quando: string; quem: string; origem: string; alteracoes: Change[] };
type HistoryPage = { items: HistoryItem[]; nextCursor: number | null };

const labels: Record<string, string> = {
  artigos: "Artigos", artigo: "Artigo", name: "Designação", referencia: "Referência", quantidade: "Quantidade",
  validade: "Validade", codigoFabricante: "Código fabricante", stockId: "Lote (ID stock)", inspecaoId: "Inspeção",
  hruReferencia: "HRU: referência", hruDataInstalacao: "HRU: instalação", hruValidade: "HRU: validade", hruSerial: "HRU: série",
  cylinderSerial: "Garrafa: série", cylinderDataTeste: "Garrafa: teste", cylinderDataProxTeste: "Garrafa: próximo teste",
  radarReflector: "Refletor radar", radarReflectorValidade: "Refletor radar: validade", packType: "Tipo de pack",
};

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(vazio)";
  if (Array.isArray(value)) return value.length ? value.map(display).join("\n\n") : "(sem artigos)";
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${labels[key] || key}: ${display(item)}`).join("\n");
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}

export default function JangadaEquipmentHistory({ jangadaId, refreshKey }: { jangadaId: number | string; refreshKey?: number | string }) {
  return <EquipmentHistory key={JSON.stringify([jangadaId, refreshKey])} jangadaId={jangadaId} />;
}

function EquipmentHistory({ jangadaId }: { jangadaId: number | string }) {
  const [page, setPage] = useState<HistoryPage>({ items: [], nextCursor: null });
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/jangadas/${encodeURIComponent(jangadaId)}/historico-equipamentos?limit=20${cursor ? `&cursor=${cursor}` : ""}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Erro ao carregar histórico.");
        return body as HistoryPage;
      })
      .then(body => { if (!controller.signal.aborted) setPage(previous => ({ ...body, items: cursor ? [...previous.items.filter(item => !body.items.some(next => next.id === item.id)), ...body.items] : body.items })); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Erro ao carregar histórico."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [jangadaId, cursor, retry]);

  return <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
    <Stack spacing={2}>
      <Typography variant="h6">Histórico de equipamentos</Typography>
      <Typography variant="body2" color="text.secondary">Alterações registadas a partir da ativação deste histórico.</Typography>
      {error && <Alert severity="error" action={<Button color="inherit" onClick={() => { setLoading(true); setError(""); setRetry(value => value + 1); }}>Repetir</Button>}>{error}</Alert>}
      {page.items.map(item => <Box key={item.id}>
        <Typography variant="subtitle2">{item.origem}</Typography>
        <Typography variant="caption" color="text.secondary">{new Date(item.quando).toLocaleString("pt-PT")} · {item.quem}</Typography>
        <TableContainer sx={{ mt: 1 }}>
          <Table size="small" aria-label={`Alterações de equipamentos #${item.id}`} sx={{ minWidth: 480 }}>
            <TableHead><TableRow><TableCell>Campo</TableCell><TableCell>Antes</TableCell><TableCell>Depois</TableCell></TableRow></TableHead>
            <TableBody>{item.alteracoes.map(change => <TableRow key={change.campo}>
              <TableCell sx={{ verticalAlign: "top", overflowWrap: "anywhere" }}>{labels[change.campo] || change.campo.replace(/^checklist\./, "Checklist: ")}</TableCell>
              <TableCell sx={{ whiteSpace: "pre-wrap", verticalAlign: "top", overflowWrap: "anywhere" }}>{display(change.antes)}</TableCell>
              <TableCell sx={{ whiteSpace: "pre-wrap", verticalAlign: "top", overflowWrap: "anywhere" }}>{display(change.depois)}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </TableContainer>
      </Box>)}
      {!loading && !error && !page.items.length && <Typography color="text.secondary">Sem alterações de equipamentos registadas.</Typography>}
      {loading && <Box role="status" aria-label="A carregar histórico"><CircularProgress size={24} /></Box>}
      {page.nextCursor && <Button disabled={loading} onClick={() => { setLoading(true); setError(""); setCursor(page.nextCursor); }}>Carregar mais</Button>}
    </Stack>
  </Paper>;
}
