import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { canEditPath } from "@/lib/user-permissions";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";
import { logAuditoria } from "@/lib/auditoria";
import { canonicalizeRaftBrand, canonicalizeRaftModel, canonicalizeCylinderSistema } from "@/lib/text-normalization";
import { isKnownPackTypeName } from "@/lib/custom-pack-types";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    const canManageJangadas = access.isAdmin || canEditPath(access.permissions, "/jangadas");
    if (!canManageJangadas) return NextResponse.json({ error: "Sem permissão para criar jangadas." }, { status: 403 });

    const { id: rawId } = await context.params;
    const jangadaId = Number(rawId);
    if (!Number.isFinite(jangadaId) || jangadaId <= 0) {
      return NextResponse.json({ error: "ID de jangada inválido." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const novoSerial = String(body?.novoSerial ?? "").trim();
    const copiarArtigos = Boolean(body?.copiarArtigos);

    if (!novoSerial) {
      return NextResponse.json({ error: "Indique o número de série da nova jangada." }, { status: 400 });
    }

    const original = await prisma.jangada.findUnique({
      where: { id: jangadaId },
      include: { artigos: true },
    });
    if (!original) {
      return NextResponse.json({ error: "Jangada original não encontrada." }, { status: 404 });
    }

    const duplicado = await prisma.jangada.findUnique({ where: { serial: novoSerial } });
    if (duplicado) {
      return NextResponse.json({ error: "Já existe uma jangada com esse número de série registada." }, { status: 409 });
    }

    const isValidPackType = await isKnownPackTypeName(String(original.packType || ""));
    if (!isValidPackType) {
      return NextResponse.json({ error: "O tipo de pack da jangada original é inválido." }, { status: 400 });
    }

    const data = {
      serial: novoSerial,
      brand: canonicalizeRaftBrand(original.brand),
      model: canonicalizeRaftModel(original.model, original.brand, original.packType, novoSerial),
      launchType: original.launchType,
      painterLength: original.painterLength,
      maxStowageHeight: original.maxStowageHeight,
      capacity: original.capacity,
      owner: original.owner,
      dataFabrico: original.dataFabrico,
      packType: original.packType,
      containerModel: original.containerModel,
      containerSize: original.containerSize,
      fabricType: (original as any).fabricType,
      shipId: original.shipId,
      shipNameManual: original.shipNameManual,
      cylinderSerial: original.cylinderSerial,
      cylinderTara: original.cylinderTara,
      cylinderPesoBruto: original.cylinderPesoBruto,
      cylinderCo2: original.cylinderCo2,
      cylinderN2: original.cylinderN2,
      cylinderSistema: canonicalizeCylinderSistema(original.cylinderSistema),
      cylinderCabecaDisparoRef: original.cylinderCabecaDisparoRef,
      cylinderCabecaDisparoSerial: original.cylinderCabecaDisparoSerial,
      cylinderCabecaDisparoDescricao: original.cylinderCabecaDisparoDescricao,
      cylinderTuboCamaraSuperiorRef: original.cylinderTuboCamaraSuperiorRef,
      cylinderTuboCamaraSuperiorDescricao: original.cylinderTuboCamaraSuperiorDescricao,
      cylinderTuboCamaraInferiorRef: original.cylinderTuboCamaraInferiorRef,
      cylinderTuboCamaraInferiorDescricao: original.cylinderTuboCamaraInferiorDescricao,
      cylinderAcessoriosCamaraSuperiorJson: original.cylinderAcessoriosCamaraSuperiorJson,
      cylinderAcessoriosCamaraInferiorJson: original.cylinderAcessoriosCamaraInferiorJson,
      cylindersJson: original.cylindersJson,
      testeCamarasJson: original.testeCamarasJson,
      valvulasAlivio: original.valvulasAlivio,
      valvulasAtestar: original.valvulasAtestar,
      tuboIdentificacao: original.tuboIdentificacao,
      serviceStationId: original.serviceStationId,
    };

    const nova = await prisma.$transaction(async (tx) => {
      const created = await tx.jangada.create({ data });
      if (copiarArtigos && original.artigos.length > 0) {
        await tx.artigoJangada.createMany({
          data: original.artigos.map((artigo) => ({
            jangadaId: created.id,
            name: artigo.name,
            quantidade: artigo.quantidade,
            validade: artigo.validade,
            referencia: artigo.referencia,
            codigoFabricante: artigo.codigoFabricante,
          })),
        });
      }
      return created;
    });

    await logAuditoria({
      tabela: "Jangada",
      tipoOperacao: "CREATE",
      idRegisto: nova.id,
      descricao: `Ficha da jangada duplicada a partir de S/N ${original.serial} (${original.brand} ${original.model}, ${original.capacity}P) para S/N ${novoSerial}${copiarArtigos ? ", com consumíveis copiados" : ""}.`,
      usuario: access.email || "sistema",
    });

    return NextResponse.json(nova, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Já existe uma jangada com esse número de série registada." }, { status: 409 });
    }
    return buildDatabaseErrorResponse(error, error instanceof Error ? error.message : "Erro ao duplicar jangada.");
  }
}
