type Ship = { nome?: unknown; jangadas?: unknown };
type Raft = { serial?: unknown; dataProxInspecao?: unknown };

export function formatClientInspections(ships: unknown): string {
  if (!Array.isArray(ships)) throw new Error("Dados inválidos");
  const inspections = ships.flatMap((ship: Ship) => (Array.isArray(ship.jangadas) ? ship.jangadas : []).flatMap((raft: Raft) => {
    const date = typeof raft.dataProxInspecao === "string" ? raft.dataProxInspecao.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return [];
    return [{ date, serial: typeof raft.serial === "string" ? raft.serial : "Sem número", ship: typeof ship.nome === "string" ? ship.nome : "Navio" }];
  })).sort((a, b) => a.date.localeCompare(b.date));
  if (!inspections.length) return "Não há datas de próxima inspeção disponíveis nas suas jangadas. Confirme os detalhes na área de cliente.";
  return `Datas registadas de próxima inspeção (inclui datas vencidas; até 10):\n${inspections.slice(0, 10).map(item => `${item.date.split("-").reverse().join("/")} · ${item.ship} · jangada ${item.serial}`).join("\n")}`;
}

export function formatClientRequests(pedidos: unknown): string {
  if (!Array.isArray(pedidos)) throw new Error("Dados inválidos");
  if (!pedidos.length) return "Não há pedidos de assistência registados na sua área de cliente.";
  return `Pedidos de assistência mais recentes (até 20):\n${pedidos.map((item: { id?: unknown; tipoAssistencia?: unknown; estado?: unknown }) =>
    `#${typeof item.id === "number" ? item.id : "—"} · ${typeof item.tipoAssistencia === "string" ? item.tipoAssistencia : "Assistência"} · ${typeof item.estado === "string" ? item.estado : "estado indisponível"}`
  ).join("\n")}`;
}

export function clientCertificateLinks(ships: unknown): Array<{ label: string; href: string }> {
  if (!Array.isArray(ships)) throw new Error("Dados inválidos");
  return ships.flatMap((ship: { nome?: unknown; jangadas?: unknown }) =>
    (Array.isArray(ship.jangadas) ? ship.jangadas : []).flatMap((raft: { id?: unknown; serial?: unknown; inspecoes?: unknown }) => {
      if (!Number.isSafeInteger(raft.id) || Number(raft.id) <= 0 || !Array.isArray(raft.inspecoes)) return [];
      const inspection = raft.inspecoes.find((item: { id?: unknown; downloadable?: unknown }) => item.downloadable === true && Number.isSafeInteger(item.id) && Number(item.id) > 0);
      if (!inspection) return [];
      const label = `${typeof ship.nome === 'string' ? ship.nome : 'Embarcação'} · jangada ${typeof raft.serial === 'string' ? raft.serial : 'sem série'} · certificado ${typeof inspection.certificadoNumero === 'string' ? inspection.certificadoNumero : ''}`;
      return [{ label, href: `/api/portal/documentos?jangadaId=${raft.id}&inspecaoId=${inspection.id}&document=certificado&format=pdf` }];
    }));
}
