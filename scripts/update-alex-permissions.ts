import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateAlexPermissions() {
  const alex = await prisma.user.findFirst({
    where: { name: { contains: 'Alex Santos' } }
  });

  if (!alex) {
    console.log('Alex Santos not found');
    return;
  }

  console.log('Found:', alex.email, alex.name);

  const modulesToHide = ['oficina', 'estatisticas', 'porto-ponta-delgada', 'contentores', 'ordens-servico', 'faturacao'];

  const allModules = [
    'dashboard', 'agenda', 'estacao-servico', 'oficina', 'calibracoes', 'logistica',
    'alertas', 'inspecoes', 'ia-importacao', 'relatorios', 'jangadas', 'packs',
    'navios', 'epirbs', 'clientes', 'tecnicos', 'equipamentos', 'fatos-imersao',
    'stock', 'cilindros', 'obras', 'departamento-tecnico', 'legislacao', 'dgrm',
    'auditorias', 'fotos', 'contactos-internos', 'utilizadores', 'registar',
    'estatisticas', 'porto-ponta-delgada', 'contentores', 'ordens-servico', 'faturacao',
    'oficina', 'ia-importacao'
  ];

  const modulesAlexCanSee = allModules.filter(m => !['oficina', 'estatisticas', 'porto-ponta-delgada', 'contentores', 'ordens-servico', 'faturacao'].includes(m));

  const permissionsOverride = {
    visibleModules: modulesAlexCanSee,
    visiblePages: modulesAlexCanSee.map(m => '/' + m.replace(/-/g, '-')),
    editablePages: [],
    editableFields: {}
  };

  await prisma.user.update({
    where: { id: alex.id },
    data: { permissionsOverrideJson: JSON.stringify(permissionsOverride) }
  });

  console.log('Updated Alex Santos permissions');
  console.log('Visible modules:', modulesAlexCanSee);
}

updateAlexPermissions().finally(() => prisma.$disconnect());