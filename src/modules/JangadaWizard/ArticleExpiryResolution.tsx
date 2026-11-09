import React from 'react';
import { getArticleExpiryReason, getArticleExpiryStatus } from './articleExpiry';

export default function ArticleExpiryResolution({ name, validade, nextInspection, replaced, reason, onReasonChange }: {
  name: string; validade?: string; nextInspection?: string; replaced: boolean;
  reason?: string; onReasonChange: (value: string) => void;
}) {
  const status = getArticleExpiryStatus(validade, nextInspection);
  if (status === 'ok') return null;
  return <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
    <p>{getArticleExpiryReason(validade, nextInspection)}</p>
    {status === 'replace' && replaced && <p>A substituição registada continua com validade insuficiente.</p>}
    {status === 'replace' && <label className="block font-semibold">
      Justificação de não substituição - {name}
      <textarea aria-label={`Justificação de não substituição - ${name}`} value={reason || ''} onChange={e => onReasonChange(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-amber-300 bg-white p-2 text-sm" />
    </label>}
  </div>;
}
