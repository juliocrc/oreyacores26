"use server";

import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import prisma from "@/lib/prisma";
import { APP_CONFIG } from "@/lib/app-config";

export type SelecaoState = { erro?: string };

/**
 * OREYACORESDELUXE — início de sessão sem palavra-passe.
 *
 * O técnico é escolhido uma vez no arranque. Validamos que pertence à
 * estação configurada e que está activo antes de criar a sessão, para que
 * ninguém possa abrir a sessão com um id forjado.
 */
export async function selecionarTecnico(
  _estadoAnterior: SelecaoState,
  formData: FormData,
): Promise<SelecaoState> {
  const tecnicoIdRaw = String(formData.get("tecnicoId") ?? "").trim();
  const callbackUrlRaw = String(formData.get("callbackUrl") ?? "").trim();

  const tecnicoId = Number.parseInt(tecnicoIdRaw, 10);
  if (!Number.isInteger(tecnicoId) || tecnicoId <= 0) {
    return { erro: "Técnico não identificado." };
  }

  // Só(callbackUrl) internas — evita open redirect.
  const callbackUrl =
    callbackUrlRaw.startsWith("/") && !callbackUrlRaw.startsWith("//")
      ? callbackUrlRaw
      : "/";

  try {
    const estacao = await prisma.serviceStation.findFirst({
      where: { codigo: APP_CONFIG.defaultServiceStationCode, ativo: true },
      select: { id: true },
    });

    if (!estacao) {
      return { erro: `Estação ${APP_CONFIG.defaultServiceStationCode} indisponível.` };
    }

    const tecnico = await prisma.tecnico.findFirst({
      where: { id: tecnicoId, serviceStationId: estacao.id, ativo: true },
      select: { id: true, nome: true, email: true },
    });

    if (!tecnico) {
      return { erro: "Este técnico não pertence à estação ou está inactivo." };
    }

    if (!tecnico.email) {
      return { erro: "Este técnico não tem email associado. Contacta o administrador." };
    }

    // O Tecnico e o User são modelos diferentes: liga-se sempre pelo email,
    // nunca por id (os ids não têm qualquer relação entre si).
    const user = await prisma.user.findFirst({
      where: { email: tecnico.email, NOT: { role: "CLIENTE" } },
      select: { id: true, name: true, role: true },
    });

    if (!user) {
      return {
        erro:
          "Este técnico ainda não tem utilizador na Deluxe. Executa " +
          "`node scripts/garantir-tecnicos-deluxe.cjs` uma vez.",
      };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { name: tecnico.nome, lastLoginAt: new Date() },
    });

    // Sessão criada sem palavra-passe (loginType "passwordless").
    await signIn("credentials", {
      loginType: "passwordless",
      userId: String(user.id),
      redirectTo: callbackUrl,
    });
  } catch (err) {
    console.error("[selecionar-tecnico] Falha ao iniciar sessão:", err);
    return { erro: "Não foi possível iniciar a sessão. Tenta novamente." };
  }

  // `signIn` com redirectTo redirecciona; se não redireccionar, envia para o início.
  redirect(callbackUrl);
}
