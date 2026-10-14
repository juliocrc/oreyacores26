import { buildInspectionCertificateInput } from "@/lib/certificate-input-from-jangada";

const baseJangada = {
  serial: "54404",
  brand: "DSB",
  model: "LR97",
  capacity: 20,
  owner: "QUADROS & QUADROS LDA.",
  shipNameManual: "Rei dos Acores",
  ultimoCertificadoNumero: "AZ26-213",
  inspectionChecklistValues: {} as Record<string, unknown>,
  artigos: [],
};

describe("buildInspectionCertificateInput", () => {
  it("prefere os dados da inspeção sobre os da jangada", () => {
    const input = buildInspectionCertificateInput({
      jangada: { ...baseJangada, testeWP: "N/A" },
      lastInspecao: {
        certificadoNumero: "AZ26-213",
        dataInspecao: "2026-03-13",
        responsavel: "João Silva",
        status: "Concluída",
        testeWP: "PASSOU",
      },
      shipName: "Rei dos Acores",
      ownerName: "QUADROS & QUADROS LDA.",
      stamp: false,
    });

    expect(input.certNumber).toBe("AZ26-213");
    expect(input.inspectionDate).toBe("2026-03-13");
    expect(input.technician).toBe("João Silva");
    expect(input.technicianName).toBe("João Silva");
    expect(input.raftSerial).toBe("54404");
    expect(input.clientName).toBe("QUADROS & QUADROS LDA.");
    expect(input.stampImage).toBeUndefined();
    expect(input.checklist?.aprovacao_wp).toBe("PASSOU");
  });

  it("usa o último certificado da jangada quando não há inspeção", () => {
    const input = buildInspectionCertificateInput({
      jangada: baseJangada,
      lastInspecao: null,
      stamp: false,
    });

    expect(input.certNumber).toBe("AZ26-213");
    expect(input.status).toBe("Concluída");
  });

  it("calcula as quedas reais a partir do teste WP (sem correções)", () => {
    const input = buildInspectionCertificateInput({
      jangada: { ...baseJangada, testeWP: "N/A" },
      lastInspecao: {
        certificadoNumero: "AZ26-213",
        dataInspecao: "2026-03-13",
        testeWP: "PASSOU",
        testeWPUnidadePressao: "hpa",
        testeWPCamaraSuperiorInicio: 100,
        testeWPCamaraSuperiorFim: 100,
        testeWPCamaraInferiorInicio: 100,
        testeWPCamaraInferiorFim: 100,
      },
      stamp: false,
    });

    expect(input.checklist?.p1_corrigida_superior).toBe("100");
    expect(input.checklist?.p1_corrigida_inferior).toBe("100");
    expect(input.checklist?.queda_real_superior).toBe("0");
    expect(input.checklist?.queda_real_inferior).toBe("0");
    expect(input.checklist?.aprovacao_wp).toBe("PASSOU");
  });

  it("marca REPROVADO quando a queda real ultrapassa 5%", () => {
    const input = buildInspectionCertificateInput({
      jangada: { ...baseJangada, testeWP: "N/A" },
      lastInspecao: {
        certificadoNumero: "AZ26-214",
        dataInspecao: "2026-04-01",
        testeWP: "",
        testeWPUnidadePressao: "hpa",
        testeWPCamaraSuperiorInicio: 100,
        testeWPCamaraSuperiorFim: 90,
        testeWPCamaraInferiorInicio: 100,
        testeWPCamaraInferiorFim: 96,
      },
      stamp: false,
    });

    expect(input.checklist?.queda_real_superior).toBe("10");
    expect(input.checklist?.queda_real_inferior).toBe("4");
    expect(input.checklist?.aprovacao_wp).toBe("REPROVADO");
  });
});
