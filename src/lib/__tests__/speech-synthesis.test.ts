import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { isSpeechConfigured, synthesizePortugueseSpeech } from "../speech-synthesis";
import { edgeTtsSignature } from "../edge-tts-signature";

jest.mock("server-only", () => ({}));
jest.mock("ws", () => ({ __esModule: true, default: jest.fn() }));

const mp3 = Buffer.from([0xff, 0xf3, 0x64, 0x00, 1, 2, 3, 4]);
const env = { ...process.env };
const constructor = jest.mocked(WebSocket);
let socket: EventEmitter & { send: jest.Mock; terminate: jest.Mock };

function audio(bytes = mp3, type = "audio/mpeg", path = "audio") {
  const headers = Buffer.from(`X-RequestId:test\r\nContent-Type:${type}\r\nPath:${path}\r\n`);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(headers.length);
  socket.emit("message", Buffer.concat([length, headers, bytes]), true);
}

function end() {
  socket.emit("message", Buffer.from("X-RequestId:test\r\nPath:turn.end\r\n\r\n"), false);
}

describe("Edge Portuguese speech", () => {
  beforeEach(() => {
    delete process.env.TTS_VOICE;
    delete process.env.AZURE_SPEECH_KEY;
    delete process.env.AZURE_SPEECH_REGION;
    socket = Object.assign(new EventEmitter(), { send: jest.fn(), terminate: jest.fn() });
    constructor.mockImplementation(() => socket as unknown as WebSocket);
  });
  afterEach(() => {
    process.env = { ...env };
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it("keeps the GEC v2 signing regression vector stable", () => {
    expect(edgeTtsSignature("6A5AA1D4EAFF4E9FB37E23D68491D6F4", 0)).toBe(
      "52BC7A17B50DFEC9-28C4394775C8751CD2F6859C030C06DB1489ACAB3B3A7651831FC26895177ED6",
    );
  });

  it("signs five-minute Windows FILETIME buckets", () => {
    const token = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    expect(edgeTtsSignature(token, 299999)).toBe(edgeTtsSignature(token, 0));
    expect(edgeTtsSignature(token, 300000)).not.toBe(edgeTtsSignature(token, 0));
  });

  it.each(["", "invalid-voice", "en-US-AriaNeural", 'pt-BR-AntonioNeural\r\nInjected:x', '"><audio src="https://evil.test"/>'])(
    "rejects invalid voices before network: %j", async (voice) => {
      process.env.TTS_VOICE = voice;
      expect(isSpeechConfigured()).toBe(false);
      await expect(synthesizePortugueseSpeech("Teste")).rejects.toThrow("configured");
      expect(constructor).not.toHaveBeenCalled();
    },
  );

  it.each(["", "  ", "x".repeat(1501), "invalid\u0000", "invalid\ud800", "invalid\udc00", null])(
    "rejects invalid text before network: %j", async (text) => {
      await expect(synthesizePortugueseSpeech(text as string)).rejects.toThrow("1500");
      expect(constructor).not.toHaveBeenCalled();
    },
  );

  it("needs no key, signs the fixed Edge endpoint and sends only the escaped text", async () => {
    expect(isSpeechConfigured()).toBe(true);
    const result = synthesizePortugueseSpeech('<audio src="evil">&\'</audio>');
    const [url, options] = constructor.mock.calls[0];
    const endpoint = new URL(String(url));
    expect(endpoint.origin).toBe("wss://speech.platform.bing.com");
    expect(endpoint.pathname).toBe("/consumer/speech/synthesize/readaloud/edge/v1");
    expect(endpoint.searchParams.get("Sec-MS-GEC")).toMatch(/^[A-F0-9]{16}-[A-F0-9]{64}$/);
    expect(endpoint.searchParams.get("Sec-MS-GEC-Version")).toBe("2-143.0.3650.75");
    expect(endpoint.searchParams.get("ConnectionId")).toMatch(/^[a-f0-9]{32}$/);
    expect(options).toMatchObject({ handshakeTimeout: 30000, maxPayload: 65536, perMessageDeflate: false, followRedirects: false });
    socket.emit("open");
    expect(socket.send.mock.calls[0][0]).toContain('"outputFormat":"audio-24khz-48kbitrate-mono-mp3"');
    const ssml = socket.send.mock.calls[1][0];
    expect(ssml).toContain('xml:lang="pt-BR"');
    expect(ssml).toContain('name="pt-BR-AntonioNeural"');
    expect(ssml).not.toContain("Esta mensagem usa uma voz sintética");
    expect(ssml).toContain("&lt;audio src=&quot;evil&quot;&gt;&amp;&apos;&lt;/audio&gt;");
    expect(ssml).not.toContain("<audio");
    audio();
    end();
    await expect(result).resolves.toEqual(mp3);
    expect(socket.terminate).toHaveBeenCalledTimes(1);
    expect(socket.listenerCount("message")).toBe(0);
  });

  it("uses an explicitly selected Portuguese voice instead of the default", async () => {
    const result = synthesizePortugueseSpeech("Mensagem de teste", "pt-PT-DuarteNeural");
    socket.emit("open");
    expect(socket.send.mock.calls[1][0]).toContain('xml:lang="pt-PT"');
    expect(socket.send.mock.calls[1][0]).toContain('name="pt-PT-DuarteNeural"');
    audio();
    end();
    await expect(result).resolves.toEqual(mp3);
  });

  it("terminates generation when an obsolete preview is aborted", async () => {
    const controller = new AbortController();
    const result = synthesizePortugueseSpeech("Mensagem de teste", "pt-BR-AntonioNeural", controller.signal);
    controller.abort();
    await expect(result).rejects.toThrow("synthesis failed");
    expect(socket.terminate).toHaveBeenCalledTimes(1);
  });

  it("supports pt-PT, the 1500-character limit and plausible ID3 audio", async () => {
    process.env.TTS_VOICE = "pt-PT-DuarteNeural";
    const result = synthesizePortugueseSpeech("x".repeat(1500));
    socket.emit("open");
    expect(socket.send.mock.calls[1][0]).toContain('xml:lang="pt-PT"');
    expect(socket.send.mock.calls[1][0]).toContain('name="pt-PT-DuarteNeural"');
    const id3 = Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]);
    audio(id3);
    end();
    await expect(result).resolves.toEqual(id3);
  });

  it.each([Buffer.alloc(0), Buffer.from("not an mp3"), Buffer.from([0xff, 0xff, 0xff, 0xff])])(
    "rejects invalid or empty MP3", async (bytes) => {
      const result = synthesizePortugueseSpeech("Teste");
      audio(bytes);
      end();
      await expect(result).rejects.toThrow("invalid audio");
      expect(socket.terminate).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["application/json", "text/html"])("rejects non-MP3 content type %s immediately", async (type) => {
    const result = synthesizePortugueseSpeech("Teste");
    audio(mp3, type);
    await expect(result).rejects.toThrow("invalid audio");
    expect(socket.terminate).toHaveBeenCalledTimes(1);
  });

  it("bounds accumulated audio without an intermediate unbounded provider queue", async () => {
    const result = synthesizePortugueseSpeech("Teste");
    const bytes = Buffer.alloc(60 * 1024);
    for (let index = 0; index < 171; index++) audio(bytes);
    await expect(result).rejects.toThrow("invalid audio");
    expect(socket.terminate).toHaveBeenCalledTimes(1);
    expect(socket.listenerCount("message")).toBe(0);
  });

  it("accepts exactly 10 MiB", async () => {
    const result = synthesizePortugueseSpeech("Teste");
    audio(mp3);
    let remaining = 10 * 1024 * 1024 - mp3.length;
    while (remaining > 0) {
      const count = Math.min(60 * 1024, remaining);
      audio(Buffer.alloc(count));
      remaining -= count;
    }
    end();
    await expect(result).resolves.toHaveLength(10 * 1024 * 1024);
  });

  it("bounds non-audio protocol traffic too", async () => {
    const result = synthesizePortugueseSpeech("Teste");
    const data = Buffer.from(`Path:audio.metadata\r\n\r\n${"x".repeat(60 * 1024)}`);
    for (let index = 0; index < 205; index++) socket.emit("message", data, false);
    await expect(result).rejects.toThrow("invalid audio");
    expect(socket.terminate).toHaveBeenCalledTimes(1);
  });

  it("bounds the number of tiny messages and retained chunks", async () => {
    const result = synthesizePortugueseSpeech("Teste");
    for (let index = 0; index < 4097; index++) audio(Buffer.from([1]));
    await expect(result).rejects.toThrow("invalid audio");
    expect(socket.terminate).toHaveBeenCalledTimes(1);
  });

  it.each([
    [Buffer.alloc(65537), true],
    [Buffer.from([0xff]), true],
    [Buffer.from([0xff, 0xff]), true],
    [Buffer.from("no header delimiter"), false],
    [Buffer.from("Path:unknown\r\n\r\n"), false],
  ])("rejects oversized or malformed frames", async (data, binary) => {
    const result = synthesizePortugueseSpeech("Teste");
    socket.emit("message", data, binary);
    await expect(result).rejects.toThrow("invalid audio");
    expect(socket.terminate).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("terminates a stalled socket, including during streaming (%s)", async (streaming) => {
    jest.useFakeTimers();
    const result = expect(synthesizePortugueseSpeech("Teste")).rejects.toThrow("synthesis failed");
    if (streaming) { socket.emit("open"); audio(); }
    await jest.advanceTimersByTimeAsync(30000);
    await result;
    expect(socket.terminate).toHaveBeenCalledTimes(1);
    expect(socket.listenerCount("message")).toBe(0);
    expect(socket.listenerCount("open")).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
    // Aborting an in-progress handshake can emit an asynchronous error.
    expect(() => socket.emit("error", new Error("late handshake error"))).not.toThrow();
  });

  it.each(["close", "error"])("fails closed on %s, without exposing provider details", async (event) => {
    const result = synthesizePortugueseSpeech("Teste");
    audio();
    socket.emit(event, new Error("secret provider details"));
    await expect(result).rejects.toThrow(/^Edge TTS synthesis failed or returned invalid audio\.$/);
    expect(socket.terminate).toHaveBeenCalledTimes(1);
  });

  it("cleans up constructor and send failures", async () => {
    jest.useFakeTimers();
    constructor.mockImplementationOnce(() => { throw new Error("private details"); });
    await expect(synthesizePortugueseSpeech("Teste")).rejects.toThrow("synthesis failed");
    expect(jest.getTimerCount()).toBe(0);
    socket.send.mockImplementation((_data, callback) => callback(new Error("private details")));
    const result = synthesizePortugueseSpeech("Teste");
    socket.emit("open");
    await expect(result).rejects.toThrow("synthesis failed");
    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(socket.terminate).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("cleans up synchronous send failures", async () => {
    socket.send.mockImplementation(() => { throw new Error("private provider details"); });
    const result = synthesizePortugueseSpeech("Teste");
    expect(() => socket.emit("open")).not.toThrow();
    await expect(result).rejects.toThrow("synthesis failed");
    expect(socket.terminate).toHaveBeenCalledTimes(1);
  });
});
