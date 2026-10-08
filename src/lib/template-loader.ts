import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { TEMPLATE_EMBEDS } from '@/lib/template-embeds.generated';

const TEMPLATE_DIRS = [
  path.join(process.cwd(), 'templates'),
  path.join(process.cwd(), '.next', 'standalone', 'templates'),
];

/**
 * Carrega o template binário. Tenta ler do filesystem (dev/standalone) e,
 * se não existir (Vercel read-only), usa a versão embutida em base64.
 */
export async function loadTemplateBufferIfExists(fileName: string): Promise<Buffer | null> {
  for (const dir of TEMPLATE_DIRS) {
    try {
      const candidate = path.join(dir, fileName);
      const buf = await readFile(candidate);
      if (buf && buf.length > 0) return buf as Buffer;
    } catch {
      // tenta o próximo diretório
    }
  }
  const embedded = TEMPLATE_EMBEDS[fileName];
  if (embedded) {
    return Buffer.from(embedded, 'base64') as Buffer;
  }
  return null;
}

export async function loadTemplateBuffer(fileName: string): Promise<Buffer> {
  const buf = await loadTemplateBufferIfExists(fileName);
  if (!buf) {
    throw new Error(`Template não encontrado (nem no filesystem nem embutido): ${fileName}`);
  }
  return buf;
}