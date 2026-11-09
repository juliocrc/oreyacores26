import { canonicalizeRaftModel, normalizeUpperText } from './text-normalization';

type RaftIdentity = { brand?: unknown; model?: unknown; serial?: unknown; raftModel?: unknown; raftSerial?: unknown; packType?: unknown };

export function isSosDocumentRaft(raft: RaftIdentity) {
  return normalizeUpperText(raft.brand).includes('SOS') ||
    canonicalizeRaftModel(raft.model ?? raft.raftModel, raft.brand, raft.packType, raft.serial ?? raft.raftSerial) === 'SOS';
}

export const SOS_DOCUMENT_NOTICE = 'Modelo SOS: apenas certificado, sem quadro de inspecao, Hammar ou testes.';
