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

  const [clientTel, setClientTel] = React.useState("");
  const [clientNif, setClientNif] = React.useState("");
  const [clientEmail, setClientEmail] = React.useState("");
  const [clientChannel, setClientChannel] = React.useState<"sms" | "whatsapp" | "email">("sms");
  const [clientCode, setClientCode] = React.useState("");
  const [clientStep, setClientStep] = React.useState<"form" | "code">("form");
  const [clientError, setClientError] = React.useState<string | null>(null);
  const [clientSuccess, setClientSuccess] = React.useState<string | null>(null);
  const [whatsappUrl, setWhatsappUrl] = React.useState<string | null>(null);

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
        router.replace("/portal/cliente");
      } else {
        router.replace(callbackUrl);
      }
    }
  }, [callbackUrl, router, status, session]);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);
    setClientSuccess(null);
    setWhatsappUrl(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/client-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telmovel: clientTel,
          nif: clientNif,
          channel: clientChannel,
          email: clientEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setClientError(data.error || "Erro ao enviar código."); return; }
      setClientSuccess(data.message || "Código enviado com sucesso.");
      if (clientChannel === "whatsapp" && data.whatsappUrl) {
        setWhatsappUrl(data.whatsappUrl);
      }
      setClientStep("code");
    } catch { setClientError("Erro de rede. Tente novamente."); }
    finally { setIsSubmitting(false); }
  };

  const handleClientLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);
    setIsSubmitting(true);
    try {
      const result = await signIn("credentials", {
        loginType: "client",
        telmovel: clientTel,
        nif: clientNif,
        code: clientCode,
        callbackUrl: "/portal/cliente",
        redirect: false,
      });
      if (result?.error) { setClientError("Código inválido ou expirado."); return; }
      markAppSessionOpen();
      window.location.href = "/portal/cliente";
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
            onChange={(_, v) => { setTab(v); setClientError(null); setClientSuccess(null); setClientStep("form"); setWhatsappUrl(null); }}
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
            <>
              {clientError && <Alert severity="error">{clientError}</Alert>}
              {clientSuccess && <Alert severity="success">{clientSuccess}</Alert>}

              {clientStep === "form" ? (
                <Stack spacing={3} component="form" onSubmit={handleRequestCode}>
                  <Typography variant="body2" color="text.secondary" textAlign="center">
                    Insira o seu NIF e escolha onde deseja receber o código de acesso.
                  </Typography>
                  <TextField label="NIF" value={clientNif} onChange={(e) => setClientNif(e.target.value)}
                    required fullWidth placeholder="501117334" inputProps={{ maxLength: 9 }}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }} />
                  <Stack spacing={1}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Receber código por
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Button
                        type="button"
                        variant={clientChannel === "whatsapp" ? "contained" : "outlined"}
                        onClick={() => setClientChannel("whatsapp")}
                        sx={{ flex: 1, py: 1, textTransform: "none", fontWeight: 700, borderRadius: 3 }}
                      >
                        WhatsApp
                      </Button>
                      <Button
                        type="button"
                        variant={clientChannel === "email" ? "contained" : "outlined"}
                        onClick={() => setClientChannel("email")}
                        sx={{ flex: 1, py: 1, textTransform: "none", fontWeight: 700, borderRadius: 3 }}
                      >
                        Email
                      </Button>
                      <Button
                        type="button"
                        variant={clientChannel === "sms" ? "contained" : "outlined"}
                        onClick={() => setClientChannel("sms")}
                        disabled={!clientTel}
                        sx={{ flex: 1, py: 1, textTransform: "none", fontWeight: 700, borderRadius: 3 }}
                      >
                        SMS
                      </Button>
                    </Stack>
                  </Stack>
                  {clientChannel !== "email" && (
                    <TextField label="Telemóvel" value={clientTel} onChange={(e) => setClientTel(e.target.value)}
                      required fullWidth placeholder="912345678"
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }} />
                  )}
                  {clientChannel === "email" && (
                    <TextField label="Email" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)}
                      required fullWidth placeholder="cliente@empresa.pt"
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }} />
                  )}
                  <Button type="submit" variant="contained" size="large" fullWidth disabled={isSubmitting}
                    sx={{ py: 1.5, textTransform: "none", fontWeight: 700, borderRadius: 4, fontSize: 16, boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)" }}>
                    {isSubmitting ? <CircularProgress size={22} color="inherit" /> : "Enviar Código"}
                  </Button>
                </Stack>
              ) : (
                <Stack spacing={3} component="form" onSubmit={handleClientLogin}>
                  <Typography variant="body2" color="text.secondary" textAlign="center">
                    Introduza o código de 5 dígitos recebido
                    {clientChannel === "whatsapp" ? " no WhatsApp" : clientChannel === "email" ? " por email" : " no telemóvel"}.
                  </Typography>
                  {clientChannel === "whatsapp" && whatsappUrl && (
                    <Button
                      component="a"
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="outlined"
                      color="success"
                      fullWidth
                      sx={{ textTransform: "none", fontWeight: 700, borderRadius: 3, borderWidth: 2 }}
                    >
                      Abrir WhatsApp para ver o código
                    </Button>
                  )}
                  <TextField label="Código" value={clientCode} onChange={(e) => setClientCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    required fullWidth placeholder="12345" inputProps={{ maxLength: 5 }}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 },
                      "& input": { textAlign: "center", fontSize: 24, fontWeight: 800, letterSpacing: 8 }
                    }} />
                  <Button type="submit" variant="contained" size="large" fullWidth disabled={isSubmitting || clientCode.length !== 5}
                    sx={{ py: 1.5, textTransform: "none", fontWeight: 700, borderRadius: 4, fontSize: 16, boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)" }}>
                    {isSubmitting ? <CircularProgress size={22} color="inherit" /> : "Entrar"}
                  </Button>
                  <Button variant="text" onClick={() => { setClientStep("form"); setClientError(null); setClientSuccess(null); setClientCode(""); setWhatsappUrl(null); }}
                    sx={{ textTransform: "none", fontWeight: 700, fontSize: "0.85rem", color: "text.secondary" }}>
                    Voltar
                  </Button>
                </Stack>
              )}
            </>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
