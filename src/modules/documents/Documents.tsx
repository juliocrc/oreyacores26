"use client";
import { useState } from "react";

type Document = {
  id: string;
  type: string;
  name: string;
  entity: string;
  fileName: string;
  fileUrl: string;
};

export default function Documents() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [type, setType] = useState("");
  const [name, setName] = useState("");
  const [entity, setEntity] = useState("");
  const [file, setFile] = useState<File | null>(null);

  // Simples persistência local
  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!type || !name || !entity || !file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      const newDoc = {
        id: Date.now().toString(),
        type,
        name,
        entity,
        fileName: file.name,
        fileUrl: url,
      };
      const updated = [...docs, newDoc];
      setDocs(updated);
      localStorage.setItem("documents", JSON.stringify(updated));
      setType(""); setName(""); setEntity(""); setFile(null);
    };
    reader.readAsDataURL(file);
  };

  // Carregar do localStorage
  useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("documents") || "[]");
      setDocs(saved);
    } catch {}
  });

  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-4">
      <h2 className="text-2xl font-bold mb-4">Gestão de Documentos</h2>
      <form onSubmit={handleAdd} className="mb-4 flex flex-col gap-2">
        <select value={type} onChange={e => setType(e.target.value)} className="border rounded px-2 py-1">
          <option value="">Tipo</option>
          <option value="Certificado">Certificado</option>
          <option value="Licença">Licença</option>
          <option value="Contrato">Contrato</option>
        </select>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do documento" className="border rounded px-2 py-1" />
        <input value={entity} onChange={e => setEntity(e.target.value)} placeholder="Navio/Jangada vinculada" className="border rounded px-2 py-1" />
        <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="border rounded px-2 py-1" />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Salvar</button>
      </form>
      <h3 className="text-lg font-bold mb-2">Documentos cadastrados</h3>
      <div className="overflow-x-auto"><table className="min-w-full bg-white rounded shadow mb-2 text-xs sm:text-sm">
        <thead>
          <tr className="bg-blue-100">
            <th className="p-2">Tipo</th>
            <th className="p-2">Nome</th>
            <th className="p-2">Vinculado</th>
            <th className="p-2">Arquivo</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d: any) => (
            <tr key={d.id} className="border-t align-top">
              <td className="p-2">{d.type}</td>
              <td className="p-2">{d.name}</td>
              <td className="p-2">{d.entity}</td>
              <td className="p-2">
                <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="underline text-blue-600">{d.fileName}</a>
              </td>
            </tr>
          ))}
          {docs.length === 0 && (
            <tr><td colSpan={4} className="p-2 text-gray-400">Nenhum documento cadastrado.</td></tr>
          )}
        </tbody>
      </table></div>
    </div>
  );
}
