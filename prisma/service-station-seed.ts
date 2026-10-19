import { PrismaClient } from "@prisma/client";

export type ServiceStationSeedItem = {
  codigo: string;
  nome: string;
  empresa?: string | null;
  localizacao?: string | null;
  morada?: string | null;
  prefixo?: string | null;
  codigoPostal?: string | null;
  localidade?: string | null;
  telefone?: string | null;
  telefone2?: string | null;
  email?: string | null;
  website?: string | null;
  dgrmCertificado?: string | null;
  dgrmVerificacao?: Date | null;
  dgrmValidade?: Date | null;
  dgrmMarcas?: string | null;
  observacoes?: string | null;
  territorioTipo: "AZORES" | "MAINLAND" | "MADEIRA";
  regiaoOperacional?: "NORTE" | "CENTRO" | "SUL" | "MADEIRA" | null;
  aliases: string[];
};

export const SERVICE_STATION_SEED: ServiceStationSeedItem[] = [
  {
    codigo: "ACORES",
    nome: "Açores",
    empresa: "Orey - Técnica Naval e Industrial Lda.",
    localizacao: "Cabouco",
    morada: "Zona Industrial dos Portões Vermelhos, Armazém 19",
    codigoPostal: "9560-350",
    localidade: "Cabouco",
    telefone: "+351 296 929 314",
    telefone2: "+351 296 929 315",
    email: "azores.tecnica@orey.com",
    website: "www.oreytecnica.com",
    dgrmCertificado: "12/2025",
    dgrmVerificacao: new Date("2024-02-12T12:00:00.000Z"),
    dgrmValidade: new Date("2026-02-12T12:00:00.000Z"),
    dgrmMarcas: "DSB; RFD; SURVITECZODIAC",
    observacoes:
      "Certificado DGRM 12/2025, verificação 12.02.2024, válido até 12.02.2026 (registo histórico).",
    prefixo: "AZ",
    territorioTipo: "AZORES",
    regiaoOperacional: null,
    aliases: ["acores", "açores", "azores", "orey azores", "cabouco", "portões vermelhos"],
  },
  {
    codigo: "LISBOA",
    nome: "Lisboa",
    empresa: "Orey",
    localizacao: "Vialonga",
    territorioTipo: "MAINLAND",
    regiaoOperacional: "SUL",
    aliases: ["lisboa", "sul", "lisbon", "orey lisboa", "vialonga"],
  },
  {
    codigo: "AVELEDA",
    nome: "Aveleda",
    empresa: "Orey",
    localizacao: "Aveleda",
    territorioTipo: "MAINLAND",
    regiaoOperacional: "NORTE",
    aliases: ["aveleda", "norte", "leixões", "leixoes", "orey aveleda", "leixoes.tecnica"],
  },
  {
    codigo: "ALCATARILHA",
    nome: "Alcantarilha",
    empresa: "Orey Técnica – Serviços Navais, Lda.",
    localizacao: "Alcantarilha",
    morada: "Zona Industrial e Comercial do Rogel, Lote C – Fração G",
    codigoPostal: "8365-204",
    localidade: "Alcantarilha",
    telefone: "+351 282 322 795",
    telefone2: "+351 282 322 156",
    email: "algarve.tecnica@orey.com",
    website: "www.oreytecnica.com",
    dgrmCertificado: "9/2025",
    dgrmVerificacao: new Date("2025-09-05T12:00:00.000Z"),
    dgrmValidade: new Date("2026-09-19T12:00:00.000Z"),
    dgrmMarcas: "RFD; OCEAN SAFETY; SEA-SAFE",
    observacoes:
      "Certificado DGRM 9/2025, verificação 05.09.2025, válido até 19.09.2026 (registo histórico).",
    territorioTipo: "MAINLAND",
    regiaoOperacional: "SUL",
    aliases: ["alcatarilha", "alcantarilha", "algarve", "orey alcatarilha", "orey alcantarilha"],
  },
];

type ServiceStationRecord = {
  id: number;
  codigo: string;
  nome: string;
};

type ServiceStationDelegate = {
  upsert(args: unknown): Promise<ServiceStationRecord>;
  findMany(args?: unknown): Promise<ServiceStationRecord[]>;
};

function getServiceStationModel(prisma: PrismaClient): ServiceStationDelegate {
  return (prisma as unknown as { serviceStation: ServiceStationDelegate }).serviceStation;
}

export function normalizeServiceStationKey(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resolveServiceStationCode(raw?: string | null): string | null {
  const normalized = normalizeServiceStationKey(raw);
  if (!normalized) return null;

  for (const station of SERVICE_STATION_SEED) {
    if (normalizeServiceStationKey(station.codigo) === normalized) return station.codigo;
    if (normalizeServiceStationKey(station.nome) === normalized) return station.codigo;
    if (station.aliases.some((alias) => normalizeServiceStationKey(alias) === normalized)) {
      return station.codigo;
    }
  }

  return null;
}

export async function seedServiceStations(prisma: PrismaClient) {
  const serviceStationModel = getServiceStationModel(prisma);
  const result = new Map<string, ServiceStationRecord>();
  const activeCodes = SERVICE_STATION_SEED.map((station) => station.codigo);

  for (const station of SERVICE_STATION_SEED) {
    const profileUpdate = {
      ...(station.prefixo !== undefined ? { prefixo: station.prefixo } : {}),
      ...(station.morada !== undefined ? { morada: station.morada } : {}),
      ...(station.codigoPostal !== undefined ? { codigoPostal: station.codigoPostal } : {}),
      ...(station.localidade !== undefined ? { localidade: station.localidade } : {}),
      ...(station.telefone !== undefined ? { telefone: station.telefone } : {}),
      ...(station.telefone2 !== undefined ? { telefone2: station.telefone2 } : {}),
      ...(station.email !== undefined ? { email: station.email } : {}),
      ...(station.website !== undefined ? { website: station.website } : {}),
      ...(station.dgrmCertificado !== undefined ? { dgrmCertificado: station.dgrmCertificado } : {}),
      ...(station.dgrmVerificacao !== undefined ? { dgrmVerificacao: station.dgrmVerificacao } : {}),
      ...(station.dgrmValidade !== undefined ? { dgrmValidade: station.dgrmValidade } : {}),
      ...(station.dgrmMarcas !== undefined ? { dgrmMarcas: station.dgrmMarcas } : {}),
      ...(station.observacoes !== undefined ? { observacoes: station.observacoes } : {}),
    };

    const saved = await serviceStationModel.upsert({
      where: { codigo: station.codigo },
      update: {
        nome: station.nome,
        empresa: station.empresa ?? null,
        localizacao: station.localizacao ?? null,
        ...profileUpdate,
        territorioTipo: station.territorioTipo,
        regiaoOperacional: station.regiaoOperacional ?? null,
        ativo: true,
      },
      create: {
        codigo: station.codigo,
        nome: station.nome,
        empresa: station.empresa ?? null,
        localizacao: station.localizacao ?? null,
        prefixo: station.prefixo ?? null,
        morada: station.morada ?? null,
        codigoPostal: station.codigoPostal ?? null,
        localidade: station.localidade ?? null,
        telefone: station.telefone ?? null,
        telefone2: station.telefone2 ?? null,
        email: station.email ?? null,
        website: station.website ?? null,
        dgrmCertificado: station.dgrmCertificado ?? null,
        dgrmVerificacao: station.dgrmVerificacao ?? null,
        dgrmValidade: station.dgrmValidade ?? null,
        dgrmMarcas: station.dgrmMarcas ?? null,
        observacoes: station.observacoes ?? null,
        territorioTipo: station.territorioTipo,
        regiaoOperacional: station.regiaoOperacional ?? null,
        ativo: true,
      },
    });

    result.set(saved.codigo, saved);
  }

  await (prisma as unknown as { serviceStation: { updateMany(args: unknown): Promise<unknown> } }).serviceStation.updateMany({
    where: { codigo: { notIn: activeCodes } },
    data: { ativo: false },
  });

  // Seed technicians from ContactoInterno contacts
  const collaborators = await prisma.contactoInterno.findMany({
    where: { categoria: "Colaborador", ativo: true },
  });

  const seededEmails = new Set<string>();

  for (const c of collaborators) {
    if (!c.email) continue;
    
    let stationCode: string | null = null;
    const loc = String(c.localizacao || "").toLowerCase();
    
    if (loc.includes("açores") || loc.includes("azores") || loc.includes("es açores")) {
      stationCode = "ACORES";
    } else if (loc.includes("setúbal") || loc.includes("setubal") || loc.includes("azimute")) {
      stationCode = "SETUBAL";
    } else if (loc.includes("vialonga") || loc.includes("lisboa")) {
      stationCode = "LISBOA";
    } else if (loc.includes("aveleda") || loc.includes("leixões") || loc.includes("leixoes")) {
      stationCode = "AVELEDA";
    } else if (loc.includes("alcatarilha") || loc.includes("alcantarilha") || loc.includes("alvantarilha") || loc.includes("algarve")) {
      stationCode = "ALCATARILHA";
    }

    if (stationCode) {
      const stId = result.get(stationCode)?.id ?? null;
      if (stId) {
        // Clean up email if it contains multiple addresses separated by /
        const cleanEmail = c.email.split("/")[0].trim().toLowerCase();
        if (!cleanEmail) continue;

        const saved = await prisma.tecnico.upsert({
          where: { email: cleanEmail },
          update: {
            nome: c.nome,
            serviceStationId: stId,
            ativo: true,
          },
          create: {
            nome: c.nome,
            email: cleanEmail,
            serviceStationId: stId,
            ativo: true,
          },
        });
        await prisma.contactoInterno.update({
          where: { id: c.id },
          data: { tecnicoId: saved.id, serviceStationId: stId },
        });
        seededEmails.add(cleanEmail);
      }
    }
  }

  // Fallback technicians to guarantee each station has employees
  const fallbackTechs = [
    { nome: "Cristiano Gomes", email: "cristiano.gomes@orey.com", stationCode: "AVELEDA" },
    { nome: "Willian Ribeiro", email: "willian.ribeiro@orey.com", stationCode: "AVELEDA" },
    { nome: "Henrique Cardoso", email: "henrique.cardoso@orey.com", stationCode: "AVELEDA" },
    { nome: "Julio Correia", email: "julio.correia@orey.com", stationCode: "ACORES" },
    { nome: "Alex Santos", email: "alex.santos@orey.com", stationCode: "ACORES" },
  ];

  for (const t of fallbackTechs) {
    const emailLower = t.email.toLowerCase();
    if (seededEmails.has(emailLower)) continue;
    
    const stId = result.get(t.stationCode)?.id ?? null;
    if (stId) {
      await prisma.tecnico.upsert({
        where: { email: emailLower },
        update: {
          nome: t.nome,
          serviceStationId: stId,
          ativo: true,
        },
        create: {
          nome: t.nome,
          email: emailLower,
          serviceStationId: stId,
          ativo: true,
        },
      });
    }
  }

  return result;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const stations = await seedServiceStations(prisma);
    console.log(`Estações sincronizadas: ${Array.from(stations.keys()).join(", ")}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
