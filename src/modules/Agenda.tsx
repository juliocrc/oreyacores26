// @ts-nocheck
// src/modules/Agenda.tsx
"use client";
import { useAgenda } from '@/hooks/useAgenda';
import { InspectionEvent } from '@/types';
import { getLocalDateKey } from '@/lib/date-utils';

export default function Agenda() {
  const { events = [], isLoading, isError, addEvent } = useAgenda();

  function handleAddExample() {
    const newEvent: InspectionEvent = {
      id: Date.now(),
      raftSerial: "Jangada Exemplo",
      title: "Inspeção Exemplo",
          date: getLocalDateKey(),
      type: "Inspeção",
    };
    addEvent(newEvent);
  }

  if (isLoading) return <div className="text-center p-4">Carregando…</div>;
  if (isError) return <div className="text-center p-4 text-red-600">Erro ao carregar agenda.</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Agenda de Inspeções</h2>
      <button
        className="bg-blue-600 text-white px-4 py-2 rounded mb-4"
        onClick={handleAddExample}
      >
        Cadastrar Evento Exemplo
      </button>
      <table className="min-w-full bg-white rounded shadow">
        <thead>
          <tr className="bg-blue-100">
            <th className="p-2">Jangada</th>
            <th className="p-2">Tipo</th>
            <th className="p-2">Data</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 && (
            <tr>
              <td colSpan={3} className="text-center p-4 text-gray-400">Nenhum evento agendado.</td>
            </tr>
          )}
          {events.map((ev) => (
            <tr key={ev.id} className="border-t">
              <td className="p-2">{ev.raftSerial}</td>
              <td className="p-2">{ev.type}</td>
              <td className="p-2">{ev.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
