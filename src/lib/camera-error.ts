export function getCameraErrorMessage(error: unknown): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "A câmara só funciona em HTTPS ou localhost. Abra a aplicação pelo endereço seguro.";
  }
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "Este navegador não suporta acesso à câmara. Use uma versão atualizada do Chrome ou Safari.";
  }

  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Permissão da câmara negada. Autorize a câmara nas definições do navegador e recarregue a página.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Não foi encontrada uma câmara neste dispositivo.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "A câmara está a ser usada por outra aplicação. Feche essa aplicação e tente novamente.";
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/permission|denied|notallowed/i.test(message)) {
    return "Permissão da câmara negada. Autorize a câmara nas definições do navegador e recarregue a página.";
  }

  return "Não foi possível aceder à câmara. Verifique as permissões do navegador.";
}
