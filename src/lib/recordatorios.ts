// Recordatorios de fecha, como los de Notion: en una celda de fecha (`reminder` dentro
// de su valor) o en una mención de fecha de una página (prop `recordatorio`). Funciones
// puras: las usan el editor de la web, el proceso que avisa en el servidor y la API de
// la app nativa, y se comprueban en scripts/check.ts.

/** La hora de los avisos de las fechas sin hora y de los «N días antes». */
export const HORA_AVISO = 9;
/** Las fechas de Notiono no llevan zona: son horas de Madrid (la de la familia). */
export const ZONA = "Europe/Madrid";

/** Antelaciones, en el orden del selector de Notion. */
export const RECORDATORIOS: { id: string; conHora: string; sinHora?: string }[] = [
  { id: "0", conHora: "A la hora del evento", sinHora: "El mismo día (9:00)" },
  { id: "5m", conHora: "5 minutos antes" },
  { id: "10m", conHora: "10 minutos antes" },
  { id: "15m", conHora: "15 minutos antes" },
  { id: "30m", conHora: "30 minutos antes" },
  { id: "1h", conHora: "1 hora antes" },
  { id: "2h", conHora: "2 horas antes" },
  { id: "1d", conHora: "1 día antes (9:00)", sinHora: "1 día antes (9:00)" },
  { id: "2d", conHora: "2 días antes (9:00)", sinHora: "2 días antes (9:00)" },
  { id: "1w", conHora: "1 semana antes (9:00)", sinHora: "1 semana antes (9:00)" },
];

/** Las opciones del selector para una fecha con o sin hora: [id, texto]. */
export function opcionesRecordatorio(conHora: boolean): [string, string][] {
  return RECORDATORIOS.filter((r) => conHora || r.sinHora).map((r) => [r.id, (conHora ? r.conHora : r.sinHora)!]);
}

export function textoRecordatorio(id: string | null | undefined, conHora: boolean): string | null {
  const r = RECORDATORIOS.find((x) => x.id === id);
  return r ? (conHora ? r.conHora : (r.sinHora ?? r.conHora)) : null;
}

/** Milisegundos que Madrid va por delante de UTC en ese instante (1 h en invierno, 2 h en verano). */
function desfase(ms: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ZONA, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}

/** El instante de un día y hora de Madrid ("2026-10-25", 9, 0 → 08:00 UTC: ese día ya es invierno). */
export function horaMadrid(ymd: string, h: number, min: number): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const local = Date.UTC(y, m - 1, d, h, min);
  // Dos pasadas: el desfase de la primera aproximación puede ser el del otro lado del cambio de hora.
  return new Date(local - desfase(local - desfase(local)));
}

function sumaDias(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * Cuándo salta el recordatorio `antes` de una fecha "YYYY-MM-DD" o "YYYY-MM-DDTHH:mm"
 * (hora de Madrid). Sin hora, el evento cuenta a las 9:00; los de días antes, siempre
 * a las 9:00 de ese día. null si la fecha o la antelación no se entienden.
 */
export function momentoRecordatorio(inicio: string, antes: string): Date | null {
  const f = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/.exec(inicio ?? "");
  if (!f) return null;
  const dias = /^(\d+)([dw])$/.exec(antes);
  if (dias) return horaMadrid(sumaDias(f[1], -Number(dias[1]) * (dias[2] === "w" ? 7 : 1)), HORA_AVISO, 0);
  const base = f[2] ? horaMadrid(f[1], Number(f[2]), Number(f[3])) : horaMadrid(f[1], HORA_AVISO, 0);
  if (antes === "0") return base;
  const m = /^(\d+)([mh])$/.exec(antes);
  return m ? new Date(base.getTime() - Number(m[1]) * (m[2] === "h" ? 60 : 1) * 60_000) : null;
}

/** «hoy a las 17:00», «mañana», «vie 23 oct a las 9:00»: el cuándo del evento, en Madrid. */
export function cuandoEvento(inicio: string, ahora = new Date()): string {
  const dia = inicio.slice(0, 10);
  const hora = /T(\d{2}:\d{2})/.exec(inicio)?.[1];
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(ahora);
  const nombre =
    dia === hoy ? "hoy"
    : dia === sumaDias(hoy, 1) ? "mañana"
    : new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${dia}T12:00:00Z`));
  return hora ? `${nombre} a las ${hora}` : nombre;
}
