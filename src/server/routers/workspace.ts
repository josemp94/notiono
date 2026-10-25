import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure, authedProcedure } from "../trpc";
import { WS_COOKIE } from "../context";
import { creaEspacio, limpiaNombre, MAX_NOMBRE } from "../services/espacios";

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
      include: { owner: { select: { name: true, email: true } }, _count: { select: { members: true } } },
    });
    return wss.map((w) => ({
      id: w.id,
      name: w.name,
      icon: w.icon,
      isOwner: w.ownerId === ctx.user.id,
      ownerName: w.owner.name || w.owner.email,
      // Hay alguien más que el dueño: el selector lo marca, para saber qué ven otros.
      compartido: w._count.members > 1,
      miembros: w._count.members,
    }));
  }),

  /** Miembros del espacio activo + rol propio. */
  members: workspaceProcedure.query(async ({ ctx }) => {
    const ms = await ctx.db.member.findMany({
      where: { workspaceId: ctx.workspace.id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { role: "asc" },
    });
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
    };
  }),

  /** Compartir con otra persona (por email; debe haber entrado ya alguna vez). */
  share: workspaceProcedure
    .input(z.object({ email: z.string().email(), role: z.enum(["editor", "viewer"]).default("editor") }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.role !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Solo el propietario comparte." });
      const email = input.email.toLowerCase();
      const u = await ctx.db.user.findUnique({ where: { email } });
      if (!u) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Esa persona aún no existe en Notiono. Pídele que entre una vez con su cuenta del NAS.",
        });
      }
      if (u.id === ctx.workspace.ownerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Esa persona ya es la propietaria." });
      }
      await ctx.db.member.upsert({
        where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId: u.id } },
        update: { role: input.role },
        create: { workspaceId: ctx.workspace.id, userId: u.id, role: input.role },
      });
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

  /** Dejar de compartir con un miembro. */
  unshare: workspaceProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.role !== "owner") throw new TRPCError({ code: "FORBIDDEN" });
      if (input.userId === ctx.workspace.ownerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "El propietario no se puede quitar." });
      }
      await ctx.db.member.deleteMany({ where: { workspaceId: ctx.workspace.id, userId: input.userId } });
      return { ok: true };
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
