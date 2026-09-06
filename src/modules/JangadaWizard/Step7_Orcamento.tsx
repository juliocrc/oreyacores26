"use client";
import React, { useMemo, useEffect, useRef } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { Receipt, RefreshCw, Search, X, PackageSearch, Info, Download, MessageCircle, Send, ThumbsUp, ThumbsDown, Phone, FileText } from 'lucide-react';
import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import type { OrcamentoLinha, OrcamentoAprovacao, GlobalStockItem } from './types';
import { calcTotal, getIvaRate } from '@/lib/iva';
import { appToast } from '@/lib/app-toast';
import * as XLSX from 'xlsx';
import { ContainerClosureSection } from './ContainerClosureSection';
import { buildClosureOrcamentoLinha } from './containerClosure';
import type { ClosureItemState } from './containerClosure';
import { useWhatsAppAllowed, WHATSAPP_ALLOWED_USER_EMAIL } from '@/lib/use-whatsapp-allowed';

const formatPrice = (value: number) => {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(value || 0);
};

const normalizePhone = (raw: string): string => {
  let num = String(raw || "").replace(/[^\d+]/g, "");
  if (num.startsWith("00")) num = `+${num.slice(2)}`;
  if (/^[89]\d{8}$/.test(num)) num = `+351${num}`;
  return num;
};

const round = (value: number) => Math.round((value || 0) * 100) / 100;

// Embalagem comercial de comprimidos — o orçamento deve faturar embalagens inteiras de 60.
const TABLET_PATTERN = /comprimid|pastilh|enjoo\b|seasick|seasickness/i;
const TABLET_PACK_SIZE = 60;

const roundQtyToCommercialPack = (item: any, quantidade: number) => {
  const qty = Math.max(0, Number(quantidade) || 0);
  if (qty <= 0) return 0;
  const label = String(item?.descricao || item?.name || item?.checklistName || "");
  const ref = String(item?.referencia || "");
  if (!TABLET_PATTERN.test(label) && !TABLET_PATTERN.test(ref)) return qty;
  return Math.ceil(qty / TABLET_PACK_SIZE) * TABLET_PACK_SIZE;
};

const SERVICE_DESCRIPTIONS: Record<string, string> = {
  "L-JD": "Inspeção de Jangada",
  "L-CER": "Certificado de Inspeção",
  "L-LIM": "Limpeza",
  "L-MAR": "Marcação / Marking",
  "L-FS": "Teste FS",
  "L-NAP": "Teste NAP",
  "L-GI": "Teste GI",
  "L-TH": "Teste Hidrostático",
  "L-CO2": "Carga de CO2",
};

const SERVICE_FIXED_PRICES: Record<string, number> = {
  "L-CER": 100,
};

export default function Step7_Orcamento() {
  const { inspectionData, setInspectionData, jangadaId } = useJangadaWizardStore();
  const { allowed: whatsappAllowed } = useWhatsAppAllowed();

  const orcamento = {
    ...(inspectionData.orcamento || { linhas: [], valorMaoObra: 0, valorDesconto: 0, isIsentoIva: false }),
    usarOrcamento: true,
  };
  const linhas: OrcamentoLinha[] = orcamento.linhas || [];
  const globalStock = inspectionData.globalStock || [];
  const [artigoBusca, setArtigoBusca] = React.useState("");
  const linhaSeq = React.useRef(0);

  const getStockPrice = (referencia: string, stockId?: number | string | null) => {
    if (stockId != null && stockId !== "") {
      const byId = globalStock.find((s) => s.id === Number(stockId));
      if (byId && Number(byId.precoVenda) > 0) return Number(byId.precoVenda) || 0;
    }
    const byRef = globalStock.find(
      (s) => s.referencia && referencia && s.referencia.toLowerCase() === String(referencia).toLowerCase()
    );
    return byRef ? Number(byRef.precoVenda) || 0 : 0;
  };

  const buildServiceLines = (): OrcamentoLinha[] => {
    const testes = inspectionData.testes || {};
    const refs: string[] = ["L-JD", "L-CER", "L-LIM", "L-MAR"];
    if (["PASSOU", "REPROVOU", "APROVOU"].includes(testes.testeFS)) refs.push("L-FS");
    if (["PASSOU", "REPROVOU", "APROVOU"].includes(testes.testeNAP)) refs.push("L-NAP");
    if (["PASSOU", "REPROVOU", "APROVOU"].includes(testes.testeGI)) refs.push("L-GI");
    if (["PASSOU", "REPROVOU", "APROVOU"].includes(testes.testeDL) || inspectionData.cylinder?.dataTeste) refs.push("L-TH");
    if (inspectionData.cylinder?.serial) refs.push("L-CO2");

    return refs.map((ref) => {
      const stock = globalStock.find((s) => s.referencia === ref);
      const unitPrice = SERVICE_FIXED_PRICES[ref] ?? (Number(stock?.precoVenda) || 0);
      return {
        id: `service-${ref}`,
        stockId: stock?.id ?? null,
        referencia: ref,
        descricao: SERVICE_DESCRIPTIONS[ref] || stock?.descricao || ref,
        quantidade: 1,
        unitPrice,
        total: unitPrice,
        source: "service" as const,
      };
    });
  };

  const buildPackLines = (): OrcamentoLinha[] =>
    Object.values(inspectionData.packItems || {})
      .filter((item: any) => Number(item.quantidade) > 0)
      .map((item: any) => {
        const unitPrice = getStockPrice(item.referencia, item.stockId);
        const quantidade = roundQtyToCommercialPack(item, item.quantidade);
        return {
          id: `pack-${item.referencia || item.checklistName}`,
          stockId: item.stockId ?? null,
          referencia: item.referencia || "SEM-REF",
          descricao: item.descricao || item.name || "Consumível",
          quantidade,
          unitPrice,
          total: round(quantidade * unitPrice),
          source: "pack" as const,
        };
      });

  const buildComponenteLines = (): OrcamentoLinha[] =>
    (inspectionData.componentes || [])
      .filter((comp: any) => comp.reference || comp.stockId)
      .map((comp: any) => {
        const unitPrice = getStockPrice(comp.reference, comp.stockId);
        return {
          id: `comp-${comp.id}`,
          stockId: comp.stockId ?? null,
          referencia: comp.reference || "SEM-REF",
          descricao: comp.type || comp.name || "Componente",
          quantidade: 1,
          unitPrice,
          total: unitPrice,
          source: "componente" as const,
        };
      });

  const buildClosureLines = (): OrcamentoLinha[] =>
    (inspectionData.containerClosureItems || [])
      .filter((item: any) => Number(item.quantidade) > 0)
      .map((item: any) => buildClosureOrcamentoLinha(item));

  const buildRepairLines = (): OrcamentoLinha[] =>
    (inspectionData.reparacoes || [])
      .filter((r: any) => r.tipo || r.descricao)
      .map((r: any) => {
        const custo = Number(r.custo) || 0;
        return {
          id: `repair-${r.id}`,
          stockId: null,
          referencia: "REPARACAO",
          descricao: `Reparação: ${r.tipo}${r.zona ? ` — ${r.zona}` : ""}`.trim(),
          quantidade: 1,
          unitPrice: custo,
          total: round(custo),
          source: "service" as const,
        };
      });

  const buildBulletinLines = (): OrcamentoLinha[] => {
    // Prefill automático: boletim OTS-65 (substituição de PRV após 10 anos) —
    // adiciona as válvulas de alívio ao orçamento quando aplicável e existem no stock.
    const applied = inspectionData.serviceBulletinsApplied || {};
    const bullets = inspectionData.applicableServiceBulletins || [];
    const otsBulletins = bullets.filter((b: any) =>
      /ots[\s-]?65|replace all ots|10 year life|prv/i.test(`${b.title || ""} ${b.shortDescription || ""} ${b.reason || ""}`)
    );
    if (otsBulletins.length === 0) return [];

    const alreadyRemoved = new Set(orcamento.removedIds || []);
    const matched: OrcamentoLinha[] = [];
    const seen = new Set<string>();

    for (const stock of globalStock) {
      const haystack = `${stock.referencia || ""} ${stock.descricao || ""}`.toLowerCase();
      const isOts65 = /ots[\s-]?65|prv|valvula de alivio|alívio|relief valve/i.test(haystack);
      if (!isOts65) continue;
      const key = stock.referencia || String(stock.id);
      if (seen.has(key)) continue;
      seen.add(key);
      const id = `bullet-ots65-${stock.id}`;
      const sempreAplicar = applied["OTS-65"] === "APLICADO";
      if (!sempreAplicar && (alreadyRemoved.has(id) || alreadyRemoved.has(key))) continue;
      const unitPrice = Number(stock.precoVenda) || 0;
      matched.push({
        id,
        stockId: stock.id,
        referencia: stock.referencia || "OTS65",
        descricao: stock.descricao || "Válvula de alívio OTS-65",
        quantidade: 1,
        unitPrice,
        total: round(unitPrice),
        source: "componente" as const,
      });
    }

    return matched;
  };

  const buildMergedLines = (removedIdsOverride?: string[]): OrcamentoLinha[] => {
    const current = linhas;
    const removed = new Set(removedIdsOverride || orcamento.removedIds || []);
    const built = [...buildServiceLines(), ...buildPackLines(), ...buildComponenteLines(), ...buildClosureLines(), ...buildRepairLines(), ...buildBulletinLines()];

    const result: OrcamentoLinha[] = [];
    for (const b of built) {
      if (removed.has(b.id)) continue;
      const existing = current.find(
        (l) => l.id === b.id || (l.referencia === b.referencia && l.source === b.source)
      );
      if (existing) {
        result.push({
          ...existing,
          quantidade: b.source === "service" ? existing.quantidade || 1 : b.quantidade,
          unitPrice: Number(existing.unitPrice) > 0 ? Number(existing.unitPrice) : b.unitPrice,
          total: round((b.source === "service" ? existing.quantidade || 1 : b.quantidade) * (Number(existing.unitPrice) > 0 ? Number(existing.unitPrice) : b.unitPrice)),
        });
      } else {
        result.push({ ...b });
      }
    }

    const builtIds = new Set(built.map((b) => b.id));
    const builtRefs = new Set(built.map((b) => `${b.referencia}::${b.source}`));
    for (const l of current) {
      if (!builtIds.has(l.id) && !builtRefs.has(`${l.referencia}::${l.source}`)) {
        result.push(l);
      }
    }

    return result;
  };

  const syncFromSubstitutions = () => {
    setInspectionData({
      orcamento: {
        linhas: buildMergedLines(),
        valorMaoObra: 0,
        valorDesconto: Number(orcamento.valorDesconto) || 0,
        isIsentoIva: Boolean(orcamento.isIsentoIva),
        usarOrcamento: true,
      },
    });
  };

  useEffect(() => {
    const next = buildMergedLines();
    const nextKey = next.map((l) => `${l.id}::${l.quantidade}::${l.unitPrice}`).join("|");
    const curKey = linhas.map((l) => `${l.id}::${l.quantidade}::${l.unitPrice}`).join("|");
    if (nextKey !== curKey || next.length !== linhas.length) {
      setInspectionData({
        orcamento: {
          ...orcamento,
          linhas: next,
          usarOrcamento: true,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionData.packItems, inspectionData.componentes, inspectionData.testes, inspectionData.globalStock, inspectionData.containerClosureItems, inspectionData.reparacoes, inspectionData.applicableServiceBulletins, inspectionData.serviceBulletinsApplied]);

  const updateLinha = (id: string, patch: Partial<OrcamentoLinha>) => {
    setInspectionData({
      orcamento: {
        ...orcamento,
        linhas: linhas.map((l) => {
          if (l.id !== id) return l;
          const next = { ...l, ...patch };
          next.quantidade = Number(next.quantidade) || 0;
          next.unitPrice = Number(next.unitPrice) || 0;
          next.total = round(next.quantidade * next.unitPrice);
          return next;
        }),
      },
    });
  };

  const removeLinha = (id: string) => {
    setInspectionData({
      orcamento: {
        ...orcamento,
        linhas: linhas.filter((l) => l.id !== id),
        removedIds: [...(orcamento.removedIds || []), id],
      },
    });
  };

  const restoreRemovedLines = () => {
    setInspectionData({
      orcamento: {
        ...orcamento,
        removedIds: [],
        linhas: buildMergedLines([]),
        usarOrcamento: true,
      },
    });
  };

  const exportOrcamentoXlsx = () => {
    const rows = linhas.map((l) => ({
      Referência: l.referencia || "—",
      Descrição: l.descricao || "",
      Qtd: l.quantidade,
      "Preço Unit. (€)": l.unitPrice,
      "Total (€)": l.total,
      Origem: l.source === "service" ? "Serviço" : l.source === "pack" ? "Pack" : l.source === "componente" ? "Componente" : l.source === "closure" ? "Fecho Contentor" : "Manual",
    }));
    rows.push({ Referência: "", Descrição: "Mão de obra (incluída nos serviços)", Qtd: 0, "Preço Unit. (€)": 0, "Total (€)": 0, Origem: "" });
    rows.push({ Referência: "", Descrição: "Desconto", Qtd: 0, "Preço Unit. (€)": 0, "Total (€)": -(Number(orcamento.valorDesconto) || 0), Origem: "" });
    rows.push({ Referência: "", Descrição: "Subtotal", Qtd: 0, "Preço Unit. (€)": 0, "Total (€)": subtotal, Origem: "" });
    rows.push({ Referência: "", Descrição: `IVA (${orcamento.isIsentoIva ? "isento" : `${(getIvaRate() * 100).toFixed(0)}%`})`, Qtd: 0, "Preço Unit. (€)": 0, "Total (€)": round(total - subtotal), Origem: "" });
    rows.push({ Referência: "", Descrição: "TOTAL", Qtd: 0, "Preço Unit. (€)": 0, "Total (€)": total, Origem: "" });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orçamento");
    XLSX.writeFile(wb, `orcamento-${inspectionData.dataInspecao || "inspecao"}-${inspectionData.serial || "j"}.xlsx`);
  };

  const addArtigo = (artigo: { id: number; referencia: string; descricao: string; precoVenda: number }) => {
    setInspectionData({
      orcamento: {
        ...orcamento,
        linhas: [
          ...linhas,
          {
            id: `stock-${artigo.id}-${++linhaSeq.current}`,
            stockId: artigo.id,
            referencia: artigo.referencia,
            descricao: artigo.descricao,
            quantidade: 1,
            unitPrice: artigo.precoVenda,
            total: artigo.precoVenda,
            source: "stock",
          },
        ],
      },
    });
  };

  const artigosServicos = useMemo(() => {
    return globalStock.filter((s) => /^L-/i.test(s.referencia || ""));
  }, [globalStock]);

  const toggleClosureItem = (item: ClosureItemState, checked: boolean) => {
    const current = (inspectionData.containerClosureItems || []).filter(
      (c: any) => c.key !== item.key,
    );
    const next = checked ? [...current, item] : current;
    setInspectionData({ containerClosureItems: next });
  };

  const updateClosureQuantity = (key: string, quantidade: number) => {
    setInspectionData({
      containerClosureItems: (inspectionData.containerClosureItems || []).map((c: any) =>
        c.key === key ? { ...c, quantidade: Number(quantidade) || 0 } : c,
      ),
    });
  };

  const artigosFiltrados = useMemo(() => {
    const busca = artigoBusca.trim().toLowerCase();
    if (!busca) return [];
    return globalStock
      .filter((s) =>
        (s.referencia || "").toLowerCase().includes(busca) ||
        (s.descricao || "").toLowerCase().includes(busca)
      )
      .slice(0, 8);
  }, [artigoBusca, globalStock]);

  const valorPecas = linhas.reduce((acc, l) => acc + (Number(l.total) || 0), 0);
  const valorDesconto = Number(orcamento.valorDesconto) || 0;
  const subtotal = Math.max(0, valorPecas - valorDesconto);
  const total = calcTotal(valorPecas, 0, valorDesconto, Boolean(orcamento.isIsentoIva));

  const ivAplicar = Boolean(orcamento.isIsentoIva) ? 0 : getIvaRate();
  const valorIva = round(subtotal * ivAplicar);

  const stockById = useMemo(() => {
    const map = new Map<number, GlobalStockItem>();
    for (const s of globalStock) map.set(Number(s.id), s);
    return map;
  }, [globalStock]);

  const stockRefMap = useMemo(() => {
    const map = new Map<string, GlobalStockItem>();
    for (const s of globalStock) {
      const key = String(s.referencia || "").trim().toLowerCase();
      if (key) map.set(key, s);
    }
    return map;
  }, [globalStock]);

  const semStock = (l: OrcamentoLinha) => {
    if (l.source === "service" || l.source === "manual") return false;
    const st = l.stockId != null ? stockById.get(Number(l.stockId)) : undefined;
    if (st) return Number(st.quantidade) <= 0;
    const byRef = l.referencia ? stockRefMap.get(l.referencia.toLowerCase()) : undefined;
    if (byRef) return Number(byRef.quantidade) <= 0;
    return false;
  };

  const substituicoesAtivas =
    Object.values(inspectionData.packItems || {}).filter((i: any) => Number(i.quantidade) > 0).length +
    (inspectionData.componentes || []).filter((c: any) => c.reference || c.stockId).length;

  const aprovacao = orcamento.aprovacaoWhatsApp || { status: 'rascunho' as const };
  const ivaRate = getIvaRate();
  const ivaValor = orcamento.isIsentoIva ? 0 : round(subtotal * ivaRate);
  const totalIva = round(subtotal + ivaValor);
  const linhasTexto = linhas.map((l, i) => `${i + 1}. ${l.referencia || ''} — ${l.descricao || ''}: ${l.quantidade} x ${formatPrice(l.unitPrice)} = ${formatPrice(l.total)}`).join('\n');

  const updateAprovacao = (patch: Partial<OrcamentoAprovacao>) => {
    setInspectionData({
      orcamento: {
        ...orcamento,
        aprovacaoWhatsApp: { ...aprovacao, ...patch },
      },
    });
  };

  const telefoneCliente = aprovacao.telefoneCliente
    || (inspectionData.shipDetails as any)?.cliente?.telmovel
    || (inspectionData.shipDetails as any)?.cliente?.telefone
    || '';
  const clienteId = (inspectionData.shipDetails as any)?.cliente?.id ?? null;
  const validadeDias = Math.max(1, Number(aprovacao.validadeDias) || 15);
  const dataValidade = (() => {
    const d = new Date();
    d.setDate(d.getDate() + validadeDias);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  })();

  const buildMensagemWhatsApp = (lembrete = false) => {
    const nomeCliente = inspectionData.shipDetails?.cliente?.nome || inspectionData.owner || 'Exmo. Cliente';
    const linhasMsg = linhas.length > 0
      ? linhasTexto
      : 'Sem artigos adicionais.';
    if (lembrete) {
      return [
        `Olá ${nomeCliente},`,
        '',
        'Aguardamos a sua resposta ao orçamento de inspeção que lhe enviamos anteriormente:',
        '',
        `O orçamento encontra-se em PDF anexo e é válido até ${dataValidade}.`,
        '',
        'Por favor, responda SIM para aprovar este orçamento ou NÃO para solicitar alterações.',
        '',
        'Com os melhores cumprimentos,',
        'Orey Azores',
      ].join('\n');
    }
    return [
      `Olá ${nomeCliente},`,
      '',
      `Segue o orçamento para a inspeção da jangada ${inspectionData.model || ''} (${inspectionData.capacity || ''}P, Série ${inspectionData.serial || ''}):`,
      '',
      linhasMsg,
      '',
      `Subtotal: ${formatPrice(subtotal)}`,
      `IVA (${orcamento.isIsentoIva ? 'isento' : `${(ivaRate * 100).toFixed(0)}%`}): ${orcamento.isIsentoIva ? '0,00 €' : formatPrice(ivaValor)}`,
      `TOTAL: ${formatPrice(totalIva)}`,
      '',
      `Segue o orçamento em anexo (PDF), válido até ${dataValidade}.`,
      '',
      'Por favor, responda SIM para aprovar este orçamento ou NÃO para solicitar alterações.',
      '',
      'Com os melhores cumprimentos,',
      'Orey Azores',
    ].join('\n');
  };

  const registarAuditoriaEnvio = async (mensagem: string) => {
    if (!jangadaId && !clienteId) return;
    try {
      await fetch('/api/comunicacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'WHATSAPP',
          mensagem,
          destinatario: telefoneCliente || undefined,
          refTipo: jangadaId ? 'Jangada' : undefined,
          refId: jangadaId || null,
          clienteId,
          jangadaId,
        }),
      });
    } catch {
      // auditoria não bloqueia o envio
    }
  };

  const enviarWhatsApp = () => {
    if (!whatsappAllowed) {
      appToast.warning(`WhatsApp disponível apenas para o administrador ${WHATSAPP_ALLOWED_USER_EMAIL}.`);
      return;
    }
    if (linhas.length === 0) {
      appToast.warning("Não existem linhas no orçamento para enviar.");
      return;
    }
    const mensagem = buildMensagemWhatsApp();
    const phoneNum = normalizePhone(telefoneCliente);
    const whatsappUrl = phoneNum
      ? `https://wa.me/${phoneNum.replace('+', '')}?text=${encodeURIComponent(mensagem)}`
      : `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
    window.open(whatsappUrl, '_blank');
    const agora = new Date().toISOString();
    updateAprovacao({
      status: 'enviado',
      telefoneCliente: telefoneCliente || undefined,
      validadeDias,
      mensagem,
      enviadoEm: agora,
    });
    registarAuditoriaEnvio(mensagem);
    appToast.success("Orçamento enviado para aprovação. Aguarde a resposta do cliente.");
  };

  const recordarCliente = () => {
    if (!whatsappAllowed) {
      appToast.warning(`WhatsApp disponível apenas para o administrador ${WHATSAPP_ALLOWED_USER_EMAIL}.`);
      return;
    }
    const mensagem = buildMensagemWhatsApp(true);
    const phoneNum = normalizePhone(telefoneCliente);
    const whatsappUrl = phoneNum
      ? `https://wa.me/${phoneNum.replace('+', '')}?text=${encodeURIComponent(mensagem)}`
      : `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
    window.open(whatsappUrl, '_blank');
    registarAuditoriaEnvio(mensagem);
    appToast.success("Lembrete aberto no WhatsApp.");
  };

  const marcarAprovado = () => {
    updateAprovacao({
      status: 'aprovado',
      aprovadoPorUtilizador: false,
      respondidoEm: new Date().toISOString(),
    });
    appToast.success("Orçamento aprovado pelo cliente.");
  };

  const toggleAprovacaoUtilizador = (aprovado: boolean) => {
    updateAprovacao({
      status: aprovado ? 'aprovado' : 'rascunho',
      aprovadoPorUtilizador: aprovado,
      respondidoEm: aprovado ? new Date().toISOString() : undefined,
    });
    appToast.success(aprovado ? "Orçamento aprovado." : "Aprovação do orçamento removida.");
  };

  const [alteracoesInput, setAlteracoesInput] = React.useState('');
  const [mostrarAlteracoes, setMostrarAlteracoes] = React.useState(false);

  const marcarRejeitado = () => {
    const alteracoes = alteracoesInput.trim();
    if (!alteracoes) {
      appToast.warning("Indique as alterações pedidas pelo cliente antes de registar a rejeição.");
      return;
    }
    updateAprovacao({
      status: 'rejeitado',
      aprovadoPorUtilizador: false,
      alteracoesPedidas: alteracoes,
      respondidoEm: new Date().toISOString(),
    });
    setAlteracoesInput('');
    setMostrarAlteracoes(false);
    appToast.warning("Orçamento rejeitado. Faça as alterações e reenvie.");
  };

  const exportOrcamentoPdf = async () => {
    if (linhas.length === 0) {
      appToast.warning("Não existem linhas no orçamento para gerar o PDF.");
      return;
    }
    try {
      const TEAL: [number, number, number] = [0.06, 0.46, 0.43];
      const DARK: [number, number, number] = [0.13, 0.16, 0.2];
      const GRAY: [number, number, number] = [0.45, 0.49, 0.53];
      const LIGHT: [number, number, number] = [0.91, 0.96, 0.95];

      const doc = await PDFDocument.create();
      const page = doc.addPage([595.28, 841.89]);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

      const MARGIN = 50;
      const PAGE_WIDTH = 595.28;
      const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
      let y = 841.89 - 40;

      const fitText = (text: string, maxWidth: number, f: PDFFont, size: number) => {
        if (f.widthOfTextAtSize(text, size) <= maxWidth) return text;
        let trimmed = text;
        while (trimmed.length > 1 && f.widthOfTextAtSize(`${trimmed}…`, size) > maxWidth) {
          trimmed = trimmed.slice(0, -1);
        }
        return `${trimmed}…`;
      };

      const drawText = (text: string, x: number, yy: number, size = 10, opts: { font?: PDFFont; color?: [number, number, number]; align?: "left" | "right"; maxWidth?: number } = {}) => {
        const f = opts.font || font;
        const color = opts.color || DARK;
        let tx = x;
        if (opts.align === "right") {
          tx = x - f.widthOfTextAtSize(text, size);
        }
        if (opts.maxWidth) {
          text = fitText(text, opts.maxWidth, f, size);
        }
        page.drawText(text, { x: tx, y: yy, size, font: f, color: rgb(color[0], color[1], color[2]) });
      };

      page.drawRectangle({ x: 0, y: 841.89 - 110, width: PAGE_WIDTH, height: 110, color: rgb(TEAL[0], TEAL[1], TEAL[2]) });
      drawText("ORÇAMENTO", MARGIN, 841.89 - 75, 26, { font: fontBold, color: [1, 1, 1] });
      drawText("Orey Azores — Serviços de vistoria e certificação", MARGIN, 841.89 - 48, 11, { color: [1, 1, 1] });

      const referenciaOrcamento = inspectionData.certificadoNumero
        ? `INS-${inspectionData.certificadoNumero}`
        : `SÉRIE ${inspectionData.serial || ''}`;
      drawText(referenciaOrcamento, PAGE_WIDTH - MARGIN, 841.89 - 75, 20, { font: fontBold, color: [1, 1, 1], align: "right" });

      y = 841.89 - 130;
      const label = (lbl: string, val: string, size = 10) => {
        drawText(lbl, MARGIN, y, size, { font: fontBold, color: GRAY });
        drawText(val, MARGIN + 130, y, size, { color: DARK });
        y -= 18;
      };

      label("Cliente", inspectionData.shipDetails?.cliente?.nome || inspectionData.owner || '—');
      label("Embarcação", inspectionData.shipNameManual || inspectionData.shipName || '—');
      label("Jangada", `${inspectionData.brand || ''} ${inspectionData.model || ''}`.trim() || '—', 10);
      if (inspectionData.serial) label("Nº Série Jangada", inspectionData.serial);
      label("Data de emissão", new Date().toLocaleDateString('pt-PT'));
      label("Validade", `até ${dataValidade} (${validadeDias} dias)`);

      y -= 10;
      page.drawRectangle({ x: MARGIN, y: y - 18, width: CONTENT_WIDTH, height: 24, color: rgb(LIGHT[0], LIGHT[1], LIGHT[2]) });
      drawText("Referência", MARGIN + 6, y - 2, 10, { font: fontBold });
      drawText("Descrição", MARGIN + 130, y - 2, 10, { font: fontBold });
      drawText("Qtd", PAGE_WIDTH - MARGIN - 150, y - 2, 10, { font: fontBold, align: "right" });
      drawText("Valor", PAGE_WIDTH - MARGIN, y - 2, 10, { font: fontBold, align: "right" });
      y -= 32;

      for (const linha of linhas) {
        if (y < 100) break;
        drawText(linha.referencia || '—', MARGIN + 6, y, 10, { maxWidth: 110 });
        drawText(linha.descricao || '', MARGIN + 130, y, 10, { maxWidth: 240 });
        drawText(String(linha.quantidade ?? 1), PAGE_WIDTH - MARGIN - 150, y, 10, { align: "right" });
        drawText(formatPrice(linha.total || 0), PAGE_WIDTH - MARGIN, y, 10, { align: "right" });
        y -= 20;
      }

      y -= 6;
      const totalRows: Array<{ label: string; value: string; bold?: boolean }> = [
        { label: "Subtotal", value: formatPrice(subtotal) },
        { label: "IVA", value: orcamento.isIsentoIva ? "Isento" : `16%  ${formatPrice(ivaValor)}` },
        { label: "TOTAL", value: formatPrice(totalIva), bold: true },
      ];
      for (const entry of totalRows) {
        drawText(entry.label, PAGE_WIDTH - MARGIN - 220, y, entry.bold ? 12 : 10, { font: entry.bold ? fontBold : font, align: "right", color: GRAY });
        drawText(entry.value, PAGE_WIDTH - MARGIN, y, entry.bold ? 13 : 10, { font: entry.bold ? fontBold : font, align: "right" });
        if (entry.bold) {
          page.drawRectangle({ x: PAGE_WIDTH - MARGIN - 220, y: y - 4, width: 220, height: 22, color: rgb(TEAL[0], TEAL[1], TEAL[2]) });
          drawText(entry.label, PAGE_WIDTH - MARGIN - 214, y, 12, { font: fontBold, color: [1, 1, 1], align: "right" });
          drawText(entry.value, PAGE_WIDTH - MARGIN - 6, y, 13, { font: fontBold, color: [1, 1, 1], align: "right" });
        }
        y -= entry.bold ? 30 : 20;
      }

      drawText(`Orçamento válido até ${dataValidade}. Aguardamos a sua resposta (SIM para aprovar ou NÃO para solicitar alterações).`, MARGIN, Math.max(y - 10, 60), 9, { color: GRAY });
      drawText("Documento gerado eletronicamente. Obrigado pela preferência.", MARGIN, 60, 9, { color: GRAY });

      const pdfBytes = await doc.save();
      const copy = new Uint8Array(pdfBytes.byteLength);
      copy.set(pdfBytes);
      const blob = new Blob([copy], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orcamento-${inspectionData.serial || 'inspecao'}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      appToast.success("Orçamento PDF gerado e descarregado.");
    } catch (error) {
      console.error("Erro ao gerar orçamento PDF:", error);
      appToast.error("Erro ao gerar o orçamento PDF.");
    }
  };

  const aprovacaoStatusLabel = {
    rascunho: "Por enviar",
    enviado: "A aguardar resposta",
    aprovado: "Aprovado",
    rejeitado: "Rejeitado",
  }[aprovacao.status];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">7. Orçamento</h2>
        <p className="text-slate-600 mt-1">
          Orçamento sincronizado com as substituições registadas (pack e componentes) e os testes realizados. A mão de obra está incluída nos serviços (L-JD / L-RFD / L-DSB); edite preços, quantidades e desconto conforme necessário.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={syncFromSubstitutions}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold shadow-sm hover:bg-indigo-700 transition-colors"
          >
            <RefreshCw size={16} />
            Atualizar a partir de substituições
          </button>
          {(orcamento.removedIds || []).length > 0 && (
            <button
              type="button"
              onClick={restoreRemovedLines}
              className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-800 rounded-xl font-semibold text-sm border border-amber-200 hover:bg-amber-200 transition-colors"
              title="Repor as linhas automáticas que foram removidas"
            >
              <RefreshCw size={16} />
              Repor linhas removidas ({(orcamento.removedIds || []).length})
            </button>
          )}
          {linhas.length > 0 && (
            <button
              type="button"
              onClick={exportOrcamentoXlsx}
              className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-700 rounded-xl font-semibold text-sm border border-indigo-200 hover:bg-indigo-50 transition-colors"
              title="Exportar orçamento para Excel"
            >
              <Download size={16} />
              Exportar XLSX
            </button>
          )}
          {substituicoesAtivas > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1.5">
              {substituicoesAtivas} artigo{substituicoesAtivas === 1 ? "" : "s"} substituído{substituicoesAtivas === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      <ContainerClosureSection
        inspectionData={inspectionData}
        globalStock={globalStock}
        selected={inspectionData.containerClosureItems || []}
        onToggle={toggleClosureItem}
        onUpdateQuantity={updateClosureQuantity}
      />

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 bg-slate-50 border-b border-slate-200 px-6 py-4">
          <Receipt className="text-slate-500" size={20} />
          <h3 className="text-lg font-bold text-slate-800">Linhas do Orçamento</h3>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Adicionar artigo do stock
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={14} className="text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder="Procurar artigo (ex.: L-JD, L-MAR)..."
                  value={artigoBusca}
                  onChange={(e) => setArtigoBusca(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {artigoBusca.trim() && (
                  <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                    {artigosFiltrados.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-500">Sem resultados.</div>
                    ) : (
                      artigosFiltrados.map((artigo) => (
                        <button
                          key={artigo.id}
                          type="button"
                          onClick={() => {
                            addArtigo({
                              id: artigo.id,
                              referencia: artigo.referencia || "",
                              descricao: artigo.descricao || "",
                              precoVenda: Number(artigo.precoVenda) || 0,
                            });
                            setArtigoBusca("");
                          }}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-indigo-50"
                        >
                          <span className="text-xs">
                            <span className="font-bold text-slate-800">{artigo.referencia}</span>
                            <span className="block text-slate-500">{artigo.descricao}</span>
                          </span>
                          <span className="text-xs font-semibold text-slate-700">{formatPrice(Number(artigo.precoVenda))}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Serviços (um clique)
              </label>
              {artigosServicos.length === 0 ? (
                <div className="text-xs text-slate-400 italic pt-2">Sem serviços L-* no stock carregado.</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {artigosServicos.map((artigo) => (
                    <button
                      key={artigo.id}
                      type="button"
                      onClick={() =>
                        addArtigo({
                          id: artigo.id,
                          referencia: artigo.referencia || "",
                          descricao: artigo.descricao || "",
                          precoVenda: Number(artigo.precoVenda) || 0,
                        })
                      }
                      title={artigo.descricao}
                      className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      {artigo.referencia} · {formatPrice(Number(artigo.precoVenda))}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {linhas.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 bg-slate-50 rounded-2xl p-10 flex flex-col items-center justify-center text-center">
              <PackageSearch className="w-10 h-10 text-slate-300 mb-3" />
              <h3 className="text-base font-semibold text-slate-700 mb-1">Sem linhas no orçamento</h3>
              <p className="text-sm text-slate-500 max-w-md">
                Carregue em “Atualizar a partir de substituições” para gerar as linhas automáticas ou adicione artigos manualmente.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Artigo</th>
                    <th className="w-16 px-2 py-2 text-right font-semibold">Qtd</th>
                    <th className="w-24 px-2 py-2 text-right font-semibold">Preço €</th>
                    <th className="w-24 px-2 py-2 text-right font-semibold">Total €</th>
                    <th className="w-8 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {linhas.map((linha) => (
                    <tr key={linha.id}>
                      <td className="px-3 py-2">
                        <div className="font-bold text-slate-800">{linha.referencia || "—"}</div>
                        <div className="text-slate-500">{linha.descricao}</div>
                        <div className="text-[9px] uppercase tracking-wider text-slate-400 mt-0.5">
                          {linha.source === "service" ? "Serviço" : linha.source === "pack" ? "Pack" : linha.source === "componente" ? "Componente" : linha.source === "closure" ? "Fecho Contentor" : "Manual"}
                        </div>
                        {semStock(linha) && (
                          <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            <PackageSearch size={10} />
                            Sem stock disponível
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={linha.quantidade ?? 1}
                          onChange={(e) => updateLinha(linha.id, { quantidade: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                          className="w-full rounded-lg border border-slate-300 px-1.5 py-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={linha.unitPrice ?? 0}
                          onChange={(e) => updateLinha(linha.id, { unitPrice: Math.max(0, round(Number(e.target.value) || 0)) })}
                          className="w-full rounded-lg border border-slate-300 px-1.5 py-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-slate-800">{formatPrice(linha.total)}</td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeLinha(linha.id)}
                          className="text-slate-400 hover:text-red-600"
                          aria-label="Remover artigo"
                        >
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Desconto (€)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={orcamento.valorDesconto || ""}
                onChange={(e) => setInspectionData({ orcamento: { ...orcamento, valorDesconto: Number(e.target.value) } })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(orcamento.isIsentoIva)}
                  onChange={(e) => setInspectionData({ orcamento: { ...orcamento, isIsentoIva: e.target.checked } })}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Isento de IVA
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="flex items-center justify-between text-slate-600">
              <span>Peças / serviços</span>
              <span className="font-semibold text-slate-800">{formatPrice(valorPecas)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600 mt-1.5">
              <span>Mão de obra (incluída nos serviços)</span>
              <span className="font-semibold text-slate-800">Incluída</span>
            </div>
            {valorDesconto > 0 && (
              <div className="flex items-center justify-between text-rose-600 mt-1.5">
                <span>Desconto</span>
                <span className="font-semibold">−{formatPrice(valorDesconto)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-slate-600 mt-1.5">
              <span>Subtotal (sem IVA)</span>
              <span className="font-semibold text-slate-800">{formatPrice(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600 mt-1.5">
              <span>IVA</span>
              <span className="font-semibold text-slate-800">
                {orcamento.isIsentoIva ? "Isento" : `${Math.round(ivAplicar * 100)}% (${formatPrice(valorIva)})`}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 mt-2.5 pt-2.5 text-slate-900">
              <span className="font-bold">Total com IVA</span>
              <span className="font-black text-indigo-700">{formatPrice(total)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex gap-3 items-start">
        <Info className="text-indigo-600 shrink-0 mt-0.5" size={20} />
        <div>
          <h4 className="text-sm font-bold text-indigo-900">Sincronização automática</h4>
          <p className="text-xs text-indigo-800 mt-1">
            Ao fechar a inspeção, estas linhas são gravadas na ordem de serviço associada à jangada, substituindo o cálculo automático. Os preços são preenchidos a partir do stock (preço de venda); edite apenas quando necessário.
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 bg-gradient-to-r from-emerald-600 to-green-500 px-6 py-4">
          <MessageCircle className="text-white" size={20} />
          <h3 className="text-lg font-bold text-white">Aprovação do Orçamento via WhatsApp</h3>
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-emerald-900 bg-white/90 rounded-full px-3 py-1.5">
            Estado: {aprovacaoStatusLabel}
          </span>
        </div>

        <div className="p-6 space-y-5">
          <label className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 cursor-pointer transition-colors hover:bg-indigo-100/70">
            <input
              type="checkbox"
              checked={Boolean(aprovacao.aprovadoPorUtilizador)}
              onChange={(e) => toggleAprovacaoUtilizador(e.target.checked)}
              className="h-5 w-5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <p className="text-sm font-bold text-indigo-900">Aprovar orçamento</p>
              <p className="text-xs text-indigo-700 mt-0.5">
                Marque para registar a aprovação do orçamento pelo utilizador responsável, sem depender do WhatsApp.
              </p>
            </div>
          </label>
          {aprovacao.status === 'aprovado' ? (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <ThumbsUp className="text-emerald-600 shrink-0 mt-0.5" size={20} />
              <div>
                <p className="text-sm font-bold text-emerald-800">
                  {aprovacao.aprovadoPorUtilizador ? 'Orçamento aprovado pelo utilizador' : 'Orçamento aprovado pelo cliente'}
                </p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  {aprovacao.respondidoEm
                    ? `Resposta registada a ${new Date(aprovacao.respondidoEm).toLocaleString('pt-PT')}.`
                    : 'Resposta registada.'}{' '}
                  Pode continuar para o passo seguinte.
                </p>
              </div>
            </div>
          ) : (
            <>
              {aprovacao.status === 'rejeitado' && (
                <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                  <ThumbsDown className="text-red-600 shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="text-sm font-bold text-red-800">Orçamento rejeitado pelo cliente</p>
                    {aprovacao.alteracoesPedidas ? (
                      <p className="text-xs text-red-700 mt-0.5">
                        Alterações pedidas: <span className="font-semibold">“{aprovacao.alteracoesPedidas}”</span> — edite as linhas acima e reenvie.
                      </p>
                    ) : (
                      <p className="text-xs text-red-700 mt-0.5">Edite as linhas acima e reenvie o orçamento.</p>
                    )}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Cliente</label>
                  <input
                    type="text"
                    value={inspectionData.shipDetails?.cliente?.nome || inspectionData.owner || ''}
                    readOnly
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Telemóvel (WhatsApp)
                  </label>
                  <div className="flex items-center gap-2">
                    <Phone size={16} className="text-slate-400 shrink-0" />
                    <input
                      type="text"
                      value={telefoneCliente}
                      onChange={(e) => updateAprovacao({ telefoneCliente: e.target.value })}
                      placeholder="Sem contacto registado — edite se necessário"
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Validade (dias)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={validadeDias}
                    onChange={(e) => updateAprovacao({ validadeDias: Number(e.target.value) || 15 })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Pré-visualização da mensagem</p>
                <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 leading-relaxed">{buildMensagemWhatsApp()}</pre>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={enviarWhatsApp}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md transition-all"
                >
                  <Send size={16} />
                  Enviar Orçamento por WhatsApp
                </button>
                <button
                  type="button"
                  onClick={exportOrcamentoPdf}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white text-rose-700 rounded-xl font-bold border border-rose-200 hover:bg-rose-50 transition-colors"
                  title="Gerar o orçamento em PDF para enviar ao cliente"
                >
                  <FileText size={16} />
                  Exportar PDF
                </button>
                {aprovacao.status === 'enviado' && (
                  <>
                    <button
                      type="button"
                      onClick={recordarCliente}
                      className="flex items-center gap-2 px-5 py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-xl font-bold transition-colors"
                      title="Reabrir o WhatsApp com um lembrete ao cliente"
                    >
                      <RefreshCw size={16} />
                      Recordar cliente
                    </button>
                    <button
                      type="button"
                      onClick={marcarAprovado}
                      className="flex items-center gap-2 px-5 py-2.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-xl font-bold transition-colors"
                    >
                      <ThumbsUp size={16} />
                      Cliente respondeu SIM
                    </button>
                    <button
                      type="button"
                      onClick={() => setMostrarAlteracoes(true)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl font-bold transition-colors"
                    >
                      <ThumbsDown size={16} />
                      Cliente respondeu NÃO
                    </button>
                  </>
                )}
              </div>

              {aprovacao.status === 'enviado' && mostrarAlteracoes && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                  <label className="block text-sm font-bold text-red-800">
                    Alterações pedidas pelo cliente
                  </label>
                  <textarea
                    value={alteracoesInput}
                    onChange={(e) => setAlteracoesInput(e.target.value)}
                    rows={3}
                    placeholder="Ex.: reduzir a quantidade de reparações, alterar o pack substituído, novo prazo..."
                    className="w-full rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={marcarRejeitado}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-colors"
                    >
                      Registar rejeição e alterações
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMostrarAlteracoes(false); setAlteracoesInput(''); }}
                      className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
