import { TRPCError } from "@trpc/server";

type Db = typeof import("@/lib/db").db;

export type Nivel = "none" | "view" | "comment" | "edit" | "full";
const ORDEN: Record<Nivel, number> = { none: 0, view: 1, comment: 2, edit: 3, full: 4 };

export const alcanza = (nivel: Nivel, min: Nivel) => ORDEN[nivel] >= ORDEN[min];

/** Nivel que da el rol de espacio cuando ninguna página del camino está restringida. */
const porRol = (role: string): Nivel =>
  role === "owner" || role === "admin" ? "full" : role === "viewer" ? "view" : "edit";

/**
 * Nivel efectivo de un usuario sobre una página: manda el ancestro restringido más
 * cercano (la propia página incluida). Owner y admin del espacio tienen acceso total
 * SIEMPRE: así restringir nunca puede dejar el espacio sin nadie que lo gobierne.
 * Sin restricciones en el camino, decide el rol de espacio.
 */
export async function nivelDePagina(db: Db, pageId: string, userId: string, role: string): Promise<Nivel> {
  if (role === "owner" || role === "admin") return "full";
  let id: string | null = pageId;
  // El tope de 100 es solo un cinturón contra ciclos; el árbol real es poco profundo.
  for (let i = 0; id && i < 100; i++) {
    const p: { parentId: string | null; restricted: boolean } | null = await db.page.findUnique({
      where: { id },
      select: { parentId: true, restricted: true },
    });
    if (!p) return "none";
    if (p.restricted) {
      const perm = await db.pagePermission.findUnique({
        where: { pageId_userId: { pageId: id, userId } },
        select: { level: true },
      });
      return (perm?.level as Nivel) ?? "none";
    }
    id = p.parentId;
  }
  return porRol(role);
}

/**
 * Exige un nivel mínimo sobre la página o revienta: NOT_FOUND si no puede ni verla
 * (que una página restringida no existe para quien no está invitado), FORBIDDEN si
 * la ve pero no llega al nivel pedido. Devuelve el nivel real por si hace falta.
 */
export async function exigeNivel(
  db: Db,
  pageId: string,
  userId: string,
  role: string,
  min: Nivel,
): Promise<Nivel> {
  const nivel = await nivelDePagina(db, pageId, userId, role);
  if (!alcanza(nivel, min)) {
    if (nivel === "none") throw new TRPCError({ code: "NOT_FOUND" });
    throw new TRPCError({ code: "FORBIDDEN", message: "No tienes permiso suficiente en esta página." });
  }
  return nivel;
}

/**
 * Para listados (árbol, búsqueda, backlinks): resuelve el nivel de CUALQUIER página
 * del espacio con solo dos consultas, y luego responde en memoria con memoización.
 */
export async function mapaDeNiveles(
  db: Db,
  workspaceId: string,
  userId: string,
  role: string,
): Promise<(pageId: string) => Nivel> {
  if (role === "owner" || role === "admin") return () => "full";
  const paginas = await db.page.findMany({
    where: { workspaceId },
    select: { id: true, parentId: true, restricted: true },
  });
  const permisos = await db.pagePermission.findMany({
    where: { userId, page: { workspaceId } },
    select: { pageId: true, level: true },
  });
  const pagina = new Map(paginas.map((p) => [p.id, p]));
  const mios = new Map(permisos.map((p) => [p.pageId, p.level as Nivel]));
  const base = porRol(role);
  const cache = new Map<string, Nivel>();
  const nivel = (id: string): Nivel => {
    const memo = cache.get(id);
    if (memo !== undefined) return memo;
    const p = pagina.get(id);
    const n: Nivel = !p
      ? "none"
      : p.restricted
        ? (mios.get(id) ?? "none")
        : p.parentId
          ? nivel(p.parentId)
          : base;
    cache.set(id, n);
    return n;
  };
  return nivel;
}

/**
 * De una lista de usuarios, los que pueden ver la página. Para avisos (menciones,
 * asignaciones, vencimientos, seguidores): el aviso lleva el título y el enlace, y a
 * quien no está invitado a una página restringida no le debe llegar ni eso.
 */
export async function filtraQuienesVen(
  db: Db,
  workspaceId: string,
  pageId: string,
  userIds: Iterable<string>,
): Promise<string[]> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return [];
  const ven: string[] = [];
  for (const userId of ids) {
    const role = await rolEnEspacio(db, workspaceId, userId);
    if (role && alcanza(await nivelDePagina(db, pageId, userId, role), "view")) ven.push(userId);
  }
  return ven;
}

/**
 * Rol de un usuario en un espacio, como lo calcula la sesión (context.ts): el dueño
 * lo es por `Workspace.ownerId`, tenga o no fila de miembro. null = no pertenece.
 */
export async function rolEnEspacio(db: Db, workspaceId: string, userId: string): Promise<string | null> {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } });
  if (!ws) return null;
  if (ws.ownerId === userId) return "owner";
  const m = await db.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  return m?.role ?? null;
}
