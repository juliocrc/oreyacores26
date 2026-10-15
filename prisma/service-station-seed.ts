import { PrismaClient } from "@prisma/client";

export type ServiceStationSeedItem = {
  codigo: string;
  nome: string;
  empresa?: string | null;
  localizacao?: string | null;
  territorioTipo: "AZORES" | "MAINLAND" | "MADEIRA";
  regiaoOperacional?: "NORTE" | "CENTRO" | "SUL" | "MADEIRA" | null;
  aliases: string[];
};

export const SERVICE_STATION_SEED: ServiceStationSeedItem[] = [
  {
    codigo: "ACORES",
    nome: "Açores",
    empresa: "Orey",
    localizacao: "Açores",
    territorioTipo: "AZORES",
    regiaoOperacional: null,
    aliases: ["acores", "açores", "azores", "orey azores"],
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
    nome: "Alcatarilha",
    empresa: "Orey",
    localizacao: "Alcatarilha",
    territorioTipo: "MAINLAND",
    regiaoOperacional: "SUL",
    aliases: ["alcatarilha", "alcantarilha", "algarve", "orey alcatarilha"],
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
    const saved = await serviceStationModel.upsert({
      where: { codigo: station.codigo },
      update: {
        nome: station.nome,
        empresa: station.empresa ?? null,
        localizacao: station.localizacao ?? null,
        territorioTipo: station.territorioTipo,
        regiaoOperacional: station.regiaoOperacional ?? null,
        ativo: true,
      },
      create: {
        codigo: station.codigo,
        nome: station.nome,
        empresa: station.empresa ?? null,
        localizacao: station.localizacao ?? null,
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
    } else if (loc.includes("vialonga") || loc.includes("setúbal") || loc.includes("setubal") || loc.includes("lisboa")) {
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

        await prisma.tecnico.upsert({
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
