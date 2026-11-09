import { openwaBusinessHours } from "../business-hours";

describe("fixed Atlantic/Azores business hours", () => {
  it.each([
    ["2026-07-06T08:59:59Z", false], ["2026-07-06T09:00:00Z", true],
    ["2026-07-06T12:29:59Z", true], ["2026-07-06T12:30:00Z", false],
    ["2026-07-06T13:59:59Z", false], ["2026-07-06T14:00:00Z", true],
    ["2026-07-06T17:29:59Z", true], ["2026-07-06T17:30:00Z", false],
    ["2026-01-05T09:59:59Z", false], ["2026-01-05T10:00:00Z", true],
    ["2026-01-05T13:29:59Z", true], ["2026-01-05T13:30:00Z", false],
    ["2026-01-05T14:59:59Z", false], ["2026-01-05T15:00:00Z", true],
    ["2026-01-05T18:29:59Z", true], ["2026-01-05T18:30:00Z", false],
    ["2026-07-10T17:29:59Z", true], ["2026-07-11T10:00:00Z", false],
    ["2026-07-12T10:00:00Z", false], ["2026-01-04T10:00:00Z", false],
    ["2026-03-27T10:00:00Z", true], ["2026-03-30T09:00:00Z", true],
    ["2026-10-23T09:00:00Z", true], ["2026-10-26T10:00:00Z", true],
  ])("%s is open=%s including DST and exclusive end boundaries", (date, open) => {
    expect(openwaBusinessHours(new Date(date))).toMatchObject({ open, timeZone: "Atlantic/Azores" });
  });
});
