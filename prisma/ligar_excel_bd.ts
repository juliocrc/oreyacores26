import { PrismaClient } from '@prisma/client';
import * as xlsx from 'xlsx';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  // === 1. Ler o Excel ===
  const filePath = path.join(process.cwd(), 'Lista Produtos orey 2026.xlsx');
  const wb = xlsx.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = xlsx.utils.sheet_to_json(ws, { header: 1 });

  const excelMap = new Map<string, {
    descricao: string;
    precoCompra: number | null;
    codigoFabricante: string | null;
    precoVenda: number | null;
  }>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const referencia = String(row[0] || '').trim();
    if (!referencia) continue;

    excelMap.set(referencia, {
      descricao: String(row[1] || '').trim(),
      precoCompra: row[2] != null ? Number(row[2]) : null,
      codigoFabricante: row[3] != null ? String(row[3]).trim() : null,
      precoVenda: row[4] != null ? Number(row[4]) : null,
    });
  }

  console.log(`Excel: ${excelMap.size} produtos únicos`);

  // === 2. Ler stock global da BD ===
  const bdProducts = await prisma.stock.findMany({
    where: { serviceStationId: null, lote: '' },
    select: { id: true, referencia: true, descricao: true, precoCompra: true, precoVenda: true, codigoFabricante: true, categoria: true },
  });

  console.log(`BD: ${bdProducts.length} produtos`);

  // === 3. Fazer a ligação ===
  let ligados = 0;
  let atualizados = 0;
  let semLigacao = 0;
  const atualizacoes: Array<{ ref: string; campo: string; de: any; para: any }> = [];

  for (const produto of bdProducts) {
    const excel = excelMap.get(produto.referencia);
    if (!excel) {
      semLigacao++;
      continue;
    }

    ligados++;
    const updateData: Record<string, unknown> = {};
    let mudou = false;

    // Preço de compra
    if (excel.precoCompra != null && !Number.isNaN(excel.precoCompra)) {
      if (produto.precoCompra !== excel.precoCompra) {
        atualizacoes.push({ ref: produto.referencia, campo: 'precoCompra', de: produto.precoCompra, para: excel.precoCompra });
        updateData.precoCompra = excel.precoCompra;
        mudou = true;
      }
    }

    // Preço de venda
    if (excel.precoVenda != null && !Number.isNaN(excel.precoVenda)) {
      if (produto.precoVenda !== excel.precoVenda) {
        atualizacoes.push({ ref: produto.referencia, campo: 'precoVenda', de: produto.precoVenda, para: excel.precoVenda });
        updateData.precoVenda = excel.precoVenda;
        mudou = true;
      }
    }

    // Código do fabricante
    if (excel.codigoFabricante && produto.codigoFabricante !== excel.codigoFabricante) {
      atualizacoes.push({ ref: produto.referencia, campo: 'codigoFabricante', de: produto.codigoFabricante, para: excel.codigoFabricante });
      updateData.codigoFabricante = excel.codigoFabricante;
      mudou = true;
    }

    // Descrição (se diferente e não vazia)
    if (excel.descricao && produto.descricao !== excel.descricao) {
      atualizacoes.push({ ref: produto.referencia, campo: 'descricao', de: produto.descricao, para: excel.descricao });
      updateData.descricao = excel.descricao;
      mudou = true;
    }

    if (mudou) {
      await prisma.stock.update({
        where: { id: produto.id },
        data: updateData,
      });
      atualizados++;
    }
  }

  console.log(`\n=== Resultado da ligação ===`);
  console.log(`Produtos ligados (existem nas duas listas): ${ligados}`);
  console.log(`Produtos atualizados com dados do Excel: ${atualizados}`);
  console.log(`Produtos BD sem correspondência no Excel: ${semLigacao}`);

  if (atualizacoes.length > 0) {
    console.log(`\n=== Amostra de atualizações (primeiras 30) ===`);
    for (const u of atualizacoes.slice(0, 30)) {
      console.log(`  ${u.ref} | ${u.campo}: ${u.de} → ${u.para}`);
    }
    if (atualizacoes.length > 30) {
      console.log(`  ... e mais ${atualizacoes.length - 30} atualizações`);
    }
  }

  // Estatísticas finais
  const total = await prisma.stock.count({ where: { serviceStationId: null } });
  const comPrecoCompra = await prisma.stock.count({ where: { serviceStationId: null, precoCompra: { not: null } } });
  const comPrecoVenda = await prisma.stock.count({ where: { serviceStationId: null, precoVenda: { gt: 0 } } });
  const comCodigoFab = await prisma.stock.count({ where: { serviceStationId: null, codigoFabricante: { not: null, not: '' } } });

  console.log(`\n=== Estatísticas finais do stock global ===`);
  console.log(`Total produtos: ${total}`);
  console.log(`Com preço de compra: ${comPrecoCompra}`);
  console.log(`Com preço de venda > 0: ${comPrecoVenda}`);
  console.log(`Com código fabricante: ${comCodigoFab}`);
  console.log(`Sem nenhum preço/código: ${total - Math.max(comPrecoCompra, comPrecoVenda, comCodigoFab)}`);

  await prisma.$disconnect();
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
