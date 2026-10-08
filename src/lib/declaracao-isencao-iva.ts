/**
 * Declaração de Isenção de IVA — numeração sequencial anual e emissão.
 *
 * O número da requisição é "NNNN/AAAA" (ex.: "0007/2026"), com sequência que
 * reinicia a 1 de janeiro de cada ano. O cabeçalho do documento apresenta-o
 * como "Requisição Nº 0007/2026" no canto superior direito.
 *
 * A numeração é emitida dentro de um `$transaction` e existe `numeroCompleto`
 * com restrição `@unique` no schema: se duas emissões em simultâneo obtiverem
 * o mesmo sequencial, o SQLite aborta uma das transações (SQLITE_BUSY) ou o
 * UNIQUE rejeita o INSERT, e voltamos a tentar com o próximo número. É esta
 * redundância — `$transaction` + UNIQUE + retry — que garante que nunca são
 * emitidos dois números iguais.
 */

import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/** Máximo de tentativas antes de desistir, para não entrar em ciclo infinito. */
const MAX_TENTATIVAS = 8;

export type DeclaracaoIsencaoIvaInput = {
  clienteNome?: string | null;
  clienteNif?: string | null;
  navioNome?: string | null;
  navioMatricula?: string | null;
  /** Código oficial de isenção, ex.: "M04". Catálogo em `iva-isencao-codes.ts`. */
  codigoIsencaoIva?: string | null;
  /** "cliente" | "relatorios" — indica o ecrã que originou a declaração. */
  origem?: string | null;
  emitidoPorId?: string | null;
  /** Ano da sequência. Por omissão, o ano corrente. */
  ano?: number | null;
  /** Data de emissão. Por omissão, agora. */
  dataEmissao?: Date | null;
};

export type DeclaracaoIsencaoIvaEmitida = {
  id: number;
  numeroSequencial: number;
  ano: number;
  numeroCompleto: string;
  dataEmissao: Date;
  clienteNome: string | null;
  clienteNif: string | null;
  navioNome: string | null;
  navioMatricula: string | null;
  codigoIsencaoIva: string | null;
  origem: string | null;
  emitidoPorId: string | null;
};

/** Rótulo visível no canto superior direito do documento. */
export function formatNumeroRequisicao(numeroCompleto: string): string {
  return `Requisição Nº ${numeroCompleto}`;
}

/** "0007/2026" a partir do sequencial e do ano. */
export function buildNumeroCompleto(ano: number, numeroSequencial: number): string {
  return `${String(numeroSequencial).padStart(4, "0")}/${ano}`;
}

/** Partes do ATCUD (ver `formatarAtcud`) já separadas. */
export type AtcudSeries = {
  /** Código de validação da série atribuído pela AT, ex.: "JF89D3V9". */
  codigoValidacaoSerie: string;
  /** Sequencial do documento dentro da série documental. */
  numeroSequencialSerie: string;
};

/**
 * Monta o ATCUD no formato de exibição "ATCUD:<código>-<sequencial>",
 * previsto no artigo 4.º da Portaria n.º 195/2020.
 *
 * Devolve `null` se não houver código de validação configurado: um ATCUD não
 * pode ser inventado, tem de ser obtido pela comunicação da série documental ao
 * Portal das Finanças.
 */
export function formatarAtcud(serie: AtcudSeries | null | undefined): string | null {
  const codigo = serie?.codigoValidacaoSerie?.trim();
  if (!codigo) return null;
  const sequencial = serie?.numeroSequencialSerie?.trim();
  if (!sequencial) return null;
  return `ATCUD:${codigo}-${sequencial}`;
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "P2002") return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(message);
}

function isRetryableTransactionError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  // Transacoes de escrita concorrentes em SQLite podem falhar com SQLITE_BUSY.
  return code === "SQLITE_BUSY" || code === "P2034";
}

/**
 * Emite uma declaração, consumindo o próximo número da sequência do ano.
 *
 * A leitura do máximo e a inserção correm na mesma transação para que duas
 * emissões concorrentes não possam ficar com o mesmo sequencial.
 */
export async function emitirDeclaracaoIsencaoIva(
  input: DeclaracaoIsencaoIvaInput = {},
): Promise<DeclaracaoIsencaoIvaEmitida> {
  const dataEmissao = input.dataEmissao ?? new Date();
  const ano = resolveAno(input.ano, dataEmissao);

  let ultimoErro: unknown;

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa += 1) {
    try {
      const criada = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const ultima = await tx.declaracaoIsencaoIva.findFirst({
          where: { ano },
          orderBy: { numeroSequencial: "desc" },
          select: { numeroSequencial: true },
        });
        const numeroSequencial = (ultima?.numeroSequencial ?? 0) + 1;

        return tx.declaracaoIsencaoIva.create({
          data: {
            ano,
            numeroSequencial,
            numeroCompleto: buildNumeroCompleto(ano, numeroSequencial),
            clienteNome: normalizarTexto(input.clienteNome),
            clienteNif: normalizarTexto(input.clienteNif),
            navioNome: normalizarTexto(input.navioNome),
            navioMatricula: normalizarTexto(input.navioMatricula),
            codigoIsencaoIva: normalizarTexto(input.codigoIsencaoIva),
            origem: normalizarTexto(input.origem),
            emitidoPorId: normalizarTexto(input.emitidoPorId),
            dataEmissao,
          },
        });
      });

      return criada;
    } catch (error) {
      ultimoErro = error;
      if (!isUniqueViolation(error) && !isRetryableTransactionError(error)) throw error;
    }
  }

  throw new Error(
    `Não foi possível emitir a declaração de isenção de IVA após ${MAX_TENTATIVAS} tentativas: ${
      ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro)
    }`,
  );
}

function resolveAno(ano: number | null | undefined, referencia: Date): number {
  const numerico = Number(ano);
  if (Number.isInteger(numerico) && numerico >= 2000 && numerico <= 2999) return numerico;
  return referencia.getFullYear();
}

function normalizarTexto(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  return texto.length > 0 ? texto : null;
}
