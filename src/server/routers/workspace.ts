import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure, authedProcedure } from "../trpc";
import { WS_COOKIE } from "../context";
import { alcanza, nivelDePagina, rolEnEspacio } from "../services/perms";
import {
  borraEspacio, creaEspacio, invitaMiembro, limpiaNombre, MAX_NOMBRE, quitaMiembro, salDeEspacio, traspasaEspacio,
} from "../services/espacios";

const accessibleBy = (userId: string) => ({
  OR: [{ ownerId: userId }, { members: { some: { userId } } }],
});

/** Fija el espacio activo en la cookie (el contexto la valida en cada petición). */
const fijaActivo = (ctx: { resHeaders?: Headers }, id: string) =>
  ctx.resHeaders?.append("Set-Cookie", `${WS_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);

/** Icono del espacio: el mismo string que el de una página (emoji, imagen o «icono:…»). */
const icono = z.string().max(500).nullish();

export const workspaceRouter = router({
  /** Todos los espacios a los que el usuario tiene acceso (propios y compartidos). */
  list: authedProcedure.query(async ({ ctx }) => {
    const wss = await ctx.db.workspace.findMany({
      where: accessibleBy(ctx.user.id),
      orderBy: { createdAt: "asc" },
      include: {
        owner: { select: { name: true, email: true } },
        _count: { select: { members: true } },
        members: { where: { userId: ctx.user.id }, select: { role: true } },
      },
    });
    // Avisos sin leer de cada espacio: el selector los enseña en los demás, como Notion.
    const sinLeer = await ctx.db.notification.groupBy({
      by: ["workspaceId"],
      where: { userId: ctx.user.id, read: false },
      _count: { _all: true },
    });
    const pendientes = new Map(sinLeer.map((n) => [n.workspaceId, n._count._all]));
    return wss.map((w) => ({
      id: w.id,
      name: w.name,
      icon: w.icon,
      isOwner: w.ownerId === ctx.user.id,
      rol: w.ownerId === ctx.user.id ? "owner" : (w.members[0]?.role ?? "viewer"),
      ownerName: w.owner.name || w.owner.email,
      // Hay alguien más que el dueño: el selector lo marca, para saber qué ven otros.
      compartido: w._count.members > 1,
      miembros: w._count.members,
      sinLeer: pendientes.get(w.id) ?? 0,
    }));
  }),

  /**
   * Miembros del espacio activo + rol propio; el propietario, primero (como Notion),
   * y para el propietario también las invitaciones pendientes.
   */
  members: workspaceProcedure.query(async ({ ctx }) => {
    const ms = await ctx.db.member.findMany({
      where: { workspaceId: ctx.workspace.id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { id: "asc" },
    });
    const orden = (r: string) => (r === "owner" ? 0 : r === "editor" ? 1 : 2);
    ms.sort((a, b) => orden(a.role) - orden(b.role) || (a.user.name ?? a.user.email).localeCompare(b.user.name ?? b.user.email));
    const invitaciones =
      ctx.role === "owner"
        ? await ctx.db.invitacion.findMany({
            where: { workspaceId: ctx.workspace.id },
            orderBy: { createdAt: "asc" },
            select: { id: true, destino: true, role: true, createdAt: true },
          })
        : [];
    return {
      myRole: ctx.role,
      isOwner: ctx.role === "owner",
      ownerId: ctx.workspace.ownerId,
      members: ms.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
      })),
      invitaciones,
    };
  }),

  /**
   * «Añadir miembros» por email o usuario del NAS. Si aún no ha entrado nunca, queda
   * como invitación pendiente y se canjea sola en su primer login (oidc/callback).
   */
  share: workspaceProcedure
    .input(z.object({ email: z.string().max(200), role: z.enum(["editor", "viewer"]).default("editor") }))
    .mutation(({ ctx, input }) => invitaMiembro(ctx.db, ctx.user.id, ctx.workspace.id, input.email, input.role)),

  /** Anular una invitación pendiente (solo el propietario). */
  cancelInvite: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.role !== "owner") throw new TRPCError({ code: "FORBIDDEN" });
      await ctx.db.invitacion.deleteMany({ where: { id: input.id, workspaceId: ctx.workspace.id } });
      return { ok: true };
    }),

  /** Cambiar el rol de un miembro. */
  setRole: workspaceProcedure
    .input(z.object({ userId: z.string(), role: z.enum(["editor", "viewer"]) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.role !== "owner") throw new TRPCError({ code: "FORBIDDEN" });
      if (input.userId === ctx.workspace.ownerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No se puede cambiar el rol del propietario." });
      }
      await ctx.db.member.updateMany({
        where: { workspaceId: ctx.workspace.id, userId: input.userId },
        data: { role: input.role },
      });
      return { ok: true };
    }),

  /** Quitar a un miembro del espacio (y lo suyo en él). */
  unshare: workspaceProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await quitaMiembro(ctx.db, ctx.user.id, ctx.workspace.id, input.userId);
      return { ok: true };
    }),

  /** Darle la propiedad a otro miembro; quien la tenía queda como miembro. */
  transfer: workspaceProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await traspasaEspacio(ctx.db, ctx.user.id, ctx.workspace.id, input.userId);
      return { ok: true };
    }),

  /**
   * «Salir del espacio». authedProcedure: un lector también puede salir. Pasa al
   * espacio propio (o al primero que le quede).
   */
  leave: authedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const siguiente = await salDeEspacio(ctx.db, ctx.user.id, input.workspaceId);
      fijaActivo(ctx, siguiente);
      return { workspaceId: siguiente };
    }),

  /** «Eliminar todo el espacio»: hay que escribir su nombre. */
  delete: workspaceProcedure
    .input(z.object({ confirmacion: z.string().max(MAX_NOMBRE * 2) }))
    .mutation(async ({ ctx, input }) => {
      const siguiente = await borraEspacio(ctx.db, ctx.user.id, ctx.workspace.id, input.confirmacion);
      fijaActivo(ctx, siguiente);
      return { workspaceId: siguiente };
    }),

  /**
   * En qué otro espacio está una página que no es del activo (un aviso o un enlace
   * de otro espacio): la web pasa a él y la abre, como Notion. null si no la puedes ver.
   */
  dePagina: authedProcedure
    .input(z.object({ pageId: z.string() }))
    .query(async ({ ctx, input }) => {
      const p = await ctx.db.page.findUnique({ where: { id: input.pageId }, select: { workspaceId: true, archivedAt: true } });
      if (!p || p.workspaceId === ctx.workspace?.id) return null;
      const role = await rolEnEspacio(ctx.db, p.workspaceId, ctx.user.id);
      if (!role || !alcanza(await nivelDePagina(ctx.db, input.pageId, ctx.user.id, role), "view")) return null;
      return { workspaceId: p.workspaceId };
    }),

  /** Cambiar el espacio activo (fija la cookie). */
  switch: authedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const w = await ctx.db.workspace.findFirst({
        where: { id: input.workspaceId, ...accessibleBy(ctx.user.id) },
        select: { id: true },
      });
      if (!w) throw new TRPCError({ code: "NOT_FOUND" });
      fijaActivo(ctx, w.id);
      return { ok: true };
    }),

  /**
   * Espacio nuevo, propio, y pasa a ser el activo. authedProcedure y no
   * workspaceProcedure: un lector del espacio activo también puede crearse uno suyo.
   */
  create: authedProcedure
    .input(z.object({ name: z.string().max(MAX_NOMBRE * 2), icon: icono }))
    .mutation(async ({ ctx, input }) => {
      const ws = await creaEspacio(ctx.db, ctx.user.id, input);
      fijaActivo(ctx, ws.id);
      return { id: ws.id };
    }),

  /** Nombre e icono del espacio activo (solo el dueño). */
  update: workspaceProcedure
    .input(z.object({ name: z.string().max(MAX_NOMBRE * 2).optional(), icon: icono }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.role !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Solo el propietario cambia el espacio." });
      await ctx.db.workspace.update({
        where: { id: ctx.workspace.id },
        data: {
          ...(input.name !== undefined ? { name: limpiaNombre(input.name) } : {}),
          ...(input.icon !== undefined ? { icon: input.icon || null } : {}),
        },
      });
      return { ok: true };
    }),
});
