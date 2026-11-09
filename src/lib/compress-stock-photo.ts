/** Compress before base64 conversion so large originals never become JS strings. */
export async function compressStockPhoto(file: Blob): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;

  let image: ImageBitmap | HTMLImageElement | undefined;
  let objectUrl: string | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    if (typeof createImageBitmap === "function") {
      try { image = await createImageBitmap(file); } catch { /* Try the browser image decoder. */ }
    }
    if (!image) {
      objectUrl = URL.createObjectURL(file);
      const element = new Image();
      await new Promise<void>((resolve, reject) => {
        element.onload = () => resolve();
        element.onerror = () => reject(new Error("Image decode failed"));
        element.src = objectUrl!;
      });
      image = element;
    }
    const width = "naturalWidth" in image ? image.naturalWidth : image.width;
    const height = "naturalHeight" in image ? image.naturalHeight : image.height;
    if (!width || !height) return file;
    const scale = Math.min(1, 1600 / Math.max(width, height));
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    // A transparent canvas + WebP preserves alpha for pasted PNGs.
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const compressed = await new Promise<Blob | null>(resolve => canvas!.toBlob(resolve, "image/webp", 0.82));
    return compressed?.type === "image/webp" && compressed.size > 0 && compressed.size < file.size ? compressed : file;
  } catch {
    return file;
  } finally {
    if (image && "close" in image) image.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (canvas) canvas.width = canvas.height = 0;
  }
}
