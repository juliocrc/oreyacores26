"use server";

import { cookies } from "next/headers";
import { signIn } from "@/auth";
import prisma from "@/lib/prisma";
import { normalizeEmail } from "@/lib/auth";
import { ACTIVE_SERVICE_STATION_COOKIE } from "@/lib/station-selection";

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

    // O Tecnico e o User são modelos diferentes: liga-se sempre pelo email,
    // nunca por id (os ids não têm qualquer relação entre si). Se o técnico
    // ainda não tiver utilizador, criamos agora — assim ninguém fica bloqueado
    // por causa de um script de manutenção que ninguém se lembra de correr.
    const existente = await prisma.user.findFirst({
      where: { email, NOT: { role: "CLIENTE" } },
      select: { id: true },
    });

    const user = existente
      ? await prisma.user.update({
          where: { id: existente.id },
          data: { name: tecnico.nome, lastLoginAt: new Date() },
          select: { id: true },
        })
      : await prisma.user.create({
          data: {
            email,
            name: tecnico.nome,
            role: "ADMIN",
            passwordHash: null,
            lastLoginAt: new Date(),
          },
          select: { id: true },
        });

    // Marca a aplicação como aberta. O SessionIdleTimeout usa este cookie para
    // distinguir "a aplicação ficou aberta" de "o browser foi fechado"; sem ele
    // a sessão acabada de criar era imediatamente terminada.
    const cookieStore = await cookies();
    cookieStore.set(APP_SESSION_COOKIE, "1", {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });

    // A estação segue a pessoa: não há selector de estação no arranque.
    if (tecnico.serviceStationId) {
      cookieStore.set(ACTIVE_SERVICE_STATION_COOKIE, String(tecnico.serviceStationId), {
        path: "/",
        sameSite: "lax",
        httpOnly: false,
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    // Sessão com palavra-passe (loginType "credentials").
    // `redirect: false` para não lançarmos um redirect de dentro da acção: quem
    // navega é o componente, que depois de `ok` faz replace + refresh. Assim o
    // clique leva sempre para o ecrã pedido, mesmo com o router já hidratado.
    const resultado = await signIn("credentials", {
      loginType: "credentials",
      email, password,
      redirect: false,
    });

    if (resultado && typeof resultado === "object" && "error" in resultado && resultado.error) {
      clearAppSessionCookie(cookieStore);
      return { erro: "Não foi possível iniciar a sessão. Tenta novamente." };
    }
  } catch (err) {
    console.error("[selecionar-tecnico] Falha ao iniciar sessão:", err);
    return { erro: "Não foi possível iniciar a sessão. Tenta novamente." };
  }

  return { ok: true };
}
