export function resolveLoginCallback(raw: string | null | undefined) {
  if (!raw || !raw.startsWith("/") || /[\\\u0000-\u0020]/.test(raw)) return "/";
  try {
    const url = new URL(raw, "https://login.invalid");
    if (url.origin !== "https://login.invalid") return "/";
    if (/^\/(login|selecionar-tecnico)(\/|$)/i.test(url.pathname)) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
