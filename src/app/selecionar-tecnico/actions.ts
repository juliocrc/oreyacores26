"use server";

import { cookies } from "next/headers";
import { signIn } from "@/auth";
import prisma from "@/lib/prisma";
import { normalizeEmail } from "@/lib/auth";
import { ACTIVE_SERVICE_STATION_COOKIE } from "@/lib/station-selection";
import { isLocalAuthBypassEnabled } from "@/lib/local-auth";

// Tem de coincidir com APP_SESSION_COOKIE em src/app/session-idle-timeout.tsx.
// Sem este cookie o SessionIdleTimeout desloga a sessão no acto seguinte e
// devolve o utilizador ao ecrã de arranque.
const APP_SESSION_COOKIE = "orey_app_open";

function clearAppSessionCookie(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  cookieStore.set(APP_SESSION_COOKIE, "", { path: "/", sameSite: "lax", maxAge: 0 });
}

export type SelecaoState = { erro?: string; ok?: boolean };

/**
 * Início de sessão com palavra-passe.
 *
 * O técnico é escolhido e é necessária a palavra-passe para autenticar.
 */
export async function selecionarTecnico(
  _estadoAnterior: SelecaoState,
  formData: FormData,
): Promise<SelecaoState> {
  const tecnicoIdRaw = String(formData.get("tecnicoId") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const stationIdRaw = String(formData.get("stationId") ?? "").trim();
  const stationIdEscolhida = Number.parseInt(stationIdRaw, 10);

  const tecnicoId = Number.parseInt(tecnicoIdRaw, 10);
  if (!Number.isInteger(tecnicoId) || tecnicoId <= 0) {
    return { erro: "Técnico não identificado." };
  }

  if (!password) {
    return { erro: "Introduza a palavra-passe." };
  }

  // O callbackUrl é validado e normalizado na página e viaja num campo oculto
  // só para o componente saber para onde navegar — a acção não faz redirect.

  try {
    const tecnico = await prisma.tecnico.findFirst({
      where: { id: tecnicoId, ativo: true },
      select: { id: true, nome: true, email: true, serviceStationId: true },
    });

    if (!tecnico) {
      return { erro: "Este técnico não existe ou está inactivo." };
    }

    if (!tecnico.email) {
      return { erro: "Este técnico não tem email associado. Contacta o administrador." };
    }

    const email = normalizeEmail(tecnico.email);

    // Link by email, not by unrelated Tecnico/User IDs. Public login must not
    // provision administrators or mutate an account before authentication.
    const existente = await prisma.user.findFirst({
      where: { email, NOT: { role: "CLIENTE" } },
      select: { id: true },
    });

    if (!existente) {
      if (!isLocalAuthBypassEnabled()) {
        return { erro: "A conta de acesso deve ser configurada pelo administrador." };
      }
      await prisma.user.create({
          data: {
            email,
            name: tecnico.nome,
            role: "ADMIN",
            passwordHash: null,
            lastLoginAt: new Date(),
          },
          select: { id: true },
        });
    }

    // Authenticate before writing application/station cookies.
    const resultado = await signIn("credentials", {
      loginType: "credentials",
      email, password,
      redirect: false,
      redirectTo: "/",
    });
    const success = typeof resultado === "string"
      ? new URL(resultado, "http://localhost").pathname === "/" && !new URL(resultado, "http://localhost").searchParams.has("error")
      : resultado?.ok === true && !resultado.error;
    if (!success) {
      clearAppSessionCookie(await cookies());
      return { erro: "Não foi possível iniciar a sessão. Tenta novamente." };
    }

    // Marca a aplicação como aberta. O SessionIdleTimeout usa este cookie para
    // distinguir "a aplicação ficou aberta" de "o browser foi fechado"; sem ele
    // a sessão acabada de criar era imediatamente terminada.
    const cookieStore = await cookies();
    cookieStore.set(APP_SESSION_COOKIE, "1", {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });

    // A estação ativa é a escolhida no login; quando não há escolha (ex.: "Todas
    // as estações"), recai na estação a que o técnico pertence. A multi-estacão
    // já permite trocar de estação mais tarde, em `estacao-servico`.
    let estacaoAtivaId = tecnico.serviceStationId ?? null;
    if (Number.isInteger(stationIdEscolhida) && stationIdEscolhida > 0) {
      const estacao = await prisma.serviceStation.findFirst({
        where: { id: stationIdEscolhida, ativo: true },
        select: { id: true },
      });
      if (estacao) estacaoAtivaId = estacao.id;
    }

    if (estacaoAtivaId) {
      cookieStore.set(ACTIVE_SERVICE_STATION_COOKIE, String(estacaoAtivaId), {
        path: "/",
        sameSite: "lax",
        httpOnly: false,
        maxAge: 60 * 60 * 24 * 30,
      });
    }

  } catch (err) {
    console.error("[selecionar-tecnico] Falha ao iniciar sessão:", err);
    return { erro: "Não foi possível iniciar a sessão. Tenta novamente." };
  }

  return { ok: true };
}
