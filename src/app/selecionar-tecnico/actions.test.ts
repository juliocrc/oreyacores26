jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => ({
    set: jest.fn(),
  })),
}));

jest.mock("@/auth", () => ({
  signIn: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    tecnico: { findFirst: jest.fn() },
    user: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
}));

jest.mock("@/lib/auth", () => ({
  normalizeEmail: (email: string) => String(email ?? "").trim().toLowerCase(),
}));

jest.mock("@/lib/station-selection", () => ({
  ACTIVE_SERVICE_STATION_COOKIE: "active_station_id",
}));

import prisma from "@/lib/prisma";
import { signIn } from "@/auth";
import { selecionarTecnico } from "./actions";

describe("selecionarTecnico", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("aceita o caso normal do NextAuth em que signIn devolve undefined em sucesso", async () => {
    const cookieStore = { set: jest.fn() };
    const { cookies } = await import("next/headers");
    (cookies as jest.Mock).mockResolvedValue(cookieStore);

    (prisma.tecnico.findFirst as jest.Mock).mockResolvedValue({
      id: 7,
      nome: "Julio Correia",
      email: "julio.correia@orey.com",
      serviceStationId: 12,
    });

    (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 99 });
    (prisma.user.update as jest.Mock).mockResolvedValue({ id: 99 });
    (signIn as jest.Mock).mockResolvedValue(undefined);

    const formData = new FormData();
    formData.set("tecnicoId", "7");

    await expect(selecionarTecnico({}, formData)).resolves.toEqual({ ok: true });
    expect(signIn).toHaveBeenCalledWith("credentials", expect.objectContaining({
      loginType: "passwordless",
      userId: "99",
      redirect: false,
    }));
    expect(cookieStore.set).toHaveBeenCalledWith("orey_app_open", "1", expect.objectContaining({ path: "/" }));
  });
});
