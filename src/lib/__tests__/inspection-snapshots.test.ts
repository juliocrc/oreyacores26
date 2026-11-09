import { del, list, put } from '@vercel/blob';
import { existsSync } from 'fs';
import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import path from 'path';
import prisma from '@/lib/prisma';
import { getInspectionSnapshot } from '@/lib/inspection-snapshots';

jest.mock('@vercel/blob', () => ({ del: jest.fn(), list: jest.fn(), put: jest.fn() }));
jest.mock('fs', () => ({ existsSync: jest.fn() }));
jest.mock('fs/promises', () => ({
  mkdir: jest.fn(), readdir: jest.fn(), readFile: jest.fn(),
  stat: jest.fn(), unlink: jest.fn(), writeFile: jest.fn(),
}));
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {
  jangada: { findUnique: jest.fn() },
} }));
jest.mock('@/lib/app-config', () => ({ APP_CONFIG: { storageNamespace: 'test' } }));

const relativePath = '_meta/inspecoes-snapshots/AZ23-1.json';
const blobPath = `auditorias-documentos/${relativePath}`;
const originalToken = process.env.BLOB_READ_WRITE_TOKEN;

afterEach(() => {
  if (originalToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = originalToken;
  expect(put).not.toHaveBeenCalled();
  expect(del).not.toHaveBeenCalled();
  expect(writeFile).not.toHaveBeenCalled();
  expect(unlink).not.toHaveBeenCalled();
  expect(mkdir).not.toHaveBeenCalled();
  expect(prisma.jangada.findUnique).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe.each(['local', 'blob'])('%s snapshot reads', (storage) => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    if (storage === 'blob') process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
    else delete process.env.BLOB_READ_WRITE_TOKEN;
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(existsSync).mockReturnValue(false);
    jest.mocked(list).mockResolvedValue({ blobs: [], hasMore: false, cursor: undefined });
  });

  function archive(raw: string) {
    jest.mocked(existsSync).mockReturnValue(true);
    jest.mocked(stat).mockResolvedValue({ size: raw.length, mtime: new Date() } as never);
    jest.mocked(readFile).mockResolvedValue(Buffer.from(raw));
    jest.mocked(list).mockResolvedValue({ blobs: [{
      pathname: blobPath, url: 'https://archive.example/snapshot.json',
      size: raw.length, uploadedAt: new Date(),
    }], hasMore: false, cursor: undefined } as never);
    fetchMock.mockResolvedValue(new Response(raw, { headers: { 'content-type': 'application/json' } }));
  }

  it('returns null for a missing snapshot without creating an archive or metadata', async () => {
    expect(await getInspectionSnapshot('AZ23-1')).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null for malformed JSON without rewriting it', async () => {
    archive('{broken');
    expect(await getInspectionSnapshot('AZ23-1')).toBeNull();
  });

  it.each(['{broken', 'null', 'false', '[]'])('strict document reads distinguish corrupt archives from missing ones: %s', async raw => {
    archive(raw);
    await expect(getInspectionSnapshot('AZ23-1', { strict: true })).rejects.toThrow();
  });

  it('strict reads still return null for a genuinely missing archive', async () => {
    expect(await getInspectionSnapshot('AZ23-1', { strict: true })).toBeNull();
  });

  it('parses the existing archive', async () => {
    const snapshot = { id: 2179, ultimoCertificadoNumero: 'AZ23-1', artigos: [] };
    archive(JSON.stringify(snapshot));
    expect(await getInspectionSnapshot('AZ23-1')).toEqual(snapshot);
  });

  it('preserves certificate path sanitization', async () => {
    expect(await getInspectionSnapshot('../wrong\\cert/23?')).toBeNull();
    const sanitizedPath = '_meta/inspecoes-snapshots/___wrong_cert_23_.json';
    if (storage === 'blob') {
      expect(list).toHaveBeenCalledWith({ prefix: `auditorias-documentos/${sanitizedPath}` });
    } else {
      expect(existsSync).toHaveBeenCalledWith(expect.stringContaining(path.normalize(sanitizedPath)));
    }
  });

  it('returns null for an empty certificate without accessing storage', async () => {
    expect(await getInspectionSnapshot('')).toBeNull();
    expect(list).not.toHaveBeenCalled();
    expect(existsSync).not.toHaveBeenCalled();
  });
});
