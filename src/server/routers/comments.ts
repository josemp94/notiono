import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../trpc";
import { sendPush } from "../push";
import { exigeNivel, type Nivel } from "../services/perms";

async function assertPage(
  ctx: { db: typeof import("@/lib/db").db; workspace: { id: string }; user: { id: string }; role?: string },
  pageId: string,
  min: Nivel = "view",
) {
  const p = await ctx.db.page.findFirst({
    where: { id: pageId, workspaceId: ctx.workspace.id },
    select: { id: true },
  });
  if (!p) throw new TRPCError({ code: "NOT_FOUND" });
  await exigeNivel(ctx.db, pageId, ctx.user.id, ctx.role ?? "member", min);
}

export const commentsRouter = router({
  /**
   * Comentarios de una página (recordId ausente) o de una fila de BD, del más
   * antiguo al más nuevo, con su autor. Los de fila NO salen en los de página.
   */
  list: workspaceProcedure
    .input(z.object({ pageId: z.string(), recordId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await assertPage(ctx, input.pageId);
      return ctx.db.comment.findMany({
        where: { pageId: input.pageId, recordId: input.recordId ?? null },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, email: true } } },
      });
    }),

  add: workspaceProcedure
    .input(z.object({ pageId: z.string(), recordId: z.string().optional(), body: z.string().trim().min(1).max(4000) }))
    .mutation(async ({ ctx, input }) => {
      await assertPage(ctx, input.pageId, "comment");
      // Un comentario de fila tiene que ser de una fila de ESA página.
      if (input.recordId) {
        const rec = await ctx.db.record.findFirst({
          where: { id: input.recordId, collection: { pageId: input.pageId } },
          select: { id: true },
        });
        if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      }
      const comment = await ctx.db.comment.create({
        data: { pageId: input.pageId, recordId: input.recordId ?? null, authorId: ctx.user.id, body: input.body },
      });
      const page = await ctx.db.page.findUnique({ where: { id: input.pageId }, select: { title: true } });
      const resumen = input.body.length > 80 ? input.body.slice(0, 77) + "…" : input.body;

      // «@Nombre» dentro del texto avisa al nombrado, como en Notion. El cuerpo
      // es texto plano, así que se casa contra los miembros del espacio: el
      // nombre completo, su primera palabra o el correo, sin mayúsculas ni
      // acentos («@maria» encuentra a María).
      const llano = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const cuerpo = llano(input.body);
      const mencionados = new Set<string>();
      if (cuerpo.includes("@")) {
        const miembros = await ctx.db.member.findMany({
          where: { workspaceId: ctx.workspace.id, userId: { not: ctx.user.id } },
          select: { userId: true, user: { select: { name: true, email: true } } },
        });
        for (const m of miembros) {
          const nombres = [m.user.name, m.user.name?.split(/\s+/)[0], m.user.email].filter(Boolean) as string[];
          if (nombres.some((n) => cuerpo.includes("@" + llano(n)))) mencionados.add(m.userId);
        }
        for (const userId of mencionados) {
          await ctx.db.notification.create({
            data: {
              userId,
              workspaceId: ctx.workspace.id,
              type: "mention",
              title: resumen,
              pageId: input.pageId,
              actorId: ctx.user.id,
            },
          });
          sendPush(userId, {
            title: `${ctx.user.name || ctx.user.email} te ha mencionado en un comentario`,
            body: resumen,
            url: input.recordId ? `/p/${input.pageId}?r=${input.recordId}` : `/p/${input.pageId}`,
          });
        }
      }

      // Avisa a los demás participantes: quienes ya comentaron este mismo hilo.
      // Anti-duplicados como en las menciones: una sin leer del mismo actor basta.
      // Los ya mencionados no reciben además el aviso genérico del hilo.
      const previos = await ctx.db.comment.findMany({
        where: { pageId: input.pageId, recordId: input.recordId ?? null, authorId: { not: ctx.user.id } },
        select: { authorId: true },
        distinct: ["authorId"],
      });
      if (previos.length) {
        for (const { authorId } of previos.filter((p) => !mencionados.has(p.authorId))) {
          const dup = await ctx.db.notification.findFirst({
            where: { userId: authorId, pageId: input.pageId, actorId: ctx.user.id, type: "comment", read: false },
            select: { id: true },
          });
          if (dup) continue;
          await ctx.db.notification.create({
            data: {
              userId: authorId,
              workspaceId: ctx.workspace.id,
              type: "comment",
              title: resumen,
              pageId: input.pageId,
              actorId: ctx.user.id,
            },
          });
          sendPush(authorId, {
            title: `${ctx.user.name || ctx.user.email} ha comentado en ${page?.title || "Sin título"}`,
            body: resumen,
            url: input.recordId ? `/p/${input.pageId}?r=${input.recordId}` : `/p/${input.pageId}`,
          });
        }
      }
      return comment;
    }),

  /** Editar un comentario: solo su autor. */
  edit: workspaceProcedure
    .input(z.object({ id: z.string(), body: z.string().trim().min(1).max(4000) }))
    .mutation(async ({ ctx, input }) => {
      const c = await ctx.db.comment.findFirst({
        where: { id: input.id, page: { workspaceId: ctx.workspace.id } },
        select: { id: true, authorId: true },
      });
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      if (c.authorId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Solo el autor puede editarlo." });
      return ctx.db.comment.update({ where: { id: c.id }, data: { body: input.body } });
    }),

  /** Pone o quita la reacción del usuario a un comentario (toggle por emoji). */
  react: workspaceProcedure
    .input(z.object({ id: z.string(), emoji: z.string().min(1).max(8) }))
    .mutation(async ({ ctx, input }) => {
      const c = await ctx.db.comment.findFirst({
        where: { id: input.id, page: { workspaceId: ctx.workspace.id } },
        select: { id: true, reactions: true },
      });
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      const reactions = { ...((c.reactions as Record<string, string[]>) ?? {}) };
      const quienes = reactions[input.emoji] ?? [];
      const next = quienes.includes(ctx.user.id)
        ? quienes.filter((u) => u !== ctx.user.id)
        : [...quienes, ctx.user.id];
      if (next.length) reactions[input.emoji] = next;
      else delete reactions[input.emoji];
      return ctx.db.comment.update({
        where: { id: c.id },
        data: { reactions },
        select: { id: true, reactions: true },
      });
    }),

  toggleResolve: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const c = await ctx.db.comment.findFirst({
        where: { id: input.id, page: { workspaceId: ctx.workspace.id } },
        select: { id: true, resolved: true },
      });
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.comment.update({
        where: { id: c.id },
        data: { resolved: !c.resolved },
        select: { id: true, resolved: true },
      });
    }),

  /** Borrar un comentario: solo su autor, el propietario del espacio o un admin. */
  remove: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const c = await ctx.db.comment.findFirst({
        where: { id: input.id, page: { workspaceId: ctx.workspace.id } },
        select: { id: true, authorId: true },
      });
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      const isAdmin = ctx.user.role === "admin" || ctx.role === "owner";
      if (c.authorId !== ctx.user.id && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Solo el autor puede borrar su comentario." });
      }
      await ctx.db.comment.delete({ where: { id: c.id } });
      return { ok: true };
    }),
});
