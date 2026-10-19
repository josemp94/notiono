/**
 * Recordatorios a su hora (como los de Notion): en una celda de fecha de una base de
 * datos (`{ start, reminder: "1h", reminderBy }`) o en una mención de fecha de una página
 * (props `recordatorio` y `por`). Las cuentas de cuándo saltan están en
 * src/lib/recordatorios.ts.
 *
 * Un intervalo en el proceso del servidor (src/instrumentation.ts) mira cada minuto lo
 * que ya tocaba y crea el aviso de la bandeja (tipo `reminder`, `key` única: nunca dos
 * veces) y el push, que también lleva el puente a WhatsApp. No depende de que nadie
 * abra nada. La app de Android baja los próximos (`app.recordatorios`) y los programa
 * en el móvil con alarmas, para que suenen a su hora aunque el sistema duerma la app.
 *
 * A quién avisa: en una fila, a las personas de sus campos Persona; si no tiene a nadie,
 * a quien puso el recordatorio. En una página, a quien lo puso.
 */
import { db as dbReal } from "@/lib/db";
import { dateValue } from "@/lib/cellText";
import { cuandoEvento, momentoRecordatorio } from "@/lib/recordatorios";
import { filtraQuienesVen } from "./services/perms";
import { sendPush } from "./push";

type Db = typeof dbReal;

export type Recordatorio = {
  key: string;
  cuando: Date;
  /** Inicio del evento ("YYYY-MM-DD" o con "THH:mm"), para el texto «hoy a las 17:00». */
  inicio: string;
  titulo: string;
  workspaceId: string;
  /** La página que se abre: la base de datos de la fila o la página de la mención. */
  pageId: string;
  recordId: string | null;
  userIds: string[];
};

/** Un aviso salta como mucho con este retraso (si el servidor estuvo parado); lo más viejo ya no. */
export const MARGEN_ATRASO_MS = 12 * 3600_000;

type Bloque = { content?: unknown; children?: unknown };

/** Las menciones de fecha con recordatorio de un documento de bloques, en orden. */
function mencionesConAviso(bloques: unknown): { fecha: string; antes: string; por: string }[] {
  const out: { fecha: string; antes: string; por: string }[] = [];
  const mira = (bs: unknown) => {
    if (!Array.isArray(bs)) return;
    for (const b of bs as Bloque[]) {
      const contenido = Array.isArray(b?.content) ? b.content : [];
      // Las celdas de una tabla guardan su contenido un nivel más abajo.
      const rows = (b?.content as { rows?: { cells?: unknown[] }[] } | undefined)?.rows;
      const trozos = [...contenido, ...(rows ?? []).flatMap((r) => (r.cells ?? []).flatMap((c) => (Array.isArray(c) ? c : ((c as { content?: unknown[] })?.content ?? []))))];
      for (const t of trozos as { type?: string; props?: { fecha?: unknown; recordatorio?: unknown; por?: unknown } }[]) {
        if (t?.type !== "dateMention") continue;
        const { fecha, recordatorio, por } = t.props ?? {};
        if (typeof fecha === "string" && typeof recordatorio === "string" && recordatorio && typeof por === "string" && por) {
          out.push({ fecha, antes: recordatorio, por });
        }
      }
      mira(b?.children);
    }
  };
  mira(bloques);
  return out;
}

/**
 * Los recordatorios que saltan entre `desde` y `hasta` (incluidos), ya con a quién
 * avisar (solo quien puede ver la página). Con `userId`, solo los suyos.
 */
export async function recordatoriosEntre(db: Db, desde: Date, hasta: Date, filtro: { workspaceId?: string; userId?: string } = {}): Promise<Recordatorio[]> {
  const out: Recordatorio[] = [];
  const dentro = (d: Date | null): d is Date => !!d && d >= desde && d <= hasta;

  // Filas: un primer filtro barato en Postgres (el texto de las celdas) y el resto aquí.
  const idsFilas = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "Record" WHERE "archivedAt" IS NULL AND cells::text LIKE '%"reminder": "%'`;
  if (idsFilas.length) {
    const filas = await db.record.findMany({
      where: {
        id: { in: idsFilas.map((r) => r.id) },
        archivedAt: null,
        collection: { page: { archivedAt: null, ...(filtro.workspaceId ? { workspaceId: filtro.workspaceId } : {}) } },
      },
      select: {
        id: true, cells: true, createdById: true,
        collection: { select: { pageId: true, page: { select: { workspaceId: true } }, fields: { select: { id: true, type: true }, orderBy: { order: "asc" } } } },
      },
    });
    for (const r of filas) {
      const cells = (r.cells ?? {}) as Record<string, unknown>;
      const campos = r.collection.fields;
      const tit = campos.find((f) => f.type === "text");
      const titulo = (tit && typeof cells[tit.id] === "string" ? (cells[tit.id] as string) : "").trim() || "Sin título";
      const asignados = campos
        .filter((f) => f.type === "person")
        .flatMap((f) => (Array.isArray(cells[f.id]) ? (cells[f.id] as unknown[]) : []))
        .filter((u): u is string => typeof u === "string");
      for (const f of campos) {
        if (f.type !== "date") continue;
        const v = dateValue(cells[f.id]);
        if (!v?.reminder) continue;
        const cuando = momentoRecordatorio(v.start, v.reminder);
        if (!dentro(cuando)) continue;
        const quien = asignados.length ? asignados : [v.reminderBy ?? r.createdById].filter((u): u is string => !!u);
        out.push({
          key: `rem:${r.id}:${f.id}:${cuando.toISOString()}`, cuando, inicio: v.start, titulo,
          workspaceId: r.collection.page.workspaceId, pageId: r.collection.pageId, recordId: r.id, userIds: quien,
        });
      }
    }
  }

  // Menciones de fecha en páginas (Page.content es la copia legible del documento).
  const idsPaginas = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "Page" WHERE "archivedAt" IS NULL AND content::text LIKE '%"recordatorio": "_%'`;
  if (idsPaginas.length) {
    const paginas = await db.page.findMany({
      where: { id: { in: idsPaginas.map((p) => p.id) }, archivedAt: null, ...(filtro.workspaceId ? { workspaceId: filtro.workspaceId } : {}) },
      select: { id: true, title: true, workspaceId: true, content: true },
    });
    for (const p of paginas) {
      for (const m of mencionesConAviso(p.content)) {
        const cuando = momentoRecordatorio(m.fecha, m.antes);
        if (!dentro(cuando)) continue;
        out.push({
          key: `rem:${p.id}:${cuando.toISOString()}:${m.por}`, cuando, inicio: m.fecha, titulo: p.title.trim() || "Sin título",
          workspaceId: p.workspaceId, pageId: p.id, recordId: null, userIds: [m.por],
        });
      }
    }
  }

  for (const r of out) {
    r.userIds = await filtraQuienesVen(db, r.workspaceId, r.pageId, filtro.userId ? r.userIds.filter((u) => u === filtro.userId) : r.userIds);
  }
  return out.filter((r) => r.userIds.length).sort((a, b) => a.cuando.getTime() - b.cuando.getTime());
}

/** El texto del aviso: «Comprar pan · hoy a las 17:00». */
export function textoAviso(r: Pick<Recordatorio, "titulo" | "inicio">, ahora = new Date()): string {
  return `${r.titulo} · ${cuandoEvento(r.inicio, ahora)}`;
}

/**
 * Crea los avisos de lo que ya tocaba (hasta `MARGEN_ATRASO_MS` de retraso) y manda el
 * push de los que son nuevos. Devuelve cuántos avisos creó.
 */
export async function disparaRecordatorios(db: Db, ahora = new Date(), avisa: typeof sendPush = sendPush): Promise<number> {
  const toca = await recordatoriosEntre(db, new Date(ahora.getTime() - MARGEN_ATRASO_MS), ahora);
  if (!toca.length) return 0;
  const avisos = toca.flatMap((r) => r.userIds.map((userId) => ({ r, userId })));
  const ya = await db.notification.findMany({
    where: { OR: avisos.map((a) => ({ userId: a.userId, key: a.r.key })) },
    select: { userId: true, key: true },
  });
  const hechos = new Set(ya.map((n) => `${n.userId} ${n.key}`));
  let creados = 0;
  for (const { r, userId } of avisos) {
    if (hechos.has(`${userId} ${r.key}`)) continue;
    // skipDuplicates + índice único (userId, key): aunque dos pasadas se crucen, uno solo.
    const res = await db.notification.createMany({
      data: [{ userId, workspaceId: r.workspaceId, type: "reminder", key: r.key, title: r.titulo, pageId: r.pageId, recordId: r.recordId }],
      skipDuplicates: true,
    });
    if (!res.count) continue;
    creados++;
    avisa(userId, {
      title: "Recordatorio",
      body: textoAviso(r, ahora),
      url: r.recordId ? `/p/${r.pageId}?r=${r.recordId}` : `/p/${r.pageId}`,
    });
  }
  return creados;
}

/** Arranca la vuelta de cada minuto (una sola por proceso). */
export function arrancaRecordatorios(db: Db = dbReal) {
  const g = globalThis as unknown as { __notionoRecordatorios?: NodeJS.Timeout };
  if (g.__notionoRecordatorios) return;
  let ocupado = false;
  const vuelta = async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      await disparaRecordatorios(db);
    } catch (e) {
      console.error("[recordatorios]", e);
    } finally {
      ocupado = false;
    }
  };
  g.__notionoRecordatorios = setInterval(vuelta, 60_000);
  g.__notionoRecordatorios.unref?.();
  void vuelta();
}
