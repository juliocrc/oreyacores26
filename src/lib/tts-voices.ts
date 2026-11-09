export const TTS_VOICES = [
  "pt-PT-RaquelNeural", "pt-PT-DuarteNeural", "pt-BR-AntonioNeural",
  "pt-BR-FranciscaNeural", "pt-BR-ThalitaNeural", "pt-BR-DanielNeural",
  "pt-BR-BrendaNeural", "pt-BR-DonatoNeural", "pt-BR-ElzaNeural",
  "pt-BR-FabioNeural", "pt-BR-GiovannaNeural", "pt-BR-HumbertoNeural",
  "pt-BR-JulioNeural", "pt-BR-LeandroNeural", "pt-BR-LiviaNeural",
  "pt-BR-ManuelaNeural", "pt-BR-MauroNeural", "pt-BR-NicolauNeural",
  "pt-BR-ValerioNeural", "pt-BR-YaraNeural",
] as const;

export function isTtsVoice(voice: unknown): voice is typeof TTS_VOICES[number] {
  return typeof voice === "string" && (TTS_VOICES as readonly string[]).includes(voice);
}
