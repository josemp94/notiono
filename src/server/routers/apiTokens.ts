import crypto from "crypto";
import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";

export const hashApiToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

/**
 * Qué tokens ve y puede revocar cada uno: dueño y admin, todos los del espacio (para
 * poder cortar uno olvidado); el resto, solo los suyos.
 */
const visibles = (ctx: { workspace: { id: string }; user: { id: string }; role?: string }) => ({
  workspaceId: ctx.workspace.id,
  ...(ctx.role === "owner" || ctx.role === "admin" ? {} : { createdById: ctx.user.id }),
});

/**
 * Tokens de la API REST (/api/v1). Cada token actúa con los permisos de quien lo
 * creó (ver apiAuth.ts): crear uno no da a nadie más acceso del que ya tiene.
 */
export const apiTokensRouter = router({
  list: workspaceProcedure.query(async ({ ctx }) => {
    const tokens = await ctx.db.apiToken.findMany({
      where: visibles(ctx),
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, createdAt: true, lastUsed: true, createdById: true },
    });
    const ajenos = [...new Set(tokens.map((t) => t.createdById).filter((id): id is string => !!id && id !== ctx.user.id))];
    const usuarios = ajenos.length
      ? await ctx.db.user.findMany({ where: { id: { in: ajenos } }, select: { id: true, name: true, email: true } })
      : [];
    const nombre = new Map(usuarios.map((u) => [u.id, u.name || u.email]));
    return tokens.map(({ createdById, ...t }) => ({
      ...t,
      // El autor solo se enseña si el token no es tuyo (dueño/admin ven los de todos).
      autor: createdById === ctx.user.id ? null : ((createdById && nombre.get(createdById)) ?? "alguien que ya no está"),
    }));
  }),

  /** Crea un token; el valor en claro solo se devuelve aquí (en BD queda su sha256). */
  create: workspaceProcedure
    .input(z.object({ name: z.string().trim().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const token = `ntn_${crypto.randomBytes(24).toString("base64url")}`;
      await ctx.db.apiToken.create({
        data: {
          name: input.name,
          tokenHash: hashApiToken(token),
          workspaceId: ctx.workspace.id,
          createdById: ctx.user.id,
        },
      });
      return { token };
    }),

  revoke: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.apiToken.deleteMany({ where: { id: input.id, ...visibles(ctx) } });
      return { ok: true };
    }),
});
