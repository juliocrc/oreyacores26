import React from "react";
import QrReaderModal from "./QrReaderModal";
import { Html5Qrcode } from "html5-qrcode";
import { useRouter } from "next/navigation";

jest.mock("next/navigation", () => ({ useRouter: jest.fn() }));
jest.mock("html5-qrcode", () => ({ Html5Qrcode: jest.fn() }));

let decoded: (value: string) => void;
let cleanups: (() => void)[];
const push = jest.fn();
const stop = jest.fn();
const clear = jest.fn();
const scanner = { isScanning: false, start: jest.fn(), stop, clear };

function mount(onScan?: (value: string) => void) {
  const effects: React.EffectCallback[] = [];
  jest.spyOn(React, "useEffect").mockImplementation(effect => { effects.push(effect); });
  jest.spyOn(React, "useRef").mockImplementation((value: unknown) => ({ current: value }) as any);
  jest.spyOn(React, "useState").mockImplementation((value?: unknown) => [value, jest.fn()] as any);
  const onClose = jest.fn();
  const node = QrReaderModal({ open: true, onClose, onScan });
  cleanups = effects.map(effect => effect()).filter((cleanup): cleanup is () => void => typeof cleanup === "function");
  return { node, onClose };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  cleanups = [];
  scanner.isScanning = false;
  jest.mocked(useRouter).mockReturnValue({ push } as never);
  jest.mocked(Html5Qrcode).mockImplementation(() => scanner as never);
  scanner.start.mockImplementation(async (_camera, _config, onDecoded) => {
    decoded = onDecoded;
    scanner.isScanning = true;
  });
  stop.mockImplementation(async () => { scanner.isScanning = false; });
});
afterEach(() => {
  cleanups.forEach(cleanup => cleanup());
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("camera sends a code once, stops camera and never navigates in callback mode", async () => {
  const onScan = jest.fn();
  const { onClose } = mount(onScan);
  await jest.advanceTimersByTimeAsync(300);
  decoded(" LOT-A ");
  decoded("LOT-A");
  expect(onScan).toHaveBeenCalledTimes(1);
  expect(onScan).toHaveBeenCalledWith("LOT-A");
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(push).not.toHaveBeenCalled();
  expect(stop).toHaveBeenCalledTimes(1);
});
test("existing serial navigation is preserved when no callback is supplied", async () => {
  mount();
  await jest.advanceTimersByTimeAsync(300);
  decoded("SR-123");
  expect(push).toHaveBeenCalledWith("/jangadas/serial/SR-123");
});
test("URL payload is passed literally, not navigated, in stock callback mode", async () => {
  const onScan = jest.fn();
  mount(onScan);
  await jest.advanceTimersByTimeAsync(300);
  decoded("https://example.com/stock/41");
  expect(onScan).toHaveBeenCalledWith("https://example.com/stock/41");
  expect(push).not.toHaveBeenCalled();
});
test("unmount cancels delayed camera startup", async () => {
  mount(jest.fn());
  cleanups.forEach(cleanup => cleanup());
  await jest.advanceTimersByTimeAsync(300);
  expect(scanner.start).not.toHaveBeenCalled();
});
test("permission resolving after unmount stops the late camera and ignores decoded frames", async () => {
  let resolveStart!: () => void;
  scanner.start.mockImplementation((_camera, _config, onDecoded) => {
    decoded = onDecoded;
    return new Promise<void>(resolve => { resolveStart = () => { scanner.isScanning = true; resolve(); }; });
  });
  const onScan = jest.fn();
  mount(onScan);
  await jest.advanceTimersByTimeAsync(300);
  cleanups.forEach(cleanup => cleanup());
  resolveStart();
  await jest.advanceTimersByTimeAsync(0);
  decoded("LOT-A");
  expect(stop).toHaveBeenCalledTimes(1);
  expect(onScan).not.toHaveBeenCalled();
});
