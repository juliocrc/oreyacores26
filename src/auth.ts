import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { getAuthSecret, normalizeEmail } from "@/lib/auth";
import { resolveEffectivePermissions } from "@/lib/user-permissions";
import { getCachedPermissions, setCachedPermissions } from "@/lib/permissions-cache";

const authUserSelect = {
  id: true,
  email: true,
  name: true,
  image: true,
  role: true,
  passwordHash: true,
} as const;

export function getIsSecureUrl() {
  return (process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "").startsWith("https");
}

export function buildAuthOptions(): NextAuthOptions {
  return {
    secret: getAuthSecret(),
    session: {
      strategy: "jwt",
    },
    pages: {
      signIn: "/login",
    },
    providers: [
        CredentialsProvider({
        name: "Credenciais",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
          loginType: { type: "text" },
          telmovel: { type: "text" },
          nif: { type: "text" },
          code: { type: "text" },
          userId: { type: "text" },
        },
        async authorize(credentials) {
          if (credentials?.loginType === "client") {
            const telmovel = credentials.telmovel;
            const nif = credentials.nif;
            const code = credentials.code;

            if (!telmovel || !nif || !code) return null;

            const cleanPhone = (phone: string | null | undefined): string => {
              if (!phone) return "";
              return phone.replace(/\D/g, "");
            };

            const cleanedTarget = cleanPhone(telmovel);
            if (!cleanedTarget) return null;

            const cleanNif = nif.replace(/\D/g, "").trim();
            if (cleanNif.length < 9) return null;

            const now = new Date();
            const cliente = await prisma.cliente.findFirst({
              where: {
                nif: cleanNif,
                verificationCode: { not: null },
                verificationCodeExpires: { gt: now },
              },
              select: {
                id: true,
                nome: true,
                telmovel: true,
                telefone: true,
                email: true,
                verificationCode: true,
                verificationCodeExpires: true,
              }
            });

            if (!cliente) return null;

            const phoneMatch = (() => {
              const t1 = cleanPhone(cliente.telmovel);
              const t2 = cleanPhone(cliente.telefone);
              return (
                (t1 && t1.endsWith(cleanedTarget)) ||
                (t2 && t2.endsWith(cleanedTarget)) ||
                (cleanedTarget.endsWith(t1) && t1) ||
                (cleanedTarget.endsWith(t2) && t2)
              );
            })();

            if (!phoneMatch) return null;

            // Check verification code
            if (!cliente.verificationCode || cliente.verificationCode !== code) return null;
            if (!cliente.verificationCodeExpires || new Date() > new Date(cliente.verificationCodeExpires)) return null;

            // Consume verification code
            await prisma.cliente.update({
              where: { id: cliente.id },
              data: {
                verificationCode: null,
                verificationCodeExpires: null
              }
            });

            // Find or create User account on-the-fly
            let user = await prisma.user.findFirst({
              where: { clienteId: cliente.id }
            });

            if (!user) {
              const email = cliente.email || `client_${cliente.id}@oreyazores.com`;
              const existingUser = await prisma.user.findUnique({ where: { email } });

              if (!existingUser) {
                user = await prisma.user.create({
                  data: {
                    email,
                    name: cliente.nome,
                    role: "CLIENTE",
                    clienteId: cliente.id,
                    passwordHash: null,
                  }
                });
              } else {
                user = await prisma.user.update({
                  where: { id: existingUser.id },
                  data: {
                    clienteId: cliente.id,
                    role: "CLIENTE"
                  }
                });
              }
            }

            await prisma.user.update({
              where: { id: user.id },
              data: { lastLoginAt: new Date() },
              select: { id: true },
            });

            return { id: String(user.id), email: user.email, name: user.name, image: user.image };
          }

          // Passwordless collaborator login
          if (credentials?.loginType === "passwordless") {
            const userId = Number(credentials.userId);
            if (!userId) return null;

            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: authUserSelect,
            });

            if (!user || user.role === "CLIENTE") return null;

            await prisma.user.update({
              where: { id: user.id },
              data: { lastLoginAt: new Date() },
              select: { id: true },
            });

            return { id: String(user.id), email: user.email, name: user.name, image: user.image };
          }

          // Standard credentials login
          const email = normalizeEmail(credentials?.email);
          if (!email || !credentials?.password) return null;

          const user = await prisma.user.findUnique({
            where: { email },
            select: authUserSelect,
          });
          if (!user || !user.passwordHash) return null;

          const valid = await bcrypt.compare(credentials.password, user.passwordHash);
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
        if (!shouldRefreshProfile) {
          // remove payload legado se ainda existir no cookie
          if ("permissions" in token) delete token.permissions;
          return token;
        }

        const email = normalizeEmail((user?.email as string | undefined) || (token.email as string | undefined));
        if (!email) return token;

        const dbUser = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            role: true,
            clienteId: true,
          },
        });
        if (!dbUser) return token;

        token.sub = String(dbUser.id);
        token.email = dbUser.email;
        token.name = dbUser.name;
        token.picture = dbUser.image;
        token.role = dbUser.role;
        token.clienteId = dbUser.clienteId ?? undefined;
        if ("permissions" in token) delete token.permissions;

        return token;
      } catch (jwtErr) {
        console.error("JWT callback error:", jwtErr);
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
}

export const authOptions: NextAuthOptions = buildAuthOptions();

export function getAuthSession() {
  return getServerSession(authOptions);
}