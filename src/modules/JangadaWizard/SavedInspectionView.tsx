'use client';
import React, { useEffect, useState } from 'react';
import { draftTime } from './localDraftStatus';

/** Read directly from the server: never initialize the editable wizard or autosave. */
export default function SavedInspectionView({ jangadaId, inspectionId }: { jangadaId: number; inspectionId: number }) {
  const [record, setRecord] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch(`/api/inspecoes?jangadaId=${jangadaId}`, { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error();
      const list = await response.json();
      const found = Array.isArray(list) ? list.find(item => Number(item.id) === inspectionId) : null;
      if (!found) throw new Error();
      if (active) setRecord(found);
    }).catch(() => { if (active) setError('Não foi possível carregar a vistoria registada. Nenhum rascunho foi alterado.'); });
    return () => { active = false; };
  }, [jangadaId, inspectionId]);
  if (error) return <p role="alert" className="p-5 bg-amber-50">{error}</p>;
  if (!record) return <p className="p-5">A carregar vistoria registada…</p>;
  const checklist = record.checklistSnapshot && typeof record.checklistSnapshot === 'object' ? record.checklistSnapshot : {};
  const entries = Object.entries(checklist).filter(([key, value]) => !key.startsWith('_') && value && typeof value === 'object' && 'status' in value);
  const tests = [['WP', record.testeWP], ['NAP', record.testeNAP], ['GI', record.testeGI], ['FS', record.testeFS], ['DL', record.testeDL]];
  return <section className="bg-white rounded-2xl border p-6 space-y-5">
    <div><h2 className="text-xl font-bold">Vistoria registada — consulta</h2><p className="text-sm text-slate-600">Estado: {record.status || 'não indicado'} · Inspeção: {draftTime(record.dataInspecao)} · Atualizada: {draftTime(record.updatedAt)} · ID {record.id}</p><p className="text-sm text-slate-600">Consulta sem edição ou gravação. O rascunho local permanece separado.</p></div>
    <div><h3 className="font-bold">Testes registados</h3><ul className="text-sm">{tests.map(([name, value]) => <li key={name as string}>{name}: {String(value || 'não registado')}</li>)}</ul></div>
    <div><h3 className="font-bold">Checklist registada</h3>{entries.length ? <ul className="grid sm:grid-cols-2 gap-1 text-sm">{entries.map(([key, value]) => <li key={key}>{key.replace(/_/g, ' ')}: {String((value as { status?: unknown }).status || 'não indicado')}</li>)}</ul> : <p className="text-sm text-amber-800">Não existem respostas detalhadas disponíveis neste registo; não se presume que foram aprovadas ou que a inspeção não foi realizada.</p>}</div>
  </section>;
}
