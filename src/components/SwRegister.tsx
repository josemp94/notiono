"use client";

import { useEffect } from "react";

/**
 * Registra el service worker (solo en producción; en dev estorba con el HMR). En Android
 * calla el aviso de Chrome para instalar la web: ahí se instala la app nativa (Ajustes).
 */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if (!/Android/i.test(navigator.userAgent)) return;
    const calla = (e: Event) => e.preventDefault();
    window.addEventListener("beforeinstallprompt", calla);
    return () => window.removeEventListener("beforeinstallprompt", calla);
  }, []);
  return null;
}
