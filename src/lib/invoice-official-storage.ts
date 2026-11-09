import "server-only";
import { readSecurePdf, storeSecurePdf } from "./secure-pdf-storage";
import type { OfficialPdfMetadata } from "./invoice-official";

export { OfficialInvoiceError } from "./secure-pdf-storage";

// Persisted invoice keys, encryption AAD and local paths must remain unchanged.
export const storeOfficialPdf = (id: number, file: File, actor: string) => storeSecurePdf("invoice-official", id, file, actor);
export const readOfficialPdf = (id: number, pdf: OfficialPdfMetadata) => readSecurePdf("invoice-official", id, pdf);
