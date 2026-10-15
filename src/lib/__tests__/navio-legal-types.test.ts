import {
  isRecreioMatricula,
  normalizeNavioTipoCategoria,
  parseRecreioZonaFromMatricula,
} from "@/lib/navio-legal-types";

describe("navio-legal-types · matrícula de recreio", () => {
  test("isRecreioMatricula reconhece o padrão <nº>-<dígito>PT", () => {
    expect(isRecreioMatricula("130593-5PT")).toBe(true);
    expect(isRecreioMatricula("108367-4PT")).toBe(true);
    expect(isRecreioMatricula("111580-2PT")).toBe(true);
    expect(isRecreioMatricula("128531-1PT")).toBe(true);
    expect(isRecreioMatricula("PTHOR-1234567")).toBe(false);
    expect(isRecreioMatricula("PT-107181-TL")).toBe(false);
    expect(isRecreioMatricula("130593-6PT")).toBe(false);
    expect(isRecreioMatricula(null)).toBe(false);
  });

  test("parseRecreioZonaFromMatricula mapeia o tipo 1..5 para zona0..zona4", () => {
    expect(parseRecreioZonaFromMatricula("130593-5PT")).toBe("zona4");
    expect(parseRecreioZonaFromMatricula("108367-4PT")).toBe("zona3");
    expect(parseRecreioZonaFromMatricula("130593-3PT")).toBe("zona2");
    expect(parseRecreioZonaFromMatricula("111580-2PT")).toBe("zona1");
    expect(parseRecreioZonaFromMatricula("128531-1PT")).toBe("zona0");
    expect(parseRecreioZonaFromMatricula("PTHOR-1234567")).toBeNull();
    expect(parseRecreioZonaFromMatricula(undefined)).toBeNull();
  });

  test("normalizeNavioTipoCategoria classifica matrículas recreio como Náutica de Recreio", () => {
    expect(normalizeNavioTipoCategoria("N/D", "108367-4PT", "turistico")).toBe("Náutica de Recreio");
    expect(normalizeNavioTipoCategoria(null, "110889-3PT", null)).toBe("Náutica de Recreio");
    expect(normalizeNavioTipoCategoria(null, "130593-5PT", "")).toBe("Náutica de Recreio");
  });

  test("texto de marítimo-turística mantém precedência sobre a matrícula recreio", () => {
    expect(normalizeNavioTipoCategoria("", "121993-4PT", "Marítimo-Turística")).toBe("Marítimo Turística");
  });

  test("matrículas não-recreio mantêm a classificação anterior", () => {
    expect(normalizeNavioTipoCategoria(null, "PT-107181-TL", null)).toBe("Tráfego Local");
    expect(normalizeNavioTipoCategoria("Pesca Local", "PTAVE-143898-L", "Pesca")).toBe("Pesca Local");
    expect(normalizeNavioTipoCategoria(null, "PTHOR-1234567", null)).toBe("Outro");
  });
});
