import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { cellToText, peopleOf } from "@/server/services/cells";
import type { PublicDbTable } from "@/components/editor/databaseBlock";
import { formatDate, formatNumber, type FieldLite } from "@/lib/cellText";
import { publicCookieName, publicCookieValue } from "@/server/publicAuth";

/**
 * Carga compartida de las rutas públicas (/s/<token> y sus subpáginas):
 * la raíz publicada, la puerta de contraseña y las tablas de BD resueltas.
 */

/** La página publicada del token, o null si no existe, está borrada o caducó. */
export async function raizPublica(token: string) {
  const page = await db.page.findUnique({ where: { publicToken: token } });
  if (!page || page.archivedAt) return null;
  // Enlace caducado = enlace muerto, indistinguible de no publicado.
  if (page.publicExpiresAt && page.publicExpiresAt < new Date()) return null;
  return page;
}

/** ¿La cookie firmada da paso? (true también si la página no lleva contraseña). */
export async function puertaAbierta(token: string, publicPassword: string | null) {
  if (!publicPassword) return true;
  const jar = await cookies();
  return jar.get(publicCookieName(token))?.value === publicCookieValue(token, publicPassword);
}

/**
 * ¿`childId` cuelga de `rootId`? Sube por parentId (con tope por si hubiera un
 * ciclo). Solo páginas vivas del mismo workspace.
 */
export async function esDescendiente(rootId: string, childId: string, workspaceId: string) {
  let cur = await db.page.findFirst({
    where: { id: childId, workspaceId, archivedAt: null, embedded: false },
    select: { id: true, parentId: true },
  });
  for (let i = 0; cur && i < 50; i++) {
    if (cur.id === rootId) return true;
    if (!cur.parentId) return false;
    cur = await db.page.findFirst({
      where: { id: cur.parentId, workspaceId, archivedAt: null },
      select: { id: true, parentId: true },
    });
  }
  return false;
}

type Col = NonNullable<Awaited<ReturnType<typeof loadCollection>>>;

function loadCollection(where: { pageId: string } | { id: string; page: { workspaceId: string } }) {
  return db.collection.findFirst({
    where,
    include: {
      fields: { orderBy: { order: "asc" } },
      records: { where: { archivedAt: null }, orderBy: { order: "asc" } },
    },
  });
}

/**
 * El texto de una celda tal como se ve en la app. cellToText da el del CSV (fechas
 * ISO, «12.5», «true»), que en una página publicada se leía como datos en crudo.
 */
function textoVisible(f: Col["fields"][number], v: unknown, r: Col["records"][number], people: Map<string, string>): string {
  const campo = f as unknown as FieldLite;
  if (f.type === "date") return formatDate(v, campo);
  if (f.type === "number") return v === null || v === undefined || v === "" ? "" : formatNumber(v, campo);
  if (f.type === "checkbox") return v ? "✓" : "";
  if (f.type === "created_time" || f.type === "last_edited_time")
    return formatDate((f.type === "created_time" ? r.createdAt : r.updatedAt).toISOString().slice(0, 10), campo);
  return cellToText(f, v, r, people);
}

/** Colección → tabla estática. Campos computados (relación/rollup/fórmula) fuera: sus celdas no tienen valor legible. */
function tableOf(col: Col, people: Map<string, string>): PublicDbTable {
  const fields = col.fields.filter((f) => !["relation", "rollup", "formula"].includes(f.type));
  return {
    headers: fields.map((f) => f.name),
    rows: col.records.map((r) => {
      const cells = (r.cells ?? {}) as Record<string, unknown>;
      return fields.map((f) => textoVisible(f, cells[f.id], r, people));
    }),
  };
}

/** Ids de colección de los bloques "database" embebidos en un documento de bloques. */
function collectEmbeddedIds(node: unknown, ids: Set<string>) {
  if (Array.isArray(node)) {
    for (const n of node) collectEmbeddedIds(n, ids);
  } else if (node && typeof node === "object") {
    const b = node as { type?: string; props?: { collectionId?: string }; children?: unknown };
    if (b.type === "database" && b.props?.collectionId) ids.add(b.props.collectionId);
    collectEmbeddedIds(b.children, ids);
  }
}

/** Las tablas que necesita PublicView para una página: la propia (si es BD) y las embebidas. */
export async function tablasPublicas(page: { id: string; type: string; content: unknown; workspaceId: string }) {
  let table: PublicDbTable | null = null;
  if (page.type === "database") {
    const col = await loadCollection({ pageId: page.id });
    if (col) table = tableOf(col, await peopleOf(db, page.workspaceId, col.fields));
  }
  const dbTables: Record<string, PublicDbTable> = {};
  const ids = new Set<string>();
  collectEmbeddedIds(page.content, ids);
  for (const id of ids) {
    const col = await loadCollection({ id, page: { workspaceId: page.workspaceId } });
    if (col) dbTables[id] = tableOf(col, await peopleOf(db, page.workspaceId, col.fields));
  }
  return { table, dbTables };
}
