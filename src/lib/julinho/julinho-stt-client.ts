"use client";

/**
 * Gravação de áudio no browser/WebView para o fallback de ditado no servidor.
 *
 * Usa Web Audio para produzir WAV mono 16 kHz, evitando diferenças de codecs
 * entre Chrome/WebView (WebM/Opus) e Safari (MP4).
 */

export type ServerDictation = {
  /** Termina a gravação e devolve o WAV (ou null se foi cancelada). */
  stop: () => Promise<Blob | null>;
  /** Termina sem transcrever. */
  cancel: () => void;
};

export type ServerDictationOptions = {
  maxDurationMs?: number;
  onAutoStop?: () => void;
};

const TARGET_SAMPLE_RATE = 16_000;
const DEFAULT_MAX_DURATION_MS = 30_000;

export function canRecordAudio(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

export function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (!input.length || fromRate <= 0 || toRate <= 0) return new Float32Array(0);
  if (fromRate === toRate) return input;

  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(length);

  for (let i = 0; i < length; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(input.length - 1, left + 1);
    const fraction = position - left;
    output[i] = input[left] * (1 - fraction) + input[right] * fraction;
  }

  return output;
}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext;

function audioContextCtor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

async function openMicrophoneStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch {
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
}

export async function startServerDictation(
  options: ServerDictationOptions = {},
): Promise<ServerDictation> {
  if (!canRecordAudio()) {
    throw new Error("Este dispositivo não permite gravar áudio.");
  }
  const Ctor = audioContextCtor();
  if (!Ctor) {
    throw new Error("Este dispositivo não suporta gravação de áudio.");
  }

  const maxDurationMs = Math.max(
    3_000,
    Math.min(60_000, options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS),
  );

  // Criar/resumir o contexto ainda dentro do gesto do utilizador. Alguns
  // WebViews suspendem o AudioContext se for criado depois de um await.
  const context = new Ctor();
  try {
    await context.resume();
  } catch {
    // Alguns WebViews resumem no primeiro gesto; seguimos.
  }

  let stream: MediaStream;
  try {
    stream = await openMicrophoneStream();
  } catch (error) {
    void context.close().catch(() => undefined);
    throw error;
  }

  const sampleRate = context.sampleRate;
  let source: MediaStreamAudioSourceNode;
  let processor: ScriptProcessorNode;
  let mute: GainNode;

  try {
    source = context.createMediaStreamSource(stream);
    processor = context.createScriptProcessor(4096, 1, 1);
    mute = context.createGain();
    mute.gain.value = 0;

    source.connect(processor);
    processor.connect(mute);
    mute.connect(context.destination);
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    void context.close().catch(() => undefined);
    throw error;
  }

  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      // A gravação continua; se o contexto não retomar, o WAV fica vazio.
    }
  }

  const chunks: Float32Array[] = [];
  let totalSamples = 0;
  let finished = false;
  let cancelled = false;
  let stopPromise: Promise<Blob | null> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    try {
      processor.onaudioprocess = null;
      source.disconnect();
      processor.disconnect();
      mute.disconnect();
    } catch {
      // Ignorar nós já desligados.
    }
    stream.getTracks().forEach((track) => track.stop());
    void context.close().catch(() => undefined);
  };

  const finish = (): Promise<Blob | null> => {
    if (stopPromise) return stopPromise;
    finished = true;
    if (timer) clearTimeout(timer);
    cleanup();

    stopPromise = Promise.resolve().then(() => {
      if (cancelled) return null;
      if (totalSamples === 0) return null;

      const merged = new Float32Array(totalSamples);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      const resampled = resampleLinear(merged, sampleRate, TARGET_SAMPLE_RATE);
      if (resampled.length === 0) return null;
      return encodeWav(resampled, TARGET_SAMPLE_RATE);
    });

    return stopPromise;
  };

  timer = setTimeout(() => {
    if (finished) return;
    void finish().then(() => options.onAutoStop?.());
  }, maxDurationMs);

  processor.onaudioprocess = (event) => {
    if (finished) return;
    const input = event.inputBuffer.getChannelData(0);
    if (!input.length) return;
    const chunk = new Float32Array(input.length);
    chunk.set(input);
    chunks.push(chunk);
    totalSamples += chunk.length;

    if (totalSamples / sampleRate >= maxDurationMs / 1000) {
      void finish().then(() => options.onAutoStop?.());
    }
  };

  return {
    stop: finish,
    cancel: () => {
      cancelled = true;
      void finish();
    },
  };
}

export async function transcribeOnServer(audio: Blob): Promise<string> {
  const formData = new FormData();
  formData.append("audio", audio, "julinho.wav");

  const response = await fetch("/api/julinho/transcrever", {
    method: "POST",
    body: formData,
  });
  const json = (await response.json().catch(() => ({}))) as {
    text?: unknown;
    error?: unknown;
    code?: unknown;
  };

  if (!response.ok) {
    const error = typeof json.error === "string" ? json.error : "Não foi possível transcrever o áudio.";
    throw new Error(error);
  }

  const text = String(json.text ?? "").trim();
  if (!text) throw new Error("Não ouvi nada. Tenta falar mais perto do microfone.");
  return text;
}

export async function isServerSttAvailable(): Promise<boolean> {
  try {
    const response = await fetch("/api/julinho/transcrever", {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) return false;
    const json = (await response.json().catch(() => ({}))) as { available?: unknown };
    return json?.available === true;
  } catch {
    return false;
  }
}
