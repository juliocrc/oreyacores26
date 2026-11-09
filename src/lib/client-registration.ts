export type ClientRegistration = { nome: string; nif: string; email: string; phone: string };

export function parseClientRegistration(value: unknown): ClientRegistration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (["nome", "nif", "email", "phone"].some(key => row[key] !== undefined && typeof row[key] !== "string")) return null;
  const nome = String(row.nome || "").trim();
  const nif = String(row.nif || "").trim().toUpperCase();
  const email = String(row.email || "").trim().toLowerCase();
  const phone = String(row.phone || "").trim();
  if (nome.length < 2 || nome.length > 160 || !/^[A-Z0-9][A-Z0-9 .\/-]{3,31}$/.test(nif) ||
      email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || (!email && !phone) ||
      phone.length > 40 || (phone && !/^[+\d() .-]{7,40}$/.test(phone)) || /[\x00-\x1f\x7f]/.test(nome)) return null;
  return { nome, nif, email, phone };
}
