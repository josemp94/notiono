/**
 * Mandar páginas a la papelera y sacarlas, en la base de datos. Lo usan el router de
 * páginas (el árbol, la app, la papelera) y el servidor de colaboración (borrar el
 * enlace a una subpágina dentro de su madre, `collab/hocuspocus.ts`). Los enlaces en
 * el contenido los pone y quita quien llama (`subpaginas.ts`).
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { rankAtEnd } from "@/lib/fractional";
import type { Sitio } from "@/lib/subpaginas";

type DB = PrismaClient;

/** La página y todo lo que cuelga de ella (ids). */
export async function subarbol(db: DB, workspaceId: string, rootId: string): Promise<string[]> {
  const all = await db.page.findMany({ where: { workspaceId }, select: { id: true, parentId: true } });
  const byParent = new Map<string, string[]>();
  for (const p of all) if (p.parentId) byParent.set(p.parentId, [...(byParent.get(p.parentId) ?? []), p.id]);
  const result: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    result.push(id);
    stack.push(...(byParent.get(id) ?? []));
  }
  return result;
}

/**
 * A la papelera con su subárbol. Lo que ya estaba en ella conserva su fecha: así, al
 * restaurar, vuelve solo lo que se fue a la vez (lo borrado antes por su cuenta, no).
 * `sitio`: dónde estaba su enlace en la madre, para ponerlo ahí al restaurar.
 */
export async function archivarPagina(
  db: DB,
  page: { id: string; workspaceId: string },
  userId: string | null,
  sitio?: Sitio | null,
) {
  const ids = await subarbol(db, page.workspaceId, page.id);
  await db.page.updateMany({ where: { id: { in: ids }, archivedAt: null }, data: { archivedAt: new Date(), archivedById: userId } });
  if (sitio) await db.page.update({ where: { id: page.id }, data: { sitioEnlace: sitio } });
  return ids;
}

/**
 * Saca de la papelera la página y lo que se fue con ella. Si su madre sigue en la
 * papelera o ya no existe, vuelve a la raíz del espacio (como Notion). Devuelve la
 * página con su madre de ahora y dónde estaba su enlace (null si no estaba en la papelera).
 */
export async function sacarDePapelera(db: DB, id: string) {
  const p = await db.page.findUnique({
    where: { id },
    select: { id: true, workspaceId: true, title: true, icon: true, parentId: true, archivedAt: true, sitioEnlace: true, parent: { select: { archivedAt: true } } },
  });
  if (!p?.archivedAt) return null;
  const ids = await subarbol(db, p.workspaceId, p.id);
  await db.page.updateMany({ where: { id: { in: ids }, archivedAt: p.archivedAt }, data: { archivedAt: null, archivedById: null } });
  let parentId = p.parentId;
  if (parentId && (!p.parent || p.parent.archivedAt)) {
    const last = await db.page.findFirst({
      where: { workspaceId: p.workspaceId, parentId: null, archivedAt: null, id: { not: p.id } },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    parentId = null;
    await db.page.update({ where: { id: p.id }, data: { parentId, order: rankAtEnd(last?.order ?? null) } });
  }
  await db.page.update({ where: { id: p.id }, data: { sitioEnlace: Prisma.DbNull } });
  return { id: p.id, title: p.title, icon: p.icon, parentId, sitio: (p.sitioEnlace ?? null) as Sitio | null };
}
