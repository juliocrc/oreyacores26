import { toDateKey } from "@/lib/date-utils";

describe("toDateKey", () => {
  it("retorna vazio para valores nulos ou inválidos", () => {
    expect(toDateKey(null)).toBe("");
    expect(toDateKey(undefined)).toBe("");
    expect(toDateKey("")).toBe("");
    expect(toDateKey("   ")).toBe("");
  });

  it("mantém datas ISO (YYYY-MM-DD / YYYY-MM)", () => {
    expect(toDateKey("2024-03-15")).toBe("2024-03-15");
    expect(toDateKey("2024-03")).toBe("2024-03-01");
  });

  it("interpreta mês/ano MM/YYYY (bug dos certificados/quadro)", () => {
    expect(toDateKey("01/2024")).toBe("2024-01-01");
    expect(toDateKey("12/2023")).toBe("2023-12-01");
    expect(toDateKey("1/2024")).toBe("2024-01-01");
    expect(toDateKey("06/2019")).toBe("2019-06-01");
  });

  it("interpreta mês/ano com separadores alternativos", () => {
    expect(toDateKey("03-2022")).toBe("2022-03-01");
    expect(toDateKey("03.2022")).toBe("2022-03-01");
  });

  it("interpreta ano de dois dígitos (MM/YY)", () => {
    expect(toDateKey("07/25")).toBe("2025-07-01");
    expect(toDateKey("07/99")).toBe("2099-07-01");
  });

  it("rejeita meses fora do intervalo 1-12", () => {
    expect(toDateKey("13/2024")).not.toBe("2024-13-01");
  });
});