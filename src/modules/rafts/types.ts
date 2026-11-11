export type RaftCylinderData = {
  co2?: number;
  n2?: number;
  volume?: number;
};

export type RaftTechnicalItem = {
  name: string;
  category?: string;
  quantity?: string;
  reference?: string;
  notes?: string;
  capacities?: number[];
  applicablePacks?: string[];
  optional?: boolean;
};

export type RaftPackEquipment = {
  pack: string;
  summary?: string;
  items: RaftTechnicalItem[];
};

export type RaftSpecification = {
  codRef?: string;
  capacity: number;
  cylinder?: RaftCylinderData;
  pack?: string;
  configuration?: string;
  inflationSystem?: string;
  valves?: string;
  source?: {
    doc: string;
    manual?: string;
    chapter?: string;
    page?: string;
    revision?: string;
    note?: string;
  };
};

export type TechnicalBulletinRule = {
  label: string;
  canonicalModel?: string;
  aliases: string[];
  technicalModels?: string[];
  containerAliases?: string[];
  capacities?: number[];
  maxStowageHeightMeters?: number;
  inflationSystemAliases?: string[];
  excludeInflationSystemAliases?: string[];
  valveAliases?: string[];
  excludeValveAliases?: string[];
  equipmentAliases?: string[];
  referenceAliases?: string[];
  installedHeadReferences?: string[];
  raftSerials?: string[];
  yearFrom?: number;
  yearTo?: number;
  lifeLimitYears?: number;
  dueWithinNextServiceMonths?: number;
  reasonSuffix?: string;
  notes?: string;
};

export type TechnicalBulletin = {
  id: string;
  title: string;
  bulletinNumber?: string;
  shortDescription?: string;
  issueDate?: string;
  fileName: string;
  manufacturer: string;
  description: string;
  appliesToBrands: string[];
  aliases?: string[];
  servicePeriodicity?: string;
  notes?: string[];
  rules: TechnicalBulletinRule[];
};

export type ApplicableTechnicalBulletin = {
  id: string;
  title: string;
  bulletinNumber?: string;
  shortDescription?: string;
  issueDate?: string;
  manufacturer: string;
  description: string;
  fileName: string;
  fileUrl: string;
  matchedBrand: string;
  matchedModel: string;
  matchedContainer?: string | null;
  matchedRuleLabel: string;
  manufactureYear: number | null;
  yearFrom?: number;
  yearTo?: number;
  reason: string;
};

export type RaftModelEntry = {
  name: string;
  aliases?: string[];
  serviceBulletinIds?: string[];
  containerModel?: string;
  inflationSystem?: string[];
  keyTechnicalData?: {
    inflationSystem?: string;
    valves?: string;
    tubes?: string;
    torques?: string;
  };
  packTypes?: string[];
  packagingTypes?: string[];
  valves?: string[];
  head?: string;
  material?: string;
  configuration?: string[];
  certification?: string[];
  inflationTechnology?: string;
  lights?: string[];
  battery?: string;
  torques?: string[];
  notes?: string[];
  packEquipment?: RaftPackEquipment[];
  spareParts?: RaftTechnicalItem[];
  serviceItems?: RaftTechnicalItem[];
  specifications: RaftSpecification[];
};

export type RaftModelData = Record<string, RaftModelEntry[]>;
