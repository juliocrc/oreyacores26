import { countWorkingDays } from "../working-days";

describe("countWorkingDays", () => {
  it("conta apenas dias úteis entre as datas, inclusive", () => {
    expect(countWorkingDays("2026-08-17", "2026-08-28")).toBe(10);
    expect(countWorkingDays("2026-09-07", "2026-09-18")).toBe(10);
    expect(countWorkingDays("2026-06-22", "2026-06-26")).toBe(5);
  });

  it("devolve zero para fins de semana e intervalos inválidos", () => {
    expect(countWorkingDays("2026-08-22", "2026-08-23")).toBe(0);
    expect(countWorkingDays("2026-08-28", "2026-08-17")).toBe(0);
    expect(countWorkingDays("", "")).toBe(0);
  });

  it("aceita datas ISO com hora", () => {
    expect(countWorkingDays("2026-05-21T00:00:00.000Z", "2026-05-22T00:00:00.000Z")).toBe(2);
  });
});
