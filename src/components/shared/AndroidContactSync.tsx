"use client";

import { Bluetooth, ContactRound, Loader2, Smartphone } from "lucide-react";
import { useState } from "react";
import { appToast } from "@/lib/app-toast";

type AndroidContact = { id: string; name: string; phone: string };
type AndroidBridge = {
  openBluetoothSettings?: () => void;
  requestBluetoothAccess?: () => void;
  pairedBluetoothDevices?: () => string;
  requestContactsAccess?: () => void;
  getContactsForImport?: () => string;
};

const bridge = () => (window as Window & { OreyAndroid?: AndroidBridge }).OreyAndroid;

export default function AndroidContactSync() {
  const [devices, setDevices] = useState<{ name?: string; address?: string }[]>([]);
  const [contacts, setContacts] = useState<AndroidContact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  function pairedDevices() {
    const native = bridge();
    if (!native?.pairedBluetoothDevices) return appToast.warning("Esta opção está disponível na APK Orey atualizada.");
    const raw = native.pairedBluetoothDevices();
    if (raw === "PERMISSION_REQUIRED") { native.requestBluetoothAccess?.(); return appToast.warning("Autorize o Bluetooth e tente novamente."); }
    try { setDevices(JSON.parse(raw)); } catch { appToast.error("Não foi possível ler os dispositivos emparelhados."); }
  }

  function loadContacts() {
    const native = bridge();
    if (!native?.getContactsForImport) return appToast.warning("Abra a Central de Comunicações na APK Orey para sincronizar contactos.");
    const raw = native.getContactsForImport();
    if (raw === "PERMISSION_REQUIRED") { native.requestContactsAccess?.(); return appToast.warning("Autorize o acesso aos contactos e selecione novamente Sincronizar."); }
    try {
      const list = (JSON.parse(raw) as AndroidContact[]).filter((contact) => contact.name?.trim() && contact.phone?.trim());
      setContacts(list); setSelected(new Set(list.map((contact) => contact.id)));
      appToast.success(`${list.length} contactos disponíveis para importar.`);
    } catch { appToast.error("Não foi possível ler os contactos do telemóvel."); }
  }

  async function importSelected() {
    const list = contacts.filter((contact) => selected.has(contact.id));
    if (!list.length) return appToast.warning("Selecione pelo menos um contacto.");
    setLoading(true);
    let imported = 0;
    for (const contact of list) {
      const response = await fetch("/api/clientes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: contact.name.trim(), telmovel: contact.phone.trim() }) });
      if (response.ok) imported++;
    }
    setLoading(false);
    appToast.success(`${imported} de ${list.length} contactos foram adicionados a Clientes. Os existentes foram mantidos sem alteração.`);
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Sincronizar contactos Android">
    <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><ContactRound size={20} /></span><div><h2 className="text-sm font-bold text-slate-900">Telemóvel e contactos da estação</h2><p className="mt-1 text-xs leading-5 text-slate-600">Use os contactos sincronizados no Android com juliocrc@gmail.com e confirme antes de os adicionar a Clientes.</p></div></div>
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => bridge()?.openBluetoothSettings?.()}><Bluetooth size={14} />Emparelhar telemóvel</button><button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={pairedDevices}><Smartphone size={14} />Ver emparelhados</button><button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white hover:bg-indigo-700" onClick={loadContacts}><ContactRound size={14} />Sincronizar contactos</button></div>
    {devices.length > 0 && <p className="mt-3 text-xs text-slate-600">Emparelhados: {devices.map((device) => device.name || device.address || "Sem nome").join(", ")}</p>}
    {contacts.length > 0 && <div className="mt-3 space-y-2"><div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">{contacts.map((contact) => <label key={contact.id} className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs last:border-0"><input type="checkbox" checked={selected.has(contact.id)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(contact.id) ? next.delete(contact.id) : next.add(contact.id); return next; })} /><span className="min-w-0"><b className="block truncate text-slate-800">{contact.name}</b><span className="text-slate-500">{contact.phone}</span></span></label>)}</div><button type="button" disabled={loading} onClick={() => void importSelected()} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white disabled:opacity-60">{loading && <Loader2 size={14} className="animate-spin" />}Adicionar selecionados a Clientes</button></div>}
  </section>;
}
