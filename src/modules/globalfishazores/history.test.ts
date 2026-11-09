import { parseHistory, vesselIdentifier } from "./history";

const from = "2026-10-22T12:00:00.000Z";
const to = "2026-10-24T12:00:00.000Z";
const feature = (coordinates: unknown[], times: unknown[]) => ({ geometry: { type: "LineString", coordinates }, properties: { times } });

describe("GlobalFish history", () => {
  it("keeps the exact 48h boundaries, sorts and deduplicates real observations", () => {
    const result = parseHistory(feature([[0, 0], [-25, 38], [0, 0]], [to, from, to]), from, to);
    expect(result.points).toEqual([{ lat: 38, lng: -25, time: from }, { lat: 0, lng: 0, time: to }]);
  });

  it("rejects old, future, missing, timezone-free timestamps and invalid coordinates", () => {
    const times = ["2026-10-22T11:59:59.999Z", "2026-10-24T12:00:00.001Z", null, "2026-10-24T10:00:00", to, to, to, to];
    const result = parseHistory(feature([[0, 0], [0, 0], [0, 0], [0, 0], [181, 0], [0, 91], [null, 0], [0, NaN]], times), from, to);
    expect(result).toEqual({ points: [], discarded: 8 });
  });

  it("normalizes explicit offsets without substituting query time", () => {
    expect(parseHistory(feature([[1, 2]], ["2026-10-24T13:00:00+01:00"]), from, to).points[0].time).toBe(to);
    expect(parseHistory(feature([[1, 2]], []), from, to).points).toEqual([]);
  });

  it("distinguishes empty valid history from an incompatible provider payload", () => {
    expect(parseHistory(feature([], []), from, to).points).toEqual([]);
    expect(() => parseHistory({ error: "denied" }, from, to)).toThrow();
    expect(() => parseHistory(null, from, to)).toThrow();
  });

  it("uses strict identifiers, not names, partial matches or invented MMSI", () => {
    expect(vesselIdentifier(" MMSI 204201560 ", "mmsi")).toBe("204201560");
    expect(vesselIdentifier("IMO 9207223", "imo")).toBe("9207223");
    for (const value of [null, "Mestre Afonso", "20420156", "2042015609", "204-201560", "000000000"]) {
      expect(vesselIdentifier(value, "mmsi")).toBeNull();
    }
  });
});
