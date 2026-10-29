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

export function sumaDias(ymd: string, n: number): string {
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

/** "YYYY-MM-DDTHH:mm" de un instante en hora de Madrid (el formato de las fechas de Notiono). */
export function enMadrid(d: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: ZONA, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Atajos de «Recordarme…» (los de las apps de notas): en 1 hora, esta tarde, mañana. */
export type Atajo = "1h" | "tarde" | "manana";
export const ATAJOS: [Atajo, string][] = [
  ["1h", "En 1 hora"],
  ["tarde", "Esta tarde (19:00)"],
  ["manana", "Mañana a las 9:00"],
];

/**
 * Cuándo es un atajo, como fecha de Madrid "YYYY-MM-DDTHH:mm". «Esta tarde» ya pasada
 * (después de las 19:00) no existe: null. «En 1 hora» se redondea al minuto de arriba.
 */
export function atajoRecordatorio(atajo: Atajo, ahora = new Date()): string | null {
  if (atajo === "1h") return enMadrid(new Date(Math.ceil((ahora.getTime() + 3600_000) / 60_000) * 60_000));
  const hoy = enMadrid(ahora).slice(0, 10);
  if (atajo === "tarde") return horaMadrid(hoy, 19, 0) > ahora ? `${hoy}T19:00` : null;
  return `${sumaDias(hoy, 1)}T${String(HORA_AVISO).padStart(2, "0")}:00`;
}

/**
 * El recordatorio rápido de una página es un párrafo arriba del todo con «Recordatorio:» y
 * una mención de fecha con aviso a la hora (como el «Remind me» de Notion): se ve en la
 * página, se puede borrar a mano y el servidor lo avisa como cualquier mención.
 */
export const ROTULO_RAPIDO = "Recordatorio:";
type BloqueR = { id?: string; type?: string; content?: unknown };
type InlineR = { type?: string; text?: string; props?: { fecha?: unknown; recordatorio?: unknown; por?: unknown } };

export function bloqueRecordatorio(id: string, fecha: string, por: string) {
  return {
    id,
    type: "paragraph",
    props: {},
    content: [
      { type: "text", text: `${ROTULO_RAPIDO} `, styles: { bold: true } },
      { type: "dateMention", props: { fecha, recordatorio: "0", por } },
    ],
    children: [],
  };
}

/** El recordatorio rápido de esa persona en la página (de primer nivel), si lo hay. */
export function recordatorioRapido(bloques: unknown, por: string): { id: string; fecha: string } | null {
  if (!Array.isArray(bloques)) return null;
  for (const b of bloques as BloqueR[]) {
    if (b?.type !== "paragraph" || !Array.isArray(b.content) || !b.id) continue;
    const c = (b.content as InlineR[]).filter((x) => !(x?.type === "text" && !x.text?.trim()));
    if (c.length !== 2 || c[0]?.type !== "text" || c[0].text?.trim() !== ROTULO_RAPIDO) continue;
    const m = c[1];
    if (m?.type === "dateMention" && m.props?.por === por && typeof m.props.fecha === "string" && m.props.recordatorio)
      return { id: b.id, fecha: m.props.fecha };
  }
  return null;
}
