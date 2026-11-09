import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  appendOrdemServicoLog,
  parseOrdemServicoMeta,
  toOrdemServicoMetaJson,
  type OrdemServicoMeta,
  resolveLotStock,
} from "@/lib/ordens-servico";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";

type MetaMaterial = NonNullable<OrdemServicoMeta["materials"]>[number];
type MaterialItem = MetaMaterial & {
  inspecaoArtigoId?: number;
  origin?: string;
};

function parseIdFromRequest(req: NextRequest) {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const rawId = segments[segments.length - 2];
  const id = Number(rawId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function readMaterials(meta: ReturnType<typeof parseOrdemServicoMeta>) {
  return Array.isArray(meta.materials) ? meta.materials : [];
}

function computeTotals(
  materials: Array<{
    quantidadeUsada?: number;
    precoUnitario?: number;
    quantidadePrevista?: number;
  }>,
) {
  const totalPrevisto = materials.reduce(
    (acc, item) => acc + Math.max(0, Number(item.quantidadePrevista || 0)),
    0,
  );
  const totalUsado = materials.reduce(
    (acc, item) => acc + Math.max(0, Number(item.quantidadeUsada || 0)),
    0,
  );
  const totalValor = materials.reduce(
    (acc, item) =>
      acc +
      Math.max(
        0,
        Number(item.quantidadeUsada ?? item.quantidadePrevista ?? 0),
      ) *
        Math.max(0, Number(item.precoUnitario || 0)),
    0,
  );
  return { totalPrevisto, totalUsado, totalValor };
}

function readConsumeOperationKeys(
  meta: ReturnType<typeof parseOrdemServicoMeta>,
) {
  const raw = (meta as Record<string, unknown>)?.materialConsumeOperationKeys;
  if (!Array.isArray(raw)) return [] as string[];
  return raw.map((value) => String(value || "").trim()).filter(Boolean);
}

function withConsumeOperationKey(
  meta: ReturnType<typeof parseOrdemServicoMeta>,
  key?: string,
) {
  const normalized = String(key || "").trim();
  if (!normalized) return meta;
  const existing = readConsumeOperationKeys(meta);
  const nextKeys = [
    ...existing.filter((value) => value !== normalized),
    normalized,
  ].slice(-300);
  return {
    ...meta,
    materialConsumeOperationKeys: nextKeys,
  };
}

export async function GET(req: NextRequest) {
  try {
    const id = parseIdFromRequest(req);
    if (!id)
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });

    const order = await prisma.ordemServico.findUnique({
      where: { id },
      select: { metadados: true },
    });
    if (!order)
      return NextResponse.json(
        { error: "Ordem de serviço não encontrada." },
        { status: 404 },
      );

    const meta = parseOrdemServicoMeta(order.metadados);
    const materials = readMaterials(meta);
    return NextResponse.json({ materials, totals: computeTotals(materials) });
  } catch (error) {
    return buildDatabaseErrorResponse(error, "Erro ao obter materiais da OT.");
  }
}

export async function POST(req: NextRequest) {
  try {
    const id = parseIdFromRequest(req);
    if (!id)
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const action = String(body.action || "add")
      .trim()
      .toLowerCase();

    const order = await prisma.ordemServico.findUnique({
      where: { id },
      select: { numeroOrdem: true, metadados: true, serviceStationId: true },
    });
    if (!order)
      return NextResponse.json(
        { error: "Ordem de serviço não encontrada." },
        { status: 404 },
      );

    const meta = parseOrdemServicoMeta(order.metadados);
    const materials = readMaterials(meta);
    const lineId = String(body.materialId || "").trim();

    if (action === "add" || action === "update") {
      const previous = materials.find(item => item.id === lineId);
      if (previous?.consumido || previous?.reservado) return NextResponse.json({ error: "Material reservado/consumido nao pode ser alterado." }, { status: 400 });
      const stock = await resolveLotStock(prisma, {
        stockId: body.stockId ?? previous?.stockId,
        referencia: String(body.referencia || previous?.referencia || "") || null,
      }, order.serviceStationId);

      const referencia = String(
        body.referencia || stock?.referencia || "",
      ).trim();
      const descricao = String(body.descricao || stock?.descricao || "").trim();
      if (!referencia || !descricao) {
        return NextResponse.json(
          { error: "Informe um artigo válido para a OT." },
          { status: 400 },
        );
      }

      const quantidadePrevista = Math.max(
        1,
        Number(body.quantidadePrevista || 1),
      );
      const quantidadeUsada = Math.max(
        0,
        Number(body.quantidadeUsada ?? quantidadePrevista),
      );
      const precoUnitario = Math.max(
        0,
        Number(body.precoUnitario ?? stock?.precoVenda ?? 0),
      );
      const disponibilidade = Number(
        stock?.quantidade ?? body.disponibilidade ?? 0,
      );
      const nextId =
        lineId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const nextLine = {
        id: nextId,
        stockId: stock?.id,
        lote: previous?.stockId === stock?.id ? previous?.lote ?? stock?.lote : stock?.lote,
        referencia,
        descricao,
        quantidadePrevista,
        quantidadeUsada,
        precoUnitario,
        disponibilidade,
        reservado: false,
        consumido: false,
      };

      const nextMaterials =
        action === "add"
          ? [...materials.filter((item) => item.id !== nextId), nextLine]
          : materials.map((item) =>
              item.id === nextId ? { ...item, ...nextLine } : item,
            );

      const nextMeta = appendOrdemServicoLog(
        { ...meta, materials: nextMaterials },
        {
          type: action === "add" ? "MATERIAL_ADD" : "MATERIAL_UPDATE",
          message: `${action === "add" ? "Material adicionado" : "Material atualizado"}: ${referencia}.`,
          user: "operador",
        },
      );

      await prisma.ordemServico.update({
        where: { id },
        data: { metadados: toOrdemServicoMetaJson(nextMeta) },
      });
      return NextResponse.json({
        materials: nextMaterials,
        totals: computeTotals(nextMaterials),
      });
    }

    if (action === "reserve") {
      if (!lineId)
        return NextResponse.json(
          { error: "Linha de material inválida." },
          { status: 400 },
        );
      const nextMaterials = await prisma.$transaction(async tx => {
        const fresh = await tx.ordemServico.findUnique({ where: { id }, select: { metadados: true, serviceStationId: true } });
        if (!fresh) throw new Error("Ordem nao encontrada.");
        const freshMeta = parseOrdemServicoMeta(fresh.metadados);
        const lines = readMaterials(freshMeta);
        const target = lines.find(item => item.id === lineId);
        if (!target) throw new Error("Material nao encontrado.");
        if (target.reservado || target.consumido) return lines;
        const stock = await resolveLotStock(tx, target, fresh.serviceStationId);
        if (!stock) throw new Error("Material sem stockId concreto.");
        const qty = Number(target.quantidadePrevista ?? 1);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantidade invalida.");
        const updated = await tx.stock.updateMany({ where: { id: stock.id, quantidadeReservada: stock.quantidadeReservada, quantidade: { gte: stock.quantidadeReservada + qty } }, data: { quantidadeReservada: { increment: qty } } });
        if (updated.count !== 1) throw new Error("Stock insuficiente para reservar o lote.");
        await tx.movimentacaoStock.create({ data: { stockId: stock.id, tipo: "reserva", quantidade: qty, quantidadeAntes: stock.quantidadeReservada, quantidadeDepois: stock.quantidadeReservada + qty, motivo: `Reserva OT ${order.numeroOrdem}`, usuario: "operador" } });
        const next = lines.map(item => item.id === lineId ? { ...item, stockId: stock.id, lote: item.lote ?? stock.lote, reservado: true, quantidadeReservada: qty } : item);
        await tx.ordemServico.update({ where: { id }, data: { metadados: toOrdemServicoMetaJson(appendOrdemServicoLog({ ...freshMeta, materials: next }, { type: "MATERIAL_RESERVE", message: `Material reservado: ${stock.referencia}.`, user: "operador" })) } });
        return next;
      }, { isolationLevel: "Serializable" });
      return NextResponse.json({
        materials: nextMaterials,
        totals: computeTotals(nextMaterials),
      });
    }

    if (action === "consume" || action === "consume_virtual") {
      if (!lineId)
        return NextResponse.json(
          { error: "Linha de material inválida." },
          { status: 400 },
        );
      const target = materials.find((item) => item.id === lineId);
      if (!target)
        return NextResponse.json(
          { error: "Material não encontrado na OT." },
          { status: 404 },
        );
      if (!target.stockId)
        return NextResponse.json(
          { error: "Material sem ligação ao stock." },
          { status: 400 },
        );

      const quantityToConsume = Math.max(
        1,
        Number(
          body.quantidadeUsada ??
            target.quantidadeUsada ??
            target.quantidadePrevista ??
            1,
        ),
      );
      if (!Number.isFinite(quantityToConsume)) return NextResponse.json({ error: "Quantidade invalida." }, { status: 400 });
      if (target.consumido && Number(target.quantidadeUsada || 0) !== quantityToConsume) return NextResponse.json({ error: "Material ja consumido; reverta antes de alterar a quantidade." }, { status: 400 });
      const operationKey = String(
        body.operationKey || body.idempotencyKey || "",
      ).trim();

      if (
        target.consumido &&
        Number(target.quantidadeUsada || 0) === quantityToConsume
      ) {
        return NextResponse.json({
          materials,
          totals: computeTotals(materials),
          idempotent: true,
        });
      }

      const result = await prisma.$transaction(async (tx) => {
        const freshOrder = await tx.ordemServico.findUnique({
          where: { id },
          select: { numeroOrdem: true, metadados: true, serviceStationId: true },
        });
        if (!freshOrder) throw new Error("Ordem de serviço não encontrada.");

        const freshMeta = parseOrdemServicoMeta(freshOrder.metadados);
        const freshMaterials = readMaterials(freshMeta);
        const freshTarget = freshMaterials.find((item) => item.id === lineId);
        if (!freshTarget) throw new Error("Material não encontrado na OT.");
        if (!freshTarget.stockId)
          throw new Error("Material sem ligação ao stock.");

        const consumedOperationKeys = readConsumeOperationKeys(freshMeta);
        if (operationKey && consumedOperationKeys.includes(operationKey)) {
          return {
            materials: freshMaterials,
            idempotent: true,
          };
        }

        if (
          freshTarget.consumido &&
          Number(freshTarget.quantidadeUsada || 0) === quantityToConsume
        ) {
          return {
            materials: freshMaterials,
            idempotent: true,
          };
        }

        if (freshTarget.consumido) throw new Error("Material ja consumido.");
        const stock = await resolveLotStock(tx, freshTarget, freshOrder.serviceStationId);
        if (!stock) throw new Error("Artigo de stock não encontrado.");
        const isVirtual = action === "consume_virtual";
        let quantidadeDepois = stock.quantidade;

        if (!isVirtual) {
          const ownReservation = Number(freshTarget.quantidadeReservada ?? 0);
          const release = Math.min(stock.quantidadeReservada, ownReservation);
          if (stock.quantidade - stock.quantidadeReservada + release < quantityToConsume)
            throw new Error(
              "Stock insuficiente para consumir o material nesta OT.",
            );
          quantidadeDepois = stock.quantidade - quantityToConsume;
          const updated = await tx.stock.updateMany({
            where: { id: stock.id, quantidade: stock.quantidade, quantidadeReservada: stock.quantidadeReservada },
            data: { quantidade: quantidadeDepois, quantidadeReservada: { decrement: release } },
          });
          if (updated.count !== 1) throw new Error("Stock insuficiente: lote alterado; tente novamente.");
          if (release > 0) await tx.movimentacaoStock.create({ data: { stockId: stock.id, tipo: "libertar_reserva", quantidade: release, quantidadeAntes: stock.quantidadeReservada, quantidadeDepois: stock.quantidadeReservada - release, motivo: `Consumo reserva OT ${freshOrder.numeroOrdem}`, usuario: "operador" } });
          await tx.movimentacaoStock.create({
            data: {
              stockId: freshTarget.stockId,
              tipo: "saida",
              quantidade: quantityToConsume,
              quantidadeAntes: stock.quantidade,
              quantidadeDepois,
              motivo: `Consumo OT ${freshOrder.numeroOrdem}`,
              usuario: "operador",
            },
          });
        }

        const nextMaterials = freshMaterials.map((item) =>
          item.id === lineId
            ? {
                ...item,
                quantidadeUsada: quantityToConsume,
                disponibilidade: quantidadeDepois,
                reservado: false,
                quantidadeReservada: action === "consume_virtual" ? item.quantidadeReservada : 0,
                lote: item.lote ?? stock.lote,
                consumido: true,
              }
            : item,
        );

        const nextMeta = appendOrdemServicoLog(
          withConsumeOperationKey(
            { ...freshMeta, materials: nextMaterials },
            operationKey,
          ),
          {
            type: "MATERIAL_CONSUME",
            message: `Material consumido: ${freshTarget.referencia || lineId} x${quantityToConsume}.`,
            user: "operador",
          },
        );

        await tx.ordemServico.update({
          where: { id },
          data: { metadados: toOrdemServicoMetaJson(nextMeta) },
        });
        return {
          materials: nextMaterials,
          idempotent: false,
        };
      }, { isolationLevel: "Serializable" });

      return NextResponse.json({
        materials: result.materials,
        totals: computeTotals(result.materials),
        idempotent: result.idempotent,
      });
    }

    if (action === "sync_inspection") {
      const fullOrder = await prisma.ordemServico.findUnique({
        where: { id },
        include: { inspecao: { include: { artigos: true } } },
      });
      if (!fullOrder || !fullOrder.inspecao) {
        return NextResponse.json(
          { error: "Nenhuma inspeção associada a esta OT." },
          { status: 400 },
        );
      }

      // We only care about articles that have a stock reference or name
      const inspectionArtigos = fullOrder.inspecao.artigos;
      if (inspectionArtigos.length === 0) {
        return NextResponse.json({
          materials,
          totals: computeTotals(materials),
          message: "Nenhum artigo encontrado na inspeção.",
        });
      }

      // Check which articles from the inspection are already in the materials list (to avoid duplicates if synced multiple times)
      // Since ArtigoJangada has an id, we can store it in the materials metadata to track it.
      const newMaterials: MaterialItem[] = [...materials];
      let addedCount = 0;

      for (const artigo of inspectionArtigos) {
        const isAlreadyAdded = newMaterials.some(
          (m: MaterialItem) => m.inspecaoArtigoId === artigo.id,
        );
        if (!isAlreadyAdded) {
          // Find stock to get price (if possible by reference)
          const stockInfo = await resolveLotStock(prisma, artigo, fullOrder.serviceStationId, true);
          const snapshot = fullOrder.inspecao.checklistSnapshot as { _articleExpiry?: { replacements?: Array<{ stockId?: number; lote?: string | null }> } } | null;
          const savedLot = snapshot?._articleExpiry?.replacements?.find(item => item.stockId === artigo.stockId);

          const nextId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          newMaterials.push({
            id: nextId,
            inspecaoArtigoId: artigo.id,
            stockId: artigo.stockId ?? stockInfo?.id ?? undefined,
            lote: savedLot?.lote ?? null,
            referencia: artigo.referencia || "Desconhecida",
            descricao: artigo.name || "Artigo de Inspeção",
            quantidadePrevista: artigo.quantidade,
            quantidadeUsada: artigo.quantidade,
            precoUnitario: stockInfo?.precoVenda ?? 0,
            disponibilidade: stockInfo?.quantidade ?? 0,
            reservado: true,
            consumido: true,
            origin: "inspection",
          });
          addedCount++;
        }
      }

      if (addedCount > 0) {
        const nextMeta = appendOrdemServicoLog(
          { ...meta, materials: newMaterials },
          {
            type: "MATERIAL_SYNC",
            message: `Sincronizados ${addedCount} artigos da inspeção ${fullOrder.inspecao.certificadoNumero || fullOrder.inspecao.id}.`,
            user: "operador",
          },
        );
        await prisma.ordemServico.update({
          where: { id },
          data: { metadados: toOrdemServicoMetaJson(nextMeta) },
        });
      }

      return NextResponse.json({
        materials: newMaterials,
        totals: computeTotals(newMaterials),
        message: `Sincronizados ${addedCount} artigos.`,
      });
    }

    return NextResponse.json(
      { error: "Ação de materiais inválida." },
      { status: 400 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro ao atualizar materiais da OT.";
    if (
      message.includes("insuficiente") ||
      message.includes("não encontrado") || message.includes("stockId") || message.includes("lote") || message.includes("invalida")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return buildDatabaseErrorResponse(
      error,
      "Erro ao atualizar materiais da OT.",
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = parseIdFromRequest(req);
    if (!id)
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const lineId = String(body.materialId || "").trim();
    if (!lineId)
      return NextResponse.json(
        { error: "Linha de material inválida." },
        { status: 400 },
      );

    const order = await prisma.ordemServico.findUnique({
      where: { id },
      select: { metadados: true },
    });
    if (!order)
      return NextResponse.json(
        { error: "Ordem de serviço não encontrada." },
        { status: 404 },
      );

    const meta = parseOrdemServicoMeta(order.metadados);
    const materials = readMaterials(meta);
    const nextMaterials = await prisma.$transaction(async tx => {
      const fresh = await tx.ordemServico.findUnique({ where: { id }, select: { metadados: true, serviceStationId: true, numeroOrdem: true } });
      if (!fresh) throw new Error("Ordem nao encontrada.");
      const freshMeta = parseOrdemServicoMeta(fresh.metadados);
      const lines = readMaterials(freshMeta);
      const target = lines.find(item => item.id === lineId);
      if (target?.consumido) throw new Error("Material consumido: reverta o consumo antes de remover.");
      if (target?.reservado) {
        const stock = await resolveLotStock(tx, target, fresh.serviceStationId);
        if (!stock) throw new Error("Material sem stockId concreto.");
        const qty = Math.min(stock.quantidadeReservada, Number(target.quantidadeReservada ?? 0));
        const updated = await tx.stock.updateMany({ where: { id: stock.id, quantidadeReservada: stock.quantidadeReservada }, data: { quantidadeReservada: { decrement: qty } } });
        if (updated.count !== 1) throw new Error("Lote alterado; tente novamente.");
        await tx.movimentacaoStock.create({ data: { stockId: stock.id, tipo: "libertar_reserva", quantidade: qty, quantidadeAntes: stock.quantidadeReservada, quantidadeDepois: stock.quantidadeReservada - qty, motivo: `Remover reserva OT ${fresh.numeroOrdem}`, usuario: "operador" } });
      }
      const next = lines.filter(item => item.id !== lineId);
      await tx.ordemServico.update({ where: { id }, data: { metadados: toOrdemServicoMetaJson(appendOrdemServicoLog({ ...freshMeta, materials: next }, { type: "MATERIAL_REMOVE", message: `Material removido: ${target?.referencia || lineId}.`, user: "operador" })) } });
      return next;
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({
      materials: nextMaterials,
      totals: computeTotals(nextMaterials),
    });
  } catch (error) {
    return buildDatabaseErrorResponse(error, "Erro ao remover material da OT.");
  }
}
