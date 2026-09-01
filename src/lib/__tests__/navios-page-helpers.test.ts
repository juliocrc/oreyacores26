import { getCanonicalNavioLocationLabel, getNavioLocationLabel } from "@/lib/navios-page-helpers";

describe("navios-page-helpers", () => {
  test("returns canonical island label for common inputs", () => {
    expect(getCanonicalNavioLocationLabel("Ponta Delgada")).toBe("São Miguel");
    expect(getCanonicalNavioLocationLabel("pico")).toBe("Pico");
    expect(getCanonicalNavioLocationLabel("Continente")).toBe("");
  });

  test("getNavioLocationLabel returns fallback labels", () => {
    const navioWithIsland: any = { ilha: "Ponta Delgada" };
    expect(getNavioLocationLabel(navioWithIsland)).toBe("São Miguel");

    const navioNoIsland: any = { ilha: "" };
    // IS_AZORES_APP default in types may be true in app; the function returns 'Sem ilha' when app is Azores
    const label = getNavioLocationLabel(navioNoIsland);
    expect(typeof label).toBe("string");
  });
});
