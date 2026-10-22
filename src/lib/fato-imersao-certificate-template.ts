import {
  generateNavioCertificateDocx,
  type ColeteCertificateRow,
  type NavioColetesCertificateInput,
  type ShipCertificateLayout,
} from "@/lib/colete-certificate-template";

export type FatoImersaoCertificateRow = ColeteCertificateRow;
export type NavioFatosImersaoCertificateInput = NavioColetesCertificateInput;

const FATOS_IMERSAO_LAYOUT: ShipCertificateLayout = {
  templateFile: "template certificado fatos de imersao.docx",
  rowsPerPage: 15,
  rowCells: { serial: 1, marca: 2, modelo: 3, dataFabrico: 4, status: 5 },
  footerValueCells: { serviceStation: 0, placeAndDate: 2, nextInspection: 4 },
};

export async function generateNavioFatosImersaoCertificateDocx(input: NavioFatosImersaoCertificateInput) {
  return generateNavioCertificateDocx(input, FATOS_IMERSAO_LAYOUT);
}
