"use client";

export type SenderAccount = "julio" | "tecnica";
export type SenderAccountStatus = { id: SenderAccount; configured: boolean };

export const EMAIL_SENDER_PROFILES = [
  { id: "julio", email: "julio.correia@orey.com" },
  { id: "tecnica", email: "azores.tecnica@orey.com" },
] as const;

export default function EmailSenderSelect({ value, onChange, accounts }: {
  value: SenderAccount;
  onChange: (value: SenderAccount) => void;
  accounts?: SenderAccountStatus[] | null;
}) {
  if (!accounts?.length) return null;
  return <label className="block space-y-1 text-xs font-semibold text-slate-600">
    <span>Conta de envio</span>
    <select value={value} onChange={e => { if (e.target.value === "julio" || e.target.value === "tecnica") onChange(e.target.value); }} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
      {EMAIL_SENDER_PROFILES.map(profile => {
        const configured = accounts?.find(account => account.id === profile.id)?.configured;
        return <option key={profile.id} value={profile.id}>{profile.email} ({configured === true ? "configurada" : configured === false ? "nao configurada" : "estado por confirmar"})</option>;
      })}
    </select>
  </label>;
}
