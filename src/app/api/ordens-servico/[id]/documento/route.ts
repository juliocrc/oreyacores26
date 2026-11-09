import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { parseOrdemServicoMeta } from "@/lib/ordens-servico";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";
import { roundQuoteMoney } from "@/lib/ordem-quote-input";

function parseIdFromRequest(req: NextRequest) {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const rawId = segments[segments.length - 2];
  const id = Number(rawId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function formatIsoDate(value?: Date | null) {
  return value ? value.toISOString() : null;
}

export async function GET(req: NextRequest) {
  try {
    const id = parseIdFromRequest(req);
    if (!id) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

    const ordem = await prisma.ordemServico.findUnique({
      where: { id },
      include: {
        jangada: {
          select: {
            id: true,
            serial: true,
            brand: true,
            model: true,
            owner: true,
            shipId: true,
            shipNameManual: true,
            numeroObra: true,
          },
        },
        ordemJangadas: {
          orderBy: [{ addedAt: "asc" }, { id: "asc" }],
          include: {
            jangada: {
              select: {
                id: true,
                serial: true,
                brand: true,
                model: true,
                owner: true,
                shipId: true,
                shipNameManual: true,
                numeroObra: true,
              },
            },
          },
        },
        cliente: {
          select: {
            id: true,
            nome: true,
            nif: true,
            numeroCliente: true,
            email: true,
            telefone: true,
          },
        },
      },
    });

    if (!ordem) {
      return NextResponse.json({ error: "Ordem de serviço não encontrada." }, { status: 404 });
    }

    const meta = parseOrdemServicoMeta(ordem.metadados);
    const jangadas = (() => {
      const linked = Array.isArray(ordem.ordemJangadas)
        ? ordem.ordemJangadas.map((link) => link.jangada).filter(Boolean)
        : [];
      const combined = [...linked, ordem.jangada].filter((j): j is NonNullable<typeof j> => Boolean(j));
      const seen = new Set<number>();
      return combined.filter((jangada) => {
        const id = Number(jangada?.id);
        if (!Number.isFinite(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    })();
    const primaryJangada = jangadas[0] || ordem.jangada;
    const materials = Array.isArray(meta.materials) ? meta.materials : [];
    const linhasMeta = Array.isArray(meta.linhas) ? meta.linhas : [];

    const linhasDocumento = [
      ...linhasMeta.map((line, index) => {
        const aggregateOnly = line.quantidade == null && line.unitPrice == null && line.precoUnitario == null;
        const quantidade = aggregateOnly ? 1 : Math.max(0, Number(line.quantidade ?? 0));
        const precoUnitario = Math.max(0, Number(aggregateOnly ? line.total ?? 0 : line.unitPrice ?? line.precoUnitario ?? 0));
        const descontoPercentual = Number(line.descontoPercentual ?? 0);
        return {
          id: String(line.referencia || `LINHA-${index + 1}`),
          tipo: "servico",
          referencia: String(line.referencia || "").trim() || null,
          descricao: String(line.descricao || "").trim() || "Serviço",
          quantidade,
          precoUnitario,
          descontoPercentual,
          total: Math.max(0, Number(line.total ?? roundQuoteMoney(quantidade * precoUnitario * (1 - descontoPercentual / 100)))),
        };
      }),
      ...materials.map((line, index) => {
        const quantidade = Math.max(0, Number(line.quantidadeUsada ?? line.quantidadePrevista ?? 0));
        const precoUnitario = Math.max(0, Number(line.precoUnitario || 0));
        return {
          id: String(line.id || `MATERIAL-${index + 1}`),
          tipo: "material",
          referencia: String(line.referencia || "").trim() || null,
          descricao: String(line.descricao || "").trim() || "Material",
          quantidade,
          precoUnitario,
          total: quantidade * precoUnitario,
          reservado: Boolean(line.reservado),
          consumido: Boolean(line.consumido),
        };
      }),
    ];

    const subtotalLinhas = linhasDocumento.reduce((acc, line) => acc + Math.max(0, Number(line.total || 0)), 0);
    const totaisMeta = meta.totais && typeof meta.totais === "object" ? meta.totais : {};
    const subtotal = Number(totaisMeta.subtotal ?? subtotalLinhas);
    const iva = Number(totaisMeta.iva ?? 0);
    const totalComIva = Number(totaisMeta.totalComIva ?? subtotal + iva);

    const payload = {
      documento: {
        tipo: "resumo_ot",
        numero: ordem.numeroOrdem,
        grupo: meta.grupoNumeroOrdem || null,
        emitidoEm: new Date().toISOString(),
      },
      ordemServico: {
        id: ordem.id,
        numeroOrdem: ordem.numeroOrdem,
        estado: ordem.status,
        tipo: ordem.tipo,
        prioridade: ordem.prioridade,
        tecnicoResponsavel: ordem.tecnicoResponsavel,
        dataAbertura: formatIsoDate(ordem.dataAbertura),
        dataConclusao: formatIsoDate(ordem.dataConclusao),
        durationMinutes: ordem.durationMinutes,
      },
      cliente: ordem.cliente
        ? {
            id: ordem.cliente.id,
            nome: ordem.cliente.nome,
            nif: ordem.cliente.nif,
            numeroCliente: ordem.cliente.numeroCliente,
            email: ordem.cliente.email,
            telefone: ordem.cliente.telefone,
          }
        : null,
      ativo: primaryJangada
        ? {
            id: primaryJangada.id,
            serial: primaryJangada.serial,
            marca: primaryJangada.brand,
            modelo: primaryJangada.model,
            navio: primaryJangada.shipNameManual || primaryJangada.owner || null,
            numeroObra: primaryJangada.numeroObra,
          }
        : null,
      ativos: jangadas.map((jangada) => ({
        id: jangada.id,
        serial: jangada.serial,
        marca: jangada.brand,
        modelo: jangada.model,
        navio: jangada.shipNameManual || jangada.owner || null,
        numeroObra: jangada.numeroObra,
      })),
      linhas: linhasDocumento,
      totais: {
        subtotal,
        iva,
        totalComIva,
      },
      isencaoIvaDeclarada: Boolean(meta.observacao && String(meta.observacao).toLowerCase().includes("isenção")),
      observacoes: meta.observacao || null,
    };

    return NextResponse.json(payload);
  } catch (error) {
    return buildDatabaseErrorResponse(error, "Erro ao gerar documento da OT.");
  }
}
