"use client";

import * as React from "react";
import { Suspense } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { APP_CONFIG } from "@/lib/app-config";
import { markAppSessionOpen } from "@/app/session-idle-timeout";

function resolveCallbackUrl(rawCallbackUrl: string | null) {
  if (!rawCallbackUrl) return "/";
  const decodedCallbackUrl = decodeURIComponent(rawCallbackUrl);
  const normalizedCallbackUrl = decodedCallbackUrl.toLowerCase();
  if (
    normalizedCallbackUrl === "/" ||
    normalizedCallbackUrl === "/login" ||
    normalizedCallbackUrl.startsWith("/login?")
  ) {
    return "/";
  }
  return decodedCallbackUrl;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}><CircularProgress /></Box>}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, data: session } = useSession();

  const [tab, setTab] = React.useState(0);

  const [clientNif, setClientNif] = React.useState("");
  const [clientCode, setClientCode] = React.useState("");
  const [clientError, setClientError] = React.useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [teamEmail, setTeamEmail] = React.useState("");
  const [teamPassword, setTeamPassword] = React.useState("");
  const [teamError, setTeamError] = React.useState<string | null>(null);
  const [teamMode, setTeamMode] = React.useState<"select" | "password">("select");

  const handleTeamPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setTeamError(null);
    setIsSubmitting(true);
    try {
      const result = await signIn("credentials", {
        email: teamEmail,
        password: teamPassword,
        callbackUrl,
        redirect: false,
      });
      if (result?.error) {
        setTeamError("Email ou palavra-passe incorretos.");
        return;
      }
      markAppSessionOpen();
      window.location.href = callbackUrl;
    } catch {
      setTeamError("Erro de rede. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const callbackUrl = React.useMemo(() => resolveCallbackUrl(searchParams.get("callbackUrl")), [searchParams]);
  const authError = searchParams.get("error");

  React.useEffect(() => {
    if (status === "authenticated") {
      markAppSessionOpen();
      if (session?.user?.role === "CLIENTE") {
        router.replace("/area-cliente");
      } else {
        router.replace(callbackUrl);
      }
    }
  }, [callbackUrl, router, status, session]);

  const handleClientLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);
    setIsSubmitting(true);
    try {
      const result = await signIn("credentials", {
        loginType: "client",
        nif: clientNif,
        code: clientCode,
        callbackUrl: "/area-cliente",
        redirect: false,
      });
      if (result?.error) { setClientError("NIF ou código inválidos."); return; }
      markAppSessionOpen();
      window.location.href = "/area-cliente";
    } catch (err) {
      console.error("Client login error:", err);
      setClientError("Erro de rede. Tente novamente.");
    } finally { setIsSubmitting(false); }
  };

  if (status === "loading") {
    return (
      <Box sx={{ minHeight: "70vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "70vh", display: "grid", placeItems: "center", px: 2 }}>
      <Paper elevation={8} sx={{ width: "100%", maxWidth: 480, borderRadius: 6, p: { xs: 3, md: 5 } }}>
        <Stack spacing={3} suppressHydrationWarning>
          <Stack spacing={1} alignItems="center" textAlign="center">
            <Typography variant="overline" sx={{ color: "#2563eb", fontWeight: 800, letterSpacing: 1.5 }}>
              {APP_CONFIG.name}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: "-0.03em" }}>
              Iniciar sessão
            </Typography>
          </Stack>

          <Tabs
            value={tab}
           onChange={(_, v) => { setTab(v); setClientError(null); }}
            variant="fullWidth"
            sx={{
              minHeight: 40,
              "& .MuiTab-root": { fontWeight: 700, textTransform: "none", minHeight: 40, fontSize: "0.85rem" },
              "& .MuiTabs-indicator": { height: 3, borderRadius: 2 },
            }}
          >
            <Tab label="Equipa" />
            <Tab label="Cliente" />
          </Tabs>

          {authError && <Alert severity="error">Não foi possível iniciar sessão. Tente novamente.</Alert>}

          {tab === 0 && (
            <Stack spacing={2.5}>
              {teamError && <Alert severity="error">{teamError}</Alert>}
              {teamMode === "select" ? (
                <Stack spacing={2.5} alignItems="center">
                  <Typography variant="body2" color="text.secondary" textAlign="center">
                    Acesso rápido da equipa: escolha o seu nome ou entre com palavra-passe.
                  </Typography>
                  <Button
                    variant="contained"
                    size="large"
                    fullWidth
                    onClick={() => {
                      window.location.href = `/selecionar-tecnico?callbackUrl=${encodeURIComponent(callbackUrl)}`;
                    }}
                    sx={{ py: 1.5, textTransform: "none", fontWeight: 700, borderRadius: 4, fontSize: 16, boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)" }}
                  >
                    Escolher o meu nome
                  </Button>
                  <Button
                    variant="outlined"
                    size="large"
                    fullWidth
                    onClick={() => { setTeamMode("password"); setTeamError(null); }}
                    sx={{ py: 1.5, textTransform: "none", fontWeight: 700, borderRadius: 4, fontSize: 16 }}
                  >
                    Entrar com Palavra-passe
                  </Button>
                </Stack>
              ) : (
                <Stack spacing={2.5} component="form" onSubmit={handleTeamPasswordLogin}>
                  <Typography variant="body2" color="text.secondary" textAlign="center">
                    Introduza o seu email e palavra-passe de acesso.
                  </Typography>
                  <TextField
                    label="Email"
                    type="email"
                    value={teamEmail}
                    onChange={(e) => setTeamEmail(e.target.value)}
                    required
                    fullWidth
                    placeholder="admin@oreyazores.com"
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
                  />
                  <TextField
                    label="Palavra-passe"
                    type="password"
                    value={teamPassword}
                    onChange={(e) => setTeamPassword(e.target.value)}
                    required
                    fullWidth
                    placeholder="••••••••"
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    fullWidth
                    disabled={isSubmitting}
                    sx={{ py: 1.5, textTransform: "none", fontWeight: 700, borderRadius: 4, fontSize: 16, boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)" }}
                  >
                    {isSubmitting ? <CircularProgress size={22} color="inherit" /> : "Entrar"}
                  </Button>
                  <Button
                    variant="text"
                    onClick={() => { setTeamMode("select"); setTeamError(null); }}
                    sx={{ textTransform: "none", fontWeight: 700, fontSize: "0.85rem", color: "text.secondary" }}
                  >
                    Voltar ao acesso rápido
                  </Button>
                </Stack>
              )}
            </Stack>
          )}

          {tab === 1 && (
            <Stack spacing={3} component="form" onSubmit={handleClientLogin}>
              {clientError && <Alert severity="error">{clientError}</Alert>}
              <Typography variant="body2" color="text.secondary" textAlign="center">
                Introduza o seu NIF e o código de 5 dígitos fornecido pela Orey Técnica Açores.
              </Typography>
              <TextField label="NIF" value={clientNif} onChange={(e) => setClientNif(e.target.value)}
                required fullWidth placeholder="501117334"
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }} />
              <TextField label="Código de acesso" value={clientCode} onChange={(e) => setClientCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                required fullWidth placeholder="12345" inputProps={{ maxLength: 5 }}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 },
                  "& input": { textAlign: "center", fontSize: 24, fontWeight: 800, letterSpacing: 8 }
                }} />
              <Button type="submit" variant="contained" size="large" fullWidth disabled={isSubmitting || clientCode.length !== 5}
                sx={{ py: 1.5, textTransform: "none", fontWeight: 700, borderRadius: 4, fontSize: 16, boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)" }}>
                {isSubmitting ? <CircularProgress size={22} color="inherit" /> : "Entrar"}
              </Button>
            </Stack>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
