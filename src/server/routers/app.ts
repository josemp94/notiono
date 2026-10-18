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
import { calculaVista } from "../app/vista";
import { bloquesAMarkdown, markdownABloques } from "../app/markdown";
import { TEMPLATES } from "@/lib/templates";

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
   * Lo que la app enseña de una página, sin su contenido ni el estado Yjs (que
   * `pages.get` devuelve enteros y en el móvil pesan): título, icono, portada, tipo,
   * candado, tipografía, publicación, si la sigo, si es favorita y mi nivel.
   */
  pagina: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const page = await ctx.db.page.findFirst({
        where: { id: input.id, workspaceId: ctx.workspace.id },
        select: {
          id: true, parentId: true, title: true, icon: true, cover: true, type: true, embedded: true,
          fullWidth: true, locked: true, font: true, publicToken: true, publicExpiresAt: true,
          publicPassword: true, restricted: true, archivedAt: true, createdAt: true, updatedAt: true,
        },
      });
      if (!page) throw new TRPCError({ code: "NOT_FOUND" });
      const nivel = await exigeNivel(ctx.db, page.id, ctx.user.id, ctx.role ?? "member", "view");
      const [sigo, fav, ultima] = await Promise.all([
        ctx.db.pageFollow.findUnique({ where: { userId_pageId: { userId: ctx.user.id, pageId: page.id } }, select: { id: true } }),
        ctx.db.favorite.findUnique({ where: { userId_pageId: { userId: ctx.user.id, pageId: page.id } }, select: { id: true } }),
        ctx.db.version.findFirst({ where: { pageId: page.id, authorId: { not: null } }, orderBy: { createdAt: "desc" }, select: { authorId: true } }),
      ]);
      const autor = ultima?.authorId
        ? await ctx.db.user.findUnique({ where: { id: ultima.authorId }, select: { name: true, email: true } })
        : null;
      const { publicPassword, ...resto } = page;
      return {
        ...resto,
        hasPublicPassword: !!publicPassword,
        siguiendo: !!sigo,
        favorita: !!fav,
        nivel,
        editadoPor: autor ? autor.name || autor.email : null,
      };
    }),

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

  /**
   * Una vista de base de datos lista para pintar: campos, vistas y las filas ya
   * filtradas, ordenadas, buscadas y agrupadas por el motor de la web, con fórmulas,
   * rollups, relaciones, colores y totales resueltos.
   */
  vista: workspaceProcedure
    .input(z.object({ pageId: z.string(), viewId: z.string().nullish(), q: z.string().max(200).nullish() }))
    .query(async ({ ctx, input }) => {
      const page = await paginaDelEspacio(ctx, input.pageId);
      const nivel = await exigeNivel(ctx.db, page.id, ctx.user.id, ctx.role ?? "member", "view");
      const v = await calculaVista(ctx.db, { workspaceId: ctx.workspace.id, userId: ctx.user.id }, page.id, input.viewId, input.q);
      if (!v) throw new TRPCError({ code: "NOT_FOUND", message: "Esta página no es una base de datos." });
      return { ...v, nivel, locked: page.locked };
    }),

  /** Importar un .md: los bloques que saldrían en la web (la app crea la página con ellos). */
  markdownABloques: workspaceProcedure
    .input(z.object({ markdown: z.string().max(2_000_000) }))
    .mutation(({ input }) => markdownABloques(input.markdown)),

  /** Exportar una página a Markdown, como «Exportar → Markdown» de la web. */
  exportarMarkdown: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const page = await paginaDelEspacio(ctx, input.id);
      await exigeNivel(ctx.db, page.id, ctx.user.id, ctx.role ?? "member", "view");
      const { title } = await ctx.db.page.findUniqueOrThrow({ where: { id: page.id }, select: { title: true } });
      return { titulo: title, markdown: await bloquesAMarkdown(await leerBloquesPagina(page)) };
    }),

  /** La galería de plantillas (las crea `pages.createFromTemplate`, como en la web). */
  plantillas: workspaceProcedure.query(() =>
    Object.entries(TEMPLATES).map(([key, t]) => ({ key, name: t.name, icon: t.icon, description: t.description })),
  ),

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
