import { renderToStaticMarkup } from "react-dom/server";
import JulinhoAssistant from "../JulinhoAssistant";

let pathname = "/";
jest.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("../JulinhoCliente", () => function MockCliente() { return <div>Assistente cliente</div>; });

describe("visibilidade da Julia", () => {
  it.each(["/verificar/certificado", "/verificar/certificado/detalhes"])("oculta na página de verificação %s", (path) => {
    pathname = path;
    expect(renderToStaticMarkup(<JulinhoAssistant />)).toBe("");
  });

  it("continua disponível nas páginas normais", () => {
    pathname = "/jangadas";
    expect(renderToStaticMarkup(<JulinhoAssistant />)).toContain("Abrir a Julia");
  });

  it("mantém a assistente da área de cliente", () => {
    pathname = "/area-cliente";
    expect(renderToStaticMarkup(<JulinhoAssistant />)).toContain("Assistente cliente");
  });
});
