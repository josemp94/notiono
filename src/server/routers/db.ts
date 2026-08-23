import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { router, workspaceProcedure } from "../trpc";
import { rankAtEnd, rankBetween } from "@/lib/fractional";
import { toCsv } from "@/lib/csv";
import { aFecha, evalFormula, type Val } from "../formula";
import { dispatchWebhooks } from "../webhooks";
import { dateValue, dayOf } from "@/lib/cellText";
import { applyViewConfig, cellValue, conComputados, filterFieldIds, type DbField, type DbRecord, type FilterNode } from "@/lib/viewData";
import { calculaComputados, necesitaComputados } from "../services/computados";
import { cellToText, peopleOf } from "../services/cells";
import { sendPush } from "../push";
import { alcanza, exigeNivel, mapaDeNiveles, type Nivel } from "../services/perms";
import { infiereColumnas } from "@/lib/csvTipos";
import { agregaRollup, ROLLUP_AGGS } from "@/lib/rollup";
import { limpiaReferencias, sincronizaEspejo } from "../services/relations";
import * as dbService from "../services/db";
import { DbError, FIELD_TYPES, VIEW_TYPES } from "../services/db";

/** Días que sobreviven las filas borradas antes de desaparecer para siempre. */
export const RECORD_TRASH_TTL_DAYS = 30;

// Los tipos de campo y las vistas los define la capa de servicio, que es quien los
// crea; aquí solo se validan las entradas contra ella.
export { FIELD_TYPES } from "../services/db";

// Los permisos por página se imponen aquí, en la capa de sesión: la API REST va con
// token de espacio completo y no pasa por estos helpers (documentado en docs/api.md).
type CtxPerms = { db: typeof import("@/lib/db").db; workspace: { id: string }; user: { id: string }; role?: string };

async function assertPage(ctx: CtxPerms, pageId: string, min: Nivel = "view") {
  const p = await ctx.db.page.findFirst({
    where: { id: pageId, workspaceId: ctx.workspace.id },
    select: { id: true },
  });
  if (!p) throw new TRPCError({ code: "NOT_FOUND" });
  await exigeNivel(ctx.db, pageId, ctx.user.id, ctx.role ?? "member", min);
}

async function assertCollection(ctx: CtxPerms, collectionId: string, min: Nivel = "edit") {
  const c = await ctx.db.collection.findFirst({
    where: { id: collectionId, page: { workspaceId: ctx.workspace.id } },
    select: { id: true, pageId: true },
  });
  if (!c) throw new TRPCError({ code: "NOT_FOUND" });
  await exigeNivel(ctx.db, c.pageId, ctx.user.id, ctx.role ?? "member", min);
  return c;
}

/** Nivel mínimo sobre la página dueña de un registro (para las mutaciones por recordId). */
async function exigeRegistro(ctx: CtxPerms, recordId: string, min: Nivel = "edit") {
  const r = await ctx.db.record.findFirst({
    where: { id: recordId, collection: { page: { workspaceId: ctx.workspace.id } } },
    select: { collection: { select: { pageId: true } } },
  });
  if (!r) throw new TRPCError({ code: "NOT_FOUND" });
  await exigeNivel(ctx.db, r.collection.pageId, ctx.user.id, ctx.role ?? "member", min);
}

/** Ídem por viewId. */
async function exigeVista(ctx: CtxPerms, viewId: string, min: Nivel = "edit") {
  const v = await ctx.db.view.findFirst({
    where: { id: viewId, collection: { page: { workspaceId: ctx.workspace.id } } },
    select: { collection: { select: { pageId: true } } },
  });
  if (!v) throw new TRPCError({ code: "NOT_FOUND" });
  await exigeNivel(ctx.db, v.collection.pageId, ctx.user.id, ctx.role ?? "member", min);
}

/** Ídem por fieldId. */
async function exigeCampo(ctx: CtxPerms, fieldId: string, min: Nivel = "edit") {
  const f = await ctx.db.field.findFirst({
    where: { id: fieldId, collection: { page: { workspaceId: ctx.workspace.id } } },
    select: { collection: { select: { pageId: true } } },
  });
  if (!f) throw new TRPCError({ code: "NOT_FOUND" });
  await exigeNivel(ctx.db, f.collection.pageId, ctx.user.id, ctx.role ?? "member", min);
}

/** El ámbito con el que el servicio trabaja, sacado del contexto de tRPC. */
const scopeOf = (ctx: { db: typeof import("@/lib/db").db; workspace: { id: string }; user: { id: string } }) => ({
  db: ctx.db,
  workspaceId: ctx.workspace.id,
  userId: ctx.user.id,
});

/** El servicio lanza intenciones (no encontrado / petición inválida); aquí se traducen. */
async function conTRPC<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof DbError) {
      throw new TRPCError({
        code: e.code === "not_found" ? "NOT_FOUND" : "BAD_REQUEST",
        message: e.message,
      });
    }
    throw e;
  }
}

export const dbRouter = router({
  /** Crea una página de tipo base de datos, con colección, campos, vistas y filas de ejemplo. */
  create: workspaceProcedure
    .input(z.object({ parentId: z.string().nullish(), title: z.string().default("Base de datos") }))
    .mutation(async ({ ctx, input }) => {
      if (input.parentId) await assertPage(ctx, input.parentId, "edit");
      // Nace con 3 filas vacías, como en Notion, para que la tabla no parezca rota.
      const { page } = await conTRPC(
        dbService.createDatabase(scopeOf(ctx), {
          title: input.title,
          parentId: input.parentId ?? null,
          seedRows: 3,
        }),
      );
      return page;
    }),

  /**
   * Crea una BD para embeber en el cuerpo de una página: la Collection cuelga de una
   * página contenedora oculta (embedded=true, excluida del árbol y de la búsqueda).
   */
  createInline: workspaceProcedure.mutation(async ({ ctx }) => {
    const { page, collection } = await conTRPC(
      dbService.createDatabase(scopeOf(ctx), { title: "Base de datos", embedded: true, seedRows: 3 }),
    );
    return { pageId: page.id, collectionId: collection.id };
  }),

  /** Exporta la colección a CSV: cabecera = nombres de campos, una fila por registro. */
  exportCsv: workspaceProcedure
    .input(z.object({ collectionId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId, "view");
      const col = await ctx.db.collection.findUnique({
        where: { id: input.collectionId },
        include: {
          page: { select: { title: true } },
          fields: { orderBy: { order: "asc" } },
          records: { where: { archivedAt: null }, orderBy: { order: "asc" } },
        },
      });
      if (!col) throw new TRPCError({ code: "NOT_FOUND" });
      const people = await peopleOf(ctx.db, ctx.workspace.id, col.fields);
      const rows = [
        col.fields.map((f) => f.name),
        ...col.records.map((r) => {
          const cells = (r.cells ?? {}) as Record<string, unknown>;
          return col.fields.map((f) => cellToText(f, cells[f.id], r, people));
        }),
      ];
      return { name: col.page.title || col.name || "Base de datos", csv: toCsv(rows) };
    }),

  /** Crea una base de datos nueva a partir de un CSV ya parseado (cabeceras + filas de texto). */
  importCsv: workspaceProcedure
    .input(
      z.object({
        parentId: z.string().nullish(),
        name: z.string().min(1),
        headers: z.array(z.string()).min(1),
        rows: z.array(z.array(z.string())),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.parentId) await assertPage(ctx, input.parentId, "edit");
      const last = await ctx.db.page.findFirst({
        where: { workspaceId: ctx.workspace.id, parentId: input.parentId ?? null },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      return ctx.db.$transaction(
        async (tx) => {
          const page = await tx.page.create({
            data: {
              workspaceId: ctx.workspace.id,
              parentId: input.parentId ?? null,
              title: input.name,
              icon: "🗃️",
              type: "database",
              order: rankAtEnd(last?.order ?? null),
              content: [],
            },
          });
          const collection = await tx.collection.create({ data: { pageId: page.id, name: input.name } });
          let fOrd: string | null = null;
          // El tipo de cada columna se infiere de sus valores (casilla, número,
          // fecha, correo, URL, teléfono, selección…); lo que no encaja, texto.
          const cols = infiereColumnas(input.headers, input.rows);
          const fieldIds: string[] = [];
          for (const [i, h] of input.headers.entries()) {
            fOrd = rankAtEnd(fOrd);
            const f = await tx.field.create({
              data: {
                collectionId: collection.id,
                name: h.trim() || `Columna ${i + 1}`,
                type: cols[i].type,
                order: fOrd,
                config: cols[i].config as Prisma.InputJsonValue,
              },
            });
            fieldIds.push(f.id);
          }
          await tx.view.create({ data: { collectionId: collection.id, name: "Tabla", type: "table", config: {}, order: rankAtEnd(null) } });
          let rOrd: string | null = null;
          const records = input.rows.map((row, i) => {
            rOrd = rankAtEnd(rOrd);
            const cells: Record<string, unknown> = {};
            fieldIds.forEach((fid, j) => {
              if (!row[j]) return;
              const v = cols[j].convertir(row[j]);
              if (v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) cells[fid] = v;
            });
            return { collectionId: collection.id, order: rOrd, seq: i + 1, cells: cells as Prisma.InputJsonValue, createdById: ctx.user.id, updatedById: ctx.user.id };
          });
          if (records.length) await tx.record.createMany({ data: records });
          return page;
        },
        { timeout: 60_000 },
      );
    }),

  /**
   * "Mis tareas": filas de cualquier base de datos del espacio en las que un campo
   * de tipo Persona me incluye. Devuelve también el estado y la fecha si la BD los tiene.
   */
  myTasks: workspaceProcedure.query(async ({ ctx }) => {
    const personFields = await ctx.db.field.findMany({
      where: { type: "person", collection: { page: { workspaceId: ctx.workspace.id, archivedAt: null } } },
      select: { id: true, collectionId: true },
    });
    if (!personFields.length) return [];

    const records = await ctx.db.record.findMany({
      where: {
        archivedAt: null,
        OR: personFields.map((f) => ({
          collectionId: f.collectionId,
          cells: { path: [f.id], array_contains: ctx.user.id },
        })),
      },
      include: {
        collection: {
          include: {
            page: { select: { id: true, title: true, icon: true } },
            fields: { orderBy: { order: "asc" } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    // Las tareas de páginas restringidas sin mí tampoco salen aquí.
    const nivel = await mapaDeNiveles(ctx.db, ctx.workspace.id, ctx.user.id, ctx.role ?? "member");
    return records.filter((r) => alcanza(nivel(r.collection.page.id), "view")).map((r) => {
      const fields = r.collection.fields;
      const cells = (r.cells ?? {}) as Record<string, unknown>;
      const first = (type: string) => fields.find((f) => f.type === type);
      const titleField = first("text");
      const statusField = first("status") ?? first("select");
      const dateField = first("date");
      const label = (f: (typeof fields)[number] | undefined) =>
        f ? cellToText(f, cells[f.id], r) : "";
      return {
        recordId: r.id,
        pageId: r.collection.page.id,
        dbTitle: r.collection.page.title || r.collection.name,
        dbIcon: r.collection.page.icon,
        title: titleField ? String(cells[titleField.id] ?? "") : "",
        status: label(statusField),
        date: dateField ? String(cells[dateField.id] ?? "") : "",
        updatedAt: r.updatedAt,
      };
    });
  }),

  /** Devuelve todo lo necesario para renderizar la base de datos de una página. */
  get: workspaceProcedure
    .input(z.object({ pageId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertPage(ctx, input.pageId);
      const collection = await ctx.db.collection.findUnique({
        where: { pageId: input.pageId },
        include: {
          fields: { orderBy: { order: "asc" } },
          views: { orderBy: { order: "asc" } },
          records: { where: { archivedAt: null }, orderBy: { order: "asc" } },
        },
      });
      if (!collection) throw new TRPCError({ code: "NOT_FOUND" });
      return collection;
    }),

  addField: workspaceProcedure
    .input(z.object({
      collectionId: z.string(),
      name: z.string().default("Campo"),
      type: z.enum(FIELD_TYPES),
      beforeFieldId: z.string().optional(),
      afterFieldId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      return conTRPC(dbService.addField(scopeOf(ctx), input));
    }),

  moveField: workspaceProcedure
    .input(z.object({ id: z.string(), beforeId: z.string().optional(), afterId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await exigeCampo(ctx, input.id);
      return conTRPC(dbService.moveField(scopeOf(ctx), input));
    }),

  updateField: workspaceProcedure
    .input(z.object({ id: z.string(), name: z.string().optional(), config: z.any().optional() }))
    .mutation(async ({ ctx, input }) => {
      await exigeCampo(ctx, input.id);
      return conTRPC(dbService.updateField(scopeOf(ctx), input));
    }),

  /**
   * Cambia el tipo de un campo ya creado, convirtiendo lo que se pueda de cada celda.
   * No se permite entrar ni salir de relation/rollup/formula: su valor no vive en la celda.
   */
  setFieldType: workspaceProcedure
    .input(z.object({ id: z.string(), type: z.enum(FIELD_TYPES) }))
    .mutation(async ({ ctx, input }) => {
      await exigeCampo(ctx, input.id);
      return conTRPC(dbService.setFieldType(scopeOf(ctx), input));
    }),

  deleteField: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await exigeCampo(ctx, input.id);
      return conTRPC(dbService.deleteField(scopeOf(ctx), input));
    }),

  duplicateField: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await exigeCampo(ctx, input.id);
      return conTRPC(dbService.duplicateField(scopeOf(ctx), input));
    }),

  addRecord: workspaceProcedure
    .input(z.object({ collectionId: z.string(), cells: z.record(z.string(), z.any()).optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      return conTRPC(dbService.createRecord(scopeOf(ctx), input));
    }),

  /** Crea un sub-elemento: registro hijo del indicado, en la misma colección. */
  addSubRecord: workspaceProcedure
    .input(z.object({ parentRecordId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await exigeRegistro(ctx, input.parentRecordId);
      const parent = await ctx.db.record.findFirst({
        where: { id: input.parentRecordId, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true, collectionId: true },
      });
      if (!parent) throw new TRPCError({ code: "NOT_FOUND" });
      const last = await ctx.db.record.findFirst({
        where: { collectionId: parent.collectionId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const maxSeq = await ctx.db.record.aggregate({
        where: { collectionId: parent.collectionId },
        _max: { seq: true },
      });
      return ctx.db.record.create({
        data: {
          collectionId: parent.collectionId,
          parentId: parent.id,
          order: rankAtEnd(last?.order ?? null),
          seq: (maxSeq._max.seq ?? 0) + 1,
          cells: {},
          createdById: ctx.user.id,
          updatedById: ctx.user.id,
        },
      });
    }),

  updateCell: workspaceProcedure
    .input(z.object({ recordId: z.string(), fieldId: z.string(), value: z.any() }))
    .mutation(async ({ ctx, input }) => {
      await exigeRegistro(ctx, input.recordId);
      const rec = await ctx.db.record.findFirst({
        where: { id: input.recordId, collection: { page: { workspaceId: ctx.workspace.id } } },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      // Merge atómico EN Postgres: antes se leía todo `cells` y se escribía entero,
      // así que dos personas tocando campos DISTINTOS de la misma fila a la vez se
      // pisaban en silencio (ganaba la última). Con `||`/`-` sobre jsonb cada update
      // toca solo su clave. Mismo campo a la vez sigue siendo «gana el último», como
      // en Notion. El @updatedAt de Prisma no aplica en SQL crudo: se pone a mano.
      if (input.value === null || input.value === "") {
        await ctx.db.$executeRaw`UPDATE "Record" SET cells = cells - ${input.fieldId}::text, "updatedById" = ${ctx.user.id}, "updatedAt" = now() WHERE id = ${input.recordId}`;
      } else {
        await ctx.db.$executeRaw`UPDATE "Record" SET cells = cells || ${JSON.stringify({ [input.fieldId]: input.value })}::jsonb, "updatedById" = ${ctx.user.id}, "updatedAt" = now() WHERE id = ${input.recordId}`;
      }
      const updated = await ctx.db.record.findUniqueOrThrow({
        where: { id: input.recordId },
        select: { id: true, cells: true },
      });
      dispatchWebhooks(ctx.workspace.id, "record.updated", {
        recordId: updated.id,
        collectionId: rec.collectionId,
        fieldId: input.fieldId,
        cells: updated.cells,
        updatedById: ctx.user.id,
      });
      // Los campos de lista (persona, relación) llevan trabajo extra tras escribir.
      const antesCelda = (rec.cells as Record<string, unknown>)[input.fieldId];
      if (Array.isArray(input.value) || Array.isArray(antesCelda)) {
        const field = await ctx.db.field.findUnique({
          where: { id: input.fieldId },
          select: { type: true, config: true, collection: { select: { pageId: true, fields: { orderBy: { order: "asc" as const } } } } },
        });
        // Relación con espejo: mantener el otro lado en sincronía.
        const mirrorFieldId = (field?.config as { mirrorFieldId?: string })?.mirrorFieldId;
        if (field?.type === "relation" && mirrorFieldId) {
          await sincronizaEspejo(ctx.db, input.recordId, mirrorFieldId, antesCelda, input.value);
        }
        // Asignar en un campo Persona avisa a quien entra nuevo (nunca a uno mismo).
        if (field?.type === "person" && Array.isArray(input.value) && input.value.length) {
          const antes = (rec.cells as Record<string, unknown>)[input.fieldId];
          const previos = new Set(Array.isArray(antes) ? (antes as string[]) : []);
          const nuevos = (input.value as unknown[]).filter(
            (u): u is string => typeof u === "string" && !previos.has(u) && u !== ctx.user.id,
          );
          if (nuevos.length) {
            const titleField = field.collection.fields.find((f) => f.type === "text");
            const titulo = titleField
              ? cellToText(titleField, (updated.cells as Record<string, unknown>)[titleField.id], rec)
              : "";
            const miembros = await ctx.db.member.findMany({
              where: { workspaceId: ctx.workspace.id, userId: { in: nuevos } },
              select: { userId: true },
            });
            for (const { userId } of miembros) {
              await ctx.db.notification.create({
                data: {
                  userId,
                  workspaceId: ctx.workspace.id,
                  type: "assign",
                  title: titulo || null,
                  pageId: field.collection.pageId,
                  actorId: ctx.user.id,
                },
              });
              sendPush(userId, {
                title: `${ctx.user.name || ctx.user.email} te ha asignado una tarea`,
                body: titulo || "Sin título",
                url: `/p/${field.collection.pageId}`,
              });
            }
          }
        }
      }
      return updated;
    }),

  /** Filas archivadas de una base de datos (papelera de filas). */
  archivedRecords: workspaceProcedure
    .input(z.object({ collectionId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId, "view");
      const col = await ctx.db.collection.findUnique({
        where: { id: input.collectionId },
        select: { fields: { orderBy: { order: "asc" } } },
      });
      const titleField = col?.fields.find((f) => f.type === "text");
      const records = await ctx.db.record.findMany({
        where: { collectionId: input.collectionId, archivedAt: { not: null } },
        orderBy: { archivedAt: "desc" },
        take: 100,
      });
      return records.map((r) => ({
        id: r.id,
        title: (titleField ? cellToText(titleField, (r.cells as Record<string, unknown>)[titleField.id], r) : "") || "Sin título",
        archivedAt: r.archivedAt!,
        isSubtask: r.parentId != null,
      }));
    }),

  /** Borrado definitivo de una fila archivada (y de sus subtareas). */
  purgeRecord: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rec = await ctx.db.record.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } }, archivedAt: { not: null } },
        select: { id: true, collectionId: true },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      await exigeRegistro(ctx, input.id);
      await ctx.db.record.delete({ where: { id: input.id } }); // las subtareas caen por la FK en cascada
      await limpiaReferencias(ctx.db, rec.collectionId, [input.id]);
      return { ok: true };
    }),

  /**
   * Purga perezosa de la papelera de filas: se invoca al abrirla, como la de páginas.
   * Mismo plazo que las páginas (30 días).
   */
  purgeExpiredRecords: workspaceProcedure
    .input(z.object({ collectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Mantenimiento perezoso: solo borra lo ya caducado, puede dispararlo cualquiera que vea la BD.
      await assertCollection(ctx, input.collectionId, "view");
      const cutoff = new Date(Date.now() - RECORD_TRASH_TTL_DAYS * 864e5);
      const caducados = await ctx.db.record.findMany({
        where: { collectionId: input.collectionId, archivedAt: { lt: cutoff } },
        select: { id: true },
      });
      const r = await ctx.db.record.deleteMany({
        where: { collectionId: input.collectionId, archivedAt: { lt: cutoff } },
      });
      await limpiaReferencias(ctx.db, input.collectionId, caducados.map((c) => c.id));
      return { purged: r.count };
    }),

  /** Reordena una fila entre sus hermanas (arrastrar y soltar en la Tabla). */
  moveRecord: workspaceProcedure
    .input(z.object({ id: z.string(), beforeId: z.string().optional(), afterId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const rec = await ctx.db.record.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true, collectionId: true, parentId: true },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      await exigeRegistro(ctx, input.id);

      // Solo se reordena entre hermanas: soltar sobre una fila de otro nivel no cambia el padre.
      const siblings = await ctx.db.record.findMany({
        where: { collectionId: rec.collectionId, parentId: rec.parentId, id: { not: rec.id }, archivedAt: null },
        select: { id: true, order: true },
        orderBy: { order: "asc" },
      });
      const anchorId = input.beforeId ?? input.afterId;
      const at = anchorId ? siblings.findIndex((s) => s.id === anchorId) : -1;
      let a: string | null = siblings.at(-1)?.order ?? null; // por defecto, al final
      let b: string | null = null;
      if (at !== -1) {
        if (input.beforeId) {
          a = siblings[at - 1]?.order ?? null;
          b = siblings[at].order;
        } else {
          a = siblings[at].order;
          b = siblings[at + 1]?.order ?? null;
        }
      }
      await ctx.db.record.update({ where: { id: rec.id }, data: { order: rankBetween(a, b) } });
      return { ok: true };
    }),

  /**
   * Guarda las celdas de una fila como plantilla de la base de datos.
   * Para crear una fila desde una plantilla basta con `addRecord({ cells })`.
   */
  saveTemplate: workspaceProcedure
    .input(z.object({ recordId: z.string(), name: z.string().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      const rec = await ctx.db.record.findFirst({
        where: { id: input.recordId, collection: { page: { workspaceId: ctx.workspace.id } } },
        include: { collection: { select: { id: true, templates: true } } },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      await exigeRegistro(ctx, input.recordId);
      const templates = Array.isArray(rec.collection.templates) ? rec.collection.templates : [];
      const template = {
        id: "tpl_" + Math.random().toString(36).slice(2, 9),
        name: input.name,
        cells: (rec.cells ?? {}) as Record<string, unknown>,
      };
      await ctx.db.collection.update({
        where: { id: rec.collection.id },
        data: { templates: [...templates, template] as Prisma.InputJsonValue },
      });
      return template;
    }),

  /** Marca (o desmarca) la plantilla que usa «+ Nueva fila». */
  setDefaultTemplate: workspaceProcedure
    .input(z.object({ collectionId: z.string(), templateId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const col = await ctx.db.collection.findUnique({
        where: { id: input.collectionId },
        select: { templates: true },
      });
      const templates = (Array.isArray(col?.templates) ? col.templates : []) as { id: string }[];
      await ctx.db.collection.update({
        where: { id: input.collectionId },
        data: {
          templates: templates.map((t) => ({ ...t, porDefecto: t.id === input.templateId })) as Prisma.InputJsonValue,
        },
      });
      return { ok: true };
    }),

  deleteTemplate: workspaceProcedure
    .input(z.object({ collectionId: z.string(), templateId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const col = await ctx.db.collection.findUnique({
        where: { id: input.collectionId },
        select: { templates: true },
      });
      const templates = (Array.isArray(col?.templates) ? col.templates : []) as { id: string }[];
      await ctx.db.collection.update({
        where: { id: input.collectionId },
        data: { templates: templates.filter((t) => t.id !== input.templateId) as Prisma.InputJsonValue },
      });
      return { ok: true };
    }),

  /** Duplica una fila justo debajo, con sus subtareas. */
  duplicateRecord: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await exigeRegistro(ctx, input.id);
      const src = await ctx.db.record.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
      });
      if (!src) throw new TRPCError({ code: "NOT_FOUND" });

      // Se coloca entre el original y el siguiente hermano, para que caiga justo debajo.
      const next = await ctx.db.record.findFirst({
        where: { collectionId: src.collectionId, parentId: src.parentId, order: { gt: src.order } },
        orderBy: { order: "asc" },
        select: { order: true },
      });
      const maxSeq = await ctx.db.record.aggregate({
        where: { collectionId: src.collectionId },
        _max: { seq: true },
      });
      let seq = (maxSeq._max.seq ?? 0) + 1;

      const copyTree = async (rec: typeof src, parentId: string | null, order: string): Promise<string> => {
        const copy = await ctx.db.record.create({
          data: {
            collectionId: rec.collectionId,
            parentId,
            order,
            seq: seq++,
            cells: (rec.cells ?? {}) as Prisma.InputJsonValue,
            content: (rec.content ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            createdById: ctx.user.id,
            updatedById: ctx.user.id,
          },
          select: { id: true },
        });
        const children = await ctx.db.record.findMany({
          where: { parentId: rec.id, archivedAt: null },
          orderBy: { order: "asc" },
        });
        let childOrder: string | null = null;
        for (const child of children) {
          childOrder = rankAtEnd(childOrder);
          await copyTree(child, copy.id, childOrder);
        }
        return copy.id;
      };

      const id = await copyTree(src, src.parentId, rankBetween(src.order, next?.order ?? null));
      return { id };
    }),

  /**
   * Borrar una fila la archiva en vez de destruirla: desaparece de vistas, cálculos,
   * exportaciones y API, pero se puede deshacer con restoreRecord.
   */
  deleteRecord: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rec = await ctx.db.record.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      await exigeRegistro(ctx, input.id);
      const now = new Date();
      // Las subtareas se van con su padre, como al borrar una página con hijas.
      await ctx.db.record.updateMany({ where: { parentId: input.id }, data: { archivedAt: now } });
      await ctx.db.record.update({ where: { id: input.id }, data: { archivedAt: now } });
      dispatchWebhooks(ctx.workspace.id, "record.deleted", { recordId: input.id });
      return { ok: true };
    }),

  /** Deshacer el borrado de una fila (y de las subtareas que se archivaron con ella). */
  restoreRecord: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rec = await ctx.db.record.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true, archivedAt: true },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      await exigeRegistro(ctx, input.id);
      if (rec.archivedAt) {
        await ctx.db.record.updateMany({
          where: { parentId: input.id, archivedAt: rec.archivedAt },
          data: { archivedAt: null },
        });
      }
      await ctx.db.record.update({ where: { id: input.id }, data: { archivedAt: null } });
      return { ok: true };
    }),

  /** Cuerpo de bloques de una fila (cada fila es una página, como en Notion). */
  updateRecordContent: workspaceProcedure
    .input(z.object({ id: z.string(), content: z.any() }))
    .mutation(async ({ ctx, input }) => {
      const rec = await ctx.db.record.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      await exigeRegistro(ctx, input.id);
      return ctx.db.record.update({
        where: { id: input.id },
        data: { content: input.content as Prisma.InputJsonValue, updatedById: ctx.user.id },
        select: { id: true },
      });
    }),

  updateView: workspaceProcedure
    .input(z.object({ id: z.string(), config: z.any() }))
    .mutation(async ({ ctx, input }) => {
      const v = await ctx.db.view.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true },
      });
      if (!v) throw new TRPCError({ code: "NOT_FOUND" });
      await exigeVista(ctx, input.id);
      return ctx.db.view.update({ where: { id: input.id }, data: { config: input.config } });
    }),

  /** Crear una vista nueva en la colección. */
  addView: workspaceProcedure
    .input(z.object({ collectionId: z.string(), type: z.enum(VIEW_TYPES), name: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      return conTRPC(dbService.addView(scopeOf(ctx), input));
    }),

  /** Renombrar una vista. */
  renameView: workspaceProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      await exigeVista(ctx, input.id);
      return conTRPC(dbService.renameView(scopeOf(ctx), input));
    }),

  /** Borrar una vista (no la última). */
  /** Duplica una vista con todos sus ajustes (filtros, orden, columnas, colores…). */
  duplicateView: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const v = await ctx.db.view.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
      });
      if (!v) throw new TRPCError({ code: "NOT_FOUND" });
      await exigeVista(ctx, input.id);
      // La copia cae justo a la derecha de la original.
      const next = await ctx.db.view.findFirst({
        where: { collectionId: v.collectionId, order: { gt: v.order } },
        orderBy: { order: "asc" },
        select: { order: true },
      });
      return ctx.db.view.create({
        data: {
          collectionId: v.collectionId,
          name: `${v.name} (copia)`,
          type: v.type,
          config: (v.config ?? {}) as Prisma.InputJsonValue,
          order: rankBetween(v.order, next?.order ?? null),
        },
        select: { id: true },
      });
    }),

  /** Reordena una pestaña de vista (la primera es la vista por defecto). */
  moveView: workspaceProcedure
    .input(z.object({ id: z.string(), beforeId: z.string().optional(), afterId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await exigeVista(ctx, input.id);
      return conTRPC(dbService.moveView(scopeOf(ctx), input));
    }),

  deleteView: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await exigeVista(ctx, input.id);
      return conTRPC(dbService.deleteView(scopeOf(ctx), input));
    }),

  /** Publica la vista de formulario en /f/<token> (cualquiera con el enlace envía filas sin cuenta). */
  publishForm: workspaceProcedure
    .input(z.object({ viewId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await exigeVista(ctx, input.viewId);
      return conTRPC(dbService.publishForm(scopeOf(ctx), input));
    }),

  unpublishForm: workspaceProcedure
    .input(z.object({ viewId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await exigeVista(ctx, input.viewId);
      return conTRPC(dbService.unpublishForm(scopeOf(ctx), input));
    }),

  /** Cambiar el tipo de una vista ("Mostrar como"), recalculando su config por defecto. */
  setViewType: workspaceProcedure
    .input(z.object({ id: z.string(), type: z.enum(VIEW_TYPES) }))
    .mutation(async ({ ctx, input }) => {
      const v = await ctx.db.view.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true, collectionId: true, config: true },
      });
      if (!v) throw new TRPCError({ code: "NOT_FOUND" });
      await exigeVista(ctx, input.id);
      const fields = await ctx.db.field.findMany({
        where: { collectionId: v.collectionId },
        orderBy: { order: "asc" },
      });
      const firstOf = (t: string) => fields.find((f) => f.type === t)?.id ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prev = (v.config as any) ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let config: any = { filters: prev.filters, sorts: prev.sorts };
      if (input.type === "kanban") config.groupByFieldId = prev.groupByFieldId ?? firstOf("select") ?? firstOf("status") ?? firstOf("person");
      else if (input.type === "calendar" || input.type === "timeline") config.dateFieldId = prev.dateFieldId ?? firstOf("date");
      else if (input.type === "chart")
        config = { ...config, chartType: prev.chartType ?? "bar", xFieldId: prev.xFieldId ?? firstOf("select"), yFieldId: prev.yFieldId ?? null, agg: prev.agg ?? "count" };
      return ctx.db.view.update({ where: { id: input.id }, data: { type: input.type, config } });
    }),

  /** Lista todas las bases de datos del workspace (para elegir destino de una relación). */
  listDatabases: workspaceProcedure.query(async ({ ctx }) => {
    const cols = await ctx.db.collection.findMany({
      where: { page: { workspaceId: ctx.workspace.id, type: "database", archivedAt: null, embedded: false } },
      select: {
        id: true,
        page: { select: { id: true, title: true, icon: true } },
        fields: { orderBy: { order: "asc" }, select: { id: true, name: true, type: true } },
      },
    });
    const nivel = await mapaDeNiveles(ctx.db, ctx.workspace.id, ctx.user.id, ctx.role ?? "member");
    return cols
      .filter((c) => alcanza(nivel(c.page.id), "view"))
      .map((c) => ({
        collectionId: c.id,
        pageId: c.page.id,
        title: c.page.title,
        icon: c.page.icon,
        fields: c.fields,
      }));
  }),

  /** Registros de una colección como opciones {id,title} para el selector de relación. */
  relationOptions: workspaceProcedure
    .input(z.object({ collectionId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId, "view");
      const col = await ctx.db.collection.findUnique({
        where: { id: input.collectionId },
        include: { fields: { orderBy: { order: "asc" } }, records: { where: { archivedAt: null }, orderBy: { order: "asc" } } },
      });
      if (!col) throw new TRPCError({ code: "NOT_FOUND" });
      const titleField = col.fields.find((f) => f.type === "text") ?? col.fields[0];
      return col.records.map((r) => {
        const cells = (r.cells ?? {}) as Record<string, unknown>;
        const t = titleField ? cells[titleField.id] : "";
        return { id: r.id, title: (typeof t === "string" && t) || "Sin título" };
      });
    }),

  /** Crea un campo de relación que apunta a otra base de datos. */
  addRelation: workspaceProcedure
    .input(
      z.object({
        collectionId: z.string(),
        name: z.string().default("Relación"),
        targetCollectionId: z.string(),
        // Bidireccional: crea también el campo espejo en la BD destino, emparejados
        // por config.mirrorFieldId; updateCell mantiene los dos lados en sincronía.
        mirror: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const target = await assertCollection(ctx, input.targetCollectionId, input.mirror ? "edit" : "view");
      const paginas = await ctx.db.collection.findMany({
        where: { id: { in: [input.collectionId, input.targetCollectionId] } },
        select: { id: true, pageId: true, page: { select: { title: true } } },
      });
      const origen = paginas.find((p) => p.id === input.collectionId);
      const destino = paginas.find((p) => p.id === input.targetCollectionId);
      const last = await ctx.db.field.findFirst({
        where: { collectionId: input.collectionId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const campo = await ctx.db.field.create({
        data: {
          collectionId: input.collectionId,
          name: input.name,
          type: "relation",
          order: rankAtEnd(last?.order ?? null),
          config: { targetCollectionId: target.id, targetPageId: destino?.pageId ?? null },
        },
      });
      if (input.mirror) {
        const lastT = await ctx.db.field.findFirst({
          where: { collectionId: input.targetCollectionId },
          orderBy: { order: "desc" },
          select: { order: true },
        });
        const espejo = await ctx.db.field.create({
          data: {
            collectionId: input.targetCollectionId,
            name: `↔ ${origen?.page.title || "BD"}`,
            type: "relation",
            order: rankAtEnd(lastT?.order ?? null),
            config: { targetCollectionId: input.collectionId, targetPageId: origen?.pageId ?? null, mirrorFieldId: campo.id },
          },
        });
        await ctx.db.field.update({
          where: { id: campo.id },
          data: { config: { ...(campo.config as object), mirrorFieldId: espejo.id } },
        });
      }
      return campo;
    }),

  /** Crea un campo rollup que agrega valores de los registros relacionados. */
  addRollup: workspaceProcedure
    .input(
      z.object({
        collectionId: z.string(),
        name: z.string().default("Rollup"),
        relationFieldId: z.string(),
        targetFieldId: z.string().nullish(),
        agg: z.enum(ROLLUP_AGGS).default("count"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const last = await ctx.db.field.findFirst({
        where: { collectionId: input.collectionId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      return ctx.db.field.create({
        data: {
          collectionId: input.collectionId,
          name: input.name,
          type: "rollup",
          order: rankAtEnd(last?.order ?? null),
          config: {
            relationFieldId: input.relationFieldId,
            targetFieldId: input.targetFieldId ?? null,
            agg: input.agg,
          },
        },
      });
    }),

  /** Crea un campo de fórmula (expresión calculada estilo Notion). */
  addFormula: workspaceProcedure
    .input(z.object({ collectionId: z.string(), name: z.string().default("Fórmula"), expression: z.string().default("") }))
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const last = await ctx.db.field.findFirst({
        where: { collectionId: input.collectionId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      return ctx.db.field.create({
        data: {
          collectionId: input.collectionId,
          name: input.name,
          type: "formula",
          order: rankAtEnd(last?.order ?? null),
          config: { expression: input.expression },
        },
      });
    }),

  /** Resuelve etiquetas de relaciones, valores de rollups y fórmulas (se calcula en el servidor). */
  computed: workspaceProcedure
    .input(z.object({ pageId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertPage(ctx, input.pageId);
      const col = await ctx.db.collection.findUnique({
        where: { pageId: input.pageId },
        include: { fields: true, records: { where: { archivedAt: null }, orderBy: { order: "asc" } } },
      });
      if (!col) throw new TRPCError({ code: "NOT_FOUND" });
      // La lógica vive en la capa de servicio: la comparten la gráfica y la API.
      return calculaComputados(ctx.db, ctx.workspace.id, col);
    }),


  /**
   * Datos agregados para una vista de gráfica (se calcula en el servidor).
   * Como en Notion, la gráfica ES una vista: primero se aplican SUS filtros con el
   * mismo motor que la tabla, y solo después se agrupa y agrega.
   */
  chartData: workspaceProcedure
    .input(z.object({ pageId: z.string(), viewId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertPage(ctx, input.pageId);
      const col = await ctx.db.collection.findUnique({
        where: { pageId: input.pageId },
        include: { fields: true, records: { where: { archivedAt: null } }, views: true },
      });
      if (!col) throw new TRPCError({ code: "NOT_FOUND" });
      const view = col.views.find((v) => v.id === input.viewId);
      const cfg = (view?.config ?? {}) as {
        chartType?: string;
        xFieldId?: string;
        yFieldId?: string | null;
        agg?: string;
        dateBucket?: string;
        omitZero?: boolean;
        breakdownFieldId?: string | null;
      };
      const fields = col.fields.map((f) => ({ id: f.id, name: f.name, type: f.type, config: f.config })) as DbField[];
      const all: DbRecord[] = col.records.map((r) => ({
        id: r.id,
        cells: (r.cells ?? {}) as Record<string, unknown>,
        order: r.order ?? "",
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        createdById: r.createdById,
        updatedById: r.updatedById,
      }));
      // Si la vista toca una fórmula o un rollup (filtro, orden o cualquiera de sus
      // ejes), se calculan antes y se funden en las celdas: mismo motor, mismo
      // resultado que la tabla.
      const vcfg = (view?.config ?? {}) as { filters?: FilterNode[]; sorts?: { fieldId: string }[] };
      const usados = [
        ...filterFieldIds(Array.isArray(vcfg.filters) ? vcfg.filters : []),
        ...(Array.isArray(vcfg.sorts) ? vcfg.sorts.map((s) => s.fieldId) : []),
        ...[cfg.xFieldId, cfg.yFieldId, cfg.breakdownFieldId].filter((x): x is string => !!x),
      ];
      const base = necesitaComputados(col.fields, usados)
        ? conComputados(all, (await calculaComputados(ctx.db, ctx.workspace.id, col)).rollups)
        : all;
      // Filtrar ANTES de agregar; ctx.user resuelve el valor especial "Yo" (me).
      const records = applyViewConfig(base, fields, view?.config ?? {}, ctx.user.id);
      const byId = new Map(col.records.map((r) => [r.id, r]));

      const xField = fields.find((f) => f.id === cfg.xFieldId);
      const yField = cfg.yFieldId ? fields.find((f) => f.id === cfg.yFieldId) : null;
      const agg = cfg.agg ?? "count";
      const people = await peopleOf(ctx.db, ctx.workspace.id, col.fields);

      const DATE_TYPES = ["date", "created_time", "last_edited_time"];
      const bucket = cfg.dateBucket ?? "month";
      const pad2 = (x: number) => String(x).padStart(2, "0");
      const localDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      /** "YYYY-MM-DD" del valor (celda de fecha o Date de los meta-campos). */
      const dayFrom = (val: unknown): string | null => {
        if (val instanceof Date) return localDay(val);
        const d = dayOf(val);
        return d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null;
      };
      /** Cubo del eje X para fechas: día, semana (lunes), mes, trimestre o año. */
      const dateLabel = (dayStr: string): string => {
        const [y, m, d] = dayStr.split("-").map(Number);
        switch (bucket) {
          case "day":
            return dayStr;
          case "week": {
            const dt = new Date(y, m - 1, d);
            dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); // lunes de esa semana
            return localDay(dt);
          }
          case "quarter":
            return `${y} T${Math.floor((m - 1) / 3) + 1}`;
          case "year":
            return String(y);
          default:
            return dayStr.slice(0, 7); // mes
        }
      };

      /** Etiqueta del eje X de un registro según el tipo del campo. */
      const xLabel = (field: DbField | undefined, rec: DbRecord): string => {
        if (!field) return "Sin valor";
        const val = cellValue(rec, field);
        if (DATE_TYPES.includes(field.type)) {
          const d = dayFrom(val);
          return d ? dateLabel(d) : "Sin valor";
        }
        if (field.type === "checkbox") return val ? "Sí" : "No";
        const raw = byId.get(rec.id);
        const text = raw ? cellToText(field, val, raw, people) : String(val ?? "");
        return text === "" ? "Sin valor" : text;
      };

      // Desglose (2ª dimensión): barras apiladas por el valor de otro campo.
      const bdField = cfg.breakdownFieldId ? fields.find((f) => f.id === cfg.breakdownFieldId) : undefined;
      const groups = new Map<string, (number | null)[]>();
      const bdGroups = new Map<string, Map<string, (number | null)[]>>();
      const bdNames = new Set<string>();
      for (const rec of records) {
        const label = xLabel(xField, rec);
        // Sin campo Y, cada fila cuenta 1; las celdas vacías no cuentan para media/mín/máx.
        let y: number | null = null;
        if (yField) {
          const num = Number(cellValue(rec, yField));
          y = Number.isFinite(num) ? num : null;
        }
        const arr = groups.get(label) ?? [];
        arr.push(y);
        groups.set(label, arr);
        if (bdField) {
          const bd = xLabel(bdField, rec);
          bdNames.add(bd);
          const m = bdGroups.get(label) ?? new Map<string, (number | null)[]>();
          const barr = m.get(bd) ?? [];
          barr.push(y);
          m.set(bd, barr);
          bdGroups.set(label, m);
        }
      }

      const round2 = (x: number) => Math.round(x * 100) / 100;
      const aggOf = (arr: (number | null)[]): number => {
        if (agg === "count") return arr.length;
        const nums = arr.filter((x): x is number => x !== null);
        if (!nums.length) return 0;
        if (agg === "min") return Math.min(...nums);
        if (agg === "max") return Math.max(...nums);
        if (agg === "median") {
          const sorted = [...nums].sort((a, b) => a - b);
          const mid = sorted.length >> 1;
          return round2(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
        }
        const sum = nums.reduce((a, b) => a + b, 0);
        if (agg === "avg") return round2(sum / nums.length);
        return round2(sum); // sum
      };

      // "Sin valor" siempre al final, como en Notion.
      const sinValorAlFinal = (a: string, b: string) =>
        a === "Sin valor" ? 1 : b === "Sin valor" ? -1 : a.localeCompare(b);
      let categories = [...groups.keys()].sort(sinValorAlFinal);
      let values = categories.map((c) => aggOf(groups.get(c)!));
      if (cfg.omitZero) {
        const keep = values.map((v) => v !== 0);
        categories = categories.filter((_, i) => keep[i]);
        values = values.filter((_, i) => keep[i]);
      }
      const series = bdField
        ? [...bdNames].sort(sinValorAlFinal).map((name) => ({
            name,
            values: categories.map((c) => aggOf(bdGroups.get(c)?.get(name) ?? [])),
          }))
        : undefined;
      // Para la gráfica de tipo "número" (KPI): la agregación sobre todos los filtrados.
      const total = aggOf([...groups.values()].flat());

      return {
        chartType: cfg.chartType ?? "bar",
        categories,
        values,
        series,
        total,
        xName: xField?.name ?? "",
        yName: agg === "count" ? "Registros" : yField?.name ?? "",
      };
    }),
});
