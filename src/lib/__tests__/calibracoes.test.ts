import {
  contarPorEstado,
  createInitialCalibracaoForm,
  diasAte,
  filtrarRegistos,
  formFromRegisto,
  getEstadoCalibracao,
  isCalibracaoTipo,
  isCompressorTipo,
  rotuloTipo,
} from "../calibracoes";
import type { CalibracaoRegisto } from "../calibracoes";

function diasDesde(dias: number) {
  return new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
}

function registo(overrides: Partial<CalibracaoRegisto> = {}): CalibracaoRegisto {
  return {
    id: 1,
    nome: "Manometro PCE",
    referencia: "9177241",
    tipo: "manometro",
    dataCalibracao: diasDesde(-365),
    dataProxCalibracao: diasDesde(200),
    certificadoNum: "CL-97119PR-25",
    certificadoUrl: null,
    ativo: true,
    observacoes: null,
    updatedAt: diasDesde(-10),
    ...overrides,
  };
}

describe("separação calibração / compressor", () => {
  it("classifica os tipos de calibração", () => {
    expect(isCalibracaoTipo("barometro")).toBe(true);
    expect(isCalibracaoTipo("manometro")).toBe(true);
    expect(isCalibracaoTipo("balanca")).toBe(true);
    expect(isCalibracaoTipo("chave_dinamometrica")).toBe(true);
    expect(isCalibracaoTipo("calibracao")).toBe(true);
  });

  it("não classifica como calibração os tipos do compressor", () => {
    for (const tipo of ["compressor_oleo", "compressor_filtro", "compressor_ar", "compressor_valvula"]) {
      expect(isCalibracaoTipo(tipo)).toBe(false);
      expect(isCompressorTipo(tipo)).toBe(true);
    }
  });

  it("remove o prefixo compressor_ no rótulo apresentado", () => {
    expect(rotuloTipo("compressor_filtro")).toBe("filtro");
    expect(rotuloTipo("manometro")).toBe("manometro");
  });
});

describe("estado de calibração", () => {
  it("marca como válido acima de 30 dias", () => {
    const estado = getEstadoCalibracao(diasDesde(45));
    expect(estado.type).toBe("ok");
    expect(estado.label).toBe("Válido");
  });

  it("marca como a vencer dentro de 30 dias", () => {
    expect(getEstadoCalibracao(diasDesde(10)).type).toBe("soon");
    expect(getEstadoCalibracao(diasDesde(0)).type).toBe("soon");
    expect(getEstadoCalibracao(diasDesde(0)).label).toBe("Vence Hoje");
  });

  it("marca como vencido e conta os dias em falta", () => {
    const estado = getEstadoCalibracao(diasDesde(-3));
    expect(estado.type).toBe("expired");
    expect(estado.label).toBe("Vencido (3 dias)");
  });

  it("usa a forma abreviada acima de 30 dias em falta", () => {
    expect(getEstadoCalibracao(diasDesde(-60)).label).toBe("Vencido (60d)");
  });
});

describe("contagem por estado", () => {
  it("separa válidos, a vencer e vencidos sem sobrepor", () => {
    const items = [
      registo({ id: 1, dataProxCalibracao: diasDesde(90) }),
      registo({ id: 2, dataProxCalibracao: diasDesde(5) }),
      registo({ id: 3, dataProxCalibracao: diasDesde(-5) }),
    ];

    const { validos, aVencer, vencidos } = contarPorEstado(items);

    expect(validos).toHaveLength(1);
    expect(aVencer).toHaveLength(1);
    expect(vencidos).toHaveLength(1);
    expect(validos.length + aVencer.length + vencidos.length).toBe(items.length);
  });

  it("devolve listas vazias sem registos", () => {
    const { validos, aVencer, vencidos } = contarPorEstado([]);
    expect(validos).toHaveLength(0);
    expect(aVencer).toHaveLength(0);
    expect(vencidos).toHaveLength(0);
  });
});

describe("pesquisa e formulário", () => {
  it("pesquisa por nome, referência ou tipo, ignorando maiúsculas", () => {
    const items = [
      registo({ id: 1, nome: "Balanca Scale House", referencia: "Y707715", tipo: "balanca" }),
      registo({ id: 2, nome: "Manometro PCE", referencia: "9177241", tipo: "manometro" }),
    ];

    expect(filtrarRegistos(items, "balanca")).toHaveLength(1);
    expect(filtrarRegistos(items, "Y707715")).toHaveLength(1);
    expect(filtrarRegistos(items, "MANOMETRO")).toHaveLength(1);
    expect(filtrarRegistos(items, "   ")).toHaveLength(2);
    expect(filtrarRegistos(items, "inexistente")).toHaveLength(0);
  });

  it("converte um registo para o formulário em formato yyyy-mm-dd", () => {
    const alvo = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const form = formFromRegisto(registo({ dataProxCalibracao: diasDesde(40), certificadoUrl: "cert.pdf" }));

    expect(form.dataProxCalibracao).toBe(alvo);
    expect(form.certificadoUrl).toBe("cert.pdf");
    expect(form.ativo).toBe(true);
  });

  it("cria um formulário inicial com o tipo pedido", () => {
    expect(createInitialCalibracaoForm().tipo).toBe("barometro");
    expect(createInitialCalibracaoForm("compressor_oleo").tipo).toBe("compressor_oleo");
  });

  it("calcula dias restantes a partir da data", () => {
    expect(diasAte(diasDesde(3))).toBe(3);
  });
});
