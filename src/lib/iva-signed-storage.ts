import "server-only";
import { readSecurePdf, storeSecurePdf } from "./secure-pdf-storage";
import type { OfficialPdfMetadata } from "./invoice-official";

export const storeSignedIvaPdf = (id: number, file: File, actor: string) => storeSecurePdf("iva-signed", id, file, actor);
export const readSignedIvaPdf = (id: number, pdf: OfficialPdfMetadata) => readSecurePdf("iva-signed", id, pdf);
