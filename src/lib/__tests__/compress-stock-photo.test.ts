import { compressStockPhoto } from "@/lib/compress-stock-photo";

const original = new Blob(["x".repeat(100)], { type: "image/png" });
const smaller = new Blob(["small"], { type: "image/webp" });
const descriptors = new Map(["document", "createImageBitmap", "Image"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let canvas: { width: number; height: number; getContext: jest.Mock; toBlob: jest.Mock };
let drawImage: jest.Mock;
let close: jest.Mock;
let decode: jest.Mock;

beforeEach(() => {
  drawImage = jest.fn(); close = jest.fn();
  decode = jest.fn().mockResolvedValue({ width: 4000, height: 2000, close });
  canvas = { width: 0, height: 0, getContext: jest.fn(() => ({ drawImage })), toBlob: jest.fn(callback => callback(smaller)) };
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: jest.fn(() => canvas) } });
  Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: decode });
  jest.spyOn(URL, "createObjectURL").mockReturnValue("blob:decode");
  jest.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test.each(["image/png", "image/jpeg", "image/webp"])("compresses %s to WebP without a raw base64 intermediate", async type => {
  const file = new Blob(["x".repeat(100)], { type });
  expect(await compressStockPhoto(file)).toBe(smaller);
  expect(decode).toHaveBeenCalledWith(file);
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 800);
  expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.82);
  expect(close).toHaveBeenCalledTimes(1);
  expect(canvas.width).toBe(0);
});

test("does not upscale small photos or flatten transparency", async () => {
  decode.mockResolvedValue({ width: 320, height: 240, close });
  await compressStockPhoto(original);
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 320, 240);
  expect(canvas.getContext).toHaveBeenCalledWith("2d");
  // The context deliberately has no fillRect: alpha must not be painted over.
});

test.each([null, new Blob(["x".repeat(200)], { type: "image/webp" }), new Blob(["small"], { type: "image/png" }), new Blob([], { type: "image/webp" })])("keeps original when encoder returns an unusable/larger result", async encoded => {
  canvas.toBlob.mockImplementation(callback => callback(encoded));
  expect(await compressStockPhoto(original)).toBe(original);
  expect(close).toHaveBeenCalledTimes(1);
});

test.each(["image/gif", "image/svg+xml"])("preserves %s unchanged without decoding", async type => {
  const file = new Blob(["animation/vector"], { type });
  expect(await compressStockPhoto(file)).toBe(file);
  expect(decode).not.toHaveBeenCalled();
});

test("falls back to HTMLImage decoding and revokes its temporary URL", async () => {
  decode.mockRejectedValue(new Error("bitmap unavailable"));
  Object.defineProperty(globalThis, "Image", { configurable: true, value: class {
    naturalWidth = 2000; naturalHeight = 4000; onload = () => {};
    set src(_url: string) { this.onload(); }
  } });
  expect(await compressStockPhoto(original)).toBe(smaller);
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 1600);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:decode");
});

test("preserves original and cleans up on decode failure", async () => {
  decode.mockRejectedValue(new Error("bad bitmap"));
  Object.defineProperty(globalThis, "Image", { configurable: true, value: class {
    onerror = () => {};
    set src(_url: string) { this.onerror(); }
  } });
  expect(await compressStockPhoto(original)).toBe(original);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:decode");
});

test("preserves original on canvas errors or a missing encoder/context", async () => {
  canvas.toBlob.mockImplementation(() => { throw new Error("no encoder"); });
  expect(await compressStockPhoto(original)).toBe(original);
  canvas.getContext.mockReturnValue(null);
  expect(await compressStockPhoto(original)).toBe(original);
  expect(close).toHaveBeenCalledTimes(2);
});
