import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { router, authedProcedure, workspaceProcedure } from "../trpc";
import { alcanza, mapaDeNiveles } from "../services/perms";
import { recordatoriosEntre } from "../recordatorios";
import { BLOQUES, MAX_ENLACES, normalizaInicio, urlValida } from "@/lib/inicio";

/**
 * Inicio personalizable, por persona y espacio (`Member.inicio`). Lo usan igual la web
 * y la app de Android. Forma y reglas en src/lib/inicio.ts.
 */
export const inicioRouter = router({
  /**
   * Mi configuración (ya normalizada) y el título e icono actuales de las páginas que
   * nombra: una página borrada o sin permiso no viene en `paginas` y no se pinta.
   */
  get: workspaceProcedure.query(async ({ ctx }) => {
    const m = await ctx.db.member.findUnique({
      where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId: ctx.user.id } },
      select: { inicio: true },
    });
    const config = normalizaInicio(m?.inicio);
    const ids = [
      ...config.enlaces.flatMap((e) => (e.tipo === "pagina" ? [e.pageId] : [])),
      ...(config.abrir.tipo === "pagina" ? [config.abrir.pageId] : []),
    ];
    const paginas: Record<string, { title: string; icon: string | null }> = {};
    if (ids.length) {
      const encontradas = await ctx.db.page.findMany({
        where: { id: { in: ids }, workspaceId: ctx.workspace.id, archivedAt: null },
        select: { id: true, title: true, icon: true },
      });
      const nivel = await mapaDeNiveles(ctx.db, ctx.workspace.id, ctx.user.id, ctx.role ?? "member");
      for (const p of encontradas) if (alcanza(nivel(p.id), "view")) paginas[p.id] = { title: p.title, icon: p.icon };
    }
    return { config, paginas };
  }),

  /** Mis recordatorios de los próximos días en este espacio (bloque «Próximas fechas»). */
  recordatorios: workspaceProcedure.query(async ({ ctx }) => {
    const ahora = new Date();
    const lista = await recordatoriosEntre(ctx.db, ahora, new Date(ahora.getTime() + 8 * 864e5), {
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
    });
    return lista.slice(0, 50).map((r) => ({ key: r.key, titulo: r.titulo, inicio: r.inicio, pageId: r.pageId, recordId: r.recordId }));
  }),

  // authedProcedure a propósito (como markRead): workspaceProcedure bloquea las mutaciones
  // a los viewers, y personalizar tu Inicio no edita nada del espacio.
  guardar: authedProcedure
    .input(
      z.object({
        bloques: z.array(z.object({ id: z.enum(BLOQUES), visible: z.boolean() })).max(BLOQUES.length * 2),
        enlaces: z
          .array(
            z.discriminatedUnion("tipo", [
              z.object({ id: z.string().min(1).max(64), tipo: z.literal("pagina"), pageId: z.string().min(1).max(64), titulo: z.string().max(200).optional() }),
              z.object({
                id: z.string().min(1).max(64),
                tipo: z.literal("web"),
                url: z.string().refine((u) => !!urlValida(u), "El enlace tiene que empezar por http:// o https://"),
                titulo: z.string().max(200).optional(),
              }),
            ]),
          )
          .max(MAX_ENLACES),
        abrir: z.discriminatedUnion("tipo", [
          z.object({ tipo: z.literal("inicio") }),
          z.object({ tipo: z.literal("ultima") }),
          z.object({ tipo: z.literal("pagina"), pageId: z.string().min(1).max(64) }),
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.workspace) throw new TRPCError({ code: "UNAUTHORIZED", message: "No hay espacio activo." });
      const inicio = normalizaInicio(input) as unknown as Prisma.InputJsonValue;
      await ctx.db.member.upsert({
        where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId: ctx.user.id } },
        update: { inicio },
        // El propietario siempre tiene fila (provision.ts); esto es solo por si acaso.
        create: { workspaceId: ctx.workspace.id, userId: ctx.user.id, role: ctx.role ?? "viewer", inicio },
      });
      return normalizaInicio(inicio);
    }),
});
