import { canonicalizeAzoresIsland, inferAzoresIslandFromPort } from "@/lib/azores-islands";

describe("azores-islands utilities", () => {
  test("canonicalizeAzoresIsland recognizes common aliases", () => {
    expect(canonicalizeAzoresIsland("sao miguel")).toBe("São Miguel");
    expect(canonicalizeAzoresIsland("Faial")).toBe("Faial");
    expect(canonicalizeAzoresIsland("unknown place")).toBeNull();
  });

  test("inferAzoresIslandFromPort maps known ports", () => {
    expect(inferAzoresIslandFromPort("Horta")).toBe("Faial");
    expect(inferAzoresIslandFromPort("Ponta Delgada")).toBe("São Miguel");
    expect(inferAzoresIslandFromPort("Lisbon" as any)).toBeNull();
  });
});
