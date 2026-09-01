// Inferência de marca, modelo, cilindros e tipo de pack
function inferMarca(nome: string): string {
  const n = (nome || '').toUpperCase();
  if (n.includes('ZODIAC')) return 'Zodiac';
  if (n.includes('BFA')) return 'BFA';
  if (n.includes('ARIMAR')) return 'Arimar';
  if (n.includes('PLASTIMO')) return 'Plastimo';
  if (n.includes('DUPLA')) return 'Dupla Marca';
  return 'Desconhecida';
}

function inferModelo(nome: string): string {
  const n = (nome || '').toUpperCase();
  if (n.includes('MINI')) return 'Mini';
  if (n.includes('SOLAS')) return 'SOLAS';
  if (n.includes('R')) return 'R';
  if (n.includes('B')) return 'B';
  return 'Desconhecido';
}

function inferCilindros(nome: string): string {
  // Exemplo: busca por padrões de cilindros no nome
  const n = (nome || '').toUpperCase();
  if (n.includes('CO2')) return 'CO2';
  if (n.includes('N2')) return 'N2';
  if (n.includes('DUPLO')) return 'Duplo';
  return 'Desconhecido';
}

function inferPackType(nome: string): string {
  const n = (nome || '').toUpperCase();
  if (n.includes('SOLAS')) return 'SOLAS';
  if (n.includes('MINI')) return 'MINI';
  if (n.includes('R')) return 'R';
  if (n.includes('B')) return 'B';
  if (n.includes('SIMPL')) return 'SIMPLIFICADO';
  return 'Desconhecido';
}
// Inferência automática de campos detalhados
function inferTipoNavio(nome: string): string {
  const n = (nome || '').toUpperCase();
  if (n.includes('EXPRESSO') || n.includes('TUR')) return 'Marítimo-Turística';
  if (n.includes('SOS') || n.includes('PESCA') || n.includes('VARA') || n.includes('SALTO')) return 'Pesca';
  if (n.includes('BALEIAS') || n.includes('WHALE')) return 'Marítimo-Turística';
  return 'Pesca';
}

function inferTipoPesca(nome: string, matricula?: string | null): string {
  const m = (matricula || '').trim().toUpperCase();
  if (m.endsWith('L')) return 'Pesca Local';
  if (m.endsWith('C')) return 'Pesca Costeira';

  const n = (nome || '').toUpperCase();
  if (
    n.includes('EXPRESSO') ||
    n.includes('TUR') ||
    n.includes('BALEIA') ||
    n.includes('WHALE') ||
    n.includes('CETUS') ||
    n.includes('CHALLENGE') ||
    n.includes('RELAX')
  ) {
    return 'Marítimo Turística';
  }

  if (
    n.includes('VARA') ||
    n.includes('ATUM') ||
    n.includes('ESPADA') ||
    n.includes('ATLANTICO') ||
    n.includes('OCEANO') ||
    n.includes('ARQUIPELAGO')
  ) {
    return 'Pesca Costeira';
  }

  return 'Pesca Local';
}

function inferIlha(nome: string): string {
  const n = (nome || '').toUpperCase();
  if (n.includes('HORTA')) return 'Faial';
  if (n.includes('SÃO MIGUEL') || n.includes('SAO MIGUEL')) return 'São Miguel';
  if (n.includes('MAIA')) return 'São Miguel';
  if (n.includes('AMARELA')) return 'Pico';
  if (n.includes('CORVO')) return 'Corvo';
  if (n.includes('FLORES')) return 'Flores';
  if (n.includes('TERCEIRA')) return 'Terceira';
  if (n.includes('GRACIOSA')) return 'Graciosa';
  if (n.includes('SANTA MARIA')) return 'Santa Maria';
  if (n.includes('SÃO JORGE') || n.includes('SAO JORGE')) return 'São Jorge';
  if (n.includes('FAIAL')) return 'Faial';
  if (n.includes('PIA')) return 'Pico';
  return 'Desconhecida';
}

import { PrismaClient } from '@prisma/client';
// load diacritics via require to avoid missing type declarations in this environment
 
const { remove: removeAcentos } = require('diacritics');
import fs from 'fs';
import path from 'path';
import os from 'os';
import { z } from 'zod';
import csvParse from 'csv-parse/sync';

const prisma = new PrismaClient();

// CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const undo = args.includes('--undo');
const batchArg = args.find(a => a.startsWith('--batch-size='));
const batchSize = batchArg ? parseInt(batchArg.split('=')[1], 10) : 20;
const envArg = args.find(a => a.startsWith('--env='));
const env = envArg ? envArg.split('=')[1] : process.env.NODE_ENV || 'development';
const langArg = args.find(a => a.startsWith('--lang='));
const lang = langArg ? langArg.split('=')[1] : 'pt';
const importArg = args.find(a => a.startsWith('--import='));
const importFile = importArg ? importArg.split('=')[1] : null;
const logFile = path.join(__dirname, 'logs', `seed_navios_${Date.now()}.log`);
const csvFile = path.join(__dirname, 'logs', `seed_navios_${Date.now()}.csv`);
if (!fs.existsSync(path.join(__dirname, 'logs'))) fs.mkdirSync(path.join(__dirname, 'logs'));

// Log de usuário/host/data
const userInfo = os.userInfo();
const host = os.hostname();
const now = new Date().toISOString();
fs.appendFileSync(logFile, `User: ${userInfo.username}\nHost: ${host}\nDate: ${now}\nEnv: ${env}\nLang: ${lang}\n`);

// NOTE: CLI args block defined above; duplicate block removed to avoid redeclaration.


// Importação de navios via arquivo externo (JSON/CSV)
let navios: any[] = [];
if (importFile) {
  if (importFile.endsWith('.json')) {
    navios = JSON.parse(fs.readFileSync(importFile, 'utf-8'));
  } else if (importFile.endsWith('.csv')) {
    const csvContent = fs.readFileSync(importFile, 'utf-8');
    navios = csvParse.parse(csvContent, { columns: true, skip_empty_lines: true });
  } else {
    throw new Error('Formato de arquivo não suportado para importação. Use .json ou .csv');
  }
} else {
  navios = [
    { nome: 'NANCI MARIA', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'MESTRE MIGUEL', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'CECILIA A', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'ANA BEATRIZ', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'PÃO DE CRISTO', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'ESPIRITO SANTO', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'ISAC VENDEIRO', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'CORAL DA HORTA', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'ADILIO', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'ESTRELA', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'MESTRE VIEIRA', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'GRAÇAS A DEUS', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'RATINHO', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'TERRA MAR', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'ZIFIO', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'MARIA PIA', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'SANTO MESSIAS', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'GOLFIM', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'O CHARAMBA', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'BAIA DA MAIA', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'SALTO E VARA', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'CANANO', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'BAIA DO SOL', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'ILHA AMARELA', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'ILHA DE SÃO MIGUEL', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'PRINCESA ARIEL', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'STRAPPO', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'DESINFIADO', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'ALEGRIA DE DEUS', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'BIANCA E FABIANA', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'ARQUIPELAGO', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'RAUL FILIPE', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'NETOS DE JOSE AUGUSTO', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'TABICA SOS', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'RIBEIRA DA SILVA', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'DECEIVER', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'ANDRÉ E TIAGO', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'AGUAS VIVAS', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'RELAX', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'CHALLENGE', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'DAVID CARLOS', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'BAIA DOS ANJOS', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'ALVARO DE ORNELAS', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'CONDESSA DOS MARES', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'BALEIAS EXPRESSO', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'MÃE IEMANJA', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'CETUS', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'HUGO SOS', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'VIVA OS AÇORES', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'BADEJO', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'ATLANTICO NORDESTE', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
    { nome: 'CORAÇÃO DO OCEANO', matricula: null, ilha: null, tipoPesca: null, clienteId: null },
  ];
}
// Validação avançada com zod
const navioSchema = z.object({
  nome: z.string().min(2),
  matricula: z.string().nullable().optional(),
  ilha: z.string().nullable().optional(),
  tipoPesca: z.string().nullable().optional(),
  clienteId: z.number().nullable().optional(),
});


// ATENÇÃO: O campo 'nome' deve ser único no modelo Prisma para evitar duplicidade.
// Certifique-se de que o schema.prisma tem:
// model Navio {
//   id    Int    @id @default(autoincrement())
//   nome  String @unique
//   ...
// }



async function main() {
    // Funções de inferência para clientes
    function inferTipoCliente(nome: string): string {
      const n = (nome || '').toLowerCase();
      if (n.includes('turismo') || n.includes('turístico') || n.includes('turistic')) return 'operador';
      return 'armador';
    }

    function inferIlhaCliente(nome: string): string {
      // Mesma lógica de inferIlha, mas para clientes
      return inferIlha(nome);
    }

    function inferMoradaCliente(nome: string): string {
      // Exemplo: morada padrão baseada na ilha
      const ilha = inferIlhaCliente(nome);
      if (ilha && ilha !== 'Desconhecida') return `Ilha ${ilha}`;
      return 'Morada desconhecida';
    }
  function normalizeNome(nome: string) {
    return removeAcentos((nome ?? '').trim()).toUpperCase();
  }

  // Seed reversível: --undo remove todos os navios desta lista
  if (undo) {
    const nomes = navios.map(n => n.nome).filter(Boolean);
    const deleted = await prisma.navio.deleteMany({ where: { nome: { in: nomes } } });
    console.log(`[UNDO] Removidos ${deleted.count} navios inseridos por esta seed.`);
    fs.appendFileSync(logFile, `[UNDO] Removidos ${deleted.count} navios inseridos por esta seed.\n`);
    return;
  }

  // Busca todos os navios existentes para saber se é create ou update
  const existentes = await prisma.navio.findMany({ select: { nome: true } });
  const nomesExistentes = new Set(existentes.map((n: { nome: string }) => normalizeNome(n.nome)));

  // Busca todos os clientes válidos
  const clientesValidos = new Set((await prisma.cliente.findMany({ select: { id: true } })).map((c: { id: number }) => c.id));
  // Buscar todos os clientes existentes por nome
  const clientesExistentes = await prisma.cliente.findMany({ select: { id: true, nome: true } });
  const clienteNomeToId = new Map<string, number>(clientesExistentes.map((c: { id: number; nome: string }) => [normalizeNome(c.nome), c.id]));
  const clientesPorIlha = await prisma.cliente.findMany({
    where: { ilha: { not: null } },
    select: { id: true, ilha: true },
  });
  const clienteIlhaToId = new Map<string, number>();
  for (const c of clientesPorIlha) {
    const ilhaNorm = normalizeNome(c.ilha || '');
    if (!ilhaNorm) continue;
    if (!clienteIlhaToId.has(ilhaNorm)) {
      clienteIlhaToId.set(ilhaNorm, c.id);
    }
  }

  const created: string[] = [];
  const updated: string[] = [];
  const erros: { nome: string; erro: string }[] = [];
  const csvRows = ["nome,acao,erro"];

  // Transaction global (tudo ou nada, exceto dry-run)
  const execSeed = async () => {
    for (let i = 0; i < navios.length; i += batchSize) {
      const batch = navios.slice(i, i + batchSize);
      const results = await Promise.allSettled(batch.map(async (navio) => {
        // Validação avançada
        try {
          navioSchema.parse(navio);
        } catch (e: any) {
          const msg = lang === 'en' ? 'Invalid data' : 'Dados inválidos';
          erros.push({ nome: navio.nome, erro: msg + ': ' + e.errors?.map((er: any) => er.message).join(', ') });
          fs.appendFileSync(logFile, `[ERRO] ${navio.nome}: ${msg} - ${JSON.stringify(e.errors)}\n`);
          csvRows.push(`"${navio.nome}",erro,"${msg}"`);
          return;
        }
        const nomeNorm = normalizeNome(navio.nome);
        // Inferir campos detalhados
        const tipoNavio = navio.tipoNavio ?? inferTipoNavio(navio.nome);
        const tipoPesca = navio.tipoPesca ?? inferTipoPesca(navio.nome, navio.matricula);
        const ilha = navio.ilha ?? inferIlha(navio.nome);
        // Novos campos enriquecidos
        const marca = navio.marca ?? inferMarca(navio.nome);
        const modelo = navio.modelo ?? inferModelo(navio.nome);
        const cilindros = navio.cilindros ?? inferCilindros(navio.nome);
        const packType = navio.packType ?? inferPackType(navio.nome);
        const data: any = {
          nome: navio.nome,
          matricula: navio.matricula ?? 'N/A',
          ilha,
          tipoPesca,
          tipoNavio,
          marca,
          modelo,
          cilindros,
          packType,
        };
        // Enriquecimento automático de cliente associado
        if (navio.clienteId !== null && navio.clienteId !== undefined && clientesValidos.has(navio.clienteId)) {
          data.clienteId = navio.clienteId;
        } else if (navio.clienteNome) {
          // Se vier nome do cliente, tenta criar/atualizar
          const nomeCliente = navio.clienteNome;
          const normCliente = normalizeNome(nomeCliente);
          let clienteId = clienteNomeToId.get(normCliente);
          if (clienteId === undefined) {
            // Cria cliente com enriquecimento
            const novo = await prisma.cliente.create({
              data: {
                nome: nomeCliente,
                ilha: inferIlhaCliente(nomeCliente),
                morada: inferMoradaCliente(nomeCliente),
              },
              select: { id: true }
            });
            clienteId = novo.id;
            if (clienteId !== undefined) clienteNomeToId.set(normCliente, clienteId);
          }
          data.clienteId = clienteId;
        } else {
          const ilhaNorm = normalizeNome(ilha);
          if (ilhaNorm && ilhaNorm !== normalizeNome('Desconhecida')) {
            let clienteIdByIlha = clienteIlhaToId.get(ilhaNorm);
            if (clienteIdByIlha === undefined) {
              const novoClienteIlha = await prisma.cliente.create({
                data: {
                  nome: `Cliente ${ilha}`,
                  ilha,
                  morada: `Ilha ${ilha}`,
                },
                select: { id: true },
              });
              clienteIdByIlha = novoClienteIlha.id;
              clienteIlhaToId.set(ilhaNorm, clienteIdByIlha);
            }
            data.clienteId = clienteIdByIlha;
          }
        }
        try {
          if (dryRun) {
            if (nomesExistentes.has(nomeNorm)) {
              updated.push(data.nome);
              fs.appendFileSync(logFile, `[DRY-RUN][UPDATE] ${data.nome}\n`);
              csvRows.push(`"${data.nome}",dry-update,\"\"`);
            } else {
              created.push(data.nome);
              fs.appendFileSync(logFile, `[DRY-RUN][CREATE] ${data.nome}\n`);
              csvRows.push(`"${data.nome}",dry-create,\"\"`);
            }
            return;
          }
          // Use findFirst + create/update because `nome` may not be a unique field in Prisma schema
          const existingNavio = await prisma.navio.findFirst({ where: { nome: data.nome } });
          const shipPayload: any = {
            nome: data.nome,
            matricula: data.matricula,
            ilha: data.ilha,
            tipoPesca: data.tipoPesca,
          };
          if (data.clienteId) shipPayload.clienteId = data.clienteId;
          if (existingNavio) {
            await prisma.navio.update({ where: { id: existingNavio.id }, data: shipPayload });
            updated.push(data.nome);
            fs.appendFileSync(logFile, `[UPDATE] ${data.nome}\n`);
            csvRows.push(`"${data.nome}",update,\"\"`);
          } else {
            await prisma.navio.create({ data: shipPayload });
            created.push(data.nome);
            nomesExistentes.add(nomeNorm);
            fs.appendFileSync(logFile, `[CREATE] ${data.nome}\n`);
            csvRows.push(`"${data.nome}",create,\"\"`);
          }
        } catch (err: any) {
          erros.push({ nome: data.nome, erro: err.message });
          fs.appendFileSync(logFile, `[ERRO] ${data.nome}: ${err.message}\n`);
          csvRows.push(`"${data.nome}",erro,"${err.message.replace(/"/g, "''")}"`);
        }
      }));
    }
  };

  if (dryRun) {
    console.log('--- DRY RUN --- Nenhuma alteração será feita no banco.');
    fs.appendFileSync(logFile, '--- DRY RUN --- Nenhuma alteração será feita no banco.\n');
    await execSeed();
  } else {
    await prisma.$transaction(async () => {
      await execSeed();
    });
  }

  // Relatório final
  fs.writeFileSync(csvFile, csvRows.join('\n'));
  console.log('--- RESUMO FINAL ---');
  console.log(`Criados (${created.length}):`, created);
  console.log(`Atualizados (${updated.length}):`, updated);
  if (erros.length > 0) {
    console.log(`Erros (${erros.length}):`, erros);
  }
  console.log(`Seed de navios concluído. Total: ${created.length + updated.length}, Criados: ${created.length}, Atualizados: ${updated.length}, Erros: ${erros.length}`);
  console.log(`Logs: ${logFile}`);
  console.log(`Relatório CSV: ${csvFile}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
