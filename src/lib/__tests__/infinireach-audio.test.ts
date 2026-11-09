import { sendInfinireachWhatsAppAudio } from "../infinireach-sms";

const env = { ...process.env };
const audio = Buffer.from([0xff, 0xf3, 0x64, 0, 1, 2]);
const mediaUrl = "https://api.infinireach.io/api/media/voice.mp3?signature=private-signed-token";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});

describe("InfiniReach WhatsApp audio", () => {
  let fetchMock: jest.SpyInstance;
  let warn: jest.SpyInstance;
  beforeEach(() => {
    process.env.INFINIREACH_API_KEY = "private-api-key";
    process.env.INFINIREACH_FROM = "OreyAzores";
    fetchMock = jest.spyOn(global, "fetch")
      .mockResolvedValueOnce(json({ success: true, url: mediaUrl }))
      .mockResolvedValueOnce(json({ success: true, messageId: "msg-123", queued: true }));
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it.each(["INFINIREACH_API_KEY", "INFINIREACH_FROM"])("requires %s without network", async (name) => {
    process.env = { ...process.env, [name]: "" };
    expect(await sendInfinireachWhatsAppAudio("912345678", audio, "orey-1")).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid", audio, "orey-1"],
    ["912345678", Buffer.alloc(0), "orey-1"],
    ["912345678", Buffer.alloc(10 * 1024 * 1024 + 1), "orey-1"],
    ["912345678", audio, ""],
    ["912345678", audio, "x".repeat(129)],
    ["912345678", audio, "id\nsecret"],
  ])("rejects invalid arguments without network", async (phone, bytes, id) => {
    expect(await sendInfinireachWhatsAppAudio(phone, bytes, id)).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploads multipart then sends exactly the audio payload, returning pending not delivered", async () => {
    const result = await sendInfinireachWhatsAppAudio("912345678", audio, "orey-1");
    expect(result).toEqual({ ok: true, providerId: "msg-123", status: "pendente" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [uploadUrl, upload] = fetchMock.mock.calls[0];
    expect(uploadUrl).toBe("https://api.infinireach.io/api/v1/media");
    expect(upload).toMatchObject({ method: "POST", redirect: "error", headers: { "X-API-Key": "private-api-key" } });
    expect(upload.headers).not.toHaveProperty("Content-Type");
    const form = upload.body as FormData;
    expect([...form.keys()]).toEqual(["file"]);
    const file = form.get("file") as File;
    expect(file.name).toBe("voice.mp3");
    expect(file.type).toBe("audio/mpeg");
    expect(Buffer.from(await file.arrayBuffer())).toEqual(audio);
    const [sendUrl, send] = fetchMock.mock.calls[1];
    expect(sendUrl).toBe("https://api.infinireach.io/api/v1/messages");
    expect(send).toMatchObject({ method: "POST", redirect: "error", headers: {
      "Content-Type": "application/json", "X-API-Key": "private-api-key",
    } });
    expect(JSON.parse(send.body)).toEqual({
      to: "+351912345678", from: "OreyAzores", channel: "whatsapp", mediaUrl,
      mediaType: "audio/mpeg", externalId: "orey-1",
    });
    expect(JSON.stringify(result)).not.toContain("private-");
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    "http://api.infinireach.io/api/media/a",
    "https://evil.test/api/media/a",
    "https://api.infinireach.io.evil.test/api/media/a",
    "https://user:pass@api.infinireach.io/api/media/a",
    "https://api.infinireach.io:444/api/media/a",
    "https://api.infinireach.io/api/v1/media/a",
    "https://api.infinireach.io/api/media/",
    "https://api.infinireach.io/api/media/../secret",
    "not a URL",
  ])("never sends an untrusted upload URL: %s", async (url) => {
    fetchMock.mockReset().mockResolvedValueOnce(json({ success: true, url }));
    const result = await sendInfinireachWhatsAppAudio("912345678", audio, "orey-1");
    expect(result.ok).toBe(false);
    expect(result.uncertain).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    () => json({ success: false, message: "private-api-key" }),
    () => json({ success: true }),
    () => new Response("private-api-key provider body", { status: 413 }),
    () => new Response("not JSON"),
  ])("does not send after an upload failure", async (response) => {
    fetchMock.mockReset().mockResolvedValueOnce(response());
    const result = await sendInfinireachWhatsAppAudio("912345678", audio, "orey-1");
    expect(result.ok).toBe(false);
    expect(result.uncertain).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("private-");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    () => new Response("private-api-key nonJSON"),
    () => json({ success: true, queued: true }),
    () => json({ success: true, messageId: "msg-1", queued: false }),
    () => json({ success: true, messageId: mediaUrl, queued: true }),
    () => json({}, 503),
  ])("marks ambiguous message responses uncertain without leaking data", async (response) => {
    fetchMock.mockReset().mockResolvedValueOnce(json({ success: true, url: mediaUrl }))
      .mockResolvedValueOnce(response());
    const result = await sendInfinireachWhatsAppAudio("912345678", audio, "orey-1");
    expect(result).toMatchObject({ ok: false, uncertain: true, error: expect.stringContaining("check provider logs") });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify([result, warn.mock.calls])).not.toMatch(/private-|signature=/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns only a safe rejection status, not provider text or codes", async () => {
    fetchMock.mockReset().mockResolvedValueOnce(json({ success: true, url: mediaUrl }))
      .mockResolvedValueOnce(json({ success: false, code: "private-api-key", message: mediaUrl }, 422));
    expect(await sendInfinireachWhatsAppAudio("912345678", audio, "orey-1")).toEqual({
      ok: false, error: "InfiniReach message rejected (HTTP 422).",
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([false, true])("handles timeout with messageStarted=%s, with no retry", async (messageStarted) => {
    jest.useFakeTimers();
    fetchMock.mockReset();
    if (messageStarted) fetchMock.mockResolvedValueOnce(json({ success: true, url: mediaUrl }));
    fetchMock.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("private-api-key")));
    }));
    const pending = sendInfinireachWhatsAppAudio("912345678", audio, "orey-1");
    await jest.advanceTimersByTimeAsync(30_000);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.uncertain).toBe(messageStarted ? true : undefined);
    expect(fetchMock).toHaveBeenCalledTimes(messageStarted ? 2 : 1);
    expect(JSON.stringify([result, warn.mock.calls])).not.toContain("private-");
  });
});
