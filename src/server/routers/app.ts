/**
 * Procedimientos para la app nativa de Android.
 *
 * La app usa los MISMOS procedimientos que la web para casi todo. Esto es solo lo que
 * en la web hace el navegador y la app no debe reimplementar:
 *
 *  - el contenido de las páginas, que en la web vive en el editor conectado al
 *    documento Yjs: la app lo lee ya convertido a bloques y escribe por operaciones
 *    de bloque (ver src/server/app/documento.ts);
 *  - las filas de una vista de base de datos, que la web calcula en el navegador con
 *    `src/lib/viewData.ts`: aquí sale del mismo motor, ya filtrado, ordenado y
 *    agrupado (ver src/server/app/vista.ts).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../trpc";
import { exigeNivel } from "../services/perms";
import { guardaContenidoPagina } from "../services/pages";
import { jsonLimpio } from "../jsonLimpio";
import { aplicarOpsJson, type BloqueBN, type OpBloque } from "../app/bloquesYjs";
import { aplicarOpsPagina, huella, leerBloquesPagina } from "../app/documento";

/** Bloque BlockNote tal cual (lo que no conozca el servidor se guarda igual). */
const bloque: z.ZodType<BloqueBN> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1).max(100),
      type: z.string().min(1).max(60),
      props: z.record(z.string(), z.unknown()).optional(),
      content: z.unknown().optional(),
      children: z.array(bloque).optional(),
    })
    .passthrough(),
) as z.ZodType<BloqueBN>;

const op: z.ZodType<OpBloque> = z.discriminatedUnion("op", [
  z.object({ op: z.literal("upsert"), block: bloque, parentId: z.string().nullish(), afterId: z.string().nullish() }),
  z.object({ op: z.literal("delete"), id: z.string() }),
  z.object({ op: z.literal("move"), id: z.string(), parentId: z.string().nullish(), afterId: z.string().nullish() }),
]) as z.ZodType<OpBloque>;

const ops = z.array(op).min(1).max(500);

type Ctx = { db: typeof import("@/lib/db").db; workspace: { id: string }; user: { id: string }; role?: string };

async function paginaDelEspacio(ctx: Ctx, id: string) {
  const page = await ctx.db.page.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    select: { id: true, content: true, ydoc: true, type: true, locked: true },
  });
  if (!page) throw new TRPCError({ code: "NOT_FOUND" });
  return page;
}

async function filaDelEspacio(ctx: Ctx, id: string) {
  const rec = await ctx.db.record.findFirst({
    where: { id, collection: { page: { workspaceId: ctx.workspace.id } } },
    select: { id: true, content: true, collection: { select: { pageId: true } } },
  });
  if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
  return rec;
}

export const appNativaRouter = router({
  /**
   * Bloques de una página (del documento compartido si lo hay). Con `huella` (la de
   * la última respuesta) y sin cambios, no reenvía los bloques: la app consulta cada
   * pocos segundos mientras tiene la página abierta.
   */
  bloques: workspaceProcedure
    .input(z.object({ id: z.string(), huella: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const page = await paginaDelEspacio(ctx, input.id);
      await exigeNivel(ctx.db, page.id, ctx.user.id, ctx.role ?? "member", "view");
      const bloques = await leerBloquesPagina(page);
      const h = huella(bloques);
      return { huella: h, bloques: h === input.huella ? null : bloques };
    }),

  /** Aplica operaciones por bloque a una página y refresca su copia legible. */
  aplicar: workspaceProcedure
    .input(z.object({ id: z.string(), ops }))
    .mutation(async ({ ctx, input }) => {
      const page = await paginaDelEspacio(ctx, input.id);
      await exigeNivel(ctx.db, page.id, ctx.user.id, ctx.role ?? "member", "edit");
      if (page.type !== "doc") throw new TRPCError({ code: "BAD_REQUEST", message: "Solo las páginas de documento tienen bloques." });
      const bloques = await aplicarOpsPagina(ctx.db, page.id, input.ops);
      await guardaContenidoPagina(ctx.db, { workspaceId: ctx.workspace.id, user: ctx.user }, page, bloques);
      return { huella: huella(bloques), bloques };
    }),

  /** Cuerpo de una fila (fila = página). Sin documento compartido: es JSON. */
  bloquesFila: workspaceProcedure
    .input(z.object({ recordId: z.string(), huella: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const rec = await filaDelEspacio(ctx, input.recordId);
      await exigeNivel(ctx.db, rec.collection.pageId, ctx.user.id, ctx.role ?? "member", "view");
      const bloques = Array.isArray(rec.content) ? (rec.content as unknown as BloqueBN[]) : [];
      const h = huella(bloques);
      return { huella: h, bloques: h === input.huella ? null : bloques };
    }),

  /** Las mismas operaciones sobre el cuerpo de una fila, con la fila bloqueada. */
  aplicarFila: workspaceProcedure
    .input(z.object({ recordId: z.string(), ops }))
    .mutation(async ({ ctx, input }) => {
      const rec = await filaDelEspacio(ctx, input.recordId);
      await exigeNivel(ctx.db, rec.collection.pageId, ctx.user.id, ctx.role ?? "member", "edit");
      const bloques = await ctx.db.$transaction(async (tx) => {
        const [fila] = await tx.$queryRaw<{ content: unknown }[]>`
          SELECT content FROM "Record" WHERE id = ${rec.id} FOR UPDATE`;
        const nuevos = aplicarOpsJson(Array.isArray(fila?.content) ? (fila.content as BloqueBN[]) : [], input.ops);
        await tx.record.update({
          where: { id: rec.id },
          data: { content: jsonLimpio(nuevos), updatedById: ctx.user.id },
        });
        return nuevos;
      });
      return { huella: huella(bloques), bloques };
    }),
});
