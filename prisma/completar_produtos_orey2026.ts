import { PrismaClient } from '@prisma/client';
import * as xlsx from 'xlsx';
import path from 'path';

const prisma = new PrismaClient();

function normalizeCategory(descricao: string): string {
  const d = descricao.toUpperCase();
  if (d.includes('CILINDRO') || d.includes('CO2') || d.includes('GAS')) return 'CILINDROS';
  if (d.includes('RAÇÃO') || d.includes('RACAO') || d.includes('ÁGUA') || d.includes('AGUA') || d.includes('COMIDA')) return 'CONSUMÍVEIS';
  if (d.includes('FARMACIA') || d.includes('FARMÁCIA') || d.includes('COMPRIMIDO') || d.includes('ENJOO') || d.includes('SACO DE VOMITO')) return 'PRIMEIROS SOCORROS';
  if (d.includes('FOGUETE') || d.includes('FACHO') || d.includes('PIROTEC') || d.includes('SINAL DE FUMO') || d.includes('POTES DE FUMO')) return 'PIROTÉCNICOS';
  if (d.includes('LUZ') || d.includes('BATERIA') || d.includes('ILUMINA') || d.includes('LANTERNA')) return 'ILUMINAÇÃO';
  if (d.includes('CABEÇA') || d.includes('CABECA') || d.includes('OP HEAD') || d.includes('DISPARO') || d.includes('HRU') || d.includes('VÁLVULA') || d.includes('VALVULA') || d.includes('BOBBIN') || d.includes('REARM')) return 'CABEÇAS DE DISPARO';
  if (d.includes('CONTENTOR') || d.includes('CINTA') || d.includes('STRAP')) return 'CONTENTORES';
  if (d.includes('ESPUMA') || d.includes('FOAM') || d.includes('PATCH') || d.includes('ETIQUETA') || d.includes('LABEL') || d.includes('FITA') || d.includes('TAPE') || d.includes('COLA') || d.includes('GLUE') || d.includes('SELO')) return 'ACESSÓRIOS';
  if (d.includes('MANGA') || d.includes('MANGUEIRA') || d.includes('TUBO') || d.includes('BAIONETA') || d.includes('HIGH PRESSURE')) return 'TUBOS DE ALTA PRESSÃO';
  if (d.includes('APITO') || d.includes('HELIOGRAFO') || d.includes('SINAL')) return 'SINALIZAÇÃO';
  return 'DIVERSOS';
}

async function main() {
  const filePath = path.join(process.cwd(), 'Lista Produtos orey 2026.xlsx');
  const wb = xlsx.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = xlsx.utils.sheet_to_json(ws, { header: 1 });

  // Ler produtos existentes na BD
  const bdProducts = await prisma.stock.findMany({
    where: { serviceStationId: null, lote: '' },
    select: { referencia: true },
  });
  const bdRefs = new Set(bdProducts.map(p => p.referencia));

  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;
  const erros: string[] = [];

  // Processar em lotes de 500
  const batchSize = 500;
  let batch: any[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const referencia = String(row[0] || '').trim();
    const descricao = String(row[1] || '').trim();
    const precoCompra = row[2] != null ? Number(row[2]) : null;
    const codigoFabricante = row[3] != null ? String(row[3]).trim() : null;
    const precoVenda = row[4] != null ? Number(row[4]) : null;

    if (!referencia) {
      ignorados++;
      continue;
    }

    if (bdRefs.has(referencia)) {
      // Atualizar existente
      const updateData: Record<string, unknown> = {};
      if (precoCompra != null && !Number.isNaN(precoCompra)) updateData.precoCompra = precoCompra;
      if (precoVenda != null && !Number.isNaN(precoVenda)) updateData.precoVenda = precoVenda;
      if (codigoFabricante) updateData.codigoFabricante = codigoFabricante;
      if (descricao) updateData.descricao = descricao;
      updateData.categoria = normalizeCategory(descricao);

      batch.push({ tipo: 'update', referencia, data: updateData });
    } else {
      // Criar novo
      batch.push({
        tipo: 'create',
        data: {
          referencia,
          descricao: descricao || 'Item sem descrição',
          categoria: normalizeCategory(descricao),
          precoCompra: precoCompra != null && !Number.isNaN(precoCompra) ? precoCompra : 0,
          precoVenda: precoVenda != null && !Number.isNaN(precoVenda) ? precoVenda : 0,
          codigoFabricante: codigoFabricante || null,
          estadoArtigo: 'ATIVO',
          serviceStationId: null,
          lote: '',
          validade: null,
          quantidade: 0,
          quantidadeMinima: 0,
          associavelJangada: false,
          aplicavelMarcaJangada: null,
          aplicavelModeloJangada: null,
        },
      });
    }

    if (batch.length >= batchSize) {
      const { c, a, erros: batchErros } = await processBatch(batch);
      criados += c;
      atualizados += a;
      erros.push(...batchErros);
      batch = [];
    }
  }

  // Processar lote restante
  if (batch.length > 0) {
    const { c, a, erros: batchErros } = await processBatch(batch);
    criados += c;
    atualizados += a;
    erros.push(...batchErros);
  }

  console.log(`\n=== Resultado final ===`);
  console.log(`Criados: ${criados}`);
  console.log(`Atualizados: ${atualizados}`);
  console.log(`Ignorados (sem referência): ${ignorados}`);
  console.log(`Erros: ${erros.length}`);
  if (erros.length > 0) {
    console.log('Erros:', erros.slice(0, 10).join(', '));
  }

  const total = await prisma.stock.count({ where: { serviceStationId: null } });
  console.log(`Total produtos na BD agora: ${total}`);

  await prisma.$disconnect();
}

async function processBatch(batch: any[]) {
  let criados = 0;
  let atualizados = 0;
  const erros: string[] = [];

  for (const item of batch) {
    try {
      if (item.tipo === 'create') {
        await prisma.stock.create({ data: item.data });
        criados++;
      } else {
        const existing = await prisma.stock.findFirst({
          where: { referencia: item.referencia, serviceStationId: null, lote: '' },
        });
        if (existing) {
          await prisma.stock.update({
            where: { id: existing.id },
            data: item.data,
          });
          atualizados++;
        }
      }
    } catch (e: any) {
      erros.push(item.referencia || 'desconhecido');
    }
  }

  return { criados, atualizados, erros };
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
