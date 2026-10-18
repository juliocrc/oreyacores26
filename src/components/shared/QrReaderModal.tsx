'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { Html5Qrcode } from 'html5-qrcode';

interface QrReaderModalProps {
  open: boolean;
  onClose: () => void;
}

export default function QrReaderModal({ open, onClose }: QrReaderModalProps) {
  const router = useRouter();
  const [tabIndex, setTabIndex] = useState(0);
  const [manualSerial, setManualSerial] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const divId = 'html5-qrcode-reader-container';

  useEffect(() => {
    if (!open) {
      stopScanner();
      setErrorMsg(null);
      setManualSerial('');
    } else if (tabIndex === 0) {
      // Start camera after dialog is mounted
      const timer = setTimeout(() => {
        startScanner();
      }, 300);
      return () => clearTimeout(timer);
    }
    return () => {
      stopScanner();
    };
  }, [open, tabIndex]);

  const stopScanner = async () => {
    try {
      if (scannerRef.current) {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch (err) {
      console.error('Erro ao parar leitor QR:', err);
    } finally {
      setScanning(false);
    }
  };

  const startScanner = async () => {
    await stopScanner();
    setErrorMsg(null);
    try {
      const html5QrCode = new Html5Qrcode(divId);
      scannerRef.current = html5QrCode;
      
      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          handleSuccessfulScan(decodedText);
        },
        () => {
          // scanning frame error / no qr found in frame, ignore
        }
      );
      setScanning(true);
    } catch (err) {
      console.error('Falha ao iniciar câmara:', err);
      setErrorMsg('Não foi possível aceder à câmara. Verifique as permissões do browser ou utilize o modo manual.');
      setScanning(false);
    }
  };

  const handleSuccessfulScan = (text: string) => {
    stopScanner();
    processScannedValue(text);
  };

  const processScannedValue = (raw: string) => {
    const cleaned = raw.trim();
    if (!cleaned) {
      setErrorMsg('Código QR vazio ou inválido.');
      return;
    }

    // Check if it's a full URL or contains serial
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
      try {
        const url = new URL(cleaned);
        router.push(url.pathname + url.search + url.hash);
        onClose();
        return;
      } catch {
        // fallback to search serial
      }
    }

    // If it contains /jangadas/serial/
    if (cleaned.includes('/jangadas/serial/')) {
      const parts = cleaned.split('/jangadas/serial/');
      const serial = parts[1]?.split('/')[0]?.split('?')[0];
      if (serial) {
        router.push(`/jangadas/serial/${encodeURIComponent(serial)}`);
        onClose();
        return;
      }
    }

    // Otherwise treat as serial number or equipment id
    router.push(`/jangadas/serial/${encodeURIComponent(cleaned)}`);
    onClose();
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSerial.trim()) {
      setErrorMsg('Introduza um número de série válido.');
      return;
    }
    processScannedValue(manualSerial);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
        📸 Leitor de QR Code (Jangada / Certificado)
      </DialogTitle>
      <Tabs
        value={tabIndex}
        onChange={(_, val) => {
          stopScanner();
          setTabIndex(val);
        }}
        sx={{ px: 3, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Tab label="Câmara" />
        <Tab label="Introdução Manual" />
      </Tabs>
      <DialogContent sx={{ pt: 3 }}>
        {errorMsg && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {errorMsg}
          </Alert>
        )}

        {tabIndex === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Box
              id={divId}
              sx={{
                width: '100%',
                maxWidth: 360,
                minHeight: 300,
                borderRadius: 2,
                overflow: 'hidden',
                bgcolor: 'black',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
              Aponte a câmara para o QR Code da jangada, quadro de identificação ou certificado.
            </Typography>
          </Box>
        ) : (
          <Box component="form" onSubmit={handleManualSubmit} sx={{ py: 2 }}>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Insira o número de série da jangada ou o código do certificado para aceder diretamente à ficha.
              </Typography>
              <TextField
                label="Número de Série / Código"
                fullWidth
                variant="outlined"
                value={manualSerial}
                onChange={(e) => setManualSerial(e.target.value)}
                autoFocus
                placeholder="Ex: SR-12345 ou 2026/001"
              />
              <Button type="submit" variant="contained" size="large">
                Aceder à Ficha
              </Button>
            </Stack>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Fechar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
