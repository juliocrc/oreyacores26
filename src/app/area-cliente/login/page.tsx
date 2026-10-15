"use client";

import * as React from "react";
import { Alert, Box, Button, CircularProgress, Paper, Stack, TextField, Typography } from "@mui/material";
import { Anchor } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { markAppSessionOpen } from "@/app/session-idle-timeout";

export default function AreaClienteLoginPage() {
  const router = useRouter();
  const { status, data: session } = useSession();

  const [clientNif, setClientNif] = React.useState("");
  const [clientCode, setClientCode] = React.useState("");
  const [clientError, setClientError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (status === "authenticated") {
      markAppSessionOpen();
      if (session?.user?.role === "CLIENTE") {
        router.replace("/area-cliente");
      }
    }
  }, [router, status, session]);

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
      if (result?.error) {
        setClientError("NIF ou código inválidos.");
        return;
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
    <Box sx={{ minHeight: "70vh", display: "grid", placeItems: "center", px: 2 }}>
      <Paper elevation={8} sx={{ width: "100%", maxWidth: 480, borderRadius: 6, p: { xs: 3, md: 5 } }}>
        <Stack spacing={3} suppressHydrationWarning>
          <Stack spacing={1} alignItems="center" textAlign="center">
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: 3,
                bgcolor: "#4f46e5",
                color: "white",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 6px 16px rgba(79, 70, 229, 0.25)",
              }}
            >
              <Anchor size={28} />
            </Box>
            <Typography variant="overline" sx={{ color: "#4f46e5", fontWeight: 800, letterSpacing: 1.5 }}>
              Orey Açores
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: "-0.03em" }}>
              Área do Cliente
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Inicie sessão com o seu NIF e o código de acesso.
            </Typography>
          </Stack>

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
              sx={{ py: 1.5, textTransform: "none", fontWeight: 700, borderRadius: 4, fontSize: 16, bgcolor: "#4f46e5", boxShadow: "0 4px 12px rgba(79, 70, 229, 0.2)", "&:hover": { bgcolor: "#4338ca" } }}>
              {isSubmitting ? <CircularProgress size={22} color="inherit" /> : "Entrar"}
            </Button>
          </Stack>

          <Typography variant="body2" color="text.secondary" textAlign="center">
            É da equipa Orey?{" "}
            <Link href="/login" style={{ fontWeight: 700 }}>
              Entrar aqui
            </Link>
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
