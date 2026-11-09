import { synthesizePortugueseSpeech } from "../speech-synthesis";

jest.mock("server-only", () => ({}));

const liveTest = process.env.RUN_EDGE_TTS_SMOKE === "1" ? it : it.skip;

liveTest.each(["pt-BR-AntonioNeural", "pt-PT-DuarteNeural"])("generates harmless real audio with %s", async (voice) => {
  const env = { ...process.env };
  try {
    process.env.TTS_VOICE = voice;
    const audio = await synthesizePortugueseSpeech("Teste de voz em portugues. Esta e apenas uma verificacao tecnica, sem destinatario.");
    expect(audio.length).toBeGreaterThan(1000);
    console.info(`Edge TTS smoke: ${voice}, ${audio.length} MP3 bytes; no file saved or message sent.`);
  } finally {
    process.env = env;
  }
}, 35000);
