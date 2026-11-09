import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { getAuthSecret, normalizeEmail } from "@/lib/auth";
import { resolveEffectivePermissions } from "@/lib/user-permissions";
import { getCachedPermissions, setCachedPermissions } from "@/lib/permissions-cache";
import { encontrarClientePorContacto } from "@/lib/communications";
import { checkRateLimit } from "@/lib/rate-limit";
import { isLocalAuthBypassEnabled } from "@/lib/local-auth";

const authUserSelect = {
  id: true,
  email: true,
  name: true,
  image: true,
  role: true,
  passwordHash: true,
} as const;

class ClientRateLimitError extends CredentialsSignin {
  constructor(status: number) {
    super();
    this.code = status === 503 ? "rate_limit_unavailable" : "rate_limit_exceeded";
  }
}

const CLIENT_SESSION_MS = 365 * 24 * 60 * 60 * 1000;
const STAFF_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeDeviceId(value: string | undefined): string | undefined {
  const clean = String(value ?? "").replace(/[^0-9A-Za-z_-]/g, "").slice(0, 80);
  return clean || undefined;
}

function clientSessionIsExpired(token: Record<string, unknown>): boolean {
  const expires = Number(token.clientExpiresAt);
  return !Number.isFinite(expires) || Date.now() >= expires;
}

export function getIsSecureUrl() {
  const raw = String(process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "").trim();
  if (raw) return raw.startsWith("https://");
  return Boolean(process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL);
}

export const authConfig: NextAuthConfig = {
  trustHost: true,
  secret: getAuthSecret(),
  useSecureCookies: getIsSecureUrl(),
  session: {
    strategy: "jwt",
    // O cookie pode ser longo; a validade efetiva é controlada no callback JWT:
    // clientes até 365 dias (sessão de dispositivo), equipa até 30 dias.
    maxAge: 365 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  pages: {
    // Technician selection authenticates with the staff account's password.
    signIn: "/selecionar-tecnico",
  },
  providers: [
      CredentialsProvider({
      name: "Credenciais",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        loginType: { type: "text" },
         code: { type: "text" },
        userId: { type: "text" },
        phone: { type: "text" },
        nif: { type: "text" },
        deviceId: { type: "text" },
        deviceModel: { type: "text" },
        deviceOs: { type: "text" },
        appVersion: { type: "text" },
        deviceStationId: { type: "text" },
      },
      async authorize(credentials) {
        const str = (value: unknown): string | undefined =>
          typeof value === "string" ? value : undefined;

        const loginType = str(credentials?.loginType);
         const code = str(credentials?.code);
        const deviceId = normalizeDeviceId(str(credentials?.deviceId));
        const deviceModel = str(credentials?.deviceModel)?.slice(0, 120);
        const deviceOs = str(credentials?.deviceOs)?.slice(0, 60);
        const deviceAppVersion = str(credentials?.appVersion)?.slice(0, 40);
        const deviceStationId = Number(str(credentials?.deviceStationId));
        const emailRaw = str(credentials?.email);
        const password = str(credentials?.password);
        const phone = str(credentials?.phone);
        const nif = str(credentials?.nif);

        if (loginType === "client") {
          const email = normalizeEmail(emailRaw);
          const cleanCode = String(code ?? "").trim();
          if (!/^\d{5}$/.test(cleanCode)) return null;

          const identity = nif
            ? `nif:${nif.replace(/[^0-9A-Za-z]/g, "").toUpperCase()}`
            : phone ? `phone:${phone.replace(/\D/g, "")}` : `email:${email}`;
          const globalLimit = await checkRateLimit("client-login:global", 100, 10 * 60 * 1000);
          const identityLimit = globalLimit.allowed ? await checkRateLimit(`client-login:${identity}`, 5, 10 * 60 * 1000) : globalLimit;
          if (!identityLimit.allowed) {
            throw new ClientRateLimitError(identityLimit.status);
          }

          const normalizeNif = (value: unknown) =>
            String(value ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();

          let cliente: {
            id: number;
            nome: string;
            email: string | null;
            nif: string | null;
            verificationCode: string | null;
            verificationCodeExpires: Date | null;
            portalAtivo: boolean;
            serviceStationId: number | null;
          } | null = null;

          if (nif) {
            // NIF identifies the client; only a temporary code authenticates them.
            const cleanNif = normalizeNif(nif);
            if (cleanNif) {
              const candidates = await prisma.cliente.findMany({
                where: { nif: { not: null }, verificationCode: { not: null } },
                select: {
                  id: true,
                  nome: true,
                  email: true,
                  nif: true,
                  verificationCode: true,
                  verificationCodeExpires: true,
                  portalAtivo: true,
                  serviceStationId: true,
                },
              });
              cliente =
                candidates.find(
                  (candidate) =>
                    normalizeNif(candidate.nif) === cleanNif &&
                    String(candidate.verificationCode).trim() === cleanCode,
                ) ?? null;
            }
          } else if (phone) {
            const match = await encontrarClientePorContacto(phone);
            if (match) {
              cliente = await prisma.cliente.findUnique({
                where: { id: match.id },
                select: {
                  id: true,
                  nome: true,
                  email: true,
                  nif: true,
                  verificationCode: true,
                  verificationCodeExpires: true,
                  portalAtivo: true,
                  serviceStationId: true,
                },
              });
            }
          } else if (email) {
            cliente = await prisma.cliente.findFirst({
              where: {
                email,
                verificationCode: { not: null },
              },
              select: {
                id: true,
                nome: true,
                email: true,
                nif: true,
                verificationCode: true,
                verificationCodeExpires: true,
                portalAtivo: true,
                serviceStationId: true,
              },
            });
          }

          if (!cliente || !cliente.portalAtivo || !cliente.verificationCode) return null;
          const clientLimit = await checkRateLimit(`client-login:id:${cliente.id}`, 5, 10 * 60 * 1000);
          if (!clientLimit.allowed) {
            throw new ClientRateLimitError(clientLimit.status);
          }

          if (String(cliente.verificationCode).trim() !== cleanCode) return null;
          if (normalizeNif(cliente.nif) === normalizeNif(cleanCode)) return null;

          if (!cliente.verificationCodeExpires) return null;
          const expiresTime = new Date(cliente.verificationCodeExpires).getTime();
          if (!Number.isFinite(expiresTime) || Date.now() >= expiresTime) return null;

          // Compare-and-clear ensures only one concurrent login can consume the code.
          const consumed = await prisma.cliente.updateMany({
            where: { id: cliente.id, verificationCode: cliente.verificationCode,
              verificationCodeExpires: { gt: new Date() } },
            data: {
              verificationCode: null,
              verificationCodeExpires: null,
            },
          });
          if (consumed.count !== 1) return null;

          // Find or create User account on-the-fly
          let user = await prisma.user.findFirst({
            where: { clienteId: cliente.id, role: "CLIENTE" }
          });

          if (!user) {
            const clientEmail = cliente.email || `client_${cliente.id}@oreyazores.com`;
            const existingUser = await prisma.user.findUnique({ where: { email: clientEmail } });

            if (!existingUser) {
              user = await prisma.user.create({
                data: {
                  email: clientEmail,
                  name: cliente.nome,
                  role: "CLIENTE",
                  clienteId: cliente.id,
                  passwordHash: null,
                }
              });
            } else {
              // Never reassign a staff account or another client's identity by email.
              return null;
            }
          }

          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
            select: { id: true },
          });

          // Registar o dispositivo: o admin vê as sessões ativas e pode revogar
          // só este dispositivo sem suspender o cliente.
          if (deviceId) {
            await prisma.portalDevice.upsert({
              where: { clienteId_deviceId: { clienteId: cliente.id, deviceId } },
              update: {
                revogado: false,
                revogadoEm: null,
                ultimoAcesso: new Date(),
                app: "cliente",
                modelo: deviceModel ?? undefined,
                osVersion: deviceOs ?? undefined,
                appVersion: deviceAppVersion ?? undefined,
                serviceStationId: Number.isFinite(deviceStationId) && deviceStationId > 0
                  ? deviceStationId
                  : cliente.serviceStationId ?? undefined,
              },
              create: {
                clienteId: cliente.id,
                deviceId,
                app: "cliente",
                modelo: deviceModel ?? undefined,
                osVersion: deviceOs ?? undefined,
                appVersion: deviceAppVersion ?? undefined,
                serviceStationId: Number.isFinite(deviceStationId) && deviceStationId > 0
                  ? deviceStationId
                  : cliente.serviceStationId ?? undefined,
              },
            }).catch(() => {});
          }

          return { id: String(user.id), email: user.email, name: user.name, image: user.image, deviceId };
        }

        // A staff ID is an identifier, never proof of authentication.
        if (loginType === "passwordless") {
          return null;
        }

        // Standard credentials login
        const email = normalizeEmail(emailRaw);
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: authUserSelect,
        });
        // Client accounts must use the verified code flow, never password bootstrap.
        if (!user || user.role === "CLIENTE") return null;

        let valid = false;
        if (user.passwordHash) {
          valid = await bcrypt.compare(password, user.passwordHash);
        } else if (isLocalAuthBypassEnabled() && password.length >= 3) {
          valid = true;
          const newHash = await bcrypt.hash(password, 10);
          await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash: newHash },
          }).catch(() => {});
        }
        if (!valid) return null;

        await prisma.user.update({
          where: { email },
          data: { lastLoginAt: new Date() },
          select: { id: true },
        });

        return { id: String(user.id), email: user.email, name: user.name, image: user.image };
      },
    }),
],
  callbacks: {
    async signIn() {
      return true;
    },
    async jwt({ token, user, trigger }) {
      try {
        if (!token.sessionId) {
          token.sessionId = randomUUID();
        }

        // JWT slim: só identidade. Permissões resolvem-se no session callback / access-control.
        const shouldRefreshProfile = Boolean(user) || trigger === "update" || !token.sub || !token.role;

        // Sessão única: quando não há refresh de perfil, valida o identificador
        // desta sessão contra o registado no utilizador. Se outra sessão iniciou
        // entretanto, devolver null termina esta e limpa o cookie.
        if (!shouldRefreshProfile) {
          // Sessão de cliente: validada contra a conta e o acesso ao portal em
          // cada pedido. Suspender o cliente (ou mudar a versão da sessão)
          // invalida imediatamente todos os dispositivos.
          if (token.role === "CLIENTE") {
            const userId = Number(token.sub);
            const clientUser = Number.isFinite(userId)
              ? await prisma.user.findUnique({
                  where: { id: userId },
                  select: {
                    role: true,
                    clienteId: true,
                    cliente: {
                      select: { portalAtivo: true, portalSessionVersion: true },
                    },
                  },
                })
              : null;

            const client = clientUser?.cliente;
            const clientId = Number(token.clienteId);
            const clientVersion = Number(token.clientSessionVersion);
            if (
              !clientUser ||
              clientUser.role !== "CLIENTE" ||
              clientUser.clienteId == null ||
              clientUser.clienteId !== clientId ||
              !client ||
              !client.portalAtivo ||
              !Number.isFinite(clientVersion) ||
              clientVersion !== client.portalSessionVersion ||
              clientSessionIsExpired(token)
            ) {
              return null;
            }

            // Revogação individual de dispositivo: se este deviceId foi revogado
            // pelo administrador, esta sessão termina sem suspender os outros.
            const deviceId = typeof token.deviceId === "string" ? token.deviceId : "";
            if (deviceId) {
              const device = await prisma.portalDevice.findUnique({
                where: { clienteId_deviceId: { clienteId: clientId, deviceId } },
                select: { revogado: true, sessionVersion: true },
              });
              if (!device || device.revogado) return null;
              const deviceVersion = Number(token.deviceSessionVersion);
              if (Number.isFinite(deviceVersion) && deviceVersion !== device.sessionVersion) return null;
              // Touch assíncrono do último acesso (sem bloquear o pedido).
              prisma.portalDevice
                .update({
                  where: { clienteId_deviceId: { clienteId: clientId, deviceId } },
                  data: { ultimoAcesso: new Date() },
                })
                .catch(() => {});
            }

            return token;
          }

          const staffExpires = Number(token.staffExpiresAt);
          if (!Number.isFinite(staffExpires)) {
            token.staffExpiresAt = Date.now() + STAFF_SESSION_MS;
          } else if (Date.now() >= staffExpires) {
            return null;
          }

          if (token.sub) {
            const current = await prisma.user.findUnique({
              where: { id: Number(token.sub) },
              select: { activeSessionId: true },
            });

            if (current && current.activeSessionId && current.activeSessionId !== token.sessionId) {
              return null;
            }

            if (current && !current.activeSessionId) {
              // Sessões criadas antes desta funcionalidade adoptam-se na 1.ª utilização.
              await prisma.user
                .update({
                  where: { id: Number(token.sub) },
                  data: { activeSessionId: token.sessionId },
                })
                .catch(() => {});
            }
          }

          // remove payload legado se ainda existir no cookie
          if ("permissions" in token) delete token.permissions;
          return token;
        }

        const email = normalizeEmail((user?.email as string | undefined) || (token.email as string | undefined));
        if (!email) {
          if (user) throw new Error("Missing login identity");
          return token;
        }

        const dbUser = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            role: true,
            clienteId: true,
            activeSessionId: true,
          },
        });
        if (!dbUser) {
          if (user) throw new Error("Login user not found");
          return token;
        }

        // Only a new login may replace an existing active session.
        if (dbUser.role !== "CLIENTE") {
          if (user) {
            if (dbUser.activeSessionId !== token.sessionId) {
              await prisma.user
                .update({
                  where: { id: dbUser.id },
                  data: { activeSessionId: token.sessionId },
                });
            }
          } else if (!dbUser.activeSessionId) {
            await prisma.user
              .update({
                where: { id: dbUser.id },
                data: { activeSessionId: token.sessionId },
              })
              .catch(() => {});
          } else if (dbUser.activeSessionId !== token.sessionId) {
            return null;
          }
        }

        token.sub = String(dbUser.id);
        token.email = dbUser.email;
        token.name = dbUser.name;
        token.picture = dbUser.image;
        token.role = dbUser.role;
        token.clienteId = dbUser.clienteId ?? undefined;

        if (dbUser.role === "CLIENTE") {
          if (dbUser.clienteId == null) return null;
          const client = await prisma.cliente.findUnique({
            where: { id: dbUser.clienteId },
            select: { portalAtivo: true, portalSessionVersion: true },
          });
          if (!client || !client.portalAtivo) return null;

          // Sessão longa do dispositivo cliente (1 ano). O administrador pode
          // revogar imediatamente suspendendo o acesso, incrementando a versão
          // da sessão ou revogando só este dispositivo.
          token.clientExpiresAt = Date.now() + CLIENT_SESSION_MS;
          token.clientSessionVersion = client.portalSessionVersion;
          const authDeviceId = (user as { deviceId?: string }).deviceId;
          if (typeof authDeviceId === "string") {
            token.deviceId = authDeviceId;
            const device = await prisma.portalDevice.findUnique({
              where: { clienteId_deviceId: { clienteId: dbUser.clienteId, deviceId: authDeviceId } },
              select: { revogado: true, sessionVersion: true },
            });
            if (!device || device.revogado) return null;
            token.deviceSessionVersion = device.sessionVersion;
          }
          delete token.staffExpiresAt;
        } else {
          token.staffExpiresAt = Date.now() + STAFF_SESSION_MS;
          delete token.clientExpiresAt;
          delete token.clientSessionVersion;
        }

        if ("permissions" in token) delete token.permissions;

        return token;
      } catch (jwtErr) {
        console.error("JWT callback error:", jwtErr);
        if (user) throw jwtErr;
        return token;
      }
    },
    async session({ session, token }) {
      if (session.user) {
        const userId = token.sub || "";
        const role = (token.role as "ADMIN" | "USER" | "CLIENTE" | undefined) || "USER";
        session.user.id = userId;
        session.user.email = (token.email as string | undefined) || session.user.email || "";
        session.user.name = (token.name as string | undefined) || session.user.name;
        session.user.image = (token.picture as string | undefined) || session.user.image;
        session.user.role = role;
        session.user.clienteId = (token.clienteId as number | null | undefined) || undefined;
        session.user.sessionId = (token.sessionId as string | undefined) || "";

        // Permissões fora do JWT (cookie pequeno); cache 60s
        if (userId && role !== "CLIENTE") {
          try {
            const cached = getCachedPermissions(userId, role);
            if (cached) {
              session.user.permissions = cached;
            } else {
              const permissions = await resolveEffectivePermissions({
                userId: Number(userId),
                role: role === "ADMIN" ? "ADMIN" : "USER",
              });
              setCachedPermissions(userId, role, permissions);
              session.user.permissions = permissions;
            }
          } catch (permErr) {
            console.error("Failed to resolve permissions in session callback:", permErr);
            session.user.permissions = undefined;
          }
        } else {
          session.user.permissions = undefined;
        }
      }

      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

export async function getAuthSession() {
  try {
    return await auth();
  } catch (error) {
    console.error("Auth session could not be initialized. Falling back to an anonymous session.", error);
    return null;
  }
}
