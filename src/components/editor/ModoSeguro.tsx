"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { lineasDe } from "@/lib/diff";

/**
 * Que una página rota no deje la app inservible. Dos casos:
 *
 * - **Se cuelga** (un bucle en el editor bloquea la pestaña): mientras la página
 *   está abierta y a la vista hay una marca en localStorage con un latido; al
 *   cerrarla, cambiar de página o pasar a segundo plano se borra. Una pestaña
 *   colgada no puede borrarla, así que si al volver a entrar sigue ahí y el
 *   latido se paró hace poco, la página se abre en modo seguro: su texto, sin
 *   editor, y un botón para abrir el editor igualmente.
 * - **Revienta al pintar** (un bloque que el editor no sabe mostrar): el error
 *   lo para una barrera de React y se enseña lo mismo, en vez de la pantalla
 *   de error de toda la app.
 */

const LATIDO_MS = 5_000;
// Más reciente que esto: puede ser otra pestaña viva con la misma página.
const OTRA_PESTANA_MS = 2 * LATIDO_MS;
// Más antiguo: un cierre raro de hace horas, no un cuelgue que se repite.
const CADUCA_MS = 60 * 60_000;

const clave = (pageId: string) => `notiono:abierta:${pageId}`;

function leer(pageId: string): number | null {
  try {
    const v = Number(localStorage.getItem(clave(pageId)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function escribir(pageId: string, valor: number | null) {
  try {
    if (valor === null) localStorage.removeItem(clave(pageId));
    else localStorage.setItem(clave(pageId), String(valor));
  } catch {
    // Sin localStorage (modo privado estricto): sin detección, el editor va igual.
  }
}

/** ¿La última vez que se abrió esta página se quedó colgada? */
export function seColgo(pageId: string, ahora = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  const latido = leer(pageId);
  if (latido === null) return false;
  const edad = ahora - latido;
  return edad > OTRA_PESTANA_MS && edad < CADUCA_MS;
}

/** Marca la página como abierta mientras el componente vive y la pestaña está a la vista. */
function useMarcaAbierta(pageId: string, activa: boolean) {
  useEffect(() => {
    if (!activa) return;
    const late = () => {
      if (document.visibilityState === "visible") escribir(pageId, Date.now());
    };
    const alCambiar = () => (document.visibilityState === "visible" ? late() : escribir(pageId, null));
    const alSalir = () => escribir(pageId, null);
    late();
    const t = setInterval(late, LATIDO_MS);
    document.addEventListener("visibilitychange", alCambiar);
    window.addEventListener("pagehide", alSalir);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", alCambiar);
      window.removeEventListener("pagehide", alSalir);
      escribir(pageId, null);
    };
  }, [pageId, activa]);
}

class Barrera extends Component<{ onError: (e: unknown) => void; children: ReactNode }, { roto: boolean }> {
  state = { roto: false };
  static getDerivedStateFromError() {
    return { roto: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[notiono] el editor no pudo pintar la página", error);
    this.props.onError(error);
  }
  render() {
    return this.state.roto ? null : this.props.children;
  }
}

/**
 * Envuelve el editor de una página (montar con `key` por página). Si la página
 * se colgó la última vez o el editor revienta, enseña el modo seguro.
 */
export function EditorProtegido({
  pageId,
  content,
  children,
}: {
  pageId: string;
  content: unknown;
  children: ReactNode;
}) {
  const [motivo, setMotivo] = useState<"colgada" | "error" | null>(() => (seColgo(pageId) ? "colgada" : null));
  // Cada «Abrir el editor» monta la barrera de cero (si no, seguiría rota).
  const [intento, setIntento] = useState(0);
  useMarcaAbierta(pageId, motivo === null);

  if (motivo) {
    return (
      <VistaSegura
        motivo={motivo}
        content={content}
        onAbrir={() => {
          escribir(pageId, null);
          setIntento((n) => n + 1);
          setMotivo(null);
        }}
      />
    );
  }
  return (
    <Barrera key={intento} onError={() => setMotivo("error")}>
      {children}
    </Barrera>
  );
}

function VistaSegura({
  motivo,
  content,
  onAbrir,
}: {
  motivo: "colgada" | "error";
  content: unknown;
  onAbrir: () => void;
}) {
  const lineas = lineasDe(content);
  return (
    <div className="mx-auto max-w-3xl px-4 pb-6 pt-8 md:px-12 md:pt-20">
      <div className="mb-6 flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--hover)] p-4 text-sm">
        <TriangleAlert size={18} className="mt-0.5 shrink-0 text-brand" />
        <div className="min-w-0">
          <p className="font-medium">
            {motivo === "colgada"
              ? "La última vez esta página se quedó bloqueada."
              : "Esta página tiene algo que el editor no ha podido mostrar."}
          </p>
          <p className="mt-1 text-[var(--muted)]">
            Para que no vuelva a bloquear la app te enseño su texto sin el editor. No se ha perdido nada.
          </p>
          <button onClick={onAbrir} className="mt-3 rounded-lg bg-brand px-3 py-1.5 font-medium text-white">
            Abrir el editor igualmente
          </button>
        </div>
      </div>
      <div className="space-y-1 whitespace-pre-wrap text-[15px]">
        {lineas.length ? lineas.map((l, i) => <p key={i}>{l || " "}</p>) : <p className="text-[var(--muted)]">Página vacía.</p>}
      </div>
    </div>
  );
}
