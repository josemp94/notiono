"use client";

import { Suspense, useEffect } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { setTheme } from "@/lib/theme";

const LienzoDibujo = dynamic(() => import("@/components/dibujo/LienzoDibujo"), { ssr: false });

/** El puente que pone la app de Android en su WebView (`addJavascriptInterface`). */
type PuenteApp = { guardado: (json: string) => void; cerrar: () => void };

/**
 * `/dibujo?escena=<url>&tema=dark` — el lienzo del bloque «Dibujo» a pantalla completa,
 * para la app de Android (WebView con la cookie de su sesión). Sube los ficheros igual
 * que la web y le devuelve las URL a la app, que cambia el bloque con su operación de
 * siempre. Fuera del grupo `(app)`: sin panel ni barra.
 */
export default function PaginaDibujo() {
  return (
    <Suspense>
      <Lienzo />
    </Suspense>
  );
}

function Lienzo() {
  const q = useSearchParams();
  useEffect(() => setTheme(q.get("tema") === "dark" ? "dark" : "light"), [q]);
  const app = () => (window as unknown as { NotionoApp?: PuenteApp }).NotionoApp;
  return (
    <LienzoDibujo
      escena={q.get("escena") ?? ""}
      onGuardar={(g) => app()?.guardado(JSON.stringify(g))}
      onCerrar={() => (app() ? app()!.cerrar() : history.back())}
    />
  );
}
