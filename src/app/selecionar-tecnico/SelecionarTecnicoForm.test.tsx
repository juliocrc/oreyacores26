import * as React from "react";
import { SelecionarTecnicoForm } from "./SelecionarTecnicoForm";
import { selecionarTecnico, type SelecaoState } from "./actions";

jest.mock("./actions", () => ({ selecionarTecnico: jest.fn() }));
jest.mock("react", () => ({ ...jest.requireActual("react"), useActionState: jest.fn(), useEffect: jest.fn(), useRef: jest.fn(), useState: (value: unknown) => [value, jest.fn()], useMemo: (factory: () => unknown) => factory(), useSyncExternalStore: () => true }));

const replace = jest.fn();
let state: SelecaoState;
const navigating = { current: false };
const submit = async (data: FormData) => { state = await selecionarTecnico(state, data); };
const props = {
  tecnicos: [{ tecnicoId: 7, nome: "Staff", email: "staff@example.com", estacao: null, estacaoId: null }],
  estacoes: [], estacaoInicialId: null, callbackUrl: "/stock?view=all",
};

function render() {
  return SelecionarTecnicoForm(props);
}

beforeEach(() => {
  jest.clearAllMocks();
  state = {};
  navigating.current = false;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { replace } } });
  jest.mocked(React.useRef).mockReturnValue(navigating);
  jest.mocked(React.useActionState).mockImplementation(() => [state, submit, false] as never);
  jest.mocked(React.useEffect).mockImplementation((effect) => { effect(); });
});

afterEach(() => jest.restoreAllMocks());

it("performs one full navigation after the first successful submission", async () => {
  jest.mocked(selecionarTecnico).mockResolvedValue({ ok: true });
  const form = render();
  const data = new FormData();
  data.set("tecnicoId", "7");
  data.set("password", "secret");
  await form.props.action(data);
  render();
  render();
  expect(selecionarTecnico).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenCalledWith("/stock?view=all");
});

it("keeps the form and displays action errors without navigating", async () => {
  jest.mocked(selecionarTecnico).mockResolvedValue({ erro: "Invalid credentials" });
  await render().props.action(new FormData());
  const form = render();
  expect(form.type).toBe("form");
  const alert = React.Children.toArray(form.props.children).find((child) => React.isValidElement<{ role?: string }>(child) && child.props.role === "alert") as React.ReactElement<{ children: string }>;
  expect(alert.props.children).toBe("Invalid credentials");
  expect(replace).not.toHaveBeenCalled();
});
