/**
 * Los enlaces a las subpáginas dentro de su madre, como los bloques «página» de Notion.
 *
 * Un enlace a página es un párrafo con SOLO la mención de esa página (lo que deja
 * `/subpágina`). El servidor los mantiene al crear, mover, duplicar y renombrar
 * páginas, escribiendo en el documento Yjs vivo de la madre por el mismo camino que la
 * app nativa (`app/documento.ts`): quien la tenga abierta lo ve al momento, en cualquier
 * equipo, y lo que esté escribiendo no se pisa (son operaciones por bloque).
 */
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { BloqueBN, OpBloque } from "./app/bloquesYjs";
import { aplicarOpsPagina, leerBloquesPagina } from "./app/documento";
import { jsonLimpio } from "./jsonLimpio";
import { arreglosEnlaces, bloqueEnlace, enlaceDe, enlaces, enlacesA, idEnlace, sitioValido, ultimoBloque, type Arreglo, type Sitio } from "@/lib/subpaginas";

export { enlaceDe, enlacesA, idEnlace, ultimoBloque };

type DB = typeof import("@/lib/db").db;
type Pagina = { id: string; title: string; icon: string | null };

/**
 * Lo que la app nativa manda al poner ella el enlace en el cursor (su `/subpágina`):
 * crea la hija con `pages.create`, que ya dejó el enlace al final, y luego inserta el
 * suyo. Se añade el borrado del de servidor para que no queden dos.
 */
export function sinEnlaceDoble(ops: OpBloque[]): OpBloque[] {
  const extra: OpBloque[] = [];
  for (const op of ops) {
    if (op.op !== "upsert") continue;
    const id = enlaceDe(op.block);
    if (id && op.block.id !== idEnlace(id)) extra.push({ op: "delete", id: idEnlace(id) });
  }
  return [...ops, ...extra];
}

/** Aplica a una página de documento las operaciones que salgan de sus bloques actuales y refresca su copia legible. */
async function cambiaPagina(db: DB, pageId: string, calcula: (bs: BloqueBN[]) => OpBloque[]) {
  const page = await db.page.findUnique({ where: { id: pageId }, select: { id: true, type: true, content: true, ydoc: true } });
  if (!page || page.type !== "doc") return;
  const ops = calcula(await leerBloquesPagina(page));
  if (!ops.length) return;
  const bloques = await aplicarOpsPagina(db, pageId, ops);
  await db.page.update({ where: { id: pageId }, data: { content: jsonLimpio(bloques) as Prisma.InputJsonValue } });
}

/**
 * Pone el enlace a la hija en la madre: al final o, con `detrasDe`, justo detrás del
 * enlace a esa otra página (duplicar), o en `sitio` (donde estaba al ir a la papelera)
 * si ese sitio sigue existiendo. Si ya hay uno, no pone otro.
 */
export async function enlazar(db: DB, madreId: string, hija: Pagina, detrasDe?: string, sitio?: Sitio | null) {
  await cambiaPagina(db, madreId, (bs) => {
    if (enlacesA(bs, hija.id).length) return [];
    const junto = detrasDe ? enlacesA(bs, detrasDe)[0] : undefined;
    const donde = junto ? { parentId: junto.parentId, afterId: junto.id } : sitio && sitioValido(bs, sitio) ? sitio : { parentId: null, afterId: ultimoBloque(bs) };
    return [{ op: "upsert", block: bloqueEnlace(hija), ...donde }];
  });
}

/**
 * Lleva bloques al final de otra página («Mover a», soltar un bloque en el panel
 * lateral). Con ids nuevos: en la página de destino podría haber ya uno igual.
 */
export async function anadirAlFinal(db: DB, pageId: string, bloques: BloqueBN[]) {
  const nuevo = (b: BloqueBN): BloqueBN => ({ ...b, id: randomUUID(), children: (b.children ?? []).map(nuevo) });
  await cambiaPagina(db, pageId, (bs) => {
    let detras = ultimoBloque(bs);
    return bloques.map((b) => {
      const block = nuevo(b);
      const op = { op: "upsert" as const, block, parentId: null, afterId: detras };
      detras = block.id;
      return op;
    });
  });
}

/**
 * Quita de la madre los enlaces a la hija (al moverla a otra, al mandarla a la
 * papelera). Las menciones dentro de un texto se quedan. Devuelve dónde estaba el primero.
 */
export async function desenlazar(db: DB, madreId: string, hijaId: string): Promise<Sitio | null> {
  let sitio: Sitio | null = null;
  await cambiaPagina(db, madreId, (bs) => {
    const es = enlacesA(bs, hijaId);
    if (es[0]) sitio = { parentId: es[0].parentId, afterId: es[0].afterId };
    return es.map((e) => ({ op: "delete" as const, id: e.id }));
  });
  return sitio;
}

/**
 * Páginas borradas del todo (purga, vaciar la papelera): fuera los enlaces que
 * quedaran apuntándolas en cualquier página del espacio (los párrafos de enlace; las
 * menciones dentro de un texto se quedan, como en Notion).
 */
export async function quitarEnlacesA(db: DB, workspaceId: string, ids: string[]) {
  if (!ids.length) return;
  const fuera = new Set(ids);
  const donde = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Page"
    WHERE "workspaceId" = ${workspaceId} AND type = 'doc' AND "archivedAt" IS NULL
      AND content::text ~ ${ids.map((id) => id.replace(/[^\w-]/g, "")).join("|")}`;
  for (const { id } of donde) {
    await cambiaPagina(db, id, (bs) => enlaces(bs).filter((e) => fuera.has(e.pageId)).map((e) => ({ op: "delete" as const, id: e.id })));
  }
}

/** Las operaciones de unos arreglos sobre los bloques de una madre (los «crear», al final y en orden). */
export function opsDeArreglos(bs: BloqueBN[], arreglos: Arreglo[], paginas: Map<string, Pagina>): OpBloque[] {
  // Detrás de un bloque que sigue: el último podría ser uno de los que se quitan.
  const quitados = new Set(arreglos.flatMap((a) => (a.tipo === "crear" ? [] : [a.blockId])));
  let detras = ultimoBloque(bs.filter((b) => !quitados.has(b.id)));
  return arreglos.flatMap((a): OpBloque[] => {
    if (a.tipo !== "crear") return [{ op: "delete", id: a.blockId }];
    const p = paginas.get(a.pageId);
    if (!p) return [];
    const block = bloqueEnlace(p);
    const op = { op: "upsert" as const, block, parentId: null, afterId: detras };
    detras = block.id;
    return [op];
  });
}

// Una cola por página: al teclear el título llegan varios renombres seguidos y el
// último que se aplique tiene que ser el último título (se lee al aplicarlo).
const colas = new Map<string, Promise<void>>();

/**
 * Lleva el título y el icono de una página a todas sus menciones (los enlaces de la
 * madre y las de cualquier otra página), en vivo para quien las tenga abiertas.
 * No espera: se encola y vuelve.
 */
export function renombrarEnlaces(db: DB, workspaceId: string, pageId: string) {
  const sigue = (colas.get(pageId) ?? Promise.resolve())
    .then(async () => {
      const p = await db.page.findUnique({ where: { id: pageId }, select: { id: true, title: true, icon: true, parentId: true } });
      if (!p) return;
      // Donde se la menciona (la copia legible lleva el id) y, siempre, su madre.
      const donde = await db.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Page"
        WHERE "workspaceId" = ${workspaceId} AND type = 'doc' AND id <> ${pageId}
          AND ("id" = ${p.parentId ?? ""} OR content::text LIKE ${"%" + pageId + "%"})`;
      const op = { op: "mencion" as const, pageId, title: p.title, icon: p.icon ?? "" };
      for (const { id } of donde) {
        await cambiaPagina(db, id, (bs) => (desfasada(bs, op) ? [op] : []));
      }
    })
    .catch((e) => console.error("[subpaginas] renombrar enlaces", e));
  colas.set(pageId, sigue);
  void sigue.finally(() => colas.get(pageId) === sigue && colas.delete(pageId));
}

/** Las menciones de página de un contenido: id → { título, icono } guardados en el chip. */
function menciones(v: unknown, out = new Map<string, { title: unknown; icon: unknown }>()) {
  if (Array.isArray(v)) v.forEach((x) => menciones(x, out));
  else if (v && typeof v === "object") {
    const o = v as { type?: string; props?: Record<string, unknown> };
    if (o.type === "mention" && typeof o.props?.pageId === "string") out.set(o.props.pageId, { title: o.props.title, icon: o.props.icon ?? "" });
    else Object.values(o).forEach((x) => menciones(x, out));
  }
  return out;
}

/**
 * Al abrir una página: si alguna mención enseña un título o icono viejo (las de antes
 * de que se pusieran al día solas guardaban «Sin título»), se arregla en su documento.
 * No espera.
 */
export function repararMenciones(db: DB, workspaceId: string, page: { id: string; type: string; content: Prisma.JsonValue | null }) {
  if (page.type !== "doc") return;
  const vistas = menciones(page.content);
  if (!vistas.size) return;
  void (async () => {
    const reales = await db.page.findMany({
      where: { id: { in: [...vistas.keys()] }, workspaceId },
      select: { id: true, title: true, icon: true },
    });
    const ops = reales
      .filter((p) => vistas.get(p.id)!.title !== p.title || vistas.get(p.id)!.icon !== (p.icon ?? ""))
      .map((p) => ({ op: "mencion" as const, pageId: p.id, title: p.title, icon: p.icon ?? "" }));
    if (ops.length) await cambiaPagina(db, page.id, (bs) => ops.filter((op) => desfasada(bs, op)));
  })().catch((e) => console.error("[subpaginas] reparar menciones", e));
}

/** ¿Alguna mención de la página tiene otro título o icono? */
function desfasada(v: unknown, op: { pageId: string; title: string; icon: string }): boolean {
  if (Array.isArray(v)) return v.some((x) => desfasada(x, op));
  if (!v || typeof v !== "object") return false;
  const o = v as { type?: string; props?: Record<string, unknown> };
  if (o.type === "mention" && o.props?.pageId === op.pageId) return o.props.title !== op.title || (o.props.icon ?? "") !== op.icon;
  return Object.values(o).some((x) => desfasada(x, op));
}
