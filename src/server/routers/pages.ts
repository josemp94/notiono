import { randomBytes } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { router, workspaceProcedure } from "../trpc";
import { rankAtEnd, rankBetween } from "@/lib/fractional";
import { TEMPLATES } from "@/lib/templates";
import { fetchLinkPreview } from "../linkPreview";
import { createCollabToken } from "../collabToken";
import { dispatchWebhooks } from "../webhooks";
import { createPage } from "../services/pages";
import { alcanza, exigeNivel, mapaDeNiveles, nivelDePagina, type Nivel } from "../services/perms";

/** Días que aguanta una página en la papelera antes de la auto-purga (también en /trash). */
const TRASH_TTL_DAYS = 30;

/** Nodo del árbol de páginas para el sidebar. */
type TreeNode = {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  order: string;
  hasChildren: boolean;
};

export const pagesRouter = router({
  /** Árbol completo de páginas vivas del workspace (para el sidebar). */
  tree: workspaceProcedure.query(async ({ ctx }): Promise<TreeNode[]> => {
    const todas = await ctx.db.page.findMany({
      where: { workspaceId: ctx.workspace.id, archivedAt: null, embedded: false },
      select: { id: true, title: true, icon: true, parentId: true, order: true },
      orderBy: { order: "asc" },
    });
    // Una página restringida no existe para quien no está invitado: ni en el árbol.
    const nivel = await mapaDeNiveles(ctx.db, ctx.workspace.id, ctx.user.id, ctx.role ?? "member");
    const pages = todas.filter((p) => alcanza(nivel(p.id), "view"));
    const childCount = new Map<string, number>();
    for (const p of pages) {
      if (p.parentId) childCount.set(p.parentId, (childCount.get(p.parentId) ?? 0) + 1);
    }
    return pages.map((p) => ({ ...p, hasChildren: childCount.has(p.id) }));
  }),

  /** Búsqueda por título para la paleta de comandos (Ctrl+K). */
  /**
   * Busca páginas por título y, si `inContent`, también dentro del texto de los bloques.
   * Las coincidencias de título van primero; `inContent: false` (el menú "@") solo mira títulos.
   */
  search: workspaceProcedure
    .input(
      z.object({
        query: z.string(),
        inContent: z.boolean().default(false),
        // Filtros de la paleta: tipo de página y edición reciente (días hacia atrás).
        tipo: z.enum(["all", "doc", "database"]).default("all"),
        editadoDias: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const q = input.query.trim();
      if (!q) return [];
      const like = `%${q}%`;
      const desde = input.editadoDias ? new Date(Date.now() - input.editadoDias * 864e5) : null;
      const nivel = await mapaDeNiveles(ctx.db, ctx.workspace.id, ctx.user.id, ctx.role ?? "member");
      if (!input.inContent) {
        const rows = await ctx.db.page.findMany({
          where: {
            workspaceId: ctx.workspace.id,
            archivedAt: null,
            embedded: false,
            title: { contains: q, mode: "insensitive" },
            ...(input.tipo !== "all" ? { type: input.tipo } : {}),
            ...(desde ? { updatedAt: { gte: desde } } : {}),
          },
          select: { id: true, title: true, icon: true, type: true },
          orderBy: { updatedAt: "desc" },
          take: 20,
        });
        return rows.filter((r) => alcanza(nivel(r.id), "view")).map((r) => ({ ...r, inTitle: true }));
      }
      // jsonb_path_query_array saca solo los textos de los bloques: buscar sobre content::text
      // en crudo daría falsos positivos con las claves del JSON ("text", "table", "styles"…).
      // ponytail: escaneo secuencial por espacio; si algún día se nota, índice GIN sobre tsvector.
      const filtroTipo = input.tipo === "all" ? Prisma.empty : Prisma.sql`AND type = ${input.tipo}`;
      const filtroFecha = desde ? Prisma.sql`AND "updatedAt" >= ${desde}` : Prisma.empty;
      const rows = await ctx.db.$queryRaw<
        { id: string; title: string; icon: string | null; type: string; inTitle: boolean }[]
      >(Prisma.sql`
        SELECT id, title, icon, type, (title ILIKE ${like}) AS "inTitle"
        FROM "Page"
        WHERE "workspaceId" = ${ctx.workspace.id}
          AND "archivedAt" IS NULL
          AND embedded = false
          ${filtroTipo}
          ${filtroFecha}
          AND (
            title ILIKE ${like}
            OR jsonb_path_query_array(content, '$.**.text')::text ILIKE ${like}
          )
        ORDER BY (title ILIKE ${like}) DESC, "updatedAt" DESC
        LIMIT 20
      `);
      return rows.filter((r) => alcanza(nivel(r.id), "view"));
    }),

  /**
   * Enlaces entrantes: páginas cuyo contenido menciona a esta (chips @página).
   * Las menciones viven dentro del JSON de bloques, así que se busca el id ahí:
   * un cuid es único, no hay falsos positivos realistas.
   */
  backlinks: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.$queryRaw<{ id: string; title: string; icon: string | null; type: string }[]>(Prisma.sql`
        SELECT id, title, icon, type
        FROM "Page"
        WHERE "workspaceId" = ${ctx.workspace.id}
          AND "archivedAt" IS NULL
          AND embedded = false
          AND id <> ${input.id}
          AND content::text LIKE ${"%" + input.id + "%"}
        ORDER BY "updatedAt" DESC
        LIMIT 50
      `);
      const nivel = await mapaDeNiveles(ctx.db, ctx.workspace.id, ctx.user.id, ctx.role ?? "member");
      return rows.filter((r) => alcanza(nivel(r.id), "view"));
    }),

  /** Permiso de corta vida para entrar en la sala de edición simultánea de la página. */
  collabToken: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const page = await ctx.db.page.findFirst({
        where: { id: input.id, workspaceId: ctx.workspace.id, archivedAt: null },
        select: { id: true },
      });
      if (!page) throw new TRPCError({ code: "NOT_FOUND" });
      // La sala Yjs es de lectura y escritura: por debajo de «editar» no se entra
      // (el cliente enseña la página en solo lectura sin conectarse).
      await exigeNivel(ctx.db, page.id, ctx.user.id, ctx.role ?? "member", "edit");
      return { token: createCollabToken(page.id, ctx.user.id, ctx.role ?? "editor") };
    }),

  /**
   * Prepara la página para la edición simultánea. Sin esto, el primero que
   * entrase en modo colaborativo vería el documento vacío.
   *
   * La conversión de bloques a estado Yjs la hace el NAVEGADOR, no el servidor:
   * necesita el esquema del editor, que está hecho de componentes de React, y en
   * el servidor de Next `react` se resuelve en su versión de servidor —sin
   * `createContext`—, así que la conversión revienta ahí. Aquí solo se decide, de
   * forma atómica, QUIÉN siembra: el primero que llega se lleva el contenido para
   * insertarlo; a los demás ya les llegará por la red.
   */
  ensureYdoc: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const page = await ctx.db.page.findFirst({
        where: { id: input.id, workspaceId: ctx.workspace.id },
        select: { id: true, ydoc: true, content: true },
      });
      if (!page) throw new TRPCError({ code: "NOT_FOUND" });
      await exigeNivel(ctx.db, page.id, ctx.user.id, ctx.role ?? "member", "edit");
      if (page.ydoc) return { seed: null };

      const Y = await import("yjs");
      // Documento vacío: sirve de "reserva" para que solo una pestaña siembre.
      const vacio = Buffer.from(Y.encodeStateAsUpdate(new Y.Doc()));
      const nuestro = await ctx.db.page.updateMany({
        where: { id: page.id, ydoc: null },
        data: { ydoc: vacio },
      });
      if (nuestro.count === 0) return { seed: null };
      return { seed: Array.isArray(page.content) ? page.content : [] };
    }),

  /** Vista previa de un enlace (OpenGraph) para el bloque "bookmark" del editor. */
  linkPreview: workspaceProcedure
    .input(z.object({ url: z.string().min(4).max(2000) }))
    .mutation(({ input }) => fetchLinkPreview(input.url)),

  /** Contenido de una página. */
  get: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const page = await ctx.db.page.findFirst({
        where: { id: input.id, workspaceId: ctx.workspace.id },
      });
      if (!page) throw new TRPCError({ code: "NOT_FOUND" });
      // El nivel viaja con la página: el cliente decide con él si edita o solo lee.
      const nivel = await exigeNivel(ctx.db, page.id, ctx.user.id, ctx.role ?? "member", "view");
      // «Editado por X hace Y»: el autor sale de la última versión con autor (solo
      // las páginas doc versionan; las de BD enseñan solo el «hace Y»).
      const ultima = await ctx.db.version.findFirst({
        where: { pageId: page.id, authorId: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { authorId: true },
      });
      const autor = ultima?.authorId
        ? await ctx.db.user.findUnique({ where: { id: ultima.authorId }, select: { name: true, email: true } })
        : null;
      return { ...page, nivel, editadoPor: autor ? autor.name || autor.email : null };
    }),

  /**
   * Datos para exportar a ZIP: la página pedida con todos sus descendientes, o el
   * espacio entero (pageId null, la copia de seguridad). Solo lo que este usuario
   * puede ver; las BD viajan con campos y filas.
   */
  exportTree: workspaceProcedure
    .input(z.object({ pageId: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      if (input.pageId) await assertOwned(ctx, input.pageId, "view");
      const all = await ctx.db.page.findMany({
        where: { workspaceId: ctx.workspace.id, archivedAt: null, embedded: false },
        select: {
          id: true,
          parentId: true,
          title: true,
          type: true,
          content: true,
          collection: {
            select: {
              fields: { orderBy: { order: "asc" }, select: { id: true, name: true, type: true, config: true } },
              records: { where: { archivedAt: null }, orderBy: { order: "asc" }, select: { id: true, cells: true } },
            },
          },
        },
        orderBy: { order: "asc" },
      });
      const nivelDe = await mapaDeNiveles(ctx.db, ctx.workspace.id, ctx.user.id, ctx.role ?? "member");
      const visibles = all.filter((p) => alcanza(nivelDe(p.id), "view"));
      if (!input.pageId) return visibles;
      const hijosDe = new Map<string | null, typeof visibles>();
      for (const p of visibles) hijosDe.set(p.parentId, [...(hijosDe.get(p.parentId) ?? []), p]);
      const out: typeof visibles = [];
      const cola = visibles.filter((p) => p.id === input.pageId);
      while (cola.length) {
        const p = cola.shift()!;
        out.push(p);
        cola.push(...(hijosDe.get(p.id) ?? []));
      }
      return out;
    }),

  /** Crear página (opcionalmente hija de otra). */
  create: workspaceProcedure
    .input(z.object({ parentId: z.string().nullish(), title: z.string().default("") }))
    .mutation(async ({ ctx, input }) => {
      if (input.parentId) await assertOwned(ctx, input.parentId);
      return createPage(
        { db: ctx.db, workspaceId: ctx.workspace.id, userId: ctx.user.id },
        { title: input.title, parentId: input.parentId ?? null },
      );
    }),

  /** Crea una página o base de datos prehecha a partir de una plantilla de la galería. */
  createFromTemplate: workspaceProcedure
    .input(z.object({ key: z.string(), parentId: z.string().nullish() }))
    .mutation(async ({ ctx, input }) => {
      const tplDef = TEMPLATES[input.key];
      if (!tplDef) throw new TRPCError({ code: "BAD_REQUEST", message: "Plantilla desconocida." });
      if (input.parentId) await assertOwned(ctx, input.parentId);
      const tpl = tplDef.make();
      const last = await ctx.db.page.findFirst({
        where: { workspaceId: ctx.workspace.id, parentId: input.parentId ?? null },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const base = {
        workspaceId: ctx.workspace.id,
        parentId: input.parentId ?? null,
        title: tplDef.name,
        icon: tplDef.icon,
        order: rankAtEnd(last?.order ?? null),
      };
      if (tpl.type === "doc") {
        const page = await ctx.db.page.create({
          data: { ...base, content: tpl.content as Prisma.InputJsonValue },
        });
        return { id: page.id };
      }
      const id = await ctx.db.$transaction(async (tx) => {
        const page = await tx.page.create({ data: { ...base, type: "database", content: [] } });
        const col = await tx.collection.create({ data: { pageId: page.id, name: tplDef.name } });
        const idByName = new Map<string, string>();
        let fOrd: string | null = null;
        for (const f of tpl.fields) {
          fOrd = rankAtEnd(fOrd);
          const created = await tx.field.create({
            data: { collectionId: col.id, name: f.name, type: f.type, order: fOrd, config: (f.config ?? {}) as Prisma.InputJsonValue },
          });
          idByName.set(f.name, created.id);
        }
        let vOrd: string | null = null;
        for (const v of tpl.views) {
          const config: Record<string, unknown> = {};
          if (v.groupByField) config.groupByFieldId = idByName.get(v.groupByField) ?? null;
          if (v.calcs) {
            config.calcs = Object.fromEntries(
              Object.entries(v.calcs).flatMap(([name, calc]) => {
                const fid = idByName.get(name);
                return fid ? [[fid, calc] as const] : [];
              }),
            );
          }
          vOrd = rankAtEnd(vOrd);
          await tx.view.create({
            data: { collectionId: col.id, name: v.name, type: v.type, config: config as Prisma.InputJsonValue, order: vOrd },
          });
        }
        let rOrd: string | null = null;
        for (const [i, rec] of tpl.records.entries()) {
          rOrd = rankAtEnd(rOrd);
          const cells: Record<string, unknown> = {};
          for (const [name, value] of Object.entries(rec)) {
            const fid = idByName.get(name);
            if (fid && value !== "" && value != null) cells[fid] = value;
          }
          await tx.record.create({
            data: { collectionId: col.id, order: rOrd, seq: i + 1, cells: cells as Prisma.InputJsonValue },
          });
        }
        return page.id;
      });
      return { id };
    }),

  /** Renombrar (título + icono). */
  rename: workspaceProcedure
    .input(z.object({ id: z.string(), title: z.string(), icon: z.string().nullish() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx, input.id);
      return ctx.db.page.update({
        where: { id: input.id },
        data: { title: input.title, ...(input.icon !== undefined ? { icon: input.icon } : {}) },
      });
    }),

  /** Poner o quitar la portada. */
  setCover: workspaceProcedure
    .input(z.object({ id: z.string(), cover: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx, input.id);
      return ctx.db.page.update({
        where: { id: input.id },
        data: { cover: input.cover },
        select: { id: true, cover: true },
      });
    }),

  /** Toggle "Ancho completo": el contenido de la página usa todo el ancho. */
  setFullWidth: workspaceProcedure
    .input(z.object({ id: z.string(), value: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx, input.id);
      return ctx.db.page.update({
        where: { id: input.id },
        data: { fullWidth: input.value },
        select: { id: true, fullWidth: true },
      });
    }),

  /** Candado anti-ediciones accidentales: cualquiera con edición lo pone y lo
   *  quita, como en Notion (no es un permiso, es un «no tocar sin querer»). */
  setLocked: workspaceProcedure
    .input(z.object({ id: z.string(), value: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx, input.id);
      return ctx.db.page.update({
        where: { id: input.id },
        data: { locked: input.value },
        select: { id: true, locked: true },
      });
    }),

  /** Guardar contenido de bloques (autosave). Snapshota el contenido anterior como Version. */
  updateContent: workspaceProcedure
    .input(z.object({ id: z.string(), content: z.any() }))
    .mutation(async ({ ctx, input }) => {
      const page = await ctx.db.page.findFirst({
        where: { id: input.id, workspaceId: ctx.workspace.id },
        select: { id: true, content: true },
      });
      if (!page) throw new TRPCError({ code: "NOT_FOUND" });
      await exigeNivel(ctx.db, page.id, ctx.user.id, ctx.role ?? "member", "edit");
      // ponytail: throttle simple — solo se crea versión si la última tiene más de 2 min;
      // dentro de la ventana se omite (la versión reciente ya cubre ese estado).
      const last = await ctx.db.version.findFirst({
        where: { pageId: input.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (!last || Date.now() - last.createdAt.getTime() > 2 * 60_000) {
        await ctx.db.version.create({
          data: { pageId: input.id, snapshot: (page.content ?? []) as Prisma.InputJsonValue, authorId: ctx.user.id },
        });
      }
      return ctx.db.page.update({
        where: { id: input.id },
        data: { content: input.content },
        select: { id: true, updatedAt: true },
      });
    }),

  /** Historial de versiones del contenido de una página. */
  versions: router({
    /** Últimas versiones (más recientes primero), con autor resuelto. */
    list: workspaceProcedure
      .input(z.object({ pageId: z.string() }))
      .query(async ({ ctx, input }) => {
        await assertOwned(ctx, input.pageId, "view");
        const versions = await ctx.db.version.findMany({
          where: { pageId: input.pageId },
          orderBy: { createdAt: "desc" },
          take: 50,
        });
        const authorIds = [...new Set(versions.map((v) => v.authorId).filter((x): x is string => !!x))];
        const users = await ctx.db.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true, email: true },
        });
        const nameById = new Map(users.map((u) => [u.id, u.name || u.email]));
        return versions.map((v) => ({
          id: v.id,
          createdAt: v.createdAt,
          author: v.authorId ? (nameById.get(v.authorId) ?? null) : null,
          snapshot: v.snapshot,
        }));
      }),

    /** Repone el contenido de una versión, guardando antes el estado actual como versión nueva. */
    restore: workspaceProcedure
      .input(z.object({ versionId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const version = await ctx.db.version.findFirst({
          where: { id: input.versionId, page: { workspaceId: ctx.workspace.id } },
          include: { page: { select: { id: true, content: true } } },
        });
        if (!version) throw new TRPCError({ code: "NOT_FOUND" });
        await exigeNivel(ctx.db, version.pageId, ctx.user.id, ctx.role ?? "member", "edit");
        await ctx.db.$transaction([
          ctx.db.version.create({
            data: {
              pageId: version.pageId,
              snapshot: (version.page.content ?? []) as Prisma.InputJsonValue,
              authorId: ctx.user.id,
            },
          }),
          ctx.db.page.update({
            where: { id: version.pageId },
            data: { content: version.snapshot as Prisma.InputJsonValue },
          }),
        ]);
        return { pageId: version.pageId };
      }),
  }),

  /** Publica la página en la web. Idempotente: conserva el token (y la URL) si ya estaba publicada. */
  publish: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const page = await ctx.db.page.findFirst({
        where: { id: input.id, workspaceId: ctx.workspace.id },
        select: { id: true, publicToken: true },
      });
      if (!page) throw new TRPCError({ code: "NOT_FOUND" });
      // Publicar al mundo exige acceso total, como en Notion.
      await exigeNivel(ctx.db, page.id, ctx.user.id, ctx.role ?? "member", "full");
      if (page.publicToken) return { id: page.id, publicToken: page.publicToken };
      const publicada = await ctx.db.page.update({
        where: { id: page.id },
        data: { publicToken: randomBytes(16).toString("base64url") },
        select: { id: true, publicToken: true, title: true },
      });
      dispatchWebhooks(ctx.workspace.id, "page.published", {
        pageId: publicada.id,
        title: publicada.title,
        url: `/s/${publicada.publicToken}`,
      });
      return publicada;
    }),

  /** Retira la página de la web (invalida la URL pública). */
  unpublish: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx, input.id, "full");
      return ctx.db.page.update({
        where: { id: input.id },
        data: { publicToken: null },
        select: { id: true, publicToken: true },
      });
    }),

  /** Mover una página: re-parent y/o reordenar entre hermanas (drag & drop del sidebar). */
  move: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        parentId: z.string().nullable(),
        beforeId: z.string().optional(), // insertar justo antes de esta hermana
        afterId: z.string().optional(), // insertar justo después de esta hermana
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx, input.id);
      if (input.parentId) {
        await assertOwned(ctx, input.parentId);
        const subtree = await descendantIds(ctx, input.id);
        if (subtree.includes(input.parentId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No puedes mover una página dentro de su propio subárbol.",
          });
        }
      }
      const siblings = await ctx.db.page.findMany({
        where: {
          workspaceId: ctx.workspace.id,
          parentId: input.parentId,
          archivedAt: null,
          id: { not: input.id },
        },
        select: { id: true, order: true },
        orderBy: { order: "asc" },
      });
      const anchorId = input.beforeId ?? input.afterId;
      const anchor = anchorId ? siblings.findIndex((s) => s.id === anchorId) : -1;
      let a: string | null = siblings.at(-1)?.order ?? null; // por defecto: al final
      let b: string | null = null;
      if (anchor !== -1) {
        if (input.beforeId) {
          a = siblings[anchor - 1]?.order ?? null;
          b = siblings[anchor].order;
        } else {
          a = siblings[anchor].order;
          b = siblings[anchor + 1]?.order ?? null;
        }
      }
      return ctx.db.page.update({
        where: { id: input.id },
        data: { parentId: input.parentId, order: rankBetween(a, b) },
        select: { id: true, parentId: true, order: true },
      });
    }),

  /** Duplicar una página (copia profunda: contenido, colección y subpáginas). */
  duplicate: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const orig = await ctx.db.page.findFirst({
        where: { id: input.id, workspaceId: ctx.workspace.id },
        select: { id: true, parentId: true, order: true },
      });
      if (!orig) throw new TRPCError({ code: "NOT_FOUND" });
      // La copia nace al lado de la original: hace falta poder editar ahí.
      await exigeNivel(ctx.db, orig.id, ctx.user.id, ctx.role ?? "member", "edit");
      // La copia va justo detrás de la original entre sus hermanas.
      const next = await ctx.db.page.findFirst({
        where: {
          workspaceId: ctx.workspace.id,
          parentId: orig.parentId,
          archivedAt: null,
          order: { gt: orig.order },
        },
        orderBy: { order: "asc" },
        select: { order: true },
      });
      const id = await ctx.db.$transaction(
        (tx) =>
          copyPage(tx, ctx.workspace.id, orig.id, orig.parentId, rankBetween(orig.order, next?.order ?? null), true),
        { timeout: 30_000 },
      );
      return { id };
    }),

  /** Enviar a la papelera (soft-delete, con subárbol). */
  archive: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx, input.id);
      const ids = await descendantIds(ctx, input.id);
      await ctx.db.page.updateMany({
        where: { id: { in: ids } },
        data: { archivedAt: new Date(), archivedById: ctx.user.id },
      });
      return { archived: ids.length };
    }),

  /** Listar la papelera (páginas archivadas). */
  trash: workspaceProcedure.query(async ({ ctx }) => {
    return ctx.db.page.findMany({
      where: { workspaceId: ctx.workspace.id, archivedAt: { not: null } },
      select: {
        id: true,
        title: true,
        icon: true,
        parentId: true,
        archivedAt: true,
        archivedBy: { select: { name: true, email: true } },
      },
      orderBy: { archivedAt: "desc" },
    });
  }),

  /** Restaurar de la papelera (con subárbol). */
  restore: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx, input.id);
      const ids = await descendantIds(ctx, input.id);
      await ctx.db.page.updateMany({
        where: { id: { in: ids } },
        data: { archivedAt: null, archivedById: null },
      });
      return { restored: ids.length };
    }),

  /**
   * Auto-purga perezosa: borra definitivamente lo que lleve más de 30 días en la
   * papelera (con subárbol). Se invoca al abrir la papelera; sin cron.
   */
  purgeExpired: workspaceProcedure.mutation(async ({ ctx }) => {
    const cutoff = new Date(Date.now() - TRASH_TTL_DAYS * 864e5);
    const expired = await ctx.db.page.findMany({
      where: { workspaceId: ctx.workspace.id, archivedAt: { lt: cutoff } },
      select: { id: true },
    });
    if (expired.length === 0) return { purged: 0 };
    const ids = new Set<string>();
    for (const p of expired) for (const d of await descendantIds(ctx, p.id)) ids.add(d);
    const r = await ctx.db.page.deleteMany({ where: { id: { in: [...ids] } } });
    return { purged: r.count };
  }),

  /** Vaciar la papelera: borra definitivamente todo lo archivado del workspace. */
  emptyTrash: workspaceProcedure.mutation(async ({ ctx }) => {
    const r = await ctx.db.page.deleteMany({
      where: { workspaceId: ctx.workspace.id, archivedAt: { not: null } },
    });
    return { removed: r.count };
  }),

  /** Marcar/desmarcar una página como favorita (★, por usuario). */
  toggleFavorite: workspaceProcedure
    .input(z.object({ pageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx, input.pageId, "view");
      const key = { userId_pageId: { userId: ctx.user.id, pageId: input.pageId } };
      const existing = await ctx.db.favorite.findUnique({ where: key });
      if (existing) {
        await ctx.db.favorite.delete({ where: key });
        return { favorite: false };
      }
      const last = await ctx.db.favorite.findFirst({
        where: { userId: ctx.user.id },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      await ctx.db.favorite.create({
        data: { userId: ctx.user.id, pageId: input.pageId, order: rankAtEnd(last?.order ?? null) },
      });
      return { favorite: true };
    }),

  /**
   * Permisos por página. Restringir corta la herencia: solo entran los usuarios con
   * fila en PagePermission (owner/admin del espacio entran siempre). Al restringir se
   * siembra con los miembros actuales y su nivel de rol, para que restringir no cambie
   * nada hasta que quites o bajes a alguien. Gestionar permisos exige acceso total.
   */
  perms: router({
    get: workspaceProcedure
      .input(z.object({ pageId: z.string() }))
      .query(async ({ ctx, input }) => {
        await assertOwned(ctx, input.pageId, "view");
        const page = await ctx.db.page.findUniqueOrThrow({
          where: { id: input.pageId },
          select: { restricted: true },
        });
        const nivel = await nivelDePagina(ctx.db, input.pageId, ctx.user.id, ctx.role ?? "member");
        const permisos = await ctx.db.pagePermission.findMany({
          where: { pageId: input.pageId },
          select: { userId: true, level: true, user: { select: { name: true, email: true } } },
        });
        return {
          restricted: page.restricted,
          nivel,
          permisos: permisos.map((p) => ({
            userId: p.userId,
            level: p.level,
            name: p.user.name || p.user.email,
          })),
        };
      }),

    setRestricted: workspaceProcedure
      .input(z.object({ pageId: z.string(), restricted: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await assertOwned(ctx, input.pageId, "full");
        if (input.restricted) {
          const yaHay = await ctx.db.pagePermission.count({ where: { pageId: input.pageId } });
          if (!yaHay) {
            const miembros = await ctx.db.member.findMany({
              where: { workspaceId: ctx.workspace.id },
              select: { userId: true, role: true },
            });
            await ctx.db.pagePermission.createMany({
              data: miembros
                .filter((m) => m.role !== "admin" && m.role !== "owner")
                .map((m) => ({
                  pageId: input.pageId,
                  userId: m.userId,
                  level: m.role === "viewer" ? "view" : "edit",
                })),
              skipDuplicates: true,
            });
          }
        }
        // Al quitar la restricción las filas se conservan: si se reactiva, vuelve la misma lista.
        return ctx.db.page.update({
          where: { id: input.pageId },
          data: { restricted: input.restricted },
          select: { id: true, restricted: true },
        });
      }),

    set: workspaceProcedure
      .input(z.object({ pageId: z.string(), userId: z.string(), level: z.enum(["view", "comment", "edit", "full"]) }))
      .mutation(async ({ ctx, input }) => {
        await assertOwned(ctx, input.pageId, "full");
        const miembro = await ctx.db.member.findUnique({
          where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId: input.userId } },
          select: { id: true },
        });
        if (!miembro) throw new TRPCError({ code: "BAD_REQUEST", message: "No es miembro del espacio." });
        return ctx.db.pagePermission.upsert({
          where: { pageId_userId: { pageId: input.pageId, userId: input.userId } },
          create: { pageId: input.pageId, userId: input.userId, level: input.level },
          update: { level: input.level },
        });
      }),

    remove: workspaceProcedure
      .input(z.object({ pageId: z.string(), userId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assertOwned(ctx, input.pageId, "full");
        await ctx.db.pagePermission.deleteMany({ where: { pageId: input.pageId, userId: input.userId } });
        return { ok: true };
      }),
  }),

  /** Borrar definitivamente (con subárbol). */
  remove: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx, input.id);
      const ids = await descendantIds(ctx, input.id);
      // Borra hijos antes que padres para respetar la relación de árbol.
      await ctx.db.page.deleteMany({ where: { id: { in: ids } } });
      return { removed: ids.length };
    }),
});

/** Favoritos del usuario en el workspace activo (sección ⭐ del sidebar). */
export const favoritesRouter = router({
  list: workspaceProcedure.query(async ({ ctx }) => {
    const favs = await ctx.db.favorite.findMany({
      where: { userId: ctx.user.id, page: { workspaceId: ctx.workspace.id, archivedAt: null } },
      orderBy: { order: "asc" },
      select: { page: { select: { id: true, title: true, icon: true } } },
    });
    // Si te restringieron una página que tenías en favoritos, tampoco sale aquí.
    const nivel = await mapaDeNiveles(ctx.db, ctx.workspace.id, ctx.user.id, ctx.role ?? "member");
    return favs.map((f) => f.page).filter((p) => alcanza(nivel(p.id), "view"));
  }),

  /** Recoloca un favorito respecto a otro (arrastrar en el sidebar). */
  move: workspaceProcedure
    .input(z.object({ pageId: z.string(), beforePageId: z.string().optional(), afterPageId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const mine = await ctx.db.favorite.findMany({
        where: { userId: ctx.user.id, page: { workspaceId: ctx.workspace.id } },
        orderBy: { order: "asc" },
        select: { id: true, pageId: true, order: true },
      });
      const fav = mine.find((f) => f.pageId === input.pageId);
      if (!fav) throw new TRPCError({ code: "NOT_FOUND" });
      const rest = mine.filter((f) => f.pageId !== input.pageId);
      const anchorId = input.beforePageId ?? input.afterPageId;
      const at = anchorId ? rest.findIndex((f) => f.pageId === anchorId) : -1;
      let a: string | null = rest.at(-1)?.order ?? null; // por defecto, al final
      let b: string | null = null;
      if (at !== -1) {
        if (input.beforePageId) {
          a = rest[at - 1]?.order ?? null;
          b = rest[at].order;
        } else {
          a = rest[at].order;
          b = rest[at + 1]?.order ?? null;
        }
      }
      await ctx.db.favorite.update({ where: { id: fav.id }, data: { order: rankBetween(a, b) } });
      return { ok: true as const };
    }),
});

/** Sustituye ids antiguos por nuevos dentro de un JSON (cells, configs, specs). Los cuid son únicos, el reemplazo textual es seguro. */
function remapIds<T>(value: T, map: Map<string, string>): T {
  let s = JSON.stringify(value);
  if (s === undefined) return value;
  for (const [oldId, newId] of map) s = s.split(oldId).join(newId);
  return JSON.parse(s) as T;
}

function asJson(v: Prisma.JsonValue | null) {
  return v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue);
}

/** Copia profunda de una página: contenido, colección (campos/vistas/registros), gráficas y subpáginas. */
async function copyPage(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  srcId: string,
  parentId: string | null,
  order: string,
  isRoot: boolean,
): Promise<string> {
  const src = await tx.page.findUniqueOrThrow({
    where: { id: srcId },
    include: {
      collection: {
        include: {
          fields: { orderBy: { order: "asc" } },
          views: { orderBy: { order: "asc" } },
          records: { orderBy: { order: "asc" } },
        },
      },
      charts: true,
    },
  });

  const page = await tx.page.create({
    data: {
      workspaceId,
      parentId,
      title: isRoot ? `${src.title} (copia)` : src.title,
      icon: src.icon,
      cover: src.cover,
      type: src.type,
      order,
      content: asJson(src.content),
    },
  });
  const map = new Map<string, string>([[src.id, page.id]]);

  if (src.collection) {
    const col = await tx.collection.create({ data: { pageId: page.id, name: src.collection.name } });
    map.set(src.collection.id, col.id);
    for (const f of src.collection.fields) {
      const nf = await tx.field.create({
        data: { collectionId: col.id, name: f.name, type: f.type, order: f.order, config: f.config as Prisma.InputJsonValue },
      });
      map.set(f.id, nf.id);
    }
    const createdRecords: { newId: string; orig: Prisma.JsonValue; stored: Prisma.JsonValue }[] = [];
    for (const r of src.collection.records) {
      const cells = remapIds(r.cells, map);
      const nr = await tx.record.create({
        data: {
          collectionId: col.id,
          order: r.order,
          seq: r.seq,
          cells: cells as Prisma.InputJsonValue,
          content: r.content === null ? Prisma.DbNull : (remapIds(r.content, map) as Prisma.InputJsonValue),
        },
      });
      map.set(r.id, nr.id);
      createdRecords.push({ newId: nr.id, orig: r.cells, stored: cells });
    }
    // Vistas: se crean al final, con el mapa completo (campos y registros ya remapeables).
    for (const v of src.collection.views) {
      await tx.view.create({
        // El orden se copia tal cual: son claves únicas dentro de la colección nueva.
        data: { collectionId: col.id, name: v.name, type: v.type, config: remapIds(v.config, map) as Prisma.InputJsonValue, order: v.order },
      });
    }
    // Segunda pasada: configs de campo (relación/rollup a la propia colección) y celdas con relaciones internas.
    for (const f of src.collection.fields) {
      const cfg = remapIds(f.config, map);
      if (JSON.stringify(cfg) !== JSON.stringify(f.config)) {
        await tx.field.update({ where: { id: map.get(f.id)! }, data: { config: cfg as Prisma.InputJsonValue } });
      }
    }
    for (const r of createdRecords) {
      const cells = remapIds(r.orig, map);
      if (JSON.stringify(cells) !== JSON.stringify(r.stored)) {
        await tx.record.update({ where: { id: r.newId }, data: { cells: cells as Prisma.InputJsonValue } });
      }
    }
  }

  for (const ch of src.charts) {
    await tx.chart.create({ data: { pageId: page.id, name: ch.name, spec: remapIds(ch.spec, map) as Prisma.InputJsonValue } });
  }

  const children = await tx.page.findMany({
    where: { parentId: src.id, archivedAt: null },
    select: { id: true, order: true },
    orderBy: { order: "asc" },
  });
  for (const c of children) {
    // Las hermanas nuevas nacen sin conflicto: se reutiliza el order original de cada hija.
    await copyPage(tx, workspaceId, c.id, page.id, c.order, false);
  }
  return page.id;
}

async function assertOwned(
  ctx: { db: typeof import("@/lib/db").db; workspace: { id: string }; user: { id: string }; role?: string },
  id: string,
  min: Nivel = "edit",
) {
  const p = await ctx.db.page.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    select: { id: true },
  });
  if (!p) throw new TRPCError({ code: "NOT_FOUND" });
  await exigeNivel(ctx.db, id, ctx.user.id, ctx.role ?? "member", min);
}

/** Devuelve el id de la página y de todos sus descendientes. */
async function descendantIds(
  ctx: { db: typeof import("@/lib/db").db; workspace: { id: string } },
  rootId: string,
): Promise<string[]> {
  const all = await ctx.db.page.findMany({
    where: { workspaceId: ctx.workspace.id },
    select: { id: true, parentId: true },
  });
  const byParent = new Map<string, string[]>();
  for (const p of all) {
    if (p.parentId) {
      const arr = byParent.get(p.parentId) ?? [];
      arr.push(p.id);
      byParent.set(p.parentId, arr);
    }
  }
  const result: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    result.push(id);
    for (const c of byParent.get(id) ?? []) stack.push(c);
  }
  return result;
}
