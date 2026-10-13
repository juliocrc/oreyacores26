"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

// Páginas que podem ser vistas sem sessão — não forçar saída nelas.
const PUBLIC_PREFIXES = ["/selecionar-tecnico", "/login", "/area-cliente"];

/**
 * Sessão única por utilizador: se a sessão deixar de ser válida (por exemplo
 * porque o mesmo utilizador entrou noutro computador), esta instância termina
 * a sessão local e reenvia para a seleção de técnico.
 */
export default function SessionSingleWatcher() {
  const pathname = usePathname();
  const { status } = useSession();
  const hadSessionRef = useRef(false);
  const signingOutRef = useRef(false);

  useEffect(() => {
    if (status === "authenticated") {
      hadSessionRef.current = true;
    }
  }, [status]);

  useEffect(() => {
    if (status !== "unauthenticated" || !hadSessionRef.current || signingOutRef.current) return;

    const isPublic =
      pathname === "/" || PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    if (isPublic) return;

    signingOutRef.current = true;
    void signOut({ callbackUrl: "/selecionar-tecnico" });
  }, [status, pathname]);

  return null;
}
