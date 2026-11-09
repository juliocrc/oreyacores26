export class EditConflictError extends Error {
  readonly code = 'EDIT_CONFLICT';
  constructor() {
    super('Este registo foi alterado por outra gravacao. Os dados locais foram preservados. Reabra os dados do servidor e compare antes de gravar.');
    this.name = 'EditConflictError';
  }
}

// Omitted tokens preserve the shipped contract for external/legacy callers.
export function expectedVersion(value: unknown): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new EditConflictError();
  }
  return new Date(value);
}

export function assertEditVersion(current: Date | string | null | undefined, expected: Date | undefined) {
  if (expected && (!current || new Date(current).getTime() !== expected.getTime())) throw new EditConflictError();
}

export function nextEditVersion(current: Date | string) {
  return new Date(Math.max(Date.now(), new Date(current).getTime() + 1));
}

export function savedEditVersion(value: unknown): string {
  const version = expectedVersion(value);
  if (!version) throw new Error('Resposta de gravacao sem versao. Os dados locais foram preservados.');
  return version.toISOString();
}

export function isEditConflict(error: unknown) {
  return error instanceof EditConflictError || (error as { code?: string })?.code === 'P2034';
}

export function editConflictBody() {
  return { code: 'EDIT_CONFLICT', error: new EditConflictError().message };
}
