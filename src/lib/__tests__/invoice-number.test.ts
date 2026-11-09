import { invoiceNumberFromWork, invoiceWorkReferences } from "../invoice-number";

test.each([
  ["FO102600098", "FT1026000098"], ["FO022600020", "FT0226000020"],
  ["FO129999999", "FT1299099999"], ["FO010000001", "FT0100000001"],
  [" fo022600020 ", "FT0226000020"],
  ["FO1026000098", "FT1026000098"], ["FO0226000020", "FT0226000020"],
  ["FO0226123456", "FT0226123456"], [" fo1026000098 ", "FT1026000098"],
  ["FO002600020", null], ["FO132600020", null], ["FO22600020", null],
  ["FO0226000200", "FT0226000200"], ["FO02260000200", null], ["FO02260020", null],
  ["FO0226abcde", null], ["OS-2026-0001", null], ["", null],
])("derives %s as %s", (work, expected) => {
  expect(invoiceNumberFromWork(work)).toBe(expected);
});

test("snapshot references are unique, sorted and do not choose an arbitrary primary", () => {
  expect(invoiceWorkReferences(JSON.stringify({ numerosObra: ["FO102600098", " fo022600020 ", "FO102600098"] })))
    .toEqual({ numeroObra: null, numerosObra: ["FO022600020", "FO102600098"] });
});

test("legacy references use only the issued snapshot", () => {
  expect(invoiceWorkReferences('{"numeroOrdens":["OT-1"]}')).toEqual({ numeroObra: "OT-1", numerosObra: ["OT-1"] });
  expect(invoiceWorkReferences("invalid")).toEqual({ numeroObra: null, numerosObra: [] });
  expect(invoiceWorkReferences(null)).toEqual({ numeroObra: null, numerosObra: [] });
});
