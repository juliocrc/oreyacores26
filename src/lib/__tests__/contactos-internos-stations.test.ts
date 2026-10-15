import { resolveContactoStationCode } from "@/lib/contactos-internos-stations";

describe("resolveContactoStationCode", () => {
  it("mapeia as localizações do PDF para o código da estação", () => {
    expect(resolveContactoStationCode("ES Açores")).toBe("ACORES");
    expect(resolveContactoStationCode("ES Alcantarilha")).toBe("ALCATARILHA");
    expect(resolveContactoStationCode("ES Aveleda")).toBe("AVELEDA");
    expect(resolveContactoStationCode("ES Vialonga")).toBe("LISBOA");
  });

  it("trata 'Vialonga', 'Vialonga/Lisboa' e 'Lisboa' como Lisboa", () => {
    expect(resolveContactoStationCode("Vialonga")).toBe("LISBOA");
    expect(resolveContactoStationCode("Vialonga/Lisboa")).toBe("LISBOA");
    expect(resolveContactoStationCode("Lisboa")).toBe("LISBOA");
  });

  it("mapeia Setúbal", () => {
    expect(resolveContactoStationCode("Setúbal")).toBe("SETUBAL");
  });

  it("normaliza maiúsculas, acentos e espaços/tabs", () => {
    expect(resolveContactoStationCode("  ES   AVELEDA ")).toBe("AVELEDA");
    expect(resolveContactoStationCode("ES\tAçores")).toBe("ACORES");
    expect(resolveContactoStationCode("Lisboa")).toBe("LISBOA");
  });

  it("devolve null para localizações sem estação ou vazias", () => {
    expect(resolveContactoStationCode(null)).toBeNull();
    expect(resolveContactoStationCode(undefined)).toBeNull();
    expect(resolveContactoStationCode("")).toBeNull();
    expect(resolveContactoStationCode("   ")).toBeNull();
    expect(resolveContactoStationCode("outra localização")).toBeNull();
  });
});
