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
import { sinEnlaceDoble } from "../subpaginas";
import { bloquesAHtml, bloquesAMarkdown, markdownABloques } from "../app/markdown";
import { documentoHtml } from "@/lib/htmlExport";
import { TEMPLATES } from "@/lib/templates";
import { nombreSeguro } from "@/lib/exportZip";
import { bloqueRecordatorio, recordatorioRapido } from "@/lib/recordatorios";
import { randomUUID } from "node:crypto";
import { infoPagina } from "@/lib/infoPagina";
import { generaDocx, leeAsset } from "../docx";
import { calculaCalendario } from "../app/calendario";
import { recordatoriosEntre, textoAviso } from "../recordatorios";

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

/** El título y el cuerpo de una fila de la BD `pageId` (para exportarla). */
async function cuerpoDeFila(ctx: Ctx, pageId: string, recordId: string): Promise<{ titulo: string; bloques: BloqueBN[] }> {
  const rec = await filaDelEspacio(ctx, recordId);
  if (rec.collection.pageId !== pageId) throw new TRPCError({ code: "NOT_FOUND" });
  const fila = await ctx.db.record.findUniqueOrThrow({
    where: { id: rec.id },
    select: { cells: true, content: true, collection: { select: { fields: { select: { id: true, type: true }, orderBy: { order: "asc" } } } } },
  });
  const t = fila.collection.fields.find((f) => f.type === "text");
  const v = t ? (fila.cells as Record<string, unknown> | null)?.[t.id] : null;
  return { titulo: typeof v === "string" ? v.trim() : "", bloques: Array.isArray(fila.content) ? (fila.content as unknown as BloqueBN[]) : [] };
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
          fullWidth: true, smallText: true, color: true, locked: true, font: true, publicToken: true, publicExpiresAt: true,
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
      const bloques = await aplicarOpsPagina(ctx.db, page.id, sinEnlaceDoble(input.ops));
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
      const v = await calculaVista(ctx.db, { workspaceId: ctx.workspace.id, userId: ctx.user.id, role: ctx.role ?? "member" }, page.id, input.viewId, input.q);
      if (!v) throw new TRPCError({ code: "NOT_FOUND", message: "Esta página no es una base de datos." });
      return { ...v, nivel, locked: page.locked };
    }),

  /** Una fila con sus propiedades ya resueltas y sus subtareas (la ficha), sin filtros de vista. */
  fila: workspaceProcedure
    .input(z.object({ pageId: z.string(), recordId: z.string() }))
    .query(async ({ ctx, input }) => {
      const page = await paginaDelEspacio(ctx, input.pageId);
      const nivel = await exigeNivel(ctx.db, page.id, ctx.user.id, ctx.role ?? "member", "view");
      const v = await calculaVista(ctx.db, { workspaceId: ctx.workspace.id, userId: ctx.user.id, role: ctx.role ?? "member" }, page.id, null, null, input.recordId);
      if (!v) throw new TRPCError({ code: "NOT_FOUND" });
      const fila = v.filas.find((f) => f.id === input.recordId);
      if (!fila) throw new TRPCError({ code: "NOT_FOUND", message: "Esta fila ya no existe (¿la borraron?)." });
      return { ...v, fila, subtareas: v.filas.filter((f) => f.parentId === input.recordId), nivel, locked: page.locked };
    }),

  /** Importar un .md: los bloques que saldrían en la web (la app crea la página con ellos). */
  markdownABloques: workspaceProcedure
    .input(z.object({ markdown: z.string().max(2_000_000) }))
    .mutation(({ input }) => markdownABloques(input.markdown)),

  /** Exportar una página a Markdown, como «Exportar → Markdown» de la web. */
  exportarMarkdown: workspaceProcedure
    .input(z.object({ id: z.string(), recordId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const page = await paginaDelEspacio(ctx, input.id);
      await exigeNivel(ctx.db, page.id, ctx.user.id, ctx.role ?? "member", "view");
      // De una fila (el «Exportar» de su ficha), su cuerpo.
      if (input.recordId) {
        const { titulo, bloques } = await cuerpoDeFila(ctx, page.id, input.recordId);
        return { titulo, markdown: await bloquesAMarkdown(bloques) };
      }
      const { title } = await ctx.db.page.findUniqueOrThrow({ where: { id: page.id }, select: { title: true } });
      return { titulo: title, markdown: await bloquesAMarkdown(await leerBloquesPagina(page)) };
    }),

  /**
   * «Información de la página» (al pie del menú ⋯, web y app): palabras, caracteres,
   * casillas, imágenes y adjuntos de lo que hay ahora (el documento vivo), y cuándo se creó
   * y se editó por última vez (y quién, si se sabe).
   */
  info: workspaceProcedure
    .input(z.object({ id: z.string(), recordId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const page = await paginaDelEspacio(ctx, input.id);
      await exigeNivel(ctx.db, page.id, ctx.user.id, ctx.role ?? "member", "view");
      const nombre = async (uid: string | null | undefined) => {
        if (!uid) return null;
        const u = await ctx.db.user.findUnique({ where: { id: uid }, select: { name: true, email: true } });
        return u ? u.name || u.email : null;
      };
      if (input.recordId) {
        const r = await ctx.db.record.findFirst({
          where: { id: input.recordId, collection: { pageId: page.id } },
          select: { content: true, createdAt: true, updatedAt: true, createdById: true, updatedById: true },
        });
        if (!r) throw new TRPCError({ code: "NOT_FOUND" });
        return { ...infoPagina(r.content), creada: r.createdAt, editada: r.updatedAt, creadaPor: await nombre(r.createdById), editadaPor: await nombre(r.updatedById) };
      }
      const p = await ctx.db.page.findUniqueOrThrow({ where: { id: page.id }, select: { createdAt: true, updatedAt: true } });
      const ultima = await ctx.db.version.findFirst({ where: { pageId: page.id, authorId: { not: null } }, orderBy: { createdAt: "desc" }, select: { authorId: true } });
      return { ...infoPagina(await leerBloquesPagina(page)), creada: p.createdAt, editada: p.updatedAt, creadaPor: null, editadaPor: await nombre(ultima?.authorId) };
    }),

  /** Mi recordatorio rápido de una página o de una fila (el «Recordatorio: …» de arriba), si lo hay. */
  recordatorio: workspaceProcedure
    .input(z.object({ id: z.string(), recordId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const page = await paginaDelEspacio(ctx, input.id);
      await exigeNivel(ctx.db, page.id, ctx.user.id, ctx.role ?? "member", "view");
      const bloques = input.recordId ? (await filaDelEspacio(ctx, input.recordId)).content : await leerBloquesPagina(page);
      return recordatorioRapido(bloques, ctx.user.id);
    }),

  /**
   * «Recordarme…» de una página o una fila: pone arriba «Recordatorio: <fecha>» (una mención
   * de fecha con aviso a la hora, como Notion) o lo cambia; `fecha: null` lo quita. El aviso
   * lo da el servidor como cualquier recordatorio (push y alarma de la app).
   */
  recordar: workspaceProcedure
    .input(z.object({ id: z.string(), recordId: z.string().optional(), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const page = await paginaDelEspacio(ctx, input.id);
      await exigeNivel(ctx.db, page.id, ctx.user.id, ctx.role ?? "member", "edit");
      const ops = (bloques: unknown): OpBloque[] => {
        const ya = recordatorioRapido(bloques, ctx.user.id);
        const out: OpBloque[] = ya ? [{ op: "delete", id: ya.id }] : [];
        if (input.fecha) out.push({ op: "upsert", block: bloqueRecordatorio(randomUUID(), input.fecha, ctx.user.id) as BloqueBN, parentId: null, afterId: null });
        return out;
      };
      if (input.recordId) {
        const rec = await filaDelEspacio(ctx, input.recordId);
        if (rec.collection.pageId !== page.id) throw new TRPCError({ code: "NOT_FOUND" });
        await ctx.db.$transaction(async (tx) => {
          const [fila] = await tx.$queryRaw<{ content: unknown }[]>`SELECT content FROM "Record" WHERE id = ${rec.id} FOR UPDATE`;
          const actuales = Array.isArray(fila?.content) ? (fila.content as BloqueBN[]) : [];
          await tx.record.update({ where: { id: rec.id }, data: { content: jsonLimpio(aplicarOpsJson(actuales, ops(actuales))), updatedById: ctx.user.id } });
        });
      } else {
        if (page.type !== "doc") throw new TRPCError({ code: "BAD_REQUEST", message: "Solo las páginas de documento tienen bloques." });
        const bloques = await aplicarOpsPagina(ctx.db, page.id, ops(await leerBloquesPagina(page)));
        await guardaContenidoPagina(ctx.db, { workspaceId: ctx.workspace.id, user: ctx.user }, page, bloques);
      }
      return { fecha: input.fecha };
    }),

  /**
   * Exportar a Word (.docx) una página o, con `recordId`, una fila de la BD `id` con sus
   * propiedades arriba (el texto que se ve en cada celda). Lo usan la web y la app.
   */
  exportarWord: workspaceProcedure
    .input(z.object({ id: z.string(), recordId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const page = await paginaDelEspacio(ctx, input.id);
      await exigeNivel(ctx.db, page.id, ctx.user.id, ctx.role ?? "member", "view");
      let titulo = "";
      let propiedades: [string, string][] | undefined;
      let bloques: unknown;
      if (input.recordId) {
        const v = await calculaVista(ctx.db, { workspaceId: ctx.workspace.id, userId: ctx.user.id, role: ctx.role ?? "member" }, page.id, null, null, input.recordId);
        const fila = v?.filas.find((f) => f.id === input.recordId);
        if (!v || !fila) throw new TRPCError({ code: "NOT_FOUND", message: "Esta fila ya no existe (¿la borraron?)." });
        const campoTitulo = v.fields.find((f) => f.type === "text");
        titulo = campoTitulo ? fila.textos[campoTitulo.id] ?? "" : "";
        const fecha = (d: Date) => d.toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "medium", timeStyle: "short" });
        propiedades = v.fields
          .filter((f) => f.id !== campoTitulo?.id)
          .map((f) => [f.name, f.type === "created_time" ? fecha(fila.createdAt) : f.type === "last_edited_time" ? fecha(fila.updatedAt) : fila.textos[f.id] ?? ""]);
        bloques = (await ctx.db.record.findUniqueOrThrow({ where: { id: fila.id }, select: { content: true } })).content;
      } else {
        titulo = (await ctx.db.page.findUniqueOrThrow({ where: { id: page.id }, select: { title: true } })).title;
        bloques = await leerBloquesPagina(page);
      }
      const docx = await generaDocx({ titulo, propiedades, bloques, leeImagen: (url) => leeAsset(ctx.db, url) });
      return { nombre: `${nombreSeguro(titulo || "Sin titulo")}.docx`, base64: docx.toString("base64") };
    }),

  /**
   * Exportar en HTML (y PDF, que la app imprime de este mismo HTML) una página o, con
   * `recordId`, el cuerpo de una fila: el mismo documento que descarga la web.
   */
  exportarHtml: workspaceProcedure
    .input(z.object({ id: z.string(), recordId: z.string().optional(), pdf: z.object({ formato: z.string().max(20), escala: z.number() }).optional() }))
    .query(async ({ ctx, input }) => {
      const page = await paginaDelEspacio(ctx, input.id);
      await exigeNivel(ctx.db, page.id, ctx.user.id, ctx.role ?? "member", "view");
      let titulo: string;
      let bloques: BloqueBN[];
      if (input.recordId) {
        ({ titulo, bloques } = await cuerpoDeFila(ctx, page.id, input.recordId));
      } else {
        titulo = (await ctx.db.page.findUniqueOrThrow({ where: { id: page.id }, select: { title: true } })).title;
        bloques = await leerBloquesPagina(page);
      }
      titulo = titulo || "Sin título";
      return { nombre: `${nombreSeguro(titulo)}.html`, html: documentoHtml({ titulo, cuerpo: await bloquesAHtml(bloques), pdf: input.pdf }) };
    }),

  /** La galería de plantillas (las crea `pages.createFromTemplate`, como en la web). */
  /**
   * Las tareas con fecha de una o varias bases de datos entre dos días (widget
   * «Calendario»): título, inicio, fin, si está hecha y su recordatorio.
   */
  calendario: workspaceProcedure
    .input(z.object({
      fuentes: z.array(z.object({ pageId: z.string(), fieldId: z.string().nullish(), mios: z.boolean().optional() })).max(10),
      desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(({ ctx, input }) =>
      calculaCalendario(ctx.db, { workspaceId: ctx.workspace.id, userId: ctx.user.id, role: ctx.role ?? "member" }, input.fuentes, input.desde, input.hasta),
    ),

  /**
   * Mis recordatorios de los próximos días (de todos mis espacios), para que la app los
   * programe con alarmas en el móvil: suenan a su hora aunque el sistema la duerma.
   */
  recordatorios: workspaceProcedure.query(async ({ ctx }) => {
    const ahora = new Date();
    const lista = await recordatoriosEntre(ctx.db, ahora, new Date(ahora.getTime() + 8 * 864e5), { userId: ctx.user.id });
    return lista.slice(0, 100).map((r) => ({
      key: r.key, cuando: r.cuando.toISOString(), titulo: r.titulo, texto: textoAviso(r, r.cuando), pageId: r.pageId, recordId: r.recordId,
    }));
  }),

  /**
   * Mis últimos avisos de TODOS mis espacios, con el suyo: la app los saca como
   * notificación del sistema aunque sean de otro espacio (`notifications.list` es solo
   * el activo) y al tocarlos pasa a ese espacio, como el push de la web.
   */
  avisos: workspaceProcedure.query(async ({ ctx }) => {
    const lista = await ctx.db.notification.findMany({
      where: {
        userId: ctx.user.id,
        workspace: { OR: [{ ownerId: ctx.user.id }, { members: { some: { userId: ctx.user.id } } }] },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        actor: { select: { name: true, email: true } },
        page: { select: { id: true, title: true, icon: true } },
        workspace: { select: { id: true, name: true } },
      },
    });
    return lista.map(({ workspace, ...n }) => ({ ...n, espacio: workspace }));
  }),

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
