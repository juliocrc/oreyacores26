import { z } from "zod";

export const stringOrNull = z.string().nullable().optional().or(z.null());
export const numberOrNull = z.number().nullable().optional().or(z.null());
export const booleanOrNull = z.boolean().nullable().optional().or(z.null());

export const idOrNull = z.union([z.string(), z.number()]).nullable().optional().or(z.null());

export const orcamentoLinhaSchema = z.object({
  id: z.string().optional(),
  stockId: z.union([z.number(), z.string()]).nullable().optional(),
  referencia: z.string().nullable().optional(),
  descricao: z.string().nullable().optional(),
  quantidade: z.number().nullable().optional(),
  precoUnitario: z.number().nullable().optional(),
  total: z.number().nullable().optional(),
  source: z.string().nullable().optional(),
});

export const aprovacaoWhatsAppSchema = z
  .object({
    status: z.string().nullable().optional(),
    telefoneCliente: z.string().nullable().optional(),
    mensagem: z.string().nullable().optional(),
    enviadoEm: z.string().nullable().optional(),
    respondidoEm: z.string().nullable().optional(),
    alteracoesPedidas: z.string().nullable().optional(),
    validadeDias: z.number().nullable().optional(),
  })
  .nullable()
  .optional();

export const orcamentoSchema = z
  .object({
    linhas: z.array(orcamentoLinhaSchema).optional(),
    valorMaoObra: z.number().nullable().optional(),
    valorDesconto: z.number().nullable().optional(),
    isIsentoIva: z.boolean().nullable().optional(),
    usarOrcamento: z.boolean().nullable().optional(),
    removedIds: z.array(z.string()).nullable().optional(),
    aprovacaoWhatsApp: aprovacaoWhatsAppSchema,
  })
  .nullable()
  .optional();

export const artigosSubstituidosSchema = z.array(
  z.object({
    stockId: z.union([z.number(), z.string()]).nullable().optional(),
    referencia: z.string().nullable().optional(),
    descricao: z.string().nullable().optional(),
    quantidade: z.number().nullable().optional(),
    motivo: z.string().nullable().optional(),
    precoUnitario: z.number().nullable().optional(),
    validade: z.string().nullable().optional(),
    codigoFabricante: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    unitPrice: z.number().nullable().optional(),
  }),
);

export const saveInspectionSchema = z
  .object({
    id: idOrNull,
    shipId: idOrNull,
    raftId: idOrNull,
    coleteId: idOrNull,
    navioNome: stringOrNull,
    jangadaSerial: stringOrNull,
    coleteSerial: stringOrNull,
    date: stringOrNull,
    dataProxInspecao: stringOrNull,
    status: stringOrNull,
    responsavel: stringOrNull,
    certificadoNumero: stringOrNull,
    sourceFile: stringOrNull,
    checklistSnapshot: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    artigosSubstituidos: artigosSubstituidosSchema.optional(),
    applyStockMovements: booleanOrNull,
    signatureBase64: stringOrNull,
    clienteAssinaturaBase64: stringOrNull,
    clienteNomeAssinatura: stringOrNull,
    guiaTransporteUrl: stringOrNull,
    testeWP: stringOrNull,
    testeFS: stringOrNull,
    testeNAP: stringOrNull,
    testeGI: stringOrNull,
    testeDL: stringOrNull,
    cylinderDataTeste: stringOrNull,
    cylinderSerial: stringOrNull,
    numeroObra: stringOrNull,
    orcamento: orcamentoSchema,
  })
  .passthrough();

export type SaveInspectionPayload = z.infer<typeof saveInspectionSchema>;