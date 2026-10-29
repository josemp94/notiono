"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, MainMenu, exportToCanvas, getSceneVersion, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { Brush, Check, Grid3x3, Highlighter, Loader2, Pen, Pencil, X } from "lucide-react";
import { useTheme } from "@/lib/theme";
import {
  AMARILLO_SUBRAYADOR,
  cssFondo,
  FONDOS,
  fondoDe,
  pintaFondo,
  PLUMAS,
  textoDeEscena,
  type EscenaGuardada,
  type Fondo,
  type Pluma,
} from "@/lib/dibujo";

/** Lo que devuelve el lienzo al guardar: URL de la escena (JSON) y de la vista previa (PNG). Vacío = sin trazos. */
export type DibujoGuardado = { escena: string; imagen: string; texto: string };

// Las fuentes de Excalidraw se sirven desde la propia app (public/excalidraw), no desde su CDN.
if (typeof window !== "undefined") (window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = "/excalidraw/";

const ICONOS: Record<Pluma, React.ReactNode> = {
  boligrafo: <Pen size={18} strokeWidth={1.75} />,
  lapiz: <Pencil size={18} strokeWidth={1.75} />,
  rotulador: <Brush size={18} strokeWidth={1.75} />,
  subrayador: <Highlighter size={18} strokeWidth={1.75} />,
};
const TINTAS_ESCRIBIR = /^#(000000|1e1e1e|343a40|495057|868e96)$/i;

async function sube(datos: Blob, nombre: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", new File([datos], nombre, { type: datos.type }));
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const r = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !r?.url) throw new Error(r?.error ?? "No se pudo guardar el dibujo.");
  return r.url;
}

/**
 * Lienzo a pantalla completa del bloque «Dibujo» (Excalidraw, MIT). Lo usan el editor
 * web y la app de Android (en un WebView sobre `/dibujo`), así el formato es el mismo.
 * Excalidraw pone sus herramientas (seleccionar, formas, texto, goma, colores, grosores,
 * deshacer); encima van las cuatro puntas de trazo libre, el fondo y Hecho.
 */
export default function LienzoDibujo({
  escena,
  onGuardar,
  onCerrar,
}: {
  escena: string;
  onGuardar: (g: DibujoGuardado) => void | Promise<void>;
  onCerrar: () => void;
}) {
  const tema = useTheme();
  const [inicial, setInicial] = useState<EscenaGuardada | null | undefined>(escena ? undefined : null);
  const [error, setError] = useState("");
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [fondo, setFondo] = useState<Fondo>("liso");
  const [menuFondo, setMenuFondo] = useState(false);
  const [pluma, setPluma] = useState<Pluma | null>(null);
  const [vista, setVista] = useState({ x: 0, y: 0, zoom: 1 });
  const [guardando, setGuardando] = useState(false);
  const version0 = useRef<number | null>(null);
  const fondo0 = useRef<Fondo>("liso");

  useEffect(() => {
    if (!escena) return;
    fetch(escena)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((e: EscenaGuardada) => {
        setFondo((fondo0.current = fondoDe(e)));
        setInicial(e);
      })
      .catch(() => setError("No se pudo abrir el dibujo."));
  }, [escena]);

  const datosIniciales = useMemo(
    () =>
      inicial === undefined
        ? null
        : {
            elements: (inicial?.elements ?? []) as never,
            files: (inicial?.files ?? {}) as never,
            appState: { ...(inicial?.appState ?? {}), viewBackgroundColor: "transparent", currentItemStrokeWidth: 1 },
            scrollToContent: !!inicial?.elements?.length,
          },
    [inicial],
  );

  // Con un dedo se dibuja de entrada (es a lo que se viene); con escena, también.
  // (tras el primer pintado: antes, Excalidraw aún pone su herramienta de selección)
  useEffect(() => {
    if (!api) return;
    const t = setTimeout(() => eligePluma("boligrafo"), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  function eligePluma(p: Pluma) {
    if (!api) return;
    const st = api.getAppState();
    let color = st.currentItemStrokeColor;
    if (p === "subrayador" && TINTAS_ESCRIBIR.test(color)) color = AMARILLO_SUBRAYADOR;
    if (p !== "subrayador" && color === AMARILLO_SUBRAYADOR) color = "#1e1e1e";
    api.setActiveTool({ type: "freedraw" });
    api.updateScene({
      appState: {
        currentItemStrokeWidth: PLUMAS[p].grosor,
        currentItemOpacity: PLUMAS[p].opacidad,
        currentItemStrokeColor: color,
      },
    });
    setPluma(p);
  }

  const cambiado = () =>
    !!api && (getSceneVersion(api.getSceneElementsIncludingDeleted()) !== version0.current || fondo !== fondo0.current);

  async function hecho() {
    if (!api || guardando) return;
    if (!cambiado()) return onCerrar();
    setGuardando(true);
    try {
      const elementos = api.getSceneElements();
      if (!elementos.length) {
        await onGuardar({ escena: "", imagen: "", texto: "" });
        return;
      }
      const appState = api.getAppState();
      const files = api.getFiles();
      const json = { ...JSON.parse(serializeAsJSON(elementos, appState, files, "local")), notiono: { fondo } };
      // Vista previa a 2× (máx. 2400 px de lado), en claro: el modo oscuro la invierte al mostrarla.
      let escala = 2;
      const trazos = await exportToCanvas({
        elements: elementos,
        appState: { ...appState, exportBackground: false, exportWithDarkMode: false },
        files,
        exportPadding: 24,
        getDimensions: (w: number, h: number) => {
          escala = Math.min(2, 2400 / Math.max(w, h, 1));
          return { width: w * escala, height: h * escala, scale: escala };
        },
      });
      const png = document.createElement("canvas");
      png.width = trazos.width;
      png.height = trazos.height;
      const ctx = png.getContext("2d")!;
      pintaFondo(ctx, fondo, png.width, png.height, escala);
      ctx.drawImage(trazos, 0, 0);
      const blob = await new Promise<Blob>((ok, mal) => png.toBlob((b) => (b ? ok(b) : mal(new Error("PNG"))), "image/png"));
      const [urlEscena, urlImagen] = await Promise.all([
        sube(new Blob([JSON.stringify(json)], { type: "application/json" }), "dibujo.json"),
        sube(blob, "dibujo.png"),
      ]);
      await onGuardar({ escena: urlEscena, imagen: urlImagen, texto: textoDeEscena(elementos as unknown[]) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el dibujo.");
      setGuardando(false);
    }
  }

  function cerrar() {
    if (cambiado() && !confirm("¿Salir sin guardar el dibujo?")) return;
    onCerrar();
  }

  const oscuro = tema === "dark";
  const boton = "toque flex h-9 w-9 items-center justify-center rounded-md";

  return (
    <div className="lienzo-dibujo fixed inset-0 z-[200] flex flex-col bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-[var(--border)] px-2">
        <button onClick={cerrar} className={`${boton} hover:bg-[var(--hover)]`} title="Cerrar" aria-label="Cerrar">
          <X size={18} strokeWidth={1.75} />
        </button>
        <div className="mx-auto flex items-center gap-0.5">
          {(Object.keys(PLUMAS) as Pluma[]).map((p) => (
            <button
              key={p}
              onClick={() => eligePluma(p)}
              title={PLUMAS[p].etiqueta}
              aria-label={PLUMAS[p].etiqueta}
              aria-pressed={pluma === p}
              className={`${boton} ${pluma === p ? "bg-brand-50 text-brand" : "hover:bg-[var(--hover)]"}`}
            >
              {ICONOS[p]}
            </button>
          ))}
          <div className="relative">
            <button
              onClick={() => setMenuFondo((v) => !v)}
              className={`${boton} hover:bg-[var(--hover)]`}
              title="Fondo del lienzo"
              aria-label="Fondo del lienzo"
            >
              <Grid3x3 size={18} strokeWidth={1.75} />
            </button>
            {menuFondo && (
              <div data-menu="" className="absolute left-1/2 top-full z-10 mt-1 w-36 -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-1 shadow-xl">
                {FONDOS.map(([f, nombre]) => (
                  <button
                    key={f}
                    onClick={() => {
                      setFondo(f);
                      setMenuFondo(false);
                    }}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--hover)]"
                  >
                    {nombre}
                    {fondo === f && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={hecho}
          disabled={!api || guardando}
          className="flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {guardando && <Loader2 size={15} className="animate-spin" />}
          Hecho
        </button>
      </div>
      {error && (
        <div className="shrink-0 bg-red-500/10 px-3 py-1.5 text-sm text-red-600" role="alert">
          {error}
        </div>
      )}
      <div className="relative min-h-0 flex-1" style={cssFondo(fondo, vista.x, vista.y, vista.zoom, oscuro)}>
        {datosIniciales && (
          <Excalidraw
            initialData={datosIniciales}
            excalidrawAPI={(a) => setApi(a)}
            onChange={(els, st) => {
              if (version0.current === null) version0.current = getSceneVersion(els);
              // Otra herramienta (o el grosor cambiado a mano) deja de ser una de las puntas.
              if (pluma && (st.activeTool.type !== "freedraw" || st.currentItemStrokeWidth !== PLUMAS[pluma].grosor)) setPluma(null);
            }}
            onScrollChange={(x, y, z) => setVista({ x, y, zoom: z.value })}
            theme={oscuro ? "dark" : "light"}
            langCode="es-ES"
            UIOptions={{
              tools: { image: false },
              canvasActions: {
                changeViewBackgroundColor: false,
                export: false,
                loadScene: false,
                saveAsImage: false,
                saveToActiveFile: false,
                toggleTheme: false,
              },
            }}
          >
            <MainMenu>
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.DefaultItems.Help />
            </MainMenu>
          </Excalidraw>
        )}
      </div>
    </div>
  );
}
