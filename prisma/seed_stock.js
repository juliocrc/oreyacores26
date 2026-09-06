const   dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();

const FOOD_RATIONS_STOCK_REFERENCE = '320202084';
const DRINKING_WATER_STOCK_REFERENCE = '30202085';

function normalizeCategoryText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeStockCategory(value, descricao) {
  const normalized = normalizeCategoryText(value);
  const description = normalizeCategoryText(descricao);

  const exactMap = {
    geral: 'EQUIPAMENTO',
    pirotecnia: 'SINALIZAÇÃO',
    'iluminacao e baterias': 'ILUMINAÇÃO',
    'mecanica e sistemas de disparo': 'EQUIPAMENTO',
    'cabecas de disparo': 'EQUIPAMENTO',
    'sobrevivencia e consumiveis': 'CONSUMÍVEIS',
    'manutencao e etiquetagem': 'EQUIPAMENTO',
    'sistemas de insuflacao': 'EQUIPAMENTO',
    'componentes criticos de conexao': 'EQUIPAMENTO',
    'jangada lr97': 'EQUIPAMENTO',
  };

  if (exactMap[normalized]) return exactMap[normalized];
  if (/farm|first aid|primeiros socorros|enjoo|tablet|comprim/.test(description)) return 'PRIMEIROS SOCORROS';
  if (/agua|water|racao|ration|copo|vomito|bag/.test(description)) return 'CONSUMÍVEIS';
  if (/manta|thermal|surviv|heliogra|pesca|whistle|apito/.test(description)) return 'SOBREVIVÊNCIA';
  if (/luz|light|lanterna|torch|bateria|battery/.test(description)) return 'ILUMINAÇÃO';
  if (/foguete|facho|smoke|fumo|sinal/.test(description)) return 'SINALIZAÇÃO';
  return 'EQUIPAMENTO';
}

const BASE_STOCK_ITEMS = [
  { referencia: 'ART001', descricao: 'Coletes salva-vidas tipo adulto', categoria: 'GERAL', precoVenda: 150.0, quantidade: 50 },
  { referencia: 'ART002', descricao: 'Coletes salva-vidas tipo infantil', categoria: 'GERAL', precoVenda: 120.0, quantidade: 30 },
  { referencia: 'ART003', descricao: 'Botes infláveis 6 pessoas', categoria: 'GERAL', precoVenda: 2500.0, quantidade: 10 },
  { referencia: 'ART004', descricao: 'Botes infláveis 10 pessoas', categoria: 'GERAL', precoVenda: 3500.0, quantidade: 5 },
  { referencia: 'ART005', descricao: 'Rádios VHF portáteis', categoria: 'GERAL', precoVenda: 300.0, quantidade: 20 },
  { referencia: 'ART006', descricao: 'Extintores de incêndio', categoria: 'GERAL', precoVenda: 80.0, quantidade: 100 },
  { referencia: 'ART007', descricao: 'Balizas EPIRB', categoria: 'GERAL', precoVenda: 800.0, quantidade: 15 },
  { referencia: 'ART008', descricao: 'Lanternas de sinalização', categoria: 'GERAL', precoVenda: 25.0, quantidade: 200 },
  { referencia: 'ART009', descricao: 'Máscaras de oxigênio', categoria: 'GERAL', precoVenda: 180.0, quantidade: 40 },
  { referencia: 'ART010', descricao: 'Cilindros de CO2', categoria: 'GERAL', precoVenda: 450.0, quantidade: 25 },
];

const CATALOGO_STOCK = [
  { referencia: 'PYR-ROCKET-RED', descricao: 'Foguete Paraquedas Vermelho', categoria: 'PIROTECNIA', precoVenda: 45.0, codigoFabricante: 'Ikaros/Pains Wessex' },
  { referencia: 'PYR-FLARE-RED', descricao: 'Facho de Mão Vermelho', categoria: 'PIROTECNIA', precoVenda: 18.5, codigoFabricante: 'Ikaros/Pains Wessex' },
  { referencia: 'PYR-SMOKE-ORANGE', descricao: 'Sinal de Fumo Flutuante Laranja', categoria: 'PIROTECNIA', precoVenda: 35.0, codigoFabricante: 'Ikaros/Pains Wessex' },
  { referencia: 'PYR-ROCKET-WHITE', descricao: 'Foguete Paraquedas Branco (Colisão)', categoria: 'PIROTECNIA', precoVenda: 42.0, codigoFabricante: 'Ikaros/Pains Wessex' },
  { referencia: 'LGT-RL5-INT', descricao: 'Luz Interna RL5 (Unidade)', categoria: 'ILUMINAÇÃO E BATERIAS', precoVenda: 12.0, codigoFabricante: 'Survitec' },
  { referencia: 'LGT-RL5-EXT', descricao: 'Luz Externa RL5 (Unidade)', categoria: 'ILUMINAÇÃO E BATERIAS', precoVenda: 15.0, codigoFabricante: 'Survitec' },
  { referencia: 'BAT-RL5-LITH', descricao: 'Bateria Lítio p/ RL5 (Val. 5 Anos)', categoria: 'ILUMINAÇÃO E BATERIAS', precoVenda: 35.0, codigoFabricante: 'Survitec' },
  { referencia: 'LGT-RL6-INT', descricao: 'Luz Interna RL6 (Unidade)', categoria: 'ILUMINAÇÃO E BATERIAS', precoVenda: 18.0, codigoFabricante: 'Survitec' },
  { referencia: 'LGT-RL6-EXT', descricao: 'Luz Externa RL6 (Unidade)', categoria: 'ILUMINAÇÃO E BATERIAS', precoVenda: 22.0, codigoFabricante: 'Survitec' },
  { referencia: 'BAT-RL6-LITH', descricao: 'Bateria Lítio p/ RL6 (Val. 5 Anos)', categoria: 'ILUMINAÇÃO E BATERIAS', precoVenda: 38.0, codigoFabricante: 'Survitec' },
  { referencia: 'LGT-RL6-KIT', descricao: 'Kit Completo Luz RL6 (Int+Ext+Bat)', categoria: 'ILUMINAÇÃO E BATERIAS', precoVenda: 75.0, codigoFabricante: 'Survitec' },
  { referencia: 'BAT-RB2', descricao: 'Bateria RB2 p/ Colete/RL5/RL6', categoria: 'ILUMINAÇÃO E BATERIAS', precoVenda: 12.0, codigoFabricante: 'Universal' },
  { referencia: 'LGT-RB2-KIT', descricao: 'Kit Luz RB2 p/ Colete Salvação', categoria: 'ILUMINAÇÃO E BATERIAS', precoVenda: 15.0, codigoFabricante: 'Universal' },
  { referencia: 'BAT-MASTER1', descricao: 'Bateria Master 1 (Lítio 3.6V)', categoria: 'ILUMINAÇÃO E BATERIAS', precoVenda: 25.0, codigoFabricante: 'Universal' },
  { referencia: 'LGT-MASTER1', descricao: 'Unidade de Luz Master 1', categoria: 'ILUMINAÇÃO E BATERIAS', precoVenda: 40.0, codigoFabricante: 'Universal' },
  { referencia: 'BAT-MASTER1-KIT', descricao: 'Kit Luz Master 1 (Unid + Bat)', categoria: 'ILUMINAÇÃO E BATERIAS', precoVenda: 60.0, codigoFabricante: 'Universal' },
  { referencia: 'HRU-HAMMAR-H20', descricao: 'Disparador Hidrostático Hammar H20', categoria: 'MECÂNICA E SISTEMAS DE DISPARO', precoVenda: 65.0, codigoFabricante: 'Hammar' },
  { referencia: 'VAL-THAN-OTS65', descricao: 'Válvula Sobrepressão Thanner OTS65', categoria: 'MECÂNICA E SISTEMAS DE DISPARO', precoVenda: 85.0, codigoFabricante: 'Thanner' },
  { referencia: 'VAL-LEAF-A10', descricao: 'Válvula de Alívio Leafield A10 (Alta vazão)', categoria: 'MECÂNICA E SISTEMAS DE DISPARO', precoVenda: 48.0, codigoFabricante: 'Leafield Marine' },
  { referencia: 'VAL-LEAF-A6', descricao: 'Válvula de Alívio Leafield A6', categoria: 'MECÂNICA E SISTEMAS DE DISPARO', precoVenda: 42.0, codigoFabricante: 'Leafield Marine' },
  { referencia: 'VAL-LEAF-C7D7', descricao: 'Válvula de Serviço Leafield C7/D7', categoria: 'MECÂNICA E SISTEMAS DE DISPARO', precoVenda: 38.0, codigoFabricante: 'Leafield Marine' },
  { referencia: 'LEAF-HD-W', descricao: 'Cabeça de Disparo Leafield GIST (Branca)', categoria: 'CABEÇAS DE DISPARO', precoVenda: 120.0, codigoFabricante: 'Leafield Marine' },
  { referencia: 'LEAF-HD-B', descricao: 'Cabeça de Disparo Leafield GIST (Preta)', categoria: 'CABEÇAS DE DISPARO', precoVenda: 0.0, codigoFabricante: 'Leafield Marine' },
  { referencia: 'HEAD-THANNER-DK88', descricao: 'Cabeça de Disparo Thanner DK88', categoria: 'CABEÇAS DE DISPARO', precoVenda: 0.0, codigoFabricante: 'Thanner' },
  { referencia: 'HEAD-THANNER-DK94', descricao: 'Cabeça de Disparo Thanner DK94', categoria: 'CABEÇAS DE DISPARO', precoVenda: 0.0, codigoFabricante: 'Thanner' },
  { referencia: 'HEAD-UML-MK5', descricao: 'Cabeça/Inflador UML MK5', categoria: 'CABEÇAS DE DISPARO', precoVenda: 0.0, codigoFabricante: 'UML' },
  { referencia: 'HEAD-UML-PRO-ELITE', descricao: 'Cabeça/Inflador UML Pro Sensor Elite', categoria: 'CABEÇAS DE DISPARO', precoVenda: 0.0, codigoFabricante: 'UML' },
  { referencia: 'HEAD-HAMMAR-MA1', descricao: 'Cabeça/Disparo Hammar MA1', categoria: 'CABEÇAS DE DISPARO', precoVenda: 0.0, codigoFabricante: 'Hammar' },
  { referencia: 'HEAD-LALIZAS-JS1', descricao: 'Cabeça/Disparo Lalizas JS1', categoria: 'CABEÇAS DE DISPARO', precoVenda: 0.0, codigoFabricante: 'Lalizas' },
  { referencia: 'CYL-CO2-4L', descricao: 'Cilindro CO2 4L (Corpo Vazio)', categoria: 'MECÂNICA E SISTEMAS DE DISPARO', precoVenda: 150.0, codigoFabricante: 'Universal' },
  { referencia: 'GAS-REFILL-CO2', descricao: 'Recarga de Gás CO2 (por Kg)', categoria: 'MECÂNICA E SISTEMAS DE DISPARO', precoVenda: 12.0, codigoFabricante: 'Universal' },
  { referencia: FOOD_RATIONS_STOCK_REFERENCE, descricao: 'Ração de Comida 500g (Val. 5 Anos)', categoria: 'SOBREVIVÊNCIA E CONSUMÍVEIS', precoVenda: 14.0, codigoFabricante: 'SOLAS' },
  { referencia: DRINKING_WATER_STOCK_REFERENCE, descricao: 'Água Potável 500ml (Val. 5 Anos)', categoria: 'SOBREVIVÊNCIA E CONSUMÍVEIS', precoVenda: 2.5, codigoFabricante: 'SOLAS' },
  { referencia: 'MED-KIT-SOLAS', descricao: 'Kit Primeiros Socorros SOLAS Completo', categoria: 'SOBREVIVÊNCIA E CONSUMÍVEIS', precoVenda: 55.0, codigoFabricante: 'SOLAS' },
  { referencia: 'MED-KIT-ISO', descricao: 'Kit Primeiros Socorros ISO Completo', categoria: 'SOBREVIVÊNCIA E CONSUMÍVEIS', precoVenda: 48.0, codigoFabricante: 'ISO' },
  { referencia: 'TAB-SICKNESS', descricao: 'Pastilhas Enjoo (Pack 10 un.)', categoria: 'SOBREVIVÊNCIA E CONSUMÍVEIS', precoVenda: 8.0, codigoFabricante: 'Universal' },
  { referencia: 'BAG-SICKNESS', descricao: 'Saco de Vómito (Pack)', categoria: 'SOBREVIVÊNCIA E CONSUMÍVEIS', precoVenda: 3.5, codigoFabricante: 'Universal' },
  { referencia: 'THERM-BLANKET', descricao: 'Manta Térmica de Sobrevivência', categoria: 'SOBREVIVÊNCIA E CONSUMÍVEIS', precoVenda: 12.0, codigoFabricante: 'Universal' },
  { referencia: 'THER-BLANKET-TPA', descricao: 'Manta Térmica de Alta Proteção (TPA)', categoria: 'SOBREVIVÊNCIA E CONSUMÍVEIS', precoVenda: 16.0, codigoFabricante: 'SOLAS/ISO' },
  { referencia: 'FISH-KIT', descricao: 'Kit de Pesca de Sobrevivência', categoria: 'SOBREVIVÊNCIA E CONSUMÍVEIS', precoVenda: 9.5, codigoFabricante: 'SOLAS/ISO' },
  { referencia: 'HELIOGRAPH', descricao: 'Heliógrafo / Espelho de Sinalização', categoria: 'SOBREVIVÊNCIA E CONSUMÍVEIS', precoVenda: 7.0, codigoFabricante: 'SOLAS/ISO' },
  { referencia: '20909295', descricao: 'Lanterna com Luz e Pilhas Alcalinas sobressalentes', categoria: 'ILUMINAÇÃO E BATERIAS', precoVenda: 23.95, codigoFabricante: 'MM309' },
  { referencia: 'DROGUE-ANCHOR', descricao: 'Âncora Flutuante (Drogue)', categoria: 'SOBREVIVÊNCIA E CONSUMÍVEIS', precoVenda: 22.0, codigoFabricante: 'SOLAS/ISO' },
  { referencia: 'WHISTLE-SOLAS', descricao: 'Apito SOLAS', categoria: 'SOBREVIVÊNCIA E CONSUMÍVEIS', precoVenda: 2.0, codigoFabricante: 'SOLAS' },
  { referencia: 'KNIFE-FLOATING', descricao: 'Faca Flutuante de Segurança', categoria: 'SOBREVIVÊNCIA E CONSUMÍVEIS', precoVenda: 11.0, codigoFabricante: 'SOLAS/ISO' },
  { referencia: 'MANUAL-SURVIVAL', descricao: 'Manual de Sobrevivência (Multilíngue)', categoria: 'SOBREVIVÊNCIA E CONSUMÍVEIS', precoVenda: 9.0, codigoFabricante: 'SOLAS/ISO' },
  { referencia: 'CARD-SALVAGE-SIGNALS', descricao: 'Tabela de Sinais de Salvamento (Cartão Plastificado)', categoria: 'SOBREVIVÊNCIA E CONSUMÍVEIS', precoVenda: 6.0, codigoFabricante: 'SOLAS/ISO' },
  { referencia: 'REPAIR-KIT-PLUGS', descricao: 'Kit de Reparação e Tampões para Furos', categoria: 'MANUTENÇÃO E ETIQUETAGEM', precoVenda: 32.0, codigoFabricante: 'SOLAS/ISO' },
  { referencia: '08211009R', descricao: 'Disparador hidrostático HRU para jangadas', categoria: 'MECÂNICA E SISTEMAS DE DISPARO', precoVenda: 65.0, codigoFabricante: 'Survitec' },
  { referencia: 'SEAL-WIRE-BLUE', descricao: 'Selo de Arame Azul (Unidade)', categoria: 'MANUTENÇÃO E ETIQUETAGEM', precoVenda: 0.5, codigoFabricante: 'Universal' },
  { referencia: 'TAPE-DONOTCUT', descricao: 'Fita Do Not Cut (Rolo 50m)', categoria: 'MANUTENÇÃO E ETIQUETAGEM', precoVenda: 15.0, codigoFabricante: 'Universal' },
  { referencia: 'GLUE-NEOPRENE', descricao: 'Cola Neoprene Técnica 1L', categoria: 'MANUTENÇÃO E ETIQUETAGEM', precoVenda: 22.0, codigoFabricante: 'Universal' },
  { referencia: 'MULTI-LABEL-SM4', descricao: 'Folha Multi-Etiquetas Surviva MK4', categoria: 'MANUTENÇÃO E ETIQUETAGEM', precoVenda: 18.0, codigoFabricante: 'Survitec' },
  { referencia: 'SYS-LEAF-GIST', descricao: 'Sistema de Insuflação Leafield Marine GIST', categoria: 'SISTEMAS DE INSUFLAÇÃO', precoVenda: 0.0, codigoFabricante: 'Leafield Marine' },
  { referencia: 'SYS-THANNER', descricao: 'Sistema de Insuflação THANNER', categoria: 'SISTEMAS DE INSUFLAÇÃO', precoVenda: 0.0, codigoFabricante: 'Thanner' },
  { referencia: 'SYS-NSS', descricao: 'Sistema de Insuflação NSS (New Safety System)', categoria: 'SISTEMAS DE INSUFLAÇÃO', precoVenda: 0.0, codigoFabricante: 'Sea-Safe/Eurovinil' },
  { referencia: 'SYS-VTE', descricao: 'Sistema de Insuflação VTE (VTE99/VTE87)', categoria: 'SISTEMAS DE INSUFLAÇÃO', precoVenda: 0.0, codigoFabricante: 'Survitec/Eurovinil' },
  { referencia: 'SYS-HSR-OH-III', descricao: 'Sistema de Insuflação HSR-OH-III', categoria: 'SISTEMAS DE INSUFLAÇÃO', precoVenda: 0.0, codigoFabricante: 'Lalizas' },
  { referencia: 'VAL-AQF-5-100', descricao: 'Válvula AQF-5-100', categoria: 'MECÂNICA E SISTEMAS DE DISPARO', precoVenda: 0.0, codigoFabricante: 'Lalizas' },
  { referencia: 'VAL-71891', descricao: 'Válvula 71891', categoria: 'MECÂNICA E SISTEMAS DE DISPARO', precoVenda: 0.0, codigoFabricante: 'Lalizas' },
  { referencia: 'CYL-71863-71867', descricao: 'Cilindros série 71863-71867', categoria: 'MECÂNICA E SISTEMAS DE DISPARO', precoVenda: 0.0, codigoFabricante: 'Lalizas' },
  { referencia: 'SYS-HALKEY-ROBERTS', descricao: 'Sistema de Insuflação Halkey-Roberts', categoria: 'SISTEMAS DE INSUFLAÇÃO', precoVenda: 0.0, codigoFabricante: 'Halkey-Roberts' },
  { referencia: 'CONN-CYL-YOKE', descricao: 'Cylinder Valve (Yoke)', categoria: 'COMPONENTES CRÍTICOS DE CONEXÃO', precoVenda: 0.0, codigoFabricante: 'Leafield Marine' },
  { referencia: 'CONN-CYL-THREADED', descricao: 'Cylinder Valve (Threaded)', categoria: 'COMPONENTES CRÍTICOS DE CONEXÃO', precoVenda: 0.0, codigoFabricante: 'Thanner/NSS' },
  { referencia: 'CONN-M24-NUT', descricao: 'M24 Nut', categoria: 'COMPONENTES CRÍTICOS DE CONEXÃO', precoVenda: 0.0, codigoFabricante: 'Universal' },
  { referencia: 'CONN-M16', descricao: 'M16 Connector', categoria: 'COMPONENTES CRÍTICOS DE CONEXÃO', precoVenda: 0.0, codigoFabricante: 'Universal' },
  
  // Spare Parts LR97
  { referencia: '0.09.05.32.0', descricao: 'Directions for the Repair of Rubber Dinghies', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '0.09.13.82.0', descricao: 'Testing and closing plug for Thanner cylinder valve', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '0.11.06.77.0', descricao: 'Three-square pin spanner for penetration membrane', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '0.07.24.17.0', descricao: 'Special filling head for Thanner cylinder valve', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '0.07.24.15.0', descricao: 'Resetting tool for DK 94 operating head', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '0.07.24.85.0', descricao: 'Red protection cap (replacement)', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '0.08.01.76.0', descricao: 'Protecting cap no. 30, red (outer thread 3/8")', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '0.08.01.75.0', descricao: 'Thread adapter M 30 x 1,5', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '0.08.11.14.0', descricao: 'Valve upper part OTS 65 (yellow)', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '0.08.11.15.0', descricao: 'Valve upper part OTS 65 (red)', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '0.08.10.08.0', descricao: 'Cap with sealing flange', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '8.11.06.83.0', descricao: 'Ballast case for inside LR97 L 12-16 persons', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '8.11.06.85.0', descricao: 'Ballast case LR97 L 12 persons', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '8.11.06.84.0', descricao: 'Ballast case LR97 L 16 persons', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '8.11.06.81.0', descricao: 'Ballast case LR97 L 20 persons', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '8.11.06.82.0', descricao: 'Ballast case LR97 L 25 persons', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '8.07.33.04.0', descricao: 'Inflate/deflate adaptor with green cap', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '0.03.03.17.0', descricao: 'Closing straps PP (packed 50 pieces)', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '0.03.03.18.0', descricao: 'Closing straps PP (packed 100 pieces)', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '0.03.03.16.0', descricao: 'Closing strap complete with hand loop (packed 50)', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '8.03.03.36.0', descricao: 'Ripping up loop complete (packed 10 pieces)', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '0.11.06.00.0', descricao: 'ST-D Tensioner tool', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '0.11.06.01.0', descricao: 'Sealing tool', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '0.11.06.02.0', descricao: 'Feedwheels for ST-D Tensioner (2 pieces)', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '8.07.25.29.0', descricao: 'Cradle type 6/8', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '8.07.25.30.0', descricao: 'Cradle type 10/12', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '8.07.25.31.0', descricao: 'Cradle type 16/20', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '8.07.25.32.0', descricao: 'Cradle type 25', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '8.03.03.84.0', descricao: 'Lashing for container 4N / 6/8 F', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '8.03.03.85.0', descricao: 'Lashing for container 10/12 F and larger', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'DSB' },
  { referencia: '0.07.10.29.0', descricao: 'Thanner DK 84 weak link 300-696', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'Thanner' },
  { referencia: '0.07.10.31.0', descricao: 'Thanner DK 84.1 weak link 10-057', categoria: 'Jangada LR97', precoVenda: 0.0, codigoFabricante: 'Thanner' },
];

const ASSOCIACOES = [
  { marcas: ['ZODIAC'], modelos: ['COASTAL', 'PROPECHE CLV/CLVI', 'MOR', 'TO', 'TO SR', 'MKIV'], refs: ['SYS-THANNER', 'SYS-LEAF-GIST', 'VAL-THAN-OTS65', 'VAL-LEAF-A6', 'LEAF-HD-W', 'CYL-CO2-4L', 'GAS-REFILL-CO2'] },
  { marcas: ['RFD'], modelos: ['SEASAVA PLUS', 'SEASAVA PRO-ISO', 'SURVIVA MKII', 'SURVIVA MKIII', 'SURVIVA MKIV', 'FERRYMAN'], refs: ['SYS-THANNER', 'SYS-LEAF-GIST', 'SYS-VTE', 'VAL-THAN-OTS65', 'LEAF-HD-W', 'HEAD-THANNER-DK88', 'LGT-RL5-INT', 'LGT-RL5-EXT', 'BAT-RL5-LITH', 'LGT-RL6-INT', 'LGT-RL6-EXT', 'BAT-RL6-LITH', 'LGT-RL6-KIT'] },
  { marcas: ['DSB'], modelos: ['LR97', 'LR97 L', 'LR05', 'LR07'], refs: ['SYS-THANNER', 'SYS-LEAF-GIST', 'VAL-THAN-OTS65', 'VAL-LEAF-A10', 'VAL-LEAF-C7D7', 'LEAF-HD-W', 'HEAD-THANNER-DK94', 'LGT-RL5-INT', 'LGT-RL5-EXT', 'BAT-RL5-LITH', 'LGT-RL6-INT', 'LGT-RL6-EXT', 'BAT-RL6-LITH', 'LGT-RL6-KIT', 'BAT-RB2', 'BAT-MASTER1', 'LGT-MASTER1', 'LGT-MASTER1-KIT', '0.09.05.32.0', '0.09.13.82.0', '0.11.06.77.0', '0.07.24.17.0', '0.07.24.15.0', '0.07.24.85.0', '0.08.01.76.0', '0.08.01.75.0', '0.08.11.14.0', '0.08.11.15.0', '0.08.10.08.0', '8.11.06.83.0', '8.11.06.85.0', '8.11.06.84.0', '8.11.06.81.0', '8.11.06.82.0', '8.07.33.04.0', '0.03.03.17.0', '0.03.03.18.0', '0.03.03.16.0', '8.03.03.36.0', '0.11.06.00.0', '0.11.06.01.0', '0.11.06.02.0', '8.07.25.29.0', '8.07.25.30.0', '8.07.25.31.0', '8.07.25.32.0', '8.03.03.84.0', '8.03.03.85.0', '0.07.10.29.0', '0.07.10.31.0'] },
  { marcas: ['LALIZAS'], modelos: ['ISO-RAFT', 'LEISURE-RAFT', 'LEISURE RAFT', 'LIFERAFT LEISURE-RAFT', 'LALIZAS LEISURE-RAFT', 'CHARTER', 'OFFSHORE', 'SOLAS LIFE RAFT'], refs: ['SYS-HSR-OH-III', 'HEAD-LALIZAS-JS1', 'VAL-AQF-5-100', 'VAL-71891', 'CYL-71863-71867'] },
  { marcas: ['PLASTIMO'], modelos: ['CRUISER', 'TRANSOCEAN ISO 9650-1', 'OFFSHORE'], refs: ['CONN-CYL-THREADED'] },
  { marcas: ['SEA-SAFE', 'EUROVINIL'], modelos: ['PRO-LIGHT', 'ISO 9650-1', 'LEISURE SYNTESY'], refs: ['SYS-NSS', 'SYS-VTE'] },
  { marcas: ['ZODIAC', 'RFD', 'DSB', 'LALIZAS', 'PLASTIMO', 'SEA-SAFE', 'EUROVINIL'], modelos: ['COASTAL', 'MKIV', 'FERRYMAN', 'ISO-RAFT', 'LEISURE-RAFT', 'LEISURE RAFT', 'LIFERAFT LEISURE-RAFT', 'LALIZAS LEISURE-RAFT', 'OFFSHORE'], refs: ['PYR-ROCKET-RED', 'PYR-FLARE-RED', 'PYR-SMOKE-ORANGE', 'PYR-ROCKET-WHITE', FOOD_RATIONS_STOCK_REFERENCE, DRINKING_WATER_STOCK_REFERENCE, 'MED-KIT-SOLAS', 'MED-KIT-ISO', 'TAB-SICKNESS', 'BAG-SICKNESS', 'THERM-BLANKET', 'THER-BLANKET-TPA', 'FISH-KIT', 'HELIOGRAPH', '20909295', 'DROGUE-ANCHOR', 'WHISTLE-SOLAS', 'KNIFE-FLOATING', 'MANUAL-SURVIVAL', 'CARD-SALVAGE-SIGNALS', 'REPAIR-KIT-PLUGS', 'HRU-HAMMAR-H20', '08211009R', 'GLUE-NEOPRENE', 'TAPE-DONOTCUT'] },
];

function buildAssocMap() {
  const map = new Map();
  for (const regra of ASSOCIACOES) {
    for (const refRaw of regra.refs) {
      const ref = String(refRaw).trim().toUpperCase();
      if (!ref) continue;
      if (!map.has(ref)) map.set(ref, { marcas: new Set(), modelos: new Set() });
      const bucket = map.get(ref);
      for (const marca of regra.marcas || []) bucket.marcas.add(String(marca).trim());
      for (const modelo of regra.modelos || []) bucket.modelos.add(String(modelo).trim());
    }
  }
  return map;
}

async function seedStock() {
  const assocMap = buildAssocMap();
  const allItems = [...BASE_STOCK_ITEMS, ...CATALOGO_STOCK];

  let created = 0;
  let updated = 0;

  for (const item of allItems) {
    const referencia = String(item.referencia || '').trim().toUpperCase();
    const assoc = assocMap.get(referencia);

    const data = {
      referencia,
      descricao: item.descricao,
      categoria: normalizeStockCategory(item.categoria, item.descricao),
      associavelJangada: true,
      aplicavelMarcaJangada: assoc ? Array.from(assoc.marcas).sort((a, b) => a.localeCompare(b, 'pt')).join(', ') : null,
      aplicavelModeloJangada: assoc ? Array.from(assoc.modelos).sort((a, b) => a.localeCompare(b, 'pt')).join(', ') : null,
      codigoFabricante: item.codigoFabricante || null,
      precoVenda: Number(item.precoVenda ?? 0) || 0,
      quantidade: Number(item.quantidade ?? 0) || 0,
    };

    const existing = await prisma.stock.findUnique({ where: { referencia } });
    if (!existing) {
      await prisma.stock.create({ data });
      created += 1;
    } else {
      await prisma.stock.update({ where: { referencia }, data });
      updated += 1;
    }
  }

  console.log('Stock seed Prisma concluído.');
  console.log(`Total itens processados: ${allItems.length}`);
  console.log(`Criados: ${created}`);
  console.log(`Atualizados: ${updated}`);
}

if (require.main === module) {
  seedStock()
    .catch((error) => {
      console.error('Error seeding stock:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { seedStock };
