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
import { cuandoEvento, dentroDeUnaHora, enMadrid, momentoRecordatorio, posponCelda, posponMencion } from "@/lib/recordatorios";
import { aplicarOpsJson, type BloqueBN } from "./app/bloquesYjs";
import { aplicarOpsPagina, leerBloquesPagina } from "./app/documento";
import { guardaContenidoPagina } from "./services/pages";
import { jsonLimpio } from "./jsonLimpio";
import { valorHecho } from "@/lib/tareas";
import { nivelDePagina, alcanza } from "./services/perms";
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

  // Menciones con aviso en el cuerpo de una fila (el recordatorio rápido de una fila, «Recordarme…»).
  const idsCuerpos = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "Record" WHERE "archivedAt" IS NULL AND content::text LIKE '%"recordatorio": "_%'`;
  if (idsCuerpos.length) {
    const filas = await db.record.findMany({
      where: {
        id: { in: idsCuerpos.map((r) => r.id) },
        archivedAt: null,
        collection: { page: { archivedAt: null, ...(filtro.workspaceId ? { workspaceId: filtro.workspaceId } : {}) } },
      },
      select: {
        id: true, cells: true, content: true,
        collection: { select: { pageId: true, page: { select: { workspaceId: true } }, fields: { select: { id: true, type: true }, orderBy: { order: "asc" } } } },
      },
    });
    for (const r of filas) {
      const tit = r.collection.fields.find((f) => f.type === "text");
      const cells = (r.cells ?? {}) as Record<string, unknown>;
      const titulo = (tit && typeof cells[tit.id] === "string" ? (cells[tit.id] as string) : "").trim() || "Sin título";
      for (const m of mencionesConAviso(r.content)) {
        const cuando = momentoRecordatorio(m.fecha, m.antes);
        if (!dentro(cuando)) continue;
        out.push({
          key: `rem:${r.id}:${cuando.toISOString()}:${m.por}`, cuando, inicio: m.fecha, titulo,
          workspaceId: r.collection.page.workspaceId, pageId: r.collection.pageId, recordId: r.id, userIds: [m.por],
        });
      }
    }
  }

  // Los pospuestos («Posponer 1 h» de la notificación): uno por persona.
  const pospuestos = await db.pospuesto.findMany({
    where: { cuando: { gte: desde, lte: hasta }, page: { archivedAt: null }, ...(filtro.workspaceId ? { workspaceId: filtro.workspaceId } : {}), ...(filtro.userId ? { userId: filtro.userId } : {}) },
  });
  for (const p of pospuestos) {
    out.push({
      key: `pos:${p.id}`, cuando: p.cuando, inicio: enMadrid(p.cuando), titulo: p.titulo,
      workspaceId: p.workspaceId, pageId: p.pageId, recordId: p.recordId, userIds: [p.userId],
    });
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
      // Con esto el service worker pone los botones «Hecho» y «Posponer 1 h».
      recordatorio: { key: r.key, pageId: r.pageId, recordId: r.recordId, titulo: r.titulo },
    });
  }
  return creados;
}

/** Lo que sabe un botón de la notificación sobre su recordatorio. */
export type AvisoRecordatorio = { key: string; pageId: string; recordId?: string | null; titulo?: string };

/**
 * Los botones de la notificación (push de la web y alarma de la app), con la sesión de
 * quien la recibe (sea cual sea su espacio activo):
 * - «Hecho»: en una fila con casilla o estado, la marca hecha; en lo demás, descarta.
 * - «Posponer 1 h»: si el aviso era a la hora de su fecha, mueve esa fecha (la mención o
 *   la celda) a dentro de una hora; si era «N antes» de un evento, el evento se queda y
 *   el aviso se repite dentro de una hora (`Pospuesto`). Ver `posponMencion`.
 * En los dos, el aviso de la bandeja queda leído. Lanza un Error con el porqué si no puede.
 */
export async function accionRecordatorio(
  db: Db,
  userId: string,
  accion: "hecho" | "posponer",
  a: AvisoRecordatorio,
  ahora = new Date(),
): Promise<{ hecha?: boolean; pospuesto?: { key: string; cuando: string } }> {
  const page = await db.page.findFirst({ where: { id: a.pageId, archivedAt: null }, select: { id: true, workspaceId: true, title: true, workspace: { select: { ownerId: true } } } });
  if (!page) throw new Error("La página ya no existe.");
  const rol =
    page.workspace.ownerId === userId
      ? "owner"
      : (await db.member.findUnique({ where: { workspaceId_userId: { workspaceId: page.workspaceId, userId } }, select: { role: true } }))?.role;
  if (!rol) throw new Error("No tienes acceso a esa página.");
  const nivel = await nivelDePagina(db, page.id, userId, rol);
  if (!alcanza(nivel, "view")) throw new Error("No tienes acceso a esa página.");
  await db.notification.updateMany({ where: { userId, key: a.key }, data: { read: true } });

  if (accion === "posponer") {
    const nueva = dentroDeUnaHora(ahora);
    if (alcanza(nivel, "edit") && rol !== "viewer") {
      const movido = await mueveRecordatorio(db, userId, page, a, nueva).catch((e) => {
        console.error("[recordatorios] posponer", e);
        return null;
      });
      if (movido) return { pospuesto: { key: movido, cuando: momentoRecordatorio(nueva, "0")!.toISOString() } };
    }
    const p = await db.pospuesto.create({
      data: {
        userId, workspaceId: page.workspaceId, pageId: page.id, recordId: a.recordId ?? null,
        titulo: (a.titulo ?? "").slice(0, 200) || page.title || "Sin título",
        cuando: new Date(ahora.getTime() + 3600_000),
      },
    });
    // Los ya disparados de hace días no sirven: se limpian aquí, sin otra vuelta.
    await db.pospuesto.deleteMany({ where: { cuando: { lt: new Date(ahora.getTime() - 2 * 864e5) } } });
    return { pospuesto: { key: `pos:${p.id}`, cuando: p.cuando.toISOString() } };
  }

  if (!a.recordId) return {};
  if (!alcanza(nivel, "edit") || rol === "viewer") throw new Error("Solo lectura: no puedes marcarla.");
  const fila = await db.record.findFirst({
    where: { id: a.recordId, archivedAt: null, collection: { pageId: page.id } },
    select: { id: true, collection: { select: { fields: { select: { id: true, type: true, config: true }, orderBy: { order: "asc" } } } } },
  });
  const v = fila && valorHecho(fila.collection.fields);
  if (!v) return {};
  // El mismo merge en Postgres que db.updateCell (solo esa clave).
  await db.$executeRaw`UPDATE "Record" SET cells = cells || ${JSON.stringify({ [v.fieldId]: v.value })}::jsonb, "updatedById" = ${userId}, "updatedAt" = now() WHERE id = ${fila!.id}`;
  return { hecha: true };
}

/**
 * «Posponer 1 h» moviendo la propia fecha (aviso a la hora del evento): una mención de
 * fecha de una página o del cuerpo de una fila, o una celda de fecha. Devuelve la clave
 * del aviso nuevo, o null si no había nada que mover (el llamante pone un `Pospuesto`).
 */
async function mueveRecordatorio(
  db: Db,
  userId: string,
  page: { id: string; workspaceId: string },
  a: AvisoRecordatorio,
  nueva: string,
): Promise<string | null> {
  const iso = momentoRecordatorio(nueva, "0")!.toISOString();
  // Mención: rem:<página o fila>:<instante>:<quien la puso>. Celda: rem:<fila>:<campo>:<instante>.
  const mencion = /^rem:([^:]+):(\d{4}-\d{2}-\d{2}T[\d:.]+Z):(.+)$/.exec(a.key);
  const celda = /^rem:([^:]+):([^:]+):(\d{4}-\d{2}-\d{2}T[\d:.]+Z)$/.exec(a.key);
  if (mencion && mencion[3] === userId) {
    const [, id, antes] = mencion;
    if (id === page.id && !a.recordId) {
      const p = await db.page.findUniqueOrThrow({ where: { id: page.id }, select: { id: true, type: true, content: true, ydoc: true } });
      const bloque = posponMencion(await leerBloquesPagina(p), antes, userId, nueva);
      if (!bloque) return null;
      const bloques = await aplicarOpsPagina(db, page.id, [{ op: "upsert", block: bloque as BloqueBN }]);
      const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, email: true } });
      await guardaContenidoPagina(db, { workspaceId: page.workspaceId, user }, p, bloques);
      return `rem:${page.id}:${iso}:${userId}`;
    }
    if (id === a.recordId) {
      const hecho = await db.$transaction(async (tx) => {
        const [fila] = await tx.$queryRaw<{ content: unknown }[]>`SELECT content FROM "Record" WHERE id = ${id} AND "archivedAt" IS NULL FOR UPDATE`;
        const actuales = Array.isArray(fila?.content) ? (fila.content as BloqueBN[]) : [];
        const bloque = posponMencion(actuales, antes, userId, nueva);
        if (!bloque) return false;
        await tx.record.update({ where: { id }, data: { content: jsonLimpio(aplicarOpsJson(actuales, [{ op: "upsert", block: bloque as BloqueBN }])), updatedById: userId } });
        return true;
      });
      return hecho ? `rem:${id}:${iso}:${userId}` : null;
    }
    return null;
  }
  if (celda && celda[1] === a.recordId) {
    const [, recordId, fieldId, antes] = celda;
    const fila = await db.record.findFirst({ where: { id: recordId, archivedAt: null, collection: { pageId: page.id } }, select: { cells: true } });
    const v = posponCelda(((fila?.cells ?? {}) as Record<string, unknown>)[fieldId], antes, nueva);
    if (!v) return null;
    await db.$executeRaw`UPDATE "Record" SET cells = cells || ${JSON.stringify({ [fieldId]: v })}::jsonb, "updatedById" = ${userId}, "updatedAt" = now() WHERE id = ${recordId}`;
    return `rem:${recordId}:${fieldId}:${iso}`;
  }
  return null;
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
