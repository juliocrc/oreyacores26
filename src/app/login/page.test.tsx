import * as React from "react";
import LoginPage from "./page";
import { signIn, useSession } from "next-auth/react";
import { markAppSessionOpen } from "@/app/session-idle-timeout";

jest.mock("react", () => ({ ...jest.requireActual("react"), useState: jest.fn(), useRef: jest.fn(), useEffect: jest.fn() }));
jest.mock("next-auth/react", () => ({ signIn: jest.fn(), useSession: jest.fn() }));
jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("callbackUrl=%2Fstock") }));
jest.mock("@/app/session-idle-timeout", () => ({ markAppSessionOpen: jest.fn() }));

const replace = jest.fn();
let states: unknown[];
let refs: Array<{ current: unknown }>;
let stateIndex: number;
let refIndex: number;
let effects: Array<() => void>;
let status: string;

function render() {
  stateIndex = 0;
  refIndex = 0;
  effects = [];
  const page = LoginPage();
  const tree = page.props.children.type();
  effects.forEach((effect) => effect());
  const elements = (node: React.ReactNode): React.ReactElement<any>[] => React.Children.toArray(node).flatMap((child) => React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);
  return elements(tree);
}

beforeEach(() => {
  jest.resetAllMocks();
  states = [false, "staff@example.com", "secret", null, "password"];
  refs = [];
  status = "unauthenticated";
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { replace } } });
  jest.mocked(React.useState).mockImplementation((() => {
    const slot = stateIndex++;
    return [states[slot], (value: unknown) => { states[slot] = value; }];
  }) as typeof React.useState);
  jest.mocked(React.useRef).mockImplementation(((value: unknown) => {
    const slot = refIndex++;
    return refs[slot] ??= { current: value };
  }) as typeof React.useRef);
  jest.mocked(React.useEffect).mockImplementation((effect) => { effects.push(effect as () => void); });
  jest.mocked(useSession).mockImplementation(() => ({ status, data: status === "authenticated" ? { user: { role: "USER" } } : null }) as ReturnType<typeof useSession>);
});

it.each([undefined, { ok: false }, { ok: true, error: "CredentialsSignin" }])("keeps entered credentials and does not navigate on failed result %j", async (result) => {
  jest.mocked(signIn).mockResolvedValue(result as never);
  const form = render().find((element) => element.props.component === "form")!;
  await form.props.onSubmit({ preventDefault: jest.fn() });
  expect(states.slice(1, 3)).toEqual(["staff@example.com", "secret"]);
  expect(states[3]).toBeTruthy();
  expect(replace).not.toHaveBeenCalled();
  expect(markAppSessionOpen).not.toHaveBeenCalled();
});

it("coordinates the authenticated effect with the pending submit and navigates only once", async () => {
  let complete!: (value: unknown) => void;
  jest.mocked(signIn).mockImplementation(() => new Promise((resolve) => { complete = resolve; }) as never);
  const form = render().find((element) => element.props.component === "form")!;
  const pending = form.props.onSubmit({ preventDefault: jest.fn() });
  status = "authenticated";
  render();
  expect(replace).not.toHaveBeenCalled();
  complete({ ok: true });
  await pending;
  render();
  expect(replace).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenCalledWith("/stock");
  expect(markAppSessionOpen).toHaveBeenCalledTimes(1);
});
