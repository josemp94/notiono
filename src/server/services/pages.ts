/**
 * Crear páginas de documento, sin tRPC delante.
 *
 * Igual que el servicio de bases de datos: recibe el ámbito explícito para que
 * también pueda llamarlo la API REST, donde no hay sesión de navegador.
 */
import { db as defaultDb } from "@/lib/db";
import { rankAtEnd } from "@/lib/fractional";
import { dispatchWebhooks } from "@/server/webhooks";
import { DbError, type Scope } from "./db";
import { jsonLimpio } from "@/server/jsonLimpio";
import { sendPush } from "@/server/push";
import { filtraQuienesVen } from "./perms";
import type { Prisma } from "@prisma/client";

export async function createPage(
  scope: Scope,
  input: { title: string; parentId?: string | null; icon?: string | null },
) {
  if (input.parentId) {
    const padre = await scope.db.page.findFirst({
      where: { id: input.parentId, workspaceId: scope.workspaceId },
      select: { id: true },
    });
    if (!padre) throw new DbError("not_found", "Página madre no encontrada.");
  }

  const last = await scope.db.page.findFirst({
    where: { workspaceId: scope.workspaceId, parentId: input.parentId ?? null },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const creada = await scope.db.page.create({
    data: {
      workspaceId: scope.workspaceId,
      parentId: input.parentId ?? null,
      title: input.title,
      ...(input.icon ? { icon: input.icon } : {}),
      order: rankAtEnd(last?.order ?? null),
      content: [],
    },
  });

  dispatchWebhooks(scope.workspaceId, "page.created", {
    pageId: creada.id,
    title: creada.title,
    parentId: creada.parentId,
  });
  return creada;
}

/** Por si alguna llamada no trae su propio cliente de Prisma. */
export const defaultScope = (workspaceId: string, userId?: string | null): Scope => ({
  db: defaultDb,
  workspaceId,
  userId,
});

/**
 * Guarda el contenido (la copia legible, `Page.content`) de una página: versión del
 * estado anterior (como mucho una cada 2 min), el guardado (siempre por jsonLimpio) y
 * el aviso a quien sigue la página. Lo usan el autosave de la web y la app nativa.
 */
export async function guardaContenidoPagina(
  db: typeof defaultDb,
  quien: { workspaceId: string; user: { id: string; name: string | null; email: string } },
  page: { id: string; content: Prisma.JsonValue | null },
  content: unknown,
) {
  // ponytail: throttle simple — solo se crea versión si la última tiene más de 2 min;
  // dentro de la ventana se omite (la versión reciente ya cubre ese estado).
  const last = await db.version.findFirst({
    where: { pageId: page.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!last || Date.now() - last.createdAt.getTime() > 2 * 60_000) {
    await db.version.create({
      data: { pageId: page.id, snapshot: (page.content ?? []) as Prisma.InputJsonValue, authorId: quien.user.id },
    });
  }
  const saved = await db.page.update({
    where: { id: page.id },
    data: { content: jsonLimpio(content) },
    select: { id: true, updatedAt: true, title: true },
  });
  // Avisa a quien sigue la página (menos al que edita). El autosave dispara
  // esto sin parar: el anti-duplicados de siempre (una sin leer del mismo
  // actor en la misma página basta) lo deja en un aviso por sesión de edición.
  const seguidores = await db.pageFollow.findMany({
    where: { pageId: page.id, userId: { not: quien.user.id } },
    select: { userId: true },
  });
  const pendientes: string[] = [];
  for (const { userId } of seguidores) {
    const dup = await db.notification.findFirst({
      where: { userId, pageId: page.id, actorId: quien.user.id, type: "follow", read: false },
      select: { id: true },
    });
    if (!dup) pendientes.push(userId);
  }
  // Quien siguió la página antes de que se restringiera deja de recibir avisos.
  for (const userId of await filtraQuienesVen(db, quien.workspaceId, page.id, pendientes)) {
    await db.notification.create({
      data: { userId, workspaceId: quien.workspaceId, type: "follow", pageId: page.id, actorId: quien.user.id },
    });
    sendPush(userId, {
      title: `${quien.user.name || quien.user.email} ha editado ${saved.title || "Sin título"}`,
      body: "Sigues esta página.",
      url: `/p/${page.id}`,
    });
  }
  return saved;
}
