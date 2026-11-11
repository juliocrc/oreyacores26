import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// As três estações principais da Orey Técnica
const STATION_CODES = ['ACORES', 'ALCATARILHA', 'AVELEDA'] as const;

// Stock global (serviceStationId = null) - partilhado por todas as estações
const GLOBAL_STOCK = [
  // === Pirotécnicos (SB 08/13, SB 44/13) ===
  { referencia: 'PYR-ROCKET-RED', descricao: 'Foguete Páraquedas Vermelho SOLAS', categoria: 'PIROTÉCNICOS', codigoFabricante: 'Ikaros/Pains Wessex', precoVenda: 45.0, quantidade: 100, quantidadeMinima: 20 },
  { referencia: 'PYR-ROCKET-WHITE', descricao: 'Foguete Páraquedas Branco (Colisão)', categoria: 'PIROTÉCNICOS', codigoFabricante: 'Ikaros/Pains Wessex', precoVenda: 42.0, quantidade: 60, quantidadeMinima: 15 },
  { referencia: 'PYR-FLARE-RED', descricao: 'Facho de Mão Vermelho', categoria: 'PIROTÉCNICOS', codigoFabricante: 'Ikaros/Pains Wessex', precoVenda: 18.5, quantidade: 150, quantidadeMinima: 30 },
  { referencia: 'PYR-SMOKE-ORANGE', descricao: 'Sinal de Fumo Flutuante Laranja', categoria: 'PIROTÉCNICOS', codigoFabricante: 'Ikaros/Pains Wessex', precoVenda: 35.0, quantidade: 80, quantidadeMinima: 20 },

  // === Cabeças de disparo / rearm (SB 13/08, SB 17/19, SB 105/16) ===
  { referencia: 'LEAF-HD-W', descricao: 'Cabeça de Disparo Leafield GIST (Nova, pan-head)', categoria: 'CABEÇAS DE DISPARO', codigoFabricante: '08211009', precoVenda: 120.0, quantidade: 50, quantidadeMinima: 10 },
  { referencia: 'LEAF-HD-VAC', descricao: 'Cabeça de Disparo Leafield GIST (Vacuum Bag)', categoria: 'CABEÇAS DE DISPARO', codigoFabricante: '08426009', precoVenda: 125.0, quantidade: 30, quantidadeMinima: 10 },
  { referencia: 'LEAF-SCREW-PAN', descricao: 'Parafuso Pan-head para Cabeça GIST Nova', categoria: 'CABEÇAS DE DISPARO', codigoFabricante: '12763009', precoVenda: 2.5, quantidade: 200, quantidadeMinima: 50 },
  { referencia: 'LEAF-SCREW-CAP', descricao: 'Parafuso Cap-head para Cabeça GIST Antiga', categoria: 'CABEÇAS DE DISPARO', codigoFabricante: '08212009', precoVenda: 2.5, quantidade: 200, quantidadeMinima: 50 },
  { referencia: 'HEAD-THANNER-DK99', descricao: 'Cabeça de Disparo Thanner DK99', categoria: 'CABEÇAS DE DISPARO', codigoFabricante: '08969009', precoVenda: 0.0, quantidade: 40, quantidadeMinima: 10 },
  { referencia: 'HEAD-THANNER-DK94', descricao: 'Cabeça de Disparo Thanner DK94', categoria: 'CABEÇAS DE DISPARO', codigoFabricante: 'ZC30651', precoVenda: 0.0, quantidade: 40, quantidadeMinima: 10 },
  { referencia: 'HEAD-THANNER-DK99-KIT', descricao: 'Kit Cabeça DK99 (Z63126 / Z63127)', categoria: 'CABEÇAS DE DISPARO', codigoFabricante: 'Z63126', precoVenda: 0.0, quantidade: 30, quantidadeMinima: 10 },
  { referencia: 'HRU-HAMMAR-H20', descricao: 'Disparador Hidrostático Hammar H20', categoria: 'CABEÇAS DE DISPARO', codigoFabricante: 'HRU-H20', precoVenda: 65.0, quantidade: 60, quantidadeMinima: 15 },
  { referencia: '08211009R', descricao: 'Disparador Hidrostático HRU para Jangadas', categoria: 'CABEÇAS DE DISPARO', codigoFabricante: '08211009R', precoVenda: 65.0, quantidade: 40, quantidadeMinima: 10 },

  // === Válvulas e PRV (SB 87/13, SB 35/15, SB 51/09) ===
  { referencia: 'VAL-THAN-OTS65-RED', descricao: 'Válvula Sobrepressão Thanner OTS65 Vermelha (3.5)', categoria: 'CABEÇAS DE DISPARO', codigoFabricante: '00811400', precoVenda: 85.0, quantidade: 50, quantidadeMinima: 10 },
  { referencia: 'VAL-THAN-OTS65-YEL', descricao: 'Válvula Sobrepressão Thanner OTS65 Amarela (2.8)', categoria: 'CABEÇAS DE DISPARO', codigoFabricante: '00811410', precoVenda: 85.0, quantidade: 50, quantidadeMinima: 10 },
  { referencia: 'VAL-LEAF-A10', descricao: 'Válvula de Alívio Leafield A10', categoria: 'CABEÇAS DE DISPARO', codigoFabricante: 'LEAF-A10', precoVenda: 48.0, quantidade: 40, quantidadeMinima: 10 },
  { referencia: 'VAL-LEAF-B10', descricao: 'Válvula de Alívio Leafield B10 (Alternativa A10)', categoria: 'CABEÇAS DE DISPARO', codigoFabricante: 'LEAF-B10', precoVenda: 48.0, quantidade: 30, quantidadeMinima: 10 },
  { referencia: 'VAL-LEAF-A6', descricao: 'Válvula de Alívio Leafield A6', categoria: 'CABEÇAS DE DISPARO', codigoFabricante: 'LEAF-A6', precoVenda: 42.0, quantidade: 40, quantidadeMinima: 10 },
  { referencia: 'SEAL-GIST-INLET-12211009', descricao: 'Selo Ball Seat Moulding Válvula Entrada GIST (SB 35/15)', categoria: 'CABEÇAS DE DISPARO', codigoFabricante: '12211009', precoVenda: 8.0, quantidade: 100, quantidadeMinima: 20 },
  { referencia: 'SEAL-GIST-KIT-12237009', descricao: 'Kit Selo Válvula Entrada GIST (SB 35/15)', categoria: 'CABEÇAS DE DISPARO', codigoFabricante: '12237009', precoVenda: 15.0, quantidade: 50, quantidadeMinima: 10 },

  // === Iluminação RL5 / RL6 (SB 20/13, SB 58/13, SB 76/15, SB 77/15) ===
  { referencia: 'LGT-RL5-INT', descricao: 'Luz Interna RL5 (Unidade)', categoria: 'ILUMINAÇÃO', codigoFabricante: '11785009', precoVenda: 12.0, quantidade: 60, quantidadeMinima: 15 },
  { referencia: 'LGT-RL5-EXT', descricao: 'Luz Externa RL5 (Unidade)', categoria: 'ILUMINAÇÃO', codigoFabricante: '11788009', precoVenda: 15.0, quantidade: 60, quantidadeMinima: 15 },
  { referencia: 'BAT-RL5-LITH', descricao: 'Bateria Lítio p/ RL5 (Validade 5 anos)', categoria: 'ILUMINAÇÃO', codigoFabricante: 'SURVITEC', precoVenda: 35.0, quantidade: 80, quantidadeMinima: 20 },
  { referencia: 'LGT-RL6-INT', descricao: 'Luz Interna RL6 (Unidade)', categoria: 'ILUMINAÇÃO', codigoFabricante: '11785009', precoVenda: 18.0, quantidade: 60, quantidadeMinima: 15 },
  { referencia: 'LGT-RL6-EXT', descricao: 'Luz Externa RL6 (Unidade)', categoria: 'ILUMINAÇÃO', codigoFabricante: '11788009', precoVenda: 22.0, quantidade: 60, quantidadeMinima: 15 },
  { referencia: 'BAT-RL6-LITH', descricao: 'Bateria Lítio p/ RL6 (Validade 5 anos)', categoria: 'ILUMINAÇÃO', codigoFabricante: 'SURVITEC', precoVenda: 38.0, quantidade: 80, quantidadeMinima: 20 },
  { referencia: 'LGT-RL6-KIT', descricao: 'Kit Completo Luz RL6 (Int + Ext + Bateria)', categoria: 'ILUMINAÇÃO', codigoFabricante: 'SURVITEC', precoVenda: 75.0, quantidade: 40, quantidadeMinima: 10 },
  { referencia: 'BAT-RB2', descricao: 'Bateria RB2 p/ Colete/RL5/RL6', categoria: 'ILUMINAÇÃO', codigoFabricante: 'Universal', precoVenda: 12.0, quantidade: 100, quantidadeMinima: 25 },
  { referencia: 'LGT-RB2-KIT', descricao: 'Kit Luz RB2 p/ Colete Salvação', categoria: 'ILUMINAÇÃO', codigoFabricante: 'Universal', precoVenda: 15.0, quantidade: 50, quantidadeMinima: 15 },

  // === Espuma de proteção (SB 65/13, SB 55/13, SB 04/18) ===
  { referencia: 'FOAM-RACETRACK-LOWER', descricao: 'Pad Espuma Proteção Inferior (Racetrack, ISO 9650 GRP/ABS)', categoria: 'ACESSÓRIOS', codigoFabricante: '53011001', precoVenda: 18.0, quantidade: 60, quantidadeMinima: 15 },
  { referencia: 'FOAM-RACETRACK-UPPER', descricao: 'Pad Espuma Proteção Superior (Racetrack, ISO 9650 GRP/ABS)', categoria: 'ACESSÓRIOS', codigoFabricante: '53011002', precoVenda: 18.0, quantidade: 60, quantidadeMinima: 15 },
  { referencia: 'FOAM-WEBBING-300', descricao: 'Fita Espuma Proteção Webbing 300mm', categoria: 'ACESSÓRIOS', codigoFabricante: 'WE11', precoVenda: 4.0, quantidade: 200, quantidadeMinima: 50 },
  { referencia: 'FOAM-FERRYMAN-MK10', descricao: 'Espuma Adicional Contentor Ferryman Mk10 (SB 55/13)', categoria: 'ACESSÓRIOS', codigoFabricante: 'SURVITEC', precoVenda: 25.0, quantidade: 40, quantidadeMinima: 10 },
  { referencia: 'FOAM-FERRYMAN-MK15', descricao: 'Espuma Adicional Contentor Ferryman Mk15 (SB 55/13)', categoria: 'ACESSÓRIOS', codigoFabricante: 'SURVITEC', precoVenda: 25.0, quantidade: 40, quantidadeMinima: 10 },
  { referencia: 'FOAM-INFLATION-FERRYMAN', descricao: 'Espuma Proteção Sistema Insuflação Ferryman (SB 65/13)', categoria: 'ACESSÓRIOS', codigoFabricante: 'SURVITEC', precoVenda: 22.0, quantidade: 40, quantidadeMinima: 10 },

  // === Multi-label sheets (SB 46/21) ===
  { referencia: 'MULTI-LABEL-ANNUAL', descricao: 'Folha Multi-Etiquetas Annual Service (RFD 53795001)', categoria: 'ACESSÓRIOS', codigoFabricante: '53795001', precoVenda: 18.0, quantidade: 50, quantidadeMinima: 10 },
  { referencia: 'MULTI-LABEL-DAVIT', descricao: 'Folha Multi-Etiquetas Davit-Launch Add-on (53801001)', categoria: 'ACESSÓRIOS', codigoFabricante: '53801001', precoVenda: 18.0, quantidade: 30, quantidadeMinima: 10 },
  { referencia: 'MULTI-LABEL-EXTENDED', descricao: 'Folha Multi-Etiquetas Extended Service (53800001)', categoria: 'ACESSÓRIOS', codigoFabricante: '53800001', precoVenda: 18.0, quantidade: 30, quantidadeMinima: 10 },
  { referencia: 'MULTI-LABEL-FERRYMAN', descricao: 'Folha Multi-Etiquetas Ferryman (53798001)', categoria: 'ACESSÓRIOS', codigoFabricante: '53798001', precoVenda: 18.0, quantidade: 30, quantidadeMinima: 10 },
  { referencia: 'MULTI-LABEL-MOR', descricao: 'Folha Multi-Etiquetas Means of Rescue (53799001)', categoria: 'ACESSÓRIOS', codigoFabricante: '53799001', precoVenda: 18.0, quantidade: 20, quantidadeMinima: 5 },
  { referencia: 'TAPE-DONOTCUT', descricao: 'Fita Do Not Cut (Rolo 50mm, substitui fita antiga)', categoria: 'ACESSÓRIOS', codigoFabricante: 'SURVITEC', precoVenda: 15.0, quantidade: 30, quantidadeMinima: 10 },

  // === Cilindros e tubos ===
  { referencia: 'CYL-CO2-4L', descricao: 'Cilindro CO2 4L (Corpo Vazio)', categoria: 'CILINDROS', codigoFabricante: 'Universal', precoVenda: 150.0, quantidade: 30, quantidadeMinima: 10 },
  { referencia: 'CYL-CO2-6L', descricao: 'Cilindro CO2 6L (Corpo Vazio)', categoria: 'CILINDROS', codigoFabricante: 'Universal', precoVenda: 180.0, quantidade: 20, quantidadeMinima: 5 },
  { referencia: 'GAS-REFILL-CO2', descricao: 'Recarga de Gás CO2 (por Kg)', categoria: 'CILINDROS', codigoFabricante: 'Universal', precoVenda: 12.0, quantidade: 100, quantidadeMinima: 25 },
  { referencia: 'TUBO-BAYONET-GIST', descricao: 'Mangueira GIST com Baioneta (Ambas Pontas)', categoria: 'TUBOS DE ALTA PRESSÃO', codigoFabricante: 'SURVITEC', precoVenda: 28.0, quantidade: 60, quantidadeMinima: 15 },
  { referencia: 'TUBO-HP-LEAFIELD', descricao: 'Tubo Alta Pressão Leafield', categoria: 'TUBOS DE ALTA PRESSÃO', codigoFabricante: 'Leafield Marine', precoVenda: 22.0, quantidade: 50, quantidadeMinima: 15 },

  // === Primeiros socorros e consumíveis (SB 01/21, SB 12/24) ===
  { referencia: 'MED-KIT-SOLAS', descricao: 'Kit Primeiros Socorros SOLAS Completo', categoria: 'PRIMEIROS SOCORROS', codigoFabricante: 'SOLAS', precoVenda: 55.0, quantidade: 60, quantidadeMinima: 15 },
  { referencia: 'MED-KIT-ISO', descricao: 'Kit Primeiros Socorros ISO Completo', categoria: 'PRIMEIROS SOCORROS', codigoFabricante: 'ISO', precoVenda: 48.0, quantidade: 60, quantidadeMinima: 15 },
  { referencia: 'TAB-ANTISEASICKNESS', descricao: 'Comprimidos Anti-enjoo (Pack 10 un.)', categoria: 'PRIMEIROS SOCORROS', codigoFabricante: 'Universal', precoVenda: 8.0, quantidade: 100, quantidadeMinima: 30 },
  { referencia: 'RATION-500G', descricao: 'Ração de Comida 500g (Validade 5 anos)', categoria: 'CONSUMÍVEIS', codigoFabricante: 'SOLAS', precoVenda: 14.0, quantidade: 200, quantidadeMinima: 50 },
  { referencia: 'WATER-500ML', descricao: 'Água Potável 500ml (Validade 5 anos)', categoria: 'CONSUMÍVEIS', codigoFabricante: 'SOLAS', precoVenda: 2.5, quantidade: 500, quantidadeMinima: 100 },

  // === Sinalização e sobrevivência ===
  { referencia: 'WHISTLE-SOLAS', descricao: 'Apito SOLAS', categoria: 'SINALIZAÇÃO', codigoFabricante: 'SOLAS', precoVenda: 2.0, quantidade: 200, quantidadeMinima: 50 },
  { referencia: 'HELIOGRAPH', descricao: 'Heliógrafo / Espelho de Sinalização', categoria: 'SINALIZAÇÃO', codigoFabricante: 'SOLAS/ISO', precoVenda: 7.0, quantidade: 100, quantidadeMinima: 25 },
  { referencia: 'THERM-BLANKET', descricao: 'Manta Térmica de Sobrevivência', categoria: 'CONSUMÍVEIS', codigoFabricante: 'Universal', precoVenda: 12.0, quantidade: 100, quantidadeMinima: 25 },
  { referencia: 'THER-BLANKET-TPA', descricao: 'Manta Térmica de Alta Proteção (TPA)', categoria: 'CONSUMÍVEIS', codigoFabricante: 'SOLAS/ISO', precoVenda: 16.0, quantidade: 80, quantidadeMinima: 20 },
  { referencia: 'KNIFE-FLOATING', descricao: 'Faca Flutuante de Segurança', categoria: 'CONSUMÍVEIS', codigoFabricante: 'SOLAS/ISO', precoVenda: 11.0, quantidade: 100, quantidadeMinima: 25 },
  { referencia: 'DROGUE-ANCHOR', descricao: 'Âncora Flutuante (Drogue)', categoria: 'CONSUMÍVEIS', codigoFabricante: 'SOLAS/ISO', precoVenda: 22.0, quantidade: 50, quantidadeMinima: 15 },
  { referencia: 'FISH-KIT', descricao: 'Kit de Pesca de Sobrevivência', categoria: 'CONSUMÍVEIS', codigoFabricante: 'SOLAS/ISO', precoVenda: 9.5, quantidade: 100, quantidadeMinima: 25 },

  // === Manutenção e etiquetagem (SB 54/16) ===
  { referencia: 'TAPE-DYMO-TZE211', descricao: 'Fita Dymo TZe211 6mm Preto (Data Label)', categoria: 'ACESSÓRIOS', codigoFabricante: '11845009', precoVenda: 15.0, quantidade: 40, quantidadeMinima: 10 },
  { referencia: 'GLUE-NEOPRENE', descricao: 'Cola Neoprene Técnica 1L', categoria: 'ACESSÓRIOS', codigoFabricante: 'Universal', precoVenda: 22.0, quantidade: 20, quantidadeMinima: 5 },
  { referencia: 'SEAL-WIRE-BLUE', descricao: 'Selo de Arame Azul (Unidade)', categoria: 'ACESSÓRIOS', codigoFabricante: 'Universal', precoVenda: 0.5, quantidade: 500, quantidadeMinima: 100 },
  { referencia: 'PATCH-RFD-50MM', descricao: 'Patch Tecido RFD 1015/1 50mm (SB 18/08)', categoria: 'ACESSÓRIOS', codigoFabricante: 'RFD 1015/1', precoVenda: 3.0, quantidade: 200, quantidadeMinima: 50 },
]

// Stock específico por estação (produtos com maior relevância regional)
const STATION_STOCK: Record<string, typeof GLOBAL_STOCK> = {
  ACORES: [
    // Açores - foco em Survita RFD, Ferryman, condições atlânticas
    { referencia: 'AC-FERRYMAN-50-65', descricao: 'Kit Revisão Ferryman 50/65 pax (Açores)', categoria: 'ACESSÓRIOS', codigoFabricante: 'SURVITEC-AZ', precoVenda: 180.0, quantidade: 20, quantidadeMinima: 5 },
    { referencia: 'AC-FERRYMAN-100-130', descricao: 'Kit Revisão Ferryman 100/130 pax (Açores)', categoria: 'ACESSÓRIOS', codigoFabricante: 'SURVITEC-AZ', precoVenda: 220.0, quantidade: 15, quantidadeMinima: 5 },
    { referencia: 'AC-SURVIVA-MKIV-4-25', descricao: 'Kit Revisão Surviva MKIV 4-25 pax (Açores)', categoria: 'ACESSÓRIOS', codigoFabricante: 'SURVITEC-AZ', precoVenda: 150.0, quantidade: 30, quantidadeMinima: 10 },
    { referencia: 'AC-RL6-PATCH-KIT', descricao: 'Kit Correção Patch RL6 (SB 58/13)', categoria: 'ACESSÓRIOS', codigoFabricante: 'SURVITEC-AZ', precoVenda: 35.0, quantidade: 40, quantidadeMinima: 10 },
  ],
  ALCATARILHA: [
    // Algarve - foco em Ocean Safety, Sea-Safe, condições mediterráticas
    { referencia: 'AL-OCEANSAFETY-KIT', descricao: 'Kit Revisão Ocean Safety (Algarve)', categoria: 'ACESSÓRIOS', codigoFabricante: 'OCEANSAFETY-ALG', precoVenda: 160.0, quantidade: 25, quantidadeMinima: 8 },
    { referencia: 'AL-SEA-SAFE-KIT', descricao: 'Kit Revisão Sea-Safe (Algarve)', categoria: 'ACESSÓRIOS', codigoFabricante: 'SEA-SAFE-ALG', precoVenda: 160.0, quantidade: 20, quantidadeMinima: 8 },
    { referencia: 'AL-RL6-PATCH-KIT', descricao: 'Kit Correção Patch RL6 (SB 58/13)', categoria: 'ACESSÓRIOS', codigoFabricante: 'SURVITEC-ALG', precoVenda: 35.0, quantidade: 30, quantidadeMinima: 10 },
  ],
  AVELEDA: [
    // Norte - foco em Zodiac, condições norte
    { referencia: 'AV-ZODIAC-KIT', descricao: 'Kit Revisão Zodiac Coastal (Norte)', categoria: 'ACESSÓRIOS', codigoFabricante: 'ZODIAC-NORTE', precoVenda: 140.0, quantidade: 25, quantidadeMinima: 8 },
    { referencia: 'AV-RL6-PATCH-KIT', descricao: 'Kit Correção Patch RL6 (SB 58/13)', categoria: 'ACESSÓRIOS', codigoFabricante: 'SURVITEC-NORTE', precoVenda: 35.0, quantidade: 30, quantidadeMinima: 10 },
  ],
}

async function ensureStations() {
  for (const codigo of STATION_CODES) {
    await prisma.serviceStation.upsert({
      where: { codigo },
      update: { ativo: true },
      create: {
        codigo,
        nome: codigo === 'ACORES' ? 'Açores' : codigo === 'ALCATARILHA' ? 'Alcantarilha' : 'Aveleda',
        empresa: 'Orey Técnica',
        territorioTipo: codigo === 'ACORES' ? 'AZORES' : 'MAINLAND',
        regiaoOperacional: codigo === 'ACORES' ? null : codigo === 'ALCATARILHA' ? 'SUL' : 'NORTE',
        ativo: true,
      },
    })
  }
  console.log('Estações verificadas/criadas:', STATION_CODES.join(', '))
}

async function seedGlobalStock() {
  let created = 0
  let updated = 0

  for (const item of GLOBAL_STOCK) {
    const existing = await prisma.stock.findFirst({
      where: {
        referencia: item.referencia,
        serviceStationId: null,
        lote: '',
      },
    })

    if (existing) {
      await prisma.stock.update({
        where: { id: existing.id },
        data: {
          descricao: item.descricao,
          categoria: item.categoria,
          codigoFabricante: item.codigoFabricante,
          precoVenda: item.precoVenda,
          quantidadeMinima: item.quantidadeMinima,
          estadoArtigo: 'ATIVO',
        },
      })
      updated += 1
    } else {
      await prisma.stock.create({
        data: {
          referencia: item.referencia,
          descricao: item.descricao,
          categoria: item.categoria,
          codigoFabricante: item.codigoFabricante,
          precoVenda: item.precoVenda,
          quantidade: item.quantidade,
          quantidadeMinima: item.quantidadeMinima,
          estadoArtigo: 'ATIVO',
          serviceStationId: null,
          lote: '',
          validade: null,
          associavelJangada: true,
        },
      })
      created += 1
    }
  }

  console.log(`Stock global - Criados: ${created}, Atualizados: ${updated}, Total: ${GLOBAL_STOCK.length}`)
  return { created, updated, total: GLOBAL_STOCK.length }
}

async function seedStationStock() {
  const stations = await prisma.serviceStation.findMany({
    where: { codigo: { in: STATION_CODES } },
    select: { id: true, codigo: true },
  })
  const stationMap = new Map(stations.map(s => [s.codigo, s.id]))

  let totalCreated = 0
  let totalUpdated = 0

  for (const codigo of STATION_CODES) {
    const stationId = stationMap.get(codigo)
    if (!stationId) {
      console.warn(`Estação ${codigo} não encontrada, a ignorar stock específico.`)
      continue
    }

    const items = STATION_STOCK[codigo] || []
    let created = 0
    let updated = 0

    for (const item of items) {
      const existing = await prisma.stock.findFirst({
        where: {
          referencia: item.referencia,
          serviceStationId: stationId,
          lote: '',
        },
      })

      if (existing) {
        await prisma.stock.update({
          where: { id: existing.id },
          data: {
            descricao: item.descricao,
            categoria: item.categoria,
            codigoFabricante: item.codigoFabricante,
            precoVenda: item.precoVenda,
            quantidadeMinima: item.quantidadeMinima,
            estadoArtigo: 'ATIVO',
          },
        })
        updated += 1
      } else {
        await prisma.stock.create({
          data: {
            referencia: item.referencia,
            descricao: item.descricao,
            categoria: item.categoria,
            codigoFabricante: item.codigoFabricante,
            precoVenda: item.precoVenda,
            quantidade: item.quantidade,
            quantidadeMinima: item.quantidadeMinima,
            estadoArtigo: 'ATIVO',
            serviceStationId: stationId,
            lote: '',
            validade: null,
            associavelJangada: true,
          },
        })
        created += 1
      }
    }

    console.log(`Estação ${codigo} - Criados: ${created}, Atualizados: ${updated}, Total: ${items.length}`)
    totalCreated += created
    totalUpdated += updated
  }

  console.log(`Stock por estação - Total criados: ${totalCreated}, Total atualizados: ${totalUpdated}`)
  return { created: totalCreated, updated: totalUpdated }
}

async function main() {
  console.log('=== Seed Stock Global Orey Técnica ===')
  console.log('')

  await ensureStations()
  console.log('')

  const globalResult = await seedGlobalStock()
  console.log('')

  const stationResult = await seedStationStock()
  console.log('')

  console.log('=== Resumo ===')
  console.log(`Stock global: ${globalResult.created} criados, ${globalResult.updated} atualizados`)
  console.log(`Stock estações: ${stationResult.created} criados, ${stationResult.updated} atualizados`)
  console.log('Seed concluído com sucesso!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
