import { db } from "@/lib/db";
import { getSessionUser, parseCookie, SESSION_COOKIE } from "./auth";

export const WS_COOKIE = "notiono_ws";

/**
 * Contexto de tRPC. Sesión desde cookie; espacio activo = propio o compartido
 * (via Member). La cookie `notiono_ws` fija cuál es el activo al cambiar de espacio.
 */
export async function createContext(opts?: { req?: Request; resHeaders?: Headers }) {
  const cookie = opts?.req?.headers.get("cookie") ?? null;
  const token = parseCookie(cookie, SESSION_COOKIE);
  const user = await getSessionUser(token);

  let workspace = null;
  let role: "owner" | "editor" | "viewer" | "guest" | null = null;

  if (user) {
    const accessible = { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] };
    const wsId = parseCookie(cookie, WS_COOKIE);
    if (wsId) {
      workspace = await db.workspace.findFirst({ where: { id: wsId, ...accessible } });
    }
    // Sin cookie (o con la de un espacio que ya no existe o del que salió): el propio
    // primero; si no tiene, el primero al que tenga acceso.
    if (!workspace) {
      workspace =
        (await db.workspace.findFirst({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" } })) ??
        (await db.workspace.findFirst({ where: accessible, orderBy: { createdAt: "asc" } }));
    }
    if (workspace) {
      if (workspace.ownerId === user.id) {
        role = "owner";
      } else {
        const m = await db.member.findUnique({
          where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
          select: { role: true },
        });
        role = (m?.role as "editor" | "viewer" | "guest") ?? "viewer";
      }
    }
  }

  return { db, user, workspace, role, sessionToken: token, resHeaders: opts?.resHeaders };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
