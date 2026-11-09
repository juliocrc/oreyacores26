import prisma from './lib/prisma';

async function main() {
  const stockItems = [
    {
      referencia: "DW-RAH/V170",
      descricao: "Re-arming Kit Hammar Vito 170N (Spinlock)",
      categoria: "KITS_RECARGA",
      quantidade: 15,
      precoVenda: 75.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-RAH-V170",
      validade: "2029-12"
    },
    {
      referencia: "DW-RAH/V275",
      descricao: "Re-arming Kit Hammar Vito 275N (Spinlock)",
      categoria: "KITS_RECARGA",
      quantidade: 10,
      precoVenda: 85.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-RAH-V275",
      validade: "2029-12"
    },
    {
      referencia: "DW-UMK5",
      descricao: "UML MK5 Firing Unit (Spinlock)",
      categoria: "PASTILHAS",
      quantidade: 25,
      precoVenda: 45.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-UMK5",
      validade: "2028-06"
    },
    {
      referencia: "DW-UPS",
      descricao: "UML Pro Sensor Elite Firing Unit (Spinlock)",
      categoria: "PASTILHAS",
      quantidade: 20,
      precoVenda: 55.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-UPS",
      validade: "2028-06"
    },
    {
      referencia: "DW-UML5",
      descricao: "Cápsula Automática UML MK5i (Spinlock)",
      categoria: "PASTILHAS",
      quantidade: 50,
      precoVenda: 15.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-UML5",
      validade: "2028-06"
    },
    {
      referencia: "DW-UMLE",
      descricao: "Cápsula Automática UML Elite (Spinlock)",
      categoria: "PASTILHAS",
      quantidade: 40,
      precoVenda: 20.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-UMLE",
      validade: "2028-06"
    },
    {
      referencia: "DW-SV06",
      descricao: "Cilindro CO2 33g/60g com O-ring (Spinlock)",
      categoria: "CILINDROS",
      quantidade: 35,
      precoVenda: 22.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-SV06",
      validade: "2030-12"
    },
    {
      referencia: "DV-SV5",
      descricao: "Cilindro CO2 UML Pro Sensor (Spinlock)",
      categoria: "CILINDROS",
      quantidade: 30,
      precoVenda: 25.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-DVSV5",
      validade: "2030-12"
    },
    {
      referencia: "DW-BLD/170UML/3",
      descricao: "Câmara Insuflável (Bladder) 170N (Spinlock)",
      categoria: "BEXIGAS",
      quantidade: 5,
      precoVenda: 90.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-BLD-170",
      validade: null
    },
    {
      referencia: "DW-BLD/DURO275",
      descricao: "Câmara Insuflável (Bladder) 275N (Spinlock)",
      categoria: "BEXIGAS",
      quantidade: 5,
      precoVenda: 110.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-BLD-275",
      validade: null
    },
    {
      referencia: "20190",
      descricao: "Kit Recarga JS1 Automático Adulto 33g (Lalizas)",
      categoria: "KITS_RECARGA",
      quantidade: 30,
      precoVenda: 35.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-20190",
      validade: "2029-06"
    },
    {
      referencia: "20200",
      descricao: "Kit Recarga JS1 Automático Criança 22g (Lalizas)",
      categoria: "KITS_RECARGA",
      quantidade: 20,
      precoVenda: 30.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-20200",
      validade: "2029-06"
    },
    {
      referencia: "71323",
      descricao: "Kit Recarga Manual Adulto 33g (Lalizas)",
      categoria: "KITS_RECARGA",
      quantidade: 40,
      precoVenda: 25.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-71323",
      validade: "2029-06"
    },
    {
      referencia: "71741",
      descricao: "Kit Recarga Hammar MA1 Adulto 33g (Lalizas)",
      categoria: "KITS_RECARGA",
      quantidade: 15,
      precoVenda: 70.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-71741",
      validade: "2028-12"
    },
    {
      referencia: "00348",
      descricao: "Cilindro CO2 Lalizas 33g",
      categoria: "CILINDROS",
      quantidade: 60,
      precoVenda: 16.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-00348",
      validade: "2030-12"
    },
    {
      referencia: "00349",
      descricao: "Cilindro CO2 Lalizas 22g",
      categoria: "CILINDROS",
      quantidade: 40,
      precoVenda: 14.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-00349",
      validade: "2030-12"
    },
    {
      referencia: "02197",
      descricao: "Cilindro CO2 Lalizas 60g",
      categoria: "CILINDROS",
      quantidade: 25,
      precoVenda: 26.0,
      estadoArtigo: "ATIVO",
      associavelJangada: false,
      lote: "L-02197",
      validade: "2030-12"
    }
  ];

  console.log("Seeding new colete stock items from manuals...");

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
            lote: item.lote || "",
            referencia: item.referencia,
            serviceStationId: station.id
          }
        },
        update: {
          quantidade: item.quantidade,
          categoria: item.categoria,
          descricao: item.descricao,
          lote: item.lote,
          validade: item.validade,
          precoVenda: item.precoVenda
        },
        create: {
          ...item,
          serviceStationId: station.id
        }
      });
      console.log(`  Upserted: ${created.referencia} - ${created.descricao}`);
    }
  }

  console.log("Seeding of new colete stock items completed successfully.");
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
