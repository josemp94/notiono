import { z } from "zod";
import { router, workspaceProcedure, authedProcedure } from "../trpc";
import { cellToText } from "../services/cells";
import { dayOf } from "@/lib/cellText";
import { sendPush } from "../push";
import { alcanza, filtraQuienesVen, mapaDeNiveles, nivelDePagina } from "../services/perms";

export const notificationsRouter = router({
  /** Bandeja del usuario en el espacio activo (más recientes primero). */
  list: workspaceProcedure.query(({ ctx }) =>
    ctx.db.notification.findMany({
      where: { userId: ctx.user.id, workspaceId: ctx.workspace.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        actor: { select: { name: true, email: true } },
        page: { select: { id: true, title: true, icon: true } },
      },
    }),
  ),

  unreadCount: workspaceProcedure.query(({ ctx }) =>
    ctx.db.notification.count({
      where: { userId: ctx.user.id, workspaceId: ctx.workspace.id, read: false },
    }),
  ),

  // markRead/markAllRead usan authedProcedure a propósito: workspaceProcedure bloquea
  // todas las mutaciones a los viewers, pero marcar tus propias notificaciones no edita nada.
  markRead: authedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.notification.updateMany({
      where: { id: input.id, userId: ctx.user.id },
      data: { read: true },
    });
    return { ok: true };
  }),

  markAllRead: authedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.notification.updateMany({
      where: { userId: ctx.user.id, workspaceId: ctx.workspace?.id, read: false },
      data: { read: true },
    });
    return { ok: true };
  }),

  /**
   * Recordatorios: crea un aviso por cada fila asignada a mí cuya fecha ya llegó.
   * Se invoca al abrir la app (como la purga de la papelera): sin cron ni servicio aparte.
   * Solo mira los últimos 30 días para no resucitar tareas viejísimas.
   */
  checkDue: authedProcedure.mutation(async ({ ctx }) => {
    const workspaceId = ctx.workspace?.id;
    if (!workspaceId || !ctx.role) return { created: 0 };
    // Una fila asignada en una base de datos que ya no puedo ver no me avisa.
    const nivel = await mapaDeNiveles(ctx.db, workspaceId, ctx.user.id, ctx.role);

    const fields = await ctx.db.field.findMany({
      where: {
        type: { in: ["date", "person"] },
        collection: { page: { workspaceId, archivedAt: null } },
      },
      select: { id: true, name: true, type: true, config: true, collectionId: true, collection: { select: { pageId: true } } },
    });
    // Solo tiene sentido avisar en bases de datos que tengan fecha Y responsable.
    const byCollection = new Map<string, typeof fields>();
    for (const f of fields) byCollection.set(f.collectionId, [...(byCollection.get(f.collectionId) ?? []), f]);
    const usable = [...byCollection.entries()].filter(
      ([, fs]) => fs.some((f) => f.type === "date") && fs.some((f) => f.type === "person"),
    );
    if (!usable.length) return { created: 0 };

    const today = new Date();
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const hoy = iso(today);
    const desde = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30));

    const pending: { userId: string; workspaceId: string; type: string; key: string; title: string; pageId: string }[] = [];

    for (const [collectionId, fs] of usable) {
      if (!alcanza(nivel(fs[0].collection.pageId), "view")) continue;
      const personFields = fs.filter((f) => f.type === "person");
      const dateFields = fs.filter((f) => f.type === "date");
      const records = await ctx.db.record.findMany({
        where: {
          collectionId,
          archivedAt: null,
          OR: personFields.map((f) => ({ cells: { path: [f.id], array_contains: ctx.user.id } })),
        },
        include: {
          collection: {
            select: { pageId: true, fields: { orderBy: { order: "asc" } } },
          },
        },
        take: 200,
      });
      for (const r of records) {
        const cells = (r.cells ?? {}) as Record<string, unknown>;
        for (const df of dateFields) {
          const day = dayOf(cells[df.id]);
          if (!day || day > hoy || day < desde) continue;
          const titleField = r.collection.fields.find((f) => f.type === "text");
          pending.push({
            userId: ctx.user.id,
            workspaceId,
            type: "due",
            key: `due:${r.id}:${df.id}:${day}`,
            title: (titleField ? cellToText(titleField, cells[titleField.id], r) : "") || "Sin título",
            pageId: r.collection.pageId,
          });
        }
      }
    }
    if (!pending.length) return { created: 0 };
    // skipDuplicates + índice único (userId, key): el mismo vencimiento no se avisa dos veces.
    const res = await ctx.db.notification.createMany({ data: pending, skipDuplicates: true });
    if (res.count > 0) {
      // Un único aviso por tanda: si vencen ocho cosas no queremos ocho notificaciones.
      sendPush(ctx.user.id, {
        title: res.count === 1 ? "Te toca una tarea" : `Te tocan ${res.count} tareas`,
        body: res.count === 1 ? pending[0].title : "Ábrelas desde la campana o Mis tareas.",
        url: "/my-tasks",
      });
    }
    return { created: res.count };
  }),

  /** El editor llama aquí al insertar una mención @persona. */
  notifyMention: workspaceProcedure
    .input(z.object({ pageId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) return { ok: true }; // no auto-notificarse
      const page = await ctx.db.page.findFirst({
        where: { id: input.pageId, workspaceId: ctx.workspace.id },
        select: { id: true },
      });
      if (!page) return { ok: false };
      // Quien menciona tiene que poder ver la página, y el mencionado también: si no,
      // el aviso le enseñaría el título de una página a la que no está invitado.
      if (!alcanza(await nivelDePagina(ctx.db, page.id, ctx.user.id, ctx.role ?? "viewer"), "view")) {
        return { ok: false };
      }
      const [puedeVer] = await filtraQuienesVen(ctx.db, ctx.workspace.id, page.id, [input.userId]);
      if (!puedeVer) return { ok: false }; // solo miembros del espacio que vean la página
      // Anti-duplicados (autosave): si ya tiene una sin leer del mismo actor en la misma página, no crea otra.
      const dup = await ctx.db.notification.findFirst({
        where: { userId: input.userId, pageId: input.pageId, actorId: ctx.user.id, type: "mention", read: false },
        select: { id: true },
      });
      if (dup) return { ok: true };
      await ctx.db.notification.create({
        data: {
          userId: input.userId,
          workspaceId: ctx.workspace.id,
          type: "mention",
          pageId: input.pageId,
          actorId: ctx.user.id,
        },
      });
      const page2 = await ctx.db.page.findUnique({ where: { id: input.pageId }, select: { title: true } });
      sendPush(input.userId, {
        title: `${ctx.user.name || ctx.user.email} te ha mencionado`,
        body: page2?.title || "Sin título",
        url: `/p/${input.pageId}`,
      });
      return { ok: true };
    }),
});
