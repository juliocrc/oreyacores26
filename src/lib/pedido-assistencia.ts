export type PedidoAssistenciaJangadaTarget = {
  id?: number;
  serial?: string;
};

function normalizeStringList(value: string): string[] {
  return value
    .split(/[\n,;\r]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parsePedidoAssistenciaJangadaIds(value: unknown): number[] {
  if (value === null || value === undefined) return [];

  const rawValues: unknown[] = [];

  const pushFlattened = (entry: unknown) => {
    if (entry === null || entry === undefined || entry === "") return;
    if (typeof entry === "string") {
      rawValues.push(...entry.split(/[\s,;]+/));
      return;
    }
    if (Array.isArray(entry)) {
      for (const item of entry) pushFlattened(item);
      return;
    }
    if (typeof entry === "object") {
      for (const item of Object.values(entry as Record<string, unknown>)) pushFlattened(item);
      return;
    }
    rawValues.push(entry);
  };

  if (typeof value === "string") {
    pushFlattened(value);
  } else if (Array.isArray(value)) {
    for (const item of value) pushFlattened(item);
  } else if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const candidate of [
      record.jangadaIds,
      record.jangadas,
      record.jangadaId,
      record.jangadaIdsCsv,
      record.id,
      record.serial,
    ]) {
      pushFlattened(candidate);
    }
  } else {
    rawValues.push(value);
  }

  const ids = rawValues
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
    .filter((item, index, list) => list.indexOf(item) === index);

  return ids;
}

export function resolvePedidoAssistenciaJangadaTargets(pedido: {
  jangadaSerial?: string | null;
  metadados?: string | null;
}): PedidoAssistenciaJangadaTarget[] {
  const seen = new Set<string>();
  const targets: PedidoAssistenciaJangadaTarget[] = [];

  const addTarget = (target: PedidoAssistenciaJangadaTarget) => {
    if (target.id !== undefined && target.id !== null && Number.isFinite(target.id) && target.id > 0) {
      const key = `id:${target.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      targets.push({ id: target.id });
      return;
    }

    const serial = String(target.serial ?? "").trim();
    if (!serial) return;
    const key = `serial:${serial.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push({ serial });
  };

  try {
    const metadataRaw = String(pedido.metadados ?? "").trim();
    if (metadataRaw) {
      const metadata = JSON.parse(metadataRaw) as Record<string, unknown>;
      const metadataIds = parsePedidoAssistenciaJangadaIds(metadata?.jangadaIds ?? metadata?.jangadas ?? metadata?.jangadaId ?? metadata?.jangadaIdsCsv);
      metadataIds.forEach((id) => addTarget({ id }));

      const metadataSerials = Array.isArray(metadata?.jangadaSerials)
        ? metadata.jangadaSerials
        : Array.isArray(metadata?.serials)
          ? metadata.serials
          : [];
      metadataSerials.forEach((serial) => addTarget({ serial: String(serial) }));
    }
  } catch {
    // ignorado: a string pode ser legacy ou incompleta
  }

  const serialText = String(pedido.jangadaSerial ?? "").trim();
  if (serialText) {
    normalizeStringList(serialText).forEach((serial) => addTarget({ serial }));
  }

  return targets;
}
