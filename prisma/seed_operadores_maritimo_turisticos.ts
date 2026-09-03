// Import/backfill de clientes operadores marítimo-turísticos (registos RNAAT).
// Idempotente por NIF/NIPC:
//  - Se o cliente (por nif) ainda não existir, é criado.
//  - Se já existir, apenas completa os campos em falta (não sobrescreve dados existentes).
//
// Uso:
//   npx tsx prisma/seed_operadores_maritimo_turisticos.ts [--dry-run]
//
// Nota: o schema Cliente não contempla RNAAT, Website nem Objeto Social — esses
// dados ficam de fora (ver aviso no final do output).

import prisma from "../src/database";
import { deriveClienteAddressFields } from "../src/lib/client-address";
import { normalizeClienteIslandValue } from "../src/lib/azores-islands";
import { isValidNif, normalizePhone } from "../src/lib/validators";

const TIPO_OMT = "OPERADOR MARÍTIMO TURÍSTICO";

type ClienteOMT = {
  nome: string;
  nif: string;
  email?: string | null;
  telefone?: string | null;
  telmovel?: string | null;
  morada?: string | null;
  moradaNumero?: string | null;
  codigoPostal?: string | null;
  localidade?: string | null;
  ilha?: string | null;
  observacoes?: string | null;
};

const CLIENTES: ClienteOMT[] = [
  {
    nome: "FÁTIMA BETTENCOURT DA ROSA",
    nif: "226706575",
    morada: "Largo da Fontes",
    moradaNumero: "n7",
    codigoPostal: "9880-348",
    localidade: "SANTA CRUZ DA GRACIOSA",
    ilha: "Ilha da Graciosa",
    observacoes: "Nome Comercial: SWORDFISH BX PESCA & PASSEIOS TURISTICOS.",
  },
  {
    nome: "JOÃO PEDRO DE CARVALHO MARQUES ALVEIRINHO DIAS",
    nif: "207622159",
    morada: "ESTR REGIONAL",
    moradaNumero: "S/N",
    codigoPostal: "9970-031",
    localidade: "CEDROS SCF",
    ilha: "Ilha das Flores",
    observacoes: "RNAAT nº 428/2022. Website: https://www.saltyplanet.pt/",
  },
  {
    nome: "RUI MIGUEL DE CAMPOS SANTOS",
    nif: "212177710",
    morada: "Beco dos Ramos",
    moradaNumero: "nº2",
    codigoPostal: "9970-307",
    localidade: "SANTA CRUZ DAS FLORES",
    ilha: "Ilha das Flores",
  },
  {
    nome: "HARFANG - MAR, AVENTURA E CONSTRUÇÃO, UNIPESSOAL LDA",
    nif: "507202503",
    morada: "Lugar de Nossa Senhora da Piedade",
    moradaNumero: "s/nº",
    codigoPostal: "9580-229",
    localidade: "SANTO ESPÍRITO",
    ilha: "Ilha de Santa Maria",
    observacoes:
      "Website: www.harfang.pt. Objeto social: Atividade marítimo-turística, aluguer de embarcações, publicidade em embarcações, serviços náuticos, eventos em embarcações, comércio de embarcações, artigos e brindes náuticos; construção civil, obras públicas, fiscalização de obras, trabalhos de construção civil particulares, pinturas e acabamentos.",
  },
  {
    nome: "RODRIGO MANUEL VIANA CANHÃO CORREIA RIJO",
    nif: "254843417",
    email: "rodrigo.rijo@gmail.com",
    telmovel: "913181691",
    morada: "Rua dos Ledos",
    moradaNumero: "numero 8",
    codigoPostal: "9600-073",
    localidade: "PICO DA PEDRA",
    ilha: "Ilha de São Miguel",
  },
  {
    nome: "PETER ALOYSUIS GALVÃO HEALION",
    nif: "253581346",
    email: "peterhealion01@hotmail.com",
    telmovel: "968691204",
    morada: "Rua Nova",
    moradaNumero: "1/3",
    codigoPostal: "9600-231",
    localidade: "RIBEIRA SECA RGR",
    ilha: "Ilha de São Miguel",
  },
  {
    nome: "LOPES E PAIVA - AZORES FISHING LDA",
    nif: "513544003",
    email: "azoresfishinglp@gmail.com",
    telmovel: "915136364",
    morada: "Rua João Rego Cima",
    moradaNumero: "nº115",
    codigoPostal: "9500-207",
    localidade: "PONTA DELGADA",
    ilha: "Ilha de São Miguel",
    observacoes:
      "Nome Comercial: Azores Fishing. Website: www.azoresfishing.pt. Objeto social: atividades marítimo-turísticas de pesca desportiva, turística e de lazer; passeios de barco e atividades de animação turística e de lazer; aluguer de embarcações costeiras e de recreio com tripulação; aluguer de equipamentos náuticos e de lazer. Marca: AZORES FISHING (INPI nº 548649). Atividades: aluguer de embarcações com tripulação; passeios marítimo-turísticos; pesca turística.",
  },
  {
    nome: "SEAFREE - AZORES INTERNACIONAL CHARTERS, UNIPESSOAL LDA",
    nif: "513498419",
    email: "lf@seafree.eu",
    telmovel: "917550015",
    morada: "Rua Diário dos Açores",
    moradaNumero: "33, 1 andar",
    codigoPostal: "9500-178",
    localidade: "Ponta Delgada",
    ilha: "Ilha de São Miguel",
    observacoes:
      "Objeto social: transporte marítimo costeiro e local de passageiros, representação e comercialização de produtos marítimos, serviços de manutenção de embarcações, realização e produção de eventos, animação turística, atividades marítimo-náuticas, pesca desportiva, caça submarina, ensino e formação náutica, aluguer de embarcações de recreio com e sem tripulação, aluguer de bens recreativos e desportivos, cruzeiros de pesca.",
  },
  {
    nome: "D5-GESTÃO DE BENS IMOBILIÁRIOS, LDA.",
    nif: "506825922",
    email: "rui.wallis@wallis.pt",
    telmovel: "963058028",
    morada: "Av. Infante D. Henrique",
    moradaNumero: "3, 2º",
    codigoPostal: "9500-150",
    localidade: "PONTA DELGADA",
    ilha: "Ilha de São Miguel",
    observacoes:
      "Objeto social: compra, venda e gestão de bens imobiliários; organização de atividades de animação turística.",
  },
  {
    nome: "VULCANIC FISHING N' FEELINGS AZORES LDA",
    nif: "517251353",
    email: "quintalagartixa@gmail.com",
    telmovel: "914606375",
    morada: "Caminho Debaixo da Rocha",
    moradaNumero: "3",
    codigoPostal: "9900-302",
    localidade: "CAPELO",
    ilha: "Ilha do Faial",
    observacoes:
      "Nome Comercial: Vulcanic Fishing n' Feelings Azores, Lda. Objeto social: transportes costeiros e locais de passageiros; atividades desportivas; atividades de diversão e recreativas; organização de atividades de animação turística; aluguer de bens recreativos e desportivos; atividades dos operadores turísticos; atividade marítimo-turística; pesca recreativa e desportiva.",
  },
  {
    nome: "PICO OUTDOOR & LODGING LDA",
    nif: "516145088",
    email: "ruicalado2@gmail.com",
    telmovel: "931408575",
    morada: "Ladeira do Miradouro",
    moradaNumero: "N 3",
    codigoPostal: "9930-054",
    localidade: "CALHETA DE NESQUIM",
    ilha: "Ilha do Pico",
    observacoes:
      "Nome Comercial: Pico Outdoor. Website: www.abrigosbaleeiros.com. Objeto social: turismo no espaço rural, alojamento mobilado para turistas e outros alojamentos turísticos com restaurante; organização de atividades de animação turística e aluguer de bens recreativos e desportivos.",
  },
  {
    nome: "TODO CONSULTING LDA",
    nif: "507893425",
    email: "sergio.pinheiro@todo-consulting.com",
    telmovel: "919505930",
    morada: "Canada do Maciel",
    moradaNumero: "4",
    codigoPostal: "9950-451",
    localidade: "SÃO CAETANO MAD",
    ilha: "Ilha do Pico",
  },
];

const isEmpty = (value: unknown) =>
  value === null || value === undefined || (typeof value === "string" && !String(value).trim());

function buildData(cliente: ClienteOMT) {
  const address = deriveClienteAddressFields({
    morada: cliente.morada,
    moradaNumero: cliente.moradaNumero,
    codigoPostal: cliente.codigoPostal,
    localidade: cliente.localidade,
  });

  return {
    nome: cliente.nome,
    tipoCliente: TIPO_OMT,
    nif: cliente.nif,
    email: cliente.email?.trim() || null,
    telefone: normalizePhone(cliente.telefone),
    telmovel: normalizePhone(cliente.telmovel),
    morada: address.morada,
    moradaNumero: address.moradaNumero,
    codigoPostal: address.codigoPostal,
    localidade: address.localidade,
    ilha: normalizeClienteIslandValue({ ilha: cliente.ilha }),
    observacoes: cliente.observacoes?.trim() || null,
  };
}

// Retorna apenas os campos que estão em falta no registo existente ("completar dados").
function buildPatch(extant: Record<string, unknown>, data: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  (Object.keys(data) as (keyof typeof data)[]).forEach((key) => {
    if (isEmpty(data[key])) return;
    if (isEmpty(extant[key])) {
      patch[key] = data[key];
    }
  });
  return patch;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  let criados = 0;
  let atualizados = 0;
  let semMudanca = 0;
  const erros: string[] = [];

  for (const cliente of CLIENTES) {
    try {
      if (!isValidNif(cliente.nif)) {
        erros.push(`${cliente.nome}: NIF inválido (${cliente.nif})`);
        continue;
      }

      const data = buildData(cliente);
      const extant = await prisma.cliente.findUnique({ where: { nif: cliente.nif } });

      if (!extant) {
        if (!dryRun) {
          await prisma.cliente.create({ data: data as never });
        }
        criados += 1;
        console.log(`[CRIADO]  ${cliente.nome} (${cliente.nif})`);
        continue;
      }

      const patch = buildPatch(extant as Record<string, unknown>, data as unknown as Record<string, unknown>);
      if (Object.keys(patch).length > 0) {
        if (!dryRun) {
          await prisma.cliente.update({ where: { id: extant.id }, data: patch as never });
        }
        atualizados += 1;
        console.log(`[ATUALIZADO] ${cliente.nome} (${cliente.nif}) — campos preenchidos: ${Object.keys(patch).join(", ")}`);
      } else {
        semMudanca += 1;
        console.log(`[SEM MUDANÇA] ${cliente.nome} (${cliente.nif})`);
      }
    } catch (error) {
      erros.push(`${cliente.nome}: ${(error as Error)?.message || "erro"}`);
    }
  }

  console.log("\n=== Resumo ===");
  console.log(`Criados: ${criados}`);
  console.log(`Atualizados (completados): ${atualizados}`);
  console.log(`Sem mudança: ${semMudanca}`);
  console.log(`Erros: ${erros.length}`);
  erros.forEach((e) => console.log(`  - ${e}`));

  if (dryRun) {
    console.log("\n(Modo --dry-run: nada foi gravado na base de dados.)");
  }
}

main()
  .catch((error) => {
    console.error("Erro fatal:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
