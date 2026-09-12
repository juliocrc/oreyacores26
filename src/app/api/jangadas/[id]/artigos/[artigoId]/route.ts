import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { normalizeArtigoValidade } from "@/lib/date-utils";
import { PACK_FIELD_DEFINITIONS } from "@/modules/rafts/mandatoryPack";
import { readInspectionChecklistValues, writeInspectionChecklistValues } from "@/lib/inspection-checklist-store";
import { getAccessContext } from "@/lib/access-control";
import { canEditPath } from "@/lib/user-permissions";
import { logAuditoria } from "@/lib/auditoria";

const artigoJangadaDelegate = prisma.artigoJangada;

function ensureArtigoJangadaDelegate() {
  if (!artigoJangadaDelegate) {
    return NextResponse.json(
      { error: "Modelo ArtigoJangada indisponível no Prisma Client atual" },
      { status: 500 }
    );
  }
  return null;
}

async function requireEditorAccess() {
  const access = await getAccessContext();
  if (!access) return { access, error: NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 }) };
  if (!access.isAdmin && !canEditPath(access.permissions, "/jangadas")) {
    return { access, error: NextResponse.json({ error: "Sem permissão para editar jangadas." }, { status: 403 }) };
  }
  return { access, error: null };
}

// PUT /api/jangadas/[id]/artigos/[artigoId] - Atualiza artigo
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string; artigoId: string }> }
) {
  const delegateError = ensureArtigoJangadaDelegate();
  if (delegateError) return delegateError;

  const { access, error: accessError } = await requireEditorAccess();
  if (accessError) return accessError;

  const { id, artigoId: rawArtigoId } = await context.params;
  const jangadaId = Number(id);
  const artigoId = Number(rawArtigoId);

  if (isNaN(jangadaId) || isNaN(artigoId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const raw = await req.json();
  const data: Record<string, unknown> = {};
  if (raw.name !== undefined) data.name = String(raw.name).trim() || "Artigo";
  if (raw.referencia !== undefined) data.referencia = String(raw.referencia || "").trim() || null;
  if (raw.quantidade !== undefined) data.quantidade = Number(raw.quantidade) || 0;
  if (raw.validade !== undefined) {
    data.validade = normalizeArtigoValidade(raw.validade);
  }
  if (raw.lote !== undefined) data.lote = String(raw.lote || "").trim() || null;
  if (raw.estado !== undefined) data.estado = String(raw.estado || "ATIVO").trim();
  if (raw.observacoes !== undefined) data.observacoes = String(raw.observacoes || "").trim() || null;
  if (raw.stockId !== undefined) {
    data.stockId = Number.isInteger(Number(raw.stockId)) && Number(raw.stockId) > 0
      ? Number(raw.stockId)
      : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nenhum campo válido para atualizar." }, { status: 400 });
  }

  const existing = await artigoJangadaDelegate.findUnique({ where: { id: artigoId } });

  if (!existing || existing.jangadaId !== jangadaId) {
    return NextResponse.json({ error: "Artigo não encontrado para esta jangada" }, { status: 404 });
  }

  const artigo = await artigoJangadaDelegate.update({
    where: { id: artigoId },
    data,
  });

  await logAuditoria({
    tabela: "ArtigoJangada",
    tipoOperacao: "UPDATE",
    idRegisto: artigoId,
    descricao: `Artigo da jangada atualizado: ${artigo.name || existing.name}${artigo.referencia ? ` (ref. ${artigo.referencia})` : ""} — quantidade ${existing.quantidade} → ${artigo.quantidade}.`,
    usuario: access.email || "sistema",
    dadosAntes: existing,
    dadosDepois: artigo,
  });

  return NextResponse.json(artigo);
}

// DELETE /api/jangadas/[id]/artigos/[artigoId] - Remove artigo
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string; artigoId: string }> }
) {
  const delegateError = ensureArtigoJangadaDelegate();
  if (delegateError) return delegateError;

  const { access, error: accessError } = await requireEditorAccess();
  if (accessError) return accessError;

  const { id, artigoId: rawArtigoId } = await context.params;
  const jangadaId = Number(id);
  const artigoId = Number(rawArtigoId);

  if (isNaN(jangadaId) || isNaN(artigoId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const existing = await artigoJangadaDelegate.findUnique({ where: { id: artigoId } });

  if (!existing || existing.jangadaId !== jangadaId) {
    return NextResponse.json({ error: "Artigo não encontrado para esta jangada" }, { status: 404 });
  }

  const artigoSerializado = { ...existing, validade: existing.validade ? existing.validade.toISOString() : null };

  // Sincronizar remoção com a checklist do pack antes de eliminar fisicamente o artigo
  try {
    const checklist = await readInspectionChecklistValues(jangadaId);

    const dbName = existing.name.trim().toUpperCase();
    const dbRef = String(existing.referencia || '').trim().toUpperCase();

    const matchedDef = PACK_FIELD_DEFINITIONS.find(def => {
      const matchByRef = def.stockReferences?.some(r => String(r || '').trim().toUpperCase() === dbRef);
      const matchByName = def.aliases.some(a => {
        const normA = a.trim().toUpperCase();
        return normA === dbName || dbName.includes(normA) || normA.includes(dbName);
      });
      return matchByRef || matchByName;
    });

    if (matchedDef) {
      const updatedChecklist = { ...checklist };
      if (matchedDef.name) {
        updatedChecklist[matchedDef.name] = false;
      }
      if (matchedDef.validityFieldName) {
        updatedChecklist[matchedDef.validityFieldName] = "";
      }
      updatedChecklist[`ref_${matchedDef.name}`] = "";
      updatedChecklist[`lote_${matchedDef.name}`] = "";

      await writeInspectionChecklistValues(jangadaId, updatedChecklist);
    }
  } catch (syncErr) {
    console.error("Erro ao sincronizar remoção de artigo com a checklist:", syncErr);
  }

  await artigoJangadaDelegate.delete({ where: { id: artigoId } });

  await logAuditoria({
    tabela: "ArtigoJangada",
    tipoOperacao: "DELETE",
    idRegisto: artigoId,
    descricao: `Artigo removido da jangada: ${existing.name}${existing.referencia ? ` (ref. ${existing.referencia})` : ""}, quantidade ${existing.quantidade}.`,
    usuario: access.email || "sistema",
    dadosAntes: artigoSerializado,
  });

  return NextResponse.json({ success: true });
}
