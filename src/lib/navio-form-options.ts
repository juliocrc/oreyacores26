import type { ClienteItem, ColeteItem, EpirbItem, JangadaItem } from '@/types/navios-page';

export async function updateNavioAssociation(url: string, options: RequestInit) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Erro ao associar equipamento (${response.status}).`);
  return response;
}

export async function loadNavioFormOptions<T>(url: string, signal: AbortSignal): Promise<T[]> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Erro ao carregar opcoes (${response.status}).`);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error('Resposta de opcoes invalida.');
  return data as T[];
}

export async function loadNavioEquipmentOptions(shipId: number | null, signal: AbortSignal) {
  const [jangadas, coletes, epirbs] = await Promise.all([
    loadNavioFormOptions<JangadaItem>('/api/jangadas?scope=all', signal),
    loadNavioFormOptions<ColeteItem>('/api/coletes', signal),
    loadNavioFormOptions<EpirbItem>('/api/epirbs', signal),
  ]);
  function available<T extends { shipId?: number | null; serial: string }>(items: T[]) {
    return items
      .filter(item => !item.shipId || (shipId !== null && item.shipId === shipId))
      .sort((a, b) => (a.serial || '').localeCompare(b.serial || ''));
  }
  return { jangadas: available(jangadas), coletes: available(coletes), epirbs: available(epirbs) };
}

export async function loadNavioClientOptions(signal: AbortSignal) {
  const clients = await loadNavioFormOptions<ClienteItem>('/api/clientes', signal);
  return clients.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt', { sensitivity: 'base' }));
}
