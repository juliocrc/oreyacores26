"use client";

import * as React from "react";
import { Alert, Box, Button, CircularProgress, Paper, Stack, TextField, Typography } from "@mui/material";
import { Anchor } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { markAppSessionOpen } from "@/app/session-idle-timeout";
import type { ClientRegistration } from "@/lib/client-registration";

// Informação do dispositivo enviada no login (app Android injeta window.orey.deviceInfo()).
function collectDeviceInfo(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  const bridge = (window as unknown as { orey?: { deviceInfo?: () => string } }).orey;
  if (!bridge || typeof bridge.deviceInfo !== "function") return {};
  try {
    const info = JSON.parse(bridge.deviceInfo());
    return {
      deviceId: info.deviceId,
      deviceModel: info.model,
      deviceOs: info.os,
      appVersion: info.appVersion,
      deviceStationId: info.stationId,
    };
  } catch {
    return {};
  }
}


export default function AreaClienteLoginPage() {
  const router = useRouter();
  const { status, data: session } = useSession();

  const [clientNif, setClientNif] = React.useState("");
  const [clientCode, setClientCode] = React.useState("");
  const [clientError, setClientError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [contact, setContact] = React.useState("");
  const [requestedContact, setRequestedContact] = React.useState("");
  const [isRequesting, setIsRequesting] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [showCodeRequest, setShowCodeRequest] = React.useState(false);
  const [showRegistration, setShowRegistration] = React.useState(false);
  const [registration, setRegistration] = React.useState<ClientRegistration>({ nome: "", nif: "", email: "", phone: "" });
  const [pendingEmail, setPendingEmail] = React.useState("");

  React.useEffect(() => {
    if (status === "authenticated") {
      markAppSessionOpen();
      if (session?.user?.role === "CLIENTE" && !pendingEmail) {
        router.replace("/area-cliente");
      }
    }
  }, [router, status, session, pendingEmail]);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const identifier = contact.trim();
    if (!identifier || isRequesting || isSubmitting) return;
    setClientError(null);
    setNotice("");
    setIsRequesting(true);
    try {
      const response = await fetch("/api/auth/client-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(identifier.includes("@") ? { email: identifier } : { phone: identifier }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await response.json();
      if (data.assistanceRequested) setNotice(data.message || "O pedido ficou registado e a equipa foi avisada na aplicacao.");
      if (data.registrationRequired) {
        setRegistration({ nome: "", nif: clientNif, email: identifier.includes("@") ? identifier : "", phone: identifier.includes("@") ? "" : identifier });
        setShowRegistration(true);
      }
      if (!response.ok) throw new Error(data.error || "Nao foi possivel pedir o codigo.");
      if (data.manualDelivery) {
        setRequestedContact("");
        setClientCode("");
        setNotice("A ficha nao tem email. O pedido ficou em Pedidos de Assistencia. A equipa vai validar o acesso e comunicar-lhe um codigo temporario. Depois entre com o NIF e esse codigo.");
        return;
      }
      setRequestedContact(identifier);
      setClientCode("");
      setShowCodeRequest(false);
      setNotice(`${data.assistanceRequested ? "A equipa recebeu o seu pedido. " : ""}Pedido de envio aceite. A entrega pode estar pendente. Introduza abaixo o codigo de 5 digitos quando o receber.`);
    } catch (error) {
      setClientError(error instanceof Error ? error.message : "Erro de rede. Tente novamente.");
    } finally {
      setIsRequesting(false);
    }
  };

  const handleRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRequesting || isSubmitting) return;
    setIsRequesting(true);
    setClientError(null);
    setNotice("");
    try {
      const response = await fetch("/api/auth/client-registration", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registration), signal: AbortSignal.timeout(30_000),
      });
      const data = await response.json();
      if (data.assistanceRequested) setNotice(data.message || "Os dados ficaram em Pedidos de Assistencia para validacao da equipa.");
      if (!response.ok) throw new Error(data.error || "Nao foi possivel registar os dados.");
      setClientNif(registration.nif.trim());
      setRequestedContact("");
      setClientCode("");
      setShowCodeRequest(false);
      setShowRegistration(false);
      setPendingEmail(data.updateAfterLogin ? registration.email.trim() : "");
      setNotice(data.manualDelivery
        ? "A ficha nao tem email. A equipa recebeu o pedido em Pedidos de Assistencia e vai comunicar-lhe o codigo. Entre abaixo com o NIF e o codigo fornecido pela equipa."
        : data.success ? "O codigo foi solicitado para um contacto ja registado na ficha. Introduza-o abaixo com o NIF. Os restantes dados propostos ficam para validacao da equipa."
        : data.message || "Pedido registado. Aguarde a validacao da equipa.");
    } catch (error) {
      setClientError(error instanceof Error ? error.message : "Nao foi possivel registar os dados.");
    } finally {
      setIsRequesting(false);
    }
  };

  const handleClientLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isRequesting || !/^\d{5}$/.test(clientCode)) return;
    setClientError(null);
    setIsSubmitting(true);
    try {
      const result = status === "authenticated" && session?.user?.role === "CLIENTE" ? { error: null } : await signIn("credentials", {
        loginType: "client",
        ...(requestedContact
          ? requestedContact.includes("@") ? { email: requestedContact } : { phone: requestedContact }
          : { nif: clientNif.trim() }),
        code: clientCode,
        ...collectDeviceInfo(),
        callbackUrl: "/area-cliente",
        redirect: false,
      });
      if (!result || result.error) {
        setClientError("Dados ou código inválidos, expirados ou já utilizados.");
        return;
      }
      if (pendingEmail) {
        const response = await fetch("/api/portal/dados-registo", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: pendingEmail }), signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          setClientError("O acesso foi validado, mas nao foi possivel guardar o email. Tente Entrar novamente ou contacte a equipa.");
          return;
        }
        setPendingEmail("");
      }
      markAppSessionOpen();
      window.location.href = "/area-cliente";
    } catch (err) {
      console.error("Client login error:", err);
      setClientError("Erro de rede. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <Box sx={{ minHeight: "70vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "70vh", display: "grid", placeItems: "center", px: 2, py: { xs: 3, md: 5 } }}>
      <Paper elevation={8} sx={{ width: "100%", maxWidth: 520, borderRadius: 6, p: { xs: 3, md: 5 } }}>
        <Stack spacing={3} suppressHydrationWarning>
          <Stack spacing={1} alignItems="center" textAlign="center">
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: 3,
                bgcolor: "#0B4F6C",
                color: "white",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 6px 16px rgba(11, 79, 108, 0.25)",
              }}
            >
              <Anchor size={28} />
            </Box>
            <Typography variant="overline" sx={{ color: "#0B4F6C", fontWeight: 800, letterSpacing: 1.5 }}>
              Orey Tecnica- Serviços Navais, Lda
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: "-0.03em" }}>
              Área do Cliente
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Entre com o NIF e o código de 5 dígitos enviado para o contacto registado.
            </Typography>
          </Stack>

          {clientError && <Alert severity="error">{clientError}</Alert>}
          {notice && <Alert severity="info">{notice}</Alert>}

          <Stack spacing={2.5} component="form" onSubmit={handleClientLogin}>
            <Stack spacing={0.5}>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>Entrar com NIF e código</Typography>
              <Typography variant="body2" color="text.secondary">
                A sessão fica guardada neste dispositivo até terminar sessão.
              </Typography>
            </Stack>

            {requestedContact ? (
              <Stack spacing={1}>
                <Typography variant="body2">Entrar com o código pedido para {requestedContact}.</Typography>
                <Button type="button" disabled={isSubmitting || isRequesting} onClick={() => {
                  setRequestedContact("");
                  setClientCode("");
                  setNotice("");
                  setClientError(null);
                }}>
                  Já tenho outro código: entrar com NIF
                </Button>
              </Stack>
            ) : (
              <TextField
                label="NIF"
                value={clientNif}
                onChange={(e) => setClientNif(e.target.value.replace(/\D/g, "").slice(0, 9))}
                required
                fullWidth
                autoFocus
                autoComplete="username"
                placeholder="501117334"
                helperText="NIF da ficha do cliente."
                inputProps={{ inputMode: "numeric", maxLength: 9, pattern: "[0-9]{9}" }}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
              />
            )}

            <TextField
              label="Código de acesso"
              value={clientCode}
              onChange={(e) => setClientCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
              required
              fullWidth
              autoFocus={Boolean(requestedContact)}
              placeholder="12345"
              autoComplete="one-time-code"
              inputProps={{ maxLength: 5, inputMode: "numeric", pattern: "[0-9]{5}" }}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 },
                "& input": { textAlign: "center", fontSize: 24, fontWeight: 800, letterSpacing: 8 }
              }}
            />

            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              disabled={isSubmitting || isRequesting || clientCode.length !== 5 || (!requestedContact && !clientNif.trim())}
              sx={{ py: 1.5, textTransform: "none", fontWeight: 700, borderRadius: 4, fontSize: 16, bgcolor: "#0B4F6C", boxShadow: "0 4px 12px rgba(11, 79, 108, 0.2)", "&:hover": { bgcolor: "#073B52" } }}
            >
              {isSubmitting ? <CircularProgress size={22} color="inherit" /> : "Entrar"}
            </Button>

            {!requestedContact && (
              <Button
                type="button"
                variant="text"
                size="small"
                onClick={() => setShowCodeRequest((value) => !value)}
                sx={{ textTransform: "none", fontWeight: 700 }}
              >
                {showCodeRequest ? "Ocultar pedido de código" : "Ainda não tem código? Pedir código"}
              </Button>
            )}
          </Stack>

          {showCodeRequest && !requestedContact && (
            <Stack id="pedir-codigo" spacing={2} component="form" onSubmit={handleRequestCode}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Pedir código de acesso</Typography>
              <Typography variant="body2" color="text.secondary">
                Utilize o email ou telemóvel registado para identificar a sua ficha. O código é enviado para o email já
                registado, é válido por 24 horas e só pode ser utilizado uma vez. Sem email na ficha, a equipa recebe o
                pedido e comunica-lhe o código.
              </Typography>
              <TextField
                label="Email ou telemóvel registado"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                required
                fullWidth
                autoComplete="off"
                disabled={isRequesting || isSubmitting}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
              />
              <Button
                type="submit"
                variant="outlined"
                size="large"
                fullWidth
                disabled={!contact.trim() || isRequesting || isSubmitting}
                sx={{ py: 1.5, textTransform: "none", fontWeight: 700, borderRadius: 4 }}
              >
                {isRequesting ? <CircularProgress size={22} /> : "Pedir Código de Acesso"}
              </Button>
            </Stack>
          )}

          {showRegistration && (
            <Stack id="dados-registo" spacing={2} component="form" onSubmit={handleRegistration}>
              <Typography variant="h6">Dados de registo / atualização</Typography>
              <Typography variant="body2" color="text.secondary">
                Indique os dados da sua ficha. Se não tiver email, a equipa recebe um pedido de assistência e
                comunica-lhe o código. Os contactos existentes não são substituídos sem validação.
              </Typography>
              <TextField label="Nome completo / empresa" required fullWidth value={registration.nome} onChange={e => setRegistration({ ...registration, nome: e.target.value })} inputProps={{ maxLength: 160 }} />
              <TextField label="NIF do registo" required fullWidth value={registration.nif} onChange={e => setRegistration({ ...registration, nif: e.target.value })} inputProps={{ maxLength: 32 }} />
              <TextField label="Email (se tiver)" type="email" fullWidth value={registration.email} onChange={e => setRegistration({ ...registration, email: e.target.value })} inputProps={{ maxLength: 254 }} />
              <TextField label="Telemóvel do registo" type="tel" required={!registration.email.trim()} fullWidth value={registration.phone} onChange={e => setRegistration({ ...registration, phone: e.target.value })} inputProps={{ maxLength: 40 }} />
              <Button type="submit" variant="contained" disabled={isRequesting || isSubmitting}>Enviar dados e pedir acesso</Button>
              <Button type="button" disabled={isRequesting || isSubmitting} onClick={() => setShowRegistration(false)}>Cancelar registo</Button>
            </Stack>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
