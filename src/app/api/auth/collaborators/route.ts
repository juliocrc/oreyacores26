import { NextResponse } from "next/server";
import { listarTecnicosSelecionaveis } from "@/lib/selecao-tecnicos";

/**
 * Lista de técnicos para o arranque sem palavra-passe.
 *
 * Devolve os técnicos activos (e não os `User`) porque quem entra é o técnico
 * que clica no nome. `temUtilizador=false` significa que o utilizador ainda vai
 * ser criado no momento do clique.
 */
export async function GET() {
  try {
    const tecnicos = await listarTecnicosSelecionaveis();

    return NextResponse.json({
      users: tecnicos.map((t) => ({
        // `id` é o id do técnico — é o que o login sem passwordless envia.
        id: t.tecnicoId,
        name: t.nome,
        email: t.email,
        image: null,
        role: "USER",
        estacao: t.estacao,
        estacaoId: t.estacaoId,
        estacaoPrincipal: t.estacaoPrincipal,
        temUtilizador: t.temUtilizador,
      })),
    });
  } catch (error) {
    console.error("Erro ao obter colaboradores:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
