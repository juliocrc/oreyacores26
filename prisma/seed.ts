import { PrismaClient } from "@prisma/client";
import { QUADRO_ARTIGOS_BASE } from "../src/modules/inspectionChecklist";
import { seedServiceStations } from "./service-station-seed";

const prisma = new PrismaClient();

async function main() {
  const stations = await seedServiceStations(prisma);
  const acoresStationId = stations.get("ACORES")?.id ?? null;

  // Seed dos artigos do checklist na tabela Stock
  for (const [i, name] of QUADRO_ARTIGOS_BASE.entries()) {
    const matches = await prisma.stock.findMany({ where: { referencia: `CHK${i + 1}`, serviceStationId: null, OR: [{ lote: "" }, { lote: null }] } });
    if (matches.length > 1) throw new Error("Ambiguous legacy stock; seed requires an explicit Stock ID.");
    const existing = matches[0];
    if (existing) continue;
    await prisma.stock.create({
      data: {
        referencia: `CHK${i + 1}`,
        descricao: name,
        categoria: "Checklist",
        associavelJangada: true,
        aplicavelMarcaJangada: null,
        aplicavelModeloJangada: null,
        precoCompra: 0,
        codigoFabricante: "",
        inventario: "",
        lote: "",
        validade: null,
        precoVenda: 0,
        quantidade: 0,
      },
    });
  }

  const jangadasSeed = [
    {
      serial: "JGD2552025",
      brand: "Zodiac",
      model: "Pro 2025",
      dataFabrico: "2022-05-10",
      packType: "Standard",
      capacity: 12,
      owner: "Empresa Exemplo",
      shipNameManual: "Navio Exemplo",
      dataInspecao: "2025-01-15",
      dataProxInspecao: "2026-01-15",
    },
    {
      serial: "JGD2562025",
      brand: "Viking",
      model: "Rescue 2025",
      dataFabrico: "2023-03-20",
      packType: "Premium",
      capacity: 10,
      owner: "Outro Armador",
      shipNameManual: "Navio 2",
      dataInspecao: "2025-02-10",
      dataProxInspecao: "2026-02-10",
    },
    {
      serial: "JGD2572025",
      brand: "Plastimo",
      model: "Ocean 2025",
      dataFabrico: "2021-11-05",
      packType: "Standard",
      capacity: 8,
      owner: "Terceiro Armador",
      shipNameManual: "Navio 3",
      dataInspecao: "2025-03-01",
      dataProxInspecao: "2026-03-01",
    },
  ];

  for (const j of jangadasSeed) {
    const jangada = await prisma.jangada.upsert({
      where: { serial: j.serial },
      update: {
        serviceStationId: acoresStationId,
        brand: j.brand,
        model: j.model,
        dataFabrico: j.dataFabrico,
        packType: j.packType,
        capacity: j.capacity,
        owner: j.owner,
        shipNameManual: j.shipNameManual,
        dataInspecao: j.dataInspecao,
        dataProxInspecao: j.dataProxInspecao,
      },
      create: {
        ...j,
        serviceStationId: acoresStationId,
      },
    });

    const cert = await prisma.certificadoExtraido.upsert({
      where: { fileName: `certificado_${jangada.serial}_2025.pdf` },
      update: {
        certificadoNumero: `CERT-${jangada.serial}-2025`,
        sourceYear: 2025,
        raftSerial: jangada.serial,
        shipName: jangada.shipNameManual,
        dataInspecao: jangada.dataInspecao,
        dataProxInspecao: jangada.dataProxInspecao,
        emergencyPackType: jangada.packType,
        hasQuadro: true,
      },
      create: {
        fileName: `certificado_${jangada.serial}_2025.pdf`,
        certificadoNumero: `CERT-${jangada.serial}-2025`,
        sourceYear: 2025,
        raftSerial: jangada.serial,
        shipName: jangada.shipNameManual,
        dataInspecao: jangada.dataInspecao,
        dataProxInspecao: jangada.dataProxInspecao,
        emergencyPackType: jangada.packType,
        hasQuadro: true,
      },
    });

    await prisma.certificadoValidade.deleteMany({ where: { certificadoId: cert.id } });
    await prisma.certificadoValidade.createMany({
      data: [
        { certificadoId: cert.id, item: "Facho de Mão", validade: "2026-12-31", rowNumber: 1 },
        { certificadoId: cert.id, item: "Paraquedas", validade: "2026-06-30", rowNumber: 2 },
      ],
      skipDuplicates: true,
    });

    await prisma.jangada.update({
      where: { id: jangada.id },
      data: { certificadoAtivoId: cert.id },
    });
  }

  await prisma.cliente.upsert({
    where: { numeroCliente: "SEED-001" },
    update: { nome: "Cliente Seed Exemplo", serviceStationId: acoresStationId },
    create: {
      nome: "Cliente Seed Exemplo",
      numeroCliente: "SEED-001",
      serviceStationId: acoresStationId,
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
