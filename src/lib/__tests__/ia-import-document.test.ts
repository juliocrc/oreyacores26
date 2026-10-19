import * as XLSX from "xlsx";
import { analyzeImportFile } from "@/lib/ia-import-document";

describe("analyzeImportFile", () => {
  it("lê ficheiros .xls legacy (BIFF8) através do fallback XLSX", async () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["CERTIFICADO DE INSPEÇÃO"],
      ["Certificado Nº", "AZ-123/2026"],
      ["Marca", "RFD"],
      ["Modelo", "SURVIVA MKIV"],
      ["Nº Série", "123456"],
      ["Lotação", "12"],
      ["Data Inspeção", "2026-01-10"],
      ["Próxima Inspeção", "2027-01-10"],
      ["Armador", "Cliente Teste"],
      ["Navio", "Navio Teste"],
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "CERTIFICADO");

    const buffer = XLSX.write(workbook, { bookType: "biff8", type: "buffer" }) as Buffer;
    const result = await analyzeImportFile({ fileName: "legacy.xls", buffer });

    expect(result.preview.rows.length).toBeGreaterThan(0);
    expect(result.preview.sourceSheetName).toBe("CERTIFICADO");
    expect(result.preview.extractedHeader?.certificadoNumero).toBe("AZ-123/2026");
    expect(result.preview.extractedHeader?.brand).toBe("RFD");
    expect(result.preview.extractedHeader?.raftSerial).toBe("123456");
  });
});
