const CRUISE_LINE_RULES: Array<{ pattern: RegExp; armador: string }> = [
  { pattern: /^QUEEN (ANNE|VICTORIA|ELIZABETH|MARY 2)/, armador: "Cunard Line" },
  { pattern: /^NORWEGIAN /, armador: "Norwegian Cruise Line" },
  { pattern: /^MSC /, armador: "MSC Cruises" },
  { pattern: /^CELEBRITY /, armador: "Celebrity Cruises" },
  { pattern: /^AIDA/, armador: "AIDA Cruises" },
  { pattern: /^COSTA /, armador: "Costa Cruises" },
  {
    pattern:
      /(ODYSSEY|EXPLORER|BRILLIANCE|FREEDOM|LIBERTY|INDEPENDENCE|VOYAGER|MARINER|NAVIGATOR|RADIANCE|RHAPSODY|VISION|ENCHANTMENT|GRANDEUR|SPECTRUM|OVATION|ANTHEM|QUANTUM|HARMONY|SYMPHONY|WONDER|UTOPIA|ICON|OASIS|ALLURE) OF THE SEAS$/,
    armador: "Royal Caribbean International",
  },
  { pattern: /^HEBRIDEAN /, armador: "Hebridean Island Cruises" },
  { pattern: /PRINCESS$/, armador: "Princess Cruises" },
  { pattern: /^SEVEN SEAS /, armador: "Regent Seven Seas Cruises" },
  { pattern: /^SILVER /, armador: "Silversea Cruises" },
  { pattern: /^MEIN SCHIFF /, armador: "TUI Cruises" },
  {
    pattern: /^(LE BOREAL|LE PONANT|L AUSTRAL|L'AUSTRAL|LE LAPEROUSE|LE BELLOT|LE CHAMPLAIN|LE COMMANDANT CHARCOT|LE JACQUES CARTIER|LE DUMONT D URVILLE)$/,
    armador: "Ponant",
  },
  { pattern: /^(STAR CLIPPER|ROYAL CLIPPER|STAR FLYER)$/, armador: "Star Clippers" },
  { pattern: /^(WIND STAR|WIND SPIRIT|STAR BREEZE)$/, armador: "Windstar Cruises" },
  { pattern: /^(AMBIENCE|AMBITION)$/, armador: "Ambassador Cruise Line" },
  { pattern: /^(BOREALIS|BOLETTE|BALMORAL|BLACK WATCH)$/, armador: "Fred. Olsen Cruise Lines" },
  { pattern: /^(ARTANIA|AMERA|AMADEA|ALBATROS)$/, armador: "Phoenix Reisen" },
  { pattern: /^(EUROPA 2?|HANSEATIC .*)$/, armador: "Hapag-Lloyd Cruises" },
  { pattern: /^DISNEY /, armador: "Disney Cruise Line" },
  { pattern: /^CARNIVAL /, armador: "Carnival Cruise Line" },
  { pattern: /^CRYSTAL /, armador: "Crystal Cruises" },
  {
    pattern: /^(MARINA|RIVIERA|NAUTICA|VISTA|ALLURA|INSIGNIA|SIRENA|REGATTA)$/,
    armador: "Oceania Cruises",
  },
  { pattern: /^EXPLORA /, armador: "Explora Journeys" },
  { pattern: /^SEA CLOUD /, armador: "Sea Cloud Cruises" },
  { pattern: /^NATIONAL GEOGRAPHIC /, armador: "Lindblad Expeditions" },
  { pattern: /^ORIENT EXPRESS /, armador: "Orient Express" },
  { pattern: /^HAMBURG$/, armador: "Plantours Kreuzfahrten" },
  { pattern: /^(AURORA|BRITANNIA|ARCADIA|IONA|VENTURA|AZURA)$/, armador: "P&O Cruises" },
  { pattern: /^VASCO DA GAMA$/, armador: "Nicko Cruises" },
  { pattern: /^RENAISSANCE$/, armador: "Compagnie Française de Croisières" },
  { pattern: /^(EVIRIMA|ILMA)$/, armador: "The Ritz-Carlton Yacht Collection" },
  { pattern: /^AMANGATI$/, armador: "Aman" },
  { pattern: /^VIDANTAWORLD/, armador: "Vidanta World" },
  { pattern: /^MARELLA /, armador: "Marella Cruises" },
  { pattern: /^SEABOURN /, armador: "Seabourn" },
  { pattern: /^SPIRIT OF (ADVENTURE|DISCOVERY)$/, armador: "Saga Cruises" },
  { pattern: /^SAGA /, armador: "Saga Cruises" },
  { pattern: /^AZAMARA /, armador: "Azamara Cruises" },
  { pattern: /^VIKING /, armador: "Viking Ocean Cruises" },
  { pattern: /^SCENIC /, armador: "Scenic Luxury Cruises" },
  { pattern: /^PONANT /, armador: "Ponant" },
  { pattern: /^HAPAG/, armador: "Hapag-Lloyd Cruises" },
];

export function normalizeNavioNome(navioNome: string | null | undefined): string {
  return String(navioNome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function inferArmador(navioNome: string | null | undefined): string | null {
  const nome = normalizeNavioNome(navioNome);
  if (!nome) return null;
  for (const rule of CRUISE_LINE_RULES) {
    if (rule.pattern.test(nome)) return rule.armador;
  }
  return null;
}

export function inferArmadorCruzeiro(
  navioNome: string | null | undefined,
  tipoCarga: string | null | undefined,
): string | null {
  const tipo = normalizeNavioNome(tipoCarga);
  if (tipo.includes("CRUZEIRO") || tipo.includes("PASSAGEIRO")) {
    return inferArmador(navioNome);
  }
  return null;
}
