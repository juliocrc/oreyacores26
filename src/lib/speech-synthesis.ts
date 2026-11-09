import "server-only";
import { randomBytes } from "node:crypto";
import WebSocket, { type RawData } from "ws";
import { edgeTtsSignature } from "./edge-tts-signature";
import { isTtsVoice } from "./tts-voices";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
// Public Edge Read Aloud protocol identifier, not an Azure subscription key.
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_VERSION = "143.0.3650.75";
function speechConfig(selectedVoice?: string) {
  const voice = selectedVoice ?? (process.env.TTS_VOICE ?? "pt-BR-AntonioNeural").trim();
  return isTtsVoice(voice) ? { voice } : null;
}

export function isSpeechConfigured(): boolean {
  return speechConfig() !== null;
}

export async function synthesizePortugueseSpeech(text: string, voice?: string, signal?: AbortSignal): Promise<Buffer> {
  const config = speechConfig(voice);
  if (!config) throw new Error("Edge TTS voice is not configured correctly.");
  if (typeof text !== "string" || !text.trim() || text.length > 1500 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text)) {
    throw new Error("Speech text must contain 1 to 1500 valid characters.");
  }
  const escaped = text.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  })[char]!);
  const lang = config.voice.startsWith("pt-BR") ? "pt-BR" : "pt-PT";
  try {
    const signature = edgeTtsSignature(TRUSTED_CLIENT_TOKEN);
    const requestId = randomBytes(16).toString("hex");
    const url = new URL("wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1");
    url.search = new URLSearchParams({
      TrustedClientToken: TRUSTED_CLIENT_TOKEN,
      "Sec-MS-GEC": signature,
      "Sec-MS-GEC-Version": `2-${EDGE_VERSION}`,
      ConnectionId: requestId,
    }).toString();
    const audio = await new Promise<Buffer>((resolve, reject) => {
      let socket: WebSocket | undefined;
      let settled = false;
      const chunks: Buffer[] = [];
      let size = 0;
      let wireBytes = 0;
      let messages = 0;
      const timer = setTimeout(() => finish(false), 30_000);
      const abort = () => finish(false);

      function finish(success: boolean) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        socket?.removeAllListeners("message");
        socket?.removeAllListeners("open");
        socket?.removeAllListeners("close");
        // terminate, not close: a non-cooperative peer must not outlive the deadline.
        // Keep the error handler for asynchronous errors from aborting a handshake.
        socket?.terminate();
        if (success) resolve(Buffer.concat(chunks, size));
        else reject(new Error("synthesis failed"));
        chunks.length = 0;
      }

      try {
        if (signal?.aborted) return finish(false);
        signal?.addEventListener("abort", abort, { once: true });
        socket = new WebSocket(url, {
          handshakeTimeout: 30_000,
          maxPayload: 64 * 1024,
          perMessageDeflate: false,
          followRedirects: false,
          headers: {
            Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
            Cookie: `MUID=${randomBytes(16).toString("hex").toUpperCase()}`,
          },
        });
        socket.on("error", () => finish(false));
        socket.on("close", () => finish(false));
        socket.on("open", () => {
          try {
            const timestamp = new Date().toUTCString();
            socket!.send(`X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify({
              context: { synthesis: { audio: {
                metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
              } } },
            })}\r\n`, (error) => { if (error) finish(false); });
            if (settled) return;
            socket!.send(`X-RequestId:${requestId}\r\nX-Timestamp:${timestamp}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${config.voice}"><prosody rate="+0%" pitch="+0Hz" volume="+0%">${escaped}</prosody></voice></speak>`,
              (error) => { if (error) finish(false); });
          } catch {
            finish(false);
          }
        });
        socket.on("message", (raw: RawData, binary: boolean) => {
          if (settled) return;
          try {
            const data = Buffer.isBuffer(raw) ? raw : Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw);
            wireBytes += data.length;
            messages++;
            if (messages > 4096 || data.length > 64 * 1024 || wireBytes > 12 * 1024 * 1024) throw new Error("message too large");
            const headerLength = binary ? (data.length >= 2 ? data.readUInt16BE(0) : -1) : data.indexOf("\r\n\r\n");
            const start = binary ? 2 : 0;
            if (headerLength < 0 || start + headerLength > data.length) throw new Error("invalid headers");
            const headers = new Map(data.toString("utf8", start, start + headerLength).split("\r\n").map((line) => {
              const colon = line.indexOf(":");
              return [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()];
            }));
            const path = headers.get("path");
            if (binary) {
              const bytes = data.subarray(start + headerLength);
              if (path !== "audio" || (headers.get("content-type") !== "audio/mpeg" && bytes.length > 0)) throw new Error("invalid audio");
              size += bytes.length;
              if (size > MAX_AUDIO_BYTES) throw new Error("audio too large");
              if (bytes.length) chunks.push(Buffer.from(bytes));
            } else if (path === "turn.end") {
              finish(true);
            } else if (!["turn.start", "response", "audio.metadata"].includes(path || "")) {
              throw new Error("invalid response");
            }
          } catch {
            finish(false);
          }
        });
      } catch {
        finish(false);
      }
    });
    const id3 = audio.length >= 10 && audio.toString("ascii", 0, 3) === "ID3" &&
      audio[3] >= 2 && audio[3] <= 4 && audio.subarray(6, 10).every((byte) => byte < 128);
    const frame = audio.length >= 4 && audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0 &&
      (audio[1] & 0x18) !== 0x08 && (audio[1] & 0x06) === 0x02 &&
      (audio[2] & 0xf0) !== 0 && (audio[2] & 0xf0) !== 0xf0 && (audio[2] & 0x0c) !== 0x0c;
    if (!id3 && !frame) throw new Error("invalid MP3");
    return audio;
  } catch {
    throw new Error("Edge TTS synthesis failed or returned invalid audio.");
  }
}
