/**
 * La vista «Matriz» (p. ej. la de Eisenhower): una rejilla con un campo en cada eje
 * (casilla, selección o estado). Cada fila cae en la celda de sus dos valores y, al
 * soltarla en otra, se le ponen los de esa. Lógica pura: la usa MatrixView.tsx y la
 * prueba `npm run check`.
 */
import { optionsOf, type FieldLite } from "./cellText";

/** Tipos de campo que pueden ser un eje. */
export const TIPOS_EJE = ["checkbox", "select", "status"];
export const esEje = (f: FieldLite | undefined): f is FieldLite => !!f && TIPOS_EJE.includes(f.type);

export type GrupoEje = { id: string; label: string; color: string };

/**
 * Los valores de un eje, en orden. La casilla va «sí» primero: así, con Urgente e
 * Importante, la celda de las dos (Hacer) queda arriba a la izquierda.
 */
export function gruposEje(f: FieldLite): GrupoEje[] {
  if (f.type === "checkbox") {
    const nombre = f.name.trim() || "Marcado";
    return [
      { id: "true", label: nombre, color: "green" },
      { id: "", label: `No ${nombre.charAt(0).toLowerCase()}${nombre.slice(1)}`, color: "gray" },
    ];
  }
  return [
    ...optionsOf(f).map((o) => ({ id: o.id, label: o.label, color: o.color ?? "gray" })),
    { id: "", label: "Sin asignar", color: "gray" },
  ];
}

/** En qué valor del eje cae una fila (un valor que ya no existe, a «Sin asignar»). */
export function claveEje(f: FieldLite, grupos: GrupoEje[], cells: Record<string, unknown> | undefined): string {
  const v = cells?.[f.id];
  const id = f.type === "checkbox" ? (v === true || v === "true" ? "true" : "") : String(v ?? "");
  return grupos.some((g) => g.id === id) ? id : "";
}

/** Lo que se guarda en la celda al soltar una fila en ese valor del eje. */
export const valorEje = (f: FieldLite, id: string): unknown => (!id ? null : f.type === "checkbox" ? true : id);

export const claveCelda = (x: string, y: string) => `${x}|${y}`;

/** Reparto de las filas por celdas: "x|y" → filas, en el orden en que llegan. */
export function repartoMatriz<R extends { cells: Record<string, unknown> }>(
  filas: R[],
  fx: FieldLite,
  fy: FieldLite,
): Map<string, R[]> {
  const gx = gruposEje(fx);
  const gy = gruposEje(fy);
  const out = new Map<string, R[]>();
  for (const r of filas) {
    const k = claveCelda(claveEje(fx, gx, r.cells), claveEje(fy, gy, r.cells));
    out.set(k, [...(out.get(k) ?? []), r]);
  }
  return out;
}

/**
 * Valores que se pintan en un eje: todos menos «Sin asignar» de una selección, que
 * solo sale si tiene alguna fila (con casillas no existe).
 */
export function gruposVisibles(f: FieldLite, otro: FieldLite, reparto: Map<string, unknown[]>, esX: boolean): GrupoEje[] {
  const otros = gruposEje(otro);
  return gruposEje(f).filter(
    (g) =>
      g.id !== "" ||
      f.type === "checkbox" ||
      otros.some((o) => (reparto.get(esX ? claveCelda(g.id, o.id) : claveCelda(o.id, g.id))?.length ?? 0) > 0),
  );
}

/** Rótulo y color de una celda (view.config.celdas[x|y]); sin rótulo, la celda no lleva título. */
export type Celda = { rotulo?: string; color?: string };
