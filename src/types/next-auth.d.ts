import type { DefaultSession } from "next-auth";

type SessionPermissions = {
  visibleModules?: string[];
  visiblePages?: string[];
  editablePages?: string[];
  editableFields?: Record<string, string[]>;
};

declare module "@auth/core/types" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "USER" | "CLIENTE";
      sessionId: string;
      clienteId?: number | string;
      permissions?: SessionPermissions;
    } & DefaultSession["user"];
  }

  interface User {
    role?: "ADMIN" | "USER" | "CLIENTE";
    sessionId?: string;
    permissions?: SessionPermissions;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: "ADMIN" | "USER" | "CLIENTE";
    sessionId?: string;
    clienteId?: number | null;
  }
}