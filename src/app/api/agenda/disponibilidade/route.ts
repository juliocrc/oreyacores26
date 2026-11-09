import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getDashboardScope } from "@/lib/dashboard-access";
import { getTechnicianKeyByName } from "@/lib/agenda-technicians";
import { agendaAvailabilityRange, calculateAgendaAvailability, isAgendaCivilDate } from "@/lib/agenda-availability";

export async function GET(request: NextRequest) {
  try {
    const scope = await getDashboardScope(request);
    if (scope.error) return scope.error;
    const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
    if (scope.stationId === null) return fail("Selecione uma estacao para consultar disponibilidade.");
    const params = request.nextUrl.searchParams;
    if ([...params.keys()].some(name => params.getAll(name).length !== 1)) return fail("Parametros repetidos.");
    const date = params.get("date") ?? "";
    const rawDuration = params.get("durationMinutes") ?? "180";
    const rawId = params.get("excludeId");
    const responsavel = params.get("responsavel")?.trim();
    const raftSerial = params.get("raftSerial")?.trim();
    if (!isAgendaCivilDate(date)) return fail("date deve ser uma data valida YYYY-MM-DD entre 2000 e 2100.");
    if (!/^\d+$/.test(rawDuration) || Number(rawDuration) < 1 || Number(rawDuration) > 1440) return fail("durationMinutes deve ser um inteiro entre 1 e 1440.");
    if (rawId !== null && (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId)) || Number(rawId) > 2147483647)) return fail("excludeId invalido.");
    if (params.has("responsavel") && (!responsavel || responsavel.length > 200)) return fail("responsavel invalido.");
    if (params.has("raftSerial") && (!raftSerial || raftSerial.length > 200)) return fail("raftSerial invalido.");
    const technicians = await prisma.tecnico.findMany({ where: { ...scope.where, ativo: true }, select: { id: true, nome: true }, orderBy: { id: "asc" } });
    if (responsavel && !technicians.some(t => getTechnicianKeyByName(t.nome) === getTechnicianKeyByName(responsavel))) return fail("Tecnico nao encontrado nesta estacao.", 404);
    if (raftSerial && !await prisma.jangada.findFirst({ where: { ...scope.where, serial: raftSerial }, select: { id: true } })) return fail("Jangada nao encontrada nesta estacao.", 404);
    if (rawId !== null && !await prisma.agendaEvento.findFirst({ where: { ...scope.where, id: Number(rawId) }, select: { id: true } })) return fail("Agendamento nao encontrado nesta estacao.", 404);
    const range = agendaAvailabilityRange(date);
    // There is no persisted end timestamp or upper duration bound: a lower start
    // cutoff would silently miss long events crossing into the requested range.
    const [events, absences] = await Promise.all([
      prisma.agendaEvento.findMany({ where: scope.where, select: {
        id: true, date: true, responsavel: true, status: true, raftSerial: true, type: true, inspectionType: true,
        durationMinutes: true, bufferBeforeMinutes: true, bufferAfterMinutes: true,
      } }),
      prisma.tecnicoAusencia.findMany({ where: { OR: [
        { tecnicoId: { in: technicians.map(t => t.id) } },
        { tecnicoId: null, tecnicoKey: { in: technicians.map(t => getTechnicianKeyByName(t.nome)) } },
      ], dataInicio: { lt: new Date(range.end) }, dataFim: { gt: new Date(range.start) } },
        select: { tecnicoId: true, tecnicoKey: true, dataInicio: true, dataFim: true } }),
    ]);
    const result = calculateAgendaAvailability({ date, durationMinutes: Number(rawDuration), technicians, events,
      absences: absences.flatMap(a => technicians.filter(t => a.tecnicoId !== null ? t.id === a.tecnicoId : getTechnicianKeyByName(t.nome) === a.tecnicoKey)
        .map(t => ({ tecnicoId: t.id, start: a.dataInicio, end: a.dataFim }))), responsavel, raftSerial,
      excludeId: rawId === null ? undefined : Number(rawId) });
    if (absences.some(a => a.tecnicoId === null)) result.warnings = [...(result.warnings ?? []), "Ausencias legadas associadas por chave ao roster da estacao; confirme a ligacao tecnicoId."];
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Nao foi possivel calcular disponibilidade." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
