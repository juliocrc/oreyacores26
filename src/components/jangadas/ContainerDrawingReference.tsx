import React from 'react';
import { containerDrawingReference } from '@/lib/container-drawing-reference';

export default function ContainerDrawingReference({ raft }: { raft: Parameters<typeof containerDrawingReference>[0] }) {
  const reference = containerDrawingReference(raft);
  if (!reference) return null;
  return <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-sm text-indigo-950">
    <h3 className="font-bold">Referência dimensional do desenho do contentor</h3>
    <p className="mt-2">{reference.dimensions}</p>
    {reference.associations.length > 0 && <div className="mt-3"><h4 className="font-bold">Jangadas indicadas nos desenhos DSB</h4><ul className="mt-1 list-disc space-y-1 pl-5">{reference.associations.map(association => <li key={association}>{association}</li>)}</ul></div>}
    {reference.userAssociation && <p className="mt-3">{reference.userAssociation}</p>}
    <p className="mt-2">{reference.note}</p>
    <p className="mt-2 font-semibold">{reference.brandNote}</p>
    <p className="mt-2 text-xs">Fonte: CONTAINERS.pdf, desenho {reference.drawing}. Medidas indicativas; não são medições da jangada nem critérios de aprovação.</p>
  </section>;
}
