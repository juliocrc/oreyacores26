// Legacy kiosk shortcuts are opt-in and never valid in a deployed runtime.
export function isLocalAuthBypassEnabled() {
  if (process.env.AUTH_BYPASS !== "true") return false;
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") return false;
  if (process.env.VERCEL || process.env.VERCEL_ENV || process.env.VERCEL_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.RENDER || process.env.RENDER_EXTERNAL_URL) return false;

  const urls = [process.env.AUTH_URL, process.env.NEXTAUTH_URL].filter(Boolean);
  if (!urls.length) return false;
  return urls.every((raw) => {
    try {
      const url = new URL(raw!);
      return (url.protocol === "http:" || url.protocol === "https:") &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && !url.username && !url.password;
    } catch {
      return false;
    }
  });
}
