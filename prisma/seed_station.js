const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const stationCode = process.argv[2];
if (!stationCode) {
  console.error('Usage: node prisma/seed_station.js <STATION_CODE>');
  process.exit(1);
}

const STATION_CONFIG = {
  AVELEDA: {
    nome: 'Aveleda',
    empresa: 'Orey',
    localizacao: 'Aveleda',
    territorioTipo: 'MAINLAND',
    regiaoOperacional: 'NORTE',
    presets: { name: 'Orey Técnica Norte - Aveleda', slug: 'oreynorte' },
    tecnicos: [
      { nome: 'Ricardo Silva', email: 'ricardo.silva@orey.com', password: 'orelhas', admin: true },
      { nome: 'Willian Ribeiro', email: 'willian.ribeiro@orey.com', password: 'orelhas' },
      { nome: 'Cristiano Gomes', email: 'cristiano.gomes@orey.com', password: 'orelhas' },
      { nome: 'Henrique Cardoso', email: 'henrique.cardoso@orey.com', password: 'orelhas' },
    ],
    contactosInternos: [
      { categoria: 'Colaborador', empresa: 'Orey', localizacao: 'Aveleda', nome: 'Ricardo Silva', email: 'ricardo.silva@orey.com', telemovel: '912345001' },
      { categoria: 'Colaborador', empresa: 'Orey', localizacao: 'Aveleda', nome: 'Willian Ribeiro', email: 'willian.ribeiro@orey.com', telemovel: '912345002' },
      { categoria: 'Colaborador', empresa: 'Orey', localizacao: 'Aveleda', nome: 'Cristiano Gomes', email: 'cristiano.gomes@orey.com', telemovel: '912345004' },
      { categoria: 'Colaborador', empresa: 'Orey', localizacao: 'Aveleda', nome: 'Henrique Cardoso', email: 'henrique.cardoso@orey.com', telemovel: '912345005' },
    ],
    clientes: [
      { nome: 'Pesca Norte Lda', nif: '501234567', email: 'geral@pescanorte.pt', telmovel: '912345001', localidade: 'Póvoa de Varzim', tipoCliente: 'armador' },
      { nome: 'Navipescas SA', nif: '502345678', email: 'info@navipescas.pt', telmovel: '912345002', localidade: 'Matosinhos', tipoCliente: 'armador' },
    ],
    navios: [
      { nome: 'Mar Bravo', matricula: 'PO-1234-L', ilha: 'Norte', tipoPesca: 'Arrasto', portoRegisto: 'Póvoa de Varzim', nifCliente: '501234567' },
      { nome: 'Costa Verde', matricula: 'MAT-5678', ilha: 'Norte', tipoPesca: 'Cerco', portoRegisto: 'Matosinhos', nifCliente: '501234567' },
      { nome: 'Atlântico Sul', matricula: 'PO-9012-L', ilha: 'Norte', tipoPesca: 'Arrasto', portoRegisto: 'Póvoa de Varzim', nifCliente: '502345678' },
    ],
    jangadas: [
      { brand: 'Zodiac', model: 'SOLAS A', serial: 'ZD-2024-001', dataFabrico: '2024-03-15', packType: 'Valise', capacity: 10, owner: 'Pesca Norte Lda', shipNameManual: 'Mar Bravo', dataInspecao: '2025-01-10', dataProxInspecao: '2026-01-10' },
      { brand: 'Viking', model: 'SOLAS B', serial: 'VK-2024-002', dataFabrico: '2024-06-20', packType: 'Valise', capacity: 16, owner: 'Navipescas SA', shipNameManual: 'Atlântico Sul', dataInspecao: '2025-03-05', dataProxInspecao: '2026-03-05' },
      { brand: 'Plastimo', model: 'ISO 9650-1', serial: 'PL-2023-001', dataFabrico: '2023-09-01', packType: 'Contentor', capacity: 8, owner: 'Pesca Norte Lda', shipNameManual: 'Costa Verde' },
    ],
    coletes: [
      { serial: 'COL-AVD-001', marca: 'Lalizas', modelo: 'Crew 150N', tamanho: 'M', dataFabrico: '2023-06-01', dataInspecao: '2025-01-15', dataProxInspecao: '2026-01-15', estado: 'Ativo', testePressao: 'OK', testeInsuflacao: 'OK', testeVazamento: 'OK', cilindroRef: 'CIL-001', cilindroValidade: '2026-06' },
      { serial: 'COL-AVD-002', marca: 'Lalizas', modelo: 'Crew 100N', tamanho: 'L', dataFabrico: '2023-08-15', estado: 'Ativo', cilindroRef: 'CIL-001', cilindroValidade: '2026-08' },
      { serial: 'COL-AVD-003', marca: 'Plastimo', modelo: 'ISO 12402', tamanho: 'M', dataFabrico: '2024-02-01', estado: 'Ativo' },
    ],
    epirbs: [
      { serial: 'EPI-AVD-001', marca: 'Jotron', modelo: 'Tron 40S', tipo: 'GPS', hexId: '1A2B3C4D5E6F', dataInspecao: '2025-02-01', dataProxInspecao: '2026-02-01', dataValidadeBateria: '2027-02-01', ownerName: 'Pesca Norte Lda', estado: 'Ativo', shipNameManual: 'Mar Bravo' },
      { serial: 'EPI-AVD-002', marca: 'McMurdo', modelo: 'R5', tipo: 'GPS', hexId: '2B3C4D5E6F7A', dataValidadeBateria: '2027-06-01', ownerName: 'Navipescas SA', estado: 'Ativo', shipNameManual: 'Atlântico Sul' },
    ],
  },
  ALCATARILHA: {
    nome: 'Alcatarilha',
    empresa: 'Orey',
    localizacao: 'Alcatarilha',
    territorioTipo: 'MAINLAND',
    regiaoOperacional: 'SUL',
    presets: { name: 'Orey Técnica Algarve - Alcantarilha', slug: 'oreyalgarve' },
    tecnicos: [
      { nome: 'Alvaro Silva', email: 'alvaro.silva@orey.com', password: 'orelhas', admin: true },
      { nome: 'João Silvestre', email: 'joao.silvestre@orey.com', password: 'orelhas', admin: true },
    ],
    contactosInternos: [
      { categoria: 'Colaborador', empresa: 'Orey', localizacao: 'Alcatarilha', nome: 'Manuel Silva', email: 'manuel.silva@orey.com', telemovel: '912345101' },
      { categoria: 'Administrador', empresa: 'Orey', localizacao: 'Alcatarilha', nome: 'Alvaro Silva', email: 'alvaro.silva@orey.com', telemovel: '912345102' },
      { categoria: 'Administrador', empresa: 'Orey', localizacao: 'Alcatarilha', nome: 'João Silvestre', email: 'joao.silvestre@orey.com', telemovel: '912345103' },
    ],
    clientes: [
      { nome: 'Marisul Lda', nif: '503456789', email: 'marisul@email.pt', telmovel: '912345003', localidade: 'Portimão', tipoCliente: 'armador' },
      { nome: 'Pescas Algarve Lda', nif: '504567890', email: 'pescas.algarve@email.pt', telmovel: '912345004', localidade: 'Olhão', tipoCliente: 'armador' },
    ],
    navios: [
      { nome: 'Costa Sul', matricula: 'PRT-3456', ilha: 'Algarve', tipoPesca: 'Cerco', portoRegisto: 'Portimão', nifCliente: '503456789' },
      { nome: 'Mar Algarvio', matricula: 'OLH-7890', ilha: 'Algarve', tipoPesca: 'Arrasto', portoRegisto: 'Olhão', nifCliente: '504567890' },
    ],
    jangadas: [
      { brand: 'Lalizas', model: 'COASTAL', serial: 'LZ-2024-003', dataFabrico: '2024-01-10', packType: 'Mochila', capacity: 6, owner: 'Marisul Lda', shipNameManual: 'Costa Sul' },
      { brand: 'DSB', model: 'SOLAS A', serial: 'DSB-2024-004', dataFabrico: '2024-05-30', packType: 'Valise', capacity: 12, owner: 'Pescas Algarve Lda', shipNameManual: 'Mar Algarvio', dataInspecao: '2025-02-20', dataProxInspecao: '2026-02-20' },
      { brand: 'Eurovinil', model: 'ISO 9650-2', serial: 'EV-2023-002', dataFabrico: '2023-11-20', packType: 'Contentor', capacity: 8, owner: 'Marisul Lda', shipNameManual: 'Costa Sul' },
    ],
    coletes: [
      { serial: 'COL-ALC-001', marca: 'Lalizas', modelo: 'Seasava Plus', tamanho: 'M', dataFabrico: '2024-01-10', dataInspecao: '2025-03-01', dataProxInspecao: '2026-03-01', estado: 'Ativo', testePressao: 'OK', testeInsuflacao: 'OK', cilindroRef: 'CIL-002', cilindroValidade: '2026-09' },
      { serial: 'COL-ALC-002', marca: 'Plastimo', modelo: 'Crew 150N', tamanho: 'L', dataFabrico: '2024-04-01', estado: 'Ativo' },
    ],
    epirbs: [
      { serial: 'EPI-ALC-001', marca: 'Ocean Signal', modelo: 'EPIRB3', tipo: 'GPS', hexId: '3C4D5E6F7A8B', dataInspecao: '2025-01-15', dataProxInspecao: '2026-01-15', dataValidadeBateria: '2028-01-15', ownerName: 'Marisul Lda', estado: 'Ativo', shipNameManual: 'Costa Sul' },
    ],
  },
};

const config = STATION_CONFIG[stationCode];
if (!config) {
  console.error(`Estação desconhecida: ${stationCode}`);
  process.exit(1);
}

const QUADRO_ARTIGOS_BASE = [
  'Pá de remo', 'Esponja', 'Apito', 'Faca flutuante', 'Kit de reparação',
  'Luz flutuante', 'Luz interior', 'Luz de localização', 'Espelho de sinalização',
  'Bússola', 'Saco de água', 'Rações', 'Água potável', 'Saco de enjoo',
  'Manual de sobrevivência', 'Manual de sinais', 'Kit de primeiros socorros',
  'Fogos de mão', 'Sinal fumígeno', 'Sinal foguete', 'Âncora flutuante',
  'Linha de amarração', 'Linha de lançamento', 'Caneca', 'Cobertura térmica',
  'Bolsa de acessórios', 'Balde', 'Esponja absorvente', 'Cordão de segurança',
  'Outros',
];

async function main() {
  console.log(`A semear dados para ${stationCode}...`);

  // Service Station
  const station = await prisma.serviceStation.upsert({
    where: { codigo: stationCode },
    update: { nome: config.nome, empresa: config.empresa, localizacao: config.localizacao, territorioTipo: config.territorioTipo, regiaoOperacional: config.regiaoOperacional, ativo: true },
    create: { codigo: stationCode, nome: config.nome, empresa: config.empresa, localizacao: config.localizacao, territorioTipo: config.territorioTipo, regiaoOperacional: config.regiaoOperacional, ativo: true },
  });
  console.log(`  Estação ${station.nome} (ID ${station.id}) OK`);

  // Admin user local
  const hashedPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@local' },
    update: { name: 'Admin Local', role: 'ADMIN', passwordHash: hashedPassword },
    create: { email: 'admin@local', name: 'Admin Local', role: 'ADMIN', passwordHash: hashedPassword },
  });
  console.log('  Admin user: admin@local / admin123');

  // Tecnicos + Users
  for (const t of config.tecnicos) {
    await prisma.tecnico.upsert({
      where: { email: t.email },
      update: { nome: t.nome, serviceStationId: station.id, ativo: true },
      create: { nome: t.nome, email: t.email, serviceStationId: station.id, ativo: true },
    });

    const role = t.admin ? 'ADMIN' : 'USER';
    await prisma.user.upsert({
      where: { email: t.email },
      update: { name: t.nome, role },
      create: { email: t.email, name: t.nome, role, passwordHash: await bcrypt.hash(t.password, 10) },
    });

    if (t.admin) {
      await prisma.user.update({
        where: { email: t.email },
        data: { permissionsOverrideJson: JSON.stringify({ allowedStationCodes: [stationCode] }) },
      });
    }
  }
  console.log(`  ${config.tecnicos.length} técnicos/users OK`);

  // Catálogo
  const coletePairs = [
    ['Lalizas', 'ISO 12402'], ['Lalizas', 'Crew 150N'], ['Lalizas', 'Crew 100N'],
    ['Lalizas', 'Automatic'], ['Lalizas', 'Manual'], ['Lalizas', 'Crewfit 150N'],
    ['Lalizas', 'Seasava'], ['Lalizas', 'Seasava Plus'], ['Lalizas', 'Pro 150N'],
    ['Plastimo', 'ISO 12402'], ['Plastimo', 'Crew 150N'], ['Plastimo', 'Automatic'],
    ['Plastimo', 'Manual'], ['Plastimo', 'Crewfit 150N'], ['Plastimo', 'Seasava'],
  ];
  for (const [marca, modelo] of coletePairs) {
    try { await prisma.catalogMarcaModelo.create({ data: { tipo: 'COLETE', marca, modelo } }); } catch {}
  }
  const jangadaBrands = ['Zodiac', 'Viking', 'Plastimo', 'Lalizas', 'DSB', 'Eurovinil', 'RFG', 'Bombard', 'Avon', 'Beaufort'];
  const jangadaModels = ['SOLAS A', 'SOLAS B', 'ISO 9650-1', 'ISO 9650-2', 'COASTAL', 'OCEAN'];
  for (const marca of jangadaBrands) {
    for (const modelo of jangadaModels) {
      try { await prisma.catalogMarcaModelo.create({ data: { tipo: 'JANGADA', marca, modelo } }); } catch {}
    }
  }
  console.log('  Catálogo OK');

  // Stock checklist (global, sem station)
  for (const [i, name] of QUADRO_ARTIGOS_BASE.entries()) {
    const existing = await prisma.stock.findFirst({ where: { referencia: `CHK${i + 1}`, serviceStationId: null } });
    if (!existing) {
      await prisma.stock.create({
        data: { referencia: `CHK${i + 1}`, descricao: name, categoria: 'Checklist', associavelJangada: true, precoCompra: 0, precoVenda: 0, quantidade: 0 },
      });
    }
  }

  // Stock específico da estação
  const stockItems = [
    { ref: 'CIL-001', desc: 'Cilindro CO2 2kg', cat: 'Cilindros', qty: 5, pCompra: 45, pVenda: 75 },
    { ref: 'CIL-002', desc: 'Cilindro CO2 3kg', cat: 'Cilindros', qty: 3, pCompra: 55, pVenda: 90 },
    { ref: 'PAS-001', desc: 'Pastilha CO2 33g', cat: 'Pastilhas', qty: 20, pCompra: 8, pVenda: 15 },
    { ref: 'LUZ-001', desc: 'Luz flutuante LED', cat: 'Iluminação', qty: 10, pCompra: 12, pVenda: 25 },
    { ref: 'API-001', desc: 'Apito plástico', cat: 'Sinalização', qty: 30, pCompra: 2, pVenda: 5 },
    { ref: 'MAN-001', desc: 'Manual sobrevivência', cat: 'Documentação', qty: 8, pCompra: 5, pVenda: 12 },
    { ref: 'FAC-001', desc: 'Faca flutuante', cat: 'Ferramentas', qty: 6, pCompra: 15, pVenda: 30 },
  ];
  for (const item of stockItems) {
    await prisma.stock.upsert({
      where: { referencia_serviceStationId: { referencia: item.ref, serviceStationId: station.id } },
      update: { descricao: item.desc, categoria: item.cat, quantidade: item.qty, precoCompra: item.pCompra, precoVenda: item.pVenda },
      create: { referencia: item.ref, descricao: item.desc, categoria: item.cat, quantidade: item.qty, precoCompra: item.pCompra, precoVenda: item.pVenda, serviceStationId: station.id, estadoArtigo: 'ATIVO', associavelJangada: true },
    });
  }
  console.log('  Stock OK');

  // ContactosInternos
  if (config.contactosInternos) {
    for (const c of config.contactosInternos) {
      await prisma.contactoInterno.create({ data: c }).catch(() => {});
    }
    console.log(`  ${config.contactosInternos.length} contactos internos OK`);
  }

  // Clientes
  for (const c of config.clientes) {
    await prisma.cliente.upsert({
      where: { nif: c.nif },
      update: { ...c, serviceStationId: station.id },
      create: { ...c, serviceStationId: station.id },
    });
  }
  console.log(`  ${config.clientes.length} clientes OK`);

  // Navios
  const clientes = await prisma.cliente.findMany();
  const clienteByNif = Object.fromEntries(clientes.map(c => [c.nif, c]));
  for (const n of config.navios) {
    await prisma.navio.create({
      data: {
        nome: n.nome, matricula: n.matricula, ilha: n.ilha, tipoPesca: n.tipoPesca,
        portoRegisto: n.portoRegisto, clienteId: clienteByNif[n.nifCliente]?.id || null,
        serviceStationId: station.id, ativo: true,
      },
    }).catch(() => {});
  }
  console.log(`  ${config.navios.length} navios OK`);

  // Jangadas
  const navios = await prisma.navio.findMany();
  const hoje = new Date();
  for (const j of config.jangadas) {
    const navio = navios.find(n => n.nome === j.shipNameManual);
    await prisma.jangada.create({
      data: {
        brand: j.brand, model: j.model, serial: j.serial, dataFabrico: j.dataFabrico,
        packType: j.packType, capacity: j.capacity, owner: j.owner,
        shipNameManual: j.shipNameManual, shipId: navio?.id || null,
        serviceStationId: station.id,
        dataInspecao: j.dataInspecao || null, dataProxInspecao: j.dataProxInspecao || null,
      },
    }).catch(() => {});
  }
  console.log(`  ${config.jangadas.length} jangadas OK`);

  // Coletes
  if (config.coletes) {
    for (const c of config.coletes) {
      const navio = c.shipNameManual ? navios.find(n => n.nome === c.shipNameManual) : null;
      await prisma.colete.create({
        data: { ...c, shipId: navio?.id || null },
      }).catch(() => {});
    }
    console.log(`  ${config.coletes.length} coletes OK`);
  }

  // EPIRBs
  if (config.epirbs) {
    for (const e of config.epirbs) {
      const navio = e.shipNameManual ? navios.find(n => n.nome === e.shipNameManual) : null;
      const { shipNameManual, ...epirbData } = e;
      await prisma.epirb.create({
        data: { ...epirbData, shipId: navio?.id || null },
      }).catch(() => {});
    }
    console.log(`  ${config.epirbs.length} EPIRBs OK`);
  }

  // Inspeções para jangadas inspecionadas
  const jangadasComInspecao = await prisma.jangada.findMany();
  for (const j of jangadasComInspecao) {
    if (j.dataProxInspecao && j.dataInspecao) {
      await prisma.inspecao.create({
        data: {
          certificadoNumero: `CERT-${stationCode}-${j.serial}`,
          navioNome: j.shipNameManual || j.owner,
          navioId: j.shipId,
          jangadaId: j.id,
          jangadaSerial: j.serial,
          dataInspecao: j.dataInspecao,
          dataProxInspecao: j.dataProxInspecao,
          status: 'Concluída',
        },
      }).catch(() => {});
    }
  }
  console.log('  Inspeções OK');

  // ServiceStationQueue + OrdensServico
  const jangadas = await prisma.jangada.findMany();
  for (const j of jangadas) {
    if (j.dataProxInspecao) {
      const tecnico = await prisma.tecnico.findFirst({ where: { serviceStationId: station.id } });
      const navio = navios.find(n => n.id === j.shipId);
      const cliente = navio ? await prisma.cliente.findUnique({ where: { id: navio.clienteId } }) : null;
      const os = await prisma.ordemServico.create({
        data: {
          numeroOrdem: `OS-${stationCode}-${String(j.id).padStart(3, '0')}-${Date.now()}`,
          serviceStationId: station.id, jangadaId: j.id, shipId: j.shipId,
          clienteId: cliente?.id || null, tecnicoId: tecnico?.id || null,
          tipo: 'inspecao', status: 'concluido',
          descricao: `Inspeção anual da jangada ${j.brand} ${j.model} (${j.serial})`,
          tecnicoResponsavel: tecnico?.nome || null,
          dataAbertura: new Date(hoje.getTime() - 30 * 86400000),
          dataInicio: new Date(hoje.getTime() - 28 * 86400000),
          dataConclusao: new Date(hoje.getTime() - 25 * 86400000),
          durationMinutes: 210, valorPecas: 150, valorMaoObra: 120, valorTotal: 270,
        },
      });

      await prisma.serviceStationQueue.create({
        data: {
          serviceStationId: station.id, jangadaId: j.id, ordemServicoId: os.id,
          dataChegada: new Date(hoje.getTime() - 30 * 86400000),
          dataPrevistaEntrega: new Date(hoje.getTime() - 25 * 86400000),
          status: 'Concluida',
        },
      }).catch(() => {});
    } else {
      await prisma.serviceStationQueue.create({
        data: {
          serviceStationId: station.id, jangadaId: j.id,
          dataChegada: new Date(hoje.getTime() - Math.random() * 7 * 86400000),
          status: 'Aguardando',
        },
      }).catch(() => {});
    }
  }
  console.log('  Queue + OrdensServico OK');

  console.log(`\n=== SEED ${stationCode} CONCLUIDO ===`);
  console.log(`Admin: admin@local / admin123`);
  console.log(`Técnicos: password=orelhas`);
}

main()
  .catch(e => { console.error('Erro no seed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());