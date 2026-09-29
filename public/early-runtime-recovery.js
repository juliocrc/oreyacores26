(() => {
  if (typeof window === "undefined") return;

  const recoveryFlag = "runtime-chunk-recovery";

  const getMessage = (reason) => {
    if (reason instanceof Error) return reason.message || "";
    if (typeof reason === "string") return reason;
    if (reason && typeof reason === "object" && "message" in reason) {
      return String(reason.message || "");
    }
    return "";
  };

  const isChunkLoadRelatedError = (reason) => {
    const normalized = getMessage(reason).toLowerCase();
    return normalized.includes("chunkloaderror")
      || normalized.includes("loading chunk")
      || normalized.includes("failed to fetch dynamically imported module")
      || (normalized.includes("_next/static/chunks") && normalized.includes("timeout"));
  };

  const clearRecoveryFlag = () => {
    try {
      window.sessionStorage.removeItem(recoveryFlag);
    } catch {
      // ignore storage failures
    }
  };

  const tryRecover = () => {
    let alreadyRecovered = false;

    try {
      alreadyRecovered = window.sessionStorage.getItem(recoveryFlag) === "1";
      if (!alreadyRecovered) {
        window.sessionStorage.setItem(recoveryFlag, "1");
      }
    } catch {
      // ignore storage failures and still attempt a one-time reload
    }

    if (alreadyRecovered) return;

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("__chunk-reload", String(Date.now()));
    window.location.replace(nextUrl.toString());
  };

  window.addEventListener("load", clearRecoveryFlag, { once: true });
  window.addEventListener("pageshow", clearRecoveryFlag, { once: true });

  window.addEventListener("error", (event) => {
    if (isChunkLoadRelatedError(event.error || event.message)) {
      tryRecover();
    }
  }, true);

  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadRelatedError(event.reason)) {
      event.preventDefault();
      tryRecover();
    }
  }, true);
})();
