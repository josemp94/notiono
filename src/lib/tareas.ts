/**
 * Cuándo una fila es una tarea hecha y cómo marcarla, igual en todas partes (Mis tareas,
 * el botón «Hecho» de un recordatorio, el Inicio): la primera Casilla de la base de datos
 * o, si no tiene, su primer campo Estado (hecha = una opción del grupo «Hecho»).
 * Funciones puras: se comprueban en scripts/check.ts.
 */
type Campo = { id: string; type: string; config?: unknown };
type Opcion = { id: string; group?: string };

const opciones = (c: Campo) => ((c.config as { options?: Opcion[] } | null)?.options ?? []);

/** El campo que dice si está hecha (casilla primero, luego estado), o null si no hay. */
export function campoHecho(campos: Campo[]): Campo | null {
  return campos.find((c) => c.type === "checkbox") ?? campos.find((c) => c.type === "status" && opciones(c).some((o) => o.group === "done")) ?? null;
}

/** ¿Está hecha? null si la base de datos no tiene ni casilla ni estado con «Hecho». */
export function estaHecha(campos: Campo[], cells: Record<string, unknown>): boolean | null {
  const c = campoHecho(campos);
  if (!c) return null;
  if (c.type === "checkbox") return !!cells[c.id];
  return opciones(c).find((o) => o.id === cells[c.id])?.group === "done";
}

/** El valor que la marca hecha (o pendiente): la casilla, o la primera opción de ese grupo del Estado. */
export function valorHecho(campos: Campo[], hecha = true): { fieldId: string; value: unknown } | null {
  const c = campoHecho(campos);
  if (!c) return null;
  if (c.type === "checkbox") return { fieldId: c.id, value: hecha };
  const o = opciones(c).find((x) => (hecha ? x.group === "done" : (x.group ?? "todo") === "todo"));
  return o ? { fieldId: c.id, value: o.id } : null;
}
