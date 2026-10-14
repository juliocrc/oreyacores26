import { AZORES_TECHNICIANS } from "@/lib/agenda-technicians";
import type { TecnicosPayload } from "@/types/tecnicos-page";
import type { StaffTechnician } from "@/types/agenda-page";

/**
 * Constrói o roster de técnicos da estação ativa a partir da resposta de
 * `/api/tecnicos`. Quando a estação não tem técnicos registados na BD (ex.:
 * Açores legado), recorre ao roster estático AZORES_TECHNICIANS para manter o
 * comportamento anterior.
 */
export function buildStationTechnicianRoster(
  payload: TecnicosPayload | null | undefined,
): StaffTechnician[] {
  const list: StaffTechnician[] = [];

  if (payload) {
    for (const station of Array.isArray(payload.stations) ? payload.stations : []) {
      for (const tecnico of Array.isArray(station.tecnicos) ? station.tecnicos : []) {
        list.push({ id: tecnico.id, nome: tecnico.nome, role: "Técnico" });
      }
    }
    for (const tecnico of Array.isArray(payload.unassigned) ? payload.unassigned : []) {
      list.push({ id: tecnico.id, nome: tecnico.nome, role: "Técnico" });
    }
  }

  if (list.length === 0) {
    return AZORES_TECHNICIANS.map((tech) => ({
      id: tech.id,
      nome: tech.name,
      role: tech.role,
    }));
  }

  const seen = new Set<string>();
  return list
    .filter((tech) => {
      const key = tech.nome.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-PT", { sensitivity: "base" }));
}
