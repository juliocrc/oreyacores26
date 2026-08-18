"use client";

import * as React from "react";
import { Suspense } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { APP_CONFIG } from "@/lib/app-config";

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

interface Collaborator {
  id: number;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
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
  const { status } = useSession();

  const [tab, setTab] = React.useState(0);

  const [collaborators, setCollaborators] = React.useState<Collaborator[]>([]);
  const [selectedColab, setSelectedColab] = React.useState<Collaborator | null>(null);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);

  const [clientTel, setClientTel] = React.useState("");
  const [clientNif, setClientNif] = React.useState("");
  const [clientCode, setClientCode] = React.useState("");
  const [clientStep, setClientStep] = React.useState<"form" | "code">("form");
  const [clientError, setClientError] = React.useState<string | null>(null);
  const [clientSuccess, setClientSuccess] = React.useState<string | null>(null);

  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const callbackUrl = React.useMemo(() => resolveCallbackUrl(searchParams.get("callbackUrl")), [searchParams]);
  const authError = searchParams.get("error");

  React.useEffect(() => {
    async function loadCollaborators() {
      try {
        const res = await fetch("/api/auth/collaborators");
        const data = await res.json();
        if (Array.isArray(data.users)) {
          setCollaborators(data.users);
          if (data.users.length > 0) setSelectedColab(data.users[0]);
        }
      } catch (err) {
        console.error("Erro ao carregar colaboradores:", err);
      } finally {
      }
    }
    loadCollaborators();
  }, []);

  React.useEffect(() => {
    if (status === "authenticated") router.replace(callbackUrl);
  }, [callbackUrl, router, status]);

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await signIn("credentials", { email, password, callbackUrl, redirect: false });
      if (result?.error) { setError("Email ou password incorretos."); return; }
      router.replace(callbackUrl);
    } finally { setIsSubmitting(false); }
  };

  const handlePasswordlessLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedColab) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await signIn("credentials", { loginType: "passwordless", userId: String(selectedColab.id), callbackUrl, redirect: false });
      if (result?.error) { setError("Não foi possível iniciar sessão."); return; }
      router.replace(callbackUrl);
    } finally { setIsSubmitting(false); }
  };

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);
    setClientSuccess(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/client-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telmovel: clientTel, nif: clientNif }),
      });
      const data = await res.json();
      if (!res.ok) { setClientError(data.error || "Erro ao enviar código."); return; }
      setClientSuccess("Código enviado para o seu telemóvel.");
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
        callbackUrl,
        redirect: false,
      });
      if (result?.error) { setClientError("Código inválido ou expirado."); return; }
      router.replace(callbackUrl);
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
            onChange={(_, v) => { setTab(v); setError(null); setClientError(null); setClientSuccess(null); setClientStep("form"); }}
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
          {error && <Alert severity="error">{error}</Alert>}

          {tab === 0 && (
            <>
              {!usePasswordLogin ? (
                <Stack spacing={3} alignItems="center" component="form" onSubmit={handlePasswordlessLogin}>
                  <Box
                    sx={{
                      width: 80, height: 80, borderRadius: "50%", bgcolor: "primary.main", color: "white",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800,
                      boxShadow: "0 10px 20px rgba(37, 99, 235, 0.15)", border: "3px solid white",
                      outline: "2px solid rgba(37, 99, 235, 0.2)",
                      backgroundImage: selectedColab?.image ? `url(${selectedColab.image})` : "none",
                      backgroundSize: "cover", backgroundPosition: "center", mb: 1,
                    }}
                  >
                    {!selectedColab?.image && (selectedColab?.name ? selectedColab.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase() : "U")}
                  </Box>

                  <Stack spacing={0.5} alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                      {selectedColab?.name || selectedColab?.email || "Selecionar Utilizador"}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>
                      {selectedColab?.role === "ADMIN" ? "Administrador" : "Colaborador"}
                    </Typography>
                  </Stack>

                  <TextField
                    select fullWidth label="Escolher Conta" value={selectedColab?.id || ""}
                    onChange={(e) => { const id = Number(e.target.value); const c = collaborators.find(x => x.id === id); if (c) setSelectedColab(c); }}
                    SelectProps={{ native: true }} variant="outlined"
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
                  >
                    {collaborators.map((c) => (
                      <option key={c.id} value={c.id}>{c.name || c.email} ({c.role === "ADMIN" ? "Admin" : "Técnico"})</option>
                    ))}
                  </TextField>

                  <Button type="submit" variant="contained" size="large" fullWidth disabled={isSubmitting || !selectedColab}
                    sx={{ py: 1.5, textTransform: "none", fontWeight: 700, borderRadius: 4, fontSize: 16, boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)" }}>
                    {isSubmitting ? <CircularProgress size={22} color="inherit" /> : "Entrar"}
                  </Button>

                  <Button variant="text" onClick={() => setUsePasswordLogin(true)}
                    sx={{ textTransform: "none", fontWeight: 700, fontSize: "0.85rem", color: "text.secondary" }}>
                    Entrar com Email e Password
                  </Button>
                </Stack>
              ) : (
                <Stack spacing={3} component="form" onSubmit={handleStaffLogin}>
                  <TextField label="Endereço de Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    required fullWidth sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }} />
                  <TextField label="Password" type={showPassword ? "text" : "password"} value={password}
                    onChange={(e) => setPassword(e.target.value)} required fullWidth
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton onClick={() => setShowPassword((c) => !c)} edge="end">
                            {showPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }} />
                  <Button type="submit" variant="contained" size="large" fullWidth disabled={isSubmitting}
                    sx={{ py: 1.5, textTransform: "none", fontWeight: 700, borderRadius: 4, fontSize: 16, boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)" }}>
                    {isSubmitting ? <CircularProgress size={22} color="inherit" /> : "Entrar com Senha"}
                  </Button>
                  <Button variant="text" onClick={() => setUsePasswordLogin(false)}
                    sx={{ textTransform: "none", fontWeight: 700, fontSize: "0.85rem", color: "primary.main" }}>
                    Voltar à Seleção (Sem Password)
                  </Button>
                </Stack>
              )}
            </>
          )}

          {tab === 1 && (
            <>
              {clientError && <Alert severity="error">{clientError}</Alert>}
              {clientSuccess && <Alert severity="success">{clientSuccess}</Alert>}

              {clientStep === "form" ? (
                <Stack spacing={3} component="form" onSubmit={handleRequestCode}>
                  <Typography variant="body2" color="text.secondary" textAlign="center">
                    Insira o seu telemóvel e NIF para receber um código de acesso.
                  </Typography>
                  <TextField label="Telemóvel" value={clientTel} onChange={(e) => setClientTel(e.target.value)}
                    required fullWidth placeholder="912345678"
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }} />
                  <TextField label="NIF" value={clientNif} onChange={(e) => setClientNif(e.target.value)}
                    required fullWidth placeholder="501117334" inputProps={{ maxLength: 9 }}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }} />
                  <Button type="submit" variant="contained" size="large" fullWidth disabled={isSubmitting}
                    sx={{ py: 1.5, textTransform: "none", fontWeight: 700, borderRadius: 4, fontSize: 16, boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)" }}>
                    {isSubmitting ? <CircularProgress size={22} color="inherit" /> : "Enviar Código"}
                  </Button>
                </Stack>
              ) : (
                <Stack spacing={3} component="form" onSubmit={handleClientLogin}>
                  <Typography variant="body2" color="text.secondary" textAlign="center">
                    Introduza o código de 5 dígitos recebido no telemóvel.
                  </Typography>
                  <TextField label="Código" value={clientCode} onChange={(e) => setClientCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    required fullWidth placeholder="12345" inputProps={{ maxLength: 5 }}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 },
                      "& input": { textAlign: "center", fontSize: 24, fontWeight: 800, letterSpacing: 8 }
                    }} />
                  <Button type="submit" variant="contained" size="large" fullWidth disabled={isSubmitting || clientCode.length !== 5}
                    sx={{ py: 1.5, textTransform: "none", fontWeight: 700, borderRadius: 4, fontSize: 16, boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)" }}>
                    {isSubmitting ? <CircularProgress size={22} color="inherit" /> : "Entrar"}
                  </Button>
                  <Button variant="text" onClick={() => { setClientStep("form"); setClientError(null); setClientSuccess(null); setClientCode(""); }}
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
