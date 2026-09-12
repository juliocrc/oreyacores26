declare module "qrcode" {
  interface QRCodeToDataURLOptions {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    scale?: number;
    type?: string;
    quality?: number;
  }

  interface QRCode {
    toDataURL(
      text: string | readonly unknown[],
      options?: QRCodeToDataURLOptions
    ): Promise<string>;
  }

  const QRCode: QRCode;
  export default QRCode;
}