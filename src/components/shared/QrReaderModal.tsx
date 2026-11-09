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
  onScan?: (value: string) => void;
}

export default function QrReaderModal({ open, onClose, onScan }: QrReaderModalProps) {
  const router = useRouter();
  const [tabIndex, setTabIndex] = useState(0);
  const [manualSerial, setManualSerial] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const callbacksRef = useRef({ onScan, onClose });
  callbacksRef.current = { onScan, onClose };
  const divId = 'html5-qrcode-reader-container';

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    handledRef.current = false;
    if (!open) {
      stopScanner();
      setErrorMsg(null);
      setManualSerial('');
    } else if (tabIndex === 0) {
      // Start camera after dialog is mounted
      timer = setTimeout(() => {
        void startScanner(() => cancelled);
      }, 300);
    }
    return () => {
      cancelled = true;
      clearTimeout(timer);
      void stopScanner();
    };
  }, [open, tabIndex]);

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    try {
      if (scanner) {
        if (scanner.isScanning) {
          await scanner.stop();
        }
        scanner.clear();
      }
    } catch (err) {
      console.error('Erro ao parar leitor QR:', err);
    } finally {
      setScanning(false);
    }
  };

  const startScanner = async (isCancelled: () => boolean) => {
    await stopScanner();
    if (isCancelled()) return;
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
          if (!isCancelled()) handleSuccessfulScan(decodedText);
        },
        () => {
          // scanning frame error / no qr found in frame, ignore
        }
      );
      // Camera permission can resolve after the modal has already closed.
      if (isCancelled()) {
        if (html5QrCode.isScanning) await html5QrCode.stop();
        html5QrCode.clear();
        return;
      }
      setScanning(true);
    } catch (err) {
      if (isCancelled()) return;
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

    if (handledRef.current) return;
    handledRef.current = true;
    if (callbacksRef.current.onScan) {
      callbacksRef.current.onScan(cleaned);
      callbacksRef.current.onClose();
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
        {onScan ? 'Leitor de codigo de stock' : '📸 Leitor de QR Code (Jangada / Certificado)'}
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
              {onScan ? 'Aponte a camara para o codigo de barras ou QR do lote.' : 'Aponte a câmara para o QR Code da jangada, quadro de identificação ou certificado.'}
            </Typography>
          </Box>
        ) : (
          <Box component="form" onSubmit={handleManualSubmit} sx={{ py: 2 }}>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                {onScan ? 'Insira o codigo de barras ou a referencia exata do artigo.' : 'Insira o número de série da jangada ou o código do certificado para aceder diretamente à ficha.'}
              </Typography>
              <TextField
                label={onScan ? 'Codigo de barras / Referencia' : 'Número de Série / Código'}
                fullWidth
                variant="outlined"
                value={manualSerial}
                onChange={(e) => setManualSerial(e.target.value)}
                autoFocus
                placeholder={onScan ? 'Codigo do lote' : 'Ex: SR-12345 ou 2026/001'}
              />
              <Button type="submit" variant="contained" size="large">
                {onScan ? 'Pesquisar artigo' : 'Aceder à Ficha'}
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
