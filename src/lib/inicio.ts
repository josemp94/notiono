/**
 * Inicio personalizable (como el Home de Notion): qué bloques ve cada persona en cada
 * espacio, en qué orden, sus enlaces fijados y qué se abre al arrancar. Se guarda en
 * `Member.inicio` y lo leen igual la web y la app de Android.
 *
 * Todo lo que se lee pasa por `normalizaInicio`: lo guardado puede venir de una versión
 * anterior (bloques que ya no existen, otros nuevos que aún no conoce) o a medias.
 */

import { sumaDias } from "./recordatorios";

export const BLOQUES = ["recientes", "tareas", "hoy", "proximas", "favoritos", "enlaces"] as const;
export type BloqueInicio = (typeof BLOQUES)[number];

/** Quien nunca ha tocado nada ve el Inicio de siempre: recientes y mis tareas. */
const VISIBLES_POR_DEFECTO: BloqueInicio[] = ["recientes", "tareas"];

export const MAX_ENLACES = 30;
const MAX_TITULO = 120;
const MAX_URL = 2000;

export type EnlaceInicio =
  | { id: string; tipo: "pagina"; pageId: string; titulo?: string }
  | { id: string; tipo: "web"; url: string; titulo?: string };

export type AbrirAlIniciar = { tipo: "inicio" } | { tipo: "ultima" } | { tipo: "pagina"; pageId: string };

export type ConfigInicio = {
  bloques: { id: BloqueInicio; visible: boolean }[];
  enlaces: EnlaceInicio[];
  abrir: AbrirAlIniciar;
};

export function inicioPorDefecto(): ConfigInicio {
  return {
    bloques: BLOQUES.map((id) => ({ id, visible: VISIBLES_POR_DEFECTO.includes(id) })),
    enlaces: [],
    abrir: { tipo: "inicio" },
  };
}

/** Solo http/https: un `javascript:` en un enlace fijado sería un XSS guardado. */
export function urlValida(u: unknown): string | null {
  if (typeof u !== "string" || !u.trim() || u.length > MAX_URL) return null;
  try {
    const url = new URL(u.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Lo guardado, siempre con forma buena: bloques desconocidos fuera, sin duplicados, los
 * que falten al final y ocultos (para que un bloque nuevo no le aparezca a nadie de
 * golpe), enlaces válidos y como mucho MAX_ENLACES. Sin nada guardado, el de por defecto.
 */
export function normalizaInicio(raw: unknown): ConfigInicio {
  const base = inicioPorDefecto();
  if (!esObjeto(raw)) return base;

  const vistos = new Set<BloqueInicio>();
  const bloques: ConfigInicio["bloques"] = [];
  for (const b of Array.isArray(raw.bloques) ? raw.bloques : []) {
    if (!esObjeto(b) || !BLOQUES.includes(b.id as BloqueInicio) || vistos.has(b.id as BloqueInicio)) continue;
    vistos.add(b.id as BloqueInicio);
    bloques.push({ id: b.id as BloqueInicio, visible: b.visible !== false });
  }
  // Sin ningún bloque que valga es como no haber guardado nada.
  if (!bloques.length) return { ...base, enlaces: normalizaEnlaces(raw.enlaces), abrir: normalizaAbrir(raw.abrir) };
  for (const id of BLOQUES) if (!vistos.has(id)) bloques.push({ id, visible: false });

  return { bloques, enlaces: normalizaEnlaces(raw.enlaces), abrir: normalizaAbrir(raw.abrir) };
}

function normalizaEnlaces(raw: unknown): EnlaceInicio[] {
  const out: EnlaceInicio[] = [];
  const ids = new Set<string>();
  for (const e of Array.isArray(raw) ? raw : []) {
    if (out.length >= MAX_ENLACES) break;
    if (!esObjeto(e)) continue;
    const id = texto(e.id, 64);
    if (!id || ids.has(id)) continue;
    const titulo = texto(e.titulo, MAX_TITULO);
    if (e.tipo === "pagina") {
      const pageId = texto(e.pageId, 64);
      if (!pageId) continue;
      out.push({ id, tipo: "pagina", pageId, ...(titulo ? { titulo } : {}) });
    } else if (e.tipo === "web") {
      const url = urlValida(e.url);
      if (!url) continue;
      out.push({ id, tipo: "web", url, ...(titulo ? { titulo } : {}) });
    } else continue;
    ids.add(id);
  }
  return out;
}

function normalizaAbrir(raw: unknown): AbrirAlIniciar {
  if (!esObjeto(raw)) return { tipo: "inicio" };
  if (raw.tipo === "ultima") return { tipo: "ultima" };
  const pageId = texto(raw.pageId, 64);
  if (raw.tipo === "pagina" && pageId) return { tipo: "pagina", pageId };
  return { tipo: "inicio" };
}

/** Mueve un bloque (o un enlace) una posición arriba (-1) o abajo (+1). */
export function mueve<T>(lista: T[], i: number, paso: -1 | 1): T[] {
  const j = i + paso;
  if (i < 0 || i >= lista.length || j < 0 || j >= lista.length) return lista;
  const out = [...lista];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Lleva el elemento `de` a la posición `a` (arrastrar). */
export function lleva<T>(lista: T[], de: number, a: number): T[] {
  if (de === a || de < 0 || de >= lista.length || a < 0 || a >= lista.length) return lista;
  const out = [...lista];
  const [x] = out.splice(de, 1);
  out.splice(a, 0, x);
  return out;
}

// ── Tareas para hoy y próximas fechas ────────────────────────────────────────

/** «YYYY-MM-DD» del día local (no toISOString, que es UTC y cambia de día de madrugada). */
export function diaLocal(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Lo que vence hoy o ya venció (de `db.myTasks`, que ya quita lo hecho), lo vencido primero. */
export function tareasDeHoy<T extends { date: string }>(tareas: T[], hoy: string): (T & { vencida: boolean })[] {
  return tareas
    .filter((t) => /^\d{4}-\d{2}-\d{2}/.test(t.date) && t.date.slice(0, 10) <= hoy)
    .map((t) => ({ ...t, vencida: t.date.slice(0, 10) < hoy }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type Proxima = {
  key: string;
  titulo: string;
  /** Día del evento, «YYYY-MM-DD». */
  dia: string;
  /** La fecha tal cual (con hora si la tiene), para `fechaTarea`. */
  inicio: string;
  pageId: string;
  recordId: string | null;
  tipo: "tarea" | "recordatorio";
};

/**
 * Lo que me toca en los próximos `dias` días, por fecha: mis tareas desde mañana (las de
 * hoy y las vencidas son de «Tareas para hoy») y mis recordatorios desde hoy (no salen en
 * ningún otro bloque). Un recordatorio de una de mis tareas no se repite.
 */
export function proximasFechas(
  tareas: { recordId: string; pageId: string; title: string; date: string }[],
  recordatorios: { key: string; titulo: string; inicio: string; pageId: string; recordId: string | null }[],
  hoy: string,
  dias = 7,
): Proxima[] {
  const hasta = sumaDias(hoy, dias);
  const dentro = (dia: string, desde = hoy) => /^\d{4}-\d{2}-\d{2}$/.test(dia) && dia >= desde && dia <= hasta;
  const manana = sumaDias(hoy, 1);
  const out: Proxima[] = [];
  for (const t of tareas) {
    const dia = t.date.slice(0, 10);
    if (dentro(dia, manana)) out.push({ key: `t:${t.recordId}`, titulo: t.title, dia, inicio: t.date, pageId: t.pageId, recordId: t.recordId, tipo: "tarea" });
  }
  // Mis tareas ya salen (aquí o en «Tareas para hoy»): sus recordatorios no se repiten.
  const filas = new Set(tareas.map((t) => t.recordId));
  const vistos = new Set<string>();
  for (const r of recordatorios) {
    const dia = r.inicio.slice(0, 10);
    if (!dentro(dia) || (r.recordId && filas.has(r.recordId))) continue;
    // Varios avisos del mismo evento (o de la misma fila) salen una vez.
    const k = `${r.recordId ?? r.pageId}|${r.inicio}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push({ key: `r:${r.key}`, titulo: r.titulo, dia, inicio: r.inicio, pageId: r.pageId, recordId: r.recordId, tipo: "recordatorio" });
  }
  return out.sort((a, b) => a.dia.localeCompare(b.dia) || a.titulo.localeCompare(b.titulo));
}

/**
 * La página que se abre al arrancar, o null para quedarse en el Inicio (también si la
 * elegida ya no existe o no tengo permiso: `existe` dice si la veo).
 */
export function destinoAlIniciar(abrir: AbrirAlIniciar, existe: (pageId: string) => boolean, ultima?: string | null): string | null {
  const id = abrir.tipo === "pagina" ? abrir.pageId : abrir.tipo === "ultima" ? ultima : null;
  return id && existe(id) ? id : null;
}
