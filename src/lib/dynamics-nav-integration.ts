import fs from "fs";
import path from "path";
import { logAuditoria } from "@/lib/auditoria";

const CONFIG_PATH = path.join(process.cwd(), "backups", "dynamics-nav-config.json");

export type DynamicsNavConfig = {
  enabled: boolean;
  serviceUrl: string;
  companyName: string;
  authType: "oauth" | "basic" | "key";
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  username?: string;
  webServiceAccessKey?: string;
  syncMode: "automatic" | "manual";
};

export function loadDynamicsNavConfig(): DynamicsNavConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      return {
        enabled: Boolean(data.enabled),
        serviceUrl: String(data.serviceUrl || ""),
        companyName: String(data.companyName || "CRONUS"),
        authType: ["oauth", "basic", "key"].includes(data.authType) ? data.authType : "basic",
        tenantId: data.tenantId || "",
        clientId: data.clientId || "",
        clientSecret: data.clientSecret || "",
        username: data.username || "",
        webServiceAccessKey: data.webServiceAccessKey || "",
        syncMode: data.syncMode === "automatic" ? "automatic" : "manual",
      };
    }
  } catch {}

  return {
    enabled: false,
    serviceUrl: process.env.DYNAMICS_NAV_SERVICE_URL || "",
    companyName: process.env.DYNAMICS_NAV_COMPANY || "Orey Açores",
    authType: (process.env.DYNAMICS_NAV_AUTH_TYPE === "oauth" || process.env.DYNAMICS_NAV_AUTH_TYPE === "key")
      ? process.env.DYNAMICS_NAV_AUTH_TYPE
      : "basic",
    tenantId: process.env.DYNAMICS_NAV_TENANT_ID || "",
    clientId: process.env.DYNAMICS_NAV_CLIENT_ID || "",
    clientSecret: process.env.DYNAMICS_NAV_CLIENT_SECRET || "",
    username: process.env.DYNAMICS_NAV_USERNAME || "",
    webServiceAccessKey: process.env.DYNAMICS_NAV_ACCESS_KEY || "",
    syncMode: process.env.DYNAMICS_NAV_SYNC_MODE === "automatic" ? "automatic" : "manual",
  };
}

export function saveDynamicsNavConfig(config: DynamicsNavConfig) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

export async function syncProFormaToDynamicsNav(payload: {
  numeroProForma: string;
  clienteNif?: string | null;
  clienteNome: string;
  navio?: string | null;
  total: number;
  linhas: Array<{ referencia?: string; descricao: string; quantidade: number; precoUnitario: number; total: number }>;
}): Promise<{ success: boolean; navDocNo?: string; reason?: string }> {
  try {
    const config = loadDynamicsNavConfig();
    if (!config.enabled || !config.serviceUrl) {
      return { success: false, reason: "Integração Microsoft Dynamics NAV desativada ou URL em falta." };
    }

    // Estrutura de Payload OData / Web Services para Dynamics NAV / Business Central
    const navPayload = {
      company: config.companyName,
      documentType: "Sales Proforma Invoice",
      externalDocumentNo: payload.numeroProForma,
      customerName: payload.clienteNome,
      customerTaxId: payload.clienteNif || "",
      shipName: payload.navio || "",
      amountIncludingVAT: payload.total,
      salesLines: payload.linhas.map((l) => ({
        no: l.referencia || "GENERAL",
        description: l.descricao,
        quantity: l.quantidade,
        unitPrice: l.precoUnitario,
        lineAmount: l.total,
      })),
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (config.authType === "oauth") {
      if (!config.tenantId || !config.clientId || !config.clientSecret) {
        return { success: false, reason: "Configuração OAuth do Dynamics NAV incompleta." };
      }
      const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          scope: `${config.serviceUrl.replace(/\/$/, "")}/.default`,
          grant_type: "client_credentials",
        }),
        signal: AbortSignal.timeout(15000),
      });
      const tokenBody = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || typeof tokenBody.access_token !== "string") {
        return { success: false, reason: `Autenticação Dynamics NAV falhou (${tokenResponse.status}).` };
      }
      headers.Authorization = `Bearer ${tokenBody.access_token}`;
    } else if (config.authType === "basic") {
      if (!config.username || !config.clientSecret) {
        return { success: false, reason: "Utilizador e password do Dynamics NAV não configurados." };
      }
      headers.Authorization = `Basic ${Buffer.from(`${config.username}:${config.clientSecret}`).toString("base64")}`;
    } else {
      if (!config.webServiceAccessKey) {
        return { success: false, reason: "Chave de acesso do Dynamics NAV não configurada." };
      }
      headers["Ocp-Apim-Subscription-Key"] = config.webServiceAccessKey;
    }

    const response = await fetch(config.serviceUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(navPayload),
      signal: AbortSignal.timeout(20000),
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { success: false, reason: `Dynamics NAV recusou a sincronização (${response.status}).` };
    }

    const navDocNo = String(responseBody.documentNumber || responseBody.documentNo || responseBody.number || "").trim();
    if (!navDocNo) {
      return { success: false, reason: "Dynamics NAV respondeu sem número de documento." };
    }

    await logAuditoria({
      tabela: "DynamicsNavSync",
      tipoOperacao: "CREATE",
      idRegisto: 0,
      descricao: `Sincronização Pró-Forma ${payload.numeroProForma} com Microsoft Dynamics NAV (Empresa: ${config.companyName})`,
      dadosDepois: navPayload,
    });

    return { success: true, navDocNo };
  } catch (err: any) {
    console.error("[Dynamics NAV Sync] Erro:", err?.message);
    return { success: false, reason: err?.message };
  }
}
