import prisma from './lib/prisma';

async function main() {
  const stockItems = [
    {
      referencia: "CO2-33G",
      descricao: "Cilindro CO2 33g",
      categoria: "CILINDROS",
      quantidade: 50,
      precoVenda: 15.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-CO2-33",
      validade: "2030-12"
    },
    {
      referencia: "CO2-38G",
      descricao: "Cilindro CO2 38g",
      categoria: "CILINDROS",
      quantidade: 30,
      precoVenda: 18.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-CO2-38",
      validade: "2030-12"
    },
    {
      referencia: "CO2-60G",
      descricao: "Cilindro CO2 60g",
      categoria: "CILINDROS",
      quantidade: 20,
      precoVenda: 25.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-CO2-60",
      validade: "2030-12"
    },
    {
      referencia: "BOBBIN-UML",
      descricao: "Pastilha de Sal (Bobbin) UML",
      categoria: "PASTILHAS",
      quantidade: 100,
      precoVenda: 5.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-BOB-UML",
      validade: "2028-06"
    },
    {
      referencia: "BOBBIN-HR",
      descricao: "Pastilha de Sal (Bobbin) Halkey Roberts",
      categoria: "PASTILHAS",
      quantidade: 80,
      precoVenda: 6.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-BOB-HR",
      validade: "2028-06"
    },
    {
      referencia: "LIGHT-LALIZAS",
      descricao: "Luz de Emergência Lalizas",
      categoria: "LUZES",
      quantidade: 40,
      precoVenda: 12.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-LGT-LAL",
      validade: "2029-05"
    },
    {
      referencia: "WHISTLE-EMERG",
      descricao: "Apito de Emergência",
      categoria: "APITOS",
      quantidade: 150,
      precoVenda: 2.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-WHL-EMG",
      validade: null
    }
  ];

  console.log("Seeding colete stock items...");

  // Query all service stations to seed stock items for each
  const stations = await prisma.serviceStation.findMany();

  for (const station of stations) {
    console.log(`Seeding for station ${station.codigo}...`);
    for (const item of stockItems) {
      const legacy = await prisma.stock.findMany({ where: { referencia: item.referencia, serviceStationId: station.id, lote: null } });
      if (legacy.length > 1) throw new Error("Ambiguous legacy stock; seed requires an explicit Stock ID.");
      if (legacy.length) { console.log(`Preserved unknown legacy stock ID ${legacy[0].id}`); continue; }
      const created = await prisma.stock.upsert({
        where: {
          referencia_serviceStationId_lote: {
            lote: item.lote,
            referencia: item.referencia,
            serviceStationId: station.id
          }
        },
        update: {
          quantidade: item.quantidade,
          categoria: item.categoria,
          descricao: item.descricao,
          lote: item.lote,
          validade: item.validade
        },
        create: {
          ...item,
          serviceStationId: station.id
        }
      });
      console.log(`  Upserted: ${created.referencia} - ${created.descricao}`);
    }
  }

  console.log("Seeding completed successfully.");
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
