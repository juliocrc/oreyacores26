import { z } from "zod";

export const jangadaCreateSchema = z.object({
  brand: z.string().min(1, "Marca é obrigatória"),
  model: z.string().min(1, "Modelo é obrigatório"),
  serial: z.string().min(1, "Número de série é obrigatório"),
  capacity: z.number().int().positive("Capacidade deve ser um número positivo"),
  owner: z.string().min(1, "Armador/Proprietário é obrigatório"),
  packType: z.string().min(1, "Tipo de pack é obrigatório"),
  dataFabrico: z.string().min(1, "Data de fabrico é obrigatória"),
});

export const ordemServicoCreateSchema = z.object({
  navioId: z.number().int().positive().optional(),
  navioNome: z.string().min(1, "Nome do navio é obrigatório"),
  jangadaId: z.number().int().positive().optional(),
  observacoes: z.string().optional(),
});

export type JangadaCreateInput = z.infer<typeof jangadaCreateSchema>;
export type OrdemServicoCreateInput = z.infer<typeof ordemServicoCreateSchema>;
