import { useContext, useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import SessionSingleWatcher, { SessionAccessBoundary } from "./session-single-watcher";
import SessionIdleTimeout from "./session-idle-timeout";

jest.mock("react", () => ({ ...jest.requireActual("react"), useContext: jest.fn(), useEffect: jest.fn(), useRef: jest.fn(), useState: jest.fn() }));
jest.mock("next-auth/react", () => ({ useSession: jest.fn(), signOut: jest.fn() }));
jest.mock("next/navigation", () => ({ usePathname: () => "/agenda", useRouter: () => ({ replace }) }));

let effects: Array<() => void | (() => void)>;
let cleanups: Array<() => void>;
let refs: Array<{ current: unknown }>;
let refIndex: number;
let status: string;
let confirmedAbsent: boolean;
let confirmationState: boolean;
const replace = jest.fn();
const update = jest.fn();
const fetchMock = jest.fn();
const interval = jest.fn();
const cookieDocument = { cookie: "orey_app_open=1" };

function render(component: () => unknown = () => {
  const provider = SessionSingleWatcher({});
  confirmedAbsent = provider.props.value;
}) {
  cleanups.forEach((cleanup) => cleanup());
  cleanups = [];
  effects = [];
  refIndex = 0;
  component();
  for (const effect of effects) {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  }
}

function renderBoundary(isPublic = false) {
  effects = [];
  const view = SessionAccessBoundary({ children: "protected-content", isPublic });
  effects.forEach((effect) => effect());
  return view;
}

async function settle() {
  // Flush the fetch, JSON parsing, and session-update continuations.
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => {
  jest.resetAllMocks();
  effects = [];
  cleanups = [];
  refs = [];
  status = "authenticated";
  confirmedAbsent = false;
  confirmationState = false;
  cookieDocument.cookie = "orey_app_open=1";
  jest.mocked(useEffect).mockImplementation((effect) => { effects.push(effect); });
  jest.mocked(useRef).mockImplementation((value) => {
    const index = refIndex++;
    return (refs[index] ??= { current: value }) as ReturnType<typeof useRef>;
  });
  jest.mocked(useState).mockImplementation(() => [confirmationState, (value: boolean) => {
    confirmationState = value;
  }] as ReturnType<typeof useState>);
  jest.mocked(useContext).mockImplementation(() => confirmedAbsent);
  jest.mocked(useSession).mockImplementation(() => ({ status, update, data: null }) as ReturnType<typeof useSession>);
  jest.spyOn(globalThis, "fetch").mockImplementation(fetchMock);
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    setInterval: interval.mockReturnValue(1), clearInterval: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(),
    localStorage: { setItem: jest.fn(), getItem: jest.fn(() => String(Date.now())) },
  } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: cookieDocument });
});

afterEach(() => {
  cleanups.forEach((cleanup) => cleanup());
  jest.restoreAllMocks();
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
});

function loseSession() {
  render();
  status = "unauthenticated";
  render();
}

it.each(["network", "server", "invalid-json", "unexpected-body"])(
  "does not sign out after a %s session-check failure", async (failure) => {
    if (failure === "network") fetchMock.mockRejectedValue(new Error("offline"));
    if (failure === "server") fetchMock.mockResolvedValue({ ok: false, status: 503 });
    if (failure === "invalid-json") fetchMock.mockResolvedValue({ ok: true, json: async () => { throw new Error("HTML"); } });
    if (failure === "unexpected-body") fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    loseSession();
    await settle();
    expect(signOut).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(cookieDocument.cookie).toBe("orey_app_open=1");
  },
);

it("recovers on the next check after a transient outage", async () => {
  fetchMock.mockRejectedValueOnce(new Error("offline"));
  render();
  expect(renderBoundary()).toBe("protected-content");
  loseSession();
  await settle();
  expect(renderBoundary()).not.toBe("protected-content");
  expect(replace).not.toHaveBeenCalled();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ user: { id: "7" } }) });
  interval.mock.calls[0][0]();
  await settle();
  expect(update).toHaveBeenCalledTimes(1);
  expect(signOut).not.toHaveBeenCalled();
  status = "authenticated";
  render();
  expect(renderBoundary()).toBe("protected-content");
  expect(replace).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", {
    credentials: "same-origin", cache: "no-store",
  });
});

it("redirects and hides protected content when the server confirms session loss", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => null });
  loseSession();
  await settle();
  render();
  expect(renderBoundary()).not.toBe("protected-content");
  expect(replace).toHaveBeenCalledWith("/login?callbackUrl=%2Fagenda");
  expect(signOut).not.toHaveBeenCalled();
});

it("ignores confirmation that arrives after unmount", async () => {
  let resolve!: (value: unknown) => void;
  fetchMock.mockReturnValue(new Promise((done) => { resolve = done; }));
  loseSession();
  cleanups.forEach((cleanup) => cleanup());
  resolve({ ok: true, json: async () => null });
  await settle();
  expect(confirmationState).toBe(false);
  expect(signOut).not.toHaveBeenCalled();
});

it("does not reuse an old absence confirmation after a new login", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => null });
  loseSession();
  await settle();
  render();
  renderBoundary();
  expect(replace).toHaveBeenCalledTimes(1);
  status = "authenticated";
  render();
  fetchMock.mockRejectedValue(new Error("offline"));
  status = "unauthenticated";
  render();
  await settle();
  expect(renderBoundary()).not.toBe("protected-content");
  expect(replace).toHaveBeenCalledTimes(1);
});

it("confirms absence even for an initially anonymous visitor before redirecting", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => null });
  status = "unauthenticated";
  render();
  expect(renderBoundary()).not.toBe("protected-content");
  expect(replace).not.toHaveBeenCalled();
  await settle();
  render();
  renderBoundary();
  expect(replace).toHaveBeenCalledWith("/login?callbackUrl=%2Fagenda");
  expect(signOut).not.toHaveBeenCalled();
});

it("never exposes protected content during an extended outage", async () => {
  fetchMock.mockRejectedValue(new Error("offline"));
  loseSession();
  for (let i = 0; i < 5; i++) {
    await settle();
    interval.mock.calls[0][0]();
    expect(renderBoundary()).not.toBe("protected-content");
  }
  await settle();
  expect(replace).not.toHaveBeenCalled();
});

it("keeps public pages accessible without a login redirect", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => null });
  loseSession();
  await settle();
  render();
  expect(renderBoundary(true)).toBe("protected-content");
  expect(replace).not.toHaveBeenCalled();
});

it("preserves the app-open marker through a failed poll and recovery", () => {
  render(SessionIdleTimeout);
  status = "unauthenticated";
  render(SessionIdleTimeout);
  expect(cookieDocument.cookie).toBe("orey_app_open=1");
  status = "authenticated";
  render(SessionIdleTimeout);
  expect(signOut).not.toHaveBeenCalled();
});

it("still enforces the 60-minute idle limit", () => {
  jest.spyOn(Date, "now").mockReturnValue(1_000);
  render(SessionIdleTimeout);
  window.localStorage.getItem = jest.fn(() => "1000");
  jest.mocked(Date.now).mockReturnValue(1_000 + 60 * 60 * 1000);
  interval.mock.calls[0][0]();
  expect(signOut).toHaveBeenCalledTimes(1);
  expect(cookieDocument.cookie).toContain("Max-Age=0");
});

it("still requires login when the browser-open marker is missing", () => {
  cookieDocument.cookie = "";
  render(SessionIdleTimeout);
  expect(signOut).toHaveBeenCalledTimes(1);
});
