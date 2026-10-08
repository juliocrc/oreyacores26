/**
 * OREYACORESDELUXE — garante que todos os técnicos activos da estação ACORES
 * têm um Utilizador utilizável na Deluxe.
 *
 * Na Deluxe não há palavra-passe: o técnico é escolhido no arranque e a sessão
 * é criada sem password (loginType "passwordless"). Todos ficam com role ADMIN
 * porque a emissão de certificados e a aprovação de revisões exigem ADMIN.
 *
 * Uso:  node scripts/garantir-tecnicos-deluxe.cjs
 */
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const dbPath = path.join(process.cwd(), "prisma", "local.db");
process.env.DATABASE_URL = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || "file:" + dbPath.replace(/\\/g, "/");

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const ESTACAO = "ACORES";

function emailDe(tecnico) {
  if (tecnico.email && tecnico.email.includes("@")) return tecnico.email.toLowerCase();
  const base = String(tecnico.nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `${base || "tecnico"}@orey.com`;
}

async function main() {
  const estacao = await prisma.serviceStation.findFirst({
    where: { codigo: ESTACAO, ativo: true },
    select: { id: true, codigo: true, nome: true },
  });

  if (!estacao) {
    throw new Error(`Estação ${ESTACAO} não encontrada ou inactiva.`);
  }

  const tecnicos = await prisma.tecnico.findMany({
    where: { serviceStationId: estacao.id, ativo: true },
    select: { id: true, nome: true, email: true },
    orderBy: { nome: "asc" },
  });

  if (!tecnicos.length) {
    throw new Error(`A estação ${ESTACAO} não tem técnicos activos.`);
  }

  console.log(`Estação: ${estacao.nome} (${estacao.codigo})`);
  console.log(`Técnicos activos: ${tecnicos.length}\n`);

  const resumo = [];

  for (const tecnico of tecnicos) {
    const email = emailDe(tecnico);
    const existente = await prisma.user.findUnique({ where: { email } });

    let userId;
    let acao;

    if (existente) {
      // Não mexe em roles de utilizadores que já são CLIENTE.
      if (existente.role === "CLIENTE") {
        resumo.push({ tecnico: tecnico.nome, email, userId: existente.id, acao: "IGNORADO (CLIENTE)" });
        continue;
      }
      const atualizado = await prisma.user.update({
        where: { id: existente.id },
        data: { name: tecnico.nome, role: "ADMIN", passwordHash: null },
        select: { id: true },
      });
      userId = atualizado.id;
      acao = existente.role === "ADMIN" ? "OK" : `promovido ${existente.role} -> ADMIN`;
    } else {
      const criado = await prisma.user.create({
        data: { email, name: tecnico.nome, role: "ADMIN", passwordHash: null },
        select: { id: true },
      });
      userId = criado.id;
      acao = "CRIADO";
    }

    resumo.push({ tecnico: tecnico.nome, email, userId, acao });
  }

  console.table(resumo);

  const semUtilizador = resumo.filter((r) => !r.userId);
  if (semUtilizador.length) {
    console.error(`\n${semUtilizador.length} técnico(s) sem utilizador — a Deluxe não os pode mostrar.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nOK: ${resumo.length} técnico(s) prontos para seleção no arranque.`);
}

main()
  .catch((err) => {
    console.error("Falha ao garantir técnicos:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
