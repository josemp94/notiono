import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { router, authedProcedure, workspaceProcedure } from "../trpc";
import { alcanza, mapaDeNiveles } from "../services/perms";
import { recordatoriosEntre } from "../recordatorios";
import { BLOQUES, MAX_BLOC, MAX_ENLACES, normalizaInicio, urlValida, type ConfigInicio } from "@/lib/inicio";
import { exigeNivel } from "../services/perms";
import { createRecord } from "../services/db";
import { createPage } from "../services/pages";
import { markdownABloques } from "../app/markdown";
import { jsonLimpio } from "../jsonLimpio";

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
      ...(config.nota ? [config.nota] : []),
      ...(config.tareas ? [config.tareas] : []),
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
        nota: z.string().max(64).nullish(),
        tareas: z.string().max(64).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.workspace) throw new TRPCError({ code: "UNAUTHORIZED", message: "No hay espacio activo." });
      // El bloc de notas se guarda aparte (guardarBloc): aquí se conserva el que haya.
      const antes = normalizaInicio((await ctx.db.member.findUnique({ where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId: ctx.user.id } }, select: { inicio: true } }))?.inicio);
      const inicio = normalizaInicio({ ...input, bloc: antes.bloc }) as unknown as Prisma.InputJsonValue;
      await ctx.db.member.upsert({
        where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId: ctx.user.id } },
        update: { inicio },
        // El propietario siempre tiene fila (provision.ts); esto es solo por si acaso.
        create: { workspaceId: ctx.workspace.id, userId: ctx.user.id, role: ctx.role ?? "viewer", inicio },
      });
      return normalizaInicio(inicio);
    }),

  /** El «Bloc de notas rápido»: se guarda solo mientras se escribe (por persona y espacio). */
  guardarBloc: authedProcedure.input(z.object({ texto: z.string().max(MAX_BLOC) })).mutation(async ({ ctx, input }) => {
    if (!ctx.workspace) throw new TRPCError({ code: "UNAUTHORIZED", message: "No hay espacio activo." });
    await guardaParte(ctx.db, ctx.workspace.id, ctx.user.id, ctx.role, { bloc: input.texto });
    return { texto: input.texto };
  }),

  /** «Convertir en página»: el bloc pasa a una página nueva (como Markdown: listas y casillas valen) y se vacía. */
  blocAPagina: workspaceProcedure.mutation(async ({ ctx }) => {
    const m = await ctx.db.member.findUnique({ where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId: ctx.user.id } }, select: { inicio: true } });
    const texto = normalizaInicio(m?.inicio).bloc.trim();
    if (!texto) throw new TRPCError({ code: "BAD_REQUEST", message: "El bloc está vacío." });
    // El título, la primera línea (sin marcas de Markdown); el resto, el cuerpo.
    const [primera, ...resto] = texto.split("\n");
    const titulo = primera.replace(/^\s*(#+|[-*]\s*(\[[ xX]\])?|\d+\.)\s*/, "").trim().slice(0, 200) || "Nota rápida";
    const cuerpo = resto.join("\n").trim();
    const page = await createPage({ db: ctx.db, workspaceId: ctx.workspace.id, userId: ctx.user.id }, { title: titulo });
    // Recién creada no tiene documento compartido: basta la copia legible (el editor la estrena).
    if (cuerpo) await ctx.db.page.update({ where: { id: page.id }, data: { content: jsonLimpio(await markdownABloques(cuerpo)) } });
    await guardaParte(ctx.db, ctx.workspace.id, ctx.user.id, ctx.role, { bloc: "" });
    return { id: page.id };
  }),

  /**
   * Una tarea rápida (Acciones rápidas, Mis tareas): en mi BD de tareas, con el título, la
   * fecha si la da (en el primer campo Fecha) y asignada a mí (en el primer campo Persona).
   */
  nuevaTarea: workspaceProcedure
    .input(z.object({ titulo: z.string().min(1).max(500), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/).nullish(), pageId: z.string().max(64).optional() }))
    .mutation(async ({ ctx, input }) => {
      const m = await ctx.db.member.findUnique({ where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId: ctx.user.id } }, select: { inicio: true } });
      const pageId = input.pageId ?? normalizaInicio(m?.inicio).tareas;
      if (!pageId) throw new TRPCError({ code: "BAD_REQUEST", message: "Elige primero la base de datos de tus tareas." });
      const col = await ctx.db.collection.findFirst({
        where: { pageId, page: { workspaceId: ctx.workspace.id, archivedAt: null } },
        select: { id: true, fields: { orderBy: { order: "asc" }, select: { id: true, type: true } } },
      });
      if (!col) throw new TRPCError({ code: "NOT_FOUND", message: "Esa base de datos ya no existe." });
      await exigeNivel(ctx.db, pageId, ctx.user.id, ctx.role ?? "member", "edit");
      const primero = (t: string) => col.fields.find((f) => f.type === t)?.id;
      const cells: Record<string, unknown> = {};
      if (primero("text")) cells[primero("text")!] = input.titulo.trim();
      if (input.fecha && primero("date")) cells[primero("date")!] = input.fecha;
      if (primero("person")) cells[primero("person")!] = [ctx.user.id];
      const r = await createRecord({ db: ctx.db, workspaceId: ctx.workspace.id, userId: ctx.user.id }, { collectionId: col.id, cells });
      return { recordId: r.id, pageId };
    }),
});

/** Cambia una parte del Inicio guardado sin tocar lo demás. */
async function guardaParte(db: typeof import("@/lib/db").db, workspaceId: string, userId: string, role: string | null, parte: Partial<ConfigInicio>) {
  const antes = await db.member.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { inicio: true } });
  const inicio = normalizaInicio({ ...normalizaInicio(antes?.inicio), ...parte }) as unknown as Prisma.InputJsonValue;
  await db.member.upsert({ where: { workspaceId_userId: { workspaceId, userId } }, update: { inicio }, create: { workspaceId, userId, role: role ?? "viewer", inicio } });
}
