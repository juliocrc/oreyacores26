import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";

function parseDateFlexible(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const yyyyMmDd = raw.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (yyyyMmDd) {
    const year = Number(yyyyMmDd[1]);
    const month = Number(yyyyMmDd[2]);
    const day = Number(yyyyMmDd[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const parsed = new Date(year, month - 1, day);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    if (day >= 1 && day <= 12 && month >= 1 && month <= 31) {
      const parsedLegacy = new Date(year, day - 1, month);
      if (!Number.isNaN(parsedLegacy.getTime())) return parsedLegacy;
    }
  }

  const ddMmYyyy = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (ddMmYyyy) {
    const day = Number(ddMmYyyy[1]);
    const month = Number(ddMmYyyy[2]);
    const year = Number(ddMmYyyy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const parsed = new Date(year, month - 1, day);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }

  const mmYyyy = raw.match(/^(\d{1,2})[\/\-\.](\d{4})$/);
  if (mmYyyy) {
    const month = Number(mmYyyy[1]);
    const year = Number(mmYyyy[2]);
    if (month >= 1 && month <= 12) {
      const parsed = new Date(year, month - 1, 1);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }

  const mmYy = raw.match(/^(\d{1,2})[\/\-\.](\d{2})$/);
  if (mmYy) {
    const month = Number(mmYy[1]);
    const shortYear = Number(mmYy[2]);
    if (month >= 1 && month <= 12) {
      const fullYear = shortYear >= 70 ? 1900 + shortYear : 2000 + shortYear;
      const parsed = new Date(fullYear, month - 1, 1);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }

  return null;
}

function isWithinDays(dateText: string | null | undefined, days: number) {
  const parsedDate = parseDateFlexible(dateText);
  if (!parsedDate) return false;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const limit = new Date(now);
  limit.setDate(limit.getDate() + days);

  return parsedDate.getTime() >= now.getTime() && parsedDate.getTime() <= limit.getTime();
}

export async function GET() {
  const access = await getAccessContext();
  if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

  try {
    const [jangadas, certificados, pendingOrders, epirbs, extintores, fatos] = await Promise.all([
      prisma.jangada.findMany({
        select: {
          id: true,
          serial: true,
          brand: true,
          model: true,
          capacity: true,
          shipId: true,
          shipNameManual: true,
          dataProxInspecao: true,
        },
        take: 5000,
        orderBy: { id: "desc" },
      }),
      prisma.certificadoExtraido.findMany({
        select: {
          id: true,
          certificadoNumero: true,
          raftSerial: true,
          shipName: true,
          shipOwner: true,
          dataProxInspecao: true,
          sourceYear: true,
          isMaisRecente: true,
          jangada: {
            select: { id: true, brand: true, model: true, capacity: true, shipId: true },
          },
        },
        take: 5000,
        orderBy: { id: "desc" },
      }),
      prisma.ordemServico.findMany({
        where: {
          status: "pendente",
        },
        select: {
          id: true,
          numeroOrdem: true,
          dataPlaneadaInicio: true,
          dataAbertura: true,
          shipId: true,
          clienteId: true,
          cliente: { select: { nome: true, email: true, telmovel: true, telefone: true } },
          jangada: {
            select: {
              serial: true,
            },
          },
        },
        orderBy: { id: "desc" },
      }),
      prisma.epirb.findMany({
        where: {
          estado: "Ativo",
        },
        select: {
          id: true,
          serial: true,
          marca: true,
          modelo: true,
          shipId: true,
          ownerName: true,
          ownerPhone: true,
          dataProxInspecao: true,
          dataValidadeBateria: true,
        },
        take: 5000,
        orderBy: { id: "desc" },
      }),
      prisma.extintor.findMany({
        where: {
          estado: "Ativo",
        },
        select: {
          id: true,
          serial: true,
          marca: true,
          modelo: true,
          tipoAgente: true,
          dataProxRecarga: true,
          dataProxTesteHidraulico: true,
          shipId: true,
        },
        take: 5000,
        orderBy: { id: "desc" },
      }),
      prisma.fatoImersao.findMany({
        where: {
          estado: "Ativo",
        },
        select: {
          id: true,
          serial: true,
          marca: true,
          modelo: true,
          dataProxInspecao: true,
          shipId: true,
        },
        take: 5000,
        orderBy: { id: "desc" },
      }),
    ]);

    // Resolve ship + cliente for pending orders, jangadas, epirbs, extintores and fatos
    const shipIds = Array.from(
      new Set(
        [
          ...pendingOrders.map((o) => o.shipId),
          ...jangadas.map((j) => j.shipId),
          ...certificados.map((c) => c.jangada?.shipId),
          ...epirbs.map((e) => e.shipId),
          ...extintores.map((e) => e.shipId),
          ...fatos.map((f) => f.shipId),
        ].filter((id): id is number => typeof id === "number"),
      ),
    );
    const ships = shipIds.length > 0
      ? await prisma.navio.findMany({
          where: { id: { in: shipIds } },
          select: {
            id: true,
            nome: true,
            cliente: { select: { nome: true, email: true, telmovel: true, telefone: true } },
          },
        })
      : [];
    const shipNameMap = new Map(ships.map((s) => [s.id, s.nome]));
    const shipInfoMap = new Map(
      ships.map((s) => [
        s.id,
        {
          navioNome: s.nome,
          clienteNome: s.cliente?.nome ?? null,
          clienteEmail: s.cliente?.email ?? null,
          clienteTelefone: s.cliente?.telmovel || s.cliente?.telefone || null,
        },
      ]),
    );

    const alertasAssistencia = pendingOrders.map((o) => {
      const shipName = o.shipId ? shipNameMap.get(o.shipId) : null;
      const info = o.shipId ? shipInfoMap.get(o.shipId) : undefined;
      const ref = shipName
        ? `Ordem nº ${o.numeroOrdem} - ${shipName}`
        : `Ordem nº ${o.numeroOrdem}`;
      return {
        tipo: "assistencia" as const,
        id: o.id,
        referencia: ref,
        data: o.dataPlaneadaInicio ? o.dataPlaneadaInicio.toISOString() : o.dataAbertura.toISOString(),
        jangadaSerial: o.jangada?.serial || null,
        ordemId: o.id,
        navioNome: info?.navioNome ?? shipName ?? null,
        clienteNome: o.cliente?.nome ?? info?.clienteNome ?? null,
        clienteEmail: o.cliente?.email ?? info?.clienteEmail ?? null,
        clienteTelefone:
          o.cliente?.telmovel || o.cliente?.telefone || info?.clienteTelefone || null,
      };
    });

    const alertasInspecao = jangadas
      .filter((j) => isWithinDays(j.dataProxInspecao, 30))
      .map((j) => {
        const info = j.shipId ? shipInfoMap.get(j.shipId) : undefined;
        return {
          tipo: "inspecao" as const,
          id: j.id,
          referencia:
            j.model?.trim() && j.serial?.trim()
              ? `${j.model} (${j.serial})`
              : j.serial || `Jangada ${j.id}`,
          data: j.dataProxInspecao,
          jangadaId: j.id,
          jangadaSerial: j.serial,
          jangadaMarca: j.brand || null,
          jangadaModelo: j.model || null,
          jangadaCapacidade: j.capacity ?? null,
          navioNome: info?.navioNome ?? j.shipNameManual ?? null,
          clienteNome: info?.clienteNome ?? null,
          clienteEmail: info?.clienteEmail ?? null,
          clienteTelefone: info?.clienteTelefone ?? null,
          status: info?.navioNome ?? j.shipNameManual ?? null,
        };
      });

    const alertasCertificado = certificados
      .filter((c) => c.isMaisRecente && isWithinDays(c.dataProxInspecao, 30))
      .map((c) => {
        const info = c.jangada?.shipId ? shipInfoMap.get(c.jangada.shipId) : undefined;
        return {
          tipo: "certificado" as const,
          id: c.id,
          referencia: c.certificadoNumero || c.raftSerial || `Certificado ${c.id}`,
          data: c.dataProxInspecao,
          jangadaId: c.jangada?.id ?? null,
          jangadaSerial: c.raftSerial,
          jangadaMarca: c.jangada?.brand || null,
          jangadaModelo: c.jangada?.model || null,
          jangadaCapacidade: c.jangada?.capacity ?? null,
          sourceYear: c.sourceYear,
          navioNome: info?.navioNome ?? c.shipName ?? null,
          clienteNome: info?.clienteNome ?? c.shipOwner ?? null,
          clienteEmail: info?.clienteEmail ?? null,
          clienteTelefone: info?.clienteTelefone ?? null,
          status: info?.navioNome ?? c.shipName ?? null,
        };
      });

    const alertasEpirb = epirbs
      .filter((e) => isWithinDays(e.dataProxInspecao, 30) || isWithinDays(e.dataValidadeBateria, 30))
      .map((e) => {
        const isBatteryExpiring = isWithinDays(e.dataValidadeBateria, 30);
        const info = e.shipId ? shipInfoMap.get(e.shipId) : undefined;
        return {
          tipo: "epirb" as const,
          id: e.id,
          referencia: `EPIRB ${[e.marca, e.modelo].filter(Boolean).join(" ")} (${e.serial})`,
          data: isBatteryExpiring ? e.dataValidadeBateria : e.dataProxInspecao,
          jangadaSerial: e.serial,
          navioNome: info?.navioNome ?? null,
          clienteNome: info?.clienteNome ?? e.ownerName ?? null,
          clienteEmail: info?.clienteEmail ?? null,
          clienteTelefone: info?.clienteTelefone ?? e.ownerPhone ?? null,
          status: isBatteryExpiring ? "Bateria a expirar" : "Inspeção a expirar",
        };
      });

    const alertasExtintor = extintores
      .filter((x) => isWithinDays(x.dataProxRecarga, 30) || isWithinDays(x.dataProxTesteHidraulico, 30))
      .map((x) => {
        const recarga = isWithinDays(x.dataProxRecarga, 30);
        const teste = isWithinDays(x.dataProxTesteHidraulico, 30);
        const recargaDate = parseDateFlexible(x.dataProxRecarga)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const testeDate = parseDateFlexible(x.dataProxTesteHidraulico)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const isRecarga = recarga && (!teste || recargaDate <= testeDate);
        const shipName = x.shipId ? shipNameMap.get(x.shipId) : null;
        const info = x.shipId ? shipInfoMap.get(x.shipId) : undefined;
        const label = isRecarga ? "Recarga" : "Teste hidráulico";
        return {
          tipo: "extintor" as const,
          id: x.id,
          referencia: `Extintor ${[x.marca, x.modelo].filter(Boolean).join(" ")} (${x.serial || `#${x.id}`})`,
          data: isRecarga ? x.dataProxRecarga : x.dataProxTesteHidraulico,
          extintorId: x.id,
          jangadaSerial: x.serial || null,
          navioNome: info?.navioNome ?? null,
          clienteNome: info?.clienteNome ?? null,
          clienteEmail: info?.clienteEmail ?? null,
          clienteTelefone: info?.clienteTelefone ?? null,
          status: shipName ? `${shipName} · ${label}` : `${label} · sem navio`,
          tipoAgente: x.tipoAgente || null,
        };
      });

    const alertasFato = fatos
      .filter((f) => isWithinDays(f.dataProxInspecao, 30))
      .map((f) => {
        const shipName = f.shipId ? shipNameMap.get(f.shipId) : null;
        const info = f.shipId ? shipInfoMap.get(f.shipId) : undefined;
        return {
          tipo: "fato" as const,
          id: f.id,
          referencia: `Fato de imersão ${[f.marca, f.modelo].filter(Boolean).join(" ")} (${f.serial || `#${f.id}`})`,
          data: f.dataProxInspecao,
          jangadaSerial: f.serial || null,
          navioNome: info?.navioNome ?? null,
          clienteNome: info?.clienteNome ?? null,
          clienteEmail: info?.clienteEmail ?? null,
          clienteTelefone: info?.clienteTelefone ?? null,
          status: shipName ? `${shipName} · Inspeção a expirar` : "Inspeção a expirar · sem navio",
        };
      });

    const sortedExpirations = [...alertasInspecao, ...alertasCertificado, ...alertasEpirb, ...alertasExtintor, ...alertasFato].sort((a, b) => {
      const da = parseDateFlexible(a.data)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const db = parseDateFlexible(b.data)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });

    const alertas = [...alertasAssistencia, ...sortedExpirations];

    return NextResponse.json({
      total: alertas.length,
      inspecoes: alertasInspecao.length,
      certificados: alertasCertificado.length,
      pedidosAssistencia: alertasAssistencia.length,
      epirbs: alertasEpirb.length,
      extintores: alertasExtintor.length,
      fatos: alertasFato.length,
      alertas,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error)?.message || "Erro ao gerar alertas" }, { status: 500 });
  }
}
