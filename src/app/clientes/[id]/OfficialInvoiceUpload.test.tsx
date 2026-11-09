import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OfficialInvoiceUpload from "./OfficialInvoiceUpload";

it("offers an official PDF upload for an active invoice", () => {
  const html = renderToStaticMarkup(<OfficialInvoiceUpload invoice={{ id: 7, numeroFatura: "interno" }} onSaved={async () => {}} />);
  expect(html).toContain("Carregar fatura oficial");
});

it("shows the existing official PDF but prevents replacing a cancelled invoice", () => {
  const html = renderToStaticMarkup(<OfficialInvoiceUpload invoice={{ id: 7, numeroFatura: "interno", cancelada: true, pdfOficial: { filename: "fatura.pdf" } }} onSaved={async () => {}} />);
  expect(html).toContain('/api/faturas/7/oficial');
  expect(html).not.toContain("Substituir PDF oficial");
});
