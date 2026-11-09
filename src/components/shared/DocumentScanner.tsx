"use client";
import { useRef, useState, useCallback } from "react";
import { Camera, X, Loader2, Upload } from "lucide-react";

type Props = {
  onCapture: (file: File, preview: string) => void;
  onClose: () => void;
};

export default function DocumentScanner({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"camera" | "upload" | null>(null);
  const [loading, setLoading] = useState(false);

  const startCamera = useCallback(async () => {
    setMode("camera");
    try {
      // "ideal" permite usar outra câmara em tablets sem câmara traseira.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => {});
      }
    } catch {
      alert("Câmara não disponível. Use o upload de ficheiro.");
      setMode("upload");
    }
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `documento_${Date.now()}.jpg`, { type: "image/jpeg" });
      setCapturedFile(file);
      setPreview(canvas.toDataURL("image/jpeg"));
      stopCamera();
    }, "image/jpeg", 0.85);
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCapturedFile(file);
    setPreview(URL.createObjectURL(file));
    setMode("upload");
  }, []);

  const confirmCapture = useCallback(() => {
    if (capturedFile && preview) {
      onCapture(capturedFile, preview);
    }
  }, [capturedFile, preview, onCapture]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Camera size={20} className="text-indigo-600" /> Digitalizar Documento
          </h3>
          <button onClick={() => { stopCamera(); onClose(); }} className="rounded-lg p-2 hover:bg-slate-100 transition">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!mode && !preview && (
            <div className="flex gap-3">
              <button onClick={startCamera} className="flex-1 rounded-xl border-2 border-dashed border-indigo-300 p-6 text-center hover:bg-indigo-50 transition">
                <Camera size={32} className="mx-auto text-indigo-500 mb-2" />
                <p className="font-semibold text-sm text-indigo-700">Usar Câmara</p>
                <p className="text-xs text-slate-500 mt-1">Tirar foto do documento</p>
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="flex-1 rounded-xl border-2 border-dashed border-emerald-300 p-6 text-center hover:bg-emerald-50 transition">
                <Upload size={32} className="mx-auto text-emerald-500 mb-2" />
                <p className="font-semibold text-sm text-emerald-700">Upload Ficheiro</p>
                <p className="text-xs text-slate-500 mt-1">Selecionar imagem</p>
              </button>
            </div>
          )}

          {mode === "camera" && !preview && (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden bg-black">
                <video ref={videoRef} autoPlay playsInline className="w-full h-64 object-cover" />
                <canvas ref={canvasRef} className="hidden" />
              </div>
              <div className="flex gap-2">
                <button onClick={capturePhoto} className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition">
                  Capturar Foto
                </button>
                <button onClick={() => { stopCamera(); setMode(null); }} className="rounded-lg bg-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-300 transition">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {preview && (
            <div className="space-y-3">
              <img src={preview} alt="Preview" className="w-full rounded-xl border border-slate-200 max-h-80 object-contain bg-slate-100" />
              <div className="flex gap-2">
                <button onClick={confirmCapture} className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition">
                  Confirmar Documento
                </button>
                <button onClick={() => { setPreview(null); setCapturedFile(null); startCamera(); }} className="rounded-lg bg-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-300 transition">
                  Nova Foto
                </button>
              </div>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileUpload} />
        </div>
      </div>
    </div>
  );
}
