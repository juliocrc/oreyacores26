"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUp, AudioLines, Loader2, Mic, MicOff, Sparkles, Square, Volume2, VolumeX, X } from "lucide-react";
import { JULINHO_SUGGESTIONS, localJulinhoFallback } from "@/lib/julinho/julinho-intents";
import JulinhoCliente from "./JulinhoCliente";
import { resolveJulinhoFollowUp, type ConversationTopic } from "@/lib/julinho/julinho-context";
import {
  canRecordAudio,
  isServerSttAvailable,
  startServerDictation,
  transcribeOnServer,
  type ServerDictation,
} from "@/lib/julinho/julinho-stt-client";

type ChatMessage = {
  id: string;
  role: "user" | "julinho";
  text: string;
  results?: SearchResult[];
};

type SearchResult = { type: string; label: string; href: string };

type SpeechRecognitionResultLike = ArrayLike<{ transcript: string }> & { isFinal?: boolean };
type SpeechRecognitionEventLike = {
  results: ArrayLike<SpeechRecognitionResultLike>;
  isFinal?: boolean;
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type JulinhoReply = {
  reply?: unknown;
  context?: { kind?: unknown; term?: unknown };
  action?: { type?: unknown; href?: unknown; label?: unknown };
  results?: unknown;
};

type TtsPending = {
  id: string;
  resolve: (result: "played" | "error" | "stopped") => void;
  timer: ReturnType<typeof setTimeout>;
};

const VOICE_STORAGE_KEY = "julinho:voice-enabled";
const JULINHO_GREETING =
  "Olá! Sou a Julia. Posso abrir páginas e consultar jangadas, stock, inspeções e faturação. Fala ou escreve o que precisas.";
const HIDDEN_PREFIXES = ["/login", "/area-cliente", "/public", "/portal-cliente", "/portal-propostas", "/verificar/certificado"];

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function speechCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

type AndroidSpeechBridge = {
  isSpeechRecognitionAvailable?: () => boolean;
  startSpeechRecognition?: (requestId: string) => void;
  stopSpeechRecognition?: () => void;
};

type AndroidBridge = AndroidSpeechBridge & {
  speakText?: (text: string, requestId: string) => void;
  stopSpeaking?: () => void;
  openAppSettings?: () => void;
};

type AndroidWindow = Window & {
  OreyAndroid?: AndroidBridge;
  __oreyTtsEvent?: (requestId: string, event: string, error: string | null) => void;
};

function androidBridge(): AndroidBridge | null {
  if (typeof window === "undefined") return null;
  return (window as AndroidWindow).OreyAndroid ?? null;
}

function androidSpeechBridge(): AndroidSpeechBridge | null {
  const bridge = androidBridge();
  return bridge && typeof bridge.startSpeechRecognition === "function" ? bridge : null;
}

function canOpenAppSettings(): boolean {
  return typeof androidBridge()?.openAppSettings === "function";
}

function openAppSettings(): void {
  try {
    androidBridge()?.openAppSettings?.();
  } catch {
    // Ignorar WebView sem bridge.
  }
}

function nativeSpeechAvailable(): boolean {
  const bridge = androidSpeechBridge();
  if (!bridge) return false;
  if (typeof bridge.isSpeechRecognitionAvailable !== "function") return true;
  try {
    return bridge.isSpeechRecognitionAvailable();
  } catch {
    return false;
  }
}

function readVoicePreference(): boolean {
  try {
    return window.localStorage.getItem(VOICE_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function recognitionErrorMessage(code?: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "O microfone está bloqueado. Autoriza o acesso nas definições do navegador.";
    case "no-speech":
      return "Não ouvi nada. Tenta falar mais perto do microfone.";
    case "audio-capture":
      return "Não encontrei um microfone disponível.";
    case "network":
      return "O ditado precisa de ligação à internet. Podes escrever o pedido.";
    case "busy":
      return "O microfone está ocupado. Tenta novamente.";
    case "client":
      return "Não consegui iniciar o microfone. Tenta novamente.";
    case "server":
      return "O serviço de voz não respondeu. Tenta novamente.";
    case "unsupported":
      return "Este dispositivo não suporta ditado por voz. Escreve o pedido.";
    case "aborted":
      return "";
    default:
      return "Não consegui ouvir. Tenta novamente ou escreve o pedido.";
  }
}

export default function JulinhoAssistant() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dictationSupported, setDictationSupported] = useState(true);
  const [serverSttAvailable, setServerSttAvailable] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const serverDictationRef = useRef<ServerDictation | null>(null);
  const serverStartTokenRef = useRef(0);
  const ttsPendingRef = useRef<TtsPending | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const greetedRef = useRef(false);
  const conversationTopic = useRef<ConversationTopic>(null);

  const hidden = HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  useEffect(() => {
    // Preferências do dispositivo só podem ser lidas depois da hidratação.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restauro da preferência de voz guardada
    setVoiceEnabled(readVoicePreference());
    const native = nativeSpeechAvailable();
    const web = !androidSpeechBridge() && speechCtor() !== null;
    setDictationSupported(native || web);
  }, []);

  useEffect(() => {
    let active = true;
    void isServerSttAvailable().then((available) => {
      if (!active) return;
      setServerSttAvailable(available);
      if (available && canRecordAudio()) {
        setDictationSupported(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const target = window as AndroidWindow;
    target.__oreyTtsEvent = (requestId, event) => {
      const pending = ttsPendingRef.current;
      if (!pending || pending.id !== requestId) return;
      if (event === "start") {
        setSpeaking(true);
        return;
      }
      if (event !== "done" && event !== "error") return;
      clearTimeout(pending.timer);
      ttsPendingRef.current = null;
      setSpeaking(false);
      pending.resolve(event === "done" ? "played" : "error");
    };
    return () => {
      delete target.__oreyTtsEvent;
    };
  }, []);

  const speakWithAndroid = useCallback(async (text: string): Promise<"played" | "error" | "unavailable" | "stopped"> => {
    const bridge = androidBridge();
    const speakText = bridge?.speakText;
    if (!speakText) return "unavailable";

    const previous = ttsPendingRef.current;
    if (previous) {
      clearTimeout(previous.timer);
      previous.resolve("stopped");
      ttsPendingRef.current = null;
    }

    const id = `tts-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    setSpeaking(true);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (ttsPendingRef.current?.id !== id) return;
        ttsPendingRef.current = null;
        setSpeaking(false);
        try {
          bridge.stopSpeaking?.();
        } catch {
          // ignorar
        }
        resolve("error");
      }, 30_000);

      ttsPendingRef.current = { id, resolve, timer };

      try {
        speakText(text, id);
      } catch {
        clearTimeout(timer);
        ttsPendingRef.current = null;
        setSpeaking(false);
        resolve("error");
      }
    });
  }, []);

  const stopSpeaking = useCallback(() => {
    const pending = ttsPendingRef.current;
    if (pending) {
      clearTimeout(pending.timer);
      ttsPendingRef.current = null;
      pending.resolve("stopped");
    }
    try {
      androidBridge()?.stopSpeaking?.();
    } catch {
      // ignorar WebView sem bridge
    }

    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!voiceEnabled || !text.trim()) return;
    stopSpeaking();

    // Offline: não esperar pelo servidor; usa imediatamente a voz nativa.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const nativeResult = await speakWithAndroid(text);
      if (nativeResult === "played" || nativeResult === "stopped") return;
    }

    const controller = new AbortController();
    ttsAbortRef.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 5_000);

    try {
      const response = await fetch("/api/julinho/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("tts unavailable");
      const blob = await response.blob();
      if (controller.signal.aborted) return;

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audioUrlRef.current = url;
      setSpeaking(true);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (audioUrlRef.current === url) audioUrlRef.current = null;
        if (audioRef.current === audio) audioRef.current = null;
        setSpeaking(false);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setSpeaking(false);
      };
      await audio.play();
      return;
    } catch {
      clearTimeout(timeout);
      if (controller.signal.aborted && !timedOut) return;
      // Sem servidor de voz (ou offline/timeout): tenta a voz nativa Android.
      const nativeResult = await speakWithAndroid(text);
      if (nativeResult === "played" || nativeResult === "stopped") return;
      // Último recurso: síntese do próprio navegador.
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setSpeaking(false);
        return;
      }
    } finally {
      clearTimeout(timeout);
      if (ttsAbortRef.current === controller) ttsAbortRef.current = null;
    }

    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "pt-PT";
      const voices = window.speechSynthesis.getVoices();
      const portuguese = voices.filter((voice) => voice.lang.toLowerCase() === "pt-pt");
      utterance.voice = portuguese.find((voice) => /raquel|female|feminina/i.test(voice.name)) || portuguese[0] || null;
      utterance.rate = 1.02;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeaking(false);
    }
  }, [speakWithAndroid, stopSpeaking, voiceEnabled]);

  const appendMessage = useCallback((role: ChatMessage["role"], text: string, results?: SearchResult[]) => {
    setMessages((prev) => [...prev, { id: newId(), role, text, results }]);
  }, []);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    const resolved = resolveJulinhoFollowUp(text, conversationTopic.current);
    conversationTopic.current = resolved.topic;

    setInput("");
    setError(null);
    appendMessage("user", text);
    setBusy(true);

    let reply = "";
    let results: SearchResult[] = [];
    try {
      const response = await fetch("/api/julinho", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: resolved.query, pathname }),
      });

      if (!response.ok) {
        if (typeof resolved.topic === "object") conversationTopic.current = null;
        const fallback = localJulinhoFallback(text);
        if (fallback) {
          reply = fallback.reply;
          if (fallback.href) router.push(fallback.href);
        } else if (response.status === 401) {
          reply = "A sessão expirou. Inicia sessão novamente para eu poder consultar os dados.";
        } else {
          reply = "Não consegui responder agora. Tenta novamente daqui a pouco.";
        }
      } else {
        const data = await response.json() as JulinhoReply;
        if (data.context && (data.context.kind === "jangada" || data.context.kind === "stock-item") && typeof data.context.term === "string" && data.context.term.length >= 2 && data.context.term.length <= 300) {
          conversationTopic.current = { kind: data.context.kind, term: data.context.term };
        } else if (typeof resolved.topic === "object") {
          conversationTopic.current = null;
        }
        if (Array.isArray(data.results)) {
          results = data.results.filter((item): item is SearchResult =>
            !!item && typeof item === "object" && typeof item.type === "string" && typeof item.label === "string" &&
            typeof item.href === "string" && /^\/(?!\/)[a-zA-Z0-9/_?=&%-]+$/.test(item.href)
          ).slice(0, 5);
        }
        reply = typeof data.reply === "string" && data.reply.trim()
          ? data.reply
          : "Não percebi esse pedido. Diz \"ajuda\" para ver o que consigo fazer.";
        const action = data.action;
        if (action && action.type === "navigate" && typeof action.href === "string" && action.href.startsWith("/")) {
          router.push(action.href);
        }
      }
    } catch {
      if (typeof resolved.topic === "object") conversationTopic.current = null;
      const fallback = localJulinhoFallback(text);
      reply = fallback?.reply ?? "Estou sem ligação ao servidor. Posso abrir páginas, mas não consultar dados agora.";
      if (fallback?.href) router.push(fallback.href);
    } finally {
      setBusy(false);
    }

    appendMessage("julinho", reply, results);
    // Search labels can contain personal or financial information; do not send
    // them to the external voice service just to read the result list aloud.
    void speak(results.length ? "Encontrei resultados. Pode consultá-los na conversa." : reply);
  }, [appendMessage, busy, pathname, router, speak]);

  const finishServerDictation = useCallback(async (controller: ServerDictation) => {
    setTranscribing(true);
    try {
      const audio = await controller.stop();
      if (!audio) {
        setError("Não foi possível gravar áudio. Verifica o microfone e tenta novamente.");
        return;
      }
      const text = await transcribeOnServer(audio);
      if (text) {
        setTranscribing(false);
        void send(text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível transcrever o áudio.");
    } finally {
      setTranscribing(false);
    }
  }, [send]);

  const stopServerDictation = useCallback((transcribe: boolean) => {
    serverStartTokenRef.current += 1;
    const controller = serverDictationRef.current;
    if (!controller) return false;
    serverDictationRef.current = null;
    setListening(false);
    if (transcribe) void finishServerDictation(controller);
    else controller.cancel();
    return true;
  }, [finishServerDictation]);

  const startServerListening = useCallback(async () => {
    if (!canRecordAudio()) {
      setError("Este dispositivo não permite gravar áudio.");
      return;
    }

    stopSpeaking();
    setError(null);
    setListening(true);

    const token = serverStartTokenRef.current + 1;
    serverStartTokenRef.current = token;

    try {
      const controller = await startServerDictation({
        onAutoStop: () => {
          stopServerDictation(true);
        },
      });
      if (serverStartTokenRef.current !== token) {
        controller.cancel();
        return;
      }
      serverDictationRef.current = controller;
    } catch (err) {
      if (serverStartTokenRef.current !== token) return;
      setListening(false);
      setError(err instanceof Error ? err.message : "Não consegui aceder ao microfone.");
    }
  }, [stopServerDictation, stopSpeaking]);

  const stopListening = useCallback(() => {
    if (stopServerDictation(true)) return;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setListening(false);
  }, [stopServerDictation]);

  const cancelListening = useCallback(() => {
    stopServerDictation(false);
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setListening(false);
  }, [stopServerDictation]);

  const startWebSpeechListening = useCallback(() => {
    const Ctor = speechCtor();
    if (!Ctor) return false;

    stopSpeaking();
    setError(null);

    let fallbackStarted = false;
    const recognition = new Ctor();
    recognition.lang = "pt-PT";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setListening(true);
      setError(null);
    };
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      const isFinal = event.isFinal ?? event.results?.[0]?.isFinal ?? true;
      if (!isFinal) {
        setInput(transcript);
        return;
      }
      setInput("");
      void send(transcript);
    };
    recognition.onerror = (event) => {
      if (event.error === "unsupported" && serverSttAvailable && canRecordAudio()) {
        fallbackStarted = true;
        recognitionRef.current = null;
        void startServerListening();
        return;
      }
      const message = recognitionErrorMessage(event.error);
      if (message) setError(message);
      setListening(false);
    };
    recognition.onend = () => {
      if (fallbackStarted) {
        recognitionRef.current = null;
        return;
      }
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      return true;
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setError("Não consegui iniciar o microfone. Tenta novamente.");
      return false;
    }
  }, [send, serverSttAvailable, startServerListening, stopSpeaking]);

  const toggleListening = useCallback(() => {
    if (listening) {
      stopListening();
      return;
    }

    stopSpeaking();
    setError(null);

    const android = androidSpeechBridge();
    if (android) {
      if (nativeSpeechAvailable() && speechCtor()) {
        startWebSpeechListening();
        return;
      }
      if (serverSttAvailable && canRecordAudio()) {
        void startServerListening();
        return;
      }
      setError("O ditado não está disponível neste tablet. Podes escrever o pedido.");
      return;
    }

    if (speechCtor()) {
      startWebSpeechListening();
      return;
    }

    if (serverSttAvailable && canRecordAudio()) {
      void startServerListening();
      return;
    }

    setError("Este dispositivo não suporta ditado por voz. Escreve o pedido.");
  }, [
    listening,
    serverSttAvailable,
    startServerListening,
    startWebSpeechListening,
    stopListening,
    stopSpeaking,
  ]);

  const openPanel = useCallback(() => {
    setOpen(true);
    if (!greetedRef.current) {
      greetedRef.current = true;
      setMessages([{
        id: newId(),
        role: "julinho",
        text: JULINHO_GREETING,
      }]);
      void speak(JULINHO_GREETING);
    }
    window.setTimeout(() => inputRef.current?.focus(), 80);
  }, [speak]);

  const closePanel = useCallback(() => {
    cancelListening();
    stopSpeaking();
    setOpen(false);
    conversationTopic.current = null;
  }, [cancelListening, stopSpeaking]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (hidden) return;
      if (event.key === "Escape") {
        if (open) closePanel();
        return;
      }
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "j") {
        event.preventDefault();
        if (open) closePanel();
        else openPanel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closePanel, hidden, open, openPanel]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy, listening, transcribing]);

  useEffect(() => () => {
    serverStartTokenRef.current += 1;
    serverDictationRef.current?.cancel();
    serverDictationRef.current = null;
    recognitionRef.current?.abort();
    if (ttsAbortRef.current) ttsAbortRef.current.abort();
    if (audioRef.current) audioRef.current.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    try {
      window.localStorage.setItem(VOICE_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // preferência apenas em memória
    }
    if (!next) stopSpeaking();
  };

  if (pathname === "/area-cliente" || pathname.startsWith("/area-cliente/")) return <JulinhoCliente />;
  if (hidden) return null;

  const hasNativeOrWebSpeech =
    nativeSpeechAvailable() ||
    (!androidSpeechBridge() && speechCtor() !== null);
  const usesServerStt = serverSttAvailable && !hasNativeOrWebSpeech;

  return (
    <div className="print:hidden">
      {!open && (
        <button
          type="button"
          onClick={openPanel}
          aria-label="Abrir a Julia, assistente de voz"
          title="Julia — assistente de voz (Ctrl+Shift+J)"
          className="fixed bottom-28 right-4 z-[90] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-900/25 transition hover:scale-105 hover:shadow-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300 sm:right-6"
        >
          <Sparkles className="h-6 w-6" aria-hidden />
          <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" aria-hidden />
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label="Julia, assistente de voz"
          className="fixed inset-x-3 bottom-28 z-[95] flex max-h-[min(76vh,calc(100dvh-8rem))] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 sm:inset-x-auto sm:right-6 sm:w-[24rem]"
        >
          <header className="flex items-center gap-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-4 py-3 text-white">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <AudioLines className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold leading-tight">Julia</p>
              <p className="truncate text-[11px] text-indigo-100">
                Assistente de voz · {listening ? "a ouvir…" : transcribing ? "a transcrever…" : busy ? "a consultar…" : speaking ? "a falar…" : "Orey Tecnica- Serviços Navais, Lda"}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleVoice}
              aria-label={voiceEnabled ? "Silenciar a Julia" : "Ativar a voz da Julia"}
              aria-pressed={voiceEnabled}
              className="rounded-xl p-2 text-white/90 transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              {voiceEnabled ? <Volume2 className="h-5 w-5" aria-hidden /> : <VolumeX className="h-5 w-5" aria-hidden />}
            </button>
            <button
              type="button"
              onClick={closePanel}
              aria-label="Fechar a Julia"
              className="rounded-xl p-2 text-white/90 transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "rounded-br-md bg-blue-600 text-white"
                      : "rounded-bl-md border border-slate-200 bg-white text-slate-700 shadow-sm"
                  }`}
                >
                  <p>{message.text}</p>
                  {message.results && message.results.length > 0 && <ul className="mt-2 space-y-1">{message.results.map((result, index) => <li key={`${result.href}-${index}`}><a href={result.href} className="block rounded-md px-2 py-1 text-xs font-semibold text-indigo-700 underline focus-visible:ring-2 focus-visible:ring-indigo-500">{result.type}: {result.label}</a></li>)}</ul>}
                </div>
              </div>
            ))}

            {messages.length <= 1 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {JULINHO_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void send(suggestion)}
                    disabled={busy}
                    className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-60"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {busy && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                A consultar os dados…
              </div>
            )}

            {listening && (
              <div className="flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-600" />
                </span>
                Estou a ouvir. Fala agora.
              </div>
            )}

            {transcribing && (
              <div className="flex items-center gap-2 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-700">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                A transcrever o áudio…
              </div>
            )}

            {error && (
              <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p>{error}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {dictationSupported && !busy && !transcribing && (
                    <button
                      type="button"
                      onClick={toggleListening}
                      className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] font-bold text-amber-800 transition-colors hover:bg-amber-100"
                    >
                      Tentar novamente
                    </button>
                  )}
                  {canOpenAppSettings() && (
                    <button
                      type="button"
                      onClick={openAppSettings}
                      className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] font-bold text-amber-800 transition-colors hover:bg-amber-100"
                    >
                      Permissões
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <form
            className="flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <button
              type="button"
              onClick={toggleListening}
              disabled={busy || transcribing}
              aria-label={listening ? "Parar de ouvir" : "Falar com a Julia"}
              aria-pressed={listening}
              aria-busy={transcribing}
              title={dictationSupported ? "Falar" : "Ditado não suportado neste dispositivo"}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-wait disabled:opacity-60 ${
                listening
                  ? "bg-rose-600 text-white hover:bg-rose-700"
                  : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              }`}
            >
              {transcribing ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : listening ? (
                <MicOff className="h-5 w-5" aria-hidden />
              ) : (
                <Mic className="h-5 w-5" aria-hidden />
              )}
            </button>

            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={listening ? "A ouvir…" : transcribing ? "A transcrever…" : "Escreve ou fala com a Julia"}
              aria-label="Mensagem para a Julia"
              maxLength={600}
              disabled={busy || transcribing || listening}
              className="min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-70"
            />

            {speaking ? (
              <button
                type="button"
                onClick={stopSpeaking}
                aria-label="Parar de falar"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                <Square className="h-4 w-4" aria-hidden />
              </button>
            ) : (
              <button
                type="submit"
                disabled={busy || transcribing || listening || !input.trim()}
                aria-label="Enviar mensagem"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                <ArrowUp className="h-5 w-5" aria-hidden />
              </button>
            )}
          </form>
          {usesServerStt && (
            <p className="border-t border-slate-100 px-4 pb-2 pt-1 text-[10px] leading-relaxed text-slate-400">
              O ditado neste dispositivo é transcrito no servidor. O áudio é enviado para transcrição e não é guardado pela aplicação.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
