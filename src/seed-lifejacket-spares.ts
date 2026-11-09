import prisma from './lib/prisma';

/**
 * Seed: Lifejacket Spares (Test and Spares - Lifejackets)
 * Organized by warehouse corridor + shelf position.
 *
 * LAYOUT:
 *   Corredor A → OP_HEADS (cabeças de acionamento)
 *   Corredor B → BOBBINS / KITS_RECARGA (recargas e pastilhas)
 *   Corredor C → CILINDROS / GASKETS / CLIPS / VALVES
 *   Corredor D → LUZES / ACESSORIOS / FERRAGENS / SPRAYHOODS / QUIMICOS
 */

const stockItems = [
  // ═══════════════════════════════════════════════════════════════
  // CORREDOR A — OP_HEADS (Cabeças de Acionamento)
  // ═══════════════════════════════════════════════════════════════

  // A-1: HR (Halkey Roberts)
  { referencia: "HR-ALPHA-AUTO-OP",   descricao: "HR Alpha automatic op head",                           categoria: "OP_HEADS",   localizacao: "A-1", quantidade: 0, precoVenda: 29.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "HR-EURO-AUTO-UPPER", descricao: "HR Euro automatic op head upper",                      categoria: "OP_HEADS",   localizacao: "A-1", quantidade: 0, precoVenda: 12.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "HR-EURO-END-CAP",    descricao: "HR Euro auto op head end cap",                         categoria: "OP_HEADS",   localizacao: "A-1", quantidade: 0, precoVenda: 12.00, estadoArtigo: "ATIVO", associavelJangada: true },

  // A-2: UML
  { referencia: "UML-PROSENSOR-MAN",   descricao: "UML Pro-Sensor Manual Single point indicator op head",  categoria: "OP_HEADS", localizacao: "A-2", quantidade: 0, precoVenda: 30.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "UML-PROSENSOR-AUTO",  descricao: "UML Pro-Sensor Automatic Dual point indicator op head", categoria: "OP_HEADS", localizacao: "A-2", quantidade: 0, precoVenda: 32.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "UML-MK5-AUTO",        descricao: "UML Mk5 Automatic op head",                             categoria: "OP_HEADS", localizacao: "A-2", quantidade: 0, precoVenda: 29.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "UML-MK5I-AUTO",       descricao: "UML Mk5i Automatic op head",                            categoria: "OP_HEADS", localizacao: "A-2", quantidade: 0, precoVenda: 32.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "UML-MK5-MAN",         descricao: "UML Mk5 Manual op head",                                categoria: "OP_HEADS", localizacao: "A-2", quantidade: 0, precoVenda: 23.00, estadoArtigo: "ATIVO", associavelJangada: true },

  // A-3: HM (Hammar)
  { referencia: "HM-A1-AUTO",       descricao: "HM A1 Automatic op head",                     categoria: "OP_HEADS", localizacao: "A-3", quantidade: 0, precoVenda: 25.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "HM-A1-CAP",        descricao: "HM A1 Automatic op head cap",                 categoria: "OP_HEADS", localizacao: "A-3", quantidade: 0, precoVenda: 12.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "HM-MA1-AUTO-33G",  descricao: "HM MA1 Automatic op head with 33 gr CO2 bottle", categoria: "OP_HEADS", localizacao: "A-3", quantidade: 0, precoVenda: 41.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "HM-MA1-AUTO-60G",  descricao: "HM MA1 Automatic op head with 60 gr CO2 bottle", categoria: "OP_HEADS", localizacao: "A-3", quantidade: 0, precoVenda: 46.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "HM-M1-MAN",        descricao: "HM M1 Manual op head",                         categoria: "OP_HEADS", localizacao: "A-3", quantidade: 0, precoVenda: 12.00, estadoArtigo: "ATIVO", associavelJangada: true },

  // A-4: LZ (Lalizas)
  { referencia: "LZ-MAN-OP",   descricao: "LZ Manual op head",       categoria: "OP_HEADS", localizacao: "A-4", quantidade: 0, precoVenda: 9.80,  estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "LZ-JS1-AUTO", descricao: "LZ JS1 Auto op head",     categoria: "OP_HEADS", localizacao: "A-4", quantidade: 0, precoVenda: 17.90, estadoArtigo: "ATIVO", associavelJangada: true },

  // ═══════════════════════════════════════════════════════════════
  // CORREDOR B — BOBBINS / KITS_RECARGA
  // ═══════════════════════════════════════════════════════════════

  // B-1: Bobbins (pastilhas / cartuchos de recarga)
  { referencia: "HR-BOBBIN-SUPER",      descricao: "HR Super bobbin",                categoria: "BOBBINS",      localizacao: "B-1", quantidade: 0, precoVenda: 6.00,  estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "UML-MK5-REARM-BLACK",  descricao: "UML Mk5 Re-arm cartridge black",  categoria: "BOBBINS",      localizacao: "B-1", quantidade: 0, precoVenda: 8.00,  estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "UML-MK5I-REARM-GREY",  descricao: "UML Mk5i Re-arm cartridge grey",  categoria: "BOBBINS",      localizacao: "B-1", quantidade: 0, precoVenda: 9.50,  estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "LZ-JS1-REARM",         descricao: "LZ JS1 Re-arm cartridge",         categoria: "BOBBINS",      localizacao: "B-1", quantidade: 0, precoVenda: 9.50,  estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "SECUMAR-PILL",         descricao: "Secumar pill",                     categoria: "BOBBINS",      localizacao: "B-1", quantidade: 0, precoVenda: 4.00,  estadoArtigo: "ATIVO", associavelJangada: true },

  // B-2: Kits de recarga (bobbin + cilindro combos)
  { referencia: "LZ-JS1-REARM-33G",   descricao: "LZ JS1 Auto Re-arm kit with 33 gr bottle",     categoria: "KITS_RECARGA", localizacao: "B-2", quantidade: 0, precoVenda: 14.50, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "LZ-JS1-REARM-20G",   descricao: "LZ JS1 Auto Re-arm kit with 20 gr bottle",     categoria: "KITS_RECARGA", localizacao: "B-2", quantidade: 0, precoVenda: 14.50, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "LZ-MAN-REARM-33G",   descricao: "LZ Manual Re-arm kit with 33 gr bottle",       categoria: "KITS_RECARGA", localizacao: "B-2", quantidade: 0, precoVenda: 15.80, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "HM-MA1-AUTO-33G-KIT",descricao: "HM MA1 Automatic op head with 33 gr CO2 bottle", categoria: "KITS_RECARGA", localizacao: "B-2", quantidade: 0, precoVenda: 41.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "HM-MA1-AUTO-60G-KIT",descricao: "HM MA1 Automatic op head with 60 gr CO2 bottle", categoria: "KITS_RECARGA", localizacao: "B-2", quantidade: 0, precoVenda: 46.00, estadoArtigo: "ATIVO", associavelJangada: true },

  // ═══════════════════════════════════════════════════════════════
  // CORREDOR C — CILINDROS / GASKETS / CLIPS / VALVES
  // ═══════════════════════════════════════════════════════════════

  // C-1: Cilindros CO2
  { referencia: "CO2-20G",             descricao: "20 gr CO2 bottle",     categoria: "CILINDROS", localizacao: "C-1", quantidade: 0, precoVenda: 8.00,  estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "CO2-33G-STANDARD",    descricao: "33 gr CO2 bottle",     categoria: "CILINDROS", localizacao: "C-1", quantidade: 0, precoVenda: 8.00,  estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "CO2-38G-STANDARD",    descricao: "38 gr CO2 bottle",     categoria: "CILINDROS", localizacao: "C-1", quantidade: 0, precoVenda: 10.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "CO2-60G-STANDARD",    descricao: "60 gr CO2 bottle",     categoria: "CILINDROS", localizacao: "C-1", quantidade: 0, precoVenda: 11.00, estadoArtigo: "ATIVO", associavelJangada: true },

  // C-2: Gaskets / O-rings / Washers (vedações)
  { referencia: "HR-GASKET-INNER",   descricao: "HR inner service gasket",        categoria: "GASKETS", localizacao: "C-2", quantidade: 0, precoVenda: 1.50, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "HR-GASKET-TABBED",  descricao: "HR tabbed gasket cylinder-head",  categoria: "GASKETS", localizacao: "C-2", quantidade: 0, precoVenda: 1.50, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "HR-WASHER-LOWER",   descricao: "HR Valve stern washer lower",     categoria: "GASKETS", localizacao: "C-2", quantidade: 0, precoVenda: 1.50, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "HR-WASHER-UPPER",   descricao: "HR Valve stern washer upper",     categoria: "GASKETS", localizacao: "C-2", quantidade: 0, precoVenda: 1.50, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "UML-ORING",         descricao: "UML o'ring",                      categoria: "GASKETS", localizacao: "C-2", quantidade: 0, precoVenda: 1.50, estadoArtigo: "ATIVO", associavelJangada: true },

  // C-3: Clips (retenção)
  { referencia: "HR-CLIP-ALPHA-GREEN",  descricao: "HR Alpha retaining green clip",         categoria: "CLIPS", localizacao: "C-3", quantidade: 0, precoVenda: 1.50, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "HR-CLIP-EURO-GREEN",   descricao: "HR Euro green retaining clip",           categoria: "CLIPS", localizacao: "C-3", quantidade: 0, precoVenda: 2.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "UML-CLIP-MAN-ROUND",   descricao: "UML Manual round green retaining clip",  categoria: "CLIPS", localizacao: "C-3", quantidade: 0, precoVenda: 1.50, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "UML-CLIP-AUTO-SQUARE", descricao: "UML Automatic square green retaining clip", categoria: "CLIPS", localizacao: "C-3", quantidade: 0, precoVenda: 1.50, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "LZ-CLIP-GREEN",        descricao: "LZ green retaining clip",                categoria: "CLIPS", localizacao: "C-3", quantidade: 0, precoVenda: 2.00, estadoArtigo: "ATIVO", associavelJangada: true },

  // C-4: Valves (válvulas / tubos orais)
  { referencia: "HR-ORAL-OPV-WHITE",   descricao: "HR oral tube over pressure valve white",    categoria: "VALVES", localizacao: "C-4", quantidade: 0, precoVenda: 9.50, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "HR-ORAL-NRV-BLACK",   descricao: "HR oral tube non-return valve black",        categoria: "VALVES", localizacao: "C-4", quantidade: 0, precoVenda: 5.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "HR-ORAL-CAP",          descricao: "HR oral tube cap",                          categoria: "VALVES", localizacao: "C-4", quantidade: 0, precoVenda: 3.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "UML-ORAL-OPV-WHITE",  descricao: "UML oral tube over pressure valve white",   categoria: "VALVES", localizacao: "C-4", quantidade: 0, precoVenda: 11.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "UML-ORAL-NRV-BLACK",  descricao: "UML oral tube non-return valve black",       categoria: "VALVES", localizacao: "C-4", quantidade: 0, precoVenda: 6.50,  estadoArtigo: "ATIVO", associavelJangada: true },

  // ═══════════════════════════════════════════════════════════════
  // CORREDOR D — LUZES / ACESSORIOS / FERRAGENS / SPRAYHOODS / QUIMICOS
  // ═══════════════════════════════════════════════════════════════

  // D-1: Luzes de emergência
  { referencia: "LIGHT-DAN-AUTO-W2",  descricao: "Light and battery Auto Dan W2",                    categoria: "LUZES", localizacao: "D-1", quantidade: 0, precoVenda: 17.50, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "LIGHT-DAN-MAN-M2",   descricao: "Light and battery Manual Dan M2",                   categoria: "LUZES", localizacao: "D-1", quantidade: 0, precoVenda: 17.50, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "LIGHT-DAN-AUTO-W3",  descricao: "Light and battery Auto Dan W3",                    categoria: "LUZES", localizacao: "D-1", quantidade: 0, precoVenda: 13.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "LIGHT-DAN-MAN-M3",   descricao: "Light and battery Manual Dan M3",                   categoria: "LUZES", localizacao: "D-1", quantidade: 0, precoVenda: 13.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "LIGHT-CFX-II",       descricao: "Light and battery Auto-Manual CFX-II two piece",   categoria: "LUZES", localizacao: "D-1", quantidade: 0, precoVenda: 16.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "LIGHT-CFX-I",        descricao: "Light and battery Auto-Manual CFX-I",              categoria: "LUZES", localizacao: "D-1", quantidade: 0, precoVenda: 15.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "LIGHT-SLX-LED",      descricao: "Light and battery Auto-Manual SLX Flashing LED",   categoria: "LUZES", localizacao: "D-1", quantidade: 0, precoVenda: 15.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "LIGHT-SAFELITE-I",   descricao: "Light and battery Auto-manual safelite",           categoria: "LUZES", localizacao: "D-1", quantidade: 0, precoVenda: 12.60, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "LIGHT-SAFELITE-II",  descricao: "Light and battery Auto-manual safelite-II LED",    categoria: "LUZES", localizacao: "D-1", quantidade: 0, precoVenda: 12.60, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "LIGHT-SAFELITE-III", descricao: "Light and battery Auto-manual safelite-III LED",   categoria: "LUZES", localizacao: "D-1", quantidade: 0, precoVenda: 12.60, estadoArtigo: "ATIVO", associavelJangada: true },

  // D-2: Sprayhoods / Malas / Cintos
  { referencia: "SPRAYHOOD-150N",     descricao: "150N Sprayhood",              categoria: "SPRAYHOODS", localizacao: "D-2", quantidade: 0, precoVenda: 18.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "SPRAYHOOD-275N",     descricao: "275N Sprayhood",              categoria: "SPRAYHOODS", localizacao: "D-2", quantidade: 0, precoVenda: 26.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "MESH-BAG-SMALL",     descricao: "Small mesh bag",              categoria: "ACESSORIOS", localizacao: "D-2", quantidade: 0, precoVenda: 3.50,  estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "MESH-BAG-LARGE",     descricao: "Large mesh bag",              categoria: "ACESSORIOS", localizacao: "D-2", quantidade: 0, precoVenda: 4.00,  estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "WAISTBELT-XXL",      descricao: "Waistbelt extender for XXL people", categoria: "ACESSORIOS", localizacao: "D-2", quantidade: 0, precoVenda: 9.00,  estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "CROTCHSTRAP-ADULT",  descricao: "Adult Crotchstrap",            categoria: "ACESSORIOS", localizacao: "D-2", quantidade: 0, precoVenda: 7.50,  estadoArtigo: "ATIVO", associavelJangada: true },

  // D-3: Ferragens / Sardas / Buckles
  { referencia: "SS-D-RING",             descricao: "Stainless Steel D Ring",              categoria: "FERRAGENS", localizacao: "D-3", quantidade: 0, precoVenda: 5.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "SS-FASTENER-2BAR-40MM", descricao: "Stainless Steel 2 bars fastener 40mm", categoria: "FERRAGENS", localizacao: "D-3", quantidade: 0, precoVenda: 4.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "SS-FASTENER-3BAR-40MM", descricao: "Stainless Steel 3 bars fastener 40mm", categoria: "FERRAGENS", localizacao: "D-3", quantidade: 0, precoVenda: 4.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "BUCKLE-40MM-BLACK",     descricao: "Plastic Buckle 40mm black",            categoria: "FERRAGENS", localizacao: "D-3", quantidade: 0, precoVenda: 2.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "BUCKLE-40MM-BLUE",      descricao: "Plastic Buckle 40mm blue",             categoria: "FERRAGENS", localizacao: "D-3", quantidade: 0, precoVenda: 3.00, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "WHISTLE-COLETE",        descricao: "Whistle",                              categoria: "FERRAGENS", localizacao: "D-3", quantidade: 0, precoVenda: 3.00, estadoArtigo: "ATIVO", associavelJangada: true },

  // D-4: Químicos / Retrorefletivo
  { referencia: "RETRO-TAPE-KIT",     descricao: "Solas retroflective tape kit",  categoria: "ACESSORIOS", localizacao: "D-4", quantidade: 0, precoVenda: 3.50, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "CYALUME-LIGHTSTICK", descricao: "Cyalume Lightstick",            categoria: "QUIMICOS",  localizacao: "D-4", quantidade: 0, precoVenda: 2.50, estadoArtigo: "ATIVO", associavelJangada: true },
  { referencia: "SEA-MARKER-DYE",     descricao: "Sea Marker Dye",                categoria: "QUIMICOS",  localizacao: "D-4", quantidade: 0, precoVenda: 18.50, estadoArtigo: "ATIVO", associavelJangada: true },
];

async function main() {
  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  Seed: Lifejacket Spares → Stock (with shelf locations) ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);
  console.log(`  Total items: ${stockItems.length}\n`);

  const stations = await prisma.serviceStation.findMany();

  if (stations.length === 0) {
    console.log("  ⚠  No service stations found — creating items without station.\n");
    for (const item of stockItems) {
      try {
        const matches = await prisma.stock.findMany({ where: { referencia: item.referencia, serviceStationId: null, OR: [{ lote: "" }, { lote: null }] } });
        if (matches.length > 1) throw new Error("Ambiguous legacy stock; seed requires an explicit Stock ID.");
        const existing = matches[0];
        if (existing?.lote === null) { console.log(`Preserved unknown legacy stock ID ${existing.id}`); continue; }
        const created = existing
          ? await prisma.stock.update({
              where: { id: existing.id },
              data: {
                precoVenda: item.precoVenda,
                categoria: item.categoria,
                descricao: item.descricao,
                localizacao: item.localizacao,
                estadoArtigo: item.estadoArtigo,
                associavelJangada: item.associavelJangada,
              },
            })
          : await prisma.stock.create({
              data: {
                ...item,
                lote: "",
                serviceStationId: null,
              },
            });
        console.log(`  ✓ ${created.localizacao || "???"} │ ${created.referencia.padEnd(28)} │ ${created.descricao}`);
      } catch (e: unknown) {
        console.error(`  ✗ ${item.referencia}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } else {
    for (const station of stations) {
      console.log(`  📦 Station: ${station.codigo}\n`);
      for (const item of stockItems) {
        try {
          const legacy = await prisma.stock.findMany({ where: { referencia: item.referencia, serviceStationId: station.id, lote: null } });
          if (legacy.length > 1) throw new Error("Ambiguous legacy stock; seed requires an explicit Stock ID.");
          if (legacy.length) { console.log(`Preserved unknown legacy stock ID ${legacy[0].id}`); continue; }
          const created = await prisma.stock.upsert({
            where: {
              referencia_serviceStationId_lote: {
                lote: "",
                referencia: item.referencia,
                serviceStationId: station.id,
              },
            },
            update: {
              precoVenda: item.precoVenda,
              categoria: item.categoria,
              descricao: item.descricao,
              localizacao: item.localizacao,
              estadoArtigo: item.estadoArtigo,
              associavelJangada: item.associavelJangada,
            },
            create: {
              ...item,
              lote: "",
              serviceStationId: station.id,
            },
          });
          console.log(`  ✓ ${created.localizacao || "???"} │ ${created.referencia.padEnd(28)} │ ${created.descricao}`);
        } catch (e: unknown) {
          console.error(`  ✗ ${item.referencia}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  }

  console.log(`\n✅ Done! ${stockItems.length} lifejacket spares seeded with shelf locations.\n`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
