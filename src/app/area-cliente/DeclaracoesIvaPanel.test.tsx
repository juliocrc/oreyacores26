import React, { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DeclaracoesIvaPanel from "./DeclaracoesIvaPanel";

jest.mock("react", () => ({ ...jest.requireActual("react"),
  useEffect: jest.fn(), useState: jest.fn(), useRef: (value: unknown) => ({ current: value }),
}));

beforeEach(() => {
  (useState as jest.Mock).mockImplementation(initial => [initial, jest.fn()]);
});

it("links persisted history by declaration ID", () => {
  (useState as jest.Mock).mockImplementation(initial => [Array.isArray(initial) ? [
    { id: 42, numeroCompleto: "0001/2026", dataEmissao: "2026-01-02T12:00:00Z" },
  ] : initial, jest.fn()]);
  const html = renderToStaticMarkup(<DeclaracoesIvaPanel navioId={10} />);
  expect(html).toContain('href="/api/portal/declaracao-isencao-pdf?declaracaoId=42"');
  expect(html).toContain("0001/2026");
  expect(html).toContain('type="file"');
  expect(html).toContain('accept=".pdf,application/pdf"');
  expect(html).toContain("assinado externamente");
});

it("shows the signed attachment separately while preserving both original download links", () => {
  (useState as jest.Mock).mockImplementation(initial => [Array.isArray(initial) ? [
    { id: 42, numeroCompleto: "0001/2026", dataEmissao: "2026-01-02T12:00:00Z", pdfAssinado: { filename: "signed.pdf" } },
  ] : initial, jest.fn()]);
  const html = renderToStaticMarkup(<DeclaracoesIvaPanel navioId={10} />);
  expect(html).toContain('href="/api/portal/declaracao-isencao-assinada?declaracaoId=42"');
  expect(html).toContain('href="/api/portal/declaracao-isencao-pdf?declaracaoId=42"');
  expect(html).toContain('href="/api/portal/declaracao-isencao-pdf?declaracaoId=42&amp;format=docx"');
  expect(html).toContain("Substituir PDF assinado");
});

it("uploads the externally signed file for its declaration with the current CAS token", async () => {
  const entry = { id: 42, numeroCompleto: "0001/2026", dataEmissao: "2026-01-02T12:00:00Z", pdfAssinado: { sha256: "previous" } };
  const setEntries = jest.fn();
  (useState as jest.Mock).mockImplementation(initial => [Array.isArray(initial) ? [entry] : initial, Array.isArray(initial) ? setEntries : jest.fn()]);
  const pdfAssinado = { filename: "signed.pdf", sha256: "new" };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 42, pdfAssinado }) });
  const element = DeclaracoesIvaPanel({ navioId: 10 });
  const list = element.props.children.find((child: React.ReactElement) => child?.type === "ul");
  const label = list.props.children[0].props.children.find((child: React.ReactElement) => child?.type === "label");
  const input = label.props.children.find((child: React.ReactElement) => child?.type === "input");
  const file = new File(["%PDF-test"], "signed.pdf", { type: "application/pdf" });
  input.props.onChange({ currentTarget: { files: [file], value: "signed.pdf" } });
  await new Promise(resolve => setImmediate(resolve));
  expect(fetch).toHaveBeenCalledWith("/api/portal/declaracao-isencao-assinada?declaracaoId=42", expect.objectContaining({ method: "POST" }));
  const form = (fetch as jest.Mock).mock.calls[0][1].body as FormData;
  expect(form.get("expectedSha256")).toBe("previous");
  expect((form.get("pdf") as File).name).toBe("signed.pdf");
  expect(setEntries.mock.calls[0][0]([entry])).toEqual([{ ...entry, pdfAssinado }]);
});

it("retains the POST idempotency token after a failed download", async () => {
  const fetchMock = jest.fn().mockRejectedValue(new Error("Network failed"));
  global.fetch = fetchMock;
  const element = DeclaracoesIvaPanel({ navioId: 10 });
  const button = element.props.children.find((child: React.ReactElement) => child?.type === "button");
  button.props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  button.props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const first = JSON.parse(fetchMock.mock.calls[0][1].body);
  const retry = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(first.idempotencyKey).toBeTruthy();
  expect(retry).toEqual(first);
  expect(fetchMock.mock.calls[0][1].method).toBe("POST");
});
