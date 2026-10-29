/**
 * Lo del bloque «Dibujo» que no depende de Excalidraw ni de React (se prueba en
 * `npm run check`): los trazos de cada herramienta, los fondos y lo que se guarda.
 *
 * Un dibujo vive en el bloque `drawing` como dos Asset inmutables: la escena de
 * Excalidraw en JSON (editable: los trazos) y su vista previa en PNG, que es lo que
 * se ve en la página, en `/s/`, al exportar y en la app sin red. Guardar sube los dos
 * de nuevo y cambia las URL del bloque: duplicar una página nunca comparte nada mutable.
 */

export type Fondo = "liso" | "cuadricula" | "puntos" | "rayas";
export const FONDOS: [Fondo, string][] = [
  ["liso", "Liso"],
  ["cuadricula", "Cuadrícula"],
  ["puntos", "Puntos"],
  ["rayas", "Rayas"],
];
/** Lado de la cuadrícula y separación de puntos y rayas, en unidades de la escena. */
export const PASO_FONDO = 24;

export type Pluma = "boligrafo" | "lapiz" | "rotulador" | "subrayador";
/** Las puntas del trazo libre: grosor de Excalidraw y opacidad (0-100). */
export const PLUMAS: Record<Pluma, { etiqueta: string; grosor: number; opacidad: number }> = {
  boligrafo: { etiqueta: "Bolígrafo", grosor: 1, opacidad: 100 },
  lapiz: { etiqueta: "Lápiz", grosor: 0.5, opacidad: 75 },
  rotulador: { etiqueta: "Rotulador", grosor: 4, opacidad: 100 },
  subrayador: { etiqueta: "Subrayador", grosor: 10, opacidad: 35 },
};
/** El subrayador estrena amarillo si el color era el de escribir (negro o gris). */
export const AMARILLO_SUBRAYADOR = "#ffd43b";

/** Lo que se guarda: la escena de Excalidraw tal cual más el fondo elegido. */
export type EscenaGuardada = {
  type: "excalidraw";
  version: number;
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
  notiono?: { fondo?: Fondo };
};

export function fondoDe(escena: unknown): Fondo {
  const f = (escena as EscenaGuardada | null)?.notiono?.fondo;
  return f === "cuadricula" || f === "puntos" || f === "rayas" ? f : "liso";
}

/** Texto de los elementos de texto (para que el buscador encuentre el dibujo). */
export function textoDeEscena(elementos: unknown[]): string {
  return elementos
    .filter((e): e is { type: string; text: string; isDeleted?: boolean } =>
      !!e && (e as { type?: string }).type === "text" && !(e as { isDeleted?: boolean }).isDeleted)
    .map((e) => e.text.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 2000);
}

/**
 * Fondo CSS que sigue al lienzo: tamaño y posición salen del desplazamiento y el zoom
 * de Excalidraw (`onScrollChange`), así la cuadrícula se mueve y escala con lo dibujado.
 */
export function cssFondo(fondo: Fondo, scrollX: number, scrollY: number, zoom: number, oscuro: boolean) {
  if (fondo === "liso") return {};
  const tinta = oscuro ? "rgba(255,255,255,.13)" : "rgba(0,0,0,.11)";
  const p = PASO_FONDO * zoom;
  const pos = `${scrollX * zoom}px ${scrollY * zoom}px`;
  if (fondo === "puntos")
    return {
      backgroundImage: `radial-gradient(circle, ${oscuro ? "rgba(255,255,255,.28)" : "rgba(0,0,0,.25)"} ${Math.max(1, zoom)}px, transparent ${Math.max(1, zoom) + 0.5}px)`,
      backgroundSize: `${p}px ${p}px`,
      backgroundPosition: pos,
    };
  const horizontal = `linear-gradient(to bottom, ${tinta} 1px, transparent 1px)`;
  if (fondo === "rayas") return { backgroundImage: horizontal, backgroundSize: `100% ${p}px`, backgroundPosition: pos };
  return {
    backgroundImage: `${horizontal}, linear-gradient(to right, ${tinta} 1px, transparent 1px)`,
    backgroundSize: `${p}px ${p}px`,
    backgroundPosition: pos,
  };
}

/** Pinta el fondo en el PNG (siempre en claro: el modo oscuro lo invierte al mostrarlo). */
export function pintaFondo(ctx: CanvasRenderingContext2D, fondo: Fondo, ancho: number, alto: number, escala: number) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ancho, alto);
  if (fondo === "liso") return;
  const p = PASO_FONDO * escala;
  ctx.fillStyle = fondo === "puntos" ? "rgba(0,0,0,.25)" : "rgba(0,0,0,.11)";
  if (fondo === "puntos") {
    for (let y = 0; y < alto; y += p)
      for (let x = 0; x < ancho; x += p) {
        ctx.beginPath();
        ctx.arc(x, y, escala, 0, Math.PI * 2);
        ctx.fill();
      }
    return;
  }
  for (let y = 0; y < alto; y += p) ctx.fillRect(0, y, ancho, escala);
  if (fondo === "cuadricula") for (let x = 0; x < ancho; x += p) ctx.fillRect(x, 0, escala, alto);
}
