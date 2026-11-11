import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Quantidades padrão ajustadas por categoria/frequência de uso
// Cada entrada: referencia -> { quantidade, quantidadeMinima }
const GLOBAL_QUANTIDADES: Record<string, { quantidade: number; quantidadeMinima: number }> = {
  // === Pirotécnicos (alta rotatividade, substituição frequente) ===
  'PYR-ROCKET-RED': { quantidade: 200, quantidadeMinima: 50 },
  'PYR-ROCKET-WHITE': { quantidade: 120, quantidadeMinima: 30 },
  'PYR-FLARE-RED': { quantidade: 300, quantidadeMinima: 60 },
  'PYR-SMOKE-ORANGE': { quantidade: 160, quantidadeMinima: 40 },

  // === Cabeças de disparo (média rotatividade) ===
  'LEAF-HD-W': { quantidade: 100, quantidadeMinima: 25 },
  'LEAF-HD-VAC': { quantidade: 60, quantidadeMinima: 15 },
  'LEAF-SCREW-PAN': { quantidade: 400, quantidadeMinima: 100 },
  'LEAF-SCREW-CAP': { quantidade: 400, quantidadeMinima: 100 },
  'HEAD-THANNER-DK99': { quantidade: 80, quantidadeMinima: 20 },
  'HEAD-THANNER-DK94': { quantidade: 80, quantidadeMinima: 20 },
  'HEAD-THANNER-DK99-KIT': { quantidade: 60, quantidadeMinima: 15 },
  'HRU-HAMMAR-H20': { quantidade: 120, quantidadeMinima: 30 },
  '08211009R': { quantidade: 80, quantidadeMinima: 20 },

  // === Válvulas e PRV ===
  'VAL-THAN-OTS65-RED': { quantidade: 100, quantidadeMinima: 25 },
  'VAL-THAN-OTS65-YEL': { quantidade: 100, quantidadeMinima: 25 },
  'VAL-LEAF-A10': { quantidade: 80, quantidadeMinima: 20 },
  'VAL-LEAF-B10': { quantidade: 60, quantidadeMinima: 15 },
  'VAL-LEAF-A6': { quantidade: 80, quantidadeMinima: 20 },
  'SEAL-GIST-INLET-12211009': { quantidade: 200, quantidadeMinima: 50 },
  'SEAL-GIST-KIT-12237009': { quantidade: 100, quantidadeMinima: 25 },

  // === Iluminação RL5 / RL6 (média-alta rotatividade) ===
  'LGT-RL5-INT': { quantidade: 120, quantidadeMinima: 30 },
  'LGT-RL5-EXT': { quantidade: 120, quantidadeMinima: 30 },
  'BAT-RL5-LITH': { quantidade: 160, quantidadeMinima: 40 },
  'LGT-RL6-INT': { quantidade: 120, quantidadeMinima: 30 },
  'LGT-RL6-EXT': { quantidade: 120, quantidadeMinima: 30 },
  'BAT-RL6-LITH': { quantidade: 160, quantidadeMinima: 40 },
  'LGT-RL6-KIT': { quantidade: 80, quantidadeMinima: 20 },
  'BAT-RB2': { quantidade: 200, quantidadeMinima: 50 },
  'LGT-RB2-KIT': { quantidade: 100, quantidadeMinima: 30 },

  // === Espuma de proteção ===
  'FOAM-RACETRACK-LOWER': { quantidade: 120, quantidadeMinima: 30 },
  'FOAM-RACETRACK-UPPER': { quantidade: 120, quantidadeMinima: 30 },
  'FOAM-WEBBING-300': { quantidade: 400, quantidadeMinima: 100 },
  'FOAM-FERRYMAN-MK10': { quantidade: 80, quantidadeMinima: 20 },
  'FOAM-FERRYMAN-MK15': { quantidade: 80, quantidadeMinima: 20 },
  'FOAM-INFLATION-FERRYMAN': { quantidade: 80, quantidadeMinima: 20 },

  // === Multi-label sheets ===
  'MULTI-LABEL-ANNUAL': { quantidade: 100, quantidadeMinima: 25 },
  'MULTI-LABEL-DAVIT': { quantidade: 60, quantidadeMinima: 15 },
  'MULTI-LABEL-EXTENDED': { quantidade: 60, quantidadeMinima: 15 },
  'MULTI-LABEL-FERRYMAN': { quantidade: 60, quantidadeMinima: 15 },
  'MULTI-LABEL-MOR': { quantidade: 40, quantidadeMinima: 10 },
  'TAPE-DONOTCUT': { quantidade: 60, quantidadeMinima: 15 },

  // === Cilindros e tubos (baixa rotatividade, alto custo) ===
  'CYL-CO2-4L': { quantidade: 60, quantidadeMinima: 15 },
  'CYL-CO2-6L': { quantidade: 40, quantidadeMinima: 10 },
  'GAS-REFILL-CO2': { quantidade: 200, quantidadeMinima: 50 },
  'TUBO-BAYONET-GIST': { quantidade: 120, quantidadeMinima: 30 },
  'TUBO-HP-LEAFIELD': { quantidade: 100, quantidadeMinima: 25 },

  // === Primeiros socorros e consumíveis (alta rotatividade) ===
  'MED-KIT-SOLAS': { quantidade: 120, quantidadeMinima: 30 },
  'MED-KIT-ISO': { quantidade: 120, quantidadeMinima: 30 },
  'TAB-ANTISEASICKNESS': { quantidade: 200, quantidadeMinima: 60 },
  'RATION-500G': { quantidade: 400, quantidadeMinima: 100 },
  'WATER-500ML': { quantidade: 1000, quantidadeMinima: 200 },

  // === Sinalização e sobrevivência ===
  'WHISTLE-SOLAS': { quantidade: 400, quantidadeMinima: 100 },
  'HELIOGRAPH': { quantidade: 200, quantidadeMinima: 50 },
  'THERM-BLANKET': { quantidade: 200, quantidadeMinima: 50 },
  'THER-BLANKET-TPA': { quantidade: 160, quantidadeMinima: 40 },
  'KNIFE-FLOATING': { quantidade: 200, quantidadeMinima: 50 },
  'DROGUE-ANCHOR': { quantidade: 100, quantidadeMinima: 30 },
  'FISH-KIT': { quantidade: 200, quantidadeMinima: 50 },

  // === Manutenção e etiquetagem ===
  'TAPE-DYMO-TZE211': { quantidade: 80, quantidadeMinima: 20 },
  'GLUE-NEOPRENE': { quantidade: 40, quantidadeMinima: 10 },
  'SEAL-WIRE-BLUE': { quantidade: 1000, quantidadeMinima: 200 },
  'PATCH-RFD-50MM': { quantidade: 400, quantidadeMinima: 100 },
};

// Stock específico por estação (quantidades menores, reposição local)
const STATION_QUANTIDADES: Record<string, Record<string, { quantidade: number; quantidadeMinima: number }>> = {
  ACORES: {
    'AC-FERRYMAN-50-65': { quantidade: 40, quantidadeMinima: 10 },
    'AC-FERRYMAN-100-130': { quantidade: 30, quantidadeMinima: 8 },
    'AC-SURVIVA-MKIV-4-25': { quantidade: 60, quantidadeMinima: 20 },
    'AC-RL6-PATCH-KIT': { quantidade: 80, quantidadeMinima: 20 },
  },
  ALCATARILHA: {
    'AL-OCEANSAFETY-KIT': { quantidade: 50, quantidadeMinima: 15 },
    'AL-SEA-SAFE-KIT': { quantidade: 40, quantidadeMinima: 12 },
    'AL-RL6-PATCH-KIT': { quantidade: 60, quantidadeMinima: 18 },
  },
  AVELEDA: {
    'AV-ZODIAC-KIT': { quantidade: 50, quantidadeMinima: 15 },
    'AV-RL6-PATCH-KIT': { quantidade: 60, quantidadeMinima: 18 },
  },
};

async function main() {
  console.log('=== Ajuste de quantidades - todo o stock ===\n');

  // Atualizar stock global (serviceStationId = null)
  let atualizadosGlobal = 0;
  let naoEncontradosGlobal: string[] = [];

  for (const [referencia, q] of Object.entries(GLOBAL_QUANTIDADES)) {
    const existing = await prisma.stock.findFirst({
      where: { referencia, serviceStationId: null, lote: '' },
    });
    if (!existing) {
      naoEncontradosGlobal.push(referencia);
      continue;
    }
    await prisma.stock.update({
      where: { id: existing.id },
      data: { quantidade: q.quantidade, quantidadeMinima: q.quantidadeMinima },
    });
    atualizadosGlobal++;
  }

  console.log(`Stock global: ${atualizadosGlobal} atualizados`);
  if (naoEncontradosGlobal.length > 0) {
    console.log('Não encontrados no global:', naoEncontradosGlobal.join(', '));
  }

  // Buscar estações
  const stations = await prisma.serviceStation.findMany({
    where: { codigo: { in: ['ACORES', 'ALCATARILHA', 'AVELEDA'] } },
    select: { id: true, codigo: true },
  });
  const stationMap = new Map(stations.map(s => [s.codigo, s.id]));

  for (const [codigo, items] of Object.entries(STATION_QUANTIDADES)) {
    const stationId = stationMap.get(codigo);
    if (!stationId) {
      console.warn(`Estação ${codigo} não encontrada.`);
      continue;
    }

    let atualizados = 0;
    let naoEncontrados: string[] = [];

    for (const [referencia, q] of Object.entries(items)) {
      const existing = await prisma.stock.findFirst({
        where: { referencia, serviceStationId: stationId, lote: '' },
      });
      if (!existing) {
        naoEncontrados.push(referencia);
        continue;
      }
      await prisma.stock.update({
        where: { id: existing.id },
        data: { quantidade: q.quantidade, quantidadeMinima: q.quantidadeMinima },
      });
      atualizados++;
    }

    console.log(`Estação ${codigo}: ${atualizados} atualizados`);
    if (naoEncontrados.length > 0) {
      console.log('  Não encontrados:', naoEncontrados.join(', '));
    }
  }

  // Verificar totais finais
  const totalGlobal = await prisma.stock.count({ where: { serviceStationId: null } });
  const totalEstacoes = await prisma.stock.count({
    where: { serviceStationId: { in: stations.map(s => s.id) } },
  });
  console.log(`\nTotal stock global: ${totalGlobal}`);
  console.log(`Total stock estações: ${totalEstacoes}`);

  await prisma.$disconnect();
  console.log('\nAjuste concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
