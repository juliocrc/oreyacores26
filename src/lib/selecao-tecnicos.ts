import prisma from "@/lib/prisma";
import { APP_CONFIG } from "@/lib/app-config";
import { normalizeEmail } from "@/lib/auth";

export type TecnicoSelecionavel = {
  /** Id do técnico — é este que vai no formulário. */
  tecnicoId: number;
  nome: string;
  email: string;
  estacao: string | null;
  estacaoId: number | null;
  /** True quando pertence à estação configurada (vem primeiro na lista). */
  estacaoPrincipal: boolean;
  /** False quando ainda não tem utilizador — é criado ao clicar. */
  temUtilizador: boolean;
};

/**
 * Roster opcional, definido em `APP_TECNICOS_SELECIONAVEIS` como lista de emails
 * separados por vírgula. Quando está vazio (por omissão) entram todos os
 * técnicos activos, que era o comportamento anterior.
 *
 * Isto existe porque o quadro técnico é pequeno e fixo: preferimos uma lista
 * explícita e auditável a "quem estiver activo na base de dados" — assim
 * acrescentar alguém ao quadro é uma decisão explícita, não um efeito
 * colateral de um registo de técnico activo.
 */
function lerRosterPermitido(): Set<string> {
  const raw = (process.env.APP_TECNICOS_SELECIONAVEIS || "").trim();
  if (!raw) return new Set();
  const emails = raw
    .split(",")
    .map((valor) => normalizeEmail(valor))
    .filter(Boolean);
  return new Set(emails);
}

/**
 * OREYACORESDELUXE — técnicos que podem iniciar sessão.
 *
 * Não há palavra-passe: quem entra é o técnico que clica no próprio nome. Por
 * isso listamos **todos** os técnicos activos, e não só os da estação
 * configurada — caso contrário quem estivesse ligado a outra estação ficava
 * sem forma de entrar. O acesso aos dados continua a ser filtrado depois, em
 * `getAccessContext`.
 *
 * A estação configurada aparece primeiro para o arranque do dia-a-dia.
 */
export async function listarTecnicosSelecionaveis(): Promise<TecnicoSelecionavel[]> {
  const [tecnicos, estacoes, users] = await Promise.all([
    prisma.tecnico.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, email: true, serviceStationId: true },
      orderBy: { nome: "asc" },
    }),
    prisma.serviceStation.findMany({
      select: { id: true, codigo: true, nome: true },
    }),
    prisma.user.findMany({
      where: { NOT: { role: "CLIENTE" } },
      select: { id: true, email: true },
    }),
  ]);

  const estacaoPrincipalId = estacoes.find(
    (e) => e.codigo === APP_CONFIG.defaultServiceStationCode,
  )?.id;
  const estacaoPorId = new Map(estacoes.map((e) => [e.id, e]));
  const userPorEmail = new Map(users.map((u) => [normalizeEmail(u.email), u.id]));
  const roster = lerRosterPermitido();

  const disponiveis: TecnicoSelecionavel[] = [];

  for (const tecnico of tecnicos) {
    if (!tecnico.email) continue;
    const email = normalizeEmail(tecnico.email);
    if (roster.size > 0 && !roster.has(email)) continue;
    const estacao = tecnico.serviceStationId ? estacaoPorId.get(tecnico.serviceStationId) : undefined;
    disponiveis.push({
      tecnicoId: tecnico.id,
      nome: tecnico.nome,
      email,
      estacao: estacao?.nome ?? estacao?.codigo ?? null,
      estacaoId: tecnico.serviceStationId,
      estacaoPrincipal: tecnico.serviceStationId === estacaoPrincipalId,
      temUtilizador: userPorEmail.has(email),
    });
  }

  return disponiveis.sort((a, b) => {
    if (a.estacaoPrincipal !== b.estacaoPrincipal) return a.estacaoPrincipal ? -1 : 1;
    return a.nome.localeCompare(b.nome, "pt", { sensitivity: "base" });
  });
}
