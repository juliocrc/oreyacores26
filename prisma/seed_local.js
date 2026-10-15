const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

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
  console.log('A semear dados locais...');

  // ── Service Stations ──────────────────────────────────────────
  const stationsData = [
    { codigo: 'ACORES', nome: 'Açores', empresa: 'Orey', localizacao: 'Açores', territorioTipo: 'AZORES' },
    { codigo: 'LISBOA', nome: 'Lisboa', empresa: 'Orey', localizacao: 'Vialonga', territorioTipo: 'MAINLAND', regiaoOperacional: 'SUL' },
    { codigo: 'AVELEDA', nome: 'Aveleda', empresa: 'Orey', localizacao: 'Aveleda', territorioTipo: 'MAINLAND', regiaoOperacional: 'NORTE' },
    { codigo: 'ALCATARILHA', nome: 'Alcatarilha', empresa: 'Orey', localizacao: 'Alcatarilha', territorioTipo: 'MAINLAND', regiaoOperacional: 'SUL' },
  ];

  for (const s of stationsData) {
    await prisma.serviceStation.upsert({
      where: { codigo: s.codigo },
      update: { ...s, regiaoOperacional: s.regiaoOperacional || null, ativo: true },
      create: { ...s, regiaoOperacional: s.regiaoOperacional || null, ativo: true },
    });
  }
  console.log('  ServiceStations OK');

  // ── Contactos Internos ────────────────────────────────────────
  const contactosData = [
    { categoria: 'Técnico', empresa: 'Orey', localizacao: 'Aveleda', nome: 'João Ferreira', email: 'joao.ferreira@orey.com', telemovel: '912345671' },
    { categoria: 'Técnico', empresa: 'Orey', localizacao: 'Aveleda', nome: 'Rui Costa', email: 'rui.costa@orey.com', telemovel: '912345672' },
    { categoria: 'Técnico', empresa: 'Orey', localizacao: 'Açores', nome: 'Julio Correia', email: 'julio.correia@orey.com', telemovel: '912345673' },
    { categoria: 'Técnico', empresa: 'Orey', localizacao: 'Açores', nome: 'Alex Santos', email: 'alex.santos@orey.com', telemovel: '912345674' },
    { categoria: 'Técnico', empresa: 'Orey', localizacao: 'Alcatarilha', nome: 'Manuel Silva', email: 'manuel.silva@orey.com', telemovel: '912345675' },
    { categoria: 'Administrador', empresa: 'Orey', localizacao: 'Alcatarilha', nome: 'Alvaro Silva', email: 'alvaro.silva@orey.com', telemovel: '912345676' },
    { categoria: 'Administrador', empresa: 'Orey', localizacao: 'Alcatarilha', nome: 'João Silvestre', email: 'joao.silvestre@orey.com', telemovel: '912345677' },
  ];
  for (const c of contactosData) {
    await prisma.contactoInterno.upsert({
      where: { id: 0 }, // force create
      update: {},
      create: c,
    }).catch(() => {});
  }
  console.log('  ContactosInternos OK');

  // ── Admin user ────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@local' },
    update: { name: 'Admin Local', role: 'ADMIN', passwordHash: hashedPassword },
    create: { email: 'admin@local', name: 'Admin Local', role: 'ADMIN', passwordHash: hashedPassword },
  });
  console.log('  Admin user: admin@local / admin123');

  // ── Técnicos + Users ─────────────────────────────────────────
  const tecnicos = [
    { nome: 'Cristiano Gomes', email: 'cristiano.gomes@orey.com', stationCode: 'AVELEDA', password: 'orelhas', admin: true },
    { nome: 'Willian Ribeiro', email: 'willian.ribeiro@orey.com', stationCode: 'AVELEDA', password: 'orelhas', admin: true },
    { nome: 'Henrique Cardoso', email: 'henrique.cardoso@orey.com', stationCode: 'AVELEDA', password: 'orelhas' },
    { nome: 'Julio Correia', email: 'julio.correia@orey.com', stationCode: 'ACORES', password: 'orelhas' },
    { nome: 'Alex Santos', email: 'alex.santos@orey.com', stationCode: 'ACORES', password: 'orelhas' },
    { nome: 'Alvaro Silva', email: 'alvaro.silva@orey.com', stationCode: 'ALCATARILHA', password: 'orelhas', admin: true },
    { nome: 'João Silvestre', email: 'joao.silvestre@orey.com', stationCode: 'ALCATARILHA', password: 'orelhas', admin: true },
  ];

  const stationMap = {};
  for (const s of await prisma.serviceStation.findMany()) stationMap[s.codigo] = s.id;

  for (const t of tecnicos) {
    const stId = stationMap[t.stationCode];
    if (!stId) continue;

    await prisma.tecnico.upsert({
      where: { email: t.email },
      update: { nome: t.nome, serviceStationId: stId, ativo: true },
      create: { nome: t.nome, email: t.email, serviceStationId: stId, ativo: true },
    });

    const user = await prisma.user.upsert({
      where: { email: t.email },
      update: { name: t.nome, role: t.admin ? 'ADMIN' : 'USER' },
      create: { email: t.email, name: t.nome, role: t.admin ? 'ADMIN' : 'USER', passwordHash: await bcrypt.hash(t.password, 10) },
    });

    if (t.admin) {
      await prisma.user.update({
        where: { email: t.email },
        data: { permissionsOverrideJson: JSON.stringify({ allowedStationCodes: [t.stationCode] }) },
      });
    }
  }
  console.log('  Tecnicos e Utilizadores OK');

  // ── Catálogo ──────────────────────────────────────────────────
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
  console.log('  Catalogo marcas/modelos OK');

  // ── Stock global (checklist) ──────────────────────────────────
  for (const [i, name] of QUADRO_ARTIGOS_BASE.entries()) {
    const existing = await prisma.stock.findFirst({ where: { referencia: `CHK${i + 1}`, serviceStationId: null } });
    if (!existing) {
      await prisma.stock.create({
        data: { referencia: `CHK${i + 1}`, descricao: name, categoria: 'Checklist', associavelJangada: true, precoCompra: 0, precoVenda: 0, quantidade: 0 },
      });
    }
  }
  console.log('  Stock global OK');

  // ── Stock por estação ─────────────────────────────────────────
  const stockItems = [
    { ref: 'CIL-001', desc: 'Cilindro CO2 2kg', cat: 'Cilindros', qty: 5, pCompra: 45, pVenda: 75 },
    { ref: 'CIL-002', desc: 'Cilindro CO2 3kg', cat: 'Cilindros', qty: 3, pCompra: 55, pVenda: 90 },
    { ref: 'PAS-001', desc: 'Pastilha CO2 33g', cat: 'Pastilhas', qty: 20, pCompra: 8, pVenda: 15 },
    { ref: 'PAS-002', desc: 'Pastilha CO2 60g', cat: 'Pastilhas', qty: 15, pCompra: 10, pVenda: 18 },
    { ref: 'LUZ-001', desc: 'Luz flutuante LED', cat: 'Iluminação', qty: 10, pCompra: 12, pVenda: 25 },
    { ref: 'API-001', desc: 'Apito plástico', cat: 'Sinalização', qty: 30, pCompra: 2, pVenda: 5 },
    { ref: 'MAN-001', desc: 'Manual sobrevivência', cat: 'Documentação', qty: 8, pCompra: 5, pVenda: 12 },
    { ref: 'FAC-001', desc: 'Faca flutuante', cat: 'Ferramentas', qty: 6, pCompra: 15, pVenda: 30 },
  ];

  for (const stationId of [stationMap['AVELEDA'], stationMap['ALCATARILHA'], stationMap['ACORES']]) {
    for (const item of stockItems) {
      await prisma.stock.upsert({
        where: { referencia_serviceStationId: { referencia: item.ref, serviceStationId: stationId } },
        update: { descricao: item.desc, categoria: item.cat, quantidade: item.qty, precoCompra: item.pCompra, precoVenda: item.pVenda },
        create: { referencia: item.ref, descricao: item.desc, categoria: item.cat, quantidade: item.qty, precoCompra: item.pCompra, precoVenda: item.pVenda, serviceStationId: stationId, estadoArtigo: 'ATIVO', associavelJangada: true },
      });
    }
  }
  console.log('  Stock por estação OK');

  // ── Clientes ──────────────────────────────────────────────────
  const clientesData = [
    { nome: 'Pesca Norte Lda', nif: '501234567', email: 'geral@pescanorte.pt', telmovel: '912345001', localidade: 'Póvoa de Varzim', stationCode: 'AVELEDA', tipoCliente: 'armador' },
    { nome: 'Navipescas SA', nif: '502345678', email: 'info@navipescas.pt', telmovel: '912345002', localidade: 'Matosinhos', stationCode: 'AVELEDA', tipoCliente: 'armador' },
    { nome: 'Marisul Lda', nif: '503456789', email: 'marisul@email.pt', telmovel: '912345003', localidade: 'Portimão', stationCode: 'ALCATARILHA', tipoCliente: 'armador' },
    { nome: 'Pescas Algarve Lda', nif: '504567890', email: 'pescas.algarve@email.pt', telmovel: '912345004', localidade: 'Olhão', stationCode: 'ALCATARILHA', tipoCliente: 'armador' },
    { nome: 'Turismo Marítimo Açores', nif: '505678901', email: 'turismo@acores.pt', telmovel: '912345005', localidade: 'Ponta Delgada', stationCode: 'ACORES', tipoCliente: 'operador' },
  ];

  for (const c of clientesData) {
    const { stationCode, ...clienteFields } = c;
    await prisma.cliente.upsert({
      where: { nif: c.nif },
      update: { ...clienteFields, serviceStationId: stationMap[c.stationCode] },
      create: { ...clienteFields, serviceStationId: stationMap[c.stationCode] },
    });
  }
  console.log('  Clientes OK');

  // ── Navios ────────────────────────────────────────────────────
  const clientes = await prisma.cliente.findMany();
  const clienteByNif = {};
  for (const c of clientes) clienteByNif[c.nif] = c;

  const naviosData = [
    { nome: 'Mar Bravo', matricula: 'PO-1234-L', ilha: 'Norte', tipoPesca: 'Arrasto', portoRegisto: 'Póvoa de Varzim', nifCliente: '501234567', stationCode: 'AVELEDA' },
    { nome: 'Costa Verde', matricula: 'MAT-5678', ilha: 'Norte', tipoPesca: 'Cerco', portoRegisto: 'Matosinhos', nifCliente: '501234567', stationCode: 'AVELEDA' },
    { nome: 'Atlântico Sul', matricula: 'PO-9012-L', ilha: 'Norte', tipoPesca: 'Arrasto', portoRegisto: 'Póvoa de Varzim', nifCliente: '502345678', stationCode: 'AVELEDA' },
    { nome: 'Costa Sul', matricula: 'PRT-3456', ilha: 'Algarve', tipoPesca: 'Cerco', portoRegisto: 'Portimão', nifCliente: '503456789', stationCode: 'ALCATARILHA' },
    { nome: 'Mar Algarvio', matricula: 'OLH-7890', ilha: 'Algarve', tipoPesca: 'Arrasto', portoRegisto: 'Olhão', nifCliente: '504567890', stationCode: 'ALCATARILHA' },
    { nome: 'Açoriano', matricula: 'PDL-1122', ilha: 'São Miguel', tipoPesca: 'Pesca', portoRegisto: 'Ponta Delgada', nifCliente: '505678901', stationCode: 'ACORES' },
  ];

  for (const n of naviosData) {
    await prisma.navio.create({ data: { nome: n.nome, matricula: n.matricula, ilha: n.ilha, tipoPesca: n.tipoPesca, portoRegisto: n.portoRegisto, clienteId: clienteByNif[n.nifCliente]?.id, serviceStationId: stationMap[n.stationCode], ativo: true } }).catch(() => {});
  }
  console.log('  Navios OK');

  // ── Jangadas ──────────────────────────────────────────────────
  const navios = await prisma.navio.findMany();
  const jangadasData = [
    { brand: 'Zodiac', model: 'SOLAS A', serial: 'ZD-2024-001', dataFabrico: '2024-03-15', packType: 'Valise', capacity: 10, owner: 'Pesca Norte Lda', shipNameManual: 'Mar Bravo', stationCode: 'AVELEDA', dataInspecao: '2025-01-10', dataProxInspecao: '2026-01-10' },
    { brand: 'Viking', model: 'SOLAS B', serial: 'VK-2024-002', dataFabrico: '2024-06-20', packType: 'Valise', capacity: 16, owner: 'Navipescas SA', shipNameManual: 'Atlântico Sul', stationCode: 'AVELEDA', dataInspecao: '2025-03-05', dataProxInspecao: '2026-03-05' },
    { brand: 'Plastimo', model: 'ISO 9650-1', serial: 'PL-2023-001', dataFabrico: '2023-09-01', packType: 'Contentor', capacity: 8, owner: 'Pesca Norte Lda', shipNameManual: 'Costa Verde', stationCode: 'AVELEDA' },
    { brand: 'Lalizas', model: 'COASTAL', serial: 'LZ-2024-003', dataFabrico: '2024-01-10', packType: 'Mochila', capacity: 6, owner: 'Marisul Lda', shipNameManual: 'Costa Sul', stationCode: 'ALCATARILHA' },
    { brand: 'DSB', model: 'SOLAS A', serial: 'DSB-2024-004', dataFabrico: '2024-05-30', packType: 'Valise', capacity: 12, owner: 'Pescas Algarve Lda', shipNameManual: 'Mar Algarvio', stationCode: 'ALCATARILHA' },
    { brand: 'Eurovinil', model: 'ISO 9650-2', serial: 'EV-2023-002', dataFabrico: '2023-11-20', packType: 'Contentor', capacity: 8, owner: 'Marisul Lda', shipNameManual: 'Costa Sul', stationCode: 'ALCATARILHA' },
    { brand: 'Zodiac', model: 'OCEAN', serial: 'ZD-2023-005', dataFabrico: '2023-04-10', packType: 'Valise', capacity: 20, owner: 'Turismo Marítimo Açores', shipNameManual: 'Açoriano', stationCode: 'ACORES' },
  ];

  for (const j of jangadasData) {
    const navio = navios.find(n => n.nome === j.shipNameManual);
    await prisma.jangada.create({
      data: { brand: j.brand, model: j.model, serial: j.serial, dataFabrico: j.dataFabrico, packType: j.packType, capacity: j.capacity, owner: j.owner, shipNameManual: j.shipNameManual, shipId: navio?.id || null, serviceStationId: stationMap[j.stationCode], dataInspecao: j.dataInspecao || null, dataProxInspecao: j.dataProxInspecao || null },
    }).catch(() => {});
  }
  console.log('  Jangadas OK');

  // ── ServiceStationQueue (jangadas em espera) ──────────────────
  const jangadas = await prisma.jangada.findMany();
  const hoje = new Date();
  for (const j of jangadas) {
    if (j.dataProxInspecao) continue; // skip inspected ones
    await prisma.serviceStationQueue.create({
      data: { serviceStationId: j.serviceStationId, jangadaId: j.id, dataChegada: new Date(hoje.getTime() - Math.random() * 7 * 86400000), status: 'Aguardando' },
    }).catch(() => {});
  }
  console.log('  ServiceStationQueue OK');

  // ── OrdemServico para as jangadas inspecionadas ──────────────
  const tecnicosMap = {};
  for (const t of await prisma.tecnico.findMany()) tecnicosMap[t.email] = t;

  const jangadasComInspecao = jangadas.filter(j => j.dataInspecao && j.dataProxInspecao);
  let ordemNum = 1;
  for (const j of jangadasComInspecao) {
    const navio = navios.find(n => n.id === j.shipId);
    const cliente = navio ? await prisma.cliente.findUnique({ where: { id: navio.clienteId } }) : null;
    const tecnico = tecnicosMap[Object.keys(tecnicosMap).find(k => tecnicosMap[k].serviceStationId === j.serviceStationId)];
    try {
      const os = await prisma.ordemServico.create({
        data: {
          numeroOrdem: `OS-${String(ordemNum++).padStart(4, '0')}`,
          serviceStationId: j.serviceStationId,
          jangadaId: j.id,
          shipId: j.shipId,
          clienteId: cliente?.id || null,
          tecnicoId: tecnico?.id || null,
          tipo: 'inspecao',
          status: 'concluido',
          descricao: `Inspeção anual da jangada ${j.brand} ${j.model} (${j.serial})`,
          tecnicoResponsavel: tecnico?.nome || null,
          dataAbertura: new Date(hoje.getTime() - 30 * 86400000),
          dataInicio: new Date(hoje.getTime() - 28 * 86400000),
          dataConclusao: new Date(hoje.getTime() - 25 * 86400000),
          durationMinutes: 210,
          valorPecas: 150,
          valorMaoObra: 120,
          valorTotal: 270,
        },
      });

      await prisma.serviceStationQueue.create({
        data: { serviceStationId: j.serviceStationId, jangadaId: j.id, ordemServicoId: os.id, dataChegada: new Date(hoje.getTime() - 30 * 86400000), dataPrevistaEntrega: new Date(hoje.getTime() - 25 * 86400000), status: 'Concluida' },
      }).catch(() => {});
    } catch {}
  }
  console.log('  OrdensServico OK');

  console.log('\n=== SEED LOCAL CONCLUIDO ===');
  console.log('Admin: admin@local / admin123');
  console.log('Técnicos: password=orelhas (login passwordless disponível)');
  console.log('Dados criados para Aveleda, Alcantarilha e Açores');
}

main()
  .catch((e) => { console.error('Erro no seed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());