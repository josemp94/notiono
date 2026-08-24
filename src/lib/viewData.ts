// Aplica filtros y orden (guardados en view.config) a los registros, en cliente.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { dayOf, endDayOf, OPTION_COLORS } from "./cellText";

export type DbField = { id: string; name: string; type: string; config: any };
export type DbRecord = {
  id: string;
  cells: Record<string, unknown>;
  order: string;
  // Meta-campos (Creado por / Fecha de creación…): no viven en cells, vienen del registro.
  createdAt?: unknown;
  updatedAt?: unknown;
  createdById?: string | null;
  updatedById?: string | null;
};
export type Filter = { fieldId: string; op: string; value: any };
/** Grupo anidado estilo Notion: sus hijos se combinan con su propio op. */
export type FilterGroup = { type: "group"; op: "and" | "or"; filters: FilterNode[] };
export type FilterNode = Filter | FilterGroup;
export type Sort = { fieldId: string; dir: "asc" | "desc" };

export const isFilterGroup = (n: FilterNode): n is FilterGroup =>
  (n as FilterGroup).type === "group";

/**
 * ¿Se envuelve el texto de esta columna? Manda el ajuste por columna
 * (`wrapCols`, como Notion); si la columna no dice nada, hereda el «Envolver
 * texto» de la vista (`wrapText`, el ajuste antiguo) y, sin ninguno de los dos,
 * `porDefecto` (la Tabla lo pone a true en el título, que en Notion envuelve
 * de fábrica).
 */
/** Tipos de columna a los que aplica «Ajustar texto» (envuelven de fábrica). */
export const WRAP_TYPES = ["text", "url", "email", "phone"];

export function wrapOf(config: any, fieldId: string, porDefecto = false): boolean {
  const porColumna = config?.wrapCols?.[fieldId];
  if (typeof porColumna === "boolean") return porColumna;
  const porVista = config?.wrapText;
  return typeof porVista === "boolean" ? porVista : porDefecto;
}

export type OpenIn = "side" | "center" | "full";

/**
 * Cómo abre sus filas una vista (`view.config.openIn`). Sin configurar, los
 * defaults de Notion: Galería y Calendario al centro, el resto en el lateral.
 */
export function openInOf(viewType: string, config: any): OpenIn {
  const v = config?.openIn;
  if (v === "side" || v === "center" || v === "full") return v;
  return viewType === "gallery" || viewType === "calendar" ? "center" : "side";
}

/** Nº de condiciones (hojas) de un árbol de filtros, para el contador de la UI. */
export function countFilters(nodes: FilterNode[]): number {
  return nodes.reduce((acc, n) => acc + (isFilterGroup(n) ? countFilters(n.filters) : 1), 0);
}

/** Ids de campo que usa un árbol de filtros (¿hace falta calcular fórmulas/rollups?). */
export function filterFieldIds(nodes: FilterNode[]): string[] {
  return nodes.flatMap((n) => (isFilterGroup(n) ? filterFieldIds(n.filters) : [n.fieldId]));
}

/**
 * Copia los valores calculados (fórmula/rollup, `db.computed`) dentro de las celdas
 * de cada registro, para que el MISMO motor de filtros y orden los vea sin cambiar.
 * Devuelve copias; los registros originales no se tocan.
 */
export function conComputados(
  records: DbRecord[],
  computed?: Record<string, Record<string, string | number>>,
): DbRecord[] {
  if (!computed) return records;
  return records.map((r) => (computed[r.id] ? { ...r, cells: { ...r.cells, ...computed[r.id] } } : r));
}

const s = (v: unknown): string => {
  if (v == null) return "";
  // Celdas de varios valores: adjuntos ({name}), personas y etiquetas (ids).
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" ? ((x as { name?: string }).name ?? "") : String(x))).join(", ");
  return String(v);
};
const n = (v: unknown) => (typeof v === "number" ? v : parseFloat(s(v)));
const t = (v: unknown) => {
  const d = new Date(dayOf(v) ?? s(v));
  return isNaN(d.getTime()) ? null : d.getTime();
};

/** "YYYY-MM-DD" de una celda de fecha (día suelto, con hora o rango); null si no hay. */
const day = (v: unknown): string | null => {
  const start = dayOf(v);
  if (start && /^\d{4}-\d{2}-\d{2}$/.test(start)) return start;
  const d = new Date(s(v));
  return isNaN(d.getTime()) ? null : localDay(d);
};

/** Día local (no UTC: toISOString desplazaría la fecha según la zona horaria). */
const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const shift = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

/** Rango [desde, hasta] en días locales de un operador de fecha relativo (matriz de Notion). */
export function relativeRange(op: string, now = new Date()): [string, string] | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const month = (delta: number): [string, string] => [
    localDay(new Date(today.getFullYear(), today.getMonth() + delta, 1)),
    localDay(new Date(today.getFullYear(), today.getMonth() + delta + 1, 0)),
  ];
  const year = (delta: number): [string, string] => [
    localDay(new Date(today.getFullYear() + delta, 0, 1)),
    localDay(new Date(today.getFullYear() + delta, 11, 31)),
  ];
  switch (op) {
    case "today":
      return [localDay(today), localDay(today)];
    case "tomorrow": {
      const d = shift(today, 1);
      return [localDay(d), localDay(d)];
    }
    case "yesterday": {
      const d = shift(today, -1);
      return [localDay(d), localDay(d)];
    }
    case "this_week": {
      // Semana de lunes a domingo (convención española).
      const monday = shift(today, -((today.getDay() + 6) % 7));
      return [localDay(monday), localDay(shift(monday, 6))];
    }
    case "past_week":
      return [localDay(shift(today, -7)), localDay(today)];
    case "next_week":
      return [localDay(today), localDay(shift(today, 7))];
    case "this_month":
      return month(0);
    case "past_month":
      return month(-1);
    case "next_month":
      return month(1);
    case "this_year":
      return year(0);
    case "past_year":
      return year(-1);
    case "next_year":
      return year(1);
    // Nombres antiguos: siguen viviendo en configs de vistas guardadas antes del cambio.
    case "last_7_days":
      return [localDay(shift(today, -6)), localDay(today)];
    case "next_7_days":
      return [localDay(today), localDay(shift(today, 6))];
    default:
      return null;
  }
}

/**
 * Anclas relativas para operadores absolutos de fecha (el valor se guarda como {rel:"today"}).
 * Es el selector "Hoy / Mañana / Hace una semana…" de Notion.
 */
export const DATE_ANCHORS: [string, string][] = [
  ["today", "Hoy"],
  ["tomorrow", "Mañana"],
  ["yesterday", "Ayer"],
  ["one_week_ago", "Hace una semana"],
  ["one_week_from_now", "Dentro de una semana"],
  ["one_month_ago", "Hace un mes"],
  ["one_month_from_now", "Dentro de un mes"],
  ["one_year_ago", "Hace un año"],
  ["one_year_from_now", "Dentro de un año"],
];

/** "YYYY-MM-DD" de un ancla relativa. */
export function anchorDay(rel: string, now = new Date()): string | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (rel) {
    case "today":
      return localDay(today);
    case "tomorrow":
      return localDay(shift(today, 1));
    case "yesterday":
      return localDay(shift(today, -1));
    case "one_week_ago":
      return localDay(shift(today, -7));
    case "one_week_from_now":
      return localDay(shift(today, 7));
    case "one_month_ago":
      return localDay(new Date(today.getFullYear(), today.getMonth() - 1, today.getDate()));
    case "one_month_from_now":
      return localDay(new Date(today.getFullYear(), today.getMonth() + 1, today.getDate()));
    case "one_year_ago":
      return localDay(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));
    case "one_year_from_now":
      return localDay(new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()));
    default:
      return null;
  }
}

/** Día del valor de un filtro de fecha: cadena "YYYY-MM-DD" o ancla relativa {rel}. */
const filterDay = (value: any): string | null => {
  if (value && typeof value === "object" && typeof value.rel === "string") return anchorDay(value.rel);
  const str = s(value);
  return str ? str.slice(0, 10) : null;
};

/** Operadores que no piden valor: la UI no dibuja input y evalNode no los descarta por vacíos. */
export const NO_VALUE_OPS = new Set([
  "is_empty",
  "not_empty",
  "today",
  "tomorrow",
  "yesterday",
  "this_week",
  "past_week",
  "next_week",
  "this_month",
  "past_month",
  "next_month",
  "this_year",
  "past_year",
  "next_year",
  // Nombres antiguos, por configs guardadas.
  "last_7_days",
  "next_7_days",
]);

const EMPTY_OPS = [
  { value: "is_empty", label: "está vacío" },
  { value: "not_empty", label: "no está vacío" },
];

/** Operadores disponibles por tipo de campo, exactos a Notion. */
export function opsFor(type: string): { value: string; label: string }[] {
  switch (type) {
    case "number":
    case "id":
      return [
        { value: "eq", label: "=" },
        { value: "neq", label: "≠" },
        { value: "gt", label: ">" },
        { value: "lt", label: "<" },
        { value: "gte", label: "≥" },
        { value: "lte", label: "≤" },
        ...EMPTY_OPS,
      ];
    case "select":
    case "status":
      return [
        { value: "is", label: "es" },
        { value: "is_not", label: "no es" },
        ...EMPTY_OPS,
      ];
    case "multiselect":
    case "relation":
    case "person":
    case "created_by":
    case "last_edited_by":
      return [
        { value: "contains", label: "contiene" },
        { value: "not_contains", label: "no contiene" },
        ...EMPTY_OPS,
      ];
    case "files":
      return [...EMPTY_OPS];
    case "formula":
    case "rollup":
      // El resultado puede ser texto o número, así que ofrece los dos juegos.
      return [
        { value: "is", label: "es" },
        { value: "is_not", label: "no es" },
        { value: "contains", label: "contiene" },
        { value: "not_contains", label: "no contiene" },
        { value: "gt", label: ">" },
        { value: "lt", label: "<" },
        { value: "gte", label: "≥" },
        { value: "lte", label: "≤" },
        ...EMPTY_OPS,
      ];
    case "checkbox":
      // Una casilla siempre está marcada o sin marcar: no tiene "vacío".
      return [
        { value: "is", label: "es" },
        { value: "is_not", label: "no es" },
      ];
    case "date":
    case "created_time":
    case "last_edited_time":
      return [
        { value: "on", label: "es el día" },
        { value: "before", label: "es anterior a" },
        { value: "after", label: "es posterior a" },
        { value: "on_or_before", label: "en o antes de" },
        { value: "on_or_after", label: "en o después de" },
        { value: "today", label: "hoy" },
        { value: "tomorrow", label: "mañana" },
        { value: "yesterday", label: "ayer" },
        { value: "this_week", label: "esta semana" },
        { value: "past_week", label: "la semana pasada" },
        { value: "next_week", label: "la próxima semana" },
        { value: "this_month", label: "este mes" },
        { value: "past_month", label: "el mes pasado" },
        { value: "next_month", label: "el próximo mes" },
        { value: "this_year", label: "este año" },
        { value: "past_year", label: "el año pasado" },
        { value: "next_year", label: "el próximo año" },
        ...EMPTY_OPS,
      ];
    default:
      // text, url, email, phone… comparten el juego de operadores de texto.
      return [
        { value: "is", label: "es" },
        { value: "is_not", label: "no es" },
        { value: "contains", label: "contiene" },
        { value: "not_contains", label: "no contiene" },
        { value: "starts_with", label: "empieza por" },
        { value: "ends_with", label: "termina por" },
        ...EMPTY_OPS,
      ];
  }
}

/** Vacío = sin valor, cadena vacía o lista sin elementos (una casilla sin marcar NO está vacía). */
const isEmpty = (cell: unknown) =>
  cell == null || cell === "" || (Array.isArray(cell) && cell.length === 0);

/** Tipos cuya celda es una lista de ids: "contiene" = pertenencia exacta, no subcadena. */
const LIST_TYPES = ["multiselect", "relation", "person", "created_by", "last_edited_by"];

/** Grupo (Por hacer / En curso / Hecho) de la opción elegida en un campo Estado. */
const statusGroup = (field: DbField, cell: unknown): string | null => {
  const opts: { id: string; group?: string }[] = field.config?.options ?? [];
  const o = opts.find((x) => x.id === s(cell));
  return o ? (o.group ?? "todo") : null;
};

function matchFilter(cell: unknown, field: DbField, op: string, value: any, me?: string): boolean {
  const range = relativeRange(op);
  if (range) {
    // Con rango de fechas basta con que solape el periodo.
    const from = day(cell);
    if (from == null) return false;
    const to = endDayOf(cell) ?? from;
    return from <= range[1] && to >= range[0];
  }
  switch (op) {
    case "is_empty":
      return isEmpty(cell);
    case "not_empty":
      return !isEmpty(cell);
    case "contains":
    case "not_contains": {
      let hit: boolean;
      if (LIST_TYPES.includes(field.type)) {
        // "me" = el usuario con la sesión abierta (Notion: "Yo").
        const needle = s(value === "me" ? (me ?? "") : value);
        const list = Array.isArray(cell) ? cell.map(s) : isEmpty(cell) ? [] : [s(cell)];
        hit = needle !== "" && list.includes(needle);
      } else {
        hit = s(cell).toLowerCase().includes(s(value).toLowerCase());
      }
      return op === "not_contains" ? !hit : hit;
    }
    case "starts_with":
      return s(cell).toLowerCase().startsWith(s(value).toLowerCase());
    case "ends_with":
      return s(cell).toLowerCase().endsWith(s(value).toLowerCase());
    case "eq":
      if (field.type === "number" || field.type === "id") return n(cell) === n(value);
      return s(cell).toLowerCase() === s(value).toLowerCase();
    case "neq":
      if (field.type === "number" || field.type === "id") return n(cell) !== n(value);
      return s(cell).toLowerCase() !== s(value).toLowerCase();
    case "is":
    case "is_not":
    case "isnot": {
      // "isnot" es el nombre antiguo de "is_not" (configs guardadas).
      let hit: boolean;
      if (field.type === "checkbox") hit = Boolean(cell) === (value === true || value === "true");
      else if (field.type === "status" && typeof value === "string" && value.startsWith("group:"))
        hit = statusGroup(field, cell) === value.slice("group:".length);
      // multiselect y person guardaban "es" = lo contiene (retrocompat).
      else if (Array.isArray(cell)) hit = cell.map(s).includes(s(value));
      else hit = s(cell).toLowerCase() === s(value).toLowerCase();
      return op === "is" ? hit : !hit;
    }
    case "gt":
      return n(cell) > n(value);
    case "lt":
      return n(cell) < n(value);
    case "gte":
      return n(cell) >= n(value);
    case "lte":
      return n(cell) <= n(value);
    case "on":
    case "before":
    case "after":
    case "on_or_before":
    case "on_or_after": {
      // Comparación por día local; el valor puede ser absoluto o un ancla {rel:"today"}.
      const a = day(cell);
      const b = filterDay(value);
      if (a == null || b == null) return false;
      if (op === "on") return a === b;
      if (op === "before") return a < b;
      if (op === "after") return a > b;
      if (op === "on_or_before") return a <= b;
      return a >= b;
    }
    default:
      return true;
  }
}

function compareCells(a: unknown, b: unknown, field?: DbField): number {
  // Fórmulas y rollups numéricos: la celda ya trae el número (10 antes que 9).
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (!field) return s(a).localeCompare(s(b));
  if (field.type === "number") {
    const x = n(a), y = n(b);
    if (isNaN(x) && isNaN(y)) return 0;
    if (isNaN(x)) return 1;
    if (isNaN(y)) return -1;
    return x - y;
  }
  if (field.type === "date") {
    const x = t(a), y = t(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return x - y;
  }
  if (field.type === "checkbox") return Number(Boolean(a)) - Number(Boolean(b));
  if (field.type === "select" || field.type === "status") {
    // ordena por el orden de las opciones definidas
    const opts: any[] = field.config?.options ?? [];
    const idx = (v: unknown) => {
      const i = opts.findIndex((o) => o.id === v);
      return i === -1 ? 999 : i;
    };
    return idx(a) - idx(b);
  }
  return s(a).localeCompare(s(b));
}

/** Valor efectivo de un campo en un registro (los meta-campos no viven en cells). */
export function cellValue(r: DbRecord, field: DbField): unknown {
  switch (field.type) {
    case "created_time":
      return r.createdAt ?? null;
    case "last_edited_time":
      return r.updatedAt ?? null;
    case "created_by":
      return r.createdById ?? null;
    case "last_edited_by":
      return r.updatedById ?? null;
    default:
      return r.cells[field.id];
  }
}

/** Evalúa un nodo; null = ignorar (condición incompleta o grupo sin condiciones activas). */
function evalNode(node: FilterNode, r: DbRecord, byId: Map<string, DbField>, me?: string): boolean | null {
  if (isFilterGroup(node)) {
    const results = node.filters
      .map((c) => evalNode(c, r, byId, me))
      .filter((x): x is boolean => x !== null);
    if (!results.length) return null;
    return node.op === "or" ? results.some(Boolean) : results.every(Boolean);
  }
  const field = byId.get(node.fieldId);
  if (!field) return null;
  if (!NO_VALUE_OPS.has(node.op) && (node.value === "" || node.value == null)) return null;
  return matchFilter(cellValue(r, field), field, node.op, node.value, me);
}

/** Regla de color: si el registro cumple sus condiciones, la fila se pinta de ese color. */
export type ColorRule = { id: string; color: string; filters: FilterNode[] };

/** ¿El registro cumple estas condiciones? (mismo motor que los filtros de la vista). */
export function matchesFilters(
  record: DbRecord,
  fields: DbField[],
  nodes: FilterNode[],
  currentUserId?: string,
): boolean {
  if (!nodes.length) return false;
  const byId = new Map(fields.map((f) => [f.id, f]));
  return evalNode({ type: "group", op: "and", filters: nodes }, record, byId, currentUserId) === true;
}

/** Color de la primera regla que cumple el registro (las reglas se evalúan en orden). */
export function colorByRules(record: DbRecord, fields: DbField[], rules: ColorRule[] | undefined): string | undefined {
  if (!rules?.length) return undefined;
  const hit = rules.find((rule) => matchesFilters(record, fields, rule.filters ?? []));
  return hit ? OPTION_COLORS[hit.color] ?? undefined : undefined;
}

export function applyViewConfig(
  records: DbRecord[],
  fields: DbField[],
  config: any,
  currentUserId?: string,
): DbRecord[] {
  const byId = new Map(fields.map((f) => [f.id, f]));
  let out = records;
  // Retrocompat: el formato plano (filters[] + filterOp) es el grupo raíz.
  const root: FilterGroup = {
    type: "group",
    op: config?.filterOp === "or" ? "or" : "and",
    filters: Array.isArray(config?.filters) ? config.filters : [],
  };
  out = out.filter((r) => evalNode(root, r, byId, currentUserId) !== false);
  const sorts: Sort[] = Array.isArray(config?.sorts) ? config.sorts : [];
  if (sorts.length) {
    out = [...out].sort((a, b) => {
      for (const so of sorts) {
        const field = byId.get(so.fieldId);
        const cmp = field
          ? compareCells(cellValue(a, field), cellValue(b, field), field)
          : compareCells(a.cells[so.fieldId], b.cells[so.fieldId], undefined);
        if (cmp !== 0) return so.dir === "desc" ? -cmp : cmp;
      }
      return 0;
    });
  }
  return out;
}
