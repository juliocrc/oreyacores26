const clientDataCache = new Map<string, { data: unknown; expiresAt: number }>();

export function getCachedClientData(clienteId: number) {
  const key = `client:${clienteId}`;
  const cached = clientDataCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  clientDataCache.delete(key);
  return null;
}

export function setCachedClientData(clienteId: number, data: unknown) {
  const key = `client:${clienteId}`;
  clientDataCache.set(key, { data, expiresAt: Date.now() + 30 * 60 * 1000 });
}

export function clearClientCache(clienteId: number) {
  clientDataCache.delete(`client:${clienteId}`);
}
