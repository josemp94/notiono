// Texto visible de las celdas y agrupación de filas. Funciones puras (sin React):
// se usan en las vistas de base de datos y se comprueban en scripts/check.ts.

export type Option = { id: string; label: string; color?: string; group?: string };

/** Grupos del campo Estado, en el orden en que los muestra Notion. */
export const STATUS_GROUPS: [string, string][] = [
  ["todo", "Por hacer"],
  ["doing", "En curso"],
  ["done", "Hecho"],
];
export type FieldLite = { id: string; name: string; type: string; config: unknown };
/** Adjunto del campo "Archivos y multimedia" (los bytes viven en el modelo Asset). */
export type Attachment = { id: string; url: string; name?: string | null; mime?: string | null };
export type RecordLite = { id: string; cells?: Record<string, unknown> | null };

/**
 * Valor de una celda de fecha. Retrocompatible: durante mucho tiempo se guardó
 * como una cadena suelta "YYYY-MM-DD"; con hora es "YYYY-MM-DDTHH:mm" y con
 * rango un objeto { start, end }.
 */
export type DateValue = { start: string; end?: string };

export function dateValue(v: unknown): DateValue | null {
  if (!v) return null;
  if (typeof v === "string") return { start: v };
  if (typeof v === "object") {
    const o = v as { start?: unknown; end?: unknown };
    if (typeof o.start === "string" && o.start) {
      return { start: o.start, end: typeof o.end === "string" && o.end ? o.end : undefined };
    }
  }
  return null;
}

/** Día "YYYY-MM-DD" del inicio de una celda de fecha (null si no hay fecha). */
export function dayOf(v: unknown): string | null {
  const d = dateValue(v);
  return d ? d.start.slice(0, 10) : null;
}

const diaISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Suma días a un "YYYY-MM-DD…" conservando lo que venga detrás del día (la hora). */
function sumaDias(iso: string, dias: number): string {
  const base = new Date(`${iso.slice(0, 10)}T00:00:00`);
  base.setDate(base.getDate() + dias);
  return diaISO(base) + iso.slice(10);
}

/**
 * Desplaza una celda de fecha N días conservando la hora y la duración del rango
 * (para arrastrar en Calendario y Cronograma). Devuelve el valor tal cual si no
 * hay fecha que mover.
 */
export function shiftDateValue(v: unknown, dias: number): unknown {
  const d = dateValue(v);
  if (!d || !dias) return v;
  return d.end ? { start: sumaDias(d.start, dias), end: sumaDias(d.end, dias) } : { start: sumaDias(d.start, dias) };
}

/**
 * Cambia el FINAL del rango N días (redimensionar en el Cronograma), sin dejarlo
 * nunca antes del inicio. Sin rango previo, lo crea a partir del inicio.
 */
export function stretchDateValue(v: unknown, dias: number): unknown {
  const d = dateValue(v);
  if (!d || !dias) return v;
  const inicio = d.start.slice(0, 10);
  const fin = sumaDias(d.end ?? d.start, dias);
  if (fin.slice(0, 10) < inicio) return { start: d.start }; // encogido hasta desaparecer: queda en un día
  return fin.slice(0, 10) === inicio ? { start: d.start } : { start: d.start, end: fin };
}

/** Día "YYYY-MM-DD" del final (el inicio si no hay rango). */
export function endDayOf(v: unknown): string | null {
  const d = dateValue(v);
  return d ? (d.end ?? d.start).slice(0, 10) : null;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "5 ago 2026", "5 ago 2026 14:30" o "5 ago 2026 → 8 ago 2026". */
/** «hoy», «ayer», «en 3 días»…; null si queda lejos (se usa el absoluto). */
function fechaRelativa(ymd: string): string | null {
  const hoy = new Date();
  const cero = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  const [y, m, d] = ymd.split("-").map(Number);
  const dias = Math.round((new Date(y, m - 1, d).getTime() - cero) / 864e5);
  if (dias === 0) return "hoy";
  if (dias === -1) return "ayer";
  if (dias === 1) return "mañana";
  if (dias < 0 && dias >= -6) return `hace ${-dias} días`;
  if (dias > 1 && dias <= 6) return `en ${dias} días`;
  return null;
}

/** Texto de una fecha según el formato del campo: largo (24 ago 2026, el de
 *  siempre), corto (24/08/2026) o relativo (hoy, ayer…), y hora 12/24. */
export function formatDate(v: unknown, field?: FieldLite): string {
  const d = dateValue(v);
  if (!d) return "";
  const cfg = (field?.config as { dateFormat?: string; hour12?: boolean } | null) ?? {};
  const hora = (time: string) => {
    const t = time.slice(0, 5);
    if (!cfg.hour12) return t;
    const [h, min] = t.split(":").map(Number);
    return `${h % 12 || 12}:${String(min).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
  };
  const one = (iso: string) => {
    const [date, time] = iso.split("T");
    const [y, m, day] = date.split("-");
    if (!y || !m || !day) return iso;
    const largo = `${Number(day)} ${MONTHS[Number(m) - 1] ?? m} ${y}`;
    const txt =
      cfg.dateFormat === "corto" ? `${day}/${m}/${y}`
      : cfg.dateFormat === "relativo" ? (fechaRelativa(date) ?? largo)
      : largo;
    return time ? `${txt} ${hora(time)}` : txt;
  };
  return d.end ? `${one(d.start)} → ${one(d.end)}` : one(d.start);
}

/** Formatos del campo Número, como en Notion. */
export const NUMBER_FORMATS: [string, string][] = [
  ["plain", "Normal"],
  ["euro", "Euros (€)"],
  ["dolar", "Dólares ($)"],
  ["libra", "Libras (£)"],
  ["percent", "Porcentaje (%)"],
  ["bar", "Barra"],
  ["ring", "Anillo"],
];

/** Texto de un número según el formato del campo (es-ES: 1.234,5).
 *  `decimals` fija los decimales; sin él, hasta 2 (los que traiga el número). */
export function formatNumber(value: unknown, field: FieldLite): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const cfg = (field.config as { format?: string; decimals?: number } | null) ?? {};
  const format = cfg.format ?? "plain";
  const dec = typeof cfg.decimals === "number" ? cfg.decimals : undefined;
  const es = (x: number) =>
    x.toLocaleString("es-ES", dec === undefined
      ? { maximumFractionDigits: 2 }
      : { minimumFractionDigits: dec, maximumFractionDigits: dec });
  if (format === "euro") return `${es(n)} €`;
  if (format === "dolar") return `${es(n)} $`;
  if (format === "libra") return `${es(n)} £`;
  if (format === "percent") return `${es(n)} %`;
  return es(n);
}

/** Colores de las etiquetas de Selección/Estado: los 10 de Notion, con variante
 *  clara y oscura vía variables CSS (globals.css). */
export const OPTION_COLORS: Record<string, string> = {
  default: "var(--tag-default)",
  gray: "var(--tag-gray)",
  brown: "var(--tag-brown)",
  orange: "var(--tag-orange)",
  yellow: "var(--tag-yellow)",
  green: "var(--tag-green)",
  blue: "var(--tag-blue)",
  purple: "var(--tag-purple)",
  pink: "var(--tag-pink)",
  red: "var(--tag-red)",
};

/**
 * Color de fondo de una fila según la opción elegida en el campo de color de la
 * vista (`rowColorFieldId`). Devuelve undefined si no aplica.
 */
export function rowColor(field: FieldLite | undefined, cells: Record<string, unknown> | null | undefined): string | undefined {
  if (!field) return undefined;
  const value = cells?.[field.id];
  const id = Array.isArray(value) ? value[0] : value;
  if (!id) return undefined;
  const opt = optionsOf(field).find((o) => o.id === id);
  return opt ? OPTION_COLORS[opt.color ?? "gray"] : undefined;
}

export function optionsOf(field: FieldLite): Option[] {
  const cfg = field.config as { options?: Option[] } | null;
  return cfg?.options ?? [];
}

/**
 * Valor de una celda como texto plano para tarjetas y listas.
 * `people` (userId -> nombre) solo hace falta para los campos "person".
 */
export function displayValue(field: FieldLite, value: unknown, people?: Map<string, string>): string {
  if (value === null || value === undefined || value === "") return "";
  if (field.type === "select" || field.type === "status") {
    return optionsOf(field).find((o) => o.id === value)?.label ?? String(value);
  }
  if (field.type === "multiselect") {
    const opts = optionsOf(field);
    return (Array.isArray(value) ? value : [value])
      .map((v) => opts.find((o) => o.id === v)?.label ?? String(v))
      .join(", ");
  }
  if (field.type === "person") {
    return (Array.isArray(value) ? value : [value])
      .map((v) => people?.get(String(v)) ?? String(v))
      .join(", ");
  }
  if (field.type === "files") {
    return (Array.isArray(value) ? (value as Attachment[]) : []).map((a) => a.name || "archivo").join(", ");
  }
  if (field.type === "number") return formatNumber(value, field);
  if (field.type === "date") return formatDate(value, field);
  if (field.type === "checkbox") return value ? "Sí" : "No";
  if (field.type === "location") {
    const l = value as { nombre?: string; lat?: number; lng?: number };
    return l?.nombre || (l?.lat != null && l?.lng != null ? `${l.lat}, ${l.lng}` : "");
  }
  if (field.type === "relation") {
    const n = Array.isArray(value) ? value.length : 0;
    return n ? `${n} vinculado${n > 1 ? "s" : ""}` : "";
  }
  // Calculados y automáticos: no viven en la celda (el autor y las fechas salen del propio registro).
  if (["rollup", "formula", "created_by", "last_edited_by", "created_time", "last_edited_time"].includes(field.type))
    return "";
  return String(value);
}

/** Filas agrupadas por el valor visible del campo, con "Sin …" al final. */
export function groupBy<R extends RecordLite>(
  records: R[],
  field: FieldLite | undefined,
  people: Map<string, string>,
): { key: string; label: string; records: R[] }[] {
  if (!field) return [];
  const empty = `Sin ${field.name.toLowerCase()}`;
  const buckets = new Map<string, R[]>();
  for (const r of records) {
    const label = displayValue(field, r.cells?.[field.id], people) || empty;
    buckets.set(label, [...(buckets.get(label) ?? []), r]);
  }
  // Selección y Estado siguen el orden de sus opciones; el resto, alfabético.
  const order = optionsOf(field).map((o) => o.label);
  const rank = (label: string) => {
    if (label === empty) return Number.MAX_SAFE_INTEGER;
    const i = order.indexOf(label);
    return i === -1 ? Number.MAX_SAFE_INTEGER - 1 : i;
  };
  return [...buckets.entries()]
    .map(([label, recs]) => ({ key: label, label, records: recs }))
    .sort((a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label));
}

/**
 * Ancho que se le supone a una columna congelada que no tiene uno fijo. Congelar
 * exige conocer el ancho: sin él no se sabe dónde empieza la siguiente y se
 * solaparían al desplazar en horizontal.
 */
export const FROZEN_WIDTH = 180;

/**
 * Ancho del margen izquierdo de la tabla (el de arrastrar y abrir la ficha).
 *
 * Tiene que ser un número conocido y forzado en las celdas, no un `w-14` a ver qué
 * pasa: el navegador encoge esa columna a lo que ocupe su contenido, y si el primer
 * congelado se pega a los 56px que se le suponían mientras el margen mide 35, queda
 * una rendija por la que se ve pasar el resto de la tabla. Justo lo que se veía.
 */
export const GUTTER_WIDTH = 40;

/**
 * A qué distancia del borde izquierdo se ancla cada columna congelada, en píxeles.
 * Devuelve null para las que no lo están. `start` es lo que ocupa la columnilla de
 * los controles de fila.
 */
export function frozenOffsets(widths: (number | undefined)[], frozen: number, start: number): (number | null)[] {
  let x = start;
  return widths.map((w, i) => {
    if (i >= frozen) return null;
    const left = x;
    x += w ?? FROZEN_WIDTH;
    return left;
  });
}
