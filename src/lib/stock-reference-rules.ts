export const FOOD_RATIONS_STOCK_REFERENCE = "30202084";
export const DRINKING_WATER_STOCK_REFERENCE = "30202085";
export const BELLOWS_STOCK_REFERENCE = "20402009";
export const TABLETS_STOCK_REFERENCE = "30202051";
export const HRU_STOCK_REFERENCE = "20701002";

export const PYRO_PARACHUTE_STOCK_REFERENCE = "20500023";
export const PYRO_HANDFLARE_STOCK_REFERENCE = "20500035";
export const PYRO_SMOKE_STOCK_REFERENCE = "20500002";

export const FOOD_RATIONS_REFERENCE_CANDIDATES = [
  FOOD_RATIONS_STOCK_REFERENCE,
  "30202084",
  "RAT-FOOD-500G",
] as const;

export const DRINKING_WATER_REFERENCE_CANDIDATES = [
  DRINKING_WATER_STOCK_REFERENCE,
  "30202085",
  "00904370",
  "RAT-WATER-500ML",
  "RAT-WATER-1.5L",
] as const;

export const BELLOWS_REFERENCE_CANDIDATES = [
  BELLOWS_STOCK_REFERENCE,
  "45201002",
  "R45201001",
] as const;

export const HRU_REFERENCE_CANDIDATES = [
  HRU_STOCK_REFERENCE,
  "RFD-08211009R",
  "08211009R",
] as const;

export const PYRO_PARACHUTE_CANDIDATES = [
  PYRO_PARACHUTE_STOCK_REFERENCE,
  "20577723",
  "SINAL-PARAQUEDAS",
] as const;

export const PYRO_HANDFLARE_CANDIDATES = [
  PYRO_HANDFLARE_STOCK_REFERENCE,
  "FACHO-MAO",
] as const;

export const PYRO_SMOKE_CANDIDATES = [
  PYRO_SMOKE_STOCK_REFERENCE,
  "PYR-SMOKE-ORANGE",
] as const;

export const SB12_24_REFERENCE_RULES = [
  {
    canonical: TABLETS_STOCK_REFERENCE,
    aliases: ["01174009", "DSB00940350", "Z64514", "Z7406"],
    tokens: ["tablet anti-seasick", "seasickness tablets", "seasickness tables", "seasickness tablet", "comprimidos p/ enjoo", "comprimidos para enjoo"],
  },
  {
    canonical: "30202050",
    aliases: ["15199001", "DSB00940220", "05886009", "12865009"],
    tokens: ["kit first aid solas", "kit primeiros socorros solas", "farmacia solas", "farmácia solas", "ambulancia solas", "ambulância solas", "ambulancia", "ambulância"],
  },
  {
    canonical: "06484009",
    aliases: ["11801009", "11802009", "11803009", "11804009", "Z63703", "06556009"],
    tokens: ["kit first aid cat c", "kit primeiros socorros cat c", "farmacia cat c", "farmácia cat c", "ambulancia cat c", "ambulância cat c"],
  },
  {
    canonical: "12874009",
    aliases: ["12162009"],
    tokens: ["kit first aid cat c ext", "kit primeiros socorros cat c ext", "farmacia cat c ext", "farmácia cat c ext", "ambulancia cat c ext", "ambulância cat c ext"],
  },
  {
    canonical: "12866009",
    aliases: ["11785009", "11786009", "11787009", "11796009", "11797009", "12236009", "Z64186"],
    tokens: ["light reading rl6", "internal lamp unit rl6", "luz interna rl6"],
  },
  {
    canonical: "12868009",
    aliases: ["11788009", "11790009", "11793009", "11798009", "11799009", "12235009", "Z64228"],
    tokens: ["external lamp unit rl6", "light p.i. rl6 survitec 650mm", "luz externa rl6"],
  },
  {
    canonical: "12867009",
    aliases: ["11791009", "11800009"],
    tokens: ["light p.i. rl6 survitec 3500mm"],
  },
  {
    canonical: "12875009",
    aliases: ["11794009", "Z64233"],
    tokens: ["light p.i. rl6 survitec 4000mm"],
  },
  {
    canonical: "12869009",
    aliases: ["08279009", "R08279009", "08402009", "11848009", "30202206"],
    tokens: ["internal lamp unit rl5", "lamp/int+batt", "luz interna rl5", "bateria de litio rl5", "bateria de lítio rl5"],
  },
  {
    canonical: "12870009",
    aliases: ["08280009", "R08280009", "08403009", "11847009"],
    tokens: ["external lamp unit rl5", "lamp unit marine ext. rl5", "luz externa rl5", "top light and battery"],
  },
  {
    canonical: "12871009",
    aliases: ["08461009"],
    tokens: ["lamp unit marine ext. rl5 950mm"],
  },
  {
    canonical: "12872009",
    aliases: ["06729009", "08195009"],
    tokens: ["power unit assy. marine rb2", "kit luz rb2"],
  },
  {
    canonical: "80913820",
    aliases: ["Z68106"],
    tokens: ["battery rl6 + line ribo"],
  },
] as const;

const FOOD_RATIONS_TOKENS = [
  "food ration",
  "food rations",
  "ration",
  "rations",
  "racao",
  "racoes",
  "ração",
  "rações",
];

const DRINKING_WATER_TOKENS = [
  "drinking water",
  "water sachet",
  "water sachets",
  "water ration",
  "agua",
  "aguas",
  "água",
  "águas",
];

const BELLOWS_TOKENS = [
  "bellows",
  "pump / bellows",
  "bomba / fole",
  "bomba de ar / fole",
  "fole",
];

const HRU_TOKENS = [
  "hydrostatic release unit",
  "hammar h20",
  "disparador hammar h20",
];

const PYRO_PARACHUTE_TOKENS = [
  "parachute rocket",
  "parachute rockets",
  "parachute flare",
  "parachute signals",
  "sinal com paraquedas",
  "foguete paraquedas",
  "paraquedas",
  "rocket",
];

const PYRO_HANDFLARE_TOKENS = [
  "red hand flare",
  "flare hand",
  "hand flare",
  "handflare",
  "handflares",
  "facho de mao",
  "facho de mão",
  "facho",
];

const PYRO_SMOKE_TOKENS = [
  "smoke signal",
  "floating smoke",
  "pote de fumo",
  "potes de fumo",
  "sinal fumigeno",
  "fumo",
];

function normalizeReferenceRuleText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function includesAnyNormalizedToken(normalized: string, tokens: readonly string[]) {
  return tokens.some((token) => {
    const t = normalizeReferenceRuleText(token);
    if (!t) return false;
    if (normalized === t) return true;
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|[\\s,;/-])${escaped}(?:$|[\\s,;/-])`, 'i');
    return regex.test(normalized);
  });
}

export function isFoodRationsLike(...values: Array<unknown>) {
  return values.some((value) => {
    const normalized = normalizeReferenceRuleText(value);
    if (!normalized) return false;

    return includesAnyNormalizedToken(normalized, FOOD_RATIONS_TOKENS);
  });
}

export function isDrinkingWaterLike(...values: Array<unknown>) {
  return values.some((value) => {
    const normalized = normalizeReferenceRuleText(value);
    if (!normalized) return false;

    return includesAnyNormalizedToken(normalized, DRINKING_WATER_TOKENS);
  });
}

export function isBellowsLike(...values: Array<unknown>) {
  return values.some((value) => {
    const normalized = normalizeReferenceRuleText(value);
    if (!normalized) return false;

    return includesAnyNormalizedToken(normalized, BELLOWS_TOKENS);
  });
}

export function isHruLike(...values: Array<unknown>) {
  return values.some((value) => {
    const normalized = normalizeReferenceRuleText(value);
    if (!normalized) return false;

    return includesAnyNormalizedToken(normalized, HRU_TOKENS);
  });
}

export function normalizeStockReferenceByRule(
  reference: unknown,
  ...contextValues: Array<unknown>
) {
  const normalizedReference = String(reference ?? "").trim();
  const normalizedReferenceText = normalizeReferenceRuleText(normalizedReference);
  const normalizedContext = contextValues
    .map((value) => normalizeReferenceRuleText(value))
    .filter(Boolean)
    .join(" | ");

  if (
    FOOD_RATIONS_REFERENCE_CANDIDATES.some(
      (candidate) => normalizeReferenceRuleText(candidate) === normalizedReferenceText
    ) ||
    isFoodRationsLike(reference, ...contextValues)
  ) {
    return FOOD_RATIONS_STOCK_REFERENCE;
  }

  if (
    DRINKING_WATER_REFERENCE_CANDIDATES.some(
      (candidate) => normalizeReferenceRuleText(candidate) === normalizedReferenceText
    ) ||
    isDrinkingWaterLike(reference, ...contextValues)
  ) {
    return DRINKING_WATER_STOCK_REFERENCE;
  }

  if (
    BELLOWS_REFERENCE_CANDIDATES.some(
      (candidate) => normalizeReferenceRuleText(candidate) === normalizedReferenceText
    ) ||
    isBellowsLike(reference, ...contextValues)
  ) {
    return BELLOWS_STOCK_REFERENCE;
  }

  if (
    HRU_REFERENCE_CANDIDATES.some(
      (candidate) => normalizeReferenceRuleText(candidate) === normalizedReferenceText
    ) ||
    isHruLike(reference, ...contextValues)
  ) {
    return HRU_STOCK_REFERENCE;
  }

  if (
    PYRO_PARACHUTE_CANDIDATES.some(
      (candidate) => normalizeReferenceRuleText(candidate) === normalizedReferenceText
    ) ||
    includesAnyNormalizedToken(normalizedContext, PYRO_PARACHUTE_TOKENS)
  ) {
    return PYRO_PARACHUTE_STOCK_REFERENCE;
  }

  if (
    PYRO_HANDFLARE_CANDIDATES.some(
      (candidate) => normalizeReferenceRuleText(candidate) === normalizedReferenceText
    ) ||
    includesAnyNormalizedToken(normalizedContext, PYRO_HANDFLARE_TOKENS)
  ) {
    return PYRO_HANDFLARE_STOCK_REFERENCE;
  }

  if (
    PYRO_SMOKE_CANDIDATES.some(
      (candidate) => normalizeReferenceRuleText(candidate) === normalizedReferenceText
    ) ||
    includesAnyNormalizedToken(normalizedContext, PYRO_SMOKE_TOKENS)
  ) {
    return PYRO_SMOKE_STOCK_REFERENCE;
  }

  for (const rule of SB12_24_REFERENCE_RULES) {
    const matchesAlias = [rule.canonical, ...rule.aliases].some(
      (candidate) => normalizeReferenceRuleText(candidate) === normalizedReferenceText
    );
    const matchesToken = normalizedContext ? includesAnyNormalizedToken(normalizedContext, rule.tokens) : false;

    if (matchesAlias || matchesToken) {
      return rule.canonical;
    }
  }

  return normalizedReference;
}