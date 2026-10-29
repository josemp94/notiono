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

// ── Mis tareas por secciones ─────────────────────────────────────────────────

export type SeccionTareas = "vencidas" | "hoy" | "manana" | "proximas" | "sinFecha" | "completadas";
export const SECCIONES: [SeccionTareas, string][] = [
  ["vencidas", "Vencidas"],
  ["hoy", "Hoy"],
  ["manana", "Mañana"],
  ["proximas", "Próximas"],
  ["sinFecha", "Sin fecha"],
  ["completadas", "Completadas"],
];

function diaSiguiente(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** En qué sección va una tarea (`date`: "YYYY-MM-DD…" o vacío) el día `hoy`. */
export function seccionDe(t: { date: string; hecha?: boolean }, hoy: string): SeccionTareas {
  if (t.hecha) return "completadas";
  const dia = /^\d{4}-\d{2}-\d{2}/.test(t.date) ? t.date.slice(0, 10) : "";
  if (!dia) return "sinFecha";
  if (dia < hoy) return "vencidas";
  if (dia === hoy) return "hoy";
  return dia === diaSiguiente(hoy) ? "manana" : "proximas";
}

/**
 * Las secciones de Mis tareas con algo dentro, en orden, cada una por fecha y título.
 * `soloHoy` (el filtro «Hoy»): lo vencido y lo de hoy.
 */
export function agrupaTareas<T extends { date: string; title: string; hecha?: boolean }>(
  tareas: T[],
  hoy: string,
  soloHoy = false,
): { id: SeccionTareas; titulo: string; tareas: T[] }[] {
  return SECCIONES.filter(([id]) => !soloHoy || id === "vencidas" || id === "hoy")
    .map(([id, titulo]) => ({
      id,
      titulo,
      tareas: tareas
        .filter((t) => seccionDe(t, hoy) === id)
        .sort((a, b) => (id === "completadas" ? 0 : a.date.localeCompare(b.date)) || a.title.localeCompare(b.title)),
    }))
    .filter((s) => s.tareas.length);
}
