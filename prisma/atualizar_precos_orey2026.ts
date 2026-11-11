import { PrismaClient } from '@prisma/client';
import * as xlsx from 'xlsx';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const filePath = path.join(process.cwd(), 'Lista Produtos orey 2026.xlsx');
  const wb = xlsx.readFile(filePath);
  const wsName = wb.SheetNames[0];
  const ws = wb.Sheets[wsName];
  const rows: any[] = xlsx.utils.sheet_to_json(ws, { header: 1 });

  // Primeira linha = cabeçalho
  const header = rows[0];
  console.log('Cabeçalho:', header);

  let processados = 0;
  let atualizados = 0;
  let naoEncontrados = 0;
  let erros = 0;
  const naoEncontradosLista: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const referencia = String(row[0] || '').trim();
    const descricao = String(row[1] || '').trim();
    const precoCompra = row[2] != null ? Number(row[2]) : null;
    const codigoFabricante = row[3] != null ? String(row[3]).trim() : null;
    const precoVenda = row[4] != null ? Number(row[4]) : null;

    if (!referencia) continue;

    processados++;

    try {
      // Procurar produto existente por referência no stock global
      const existing = await prisma.stock.findFirst({
        where: {
          referencia,
          serviceStationId: null,
          lote: '',
        },
      });

      if (existing) {
        const updateData: Record<string, unknown> = {};
        let mudou = false;

        if (precoCompra != null && !Number.isNaN(precoCompra) && existing.precoCompra !== precoCompra) {
          updateData.precoCompra = precoCompra;
          mudou = true;
        }
        if (precoVenda != null && !Number.isNaN(precoVenda) && existing.precoVenda !== precoVenda) {
          updateData.precoVenda = precoVenda;
          mudou = true;
        }
        if (codigoFabricante && existing.codigoFabricante !== codigoFabricante) {
          updateData.codigoFabricante = codigoFabricante;
          mudou = true;
        }
        // Atualizar descrição se estiver vazia ou diferente
        if (descricao && existing.descricao !== descricao) {
          updateData.descricao = descricao;
          mudou = true;
        }

        if (mudou && Object.keys(updateData).length > 0) {
          await prisma.stock.update({
            where: { id: existing.id },
            data: updateData,
          });
          atualizados++;
        }
      } else {
        naoEncontrados++;
        naoEncontradosLista.push(referencia);
      }
    } catch (e) {
      erros++;
      console.error(`Erro ao processar ${referencia}:`, e);
    }
  }

  console.log(`\n=== Resultado da atualização ===`);
  console.log(`Processados: ${processados}`);
  console.log(`Atualizados: ${atualizados}`);
  console.log(`Não encontrados na BD: ${naoEncontrados}`);
  console.log(`Erros: ${erros}`);

  if (naoEncontradosLista.length > 0 && naoEncontradosLista.length <= 50) {
    console.log(`\nReferências não encontradas: ${naoEncontradosLista.join(', ')}`);
  } else if (naoEncontradosLista.length > 50) {
    console.log(`\nPrimeiras 50 referências não encontradas: ${naoEncontradosLista.slice(0, 50).join(', ')}`);
  }

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
