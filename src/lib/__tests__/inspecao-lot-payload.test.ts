import { saveInspectionSchema } from "@/lib/validation/inspecao-payload";

describe("inspection replacement lot payload", () => {
  it("retains the selected stock row, lot and its expiry", () => {
    const replacement = {
      stockId: 24,
      referencia: "FLARE",
      lote: "B-2027",
      validade: "2030-11",
      quantidade: 2,
    };

    const parsed = saveInspectionSchema.parse({ artigosSubstituidos: [replacement] });

    expect(parsed.artigosSubstituidos).toEqual([replacement]);
  });

  it("does not require a lot for an article without expiry", () => {
    const replacement = { stockId: 25, referencia: "PADDLE", quantidade: 1 };

    expect(saveInspectionSchema.parse({ artigosSubstituidos: [replacement] }).artigosSubstituidos)
      .toEqual([replacement]);
  });
});
