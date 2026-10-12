import fs from "fs";
import path from "path";
import { logAuditoria } from "@/lib/auditoria";

const CONFIG_PATH = path.join(process.cwd(), "backups", "primavera-config.json");

export type PrimaveraConfig = {
  enabled: boolean;
  apiUrl: string;
  companyId: string;
  username?: string;
  password?: string;
  apiKey?: string;
  syncMode: "automatic" | "manual";
};

export function loadPrimaveraConfig(): PrimaveraConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      return {
        enabled: Boolean(data.enabled),
        apiUrl: String(data.apiUrl || ""),
        companyId: String(data.companyId || "DEFAULT"),
        username: data.username || "",
        password: data.password || "",
        apiKey: data.apiKey || "",
        syncMode: data.syncMode === "automatic" ? "automatic" : "manual",
      };
    }
  } catch {}

  return {
    enabled: false,
    apiUrl: process.env.PRIMAVERA_API_URL || "",
    companyId: process.env.PRIMAVERA_COMPANY_ID || "OREY",
    username: process.env.PRIMAVERA_USERNAME || "",
    password: process.env.PRIMAVERA_PASSWORD || "",
    apiKey: process.env.PRIMAVERA_API_KEY || "",
    syncMode: process.env.PRIMAVERA_SYNC_MODE === "automatic" ? "automatic" : "manual",
  };
}

export function savePrimaveraConfig(config: PrimaveraConfig) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

export async function syncProFormaToPrimavera(payload: {
  numeroProForma: string;
  clienteNif?: string | null;
  clienteNome: string;
  navio?: string | null;
  total: number;
  linhas: Array<{ referencia?: string; descricao: string; quantidade: number; precoUnitario: number; total: number }>;
}): Promise<{ success: boolean; primaveraDocNumber?: string; reason?: string }> {
  try {
    const config = loadPrimaveraConfig();
    if (!config.enabled || !config.apiUrl) {
      return { success: false, reason: "Integração Primavera desativada ou URL em falta." };
    }

    const primaveraPayload = {
      Company: config.companyId,
      Series: "PRV",
      CustomerTaxID: payload.clienteNif || "999999990",
      CustomerName: payload.clienteNome,
      ShipName: payload.navio || "",
      DocumentTotal: payload.total,
      Lines: payload.linhas.map((l) => ({
        ItemCode: l.referencia || "SERV",
        Description: l.descricao,
        Quantity: l.quantidade,
        UnitPrice: l.precoUnitario,
        LineTotal: l.total,
      })),
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (config.apiKey) {
      headers["X-API-Key"] = config.apiKey;
    } else if (config.username && config.password) {
      headers.Authorization = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
    } else {
      return { success: false, reason: "Credenciais Primavera não configuradas." };
    }

    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(primaveraPayload),
      signal: AbortSignal.timeout(20000),
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { success: false, reason: `Primavera recusou a sincronização (${response.status}).` };
    }
    const primaveraDocNumber = String(responseBody.documentNumber || responseBody.documentNo || responseBody.number || "").trim();
    if (!primaveraDocNumber) {
      return { success: false, reason: "Primavera respondeu sem número de documento." };
    }

    await logAuditoria({
      tabela: "PrimaveraSync",
      tipoOperacao: "CREATE",
      idRegisto: 0,
      descricao: `Sincronização Pró-Forma ${payload.numeroProForma} com ERP Primavera (Companhia: ${config.companyId})`,
      dadosDepois: primaveraPayload,
    });

    return { success: true, primaveraDocNumber };
  } catch (err: any) {
    console.error("[Primavera Sync] Erro:", err?.message);
    return { success: false, reason: err?.message };
  }
}
