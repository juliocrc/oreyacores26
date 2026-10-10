import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const body = await req.json().catch(() => null);
    const rawText = String(body?.text || "").trim();
    const mode = String(body?.mode || "increment").toLowerCase(); // "increment" or "absolute"

    if (!rawText) {
      return NextResponse.json({ error: "Nenhum dado fornecido para importação." }, { status: 400 });
    }

    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const results: Array<{ referenciaOrBarcode: string; quantidade: number; status: string; stockId?: number; descricao?: string }> = [];

    for (const line of lines) {
      const parts = line.split(/[;,\t]+/).map(p => p.trim().replace(/^["']|["']$/g, ""));
      if (parts.length < 2) continue;

      const code = parts[0];
      const qty = Number(parts[1].replace(",", ".")) || 0;
      if (!code) continue;

      const stockItem = await prisma.stock.findFirst({
        where: {
          OR: [
            { referencia: { equals: code, mode: "insensitive" } },
            { codigoBarras: { equals: code, mode: "insensitive" } },
          ],
        },
      });

      if (!stockItem) {
        results.push({ referenciaOrBarcode: code, quantidade: qty, status: "Não encontrado no stock" });
        continue;
      }

      const antes = stockItem.quantidade;
      const newQty = mode === "absolute" ? qty : antes + qty;
      const finalQty = Math.max(0, newQty);

      await prisma.stock.update({
        where: { id: stockItem.id },
        data: { quantidade: finalQty },
      });

      await prisma.movimentacaoStock.create({
        data: {
          stockId: stockItem.id,
          tipo: mode === "absolute" ? "INVENTARIO_AJUSTE" : "ENTRADA_LOTE",
          quantidade: qty,
          quantidadeAntes: antes,
          quantidadeDepois: finalQty,
          motivo: `Importação em lote de leitor portátil (Modo: ${mode})`,
        },
      }).catch(() => {});

      results.push({
        referenciaOrBarcode: code,
        quantidade: qty,
        status: "Atualizado com sucesso",
        stockId: stockItem.id,
        descricao: stockItem.descricao,
      });
    }

    return NextResponse.json({ success: true, processed: results.length, results });
  } catch (error) {
    console.error("Erro na importação em lote de stock:", error);
    return NextResponse.json({ error: "Erro ao processar importação em lote." }, { status: 500 });
  }
}
